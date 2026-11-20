import type { WorldState } from '../frontend/types';
import { awaitingLivehouseSet, takiOnDuty } from './livehouse-visit';
import rulesData from './affinity-location-rules.json' with { type: 'json' };
import { AFFINITY_TIERS } from './affinity-tiers';
import { gameDateISO } from './game-calendar';
import { dayPhase } from './day-phase';
import type { WeatherId } from './weather';

interface Reaction {
  from?: string;
  through?: string;
  onlyPlace?: string;
  afterClosing?: boolean;
  condition?: string;
  text: string;
}

interface LocationRule {
  characterId: string;
  places: readonly string[];
  occasion: string;
  reactions: readonly Reaction[];
  inactiveReason?: string;
  placeOccasions?: Partial<Record<string, string>>;
  sceneCondition?: string;
  program?: { place: string; dates: readonly string[]; opens: number; closes: number; departureMinutes: number };
  placeEvents?: Partial<Record<string, readonly string[]>>;
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
    case 'sunny-afternoon': return hour >= 12 && hour < 17 && (weather === 'sunny' || weather === 'hot');
    case 'end-of-ring-shift': return hour === 21;
    case 'evening-view': return hour >= 19 && hour < 21 && (weather === 'sunny' || weather === 'hot');
    case 'starry-night': return phase === 'night' && (weather === 'sunny' || weather === 'hot');
    default: throw new Error('未知的地点人设条件：' + condition);
  }
}

/** Called only for a contact in talking range in the authoritative scene. */
export function affinityLocationNotes(characterId: string, tier: string, place: string, hour: number, weather: WeatherId, currentEvents: readonly string[] = [], timing?: Pick<WorldState['clock'], 'day' | 'minute'>, activity?: 'sakiko-office-work' | 'wakaba-gardening'): string[] {
  const current = rank.get(tier);
  if (current === undefined) return [];
  const notes: string[] = [];
  for (const rule of affinityLocationRules) {
    if (rule.characterId !== characterId || !rule.places.includes(place)
      || !matchesCondition(rule.placeConditions?.[place], hour, weather)) continue;
    if (rule.sceneCondition) {
      if (!timing) continue;
      const clock = { ...timing, hour };
      if (rule.sceneCondition === 'sakiko-office-work' || rule.sceneCondition === 'wakaba-gardening') {
        if (activity !== rule.sceneCondition) continue;
      } else if (rule.sceneCondition === 'working-shift') {
        if (!takiOnDuty(clock)) continue;
      } else if (rule.sceneCondition === 'before-set') {
        if (!awaitingLivehouseSet(characterId, clock)) continue;
      } else throw new Error('未知的地点活动条件：' + rule.sceneCondition);
    }
    let afterClosing = false;
    const program = rule.program;
    if (program?.place === place) {
      if (!timing || !program.dates.includes(gameDateISO(timing.day))) continue;
      const minute = hour * 60 + timing.minute;
      if (minute < program.opens || minute >= program.closes + program.departureMinutes) continue;
      afterClosing = minute >= program.closes;
    }
    const terms = rule.placeEvents?.[place];
    if (terms && !currentEvents.some(title => terms.some(term => title.toLowerCase().includes(term.toLowerCase())))) continue;
    const lines = rule.reactions.filter(row =>
      (!row.onlyPlace || row.onlyPlace === place)
      && !!row.afterClosing === afterClosing
      && (!row.from || current >= rank.get(row.from)!)
      && (!row.through || current <= rank.get(row.through)!)
      && matchesCondition(row.condition, hour, weather),
    );
    if (lines.length) notes.push((rule.placeOccasions?.[place] ?? rule.occasion) + '：' + lines.map(row => row.text).join('；') + '。');
  }
  return notes;
}
