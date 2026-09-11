import { OperationError } from "./errors";

const FORBIDDEN_SEGMENTS = new Set([
  "_id",
  "uuid",
  "parent",
  "pack",
  "apps",
  "collection",
  "__proto__",
  "prototype",
  "constructor",
]);

export function assertSafeObject(value: unknown, path = "payload"): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new OperationError("INVALID_REQUEST", `${path} must be an object.`);
  }
  walk(value, path, new WeakSet<object>());
}

function walk(value: object, path: string, seen: WeakSet<object>): void {
  if (seen.has(value)) throw new OperationError("INVALID_REQUEST", `${path} contains a cycle.`);
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    const segments = key.split(".");
    if (segments.some((segment) => FORBIDDEN_SEGMENTS.has(segment))) {
      throw new OperationError("INVALID_REQUEST", `Forbidden field at ${path}.${key}.`);
    }
    if (child && typeof child === "object") {
      if (Array.isArray(child)) {
        for (const [index, entry] of (child as unknown[]).entries()) {
          if (entry && typeof entry === "object") walk(entry, `${path}.${key}[${index}]`, seen);
        }
      } else {
        walk(child as object, `${path}.${key}`, seen);
      }
    }
  }
  seen.delete(value);
}

export function pickPaths(source: Record<string, unknown>, paths?: string[]): Record<string, unknown> {
  if (!paths?.length) return source;
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const path of paths) {
    const segments = path.split(".");
    if (segments.some((segment) => FORBIDDEN_SEGMENTS.has(segment))) continue;
    let current: unknown = source;
    for (const segment of segments) {
      if (!current || typeof current !== "object" || !(segment in current)) {
        current = undefined;
        break;
      }
      current = (current as Record<string, unknown>)[segment];
    }
    if (current !== undefined) result[path] = current;
  }
  return result;
}
