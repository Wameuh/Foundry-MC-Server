import { OperationError } from "../../operations/errors";
import type { AutoAnimationsCapabilities } from "./types";

export class AutoAnimationsError extends OperationError {}

export function autoanimationsUnavailable(capabilities: AutoAnimationsCapabilities): AutoAnimationsError {
  if (!capabilities.active) {
    return new AutoAnimationsError(
      "AUTOANIMATIONS_UNAVAILABLE",
      capabilities.reason ?? "Automated Animations is unavailable.",
    );
  }
  return new AutoAnimationsError(
    "AUTOANIMATIONS_API_INCOMPATIBLE",
    capabilities.reason ?? "The expected Automated Animations public API is unavailable.",
  );
}
