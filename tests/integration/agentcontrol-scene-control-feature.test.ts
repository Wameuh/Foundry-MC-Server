import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("AgentControl scene control feature", () => {
  beforeEach(() => vi.resetModules());

  afterEach(() => {
    for (const key of ["game", "Hooks"]) delete (globalThis as Record<string, unknown>)[key];
    vi.restoreAllMocks();
  });

  it("adds a GM-only button tool to the token scene controls", async () => {
    let controlCallback: ((controls: unknown) => void) | undefined;
    (globalThis as Record<string, unknown>).game = { user: { id: "gm", isGM: true } };
    (globalThis as Record<string, unknown>).Hooks = {
      once: vi.fn(),
      on: vi.fn((hook: string, callback: (controls: unknown) => void) => {
        if (hook === "getSceneControlButtons") controlCallback = callback;
        return 1;
      }),
      off: vi.fn(),
    };

    const { registerAgentControlSceneControl } = await import("../../apps/foundry-module/src/agentcontrol/scene-control.js");
    registerAgentControlSceneControl(() => undefined);

    const controls = { tokens: { tools: {} as Record<string, unknown> } };
    controlCallback?.(controls);

    expect(controls.tokens.tools.agentcontrol).toMatchObject({
      name: "agentcontrol",
      title: "FOUNDRY_MCP.SceneControls.AgentControl",
      icon: "fa-solid fa-robot",
      button: true,
      visible: true,
    });
    expect(typeof (controls.tokens.tools.agentcontrol as { onChange?: unknown }).onChange).toBe("function");
  });

  it("does not expose the control to non-GM users", async () => {
    let controlCallback: ((controls: unknown) => void) | undefined;
    (globalThis as Record<string, unknown>).game = { user: { id: "player", isGM: false } };
    (globalThis as Record<string, unknown>).Hooks = {
      once: vi.fn(),
      on: vi.fn((hook: string, callback: (controls: unknown) => void) => {
        if (hook === "getSceneControlButtons") controlCallback = callback;
        return 1;
      }),
      off: vi.fn(),
    };

    const { registerAgentControlSceneControl } = await import("../../apps/foundry-module/src/agentcontrol/scene-control.js");
    registerAgentControlSceneControl(() => undefined);

    const controls = { tokens: { tools: {} as Record<string, unknown> } };
    controlCallback?.(controls);

    expect(controls.tokens.tools.agentcontrol).toBeUndefined();
  });
});
