/**
 * Dual-protagonist prototype. Not wired into WorldState or ST-iPhonie yet.
 * No external payment services and no access to real device data.
 */
export const PROTAGONISTS = ['soyo', 'sakiko'] as const;
export type ProtagonistId = typeof PROTAGONISTS[number];
export type FictionalCardId = 'gpt' | 'claude' | 'gemini';
export const FICTIONAL_CARDS: readonly FictionalCardId[] = ['gpt', 'claude', 'gemini'];
export type PhoneOperation = 'inspect' | 'send_message' | 'change_calendar' | 'order_delivery' | 'buy';

export interface LedgerEntry {
  id: string;
  actor: ProtagonistId;
  card: FictionalCardId;
  deltaCents: number;
  note: string;
}
export interface AccessRecord {
  id: string;
  actor: ProtagonistId;
  owner: ProtagonistId;
  operation: PhoneOperation;
  authorized: boolean;
  detail: string;
  /** Game-time string supplied by the shared clock, never Date.now(). */
  at: string;
}
export interface ProtagonistAccount {
  id: ProtagonistId;
  deviceId: string;
  theme: 'soyo-soft' | 'sakiko-blue';
  cards: Record<FictionalCardId, number>;
}
export interface DualProtagonistLedger {
  active: ProtagonistId;
  people: Record<ProtagonistId, ProtagonistAccount>;
  ledger: LedgerEntry[];
  phoneAccess: AccessRecord[];
}
const limits = { balance: 100_000_000, entries: 10_000, detail: 240 };
const assertActor = (value: unknown): asserts value is ProtagonistId => {
  if (value !== 'soyo' && value !== 'sakiko') throw new Error('未知主角');
};
function cents(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > limits.balance) throw new Error('金额必须为合法非负分数');
  return value;
}
const clone = (s: DualProtagonistLedger): DualProtagonistLedger => structuredClone(s);

/** Idempotent creation. Existing game balances must be converted exactly once by the migration layer. */
export function makeDualLedger(soyoCents: number, sakikoCents: number): DualProtagonistLedger {
  return {
    active: 'soyo',
    people: {
      soyo: {id: 'soyo', deviceId: 'unread-city-phone-soyo', theme: 'soyo-soft', cards: {gpt: cents(soyoCents), claude: 0, gemini: 0}},
      sakiko: {id: 'sakiko', deviceId: 'unread-city-phone-sakiko', theme: 'sakiko-blue', cards: {gpt: cents(sakikoCents), claude: 0, gemini: 0}},
    },
    ledger: [], phoneAccess: [],
  };
}
export function switchProtagonist(s: DualProtagonistLedger, target: ProtagonistId): DualProtagonistLedger {
  assertActor(target);
  return {...s, active: target};
}
export function appiePayBalance(s: DualProtagonistLedger, owner: ProtagonistId): number {
  assertActor(owner);
  return FICTIONAL_CARDS.reduce((sum, card) => sum + s.people[owner].cards[card], 0);
}
/** Stable event IDs prevent double spending on duplicate model output / retries. */
export function applyCardTransaction(s: DualProtagonistLedger, entry: LedgerEntry): DualProtagonistLedger {
  assertActor(entry.actor);
  if (!FICTIONAL_CARDS.includes(entry.card)) throw new Error('未知虚构支付卡');
  if (typeof entry.id !== 'string' || !/^[a-zA-Z0-9][\w:.-]{0,119}$/.test(entry.id)) throw new Error('交易 ID 无效');
  if (!Number.isSafeInteger(entry.deltaCents)) throw new Error('金额必须以整数分计');
  if (typeof entry.note !== 'string' || !entry.note.trim() || entry.note.length > limits.detail) throw new Error('交易备注无效');
  const previous = s.ledger.find(row => row.id === entry.id);
  if (previous) {
    if (JSON.stringify(previous) !== JSON.stringify(entry)) throw new Error('重复交易 ID 的数据不一致');
    return s;
  }
  if (s.ledger.length >= limits.entries) throw new Error('支付流水达到上限');
  const owner = s.people[entry.actor];
  const nextBalance = owner.cards[entry.card] + entry.deltaCents;
  cents(nextBalance);
  const next = clone(s);
  next.people[entry.actor].cards[entry.card] = nextBalance;
  next.ledger.push({...entry});
  return next;
}
/** Reading and acting on someone else's device are separate persisted game events. */
export function recordPhoneAccess(s: DualProtagonistLedger, event: AccessRecord): DualProtagonistLedger {
  assertActor(event.actor); assertActor(event.owner);
  if (typeof event.id !== 'string' || !/^[a-zA-Z0-9][\w:.-]{0,119}$/.test(event.id)) throw new Error('访问事件 ID 无效');
  if (!['inspect', 'send_message', 'change_calendar', 'order_delivery', 'buy'].includes(event.operation)) throw new Error('访问操作无效');
  if (typeof event.authorized !== 'boolean' || typeof event.detail !== 'string' || event.detail.length > limits.detail ||
      typeof event.at !== 'string' || !event.at || event.at.length > 80) throw new Error('访问记录无效');
  if (s.phoneAccess.length >= limits.entries) throw new Error('手机操作审计记录达到上限');
  const previous = s.phoneAccess.find(row => row.id === event.id);
  if (previous) {
    if (JSON.stringify(previous) !== JSON.stringify(event)) throw new Error('重复手机事件 ID 的数据不一致');
    return s;
  }
  const next = clone(s);
  next.phoneAccess.push({...event});
  return next;
}
