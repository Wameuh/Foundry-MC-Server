import type { BridgeClient } from "../bridge/bridge-client";
import { openAgentControlPanel } from "./panel-controller";

type SceneControlTool = Record<string, unknown>;
type SceneControl = { tools?: Record<string, SceneControlTool> } | undefined;

let registered = false;

/** Register a GM-only scene-control button using the Foundry v14 controls record. */
export function registerAgentControlSceneControl(getBridgeClient: () => BridgeClient | undefined): void {
  if (registered) return;
  registered = true;
  Hooks.on("getSceneControlButtons", (rawControls: unknown) => {
    if (!game.user?.isGM || !rawControls || typeof rawControls !== "object") return;
    const controls = rawControls as Record<string, SceneControl>;
    const control = controls.tokens ?? controls.token;
    if (!control?.tools) return;
    control.tools.agentcontrol = {
      name: "agentcontrol",
      title: "FOUNDRY_MCP.SceneControls.AgentControl",
      icon: "fa-solid fa-robot",
      order: Object.keys(control.tools).length,
      button: true,
      visible: true,
      onChange: () => openAgentControlPanel(getBridgeClient()),
    };
  });
}
