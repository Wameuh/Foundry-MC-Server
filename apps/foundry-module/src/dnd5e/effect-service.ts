import { assertSafeObject } from "../operations/safe-data";

export async function createActorEffects(actor: FoundryDocument, effects: unknown[]): Promise<FoundryDocument[]> {
  if (!effects.length) return [];
  const safeEffects = effects.map((effect, index) => {
    assertSafeObject(effect, `effects[${index}]`);
    return effect;
  });
  return await actor.createEmbeddedDocuments("ActiveEffect", safeEffects, { renderSheet: false });
}
