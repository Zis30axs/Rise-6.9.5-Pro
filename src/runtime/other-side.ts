import type { WorldState, OtherSideEvent } from '../frontend/types';
import { PROTAGONISTS, PROTAGONIST_PERSON_ID_LIST, type ProtagonistId } from './dual-protagonists';
import { activeProtagonist, gameMinute, personState, protagonistNames } from './protagonist-world';
import { getCampusInterior } from './campus-interiors';
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
  const now = gameMinute(state);
  const override = state.protagonists?.otherSideNpc?.[id];
  const validOverride = override && override.at <= now && now < override.until ? override : null;
  if (validOverride) {
    const locationId = validOverride.locationId;
    if (getCampusInterior(locationId)) return { locationId, kind: 'room', x: 0, z: 0 };
    const landmark = sceneLandmarks.find(p => sceneLocationId(p.id) === locationId);
    if (landmark) return { locationId, kind: 'outdoor', x: landmark.x, z: landmark.z };
    return { locationId, kind: 'room', x: 0, z: 0 };
  }
  const present = residentPresence(id, state.clock);
  if (!present || !present.available) return null;
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

/** Expiring NPC overrides are only applied while their source scene can still be verified. */
export function activeOtherSideNpcLocation(state: WorldState, id: string) {
  const value = state.protagonists?.otherSideNpc?.[id];
  const minute = gameMinute(state);
  return value && value.at <= minute && minute < value.until ? value : null;
}

