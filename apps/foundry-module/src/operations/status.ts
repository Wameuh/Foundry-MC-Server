import { getPlutoniumCapabilities } from "../integrations/plutonium/capability-probe";

export function getStatus() {
  return {
    connected: true,
    world: game.world ? { id: game.world.id, title: game.world.title } : undefined,
    foundry: { version: game.version },
    system: { id: game.system.id, version: game.system.version },
    user: game.user ? { id: game.user.id, name: game.user.name, isGM: game.user.isGM } : undefined,
    plutonium: getPlutoniumCapabilities(),
  };
}
