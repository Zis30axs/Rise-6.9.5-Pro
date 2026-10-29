import type { StoryAction, WorldState } from '../frontend/types';
import { PROTAGONISTS, PROTAGONIST_PERSON_IDS, type ProtagonistId } from './dual-protagonists';
import { campusInteriors } from './campus-interiors';
import { sceneLandmarks } from '../frontend/scene-layout';
import { sceneLocationId } from './scene-context';

/** "Go home" follows the selected character, not the shared outdoor housing district. */
export const protagonistHomeRooms: Readonly<Record<ProtagonistId, string>> = Object.freeze({
  soyo: 'dorm-room',
  sakiko: 'toyokawa-house',
  emma: 'emma-yuki-home',
  renako: 'amaori-family-home',
});

export interface GamePurchase {
  id: string;
  owner: ProtagonistId;
  game: string;
  benefit: string;
  amountYen: number;
  at: number;
}

export type SocialInvitationDecision = 'accepted' | 'declined' | 'deferred';
export interface SocialInvitation {
  id: string;
  owner: ProtagonistId;
  targetId: string;
  targetName: string;
  source: 'meeting' | 'sms';
  locationId: string;
  day: number;
  time: string;
  message: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: number;
  messageId: string | null;
  response: string | null;
}

const purchaseLimit = 200;
const invitationLimit = 120;
const ID_RE = /^[A-Za-z0-9][\w.:-]{0,127}$/;
const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const PLACE_IDS = new Set([
  ...campusInteriors.map(room => room.id),
  ...sceneLandmarks.map(landmark => sceneLocationId(landmark.id)),
]);

function nowMinute(state: WorldState): number {
  return (state.clock.day - 1) * 1440 + state.clock.hour * 60 + state.clock.minute;
}
function invalid(message: string): never { throw new Error('自然互动记录无效：' + message); }
function record(raw: unknown, keys: readonly string[], message: string): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return invalid(message);
  const row = raw as Record<string, unknown>;
  if (Object.keys(row).length !== keys.length || Object.keys(row).some(key => !keys.includes(key))) return invalid(message);
  return row;
}
function num(value: unknown, low: number, high: number, message: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < low || (value as number) > high) return invalid(message);
  return value as number;
}
function str(value: unknown, length: number, message: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > length || /[\u0000-\u001f]/.test(value)) return invalid(message);
  return value;
}
function actor(value: unknown): ProtagonistId {
  if (!PROTAGONISTS.includes(value as ProtagonistId)) return invalid('主角 ID');
  return value as ProtagonistId;
}

/** Only in-universe Appie Pay expenses: no external payment or real-game receipt is implied. */
export function parseGamePurchases(raw: unknown, now: number): GamePurchase[] {
  if (!Array.isArray(raw) || raw.length > purchaseLimit) return invalid('游戏消费数量');
  const used = new Set<string>();
  return raw.map((value, index) => {
    const path = '游戏消费 ' + (index + 1);
    const r = record(value, ['id', 'owner', 'game', 'benefit', 'amountYen', 'at'], path);
    const id = str(r.id, 128, path + ' ID');
    if (!ID_RE.test(id) || used.has(id)) return invalid(path + '重复 ID');
    used.add(id);
    return {
      id, owner: actor(r.owner),
      game: str(r.game, 80, path + '游戏'),
      benefit: str(r.benefit, 100, path + '虚拟权益'),
      amountYen: num(r.amountYen, 1, 100_000, path + '金额'),
      at: num(r.at, 0, now, path + '时间'),
    };
  });
}

export function parseSocialInvitations(raw: unknown, now: number): SocialInvitation[] {
  if (!Array.isArray(raw) || raw.length > invitationLimit) return invalid('邀约数量');
  const used = new Set<string>();
  return raw.map((value, index) => {
    const path = '邀约 ' + (index + 1);
    const hasTargetName = !!value && typeof value === 'object' && Object.hasOwn(value, 'targetName');
    const r = record(value, ['id','owner','targetId',...(hasTargetName ? ['targetName'] : []),'source','locationId','day','time','message','status','createdAt','messageId','response'], path);
    const id = str(r.id, 128, path + ' ID');
    if (!ID_RE.test(id) || used.has(id)) return invalid(path + '重复 ID');
    used.add(id);
    if (r.source !== 'meeting' && r.source !== 'sms') return invalid(path + '来源');
    if (r.status !== 'pending' && r.status !== 'accepted' && r.status !== 'declined') return invalid(path + '状态');
    const targetId = str(r.targetId, 128, path + '对象');
    if (!ID_RE.test(targetId)) return invalid(path + '对象 ID');
    const locationId = str(r.locationId, 80, path + '地点');
    if (!PLACE_IDS.has(locationId)) return invalid(path + '地点不存在');
    const time = str(r.time, 5, path + '时间');
    if (!TIME_RE.test(time)) return invalid(path + '时间格式');
    const messageId = r.messageId === null ? null : str(r.messageId, 128, path + '短信 ID');
    if (messageId !== null && (r.source !== 'sms' || !ID_RE.test(messageId))) return invalid(path + '短信引用');
    if (r.source === 'sms' && messageId === null) return invalid(path + '缺少短信引用');
    if (r.response !== null) str(r.response, 500, path + '回应');
    return {
      id, owner: actor(r.owner), targetId, targetName: hasTargetName ? str(r.targetName, 80, path + '姓名') : targetId,
      source: r.source, locationId, day: num(r.day, 1, 365000, path + '游戏日'), time,
      message: str(r.message, 500, path + '邀约内容'), status: r.status,
      createdAt: num(r.createdAt, 0, now, path + '创建时间'),
      messageId, response: r.response as string | null,
    };
  });
}

