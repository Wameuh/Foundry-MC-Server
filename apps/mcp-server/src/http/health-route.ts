import type { Express } from "express";

import type { SessionRegistry } from "../bridge/session-registry.js";

export function registerHealthRoute(app: Express, sessions: SessionRegistry): void {
  app.get("/health", (_request, response) => {
    response.status(200).json({
      status: "ok",
      bridgeConnected: sessions.getActive() !== undefined,
      timestamp: new Date().toISOString()
    });
  });
}
