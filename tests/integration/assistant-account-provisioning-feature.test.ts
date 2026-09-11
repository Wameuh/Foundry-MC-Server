import { describe, expect, it } from "vitest";

import {
  ASSISTANT_USER_NAME,
  provisionAssistantAccount,
  type AssistantProvisioningGateway
} from "../../apps/foundry-module/src/provisioning/assistant-account.js";

class FeatureGateway implements AssistantProvisioningGateway {
  readonly events: string[] = [];
  fullGm = true;
  enabled = true;
  confirmed = true;
  existingIsFullGm: boolean | undefined;

  isFullGamemaster() { return this.fullGm; }
  isEnabled() { return this.enabled; }
  findUser() { return this.existingIsFullGm === undefined ? undefined : { isFullGamemaster: this.existingIsFullGm }; }
  async confirmCreation(name: string) { this.events.push(`confirm:${name}`); return this.confirmed; }
  async createGamemaster(name: string, key: string) { this.events.push(`create:${name}:${key}`); }
  async showCredentials(configuration: string) { this.events.push(`show:${configuration}`); }
  async disable() { this.events.push("disable"); this.enabled = false; }
  warn(message: string) { this.events.push(`warn:${message}`); }
  error(message: string) { this.events.push(`error:${message}`); }
  generateAccessKey() { return "generated-access-key"; }
}

describe("assistant account provisioning feature", () => {
  it("creates a confirmed GM account and presents one-time server configuration", async () => {
    const gateway = new FeatureGateway();

    await expect(provisionAssistantAccount(gateway)).resolves.toBe("created");

    expect(gateway.events).toEqual([
      `confirm:${ASSISTANT_USER_NAME}`,
      `create:${ASSISTANT_USER_NAME}:generated-access-key`,
      "disable",
      expect.stringContaining("show:FOUNDRY_HEADLESS_ENABLED=true")
    ]);
    expect(gateway.events.at(-1)).toContain("FOUNDRY_HEADLESS_USERNAME=MCP Bridge GM");
    expect(gateway.events.at(-1)).toContain("FOUNDRY_HEADLESS_ACCESS_KEY=generated-access-key");
  });

  it("does not create a privileged account when the GM declines", async () => {
    const gateway = new FeatureGateway();
    gateway.confirmed = false;

    await expect(provisionAssistantAccount(gateway)).resolves.toBe("dismissed");

    expect(gateway.events).toEqual([`confirm:${ASSISTANT_USER_NAME}`, "disable"]);
  });

  it("never replaces an existing user with the reserved name", async () => {
    const gateway = new FeatureGateway();
    gateway.existingIsFullGm = false;

    await expect(provisionAssistantAccount(gateway)).resolves.toBe("skipped");

    expect(gateway.events[0]).toMatch(/^warn:/);
    expect(gateway.events).toContain("disable");
    expect(gateway.events.some((event) => event.startsWith("create:"))).toBe(false);
  });
});
