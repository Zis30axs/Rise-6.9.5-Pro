import { parseBandInviteCommand, sendBandInvitation, musicPersonId, type BandInviteCommand } from './livehouse';
import { appendPeekChat, applyNpcPhoneCommand, parseNpcPhone, parseNpcPhoneCommand, retireControlledNpcThreads, type NpcPhoneCommand, type NpcPhoneState } from './npc-phone';
import type { StoryAction, WorldState, WorldAction } from '../frontend/types';
import { appiePayBalance, applyCardTransaction, EMMA_START_CENTS, FICTIONAL_CARDS, makeDualLedger, PROTAGONISTS, PROTAGONIST_PERSON_IDS, protagonistForPerson, recordPhoneAccess, RENAKO_START_CENTS, type DualProtagonistLedger, type FictionalCardId, type ProtagonistId } from './dual-protagonists';
import { initialPlayerNeeds, INVENTORY_ITEM_LIMIT, storeCatalog } from './convenience-store';
import { emmaInitialFriendContacts, knownProtagonistContact, renakoInitialFriendContacts } from './initial-contacts';
import { protagonistOpening, protagonistOpeningJournal } from './viewpoint-openings';
import { getCampusInterior } from './campus-interiors';
import { sceneLandmarks } from '../frontend/scene-layout';
import { TOKYO_DELIVERY_FEE, TOKYO_MONEY_FACTOR } from './tokyo-world';
import { initializeBackgroundLife, parseBackgroundLife, settleBackgroundLife, suspendBackgroundActivity, type BackgroundLife } from './background-life';
import { captureNewJournalEvidence, createWeeklyMemory, parseWeeklyMemory, settleWeeklyMemory, type WeeklyMemory } from './weekly-memory';

export const protagonistNames = { soyo: '长崎素世', sakiko: '丰川祥子', emma: '樱羽艾玛', renako: '甘织玲奈子' } as const;
/** Game configuration, not a claim about the original work. Awarded only once. */
export const SAKIKO_START_CENTS = 2_400_000;
export const personalKeys = ['locationId', 'scene', 'interior', 'transit', 'player', 'inventory', 'academics', 'phone', 'contacts', 'schedule', 'journal', 'story'] as const;
export type PersonalState = Pick<WorldState, typeof personalKeys[number]>;
export interface CalendarEvent { id: string; title: string; locationId: string; start: number; duration: number; reminded: boolean }
export interface PhoneNotification { id: string; text: string; at: number; read: boolean }
export interface PhoneAppearance { wallpaper: 'signature' | 'plain'; theme: 'light' | 'dark' | 'system'; layout: 'daily' | 'focus' }
export const defaultPhoneAppearance = (owner: ProtagonistId): PhoneAppearance => ({wallpaper:'signature',theme:owner==='soyo'||owner==='renako'?'light':'dark',layout:'daily'});
export function parsePhoneAppearance(raw: unknown): PhoneAppearance {
  const a=exact(raw,['wallpaper','theme','layout']);
  if(!['signature','plain'].includes(a.wallpaper as string)||!['light','dark','system'].includes(a.theme as string)||!['daily','focus'].includes(a.layout as string))return fail('手机外观无效');
  return {wallpaper:a.wallpaper as PhoneAppearance['wallpaper'],theme:a.theme as PhoneAppearance['theme'],layout:a.layout as PhoneAppearance['layout']};
}
export interface DeviceState { appearance?: PhoneAppearance; locked: boolean; share: 'none' | 'read' | 'write'; calendar: CalendarEvent[]; notifications: PhoneNotification[] }
export interface ProtagonistTextMessage {
  id: string;
  from: ProtagonistId;
  to: ProtagonistId;
  at: number;
  text: string;
  replyTo: string | null;
  /** Only player-originated messages require a model response. */
  expectsReply: boolean;
}
export interface PhoneOrder { id: string; owner: ProtagonistId; actor: ProtagonistId; kind: 'shop' | 'delivery'; itemId: string; quantity: number; card: FictionalCardId; totalCents: number; address: string; due: number; status: 'paid' | 'delivered' | 'received' | 'cancelled' }
export interface ProtagonistWorld {
  revision: number;
  npcPhone?: NpcPhoneState;
  inactive: PersonalState;
  /** The second non-active protagonist; `inactive` remains the primary one. */
  third: PersonalState;
  /** The third non-active protagonist. */
  fourth: PersonalState;
  accounts: DualProtagonistLedger;
  devices: Record<ProtagonistId, DeviceState>;
  orders: PhoneOrder[];
  operations: { id: string; actor: ProtagonistId; owner: ProtagonistId; command: string }[];
  /** Optional shared contact wallets keyed by NPC person ID; protagonist balances live in accounts. */
  npcWallets?: Record<string, number>;
  /** Shared canonical chat; both phones project the same thread. Absent in old 1.12 saves. */
  conversations?: ProtagonistTextMessage[];
  /** Older 1.12 saves receive this lazily at their current world clock. */
  backgroundLife?: BackgroundLife;
  /** Seven-game-day extractive memories, never a replacement for live state. */
  weeklyMemory?: WeeklyMemory;
}
export type PhoneCommand = NpcPhoneCommand | BandInviteCommand
  | { type: 'inspect'; section: 'messages' | 'calendar' | 'orders' | 'wallet' }
  | { type: 'appearance'; appearance: PhoneAppearance }
  | { type: 'device'; locked: boolean; share: DeviceState['share'] }
  | { type: 'transfer'; from: FictionalCardId; to: FictionalCardId; cents: number }
  | { type: 'send_transfer'; to: string; from: FictionalCardId; cents: number }
  | { type: 'order'; kind: PhoneOrder['kind']; itemId: string; quantity: number; card: FictionalCardId; address: string }
  | { type: 'cancel_order'; id: string }
  | { type: 'receive_order'; id: string }
  | { type: 'calendar_save'; id: string; title: string; locationId: string; start: number; duration: number }
  | { type: 'calendar_delete'; id: string }
  | { type: 'send_message'; to?: ProtagonistId; text: string }
  | { type: 'peek_chat_append'; npcId: string; lines: { speaker: 'protagonist' | 'npc'; text: string }[] }
  | { type: 'read_notifications' };

