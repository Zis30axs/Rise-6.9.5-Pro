import type { WorldState } from '../frontend/types';
import { PROTAGONISTS, PROTAGONIST_PERSON_ID_LIST, type ProtagonistId } from './dual-protagonists';
import { activeProtagonist, gameMinute, personState, protagonistNames } from './protagonist-world';
import { allResidentCast, residentPresence } from './npc-cast';
import { gameCalendarOccasions } from './japan-calendar-events';
import { scenePersonAnchors, getSceneArea, sceneLocationId } from './scene-context';
import { sceneLandmarks } from '../frontend/scene-layout';
import relationLore from '../worldbook/story-arcs-relationships.json' with { type: 'json' };
import watanareLore from '../worldbook/watanare-story-arcs.json' with { type: 'json' };

/** Independently sampled cross-view story chances; game state, not Date.now(), is authoritative. */
export const OTHER_SIDE_RULES = Object.freeze({
  chance: 0.22,
  afterRecentInteractionChance: 0.11,
  counts: [0.84, 0.13, 0.03] as const,
  cooldownMinutes: 90,
  cooldownStoryTurns: 5,
  maxPerDay: 2,
  maxNpcsPerGroup: 5,
});
export const OTHER_SIDE_CATEGORIES: Readonly<Record<ProtagonistId, readonly string[]>> = Object.freeze({
  soyo: ['mygo', 'crychic', 'bang-dream'],
  sakiko: ['ave-mujica', 'crychic', 'bang-dream'],
  emma: ['majo'],
  renako: ['watanare'],
});

const hash = (seed: string): number => {
  let n = 2166136261;
  for (let i = 0; i < seed.length; i++) n = Math.imul(n ^ seed.charCodeAt(i), 16777619);
  return n >>> 0;
};
const random = (seed: string, phase: string) => hash(seed + ':' + phase) / 4294967296;
const sample = <T>(items: readonly { value: T; weight: number }[], seed: string): T => {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let ticket = random(seed, 'choose') * total;
  for (const item of items) { ticket -= item.weight; if (ticket < 0) return item.value; }
  return items[items.length - 1]!.value;
};
const point = (state: WorldState, owner: ProtagonistId) => {
  const person = personState(state, owner);
  return person.interior ? { kind: 'room', locationId: person.interior.roomId, x: person.interior.x, z: person.interior.z }
    : person.scene ? { kind: 'outdoor', locationId: sceneLocationId(person.scene.areaId), x: person.scene.x, z: person.scene.z }
      : { kind: 'unknown', locationId: person.locationId, x: 0, z: 0 };
};

/** Exact room, or the same outdoor map area AND actually close, never just 'same district'. */
export function sameOtherSidePlace(state: WorldState, a: ProtagonistId, b: ProtagonistId): boolean {
  const x = point(state, a), y = point(state, b);
  if (x.kind === 'unknown' || x.kind !== y.kind || x.locationId !== y.locationId) return false;
  return x.kind === 'room' || Math.hypot(x.x - y.x, x.z - y.z) <= 18;
}

const categoryForNpc = (id: string): string =>
  id.startsWith('majo-') ? 'majo' : id.startsWith('watanare-') ? 'watanare' : 'bang-dream';

function npcAt(state: WorldState, id: string): { locationId: string; kind: string; x: number; z: number } | null {
  const present = residentPresence(id, state.clock);
  if (!present || !present.available) return null;
  const now = gameMinute(state);
  const override = state.protagonists?.otherSideNpc?.[id];
  const validOverride = override && override.at <= now && now < override.until ? override : null;
  if (validOverride) {
    const room = validOverride.locationId.includes('-home') || validOverride.locationId.includes('-house') || validOverride.locationId.includes('residence')
      ? null : null; // Interior identification below uses the authored catalog.
    void room;
    const locationId = validOverride.locationId;
    const landmark = sceneLandmarks.find(p => sceneLocationId(p.id) === locationId);
    if (landmark) return { locationId, kind: 'outdoor', x: landmark.x, z: landmark.z };
    return { locationId, kind: 'room', x: 0, z: 0 };
  }
  if (!present.anchorId) return { locationId: present.locationId, kind: 'room', x: 0, z: 0 };
  const anchor = scenePersonAnchors.find(p => p.id === present.anchorId);
  const area = anchor && getSceneArea(anchor.x, anchor.z);
  return anchor && area ? { locationId: sceneLocationId(area.id), kind: 'outdoor', x: anchor.x + 0.6, z: anchor.z + 0.6 } : null;
}

/** Include only NPCs actually at the selected protagonists' place. NPCs cannot become viewpoints. */
function groupNpcs(state: WorldState, group: readonly ProtagonistId[]) {
  const owner = point(state, group[0]!);
  if (owner.kind === 'unknown') return [];
  return allResidentCast.flatMap(npc => {
    if (PROTAGONIST_PERSON_ID_LIST.includes(npc.id)) return [];
    const where = npcAt(state, npc.id);
    if (!where || where.kind !== owner.kind || where.locationId !== owner.locationId) return [];
    if (owner.kind === 'outdoor' && group.every(id => {
      const position = point(state, id);
      return Math.hypot(position.x - where.x, position.z - where.z) > 18;
    })) return [];
    const category = categoryForNpc(npc.id);
    const affinity = group.some(id => OTHER_SIDE_CATEGORIES[id].includes(category)) ? 4 : 1;
    return [{ id: npc.id, name: npc.name, locationId: where.locationId, category, weight: affinity }];
  }).sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id))
    .slice(0, OTHER_SIDE_RULES.maxNpcsPerGroup).map(({ weight: _weight, ...npc }) => npc);
}

