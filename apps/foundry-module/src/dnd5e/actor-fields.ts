export type AbilityKey = "str" | "dex" | "con" | "int" | "wis" | "cha";
export type AbilityValues = Partial<Record<AbilityKey, number | undefined>>;

export function buildActorSource(input: {
  name: string;
  image?: string;
  abilities?: AbilityValues;
  biography?: string;
}): Record<string, unknown> {
  const system: Record<string, unknown> = {};
  if (input.abilities) {
    system.abilities = Object.fromEntries(
      Object.entries(input.abilities).map(([ability, value]) => [ability, { value }]),
    );
  }
  if (input.biography !== undefined) system.details = { biography: { value: input.biography } };
  return {
    name: input.name,
    type: "character",
    ...(input.image ? { img: input.image } : {}),
    ...(Object.keys(system).length ? { system } : {}),
  };
}

export function buildActorUpdate(input: {
  name: string;
  image?: string;
  abilities?: AbilityValues;
  biography?: string;
}): Record<string, unknown> {
  const update: Record<string, unknown> = { name: input.name };
  if (input.image) update.img = input.image;
  for (const [ability, value] of Object.entries(input.abilities ?? {})) update[`system.abilities.${ability}.value`] = value;
  if (input.biography !== undefined) update["system.details.biography.value"] = input.biography;
  return update;
}
