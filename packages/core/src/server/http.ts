import crypto from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

/** The token is the whole authentication story: the server listens only on the
 *  loopback interface, and every request must carry it. A page on another
 *  origin can reach 127.0.0.1, so "it is local" is not a security property —
 *  the prototype's /api/config proved that by handing any tab the API key. */
export function newToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function tokenMatches(expected: string, given: string | null): boolean {
  if (!given) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  // Length must match before timingSafeEqual, and comparing lengths first
  // leaks only the length, which is fixed anyway.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function bearerOrQuery(req: IncomingMessage, url: URL): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  // EventSource cannot set headers, so the stream endpoints accept ?t=.
  return url.searchParams.get("t");
}

/** A cross-origin page cannot read our responses (we send no CORS headers),
 *  but it can still cause side effects with a simple POST. Requests that carry
 *  an Origin must carry ours. */
export function originAllowed(req: IncomingMessage, selfOrigin: string): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  return origin === selfOrigin;
}

export function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    // Nothing here should ever be cached or embedded.
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(payload);
}

export async function readJson<T>(req: IncomingMessage, limit = 1_000_000): Promise<T> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new Error("Request body too large");
    chunks.push(chunk as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
}

/** Server-sent events: one direction, no dependency, and it reconnects on its
 *  own. The client answers approval prompts with a separate POST. */
export class EventStream {
  private closed = false;

  constructor(private readonly res: ServerResponse) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    // Some proxies hold a stream until the first bytes arrive.
    res.write(": open\n\n");
  }

  send(data: unknown): void {
    if (this.closed) return;
    this.res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  end(): void {
    if (this.closed) return;
    this.closed = true;
    this.res.end();
  }

  get isClosed(): boolean {
    return this.closed;
  }
}
