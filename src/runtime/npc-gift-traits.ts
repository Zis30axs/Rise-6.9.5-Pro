import type { StoryAction, WorldState } from '../frontend/types';
import { INVENTORY_ITEM_LIMIT, MUTSUMI_CUCUMBER_ITEM_ID, getStoreItem } from './convenience-store';
import { PROTAGONISTS, type ProtagonistId } from './dual-protagonists';
import { resolveNpcTraits } from './npc-traits';
import { worldSceneRoster } from './world-presence';

export const MUTSUMI_NPC_ID = 'bang-mutsumi';
export const MUTSUMI_CUCUMBER_TRAIT_ID = 'mutsumi_daily_cucumber';
export const MUTSUMI_CUCUMBER_MIN_AFFINITY = 60;
export const MUTSUMI_CUCUMBER_PROBABILITY = 0.45;
export const MAX_NPC_GIFT_DAILY_RECORDS = 32;

export interface NpcDailyGiftRecord {
  lastMetDay: number;
  lastOfferDay: number | null;
  lastClaimedDay: number | null;
  lastClaimTurnId: string | null;
}

export interface NpcGiftDailyState {
  records: Record<string, NpcDailyGiftRecord>;
}

export interface NpcTraitGiftOffer {
  npcId: string;
  npcName: string;
  contactId: string;
  traitId: string;
  traitTitle: string;
  itemId: string;
  itemName: string;
  quantity: number;
  affinity: number;
  probability: number;
}

export interface NpcGiftOpportunity {
  allowed: boolean;
  firstMeetingInRange: boolean;
  offers: NpcTraitGiftOffer[];
}

function recordKey(owner: ProtagonistId, npcId = MUTSUMI_NPC_ID, traitId = MUTSUMI_CUCUMBER_TRAIT_ID): string {
  return `${owner}:${npcId}:${traitId}`;
}

export function createNpcGiftDailyState(): NpcGiftDailyState {
  return { records: {} };
}

function fail(detail: string): never {
  throw new Error(`NPC特质每日赠礼记录无效：${detail}。`);
}

function dayNumber(value: unknown, detail: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 365000) fail(detail);
  return value;
}

export function parseNpcGiftDailyState(value: unknown): NpcGiftDailyState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('顶层结构');
  const keys = Object.keys(value);
  if (keys.length !== 1 || keys[0] !== 'records') fail('字段列表');
  const rawRecords = (value as { records: unknown }).records;
  if (!rawRecords || typeof rawRecords !== 'object' || Array.isArray(rawRecords)) fail('records');
  const entries = Object.entries(rawRecords as Record<string, unknown>);
  if (entries.length > MAX_NPC_GIFT_DAILY_RECORDS) fail('records 数量');
  const parsed: Record<string, NpcDailyGiftRecord> = {};
  for (const [key, rawRow] of entries) {
    if (!/^(soyo|sakiko|emma|renako):[a-z0-9-]+:[a-z0-9_-]+$/.test(key)) fail(`记录键 ${key}`);
    if (!rawRow || typeof rawRow !== 'object' || Array.isArray(rawRow)) fail(`${key} 条目`);
    const row = rawRow as Record<string, unknown>;
    const rowKeys = Object.keys(row);
    const expected = ['lastMetDay', 'lastOfferDay', 'lastClaimedDay', 'lastClaimTurnId'];
    if (rowKeys.length !== expected.length || expected.some(field => !Object.hasOwn(row, field))) fail(`${key} 字段`);
    const lastMetDay = dayNumber(row.lastMetDay, `${key}.lastMetDay`);
    const lastOfferDay = row.lastOfferDay === null ? null : dayNumber(row.lastOfferDay, `${key}.lastOfferDay`);
    const lastClaimedDay = row.lastClaimedDay === null ? null : dayNumber(row.lastClaimedDay, `${key}.lastClaimedDay`);
    const lastClaimTurnId = row.lastClaimTurnId === null ? null
      : (typeof row.lastClaimTurnId === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(row.lastClaimTurnId)
        ? row.lastClaimTurnId : fail(`${key}.lastClaimTurnId`));
    parsed[key] = { lastMetDay, lastOfferDay, lastClaimedDay, lastClaimTurnId };
  }
  return { records: parsed };
}

