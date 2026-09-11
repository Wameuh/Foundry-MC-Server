import { OperationError } from "../../operations/errors";
import type { PlutoniumCapabilities } from "./types";

export class PlutoniumError extends OperationError {
  constructor(code: string, message: string, details?: unknown) {
    super(code, message, details);
    this.name = "PlutoniumError";
  }
}

export function plutoniumUnavailable(capabilities: PlutoniumCapabilities): PlutoniumError {
  if (!capabilities.active) {
    return new PlutoniumError("PLUTONIUM_UNAVAILABLE", capabilities.reason ?? "Plutonium is unavailable.");
  }
  if (!capabilities.compatible) {
    return new PlutoniumError("PLUTONIUM_VERSION_UNSUPPORTED", capabilities.reason ?? "This Plutonium version is unsupported.");
  }
  return new PlutoniumError("PLUTONIUM_API_INCOMPATIBLE", capabilities.reason ?? "The expected Plutonium API is unavailable.");
}