export const activeProtagonist = (s: WorldState): ProtagonistId => s.protagonists?.accounts.active ?? 'soyo';
/** Canonical order of the protagonists that are not currently controlled. */
export const otherProtagonists = (id: ProtagonistId): ProtagonistId[] => PROTAGONISTS.filter(x => x !== id);
/** Primary correspondent retained for two-person phone and background flows. */
export const otherProtagonist = (id: ProtagonistId): ProtagonistId => otherProtagonists(id)[0]!;
export const gameMinute = (s: Pick<WorldState, 'clock'>): number => (s.clock.day - 1) * 1440 + s.clock.hour * 60 + s.clock.minute;
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
export function personalState(s: PersonalState): PersonalState { return Object.fromEntries(personalKeys.map(k => [k, clone(s[k])])) as unknown as PersonalState; }
export function legacyView(s: WorldState): WorldState { const { protagonists: _p, ...base } = s; return { ...base, schema_version: '1.11.0' }; }
export function personState(s: WorldState, owner: ProtagonistId): PersonalState {
  const p = s.protagonists;
  if (!p) fail('尚未启用主角世界');
  if (owner === p.accounts.active) return s;
  const others = otherProtagonists(p.accounts.active);
  if (owner === others[0]) return p.inactive;
  if (owner === others[1]) return p.third;
  if (owner === others[2]) return p.fourth;
  return fail('主角状态缺失');
}
function fail(message: string): never { throw new Error(`三主角状态：${message}`); }
const exact = (x: unknown, fields: string[]): Record<string, unknown> => {
  if (!x || typeof x !== 'object' || Array.isArray(x) || Object.keys(x).length !== fields.length || Object.keys(x).some(k => !fields.includes(k))) return fail('字段无效');
  return x as Record<string, unknown>;
};
const integer = (x: unknown, max = 2000000000, min = 0): number => typeof x === 'number' && Number.isSafeInteger(x) && x >= min && x <= max ? x : fail('数值无效');
const string = (x: unknown, max = 240): string => typeof x === 'string' && x.trim() && x.length <= max && !/[\u0000-\u001f]/.test(x) ? x : fail('文本无效');
const messageText = (x: unknown): string => typeof x === 'string' && x.trim() && x.length <= 1000 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(x) ? x : fail('短信文本无效');
const identifier = (x: unknown): string => typeof x === 'string' && /^[A-Za-z0-9][\w:.-]{0,79}$/.test(x) ? x : fail('ID 无效');
const actor = (x: unknown): ProtagonistId => PROTAGONISTS.includes(x as ProtagonistId) ? x as ProtagonistId : fail('主角无效');
const card = (x: unknown): FictionalCardId => FICTIONAL_CARDS.includes(x as FictionalCardId) ? x as FictionalCardId : fail('卡片无效');
const boolean = (x: unknown): boolean => typeof x === 'boolean' ? x : fail('开关无效');
const array = <T>(x: unknown, max: number, parse: (x: unknown) => T): T[] => Array.isArray(x) && x.length <= max ? x.map(parse) : fail('列表无效');
const distinct = <T extends {id: string}>(rows: T[]): T[] => new Set(rows.map(x => x.id)).size === rows.length ? rows : fail('重复 ID');
const share = (x: unknown): DeviceState['share'] => x === 'none' || x === 'read' || x === 'write' ? x : fail('共享范围无效');
const money = (x: number) => { const result = Math.round(x * 100); if (Math.abs(result / 100 - x) > 1e-7) fail('金额最多两位小数'); return integer(result); };

function defaultDevice(): DeviceState { return { locked: false, share: 'none', calendar: [], notifications: [] }; }
function emmaPersonalState(s: Pick<WorldState, 'scene' | 'clock'>): PersonalState {
  return {
    locationId: 'home', scene: { x: -190, z: 130, yaw: 0, areaId: 'home', seed: s.scene?.seed ?? 'dual-world-v1', encounterId: null },
    interior: null, transit: { sequence: 0, lastRide: null },
    player: { energy: 80, balance: EMMA_START_CENTS / 100, ...initialPlayerNeeds }, inventory: [], academics: null,
    contacts: emmaInitialFriendContacts(), phone: [], schedule: [], journal: [protagonistOpeningJournal('emma', s.clock)],
    story: [{ id: 'emma-opening', role: 'assistant', text: protagonistOpening('emma', s.clock) }],
  };
}
function renakoPersonalState(s: Pick<WorldState, 'scene' | 'clock'>): PersonalState {
  return {
    locationId: 'home', scene: { x: -176, z: 130, yaw: 0, areaId: 'home', seed: s.scene?.seed ?? 'dual-world-v1', encounterId: null },
    interior: null, transit: { sequence: 0, lastRide: null },
    player: { energy: 80, balance: RENAKO_START_CENTS / 100, ...initialPlayerNeeds }, inventory: [], academics: null,
    contacts: renakoInitialFriendContacts(), phone: [], schedule: [], journal: [protagonistOpeningJournal('renako', s.clock)],
    story: [{ id: 'renako-opening', role: 'assistant', text: protagonistOpening('renako', s.clock) }],
  };
}
export function enableProtagonists(s: WorldState): WorldState {
  if (s.protagonists) {
    const next = clone(s);
    const p = next.protagonists!;
    if (!p.third) {
      p.third = personalState(emmaPersonalState(next));
      p.accounts.people.emma ??= { id: 'emma', deviceId: 'unread-city-phone-emma', theme: 'emma-soft', cards: { gpt: EMMA_START_CENTS, claude: 0, gemini: 0 } };
      p.devices.emma ??= defaultDevice();
    }
    if (!p.fourth) {
      p.fourth = personalState(renakoPersonalState(next));
      p.accounts.people.renako ??= { id: 'renako', deviceId: 'unread-city-phone-renako', theme: 'renako-soft', cards: { gpt: RENAKO_START_CENTS, claude: 0, gemini: 0 } };
      p.devices.renako ??= defaultDevice();
    }
    if (p.backgroundLife && (!Object.hasOwn(p.backgroundLife.people, 'emma') || !Object.hasOwn(p.backgroundLife.people, 'renako'))) {
      p.backgroundLife = initializeBackgroundLife(next);
    }
    p.backgroundLife ??= initializeBackgroundLife(next);
    p.weeklyMemory ??= createWeeklyMemory(gameMinute(next));
    return next;
  }
  const point = sceneLandmarks.find(x => x.id === 'downtown')!;
  const room = getCampusInterior('toyokawa-house')!;
  const x = room.entrance.x, z = room.entrance.z;
  const inactive: PersonalState = {
    locationId: 'downtown', scene: { x: point?.x ?? x, z: point?.z ?? z, yaw: 0, areaId: 'downtown', seed: s.scene?.seed ?? 'dual-world-v1', encounterId: null },
    interior: null, transit: { sequence: 0, lastRide: null },
    player: { energy: 80, balance: SAKIKO_START_CENTS / 100, ...initialPlayerNeeds }, inventory: [], academics: null,
    contacts: [knownProtagonistContact('soyo', protagonistNames.soyo)], phone: [], schedule: [], journal: [protagonistOpeningJournal('sakiko', s.clock)],
    story: [{ id: 'sakiko-opening', role: 'assistant', text: protagonistOpening('sakiko', s.clock) }],
  };
  const next: WorldState = { ...clone(s), schema_version: '1.13.0', protagonists: { revision: 0, inactive, third: emmaPersonalState(s), fourth: renakoPersonalState(s),
    accounts: makeDualLedger(money(s.player.balance), SAKIKO_START_CENTS, EMMA_START_CENTS, RENAKO_START_CENTS),
    devices: { soyo: defaultDevice(), sakiko: defaultDevice(), emma: defaultDevice(), renako: defaultDevice() }, orders: [], operations: [], conversations: [] } };
  next.protagonists!.backgroundLife = initializeBackgroundLife(next);
  next.protagonists!.weeklyMemory = createWeeklyMemory(gameMinute(next));
  // Other viewpoints start unassigned, even when the first protagonist has a major.
  return next;
}

