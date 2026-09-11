import { createServer, type Server as HttpServer } from "node:http";

import { createMcpExpressApp } from "@modelcontextprotocol/express";
import type { NextFunction, Request, Response } from "express";
import type { Logger } from "pino";

import type { AppConfig } from "../config.js";
import type { ToolDependencies } from "../mcp/tools/shared.js";
import { registerHealthRoute } from "./health-route.js";
import { registerMcpRoute } from "./mcp-route.js";

export function createHttpServer(
  config: AppConfig,
  dependencies: ToolDependencies,
  logger: Logger
): { httpServer: HttpServer; closeMcpHandler: () => Promise<void> } {
  const app = createMcpExpressApp({
    host: config.host,
    jsonLimit: `${config.maxJsonBodyBytes}b`,
    ...(config.allowedHosts ? { allowedHosts: config.allowedHosts, allowedOrigins: config.allowedHosts } : {})
  });
  app.disable("x-powered-by");
  registerHealthRoute(app, dependencies.sessions);
  const handler = registerMcpRoute(app, config, dependencies);

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    logger.warn({ error }, "HTTP request rejected");
    if (response.headersSent) {
      _next(error);
      return;
    }
    const status = typeof error === "object" && error !== null && "status" in error
      && typeof (error as { status?: unknown }).status === "number"
      ? (error as { status: number }).status
      : 400;
    response.status(status).json({ error: status === 413 ? "payload_too_large" : "invalid_request" });
  });

  return { httpServer: createServer(app), closeMcpHandler: () => handler.close() };
}
