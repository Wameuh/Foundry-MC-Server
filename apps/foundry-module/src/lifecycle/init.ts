import { registerSettings } from "../settings/register-settings";
import { registerAgentControlSceneControl } from "../agentcontrol/scene-control";
import { getBridgeClient } from "./ready";

export function onInit(): void {
  registerSettings();
  registerAgentControlSceneControl(() => getBridgeClient());
}
