/**
 * PHASE 5: Chat History Retention API
 * Retrieve past chat sessions with 7-day TTL
 * List conversations with search/filter capability
 */

import { db } from "@/db";
import { chatSessions, chatMessages } from "@/db/schema";
import { sql, isNull, gt, or, lt, and, isNotNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/iris/history
 * Retrieve past chat sessions for the current user
 *
 * Query params:
 *   - limit: number (default 10)
 *   - offset: number (default 0)
 *   - search?: string (search in session title/description)
 *   - sessionId?: string (retrieve specific session with full message history)
 *
 * Returns: { sessions: Array<{id, createdAt, messageCount, lastMessage, ticketNumber}>, total }
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get("limit") || "10");
    const offset = parseInt(searchParams.get("offset") || "0");
    const search = searchParams.get("search");
    const sessionId = searchParams.get("sessionId");

    // If retrieving specific session, return full conversation
    if (sessionId) {
      const session = await db.query.chatSessions.findFirst({
        where: (c) => sql`${c.id} = ${sessionId}`,
      });

      if (!session) {
        return NextResponse.json({ error: "Session not found" }, { status: 404 });
      }

      // Check if session has expired
      if (session.expiresAt && new Date(session.expiresAt) < new Date()) {
        return NextResponse.json(
          { error: "Session expired" },
          { status: 410 }
        );
      }

      // Get messages for this session
      const messages = await db.query.chatMessages.findMany({
        where: (m) => sql`${m.sessionId} = ${sessionId}`,
        orderBy: (m) => m.createdAt,
      });

      return NextResponse.json({
        session,
        messages,
        messageCount: messages.length,
      });
    }

    // List sessions (only active, not expired)
    const now = new Date();
    let query = db.query.chatSessions.findMany({
      where: (s) =>
        or(isNull(s.expiresAt), gt(s.expiresAt, now)),
      limit,
      offset,
      orderBy: (s) => [sql`${s.updatedAt} DESC`],
    });

    // TODO: Add search filtering by collected fields (studio, category, etc.)

    const sessions = await query;

    // Get message count for each session
    const sessionsWithCount = await Promise.all(
      sessions.map(async (session) => {
        const [{ count }] = await db
          .select({ count: sql<number>`COUNT(*)` })
          .from(chatMessages)
          .where(sql`${chatMessages.sessionId} = ${session.id}`);

        // Get last message for preview
        const lastMsg = await db.query.chatMessages.findFirst({
          where: (m) => sql`${m.sessionId} = ${session.id}`,
          orderBy: (m) => sql`${m.createdAt} DESC`,
        });

        return {
          id: session.id,
          createdAt: session.createdAt,
          ticketNumber: session.ticketNumber,
          messageCount: count || 0,
          lastMessage: lastMsg?.content?.substring(0, 100),
          collected: session.collected,
        };
      })
    );

    // Get total count for pagination - count all active (not expired) sessions
    const totalResult = await db
      .select({ total: sql<number>`COUNT(*)` })
      .from(chatSessions)
      .where(or(isNull(chatSessions.expiresAt), gt(chatSessions.expiresAt, now)));
    
    const total = totalResult[0]?.total || 0;

    return NextResponse.json({
      sessions: sessionsWithCount,
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error("History API error:", error);
    return NextResponse.json(
      { error: "Failed to retrieve history" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/iris/history/cleanup
 * Run cleanup: delete expired sessions (admin/cron only)
 * Called via background cron job
 */
export async function DELETE(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const expectedToken = process.env.CRON_SECRET;

    // Simple auth check (use proper auth in production)
    if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const now = new Date();
    const result = await db
      .delete(chatSessions)
      .where(and(isNotNull(chatSessions.expiresAt), lt(chatSessions.expiresAt, now)));

    return NextResponse.json({
      message: "Cleanup completed",
      deletedCount: result.rowCount,
    });
  } catch (error) {
    console.error("Cleanup error:", error);
    return NextResponse.json(
      { error: "Cleanup failed" },
      { status: 500 }
    );
  }
}
