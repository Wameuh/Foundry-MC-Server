import { createHash, timingSafeEqual } from "node:crypto";

import type { NextFunction, Request, Response } from "express";

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

export function bearerTokenMatches(header: string | undefined, expectedToken: string): boolean {
  if (!header?.startsWith("Bearer ")) return false;
  const presented = header.slice("Bearer ".length);
  if (!presented) return false;
  return timingSafeEqual(digest(presented), digest(expectedToken));
}

export function createMcpBearerAuth(expectedToken: string) {
  return (request: Request, response: Response, next: NextFunction): void => {
    if (!bearerTokenMatches(request.header("authorization"), expectedToken)) {
      response.setHeader("WWW-Authenticate", 'Bearer realm="foundry-mcp", error="invalid_token"');
      response.status(401).json({ error: "unauthorized" });
      return;
    }
    next();
  };
}
