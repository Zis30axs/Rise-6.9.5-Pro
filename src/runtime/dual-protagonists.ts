/**
 * Immutable ledger primitives used by the connected protagonist world.
 * No external payment services and no access to real device data.
 *
 * Three playable viewpoints share one authoritative timeline. Stable person IDs
 * (worldbook `extensions.personId`) are separate from protagonist IDs; the
 * explicit mapping below is the only place a controller may take over an
 * existing resident identity.
 */
export const PROTAGONISTS = ['soyo', 'sakiko', 'emma'] as const;
export type ProtagonistId = typeof PROTAGONISTS[number];
export type FictionalCardId = 'gpt' | 'claude' | 'gemini';
export const FICTIONAL_CARDS: readonly FictionalCardId[] = ['gpt', 'claude', 'gemini'];
export type PhoneOperation = 'inspect' | 'send_message' | 'change_calendar' | 'order_delivery' | 'buy';

/** Existing worldbook residents that are also controllable protagonists. */
export const PROTAGONIST_PERSON_IDS: Readonly<Partial<Record<ProtagonistId, string>>> = Object.freeze({
  emma: 'majo-emma',
});
export const PROTAGONIST_PERSON_ID_LIST: readonly string[] = Object.freeze(
  PROTAGONISTS.flatMap(id => PROTAGONIST_PERSON_IDS[id] ? [PROTAGONIST_PERSON_IDS[id]!] : []),
);
export function protagonistPersonId(id: ProtagonistId): string | null {
  return PROTAGONIST_PERSON_IDS[id] ?? null;
}
export function protagonistForPerson(personId: string): ProtagonistId | null {
  return PROTAGONISTS.find(id => PROTAGONIST_PERSON_IDS[id] === personId) ?? null;
}
export function isProtagonistPerson(personId: string): boolean {
  return protagonistForPerson(personId) !== null;
}

export const protagonistDeviceIds: Readonly<Record<ProtagonistId, string>> = Object.freeze({
  soyo: 'unread-city-phone-soyo',
  sakiko: 'unread-city-phone-sakiko',
  emma: 'unread-city-phone-emma',
});
export type ProtagonistPhoneTheme = 'soyo-soft' | 'sakiko-blue' | 'emma-soft';
export const protagonistPhoneThemes: Readonly<Record<ProtagonistId, ProtagonistPhoneTheme>> = Object.freeze({
  soyo: 'soyo-soft',
  sakiko: 'sakiko-blue',
  emma: 'emma-soft',
});

/** Game configuration, not a claim about the original work. Awarded only once. */
export const EMMA_START_CENTS = 1_200_000;

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
  theme: ProtagonistPhoneTheme;
  cards: Record<FictionalCardId, number>;
}
export interface ProtagonistLedger {
  active: ProtagonistId;
  people: Record<ProtagonistId, ProtagonistAccount>;
  ledger: LedgerEntry[];
  phoneAccess: AccessRecord[];
}
/** Historical name retained for modules that predate the third viewpoint. */
export type DualProtagonistLedger = ProtagonistLedger;
const limits = { balance: 2_000_000_000, entries: 10_000, detail: 240 };
export function isProtagonistId(value: unknown): value is ProtagonistId {
  return typeof value === 'string' && (PROTAGONISTS as readonly string[]).includes(value);
}
function assertActor(value: unknown): asserts value is ProtagonistId {
  if (!isProtagonistId(value)) throw new Error('未知主角');
}
function cents(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > limits.balance) throw new Error('金额必须为合法非负分数');
  return value;
}
const clone = (s: ProtagonistLedger): ProtagonistLedger => structuredClone(s);

/** Idempotent creation. Existing game balances must be converted exactly once by the migration layer. */
export function makeDualLedger(soyoCents: number, sakikoCents: number, emmaCents = EMMA_START_CENTS): ProtagonistLedger {
  return {
    active: 'soyo',
    people: {
      soyo: {id: 'soyo', deviceId: protagonistDeviceIds.soyo, theme: protagonistPhoneThemes.soyo, cards: {gpt: cents(soyoCents), claude: 0, gemini: 0}},
      sakiko: {id: 'sakiko', deviceId: protagonistDeviceIds.sakiko, theme: protagonistPhoneThemes.sakiko, cards: {gpt: cents(sakikoCents), claude: 0, gemini: 0}},
      emma: {id: 'emma', deviceId: protagonistDeviceIds.emma, theme: protagonistPhoneThemes.emma, cards: {gpt: cents(emmaCents), claude: 0, gemini: 0}},
    },
    ledger: [], phoneAccess: [],
  };
}
export function switchProtagonist(s: ProtagonistLedger, target: ProtagonistId): ProtagonistLedger {
  assertActor(target);
  return {...s, active: target};
}
export function appiePayBalance(s: ProtagonistLedger, owner: ProtagonistId): number {
  assertActor(owner);
  return FICTIONAL_CARDS.reduce((sum, card) => sum + s.people[owner].cards[card], 0);
}
/** Stable event IDs prevent double spending on duplicate model output / retries. */
export function applyCardTransaction(s: ProtagonistLedger, entry: LedgerEntry): ProtagonistLedger {
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
export function recordPhoneAccess(s: ProtagonistLedger, event: AccessRecord): ProtagonistLedger {
  assertActor(event.actor); assertActor(event.owner);
  if (typeof event.id !== 'string' || !/^[a-zA-Z0-9][\w:.-]{0,119}$/.test(event.id)) throw new Error('访问事件 ID 无效');
  if (!['inspect', 'send_message', 'change_calendar', 'order_delivery', 'buy'].includes(event.operation)) throw new Error('访问操作无效');
  if (typeof event.authorized !== 'boolean' || typeof event.detail !== 'string' || event.detail.length > limits.detail ||
      typeof event.at !== 'string' || !event.at || event.at.length > 80) throw new Error('访问记录无效');
  const previous = s.phoneAccess.find(row => row.id === event.id);
  if (previous) {
    if (JSON.stringify(previous) !== JSON.stringify(event)) throw new Error('重复手机事件 ID 的数据不一致');
    return s;
  }
  if (s.phoneAccess.length >= limits.entries) throw new Error('手机操作审计记录达到上限');
  const next = clone(s);
  next.phoneAccess.push({...event});
  return next;
}
