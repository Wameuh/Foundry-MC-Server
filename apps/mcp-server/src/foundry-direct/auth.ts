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

export function foundryGeneration(version: string | undefined): number | undefined {
  if (!version) return undefined;
  const major = Number(version.split(".")[0]);
  return Number.isSafeInteger(major) && major > 0 ? major : undefined;
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

/**
 * Authenticate against a live Foundry server.
 *
 * This mirrors the official client and the empirically verified v14 behavior:
 *   1. `GET /join` yields an anonymous `session` cookie;
 *   2. `POST /join` must carry that same cookie plus an `Origin` header
 *      matching the server origin — v14 rejects auth POSTs without it;
 *   3. success is HTTP 200 with a JSON body `{status: "success"}`.
 *
 * The session cookie is continuity-bound: the socket must later be opened
 * with the same session id that was authenticated here.
 */
export async function joinFoundryWorld(
  foundryUrl: string,
  credentials: Pick<FoundryDirectCredentials, "userId" | "username" | "password">,
  fetchImpl: FetchLike = fetch
): Promise<FoundryJoinResult> {
  const origin = originOf(foundryUrl);

  let anonymousSession: string | undefined;
  try {
    const getResponse = await fetchImpl(new URL("/join", origin), {
      headers: { accept: "text/html,application/json" },
      redirect: "manual"
    });
    anonymousSession = extractSessionCookie(setCookies(getResponse.headers));
  } catch (error) {
    throw new AppError("FOUNDRY_AUTH_FAILED", "Unable to reach the Foundry join endpoint", {
      cause: error instanceof Error ? error.message : String(error)
    });
  }

  const headers: Record<string, string> = {
    accept: "application/json",
    "content-type": "application/json",
    origin
  };
  if (anonymousSession) headers["cookie"] = `session=${anonymousSession}`;

  let response: Response;
  try {
    response = await fetchImpl(new URL("/join", origin), {
      method: "POST",
      redirect: "manual",
      headers,
      body: buildJoinPayload(credentials)
    });
  } catch (error) {
    throw new AppError("FOUNDRY_AUTH_FAILED", "Unable to reach the Foundry join endpoint", {
      cause: error instanceof Error ? error.message : String(error)
    });
  }

  const body = await readJsonObject(response);
  const responseSession = extractSessionCookie(setCookies(response.headers));
  const sessionId = responseSession ?? anonymousSession;
  const errorMessage = typeof body["message"] === "string"
    ? body["message"]
    : typeof body["error"] === "string" ? body["error"] : undefined;
  if (!response.ok || body["status"] !== "success" || !sessionId) {
    throw new AppError("FOUNDRY_AUTH_FAILED", "Foundry rejected the backend account login", {
      status: response.status,
      ...(errorMessage ? { message: errorMessage } : {}),
      hasSessionCookie: Boolean(sessionId)
    });
  }
  return {
    sessionId,
    ...(errorMessage ? { message: errorMessage } : {})
  };
}