export function parseProtagonists(value: unknown, base: WorldState, parseLegacy: (x: unknown) => WorldState, legacyMoney = false): ProtagonistWorld {
  const source = value as Record<string, unknown>;
  const hasThird = !!source && typeof source === 'object' && !Array.isArray(source) && Object.hasOwn(source, 'third');
  const hasFourth = !!source && typeof source === 'object' && !Array.isArray(source) && Object.hasOwn(source, 'fourth');
  const optional = (key: string) => source && typeof source === 'object' && Object.hasOwn(source, key) ? [key] : [];
  const p = exact(value, ['revision','inactive',...(hasThird?['third']:[]),...(hasFourth?['fourth']:[]),'accounts','devices','orders','operations',
    ...optional('npcWallets'),...optional('npcPhone'),...optional('backgroundLife'),...optional('weeklyMemory'),...optional('conversations')]);
  const a = exact(p.accounts, ['active','people','ledger','phoneAccess']);
  const who = actor(a.active), others = otherProtagonists(who);
  const accountKeys = ['soyo','sakiko',...(hasThird?['emma']:[]),...(hasFourth?['renako']:[])];
  const rawPeople = exact(a.people, accountKeys);
  const accounts = makeDualLedger(0, 0, 0, 0); accounts.active = who;
  for (const owner of accountKeys as ProtagonistId[]) {
    const row = exact(rawPeople[owner], ['id','deviceId','theme','cards']), cards = exact(row.cards, ['gpt','claude','gemini']);
    if (row.id !== owner || row.deviceId !== accounts.people[owner].deviceId || row.theme !== accounts.people[owner].theme) fail('设备身份无效');
    for (const name of FICTIONAL_CARDS) accounts.people[owner].cards[name] = integer(cards[name]);
    if (appiePayBalance(accounts, owner) > 2000000000) fail('余额超过上限');
  }
  accounts.ledger = distinct(array(a.ledger, 10000, raw => {
    const e = exact(raw, ['id','actor','card','deltaCents','note']);
    return {id: string(e.id,120), actor: actor(e.actor), card: card(e.card), deltaCents: integer(e.deltaCents,2000000000,-2000000000), note: string(e.note)};
  }));
  accounts.phoneAccess = distinct(array(a.phoneAccess, 10000, raw => {
    const e = exact(raw, ['id','actor','owner','operation','authorized','detail','at']);
    if (!['inspect','send_message','change_calendar','order_delivery','buy'].includes(String(e.operation))) return fail('手机审计操作无效');
    return {id:identifier(e.id),actor:actor(e.actor),owner:actor(e.owner),operation:e.operation as 'inspect'|'send_message'|'change_calendar'|'order_delivery'|'buy',authorized:boolean(e.authorized),detail:string(e.detail),at:string(e.at,80)};
  }));
  const rawInactive = exact(p.inactive, [...personalKeys]);
  const inactive = personalState(parseLegacy({ ...base, ...rawInactive, schema_version: '1.11.0' }));
  let third: PersonalState;
  if (hasThird) {
    const rawThird = exact(p.third, [...personalKeys]);
    third = personalState(parseLegacy({ ...base, ...rawThird, schema_version: '1.11.0' }));
  } else {
    // 1.12 dual saves keep their exact `inactive` state and receive one
    // deterministic third protagonist at the current world seed/clock.
    third = personalState(emmaPersonalState(base));
    if (legacyMoney) third.player.balance /= TOKYO_MONEY_FACTOR;
  }
  if (!accountKeys.includes('emma')) {
    accounts.people.emma.cards.gpt = money(third.player.balance);
    if (appiePayBalance(accounts, 'emma') > 2000000000) fail('余额超过上限');
  }
  let fourth: PersonalState;
  if (hasFourth) {
    const rawFourth = exact(p.fourth, [...personalKeys]);
    fourth = personalState(parseLegacy({ ...base, ...rawFourth, schema_version: '1.11.0' }));
  } else {
    fourth = personalState(renakoPersonalState(base));
    if (legacyMoney) fourth.player.balance /= TOKYO_MONEY_FACTOR;
  }
  if (!accountKeys.includes('renako')) {
    accounts.people.renako.cards.gpt = money(fourth.player.balance);
    if (appiePayBalance(accounts, 'renako') > 2000000000) fail('余额超过上限');
  }
  if (money(base.player.balance) !== appiePayBalance(accounts, who)
    || money(inactive.player.balance) !== appiePayBalance(accounts, others[0])
    || money(third.player.balance) !== appiePayBalance(accounts, others[1])
    || money(fourth.player.balance) !== appiePayBalance(accounts, others[2])) fail('余额投影与 Appie Pay 不一致');
  const deviceKeys = ['soyo','sakiko',...(hasThird?['emma']:[]),...(hasFourth?['renako']:[])];
  const rawDevices = exact(p.devices, deviceKeys);
  const parseDevice = (x: unknown): DeviceState => {
    const d = exact(x, ['locked','share','calendar','notifications',...(x && typeof x==='object' && Object.hasOwn(x,'appearance')?['appearance']:[])]);
    return { ...(Object.hasOwn(d,'appearance')?{appearance:parsePhoneAppearance(d.appearance)}:{}), locked: boolean(d.locked), share: share(d.share), calendar: distinct(array(d.calendar,100,raw => {
      const e = exact(raw, ['id','title','locationId','start','duration','reminded']);
      const locationId = string(e.locationId,80); if (!isKnownLocation(locationId)) fail('日历地点无效');
      return {id: identifier(e.id), title: string(e.title,100), locationId, start: integer(e.start,525600000), duration: integer(e.duration,1440,1), reminded: boolean(e.reminded)};
    })), notifications: distinct(array(d.notifications,200,raw => {
      const n = exact(raw, ['id','text','at','read']); return {id:string(n.id,128),text:string(n.text),at:integer(n.at,525600000),read:boolean(n.read)};
    })) };
  };
  const devices: Record<ProtagonistId, DeviceState> = { soyo: defaultDevice(), sakiko: defaultDevice(), emma: defaultDevice(), renako: defaultDevice() };
  for (const owner of deviceKeys as ProtagonistId[]) devices[owner] = parseDevice(rawDevices[owner]);
  const orders = distinct(array(p.orders,500,raw => {
    const o = exact(raw,['id','owner','actor','kind','itemId','quantity','card','totalCents','address','due','status']);
    const item = storeCatalog.find(x => x.id === o.itemId); if (!item || !['shop','delivery'].includes(String(o.kind)) || !['paid','delivered','received','cancelled'].includes(String(o.status))) return fail('订单无效');
    const quantity = integer(o.quantity,20,1), totalCents = integer(o.totalCents);
    if (totalCents !== money((legacyMoney ? item.price / TOKYO_MONEY_FACTOR : item.price) * quantity + (o.kind === 'delivery' ? (legacyMoney ? TOKYO_DELIVERY_FEE / TOKYO_MONEY_FACTOR : TOKYO_DELIVERY_FEE) : 0))) fail('订单金额无效');
    return {id:identifier(o.id),owner:actor(o.owner),actor:actor(o.actor),kind:o.kind as PhoneOrder['kind'],itemId:item.id,quantity,card:card(o.card),totalCents,address:string(o.address,80),due:integer(o.due,525600000),status:o.status as PhoneOrder['status']};
  }));
  const operations = distinct(array(p.operations,2000,raw => {
    const r=exact(raw,['id','actor','owner','command']); return {id:identifier(r.id),actor:actor(r.actor),owner:actor(r.owner),command:string(r.command,2000)};
  }));
  const conversations: ProtagonistTextMessage[] = Object.hasOwn(p,'conversations') ? distinct(array(p.conversations,10000,raw => {
    const item=exact(raw,['id','from','to','at','text','replyTo','expectsReply']);
    const from=actor(item.from),to=actor(item.to);
    if(from===to) fail('短信双方不能是同一主角');
    const replyTo=item.replyTo===null?null:identifier(item.replyTo);
    const expectsReply=boolean(item.expectsReply);
    if(replyTo!==null&&expectsReply) fail('自动回复不能再触发自动回复');
    return {id:identifier(item.id),from,to,at:integer(item.at,525600000),text:messageText(item.text),replyTo,expectsReply};
  })) : [];
  if(conversations.some(row => row.replyTo!==null && !conversations.some(parent =>
    parent.id===row.replyTo && parent.from===row.to && parent.to===row.from && parent.expectsReply))) fail('短信回复来源无效');
  const result: ProtagonistWorld = {revision:integer(p.revision,Number.MAX_SAFE_INTEGER),inactive,third,fourth,accounts,devices,orders,operations,conversations};
  if (Object.hasOwn(p,'npcWallets')) result.npcWallets = parseNpcWallets(p.npcWallets);
  if (Object.hasOwn(p, 'npcPhone')) result.npcPhone = parseNpcPhone(p.npcPhone, {...base, schema_version:'1.13.0', protagonists:result});
  result.backgroundLife = Object.hasOwn(p,'backgroundLife') ? parseBackgroundLife(p.backgroundLife,base,parseLegacy,!hasThird||!hasFourth) : initializeBackgroundLife({...base,schema_version:'1.13.0',protagonists:result});
  result.weeklyMemory = Object.hasOwn(p,'weeklyMemory') ? parseWeeklyMemory(p.weeklyMemory,base.clock) : createWeeklyMemory(gameMinute(base));
  return result;
}
function isKnownLocation(locationId: string): boolean {
  return !!getCampusInterior(locationId) || sceneLandmarks.some(x=>x.id===locationId) || ['gate','library','cafe','dorm','teaching','sports','junction','bookshop','convenience','street-cafe','pocket-park','bus-stop'].includes(locationId);
}
function parseNpcWallets(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('联系人钱包无效');
  const rows = Object.entries(raw);
  if (rows.length > 200) fail('联系人钱包条目超过上限');
  return Object.fromEntries(rows.map(([npcId, balance]) => [identifier(npcId), integer(balance, 2000000000)] as const));
}

