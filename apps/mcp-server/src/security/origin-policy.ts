import type { IncomingMessage } from "node:http";

export function websocketOriginAllowed(request: IncomingMessage, allowedOrigin: string): boolean {
  const origin = request.headers.origin;
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(allowedOrigin).origin;
  } catch {
    return false;
  }
}
