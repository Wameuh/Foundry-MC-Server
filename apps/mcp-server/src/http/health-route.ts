import type { Express } from "express";

import type { SessionRegistry } from "../bridge/session-registry.js";
import type { HeadlessStatusProvider } from "../headless/types.js";

export function registerHealthRoute(
  app: Express,
  sessions: SessionRegistry,
  headless?: HeadlessStatusProvider
): void {
  app.get("/health", (_request, response) => {
    response.status(200).json({
      status: "ok",
      bridgeConnected: sessions.getActive() !== undefined,
      headlessBrowser: headless?.getStatus() ?? { state: "disabled" },
      timestamp: new Date().toISOString()
    });
  });
}