/** Adapt all legacy money paths once, including nested travel legs and model actions. */
export function finishPersonalChange(before: WorldState, after: WorldState, note: string): WorldState {
  if (!before.protagonists) return after;
  if (JSON.stringify(legacyView(before)) === JSON.stringify(legacyView(after))) return clone(before);
  const p = clone(before.protagonists), owner = p.accounts.active;
  const delta = money(after.player.balance) - money(before.player.balance);
  if (delta > 0) p.accounts=applyCardTransaction(p.accounts,{id:`world:${p.revision}:credit`,actor:owner,card:'gpt',deltaCents:delta,note});
  else if (delta < 0) {
    let remaining=-delta;
    for (const name of FICTIONAL_CARDS) {
      const debit=Math.min(remaining,p.accounts.people[owner].cards[name]); if (!debit) continue;
      p.accounts=applyCardTransaction(p.accounts,{id:`world:${p.revision}:${name}`,actor:owner,card:name,deltaCents:-debit,note}); remaining-=debit;
    }
    if (remaining) fail('余额不足');
  }
  const elapsed=gameMinute(after)-gameMinute(before);
  if (elapsed < 0) fail('世界时钟不能倒退');
  const next={...after,schema_version:'1.13.0' as const,protagonists:p};
  settleBackgroundLife(before,next);
  settlePhoneTime(next);
  captureNewJournalEvidence(before,next);
  settleWeeklyMemory(next);
  p.revision++; return next;
}

export type TransferParty = { kind: 'protagonist'; id: ProtagonistId; name: string } | { kind: 'npc'; id: string; name: string };
const NPC_WALLET_LIMIT = 2_000_000_000;
const walletOf = (p: ProtagonistWorld, npcId: string): number => p.npcWallets?.[npcId] ?? 0;

/** Transfers may name a protagonist directly, a protagonist contact, or a saved NPC contact of the viewpoint owner. */
export function resolveTransferParty(s: WorldState, who: ProtagonistId, raw: unknown): TransferParty {
  const value = identifier(raw);
  const direct = PROTAGONISTS.find(id => id === value);
  if (direct) return { kind: 'protagonist', id: direct, name: protagonistNames[direct] };
  if (value.startsWith('protagonist-')) {
    const target = actor(value.slice('protagonist-'.length));
    return { kind: 'protagonist', id: target, name: protagonistNames[target] };
  }
  const person = protagonistForPerson(value);
  if (person) return { kind: 'protagonist', id: person, name: protagonistNames[person] };
  const contact = personState(s, who).contacts.find(row => !row.id.startsWith('protagonist-') && (row.id === value || row.sourcePersonId === value));
  return contact ? { kind: 'npc', id: contact.sourcePersonId ?? contact.id, name: contact.name } : fail('转账对象必须是已保存的联系人或主角');
}

