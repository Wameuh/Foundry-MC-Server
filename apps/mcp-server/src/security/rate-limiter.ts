import type { NextFunction, Request, Response } from "express";

type Bucket = { count: number; resetAt: number };

export function createFixedWindowRateLimiter(options: { limit: number; windowMs: number }) {
  const buckets = new Map<string, Bucket>();
  return (request: Request, response: Response, next: NextFunction): void => {
    const now = Date.now();
    const key = request.ip || request.socket.remoteAddress || "unknown";
    const existing = buckets.get(key);
    const bucket = !existing || existing.resetAt <= now
      ? { count: 0, resetAt: now + options.windowMs }
      : existing;
    bucket.count += 1;
    buckets.set(key, bucket);
    response.setHeader("RateLimit-Limit", options.limit);
    response.setHeader("RateLimit-Remaining", Math.max(0, options.limit - bucket.count));
    response.setHeader("RateLimit-Reset", Math.ceil(bucket.resetAt / 1000));
    if (bucket.count > options.limit) {
      response.status(429).json({ error: "rate_limited" });
      return;
    }
    if (buckets.size > 1_000) {
      for (const [bucketKey, value] of buckets) if (value.resetAt <= now) buckets.delete(bucketKey);
    }
    next();
  };
}
