/**
 * The Iris chat's streaming client, kept apart from the chat component so it can be imported
 * (and checked by scripts/iris-turn-check.ts under plain Node) without pulling in the UI and
 * its CSS modules.
 */
import type { IrisTurn } from '@/lib/iris-contract';

/**
 * Sends a turn and reads the reply as it is written.
 *
 * Iris answers in two parts: the acknowledgement, which the model writes first and which is
 * streamed here character by character, and the turn itself — field, options, draft — which
 * arrives whole at the end because the UI renders state from it. If the browser or a proxy
 * cannot give us a readable stream, this falls back to waiting for the whole reply.
 */
export async function streamTurn(
  payload: Record<string, unknown>,
  onDelta: (chunk: string) => void
): Promise<IrisTurn> {
  const res = await fetch('/api/iris/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({ ...payload, stream: true }),
  });

  // An error before the stream opens is still an ordinary JSON error response.
  if (!res.ok || !res.body || !res.headers.get('content-type')?.includes('text/event-stream')) {
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      throw new Error('The server returned an unexpected response. Please retry.');
    }
    if (!res.ok) throw new Error((data as { error?: string }).error || 'Request failed');
    return data as IrisTurn;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let turn: IrisTurn | undefined;
  let failure = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by a blank line; a partial frame stays in the buffer.
    let split = buffer.indexOf('\n\n');
    while (split !== -1) {
      const frame = buffer.slice(0, split);
      buffer = buffer.slice(split + 2);
      const event = frame.match(/^event: (.*)$/m)?.[1];
      const raw = frame.match(/^data: (.*)$/m)?.[1];
      if (event && raw) {
        try {
          const data = JSON.parse(raw);
          if (event === 'ack' && typeof data.text === 'string') onDelta(data.text);
          else if (event === 'turn') turn = data as IrisTurn;
          else if (event === 'error') failure = String(data.error || 'Request failed');
        } catch {
          // A frame we cannot parse is not worth killing the turn over.
        }
      }
      split = buffer.indexOf('\n\n');
    }
  }

  if (failure) throw new Error(failure);
  if (!turn) throw new Error('The reply ended before it was complete. Please retry.');
  return turn;
}