/**
 * Move money between two parties with one debit and one credit; cents are
 * conserved. Protagonist legs run through the authoritative Appie Pay ledger,
 * NPC legs through shared contact wallets. Funds are checked before any
 * mutation so a rejected transfer leaves both sides untouched; the caller
 * owns cloning and replay protection.
 */
export function applyPartyTransfer(s: WorldState, transferId: string, from: TransferParty, to: TransferParty, cents: number, reason = '', fromCard?: FictionalCardId): void {
  const p = s.protagonists!;
  if (!/^[a-zA-Z0-9][\w:.-]{0,110}$/.test(transferId)) fail('转账记录 ID 无效');
  if (!Number.isSafeInteger(cents) || cents < 1) fail('转账金额无效');
  if (from.kind === 'protagonist' && from.id === to.id) fail('不能转给自己');
  if (from.kind === 'protagonist') {
    const available = fromCard ? p.accounts.people[from.id].cards[fromCard] : appiePayBalance(p.accounts, from.id);
    if (available < cents) fail(`余额不足，这笔转账需要 ${(cents / 100).toFixed(2)} 日元`);
  } else if (walletOf(p, from.id) < cents) {
    fail(`${from.name}的余额不足，无法完成这笔转账`);
  }
  if (to.kind === 'npc' && walletOf(p, to.id) + cents > NPC_WALLET_LIMIT) fail('对方账户余额超过上限');
  const legNote = (text: string) => text.slice(0, 240);
  const outNote = legNote(`转账给${to.name}${reason ? `：${reason}` : ''}`);
  const inNote = legNote(`收到${from.name}的转账${reason ? `：${reason}` : ''}`);
  p.npcWallets ??= {};
  if (from.kind === 'protagonist') {
    if (fromCard) {
      p.accounts = applyCardTransaction(p.accounts, { id: `${transferId}:out`, actor: from.id, card: fromCard, deltaCents: -cents, note: outNote });
    } else {
      let remaining = cents;
      for (const card of FICTIONAL_CARDS) {
        const debit = Math.min(remaining, p.accounts.people[from.id].cards[card]);
        if (!debit) continue;
        p.accounts = applyCardTransaction(p.accounts, { id: `${transferId}:out:${card}`, actor: from.id, card, deltaCents: -debit, note: outNote });
        remaining -= debit;
      }
    }
  } else p.npcWallets[from.id] = walletOf(p, from.id) - cents;
  if (to.kind === 'protagonist') {
    p.accounts = applyCardTransaction(p.accounts, { id: `${transferId}:in`, actor: to.id, card: 'gpt', deltaCents: cents, note: inNote });
  } else p.npcWallets[to.id] = walletOf(p, to.id) + cents;
  // Keep every involved protagonist's legacy balance projection identical to the ledger.
  for (const party of [from, to]) if (party.kind === 'protagonist') personState(s, party.id).player.balance = appiePayBalance(p.accounts, party.id) / 100;
}

/**
 * Story transfer actions are booked here, after finishPersonalChange: the
 * legacy money mirror only tracks the active protagonist, so every leg is
 * written directly against the authoritative ledger and contact wallets.
 * Stable ledger entry IDs make replayed commits idempotent.
 */
