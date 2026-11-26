import { MODULE_ID } from "../settings/register-settings";
import type { AgentControlPreferences } from "./session-state";

export function loadAgentControlPreferences(): unknown {
  return game.settings.get(MODULE_ID, "agentControlSelections");
}

export function saveAgentControlPreferences(preferences: AgentControlPreferences): void {
  void game.settings.set(MODULE_ID, "agentControlSelections", preferences);
}