const stamp = (minute: number) => `第 ${Math.floor(minute / 1440) + 1} 天 ${String(Math.floor(minute % 1440 / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
const positionEqual = (a: WorldState, b: WorldState, id: ProtagonistId) => {
  const left = personState(a, id), right = personState(b, id);
  return JSON.stringify([left.locationId, left.scene, left.interior]) ===
    JSON.stringify([right.locationId, right.scene, right.interior]);
};
const affect = (current: number, delta: number, max = 100) => Math.round(Math.max(0, Math.min(max, current + delta)) * 100) / 100;

/** Only a local doorway or short outdoor step can move a protagonist without an explicit time-costed travel. */
function moveLocally(state: WorldState, owner: ProtagonistId, locationId: string) {
  const person = personState(state, owner);
  if (person.locationId === locationId) return;
  const fromRoom = person.interior && getCampusInterior(person.interior.roomId);
  const toRoom = getCampusInterior(locationId);
  if (fromRoom && !toRoom && locationId === fromRoom.parentLocationId && person.scene) {
    person.interior = null;
    person.locationId = locationId;
    person.scene.encounterId = null;
    return;
  }
  if (toRoom && !fromRoom && person.locationId === toRoom.parentLocationId && person.scene
    && Math.hypot(person.scene.x - toRoom.entrance.x, person.scene.z - toRoom.entrance.z) <= 80) {
    const area = getSceneArea(toRoom.entrance.x, toRoom.entrance.z);
    if (!area || sceneLocationId(area.id) !== toRoom.parentLocationId) throw new Error('旁线室内入口未连接到权威地图');
    person.scene = { x: toRoom.entrance.x, z: toRoom.entrance.z, yaw: toRoom.entrance.yaw,
      areaId: area.id, seed: person.scene.seed, encounterId: null };
    person.interior = { roomId: toRoom.id, ...toRoom.spawn, activityId: null, lastRest: null, lastStudy: null };
    person.locationId = toRoom.id;
    return;
  }
  const arrival = sceneLandmarks.find(landmark => sceneLocationId(landmark.id) === locationId);
  if (!fromRoom && !toRoom && person.scene && arrival &&
    Math.hypot(person.scene.x - arrival.x, person.scene.z - arrival.z) <= 18) {
    const area = getSceneArea(arrival.x, arrival.z);
    if (!area || sceneLocationId(area.id) !== locationId) throw new Error('旁线地点不在地图中');
    person.scene = { x: arrival.x, z: arrival.z, yaw: 0, areaId: area.id,
      seed: person.scene.seed, encounterId: null };
    person.locationId = locationId;
    return;
  }
  throw new Error(`旁线中的${protagonistNames[owner]}不能无消耗瞬移至${locationId}；请先由游戏时间结算行程`);
}

function crossViewTextMessage(state: WorldState, eventId: string, from: ProtagonistId, to: ProtagonistId, text: string) {
  const p = state.protagonists!;
  const rows = p.conversations ??= [];
  if (rows.some(row => row.id === eventId)) throw new Error('旁线短信 ID 冲突');
  const sender = personState(state, from), receiver = personState(state, to), at = gameMinute(state);
  if (rows.length >= 10000 || receiver.phone.length >= 200 || p.devices[to].notifications.length >= 200)
    throw new Error('旁线短信或通知已达到容量上限');
  const npcId = `protagonist-${from}`, otherContact = `protagonist-${to}`;
  const saveContact = (person: typeof sender, id: string, name: string) => {
    if (person.contacts.some(row => row.id === id)) return;
    if (person.contacts.length >= 50) throw new Error('旁线短信联系人已满');
    person.contacts.push({ id, name, tag: '另一位主角', summary: '共享同一个世界的另一位主角。',
      affinity: 0, status: '手机联系', portraitId: 'deepseek', sourcePersonId: null, isMain: true });
  };
  saveContact(receiver, npcId, protagonistNames[from]);
  saveContact(sender, otherContact, protagonistNames[to]);
  receiver.phone.push({ id: eventId, npcId, text, read: false, at: stamp(at) });
  sender.journal.push({ id: `sent:${eventId}`, at: stamp(at), text: `向${protagonistNames[to]}发送短信：“${text}”；发送不代表对方已经阅读。`.slice(0, 1000) });
  rows.push({ id: eventId, from, to, at, text, replyTo: null, expectsReply: false });
  p.devices[to].notifications.push({ id: `message:${eventId}`, at, read: false,
    text: `${protagonistNames[from]}发来新消息。` });
  sender.journal = sender.journal.slice(-100);
}

/**
 * Commit AFTER the foreground actions and automatic-life settlement.
 * All mutations occur on a private copy; the caller validates and persists once.
 */
export function commitOtherSideEvents(before: WorldState, after: WorldState, events: readonly OtherSideEvent[],
  turnId: string, returnStory?: string): WorldState {
  if (!after.protagonists) return after;
  const next: WorldState = structuredClone(after), p = next.protagonists!;
  const oldTurn = before.protagonists?.narrativeTurn ?? 0;
  if (p.otherSideHistory?.some(row => row.id === turnId)) return next;
  p.narrativeTurn = oldTurn + 1;
  if (!events.length) return next;
  const opportunity = otherSideOpportunity(before);
  if (!opportunity.allowed) throw new Error('旁线机会已失效，本轮未保存');
  const time = gameMinute(next), receipt = { id: turnId, at: time, turn: oldTurn + 1,
    protagonists: [...new Set(events.flatMap(event => event.protagonists))] };
  const eventIds = new Set<string>();
  const beat: NonNullable<WorldState['story'][number]['otherSideBeats']> = [];
  for (const [index, event] of events.entries()) {
    const eventId = `${turnId}:side:${index}`;
    if (eventIds.has(eventId)) throw new Error('旁线记录 ID 冲突');
    eventIds.add(eventId);
    for (const owner of event.protagonists) {
      if (!positionEqual(before, next, owner)) throw new Error('旁线与后台已结算的位置变化冲突，请重新生成');
      if (p.backgroundLife?.people[owner].pending) throw new Error('旁线人物正在执行后台安排，不能额外结算动作');
    }
    for (const owner of event.protagonists) {
      if (event.locationId) moveLocally(next, owner, event.locationId);
      const personal = personState(next, owner);
      if (personal.story.some(row => row.id === eventId)) throw new Error('旁线个人剧情 ID 冲突');
      for (const [key, value] of Object.entries(event.variables?.[owner] ?? {})) {
        const field = key as keyof NonNullable<OtherSideEvent['variables']>[typeof owner];
        if (field === 'foodEnergy') personal.player.foodEnergy = affect(personal.player.foodEnergy, value, 3000);
        else if (typeof personal.player[field] === 'number') personal.player[field] = affect(personal.player[field], value);
      }
      personal.story.push({ id: eventId, role: 'assistant', text: event.text });
      personal.story = personal.story.slice(-40);
      personal.journal.push({ id: eventId, at: stamp(time),
        text: `与此同时，${event.text}`.slice(0, 1000) });
      personal.journal = personal.journal.slice(-100);
    }
    for (const [npcIndex, npc] of (event.npcs ?? []).entries()) {
      const existing = npcAt(before, npc.id);
      const nextLocation = npc.locationId ?? (event.locationId ?? existing?.locationId);
      if (!existing || !nextLocation) throw new Error('旁线 NPC 不在已确认的场景中');
      if (npc.locationId && npc.locationId !== existing.locationId && npc.locationId !== event.locationId)
        throw new Error('旁线 NPC 不能离开在场主角单独瞬移');
      const npcStatus = npc.status ?? p.otherSideNpc?.[npc.id]?.status ?? '正在参与附近的日常活动';
      p.otherSideNpc ??= {};
      p.otherSideNpc[npc.id] = { locationId: nextLocation, at: time,
        until: Math.min(time + 45, 525599999), status: npcStatus };
      for (const owner of event.protagonists) {
        const personal = personState(next, owner);
        const contact = personal.contacts.find(row => row.id === npc.id || row.sourcePersonId === npc.id);
        if (!contact) continue;
        if (npc.status) contact.status = npc.status;
        if (npc.affinityDelta) contact.affinity = Math.max(-100, Math.min(100, contact.affinity + npc.affinityDelta));
      }
      if (npcIndex >= 5) throw new Error('旁线 NPC 数量无效');
    }
    for (const [msgIndex, message] of (event.messages ?? []).entries()) {
      crossViewTextMessage(next, `${eventId}:sms:${msgIndex}`, message.from, message.to, message.text);
    }
    beat.push({ protagonists: event.protagonists, text: event.text });
  }
  const activeStory = next.story.find(row => row.id === turnId && row.role === 'assistant');
  if (!activeStory) throw new Error('当前剧情尚未写入，无法承接旁线');
  activeStory.otherSideBeats = beat;
  if (returnStory) activeStory.returnStory = returnStory;
  p.otherSideHistory ??= [];
  p.otherSideHistory.push(receipt);
  p.otherSideHistory = p.otherSideHistory.slice(-100);
  p.otherSideNpc = Object.fromEntries(Object.entries(p.otherSideNpc ?? {}).filter(([, value]) => value.until > time).slice(-40));
  p.revision++;
  return next;
}
