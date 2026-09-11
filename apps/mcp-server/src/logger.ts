import pino, { type Logger } from "pino";

import type { AppConfig } from "./config.js";

export function createLogger(config: Pick<AppConfig, "logLevel">): Logger {
  return pino({
    level: config.logLevel,
    redact: {
      paths: [
        "req.headers.authorization",
        "authorization",
        "token",
        "secret",
        "bridgeSecret",
        "mcpBearerToken",
        "payload.entries[*].data",
        "payload.biography",
        "payload.description"
      ],
      censor: "[REDACTED]"
    }
  });
}
