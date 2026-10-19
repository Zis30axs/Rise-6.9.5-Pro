export type NpcCharacterModelId = 'deepseek' | 'xiaoyang' | 'claude';

/** Appearance is derived from the saved identity, never from render order or a new random seed. */
export function characterForPerson(id: string): NpcCharacterModelId {
  let hash = 2166136261;
  for (const character of id) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return (['deepseek', 'xiaoyang', 'claude'] as const)[(hash >>> 0) % 3];
}
