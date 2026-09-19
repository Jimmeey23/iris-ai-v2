/**
 * Chat History Retention API
 * Scoped to individual users via browserKey / user auth with 7-day retention.
 */

import { db } from "@/db";
import { chatSessions, chatMessages } from "@/db/schema";
import { sql, gt, or, and, eq, desc, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { browserKey, intakeActor, ApiError, errorResponse } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/iris/history
 * Retrieve 7-day chat history for the current individual user
 */
export async function GET(request: NextRequest) {
  try {
    await intakeActor();
    const owner = await browserKey();
    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
    const offset = parseInt(searchParams.get("offset") || "0");
    const sessionId = searchParams.get("sessionId");

    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // If retrieving specific session, return full conversation
    if (sessionId) {
      const [session] = await db
        .select()
        .from(chatSessions)
        .where(
          and(
            eq(chatSessions.id, sessionId),
            eq(chatSessions.ownerKey, owner),
            or(isNull(chatSessions.expiresAt), gt(chatSessions.expiresAt, now))
          )
        );

      if (!session) {
        return NextResponse.json({ error: "Conversation not found or expired" }, { status: 404 });
      }

      // Get messages for this session
      const messages = await db
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.sessionId, sessionId))
        .orderBy(chatMessages.createdAt);

      return NextResponse.json({
        session,
        messages: messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          attachmentIds: m.attachmentIds || [],
          meta: m.meta,
          createdAt: m.createdAt,
        })),
        messageCount: messages.length,
      });
    }

    // List individual sessions for current user within 1 week
    const sessions = await db
      .select()
      .from(chatSessions)
      .where(
        and(
          eq(chatSessions.ownerKey, owner),
          or(isNull(chatSessions.expiresAt), gt(chatSessions.expiresAt, now)),
          gt(chatSessions.createdAt, oneWeekAgo)
        )
      )
      .orderBy(desc(chatSessions.updatedAt))
      .limit(limit)
      .offset(offset);

    const sessionsWithCount = await Promise.all(
      sessions.map(async (session) => {
        const [{ count }] = await db
          .select({ count: sql<number>`COUNT(*)` })
          .from(chatMessages)
          .where(eq(chatMessages.sessionId, session.id));

        const [lastMsg] = await db
          .select()
          .from(chatMessages)
          .where(eq(chatMessages.sessionId, session.id))
          .orderBy(desc(chatMessages.createdAt))
          .limit(1);

        const descText = String(session.collected?.description || "");
        const title =
          session.ticketNumber
            ? `Ticket ${session.ticketNumber}`
            : descText
            ? descText.slice(0, 60) + (descText.length > 60 ? "..." : "")
            : "Support Intake";

        return {
          id: session.id,
          title,
          phase: session.phase,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
          ticketId: session.ticketId,
          ticketNumber: session.ticketNumber,
          messageCount: Number(count) || 0,
          lastMessage: lastMsg?.content ? lastMsg.content.slice(0, 120) : undefined,
          collected: session.collected,
        };
      })
    );

    const [{ total }] = await db
      .select({ total: sql<number>`COUNT(*)` })
      .from(chatSessions)
      .where(
        and(
          eq(chatSessions.ownerKey, owner),
          or(isNull(chatSessions.expiresAt), gt(chatSessions.expiresAt, now)),
          gt(chatSessions.createdAt, oneWeekAgo)
        )
      );

    return NextResponse.json({
      sessions: sessionsWithCount,
      total: Number(total) || 0,
      limit,
      offset,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
