export function getAdvancementWarnings(items: FoundryDocument[]): string[] {
  const requiringChoices = items.filter((item) => {
    const system = item.toObject(false).system as { advancement?: unknown[] } | undefined;
    return Array.isArray(system?.advancement) && system.advancement.length > 0;
  });
  if (!requiringChoices.length) return [];
  return [
    `${requiringChoices.length} imported item(s) contain advancement data; interactive choices were not applied automatically.`,
  ];
}