/** Stable short operation IDs leave room for the phone runtime's prefixes. */
export function narrativeOperationId(turnId: string, index: number): string {
  let h = 2166136261;
  for (const ch of turnId) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return 'story-' + turnId.slice(0, 24) + '-' + (h >>> 0).toString(16).padStart(8, '0') + '-' + index;
}
export function narrativeMessageId(turnId: string, index: number, toProtagonist: boolean): string {
  const id = narrativeOperationId(turnId, index);
  return (toProtagonist ? 'dual:' : 'npc:') + id;
}

/** Money has already been debited by the authoritative legacy reducer. */
export function recordGamePurchases(state: WorldState, actions: readonly StoryAction[], turnId: string): WorldState {
  const purchases = actions.filter((action): action is Extract<StoryAction, { type: 'game_topup' }> => action.type === 'game_topup');
  if (!purchases.length) return state;
  if (!state.protagonists || purchases.length !== 1) throw new Error('游戏消费必须由当前主角单笔结算');
  const next: WorldState = JSON.parse(JSON.stringify(state));
  const owner = next.protagonists!.accounts.active;
  const row = purchases[0]!;
  const id = turnId + ':game-topup';
  const saved = next.protagonists!.gamePurchases ?? [];
  if (saved.some(item => item.id === id)) return next;
  saved.push({ id, owner, game: row.game, benefit: row.benefit, amountYen: row.amountYen, at: nowMinute(next) });
  next.protagonists!.gamePurchases = saved.slice(-purchaseLimit);
  next.protagonists!.revision++;
  return next;
}

/** Caller sends the SMS through the same phone transaction as manual sending. */
export function recordSocialInvitations(state: WorldState, actions: readonly StoryAction[], turnId: string, resolveName: (id: string) => string | null = () => null): WorldState {
  const accepted = actions.filter((action): action is Extract<StoryAction, { type: 'social_invite' }> => action.type === 'social_invite');
  if (!accepted.length) return state;
  if (!state.protagonists || accepted.length > 3) throw new Error('每轮最多三项邀约，且需要当前主角');
  const next: WorldState = JSON.parse(JSON.stringify(state));
  const owner = next.protagonists!.accounts.active;
  const rows = next.protagonists!.socialInvitations ?? [];
  for (const [index, action] of actions.entries()) {
    if (action.type !== 'social_invite') continue;
    const id = turnId + ':invite:' + index;
    if (rows.some(row => row.id === id)) continue;
    const contact = next.contacts.find(row => row.id === action.targetId || row.sourcePersonId === action.targetId);
    const toProtagonist = !!contact && PROTAGONISTS.some(id => contact.id === 'protagonist-' + id ||
      !!PROTAGONIST_PERSON_IDS[id] && (contact.id === PROTAGONIST_PERSON_IDS[id] || contact.sourcePersonId === PROTAGONIST_PERSON_IDS[id]));
    const whenMinute = (action.day - 1) * 1440 + Number(action.time.slice(0, 2)) * 60 + Number(action.time.slice(3));
    if (whenMinute <= nowMinute(next)) throw new Error('预定的邀约时间已经过去了。');
    rows.push({
      id, owner, targetId: action.targetId, targetName: (contact?.name ?? resolveName(action.targetId) ?? action.targetId).slice(0, 80), source: action.source,
      locationId: action.locationId, day: action.day, time: action.time, message: action.message,
      status: action.outcome, createdAt: nowMinute(next),
      messageId: action.source === 'sms' ? narrativeMessageId(turnId, index, toProtagonist) : null,
      response: action.source === 'meeting' ? action.responseQuote ?? null : null,
    });
  }
  next.protagonists!.socialInvitations = rows.slice(-invitationLimit);
  next.protagonists!.revision++;
  return next;
}

/** Apply an NPC/other-protagonist decision only to the invitation sent in this thread. */
export function applySocialInvitationReply(state: WorldState, messageId: string,
  decision: SocialInvitationDecision | undefined, response: string | null): WorldState {
  if (!decision) return state;
  const next: WorldState = JSON.parse(JSON.stringify(state));
  const invitation = next.protagonists?.socialInvitations?.find(row => row.messageId === messageId);
  if (!invitation || invitation.status !== 'pending' || response === null) throw new Error('邀约回应没有对应的待处理消息');
  if (decision === 'accepted') invitation.status = 'accepted';
  if (decision === 'declined') invitation.status = 'declined';
  invitation.response = response.slice(0, 500);
  next.protagonists!.revision++;
  return next;
}
