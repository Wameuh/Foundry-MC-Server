import { AppError } from "../errors.js";

const BLOCKED_KEYS = new Set(["__proto__", "prototype", "constructor"]);

export function assertSafeJson(value: unknown, maxDepth = 40): void {
  const seen = new WeakSet<object>();

  function visit(current: unknown, depth: number): void {
    if (depth > maxDepth) throw new AppError("INVALID_PAYLOAD", "Payload nesting limit exceeded");
    if (current === null || typeof current !== "object") return;
    if (seen.has(current)) throw new AppError("INVALID_PAYLOAD", "Cyclic payloads are not supported");
    seen.add(current);
    for (const [key, nested] of Object.entries(current)) {
      if (BLOCKED_KEYS.has(key)) {
        throw new AppError("INVALID_PAYLOAD", `Unsafe property is not allowed: ${key}`);
      }
      visit(nested, depth + 1);
    }
  }

  visit(value, 0);
}
