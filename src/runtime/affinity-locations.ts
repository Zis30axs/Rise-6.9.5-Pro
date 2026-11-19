import rulesData from './affinity-location-rules.json' with { type: 'json' };
import { AFFINITY_TIERS } from './affinity-tiers';
import { dayPhase } from './day-phase';
import type { WeatherId } from './weather';

interface Reaction {
  from?: string;
  through?: string;
  onlyPlace?: string;
  condition?: string;
  text: string;
}

interface LocationRule {
  characterId: string;
  places: readonly string[];
  occasion: string;
  reactions: readonly Reaction[];
  placeConditions?: Partial<Record<string, string>>;
}

export const affinityLocationRules: readonly LocationRule[] = rulesData;
const rank = new Map(AFFINITY_TIERS.map((tier, index) => [tier.id, index]));

function matchesCondition(condition: string | undefined, hour: number, weather: WeatherId) {
  const phase = dayPhase(hour);
  switch (condition) {
    case undefined: return true;
    case 'dusk': return phase === 'dusk';
    case 'night': return phase === 'night';
    case 'snow-or-dusk': return weather === 'snow' || phase === 'dusk';
    case 'sunlight': return phase === 'day' && (weather === 'sunny' || weather === 'hot');
    case 'afternoon': return hour >= 12 && hour < 17;
    case 'starry-night': return phase === 'night' && (weather === 'sunny' || weather === 'hot');
    default: throw new Error('未知的地点人设条件：' + condition);
  }
}

/** Called only for a contact in talking range in the authoritative scene. */
export function affinityLocationNotes(characterId: string, tier: string, place: string, hour: number, weather: WeatherId): string[] {
  const current = rank.get(tier);
  if (current === undefined) return [];
  const notes: string[] = [];
  for (const rule of affinityLocationRules) {
    if (rule.characterId !== characterId || !rule.places.includes(place)
      || !matchesCondition(rule.placeConditions?.[place], hour, weather)) continue;
    const lines = rule.reactions.filter(row =>
      (!row.onlyPlace || row.onlyPlace === place)
      && (!row.from || current >= rank.get(row.from)!)
      && (!row.through || current <= rank.get(row.through)!)
      && matchesCondition(row.condition, hour, weather),
    );
    if (lines.length) notes.push(rule.occasion + '：' + lines.map(row => row.text).join('；') + '。');
  }
  return notes;
}
