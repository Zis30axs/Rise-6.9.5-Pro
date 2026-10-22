export type ActivityKind = 'study' | 'desk' | 'bookshelf' | 'wait' | 'rest' | 'practice';

/** Nominal wellbeing changes; callers clamp the actual result to 0..100. */
export function getActivityEffects(kind: string, minutes: number): { morale: number; stress: number; health: number } {
  const unchanged = { morale: 0, stress: 0, health: 0 };
  if (!Number.isInteger(minutes) || minutes <= 0) return unchanged;
  switch (kind) {
    case 'study': return { morale: -Math.ceil(minutes / 15), stress: Math.ceil(minutes / 30), health: 0 };
    case 'desk': return { morale: 3, stress: -4, health: 0 };
    case 'bookshelf': return { morale: 2, stress: -2, health: 0 };
    case 'wait': return { morale: Math.floor(minutes / 15), stress: -Math.floor(minutes / 15) || 0, health: 0 };
    case 'rest': return { morale: Math.floor(minutes / 15) * 2, stress: -Math.floor(minutes / 15) * 2 || 0, health: Math.floor(minutes / 120) };
    case 'practice': return { morale: Math.ceil(minutes / 30), stress: -Math.ceil(minutes / 15), health: minutes >= 30 ? 1 : 0 };
    default: return unchanged;
  }
}