export function applyStoryTransferLegs(state: WorldState, actions: readonly StoryAction[], turnId: string): WorldState {
  const transfers = actions.flatMap((action, index) => action.type === 'transfer' ? [{ action, index }] : []);
  if (!state.protagonists || !transfers.length) return state;
  const s = clone(state), p = s.protagonists!, who = activeProtagonist(s);
  const at = `第 ${s.clock.day} 天 ${String(s.clock.hour).padStart(2, '0')}:${String(s.clock.minute).padStart(2, '0')}`;
  let booked = false;
  for (const [order, { action }] of transfers.entries()) {
    const transferId = `wa:${turnId}:t${order}`;
    if (p.accounts.ledger.some(row => row.id.startsWith(`${transferId}:out`) || row.id === `${transferId}:in`)) continue;
    const from = resolveTransferParty(s, who, action.from);
    const to = resolveTransferParty(s, who, action.to);
    applyPartyTransfer(s, transferId, from, to, action.cents, action.reason);
    s.journal.push({ id: `${transferId}:journal`, text: `${from.name}向${to.name}转账 ${(action.cents / 100).toFixed(2)} 日元：${action.reason}`.slice(0, 1000), at });
    s.journal = s.journal.slice(-100);
    booked = true;
  }
  if (booked) p.revision++;
  return s;
}
function notify(s: WorldState, owner: ProtagonistId, id: string, text: string, at = gameMinute(s)) {
  const d=s.protagonists!.devices[owner]; if(d.notifications.some(n=>n.id===id)) return;
  if(d.notifications.length>=200){ const index=d.notifications.findIndex(n=>n.read); if(index<0) fail('未读通知已满，请先阅读');d.notifications.splice(index,1); }
  // Source times and a stable tie-break keep delayed reminders independent of step size.
  const index=d.notifications.findIndex(n=>n.at>at || n.at===at && n.id>id);
  d.notifications.splice(index<0?d.notifications.length:index,0,{id,text,at,read:false});
}
export function settlePhoneTime(s: WorldState) {
  const p=s.protagonists!;
  for(const o of p.orders) if(o.status==='paid'&&o.due<=gameMinute(s)){o.status='delivered';notify(s,o.owner,`order:${o.id}:arrived`,'订单已送达，请到收货地点领取。',o.due);}
  for(const owner of PROTAGONISTS) for(const e of p.devices[owner].calendar) if(!e.reminded && e.start<=gameMinute(s)) {e.reminded=true;notify(s,owner,`calendar:${e.id}:${e.start}`,`日程提醒：${e.title}`,e.start);}
}
export function protagonistNearby(s: WorldState, owner: ProtagonistId): boolean {
  if (!s.protagonists || owner === activeProtagonist(s)) return false;
  const other = personState(s, owner);
  if (s.locationId !== other.locationId) return false;
  return !!(s.interior&&other.interior ? s.interior.roomId===other.interior.roomId&&Math.hypot(s.interior.x-other.interior.x,s.interior.z-other.interior.z)<=3 : !s.interior&&!other.interior&&s.scene&&other.scene&&Math.hypot(s.scene.x-other.scene.x,s.scene.z-other.scene.z)<=3);
}
export function protagonistsNearby(s: WorldState): boolean {
  if (!s.protagonists) return false;
  return otherProtagonists(activeProtagonist(s)).some(owner => protagonistNearby(s, owner));
}
export function phoneAccess(s: WorldState, owner: ProtagonistId) {
  const active=activeProtagonist(s); if(owner===active) return {read:true,write:true,authorized:true,reason:''};
  if(!s.protagonists) return {read:false,write:false,authorized:false,reason:'尚未启用主角世界'};
  const device=s.protagonists.devices[owner];
  const near=protagonistNearby(s, owner);
  if(!near) return {read:false,write:false,authorized:false,reason:'需要走到对方身边才能接触这台手机'};
  const read=!device.locked || device.share!=='none', write=!device.locked || device.share==='write';
  return {read,write,authorized:device.share!=='none',reason:!read?'手机已锁定，尚未获得许可':!write?'只获得了查看许可':''};
}
function parseCommand(raw: unknown): PhoneCommand {
  const type=(raw as PhoneCommand)?.type;
  if (type === 'band_invite') return parseBandInviteCommand(raw);
  if (type === 'send_npc_message' || type === 'send_group_message' || type === 'resolve_contact_request') return parseNpcPhoneCommand(raw);
  const fields: Record<Exclude<PhoneCommand['type'], NpcPhoneCommand['type'] | 'send_message' | 'peek_chat_append' | 'band_invite'>,string[]>={appearance:['appearance'],inspect:['section'],device:['locked','share'],transfer:['from','to','cents'],send_transfer:['to','from','cents'],order:['kind','itemId','quantity','card','address'],cancel_order:['id'],receive_order:['id'],calendar_save:['id','title','locationId','start','duration'],calendar_delete:['id'],read_notifications:[]};
  if(type==='peek_chat_append'){
    const c=exact(raw,['type','npcId','lines']);
    const lines=array(c.lines,6,item=>{
      const row=exact(item,['speaker','text']);
      if(row.speaker!=='protagonist'&&row.speaker!=='npc')fail('短信发言者无效');
      const value=messageText(row.text);
      if(value.length>180)fail('生成短信长度超限');
      return {speaker:row.speaker as 'protagonist'|'npc',text:value};
    });
    if(lines.length<2||lines.length%2!==0||lines.some((row,i)=>row.speaker!==(i%2===0?'protagonist':'npc')))
      fail('双方短信必须轮流发言并以主角开头');
    return {type,npcId:identifier(c.npcId),lines};
  }
  if(type==='send_message'){
    const keys=Object.keys(raw as object).sort().join(',');
    if(keys==='text,type') return {type,text:messageText((raw as {text:unknown}).text)};
    if(keys==='text,to,type') return {type,to:actor((raw as {to:unknown}).to),text:messageText((raw as {text:unknown}).text)};
    return fail('短信字段无效');
  }
  if(!Object.hasOwn(fields,type)) return fail('手机操作无效');
  const c=exact(raw,['type',...fields[type]]);
  switch(type){
    case 'inspect': if(!['messages','calendar','orders','wallet'].includes(String(c.section))) return fail('读取范围无效');return {type,section:c.section as 'messages'};
    case 'appearance': return {type,appearance:parsePhoneAppearance(c.appearance)};
    case 'device': return {type,locked:boolean(c.locked),share:share(c.share)};
    case 'transfer': return {type,from:card(c.from),to:card(c.to),cents:integer(c.cents,2000000000,1)};
    case 'send_transfer': return {type,to:string(c.to,120),from:card(c.from),cents:integer(c.cents,2000000000,1)};
    case 'order': if(c.kind!=='shop'&&c.kind!=='delivery') return fail('订单类型无效');return {type,kind:c.kind,itemId:identifier(c.itemId),quantity:integer(c.quantity,20,1),card:card(c.card),address:identifier(c.address)};
    case 'calendar_save': return {type,id:identifier(c.id),title:string(c.title,100),locationId:identifier(c.locationId),start:integer(c.start,525600000),duration:integer(c.duration,1440,1)};
    case 'read_notifications':return {type};
    default:return {type,id:identifier(c.id)};
  }
}
export function reduceProtagonistAction(state: WorldState, action: Extract<WorldAction,{type:'switch_protagonist'|'phone_app'}>): WorldState {
  const s=enableProtagonists(state), p=s.protagonists!, who=p.accounts.active;
  if(action.type==='switch_protagonist'){
    const target=actor(action.target); if(target===who) return s;
    suspendBackgroundActivity(s,target);
    suspendBackgroundActivity(s,who);
    const controlledPerson=(PROTAGONIST_PERSON_IDS as Record<string,string|undefined>)[target];
    if(controlledPerson&&p.npcPhone) retireControlledNpcThreads(p.npcPhone);
    const leaving=personalState(s);
    const remaining=otherProtagonists(target);
    const stateOf=(id:ProtagonistId)=>id===who?leaving:personalState(personState(s,id));
    const nextInactive=stateOf(remaining[0]), nextThird=stateOf(remaining[1]), nextFourth=stateOf(remaining[2]);
    const arriving=personalState(personState(s,target));
    // A null major is this protagonist's own unmade choice, not a reason to inherit.
    Object.assign(s, arriving);
    p.inactive=nextInactive; p.third=nextThird; p.fourth=nextFourth; p.accounts.active=target; p.revision++;
    return s;
  }
  exact(action,['type','requestId','owner','command']);
  const requestId=identifier(action.requestId),owner=actor(action.owner),command=parseCommand(action.command),key=JSON.stringify(command);
  const previous=p.operations.find(o=>o.id===requestId);
  if(previous){if(previous.actor!==who||previous.owner!==owner||previous.command!==key) fail('重复请求内容不一致');return s;}
  if(p.operations.length>=2000) fail('手机操作记录已满');
  if((command.type==='device'||command.type==='appearance')&&owner!==who) fail('只有本人能设置这台手机');
  if (['send_npc_message','send_group_message','resolve_contact_request','send_transfer','band_invite','peek_chat_append'].includes(command.type) && owner !== who) fail('请使用当前主角自己的手机');
  const access=phoneAccess(s,owner),read=command.type==='inspect';
  if(!(read?access.read:access.write)) fail(access.reason);
  const target=personState(s,owner),device=p.devices[owner];
  const tx=(cardId:FictionalCardId,delta:number,suffix:string,note:string)=>{p.accounts=applyCardTransaction(p.accounts,{id:`app:${requestId}:${suffix}`,actor:owner,card:cardId,deltaCents:delta,note});};
  switch(command.type){
    case 'band_invite': sendBandInvitation(s, command, requestId); break;
    case 'peek_chat_append': appendPeekChat(s, owner, command.npcId, command.lines, requestId); break;
    case 'send_npc_message':
    case 'send_group_message':
    case 'resolve_contact_request':
      applyNpcPhoneCommand(s, owner, command, requestId); break;
    case 'inspect': {
      const content=command.section==='messages'?target.phone.slice(-8).map(m=>m.text).join('；'):command.section==='calendar'?[...target.schedule.map(e=>`${e.time} ${e.title}`),...device.calendar.map(e=>`${e.start} ${e.title}`)].join('；'):command.section==='orders'?p.orders.filter(o=>o.owner===owner).map(o=>`${o.itemId}：${o.status}`).join('；'):`Appie Pay 余额 ${appiePayBalance(p.accounts,owner)/100} 日元`;
      if(owner!==who){const at=`第 ${s.clock.day} 天 ${String(s.clock.hour).padStart(2,'0')}:${String(s.clock.minute).padStart(2,'0')}`;s.journal.push({id:`peek:${requestId}`,text:`查看${protagonistNames[owner]}的手机：${content||'暂无记录'}`.slice(0,1000),at});s.journal=s.journal.slice(-100);}
      break;
    }
    case 'appearance':device.appearance=command.appearance;break;
    case 'device':device.locked=command.locked;device.share=command.share;break;
    case 'transfer':if(command.from===command.to) fail('请选择不同卡片');tx(command.from,-command.cents,'from','Appie Pay 卡间转出');tx(command.to,command.cents,'to','Appie Pay 卡间转入');break;
    case 'send_transfer': {
      const party = resolveTransferParty(s, owner, command.to);
      for (const box of party.kind === 'protagonist' ? [owner, party.id] : [owner]) {
        const device = p.devices[box];
        if (device.notifications.length >= 200 && device.notifications.every(n => !n.read)) fail('通知已满，请先阅读通知再转账');
      }
      applyPartyTransfer(s, `app:${requestId}`, { kind: 'protagonist', id: owner, name: protagonistNames[owner] }, party, command.cents, '', command.from);
      const stamp = `第 ${s.clock.day} 天 ${String(s.clock.hour).padStart(2, '0')}:${String(s.clock.minute).padStart(2, '0')}`;
      target.journal.push({ id: `transfer:${requestId}`, text: `通过 Appie Pay 向${party.name}转账 ${(command.cents / 100).toFixed(2)} 日元`.slice(0, 1000), at: stamp });
      target.journal = target.journal.slice(-100);
      notify(s, owner, `transfer:${requestId}`, `已向${party.name}转账 ${(command.cents / 100).toFixed(2)} 日元。`);
      if (party.kind === 'protagonist') notify(s, party.id, `transfer:${requestId}:in`, `${protagonistNames[owner]}向你转账 ${(command.cents / 100).toFixed(2)} 日元。`);
      break;
    }
    case 'order': {
      const item=storeCatalog.find(x=>x.id===command.itemId);if(!item||command.kind==='delivery'&&item.category==='cigarette') fail('商品不可配送');
      if(!isKnownLocation(command.address)) fail('收货地点无效');
      if(p.orders.length>=500) fail('订单数量已满');
      const totalCents=money(item.price*command.quantity+(command.kind==='delivery'?TOKYO_DELIVERY_FEE:0));
      tx(command.card,-totalCents,'pay',`${command.kind==='delivery'?'外卖':'购物'}：${item.name}`);
      p.orders.push({id:requestId,owner,actor:who,kind:command.kind,itemId:item.id,quantity:command.quantity,card:command.card,totalCents,address:command.address,due:gameMinute(s)+(command.kind==='delivery'?30:60),status:'paid'});
      notify(s,owner,`order:${requestId}:paid`,`已支付 ${(totalCents/100).toFixed(2)} 日元，等待配送。`);break;
    }
    case 'cancel_order': {
      const order=p.orders.find(x=>x.id===command.id&&x.owner===owner);if(!order) fail('订单不存在');if(order.status==='cancelled') break;
      if(order.status!=='paid') fail('订单已送达，不能取消');
      tx(order.card,order.totalCents,'refund','订单取消退款');order.status='cancelled';notify(s,owner,`order:${order.id}:refund`,'订单已取消，款项已原路退回。');break;
    }
    case 'receive_order': {
      const order=p.orders.find(x=>x.id===command.id&&x.owner===owner);if(!order) fail('订单不存在');if(order.status==='received') break;
      if(order.status!=='delivered'||s.locationId!==order.address) fail('请在配送完成后到收货地点领取');
      const item=storeCatalog.find(x=>x.id===order.itemId)!,existing=s.inventory.find(x=>x.itemId===item.id),quantity=(existing?.quantity??0)+item.packSize*order.quantity;
      if(quantity>INVENTORY_ITEM_LIMIT) fail('背包容量不足');if(existing) existing.quantity=quantity;else s.inventory.push({itemId:item.id,quantity});
      order.status='received';notify(s,owner,`order:${order.id}:received`,`${protagonistNames[who]}已领取订单。`);break;
    }
    case 'calendar_save': {
      const performances = (s.livehouse?.bookings ?? []).filter(b => b.memberIds.includes(musicPersonId(owner)));
      const performance = performances.find(b => command.id === 'live:' + b.id);
      if (performance && (command.title !== performance.title || command.locationId !== 'livehouse' || command.start !== performance.start || command.duration !== performance.duration)) fail('已确认演出不能通过编辑日历改写');
      if (performances.some(b => command.id !== 'live:' + b.id && b.start < command.start + command.duration && command.start < b.start + b.duration)) fail('与已确认演出档期冲突');
      if(command.start<gameMinute(s)) fail('不能添加已经过去的日程');
      if(!isKnownLocation(command.locationId)) fail('日程地点无效');
      const events=device.calendar.filter(x=>x.id!==command.id);
      if(events.some(e=>e.start<command.start+command.duration&&command.start<e.start+e.duration)) fail('日程时间冲突');
      if(target.schedule.some(e=>!e.done&&Math.floor(command.start/1440)===s.clock.day-1&&((s.clock.day-1)*1440+Number(e.time.slice(0,2))*60+Number(e.time.slice(3)))>=command.start&&((s.clock.day-1)*1440+Number(e.time.slice(0,2))*60+Number(e.time.slice(3)))<command.start+command.duration)) fail('与现有日程时间冲突');
      if(events.length>=100) fail('日程已满');const {type:_t,...event}=command;events.push({...event,reminded:false});device.calendar=events;break;
    }
    case 'calendar_delete':if(!device.calendar.some(x=>x.id===command.id)) fail('日程不存在');device.calendar=device.calendar.filter(x=>x.id!==command.id);break;
    case 'send_message': {
      const recipient=command.to ?? otherProtagonist(owner);
      if(recipient===owner) fail('不能给自己发短信');
      const receiver=personState(s,recipient),npcId=`protagonist-${owner}`;
      p.conversations ??= [];
      if(p.conversations.length>=10000) fail('短信历史达到存档上限，请先导出历史');
      if(receiver.phone.length>=200) fail('对方消息已满');
      if(!receiver.contacts.some(c=>c.id===npcId)) receiver.contacts.push({id:npcId,name:protagonistNames[owner],tag:'另一位主角',summary:'在同一世界中生活的另一位主角。',affinity:0,status:'手机联系',portraitId:'deepseek',sourcePersonId:null,isMain:true});
      const senderContactId=`protagonist-${recipient}`;
      if(!target.contacts.some(c=>c.id===senderContactId)){
        if(target.contacts.length>=50) fail('发送方联系人已满');
        target.contacts.push({id:senderContactId,name:protagonistNames[recipient],tag:'另一位主角',summary:'在同一世界中生活的另一位主角。',affinity:0,status:'手机联系',portraitId:'deepseek',sourcePersonId:null,isMain:true});
      }
      receiver.phone.push({id:`dual:${requestId}`,npcId,text:command.text,read:false,at:`第 ${s.clock.day} 天 ${String(s.clock.hour).padStart(2,'0')}:${String(s.clock.minute).padStart(2,'0')}`});
      const at=`第 ${s.clock.day} 天 ${String(s.clock.hour).padStart(2,'0')}:${String(s.clock.minute).padStart(2,'0')}`;
      const sentText=who===owner?`向${protagonistNames[recipient]}发消息：${command.text}`:`${protagonistNames[who]}使用你的手机向${protagonistNames[recipient]}发消息：${command.text}（设备操作记录，不代表你本人发言。）`;
      target.journal.push({id:`sent:dual:${requestId}`,text:sentText.slice(0,1000),at});
      const storyIds=new Set(target.story.filter(entry=>entry.role==='assistant').map(entry=>entry.id));
      while(target.journal.length>100){const index=target.journal.findIndex(entry=>{const match=/^(.*):wa:[0-9a-f]{24}$/.exec(entry.id);return !match||!storyIds.has(match[1]);});target.journal.splice(index<0?0:index,1);}
      p.conversations.push({id:`dual:${requestId}`,from:owner,to:recipient,at:gameMinute(s),text:command.text,replyTo:null,expectsReply:who===owner});
      notify(s,recipient,`message:${requestId}`,`${protagonistNames[owner]}发来新消息。`);break;
    }
    case 'read_notifications':device.notifications.forEach(n=>{n.read=true;});break;
  }
  target.player.balance=appiePayBalance(p.accounts,owner)/100;
  if(owner!==who){
    p.accounts=recordPhoneAccess(p.accounts,{id:requestId,actor:who,owner,operation:read?'inspect':command.type.startsWith('calendar')?'change_calendar':command.type==='send_message'?'send_message':command.type==='order'&&command.kind==='delivery'?'order_delivery':'buy',authorized:read?device.share!=='none':device.share==='write',detail:command.type,at:`第 ${s.clock.day} 天 ${String(s.clock.hour).padStart(2,'0')}:${String(s.clock.minute).padStart(2,'0')}`});
    if(!read) notify(s,owner,`access:${requestId}`,'手机上留下了一次由他人操作的记录。');
  }
  p.operations.push({id:requestId,actor:who,owner,command:key});p.revision++;
  return s;
}

