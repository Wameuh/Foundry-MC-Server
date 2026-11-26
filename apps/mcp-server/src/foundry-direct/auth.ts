import { AppError } from "../errors.js";
import type { FoundryApiStatus, FoundryDirectCredentials, FoundryJoinResult } from "./types.js";

type FetchLike = typeof fetch;

function originOf(foundryUrl: string): string {
  return new URL(foundryUrl).origin;
}

async function readJsonObject(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) return {};
  try {
    const value = JSON.parse(text) as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

export async function fetchFoundryApiStatus(
  foundryUrl: string,
  fetchImpl: FetchLike = fetch
): Promise<FoundryApiStatus> {
  let response: Response;
  try {
    response = await fetchImpl(new URL("/api/status", originOf(foundryUrl)), {
      headers: { accept: "application/json" }
    });
  } catch (error) {
    throw new AppError("FOUNDRY_UNAVAILABLE", "Unable to reach the Foundry status endpoint", {
      cause: error instanceof Error ? error.message : String(error)
    });
  }
  if (!response.ok) {
    throw new AppError("FOUNDRY_UNAVAILABLE", `Foundry status endpoint returned HTTP ${response.status}`);
  }
  const body = await readJsonObject(response);
  return {
    active: body["active"] === true,
    ...(typeof body["version"] === "string" ? { version: body["version"] } : {}),
    ...(body["world"] !== undefined ? { world: body["world"] } : {}),
    raw: body
  };
}

function setCookies(headers: Headers): string[] {
  const withGetSetCookie = headers as Headers & { getSetCookie?: () => string[] };
  const values = withGetSetCookie.getSetCookie?.();
  if (values?.length) return values;
  const single = headers.get("set-cookie");
  return single ? [single] : [];
}

export function extractSessionCookie(cookies: string[]): string | undefined {
  for (const cookie of cookies) {
    const match = cookie.match(/(?:^|;\s*)session=([^;\s]+)/i);
    if (match?.[1]) return decodeURIComponent(match[1]);
  }
  return undefined;
}

export function buildJoinPayload(credentials: Pick<FoundryDirectCredentials, "userId" | "username" | "password">): string {
  return JSON.stringify({
    userid: credentials.userId,
    userId: credentials.userId,
    username: credentials.username,
    password: credentials.password,
    action: "join"
  });
}

export async function joinFoundryWorld(
  foundryUrl: string,
  credentials: Pick<FoundryDirectCredentials, "userId" | "username" | "password">,
  fetchImpl: FetchLike = fetch
): Promise<FoundryJoinResult> {
  let response: Response;
  try {
    response = await fetchImpl(new URL("/join", originOf(foundryUrl)), {
      method: "POST",
      redirect: "manual",
      headers: {
        accept: "application/json",
        "content-type": "application/json"
      },
      body: buildJoinPayload(credentials)
    });
  } catch (error) {
    throw new AppError("FOUNDRY_AUTH_FAILED", "Unable to reach the Foundry join endpoint", {
      cause: error instanceof Error ? error.message : String(error)
    });
  }

  const body = await readJsonObject(response);
  const sessionId = extractSessionCookie(setCookies(response.headers));
  if (!response.ok || body["status"] !== "success" || !sessionId) {
    throw new AppError("FOUNDRY_AUTH_FAILED", "Foundry rejected the backend account login", {
      status: response.status,
      message: typeof body["message"] === "string" ? body["message"] : undefined,
      hasSessionCookie: Boolean(sessionId)
    });
  }
  return {
    sessionId,
    ...(typeof body["message"] === "string" ? { message: body["message"] } : {})
  };
}
