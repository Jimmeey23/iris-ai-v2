/**
 * Attachments on an Iris conversation.
 *
 * This route used to validate a file, invent a `/uploads/...` URL for it, write that URL to
 * the database and return success — while dropping the bytes. Every attachment ever
 * "uploaded" was a dead link, and the caller was told otherwise.
 *
 * There is no object store configured for this deployment, so the bytes are stored in
 * Postgres and served back by GET. That is a real limit at scale and the wrong home for
 * gigabytes of images; it is the right home for a few megabytes of photos of a broken
 * pedal, and it has the advantage of being true.
 */

import {and, eq} from "drizzle-orm";
import {createHash, randomUUID} from "crypto";
import {db} from "@/db";
import {sameOrigin, intakeActor, browserKey, errorResponse, ApiError} from "@/lib/auth";
import {enforceRateLimit} from "@/lib/rate-limit";
import {chatAttachments, chatSessions} from "@/db/schema";
import {NextRequest, NextResponse} from "next/server";

export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILES_PER_REQUEST = 5;
const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
];

/** Served back with the stored content type, so a text file cannot be talked into
 *  executing. Anything not on the allow-list is downloaded rather than rendered. */
const INLINE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

/** The conversation must be one this browser owns. Without this check any caller could
 *  attach a file to somebody else's conversation by guessing a session id. */
async function assertOwnsSession(sessionId: string) {
  const owner = await browserKey();
  const [session] = await db
    .select({id: chatSessions.id})
    .from(chatSessions)
    .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.ownerKey, owner)))
    .limit(1);
  if (!session) throw new ApiError("Conversation not found. Start a new conversation.", 404);
}

/**
 * POST /api/iris/upload
 * Body: FormData with `sessionId` and one or more `file` entries.
 */
export async function POST(request: NextRequest) {
  try {
    sameOrigin(request);
    await intakeActor();
    await enforceRateLimit("upload");
    const formData = await request.formData();
    const sessionId = String(formData.get("sessionId") || "");
    const files = formData.getAll("file").filter((f): f is File => f instanceof File);

    if (!sessionId || !files.length) throw new ApiError("sessionId and files required");
    if (files.length > MAX_FILES_PER_REQUEST) throw new ApiError(`Attach at most ${MAX_FILES_PER_REQUEST} files at a time.`);
    await assertOwnsSession(sessionId);

    // Validate everything before writing anything: a rejected fourth file should not leave
    // three already attached.
    for (const file of files) {
      if (!ALLOWED_TYPES.includes(file.type)) throw new ApiError(`File type not allowed: ${file.type || "unknown"}`);
      if (file.size > MAX_FILE_SIZE) throw new ApiError(`${file.name} is larger than 10 MB.`);
      if (file.size === 0) throw new ApiError(`${file.name} is empty.`);
    }

    const attachments = [];
    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      // The browser's declared size is not evidence; the bytes are.
      if (buffer.byteLength > MAX_FILE_SIZE) throw new ApiError(`${file.name} is larger than 10 MB.`);
      const id = `att_${randomUUID()}`;
      const checksum = createHash("sha256").update(buffer).digest("hex");
      await db.insert(chatAttachments).values({
        id,
        sessionId,
        fileName: file.name,
        fileType: file.type,
        fileSize: buffer.byteLength,
        storageUrl: `/api/iris/upload?id=${id}`,
        data: buffer,
        checksum,
        uploadedBy: "user",
      });
      attachments.push({id, fileName: file.name, fileSize: buffer.byteLength, fileType: file.type, storageUrl: `/api/iris/upload?id=${id}`});
    }

    return NextResponse.json({attachments});
  } catch (error) {
    return errorResponse(error);
  }
}

/** GET /api/iris/upload?id=... — the stored file, for whoever owns its conversation. */
export async function GET(request: NextRequest) {
  try {
    await intakeActor();
    const id = request.nextUrl.searchParams.get("id");
    if (!id) throw new ApiError("Attachment id required");
    const [row] = await db.select().from(chatAttachments).where(eq(chatAttachments.id, id)).limit(1);
    if (!row?.data) throw new ApiError("Attachment not found", 404);
    await assertOwnsSession(row.sessionId);
    const body = Buffer.from(row.data);
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": row.fileType,
        "Content-Length": String(body.byteLength),
        "Content-Disposition": `${INLINE_TYPES.has(row.fileType) ? "inline" : "attachment"}; filename="${row.fileName.replaceAll('"', "")}"`,
        // Attachments are conversation-scoped; a shared cache must not hold one.
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
