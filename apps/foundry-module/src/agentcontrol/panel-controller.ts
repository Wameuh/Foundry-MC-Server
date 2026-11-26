import type { BridgeClient } from "../bridge/bridge-client";
import { AgentControlApp } from "./agent-control-app";

let currentPanel: AgentControlApp | undefined;

export function openAgentControlPanel(bridgeClient: BridgeClient | undefined): void {
  if (!game.user?.isGM) return;
  if (!bridgeClient) {
    ui.notifications?.warn("Foundry MCP: bridge is not initialized yet.");
    return;
  }
  if (currentPanel) {
    void currentPanel.render({ force: true });
    currentPanel.bringToFront?.();
    return;
  }
  currentPanel = new AgentControlApp({
    bridgeClient,
    onClosed: () => {
      currentPanel = undefined;
    },
  });
  void currentPanel.render({ force: true });
}

export function getOpenAgentControlPanel(): AgentControlApp | undefined {
  return currentPanel;
}