/** Deterministic 0..99 roll bound to scene seed, protagonist, day and trait. */
export function npcDailyGiftDraw(
  seed: string,
  owner: ProtagonistId,
  day: number,
  npcId = MUTSUMI_NPC_ID,
  traitId = MUTSUMI_CUCUMBER_TRAIT_ID,
): number {
  const input = `${seed}|${owner}|day:${day}|${npcId}|${traitId}`;
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 100;
}

function activeOwner(state: WorldState): ProtagonistId {
  const active = state.protagonists?.accounts.active;
  return active && PROTAGONISTS.includes(active) ? active : 'soyo';
}

function findMutsumiTalkableContact(state: WorldState) {
  const inRange = worldSceneRoster(state).some(entry => entry.person.id === MUTSUMI_NPC_ID && entry.canTalk);
  if (!inRange) return null;
  const contact = state.contacts.find(row => row.id === MUTSUMI_NPC_ID || row.sourcePersonId === MUTSUMI_NPC_ID);
  return contact ? { contact, inRange } : null;
}

/** Evaluate whether Mutsumi's daily first-meeting cucumber gift is active this turn. */
export function npcGiftOpportunity(state: WorldState, replayTurnId?: string): NpcGiftOpportunity {
  const trait = resolveNpcTraits({ id: MUTSUMI_NPC_ID }).find(item => item.id === MUTSUMI_CUCUMBER_TRAIT_ID);
  const item = getStoreItem(MUTSUMI_CUCUMBER_ITEM_ID);
  if (!trait || !item) return { allowed: false, firstMeetingInRange: false, offers: [] };
  const owner = activeOwner(state);
  const key = recordKey(owner);
  const saved = state.npcGiftDaily?.records[key];
  // Support idempotent replay verification of an already-committed gift turn.
  if (replayTurnId && saved?.lastClaimTurnId === replayTurnId) {
    const contact = state.contacts.find(row => row.id === MUTSUMI_NPC_ID || row.sourcePersonId === MUTSUMI_NPC_ID);
    return {
      allowed: true,
      firstMeetingInRange: true,
      offers: [{
        npcId: MUTSUMI_NPC_ID,
        npcName: contact?.name ?? '若叶睦',
        contactId: contact?.id ?? MUTSUMI_NPC_ID,
        traitId: trait.id,
        traitTitle: trait.title,
        itemId: item.id,
        itemName: item.name,
        quantity: 1,
        affinity: contact?.affinity ?? MUTSUMI_CUCUMBER_MIN_AFFINITY,
        probability: MUTSUMI_CUCUMBER_PROBABILITY,
      }],
    };
  }
  const present = findMutsumiTalkableContact(state);
  if (!present) return { allowed: false, firstMeetingInRange: false, offers: [] };
  const alreadyMetToday = !!saved && saved.lastMetDay >= state.clock.day;
  const alreadyClaimedToday = !!saved && saved.lastClaimedDay !== null && saved.lastClaimedDay >= state.clock.day;
  const firstMeetingInRange = !alreadyMetToday;
  if (!firstMeetingInRange || alreadyClaimedToday) {
    return { allowed: false, firstMeetingInRange: false, offers: [] };
  }
  if (present.contact.affinity < MUTSUMI_CUCUMBER_MIN_AFFINITY) {
    return { allowed: false, firstMeetingInRange: true, offers: [] };
  }
  const owned = state.inventory.find(entry => entry.itemId === item.id)?.quantity ?? 0;
  if (owned >= INVENTORY_ITEM_LIMIT) {
    return { allowed: false, firstMeetingInRange: true, offers: [] };
  }
  const seed = state.scene?.seed ?? 'novel-world-v1';
  const threshold = Math.round(MUTSUMI_CUCUMBER_PROBABILITY * 100);
  if (npcDailyGiftDraw(seed, owner, state.clock.day) >= threshold) {
    return { allowed: false, firstMeetingInRange: true, offers: [] };
  }
  return {
    allowed: true,
    firstMeetingInRange: true,
    offers: [{
      npcId: MUTSUMI_NPC_ID,
      npcName: present.contact.name,
      contactId: present.contact.id,
      traitId: trait.id,
      traitTitle: trait.title,
      itemId: item.id,
      itemName: item.name,
      quantity: 1,
      affinity: present.contact.affinity,
      probability: MUTSUMI_CUCUMBER_PROBABILITY,
    }],
  };
}

