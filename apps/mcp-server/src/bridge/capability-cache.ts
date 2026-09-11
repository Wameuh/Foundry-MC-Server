import type { BridgeRegistration } from "@foundry-mcp/protocol";

export class CapabilityCache {
  private registration: BridgeRegistration | undefined;

  set(registration: BridgeRegistration): void {
    this.registration = structuredClone(registration);
  }

  clear(): void {
    this.registration = undefined;
  }

  get(): BridgeRegistration | undefined {
    return this.registration ? structuredClone(this.registration) : undefined;
  }

  has(capability: string): boolean {
    return this.registration?.capabilities.includes(capability) ?? false;
  }
}
