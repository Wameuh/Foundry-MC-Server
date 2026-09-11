const SENSITIVE_KEYS = /authorization|token|secret|password|biography|description/i;

export function redactAuditValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactAuditValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [
      key,
      SENSITIVE_KEYS.test(key) || key === "data" ? "[REDACTED]" : redactAuditValue(nested)
    ])
  );
}
