import {createHash, randomUUID} from 'crypto';
import {and, eq} from 'drizzle-orm';
import {z} from 'zod';
import {db} from '@/db';
import {ticketActivities, ticketResolutionAttachments, tickets} from '@/db/schema';
import {ApiError, currentUser, errorResponse, requireTicketAccess, requireWorkspace, sameOrigin} from '@/lib/auth';
import {getResolutionWorkspace, requireResolutionAccess} from '@/lib/tickets';

export const dynamic = 'force-dynamic';
type Ctx = {params: Promise<{id: string}>};
const MAX_FILE_SIZE = 15 * 1024 * 1024;
const ALLOWED = /^(audio\/|image\/|application\/(pdf|msword|vnd\.openxmlformats-officedocument|vnd\.ms-excel|vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet)|text\/(plain|csv))/i;
const idOf = async (ctx: Ctx) => z.coerce.number().int().positive().parse((await ctx.params).id);

export async function POST(req: Request, ctx: Ctx) {
  try {
    sameOrigin(req);
    const ticketId = await idOf(ctx);
    const user = await requireWorkspace();
    const [ticket] = await db.select().from(tickets).where(eq(tickets.id, ticketId));
    if (!ticket) throw new ApiError('Ticket not found', 404);
    requireTicketAccess(user, ticket);
    const form = await req.formData();
    const files = form.getAll('files').filter((item): item is File => item instanceof File);
    if (!files.length) throw new ApiError('Choose at least one document or recording.');
    if (files.length > 8) throw new ApiError('Upload up to 8 files at a time.');
    const rows = await Promise.all(files.map(async (file) => {
      if (!file.size || file.size > MAX_FILE_SIZE) throw new ApiError(`${file.name} must be smaller than 15 MB.`);
      const fileType = file.type || 'application/octet-stream';
      if (!ALLOWED.test(fileType)) throw new ApiError(`${file.name} is not a supported document, image or audio file.`);
      const data = Buffer.from(await file.arrayBuffer());
      return {id: randomUUID(), ticketId, fileName: file.name.slice(0, 240), fileType, fileSize: data.byteLength, data, checksum: createHash('sha256').update(data).digest('hex'), uploadedByUserId: user.id, uploadedByName: user.name};
    }));
    await db.transaction(async (tx) => {
      await tx.insert(ticketResolutionAttachments).values(rows);
      await tx.insert(ticketActivities).values({ticketId, actorName: user.name, action: 'resolution.attachment', detail: `${rows.length} supporting file${rows.length === 1 ? '' : 's'} uploaded`});
    });
    return Response.json(await getResolutionWorkspace(ticketId));
  } catch (e) { return errorResponse(e); }
}

export async function GET(req: Request, ctx: Ctx) {
  try {
    const ticketId = await idOf(ctx);
    const user = await currentUser();
    const [ticket] = await db.select().from(tickets).where(eq(tickets.id, ticketId));
    if (!ticket) throw new ApiError('Ticket not found', 404);
    if (!user) throw new ApiError('Sign in to download this file.', 401);
    requireTicketAccess(user, ticket);
    const attachmentId = z.string().uuid().parse(new URL(req.url).searchParams.get('attachmentId'));
    const [row] = await db.select().from(ticketResolutionAttachments).where(and(eq(ticketResolutionAttachments.id, attachmentId), eq(ticketResolutionAttachments.ticketId, ticketId)));
    if (!row) throw new ApiError('Attachment not found', 404);
    return new Response(new Uint8Array(row.data), {headers: {'Content-Type': row.fileType, 'Content-Length': String(row.fileSize), 'Content-Disposition': `inline; filename="${row.fileName.replace(/["\r\n]/g, '_')}"`, 'Cache-Control': 'private, no-store'}});
  } catch (e) { return errorResponse(e); }
}

export async function DELETE(req: Request, ctx: Ctx) {
  try {
    sameOrigin(req);
    const ticketId = await idOf(ctx);
    const {user} = await requireResolutionAccess(ticketId);
    const attachmentId = z.string().uuid().parse(new URL(req.url).searchParams.get('attachmentId'));
    const [row] = await db.select().from(ticketResolutionAttachments).where(and(eq(ticketResolutionAttachments.id, attachmentId), eq(ticketResolutionAttachments.ticketId, ticketId)));
    if (!row) throw new ApiError('Attachment not found', 404);
    if (row.uploadedByUserId !== user.id && user.role !== 'admin') throw new ApiError('Only the person who uploaded this file can remove it.', 403);
    await db.delete(ticketResolutionAttachments).where(eq(ticketResolutionAttachments.id, attachmentId));
    return Response.json(await getResolutionWorkspace(ticketId));
  } catch (e) { return errorResponse(e); }
}