/** Commit daily meeting/gift consumption onto the returned WorldState snapshot. */
export function acknowledgeNpcGiftDaily(
  before: WorldState,
  committed: WorldState,
  actions: readonly StoryAction[],
  turnId: string,
  replayTurnId?: string,
): WorldState {
  if (replayTurnId) {
    return before.npcGiftDaily ? { ...committed, npcGiftDaily: structuredClone(before.npcGiftDaily) } : committed;
  }
  const baseRecords = structuredClone(before.npcGiftDaily?.records ?? {});
  const owner = activeOwner(before);
  const key = recordKey(owner);
  const prev = baseRecords[key];
  const day = before.clock.day;
  const gifted = actions.find(
    (action): action is Extract<StoryAction, { type: 'npc_trait_gift' }> =>
      action.type === 'npc_trait_gift' && action.npcId === MUTSUMI_NPC_ID && action.traitId === MUTSUMI_CUCUMBER_TRAIT_ID,
  );
  const inRangeBefore = worldSceneRoster(before).some(entry => entry.person.id === MUTSUMI_NPC_ID && entry.canTalk);
  if (!inRangeBefore && !gifted) {
    return Object.keys(baseRecords).length ? { ...committed, npcGiftDaily: { records: baseRecords } } : committed;
  }
  const opportunity = npcGiftOpportunity(before);
  const lastMetDay = Math.max(prev?.lastMetDay ?? 0, day);
  const lastOfferDay = opportunity.allowed || gifted ? day : (prev?.lastOfferDay ?? null);
  const lastClaimedDay = gifted ? day : (prev?.lastClaimedDay ?? null);
  const lastClaimTurnId = gifted ? turnId : (prev?.lastClaimTurnId ?? null);
  baseRecords[key] = { lastMetDay, lastOfferDay, lastClaimedDay, lastClaimTurnId };
  return { ...committed, npcGiftDaily: { records: baseRecords } };
}

export const NPC_TRAIT_GIFT_PROTOCOL_RULE =
  '【特质每日赠礼行动格式】当本轮 npcGiftOpportunity.allowed 为 true 且主角在对话中自然收下对方递来的物品时，在 world_actions 提交 {"type":"npc_trait_gift","npcId":"bang-mutsumi","itemId":"mutsumi-cucumber","quantity":1,"traitId":"mutsumi_daily_cucumber","reason":"今日首次当面相遇时的简短原因"}。程序将实时把 1 根若叶睦种的小黄瓜放入当前主角背包。';

export function npcGiftPromptInstruction(opportunity: NpcGiftOpportunity): string {
  if (!opportunity.allowed || !opportunity.offers.length) {
    return '【人物特质每日赠礼未触发】本轮禁止输出 npc_trait_gift 行动，也不得仅靠正文凭空写出获得若叶睦送的小黄瓜并增加背包库存。';
  }
  const offer = opportunity.offers[0]!;
  return `${NPC_TRAIT_GIFT_PROTOCOL_RULE}\n【人物特质每日赠礼已触发】${offer.npcName}（${offer.npcId}）与当前主角好感度较高（${offer.affinity}），且处于今日第一次面对面相遇，特质「${offer.traitTitle}」（${offer.traitId}）的今日概率判定已通过（${Math.round(offer.probability * 100)}% 触发）。请在 <story> 中贴合她寡言而体贴的性格自然描写她顺手递来 1 根自家栽种的「${offer.itemName}」（itemId: ${offer.itemId}），并在 <world_actions> 输出 {"type":"npc_trait_gift","npcId":"${offer.npcId}","itemId":"${offer.itemId}","quantity":${offer.quantity},"traitId":"${offer.traitId}","reason":"今日首次当面相遇时收下她递来的小黄瓜"}；只有当主角明确当场拒收时才省略该行动。禁止修改数量或重复领取。`;
}
