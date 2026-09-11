import { z } from "zod/v4";

const EnvironmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  MCP_HOST: z.string().min(1).default("127.0.0.1"),
  MCP_PORT: z.coerce.number().int().min(1).max(65_535).default(3210),
  MCP_BEARER_TOKEN: z.string().min(16),
  FOUNDRY_BRIDGE_SECRET: z.string().min(16),
  TARGET_WORLD_ID: z.string().min(1),
  FOUNDRY_ORIGIN: z.string().url(),
  AUDIT_LOG_PATH: z.string().min(1).default("./data/audit.jsonl"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  NORMAL_OPERATION_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  PLUTONIUM_OPERATION_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),
  BRIDGE_HEARTBEAT_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  DELETE_CONFIRMATION_TTL_MS: z.coerce.number().int().positive().default(120_000),
  MAX_JSON_BODY_BYTES: z.coerce.number().int().positive().default(2 * 1024 * 1024),
  MCP_ALLOWED_HOSTS: z.string().optional(),
  FOUNDRY_HEADLESS_ENABLED: z.enum(["true", "false"]).default("false"),
  FOUNDRY_HEADLESS_URL: z.string().url().default("http://127.0.0.1:30000"),
  FOUNDRY_HEADLESS_USERNAME: z.string().min(1).optional(),
  FOUNDRY_HEADLESS_ACCESS_KEY: z.string().min(1).optional(),
  FOUNDRY_HEADLESS_BRIDGE_URL: z.string().url().optional(),
  FOUNDRY_HEADLESS_CHROMIUM_PATH: z.string().min(1).default("/usr/bin/chromium"),
  FOUNDRY_HEADLESS_PROFILE_PATH: z.string().min(1).default("./data/chromium-profile"),
  FOUNDRY_HEADLESS_READY_TIMEOUT_MS: z.coerce.number().int().min(30_000).default(300_000),
  FOUNDRY_HEADLESS_RETRY_MS: z.coerce.number().int().min(1_000).default(10_000),
  FOUNDRY_HEADLESS_BRIDGE_GRACE_MS: z.coerce.number().int().min(5_000).default(60_000)
});

export type HeadlessBrowserConfig = {
  enabled: boolean;
  foundryUrl: string;
  username?: string;
  accessKey?: string;
  bridgeUrl: string;
  chromiumPath: string;
  profilePath: string;
  readyTimeoutMs: number;
  retryMs: number;
  bridgeGraceMs: number;
};

export type AppConfig = {
  nodeEnv: "development" | "test" | "production";
  host: string;
  port: number;
  mcpBearerToken: string;
  bridgeSecret: string;
  targetWorldId: string;
  foundryOrigin: string;
  auditLogPath: string;
  logLevel: "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";
  normalOperationTimeoutMs: number;
  plutoniumOperationTimeoutMs: number;
  bridgeHeartbeatTimeoutMs: number;
  deleteConfirmationTtlMs: number;
  maxJsonBodyBytes: number;
  allowedHosts?: string[];
  headlessBrowser: HeadlessBrowserConfig;
};

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const value = EnvironmentSchema.parse(environment);
  const allowedHosts = value.MCP_ALLOWED_HOSTS
    ?.split(",")
    .map((host) => host.trim())
    .filter(Boolean);

  if ((value.MCP_HOST === "0.0.0.0" || value.MCP_HOST === "::") && !allowedHosts?.length) {
    throw new Error("MCP_ALLOWED_HOSTS is required when MCP_HOST listens on all interfaces");
  }

  const headlessEnabled = value.FOUNDRY_HEADLESS_ENABLED === "true";
  if (headlessEnabled && (!value.FOUNDRY_HEADLESS_USERNAME || !value.FOUNDRY_HEADLESS_ACCESS_KEY)) {
    throw new Error("FOUNDRY_HEADLESS_USERNAME and FOUNDRY_HEADLESS_ACCESS_KEY are required when headless mode is enabled");
  }
  if (headlessEnabled && new URL(value.FOUNDRY_HEADLESS_URL).origin !== new URL(value.FOUNDRY_ORIGIN).origin) {
    throw new Error("FOUNDRY_HEADLESS_URL and FOUNDRY_ORIGIN must use the same origin in headless mode");
  }

  const headlessBridgeUrl = value.FOUNDRY_HEADLESS_BRIDGE_URL
    ?? `ws://127.0.0.1:${value.MCP_PORT}/foundry-mcp/bridge`;

  return {
    nodeEnv: value.NODE_ENV,
    host: value.MCP_HOST,
    port: value.MCP_PORT,
    mcpBearerToken: value.MCP_BEARER_TOKEN,
    bridgeSecret: value.FOUNDRY_BRIDGE_SECRET,
    targetWorldId: value.TARGET_WORLD_ID,
    foundryOrigin: value.FOUNDRY_ORIGIN,
    auditLogPath: value.AUDIT_LOG_PATH,
    logLevel: value.LOG_LEVEL,
    normalOperationTimeoutMs: value.NORMAL_OPERATION_TIMEOUT_MS,
    plutoniumOperationTimeoutMs: value.PLUTONIUM_OPERATION_TIMEOUT_MS,
    bridgeHeartbeatTimeoutMs: value.BRIDGE_HEARTBEAT_TIMEOUT_MS,
    deleteConfirmationTtlMs: value.DELETE_CONFIRMATION_TTL_MS,
    maxJsonBodyBytes: value.MAX_JSON_BODY_BYTES,
    ...(allowedHosts?.length ? { allowedHosts } : {}),
    headlessBrowser: {
      enabled: headlessEnabled,
      foundryUrl: value.FOUNDRY_HEADLESS_URL,
      ...(value.FOUNDRY_HEADLESS_USERNAME ? { username: value.FOUNDRY_HEADLESS_USERNAME } : {}),
      ...(value.FOUNDRY_HEADLESS_ACCESS_KEY ? { accessKey: value.FOUNDRY_HEADLESS_ACCESS_KEY } : {}),
      bridgeUrl: headlessBridgeUrl,
      chromiumPath: value.FOUNDRY_HEADLESS_CHROMIUM_PATH,
      profilePath: value.FOUNDRY_HEADLESS_PROFILE_PATH,
      readyTimeoutMs: value.FOUNDRY_HEADLESS_READY_TIMEOUT_MS,
      retryMs: value.FOUNDRY_HEADLESS_RETRY_MS,
      bridgeGraceMs: value.FOUNDRY_HEADLESS_BRIDGE_GRACE_MS
    }
  };
}
