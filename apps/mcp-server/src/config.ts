import { z } from "zod/v4";

const EnvironmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  MCP_HOST: z.string().min(1).default("127.0.0.1"),
  MCP_PORT: z.coerce.number().int().min(1).max(65_535).default(3210),
  MCP_BEARER_TOKEN: z.string().min(16),
  FOUNDRY_BRIDGE_SECRET: z.string().min(16),
  TARGET_WORLD_ID: z.string().min(1),
  FOUNDRY_ORIGIN: z.string().url(),
  FOUNDRY_DIRECT_URL: z.string().url().optional(),
  FOUNDRY_DIRECT_CREDENTIALS_PATH: z.string().min(1).default("./data/foundry-direct-credentials.json"),
  AGENTCONTROL_TCP: z.string().min(1).default("127.0.0.1:7331"),
  AGENTCONTROL_TOKEN_PATH: z.string().min(1).optional(),
  AGENTCONTROL_WORKSPACE: z.string().min(1).default("/data/agent-workspace"),
  AGENTCONTROL_SLOTS_PATH: z.string().min(1).default("./data/agentcontrol-slots.json"),
  AGENTCONTROL_INJECT_FOUNDRY_MCP: z.enum(["true", "false"]).default("false"),
  PLUTONIUM_DATA_PATH: z.string().min(1).optional(),
  AUDIT_LOG_PATH: z.string().min(1).default("./data/audit.jsonl"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  NORMAL_OPERATION_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  BRIDGE_HEARTBEAT_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  DELETE_CONFIRMATION_TTL_MS: z.coerce.number().int().positive().default(120_000),
  MAX_JSON_BODY_BYTES: z.coerce.number().int().positive().default(2 * 1024 * 1024),
  MCP_ALLOWED_HOSTS: z.string().optional(),
});

export type AppConfig = {
  nodeEnv: "development" | "test" | "production";
  host: string;
  port: number;
  mcpBearerToken: string;
  bridgeSecret: string;
  targetWorldId: string;
  foundryOrigin: string;
  foundryDirectUrl: string;
  foundryDirectCredentialsPath: string;
  agentControlTcp: string;
  agentControlTokenPath?: string;
  agentControlWorkspace: string;
  agentControlSlotsPath: string;
  agentControlInjectFoundryMcp: boolean;
  plutoniumDataPath?: string;
  auditLogPath: string;
  logLevel: "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";
  normalOperationTimeoutMs: number;
  bridgeHeartbeatTimeoutMs: number;
  deleteConfirmationTtlMs: number;
  maxJsonBodyBytes: number;
  allowedHosts?: string[];
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

  return {
    nodeEnv: value.NODE_ENV,
    host: value.MCP_HOST,
    port: value.MCP_PORT,
    mcpBearerToken: value.MCP_BEARER_TOKEN,
    bridgeSecret: value.FOUNDRY_BRIDGE_SECRET,
    targetWorldId: value.TARGET_WORLD_ID,
    foundryOrigin: value.FOUNDRY_ORIGIN,
    foundryDirectUrl: value.FOUNDRY_DIRECT_URL ?? value.FOUNDRY_ORIGIN,
    foundryDirectCredentialsPath: value.FOUNDRY_DIRECT_CREDENTIALS_PATH,
    agentControlTcp: value.AGENTCONTROL_TCP,
    ...(value.AGENTCONTROL_TOKEN_PATH ? { agentControlTokenPath: value.AGENTCONTROL_TOKEN_PATH } : {}),
    agentControlWorkspace: value.AGENTCONTROL_WORKSPACE,
    agentControlSlotsPath: value.AGENTCONTROL_SLOTS_PATH,
    agentControlInjectFoundryMcp: value.AGENTCONTROL_INJECT_FOUNDRY_MCP === "true",
    ...(value.PLUTONIUM_DATA_PATH ? { plutoniumDataPath: value.PLUTONIUM_DATA_PATH } : {}),
    auditLogPath: value.AUDIT_LOG_PATH,
    logLevel: value.LOG_LEVEL,
    normalOperationTimeoutMs: value.NORMAL_OPERATION_TIMEOUT_MS,
    bridgeHeartbeatTimeoutMs: value.BRIDGE_HEARTBEAT_TIMEOUT_MS,
    deleteConfirmationTtlMs: value.DELETE_CONFIRMATION_TTL_MS,
    maxJsonBodyBytes: value.MAX_JSON_BODY_BYTES,
    ...(allowedHosts?.length ? { allowedHosts } : {})
  };
}
