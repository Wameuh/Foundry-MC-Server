import { once } from "node:events";

import { AuditLog } from "./audit/audit-log.js";
import { CapabilityCache } from "./bridge/capability-cache.js";
import { PendingRequests } from "./bridge/pending-requests.js";
import { RequestRouter } from "./bridge/request-router.js";
import { SessionRegistry } from "./bridge/session-registry.js";
import { attachBridgeWebSocketServer } from "./bridge/websocket-server.js";
import { loadConfig } from "./config.js";
import { ConfirmationStore } from "./deletion/confirmation-store.js";
import { createHttpServer } from "./http/create-http-server.js";
import { createLogger } from "./logger.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config);
  const sessions = new SessionRegistry(config.targetWorldId, config.bridgeHeartbeatTimeoutMs, logger);
  const pending = new PendingRequests();
  const capabilities = new CapabilityCache();
  const confirmations = new ConfirmationStore(config.deleteConfirmationTtlMs);
  const audit = new AuditLog(config.auditLogPath, logger);
  const router = new RequestRouter(sessions, pending, audit, config, logger);
  const dependencies = { router, sessions, capabilities, confirmations };
  const { httpServer, closeMcpHandler } = createHttpServer(config, dependencies, logger);
  const wss = attachBridgeWebSocketServer({ httpServer, config, sessions, pending, capabilities, logger });

  httpServer.listen(config.port, config.host);
  await once(httpServer, "listening");
  logger.info({ host: config.host, port: config.port }, "Foundry MCP server listening");

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "Shutting down Foundry MCP server");
    pending.rejectAll();
    sessions.close();
    wss.close();
    await closeMcpHandler();
    httpServer.close();
    if (httpServer.listening) await once(httpServer, "close");
  };

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error: unknown) => {
  process.stderr.write(`Foundry MCP failed to start: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