const combinations = (candidates: readonly ProtagonistId[], size: number): ProtagonistId[][] => {
  if (!size) return [[]];
  return candidates.flatMap((id, index) =>
    combinations(candidates.slice(index + 1), size - 1).map(rest => [id, ...rest]));
};

export interface OtherSideOpportunity {
  allowed: boolean;
  probability: number;
  sampledCount: number;
  /** Same-place protagonists are ALWAYS combined into a single structural event. */
  groups: ProtagonistId[][];
  npcGroups: { protagonists: ProtagonistId[]; locationId: string; npcs: ReturnType<typeof groupNpcs> }[];
  eventHints: { calendar: string[]; relationships: string[]; interactionRecentlyOffered: boolean };
}

const nothing = (probability = OTHER_SIDE_RULES.chance): OtherSideOpportunity => ({
  allowed: false, probability, sampledCount: 0, groups: [], npcGroups: [],
  eventHints: { calendar: [], relationships: [], interactionRecentlyOffered: false },
});

export function otherSideOpportunity(state: WorldState): OtherSideOpportunity {
  const p = state.protagonists;
  if (!p) return nothing();
  const now = gameMinute(state), turn = p.narrativeTurn ?? 0;
  const history = p.otherSideHistory ?? [], last = history.at(-1);
  if (history.filter(row => Math.floor(row.at / 1440) === Math.floor(now / 1440)).length >= OTHER_SIDE_RULES.maxPerDay) return nothing();
  if (last && now - last.at < OTHER_SIDE_RULES.cooldownMinutes && turn - last.turn < OTHER_SIDE_RULES.cooldownStoryTurns) return nothing();
  const lastInteraction = [...(state.interactionEventRate?.checks ?? [])].reverse()
    .find(check => check.offered && now - check.at < 90);
  const chance = lastInteraction ? OTHER_SIDE_RULES.afterRecentInteractionChance : OTHER_SIDE_RULES.chance;
  // Deterministic per-save, per-narrative-turn: a refresh cannot re-roll.
  const seed = [state.clock.day, state.clock.hour, state.clock.minute, turn, p.revision, activeProtagonist(state),
    state.story.at(-1)?.id ?? 'opening'].join(':');
  if (random(seed, 'gate') >= chance) return nothing(chance);
  const eligible = PROTAGONISTS.filter(id => id !== activeProtagonist(state)
    && !p.backgroundLife?.people[id]?.pending
    && !sameOtherSidePlace(state, id, activeProtagonist(state)));
  if (!eligible.length) return nothing(chance);
  const roll = random(seed, 'count');
  const requested = roll < OTHER_SIDE_RULES.counts[0] ? 1
    : roll < OTHER_SIDE_RULES.counts[0] + OTHER_SIDE_RULES.counts[1] ? 2 : 3;
  const sampledCount = Math.min(requested, eligible.length);
  const options = combinations(eligible, sampledCount);
  const ranked = options.map(value => {
    let weight = 1;
    for (let i = 0; i < value.length; i++) for (let j = i + 1; j < value.length; j++) {
      if (sameOtherSidePlace(state, value[i]!, value[j]!)) weight += 15;
      else if (point(state, value[i]!).locationId === point(state, value[j]!).locationId) weight += 2;
    }
    const occasionIds = new Set(gameCalendarOccasions(state.clock.day).filter(e => e.kind === 'birthday').map(e => e.personId));
    for (const id of value) if (occasionIds.has(id)) weight += 3;
    return { value, weight };
  });
  const selected = sample(ranked, seed + ':subset');
  const groups: ProtagonistId[][] = [];
  for (const id of selected) {
    const together = groups.find(group => group.every(other => sameOtherSidePlace(state, id, other)));
    if (together) together.push(id); else groups.push([id]);
  }
  const npcGroups = groups.map(group => {
    const locationId = point(state, group[0]!).locationId;
    return { protagonists: group, locationId, npcs: groupNpcs(state, group) };
  });
  const occasions = gameCalendarOccasions(state.clock.day);
  const relevant = new Set<string>([...selected, ...npcGroups.flatMap(group => group.npcs.map(n => n.id))]);
  const calendar = occasions.filter(item => !item.personId || relevant.has(item.personId))
    .slice(0, 4).map(item => item.name);
  const relationships: string[] = [];
  if (selected.some(id => id === 'soyo' || id === 'sakiko')) {
    relationships.push(...relationLore.entries.filter(entry => entry.name.startsWith('乐队人物关系') || entry.name.startsWith('邦邦前史'))
      .slice(0, 2).map(entry => entry.name));
  }
  if (selected.includes('emma')) relationships.push(...relationLore.entries.filter(entry => entry.name.startsWith('魔裁旧关系'))
    .slice(0, 2).map(entry => entry.name));
  if (selected.includes('renako')) relationships.push(...watanareLore.entries.filter(entry => entry.name.startsWith('渡奈人物关系'))
    .slice(0, 2).map(entry => entry.name));
  return { allowed: true, probability: chance, sampledCount, groups, npcGroups,
    eventHints: { calendar, relationships, interactionRecentlyOffered: !!lastInteraction } };
}

/** Context only: model can decide to output NO off-screen event after receiving a chance. */
export function otherSidePromptContext(state: WorldState) {
  const result = otherSideOpportunity(state);
  return { ...result, categories: Object.fromEntries(
    result.groups.flat().map(id => [id, [...OTHER_SIDE_CATEGORIES[id]]])) };
}