/**
 * Save exactly one model-generated reply to a user-originated SMS. The reply
 * is committed by the card, not by a tool call or a fabricated story action.
 * No protagonist switch, world time advance, refund, or location mutation.
 */
export function applyPhoneReply(state: WorldState, messageId: string, replyText: string): WorldState {
  const s=enableProtagonists(state),p=s.protagonists!,rows=p.conversations??[];
  const source=rows.find(row=>row.id===messageId);
  if(!source||!source.expectsReply||source.replyTo!==null||source.from!==activeProtagonist(s)||source.to===source.from) {
    fail('短信回复来源与当前主角不一致');
  }
  const replyId=`${source.id}:reply`;
  const existing=rows.find(row=>row.replyTo===source.id||row.id===replyId);
  if(existing){
    if(existing.id!==replyId||existing.text!==replyText||existing.replyTo!==source.id) fail('重复短信回复内容不一致');
    return s;
  }
  if(typeof replyText!=='string'||!replyText.trim()||replyText.length>1000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(replyText)) fail('短信回复正文无效');
  if(rows.length>=10000) fail('短信历史达到存档上限');
  const recipient=personState(s,source.from),responder=personState(s,source.to);
  if(recipient.phone.length>=200) fail('当前手机收件箱已满');
  if(p.devices[source.from].notifications.length>=200 && p.devices[source.from].notifications.every(row=>!row.read)) fail('当前手机通知已满');
  const npcId=`protagonist-${source.to}`;
  if(!recipient.contacts.some(row=>row.id===npcId)){
    if(recipient.contacts.length>=50) fail('联系人已满');
    recipient.contacts.push({id:npcId,name:protagonistNames[source.to],tag:'另一位主角',summary:'与当前人物共享同一个世界的另一位主角。',affinity:0,status:'手机联系',portraitId:'deepseek',sourcePersonId:null,isMain:true});
  }
  const at=`第 ${s.clock.day} 天 ${String(s.clock.hour).padStart(2,'0')}:${String(s.clock.minute).padStart(2,'0')}`;
  recipient.phone.push({id:replyId,npcId,text:replyText,read:false,at});
  const sentId=`sent:${replyId}`;
  if(!responder.journal.some(row=>row.id===sentId)){
    responder.journal.push({id:sentId,text:`回复${protagonistNames[source.from]}：${replyText}`.slice(0,1000),at});
    responder.journal=responder.journal.slice(-100);
  }
  // One explicit model turn can answer several consecutive split bubbles.
  // Close only earlier still-unanswered prompts in this exact sender/recipient thread;
  // never alter another protagonist's private conversation or an existing reply.
  const index = rows.indexOf(source);
  const alreadyAnswered = new Set(rows.filter(answer => answer.replyTo !== null).map(answer => answer.replyTo));
  for (const prior of rows.slice(0, index)) {
    if (s.livehouse?.invitations.some(i => i.messageId === prior.id && i.status === 'pending')) continue;
    if (prior.replyTo === null && prior.expectsReply &&
        prior.from === source.from && prior.to === source.to &&
        !alreadyAnswered.has(prior.id)) prior.expectsReply = false;
  }
  rows.push({id:replyId,from:source.to,to:source.from,at:gameMinute(s),text:replyText,replyTo:source.id,expectsReply:false});
  p.conversations=rows;
  notify(s,source.from,`message:${replyId}`,`${protagonistNames[source.to]}发来回复。`);
  p.revision++;
  return s;
}

