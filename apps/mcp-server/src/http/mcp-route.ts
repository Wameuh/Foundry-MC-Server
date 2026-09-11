import { toNodeHandler } from "@modelcontextprotocol/node";
import { createMcpHandler } from "@modelcontextprotocol/server";
import type { Express } from "express";

import type { AppConfig } from "../config.js";
import { createFoundryMcpServer } from "../mcp/create-mcp-server.js";
import type { ToolDependencies } from "../mcp/tools/shared.js";
import { createMcpBearerAuth } from "../security/mcp-auth.js";
import { rejectOversizedContentLength } from "../security/payload-limits.js";
import { createFixedWindowRateLimiter } from "../security/rate-limiter.js";

export function registerMcpRoute(app: Express, config: AppConfig, dependencies: ToolDependencies) {
  const handler = createMcpHandler(
    () => createFoundryMcpServer(dependencies),
    { legacy: "stateless" }
  );
  const nodeHandler = toNodeHandler(handler);
  const authenticate = createMcpBearerAuth(config.mcpBearerToken);
  const limit = createFixedWindowRateLimiter({ limit: 120, windowMs: 60_000 });

  app.all(
    "/mcp",
    rejectOversizedContentLength(config.maxJsonBodyBytes),
    limit,
    authenticate,
    (request, response) => void nodeHandler(request, response, request.body)
  );
  return handler;
}
