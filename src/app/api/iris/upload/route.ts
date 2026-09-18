/**
 * PHASE 4: File Upload API
 * Handle file uploads and store metadata in database
 * Files are stored locally or via external service (Vercel Blob, AWS S3, etc.)
 */

import { db } from "@/db";
import { sameOrigin, requireWorkspace, errorResponse } from "@/lib/auth";
import { chatAttachments } from "@/db/schema";
import { NextRequest, NextResponse } from "next/server";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
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

/**
 * POST /api/iris/upload
 * Upload file(s) and attach to chat session
 *
 * Body: FormData with:
 *   - sessionId: string
 *   - file: File | File[] (multipart)
 *
 * Returns: { attachments: Array<{ id, fileName, fileSize, storageUrl }>, error? }
 */
export async function POST(request: NextRequest) {
  try {
    sameOrigin(request);
    await requireWorkspace();
    const formData = await request.formData();
    const sessionId = formData.get("sessionId") as string;
    const files = formData.getAll("file") as File[];

    if (!sessionId || !files.length) {
      return NextResponse.json(
        { error: "sessionId and files required" },
        { status: 400 }
      );
    }

    const attachments = [];

    for (const file of files) {
      // Validate file
      if (!ALLOWED_TYPES.includes(file.type)) {
        return NextResponse.json(
          { error: `File type not allowed: ${file.type}` },
          { status: 400 }
        );
      }

      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: `File too large: ${file.name}` },
          { status: 400 }
        );
      }

      // Generate unique filename
      const ext = file.name.split(".").pop() || "";
      const filename = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${ext}`;

      // TODO: Store file (Vercel Blob, S3, local fs, etc.)
      // For now, generate placeholder URL
      const storageUrl = `/uploads/${filename}`;

      // Store metadata in DB
      const attachmentId = `att_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await db.insert(chatAttachments).values({
        id: attachmentId,
        sessionId,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        storageUrl,
        uploadedBy: "user",
      });

      attachments.push({
        id: attachmentId,
        fileName: file.name,
        fileSize: file.size,
        storageUrl,
      });
    }

    return NextResponse.json({ attachments });
  } catch (error) {
    return errorResponse(error);
  }
}
