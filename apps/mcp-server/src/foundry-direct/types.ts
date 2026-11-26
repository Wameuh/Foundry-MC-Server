export type DirectConnectionState =
  | "unprovisioned"
  | "waiting_for_world"
  | "connecting"
  | "connected"
  | "error"
  | "stopped";

export type FoundryDirectCredentials = {
  worldId: string;
  userId: string;
  username: string;
  password: string;
  createdAt: string;
  updatedAt: string;
};

export type FoundryApiStatus = {
  active: boolean;
  version?: string;
  world?: unknown;
  raw: Record<string, unknown>;
};

export type FoundryJoinResult = {
  sessionId: string;
  message?: string;
};

export type DirectBackendStatus = {
  state: DirectConnectionState;
  foundryUrl: string;
  worldId: string;
  userId?: string;
  username?: string;
  foundryVersion?: string;
  connectedAt?: string;
  lastError?: string;
};
