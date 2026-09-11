import type { NextFunction, Request, Response } from "express";

export function rejectOversizedContentLength(maxBytes: number) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const raw = request.header("content-length");
    const size = raw === undefined ? undefined : Number(raw);
    if (size !== undefined && Number.isFinite(size) && size > maxBytes) {
      response.status(413).json({ error: "payload_too_large" });
      return;
    }
    next();
  };
}
