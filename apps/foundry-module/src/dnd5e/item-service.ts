import { assertSafeObject } from "../operations/safe-data";

export async function createActorItems(actor: FoundryDocument, items: unknown[]): Promise<FoundryDocument[]> {
  if (!items.length) return [];
  const safeItems = items.map((item, index) => {
    assertSafeObject(item, `items[${index}]`);
    return item;
  });
  return await actor.createEmbeddedDocuments("Item", safeItems, { renderSheet: false });
}
