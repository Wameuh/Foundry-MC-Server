export const MODULE_ID = "foundry-mcp-bridge";

type Setting = {
  key: string;
  name: string;
  hint: string;
  type: StringConstructor | BooleanConstructor | ObjectConstructor;
  default: string | boolean | Record<string, unknown>;
  scope?: "world" | "client";
  config?: boolean;
  onChange?: (value: unknown) => void;
};

type BridgeSettingsListener = () => void;

const bridgeSettingsListeners = new Set<BridgeSettingsListener>();

function notifyBridgeSettingsChanged(): void {
  for (const listener of bridgeSettingsListeners) listener();
}

export function subscribeToBridgeSettings(listener: BridgeSettingsListener): () => void {
  bridgeSettingsListeners.add(listener);
  return () => bridgeSettingsListeners.delete(listener);
}

const SETTINGS: Setting[] = [
  {
    key: "bridgeUrl",
    name: "FOUNDRY_MCP.Settings.BridgeUrl.Name",
    hint: "FOUNDRY_MCP.Settings.BridgeUrl.Hint",
    type: String,
    default: "",
    scope: "client",
    onChange: notifyBridgeSettingsChanged,
  },
  {
    key: "bridgeSecret",
    name: "FOUNDRY_MCP.Settings.BridgeSecret.Name",
    hint: "FOUNDRY_MCP.Settings.BridgeSecret.Hint",
    type: String,
    default: "",
    scope: "client",
    onChange: notifyBridgeSettingsChanged,
  },
  {
    key: "diagnostics",
    name: "FOUNDRY_MCP.Settings.Diagnostics.Name",
    hint: "FOUNDRY_MCP.Settings.Diagnostics.Hint",
    type: Boolean,
    default: false,
  },
  {
    key: "offerAssistantSetup",
    name: "FOUNDRY_MCP.Settings.AssistantSetup.Name",
    hint: "FOUNDRY_MCP.Settings.AssistantSetup.Hint",
    type: Boolean,
    default: true,
    scope: "world",
  },
  {
    key: "agentControlSelections",
    name: "FOUNDRY_MCP.Settings.AgentControlSelections.Name",
    hint: "FOUNDRY_MCP.Settings.AgentControlSelections.Hint",
    type: Object,
    default: {},
    scope: "client",
    config: false,
  },
];

export function registerSettings(): void {
  for (const setting of SETTINGS) {
    game.settings.register(MODULE_ID, setting.key, {
      name: setting.name,
      hint: setting.hint,
      scope: setting.scope ?? "world",
      config: setting.config ?? true,
      restricted: true,
      type: setting.type,
      default: setting.default,
      ...(setting.onChange ? { onChange: setting.onChange } : {}),
    });
  }
}
