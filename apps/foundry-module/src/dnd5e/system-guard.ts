import { OperationError } from "../operations/errors";

export function requireDnd5e(): void {
  if (game.system.id !== "dnd5e") {
    throw new OperationError("UNSUPPORTED_SYSTEM", `D&D5e is required; active system is ${game.system.id}.`);
  }
}
