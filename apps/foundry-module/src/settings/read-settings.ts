import { MODULE_ID } from "./register-settings";

export type BridgeSettings = {
  bridgeUrl: string;
  bridgeSecret: string;
  notifications: boolean;
  diagnostics: boolean;
};

export function readSettings(): BridgeSettings {
  const bridgeUrl = game.settings.get(MODULE_ID, "bridgeUrl");
  const bridgeSecret = game.settings.get(MODULE_ID, "bridgeSecret");
  return {
    bridgeUrl: typeof bridgeUrl === "string" ? bridgeUrl.trim() : "",
    bridgeSecret: typeof bridgeSecret === "string" ? bridgeSecret : "",
    notifications: Boolean(game.settings.get(MODULE_ID, "notifications")),
    diagnostics: Boolean(game.settings.get(MODULE_ID, "diagnostics")),
  };
}
