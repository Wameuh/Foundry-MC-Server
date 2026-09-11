export class OperationError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "OperationError";
  }
}

export function requireGm(): void {
  if (!game.user?.isGM) {
    throw new OperationError("FORBIDDEN", "This operation requires an active GM user.");
  }
}

export function requireRecord(value: unknown, label = "payload"): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new OperationError("INVALID_REQUEST", `${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

export function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new OperationError("INVALID_REQUEST", `${label} must be a non-empty string.`);
  }
  return value;
}
