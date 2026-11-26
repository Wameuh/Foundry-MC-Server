import { MODULE_ID } from "./register-settings";

export type BridgeSettings = {
  bridgeUrl: string;
  bridgeSecret: string;
  diagnostics: boolean;
};

export function readSettings(): BridgeSettings {
  const bridgeUrl = game.settings.get(MODULE_ID, "bridgeUrl");
  const bridgeSecret = game.settings.get(MODULE_ID, "bridgeSecret");
  return {
    bridgeUrl: typeof bridgeUrl === "string" ? bridgeUrl.trim() : "",
    bridgeSecret: typeof bridgeSecret === "string" ? bridgeSecret : "",
    diagnostics: Boolean(game.settings.get(MODULE_ID, "diagnostics")),
  };
}
