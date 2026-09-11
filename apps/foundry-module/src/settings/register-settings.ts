export const MODULE_ID = "foundry-mcp-bridge";

type Setting = {
  key: string;
  name: string;
  hint: string;
  type: StringConstructor | BooleanConstructor;
  default: string | boolean;
  scope?: "world" | "client";
};

const SETTINGS: Setting[] = [
  {
    key: "bridgeUrl",
    name: "FOUNDRY_MCP.Settings.BridgeUrl.Name",
    hint: "FOUNDRY_MCP.Settings.BridgeUrl.Hint",
    type: String,
    default: "",
    scope: "client",
  },
  {
    key: "bridgeSecret",
    name: "FOUNDRY_MCP.Settings.BridgeSecret.Name",
    hint: "FOUNDRY_MCP.Settings.BridgeSecret.Hint",
    type: String,
    default: "",
    scope: "client",
  },
  {
    key: "notifications",
    name: "FOUNDRY_MCP.Settings.Notifications.Name",
    hint: "FOUNDRY_MCP.Settings.Notifications.Hint",
    type: Boolean,
    default: true,
  },
  {
    key: "diagnostics",
    name: "FOUNDRY_MCP.Settings.Diagnostics.Name",
    hint: "FOUNDRY_MCP.Settings.Diagnostics.Hint",
    type: Boolean,
    default: false,
  },
];

export function registerSettings(): void {
  for (const setting of SETTINGS) {
    game.settings.register(MODULE_ID, setting.key, {
      name: setting.name,
      hint: setting.hint,
      scope: setting.scope ?? "world",
      config: true,
      restricted: true,
      type: setting.type,
      default: setting.default,
    });
  }
}
