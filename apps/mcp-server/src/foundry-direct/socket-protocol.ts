export type EngineOpenPayload = {
  sid?: string;
  pingInterval?: number;
  pingTimeout?: number;
  upgrades?: string[];
};

export type ParsedSocketFrame =
  | { type: "engineOpen"; payload: EngineOpenPayload }
  | { type: "ping" }
  | { type: "pong" }
  | { type: "noop" }
  | { type: "socketConnect" }
  | { type: "socketEvent"; event: string; args: unknown[]; ackId?: number }
  | { type: "socketAck"; ackId: number; args: unknown[] }
  | { type: "binaryOrUnsupported"; raw: unknown }
  | { type: "malformed"; raw: string };

export function encodePong(): string {
  return "3";
}

export function encodeSocketConnect(): string {
  return "40";
}

export function encodeSocketEvent(event: string, args: unknown[], ackId: number): string {
  return `42${ackId}${JSON.stringify([event, ...args])}`;
}

function parseJsonArray(text: string): unknown[] | undefined {
  try {
    const value = JSON.parse(text) as unknown;
    return Array.isArray(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function parseEngineOpen(raw: string): EngineOpenPayload {
  try {
    const value = JSON.parse(raw.slice(1)) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const record = value as Record<string, unknown>;
    return {
      ...(typeof record["sid"] === "string" ? { sid: record["sid"] } : {}),
      ...(typeof record["pingInterval"] === "number" ? { pingInterval: record["pingInterval"] } : {}),
      ...(typeof record["pingTimeout"] === "number" ? { pingTimeout: record["pingTimeout"] } : {}),
      ...(Array.isArray(record["upgrades"]) ? { upgrades: record["upgrades"].filter((x): x is string => typeof x === "string") } : {})
    };
  } catch {
    return {};
  }
}

export function parseSocketFrame(input: unknown): ParsedSocketFrame {
  if (typeof input !== "string") return { type: "binaryOrUnsupported", raw: input };
  if (input === "2") return { type: "ping" };
  if (input === "3") return { type: "pong" };
  if (input === "40") return { type: "socketConnect" };
  if (input.startsWith("0")) return { type: "engineOpen", payload: parseEngineOpen(input) };

  const eventMatch = input.match(/^42(\d*)(\[.*\])$/s);
  if (eventMatch) {
    const args = parseJsonArray(eventMatch[2] ?? "");
    if (!args) return { type: "malformed", raw: input };
    const [event, ...rest] = args;
    if (typeof event !== "string") return { type: "malformed", raw: input };
    const ackText = eventMatch[1] ?? "";
    return {
      type: "socketEvent",
      event,
      args: rest,
      ...(ackText ? { ackId: Number(ackText) } : {})
    };
  }

  const ackMatch = input.match(/^43(\d+)(\[.*\])$/s);
  if (ackMatch) {
    const args = parseJsonArray(ackMatch[2] ?? "");
    if (!args) return { type: "malformed", raw: input };
    return { type: "socketAck", ackId: Number(ackMatch[1]), args };
  }

  if (input === "6" || input === "45") return { type: "noop" };
  return { type: "malformed", raw: input };
}

export function parseSessionBinding(args: unknown[]): { sessionId?: string; userId?: string } | null | undefined {
  const [value] = args;
  if (value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  return {
    ...(typeof record["sessionId"] === "string" ? { sessionId: record["sessionId"] } : {}),
    ...(typeof record["userId"] === "string" ? { userId: record["userId"] } : {})
  };
}
