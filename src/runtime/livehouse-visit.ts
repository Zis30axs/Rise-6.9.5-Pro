import type { WorldState } from '../frontend/types';
import type { ProtagonistId } from './dual-protagonists';
import { PROTAGONISTS } from './dual-protagonists';
import { advisorModifierMultiplier } from './npc-traits';
import { residentPresence } from './npc-cast';
import type { LocationService, LocationServiceEffects } from './location-services';

/** Live House doors. Shows and practice must finish inside this window. */
export const LIVEHOUSE_HOURS = '16:00–23:00';
export const LIVEHOUSE_TICKET_PRICE = 2800;
export const LIVEHOUSE_SHOW_MINUTES = 80;
export const INSTRUMENT_SKILL_CAP = 100;
/** 熟人 tier starts at 30. Practice company uses that line. */
export const PRACTICE_AFFINITY_MIN = 30;
export const PRACTICE_AFFINITY_DELTA = 2;

const SHOW_SLOTS = [
  { key: '1800', label: '18:00', start: 18 * 60 },
  { key: '1930', label: '19:30', start: 19 * 60 + 30 },
] as const;
export type LiveShowKey = typeof SHOW_SLOTS[number]['key'];

const PRACTICE_PLANS = {
  '1h': { minutes: 60, price: 1600, energy: -8, morale: 3, stress: -4, label: '租练习室一小时' },
  '2h': { minutes: 120, price: 3000, energy: -16, morale: 4, stress: -6, label: '租练习室两小时' },
} as const;
type PracticeHours = keyof typeof PRACTICE_PLANS;

const MYGO_PARTNERS = [
  { id: 'bang-tomori', name: '高松灯' },
  { id: 'bang-anon', name: '千早爱音' },
  { id: 'bang-taki', name: '椎名立希' },
  { id: 'bang-rana', name: '要乐奈' },
] as const;

interface ActMember { id: string; name: string; role: string }
interface Act { id: string; name: string; atmosphere: string; members: readonly ActMember[] }

/** Existing bands plus unnamed walk-on groups. No new portraits. */
const ACTS: readonly Act[] = [
  {
    id: 'mygo', name: 'MyGO!!!!!', atmosphere: '青蓝灯光里直接唱出来的句子，鼓和贝斯把间奏留得很空',
    members: [
      { id: 'bang-tomori', name: '高松灯', role: '主唱' },
      { id: 'bang-anon', name: '千早爱音', role: '吉他' },
      { id: 'bang-rana', name: '要乐奈', role: '吉他' },
      { id: 'bang-taki', name: '椎名立希', role: '鼓' },
      { id: 'protagonist-soyo', name: '长崎素世', role: '贝斯' },
    ],
  },
  {
    id: 'ave-mujica', name: 'Ave Mujica', atmosphere: '暗色戏剧舞台，键盘把合唱压得很低',
    members: [
      { id: 'bang-uika', name: '三角初华', role: '主唱' },
      { id: 'bang-mutsumi', name: '若叶睦', role: '吉他' },
      { id: 'bang-umiri', name: '八幡海铃', role: '贝斯' },
      { id: 'bang-nyamu', name: '祐天寺若麦', role: '鼓' },
      { id: 'protagonist-sakiko', name: '丰川祥子', role: '键盘' },
    ],
  },
  { id: 'night-train', name: '夜行列车', atmosphere: '路人乐队，低沉吉他和拥挤的副歌', members: [] },
  { id: 'window-freq', name: '窗边频率', atmosphere: '路人乐队，轻快贝斯和像说话一样的主唱', members: [] },
  { id: 'third-string', name: '第三弦', atmosphere: '路人乐队，鼓点很满，间奏留给吉他', members: [] },
  { id: 'blue-box', name: '蓝盒子', atmosphere: '路人乐队，合唱很多，观众会跟着拍手', members: [] },
];

const REASONS = {
  already_watched: '这一场的票已经买过了。',
  show_started: '这一场已经开演，不能再买票。',
  show_ended: '这一场已经结束。',
  no_partner: '没有好感达到熟人的 MyGO 成员可以一起来。',
} as const;
export type LivehouseBlockedCode = keyof typeof REASONS | 'insufficient_balance' | 'insufficient_energy' | 'closed' | 'not_enough_time' | 'not_here' | 'unavailable';

export interface LivehouseVisitState {
  watched: { owner: ProtagonistId; showId: string }[];
  skill: Record<ProtagonistId, number>;
}

export interface LivehouseCommit {
  type: 'watch' | 'practice';
  owner: ProtagonistId;
  showId?: string;
  skillBefore: number;
  gain: number;
  partners: { contactId: string; name: string; affinityBefore: number; delta: number }[];
}

export interface LivehouseServiceFacts {
  summary: string;
  receipt: string;
  blockedCode: LivehouseBlockedCode | null;
  takiOnDuty: boolean;
  /** CiRCLE staff on the counter. Absent for the original live house. */
  marinaOnDuty?: boolean;
  skillBefore: number;
  skillGain: number;
  skillAfter: number;
  show: {
    id: string;
    label: string;
    actId: string;
    actName: string;
    atmosphere: string;
    members: { id: string; name: string; role: string; inAudience: boolean }[];
  } | null;
  partners: { id: string; name: string; affinity: number | null; eligible: boolean; here: boolean; affinityDelta: number }[];
  commit: LivehouseCommit | null;
}

const effects = (changes: Partial<LocationServiceEffects>): LocationServiceEffects => ({
  energy: 0, morale: 0, health: 0, stress: 0, satiety: 0, foodEnergy: 0, ...changes,
});

const hash = (value: string) => {
  let n = 2166136261;
  for (const c of value) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return n >>> 0;
};

export function emptyLivehouseVisit(): LivehouseVisitState {
  return {
    watched: [],
    skill: { soyo: 0, sakiko: 0, emma: 0, renako: 0 },
  };
}

export function instrumentSkill(state: Pick<WorldState, 'livehouseVisit' | 'protagonists'>, authority?: WorldState): number {
  const owner = visitOwner(state, authority);
  return state.livehouseVisit?.skill[owner] ?? authority?.livehouseVisit?.skill[owner] ?? 0;
}

export function isLivehouseVisitService(serviceId: string): boolean {
  return serviceId.startsWith('livehouse-watch-') || serviceId.startsWith('livehouse-practice-');
}

function visitOwner(state: Pick<WorldState, 'protagonists'>, authority?: WorldState): ProtagonistId {
  return state.protagonists?.accounts.active ?? authority?.protagonists?.accounts.active ?? 'soyo';
}

function minuteOf(clock: WorldState['clock']): number {
  return clock.hour * 60 + clock.minute;
}

export function takiOnDuty(clock: WorldState['clock']): boolean {
  const presence = residentPresence('bang-taki', clock);
  return !!presence?.available && presence.locationId === 'livehouse';
}

function showId(day: number, key: LiveShowKey): string {
  return `d${day}-${key}`;
}

/** Same game day always books the same two acts, and the two slots differ. */
export function liveBill(day: number): { key: LiveShowKey; act: Act }[] {
  const early = hash(`live-bill:${day}:1800`) % ACTS.length;
  let late = hash(`live-bill:${day}:1930`) % ACTS.length;
  if (late === early) late = (late + 1) % ACTS.length;
  return [
    { key: '1800', act: ACTS[early]! },
    { key: '1930', act: ACTS[late]! },
  ];
}

function practiceGain(skill: number, hours: PracticeHours, withBand: boolean): number {
  const room = Math.max(0, INSTRUMENT_SKILL_CAP - skill);
  if (room === 0) return 0;
  const base = hours === '1h' ? 6 : 10;
  const scaled = Math.max(1, Math.round(base * room / INSTRUMENT_SKILL_CAP));
  return Math.min(room, scaled + (withBand ? 1 : 0));
}

export interface PracticePartnerFact {
  id: string;
  name: string;
  contactId: string | null;
  affinity: number | null;
  eligible: boolean;
  here: boolean;
  affinityDelta: number;
}

export function practicePartners(state: WorldState): PracticePartnerFact[] {
  return MYGO_PARTNERS.map(person => {
    const contact = state.contacts.find(row => row.id === person.id || row.sourcePersonId === person.id);
    const here = takiLikeHere(person.id, state.clock);
    const affinity = contact?.affinity ?? null;
    const eligible = affinity !== null && affinity >= PRACTICE_AFFINITY_MIN;
    return {
      id: person.id,
      name: contact?.name ?? person.name,
      contactId: contact?.id ?? null,
      affinity,
      eligible,
      here,
      affinityDelta: eligible ? PRACTICE_AFFINITY_DELTA : 0,
    };
  });
}

function takiLikeHere(id: string, clock: WorldState['clock']): boolean {
  const presence = residentPresence(id, clock);
  return !!presence?.available && presence.locationId === 'livehouse';
}

function viewerId(owner: ProtagonistId): string {
  return owner === 'emma' ? 'majo-emma' : owner === 'renako' ? 'watanare-renako' : `protagonist-${owner}`;
}

function membersFor(act: Act, owner: ProtagonistId) {
  const viewer = viewerId(owner);
  return act.members.map(member => ({ ...member, inAudience: member.id === viewer }));
}

function watchedAlready(state: WorldState, owner: ProtagonistId, id: string, authority?: WorldState): boolean {
  const rows = state.livehouseVisit?.watched ?? authority?.livehouseVisit?.watched ?? [];
  return rows.some(row => row.owner === owner && row.showId === id);
}

/** Optional venue tune. Defaults keep the original Live House prices, bill and show ids. */
export interface LivehouseVenueTune {
  here?: (state: WorldState) => boolean;
  billDay?: number;
  showIdFor?: (day: number, key: LiveShowKey) => string;
  priceFor?: (price: number) => number;
  locationIds?: readonly string[];
  serviceId?: string;
  omitDutyNote?: boolean;
}

export function prepareLivehouseService(state: WorldState, serviceId: string, authority?: WorldState, tune?: LivehouseVenueTune): {
  service: LocationService;
  blockedReason: string | null;
  blockedCode: LivehouseBlockedCode | null;
  facts: LivehouseServiceFacts;
} | null {
  if (!isLivehouseVisitService(serviceId)) return null;
  const owner = visitOwner(state, authority);
  const skillBefore = instrumentSkill(state, authority);
  const duty = takiOnDuty(state.clock);
  const here = tune?.here ? tune.here(state) : state.locationId === 'livehouse';
  const priced = (amount: number) => tune?.priceFor ? tune.priceFor(amount) : amount;
  const dutyNote = tune?.omitDutyNote ? '' : (duty ? '椎名立希正在店里当班。' : '椎名立希此刻不在店里当班。');
  const watch = SHOW_SLOTS.find(slot => serviceId === `livehouse-watch-${slot.key}`);
  if (watch) {
    const billDay = tune?.billDay ?? state.clock.day;
    const act = liveBill(billDay).find(row => row.key === watch.key)!.act;
    const id = tune?.showIdFor ? tune.showIdFor(state.clock.day, watch.key) : showId(state.clock.day, watch.key);
    const now = minuteOf(state.clock);
    const end = watch.start + LIVEHOUSE_SHOW_MINUTES;
    const wait = Math.max(0, watch.start - now);
    const members = membersFor(act, owner);
    let blockedCode: LivehouseBlockedCode | null = watchedAlready(state, owner, id, authority) ? 'already_watched'
      : now >= end ? 'show_ended'
        : now >= watch.start ? 'show_started' : null;
    const blockedReason = blockedCode ? REASONS[blockedCode] : null;
    const audience = members.filter(member => member.inAudience).map(member => member.name);
    const ticket = priced(LIVEHOUSE_TICKET_PRICE);
    const summary = `${watch.label} 开演，${LIVEHOUSE_SHOW_MINUTES} 分钟，${act.name}。${act.atmosphere}。票价 ${ticket} 日元。${audience.length ? `${audience.join('、')}在观众席。` : ''}${dutyNote}`;
    const receipt = `看完 ${watch.label} 的${act.name}。${dutyNote}`;
    const service: LocationService = {
      id: tune?.serviceId ?? serviceId, locationIds: tune?.locationIds ?? ['livehouse'], label: `看 ${watch.label} 的演出`,
      description: '买票看这一场已经排好的演出。',
      minutes: blockedCode ? LIVEHOUSE_SHOW_MINUTES : wait + LIVEHOUSE_SHOW_MINUTES,
      price: ticket,
      completionDescription: receipt,
      effects: effects({ energy: -8, morale: 14, stress: -12, satiety: -4, foodEnergy: -40 }),
    };
    return {
      service, blockedReason: here ? blockedReason : null, blockedCode: here ? blockedCode : null,
      facts: {
        summary, receipt, blockedCode, takiOnDuty: duty, skillBefore, skillGain: 0, skillAfter: skillBefore,
        show: { id, label: watch.label, actId: act.id, actName: act.name, atmosphere: act.atmosphere, members },
        partners: [],
        commit: blockedCode ? null : { type: 'watch', owner, showId: id, skillBefore, gain: 0, partners: [] },
      },
    };
  }
  const hours = serviceId.includes('-2h') ? '2h' : '1h';
  const plan = PRACTICE_PLANS[hours];
  const together = serviceId.endsWith('-band');
  const partners = practicePartners(state);
  const joined = together ? partners.filter(person => person.eligible && person.contactId) : [];
  const baseGain = practiceGain(skillBefore, hours, joined.length > 0);
  const advisorRate = advisorModifierMultiplier(authority ?? state, owner, 'practice_skill_rate');
  const room = Math.max(0, INSTRUMENT_SKILL_CAP - skillBefore);
  const gain = advisorRate === 1 || baseGain === 0
    ? baseGain
    : Math.min(room, Math.max(1, Math.round(baseGain * advisorRate)));
  let blockedCode: LivehouseBlockedCode | null = together && joined.length === 0 ? 'no_partner' : null;
  const names = joined.map(person => person.name).join('、');
  const rent = priced(plan.price);
  const summary = `${plan.label}，${rent} 日元。乐器熟练度 ${skillBefore}，这场预计增加 ${gain}，上限 ${INSTRUMENT_SKILL_CAP}。${together ? (names ? `${names}可以一起来。` : '现在没有能一起来的熟人。') : '一个人练。'}${tune?.omitDutyNote ? '' : (duty ? '椎名立希正在店里当班。' : '')}`;
  const receipt = `${plan.label}。乐器熟练度 ${Math.min(INSTRUMENT_SKILL_CAP, skillBefore + gain)}。${names ? `${names}一起来，好感各 +${PRACTICE_AFFINITY_DELTA}。` : ''}`;
  const service: LocationService = {
    id: tune?.serviceId ?? serviceId, locationIds: tune?.locationIds ?? ['livehouse'], label: together ? `和熟人一起${plan.label}` : plan.label,
    description: together ? '按小时租练习室，并和愿意来的 MyGO 成员一起练。' : '按小时租练习室，一个人练。',
    minutes: plan.minutes, price: rent, completionDescription: receipt,
    effects: effects({ energy: plan.energy, morale: plan.morale, stress: plan.stress }),
  };
  return {
    service, blockedReason: here && blockedCode ? REASONS[blockedCode] : null, blockedCode: here ? blockedCode : null,
    facts: {
      summary, receipt, blockedCode, takiOnDuty: duty, skillBefore, skillGain: gain,
      skillAfter: Math.min(INSTRUMENT_SKILL_CAP, skillBefore + gain),
      show: null,
      partners: partners.map(person => ({
        id: person.id, name: person.name, affinity: person.affinity, eligible: person.eligible,
        here: person.here, affinityDelta: together && person.eligible ? person.affinityDelta : 0,
      })),
      commit: blockedCode ? null : {
        type: 'practice', owner, skillBefore, gain,
        partners: joined.map(person => ({
          contactId: person.contactId!, name: person.name, affinityBefore: person.affinity!, delta: person.affinityDelta,
        })),
      },
    },
  };
}

export function livehouseBlockedCode(reason: string | null, prepared: LivehouseBlockedCode | null): LivehouseBlockedCode | null {
  if (prepared) return prepared;
  if (!reason) return null;
  if (reason.startsWith('余额不足')) return 'insufficient_balance';
  if (reason.startsWith('精力不足')) return 'insufficient_energy';
  if (reason.includes('休息中') || reason.includes('开放时间')) return 'closed';
  if (reason.includes('距打烊')) return 'not_enough_time';
  if (reason.includes('不提供') || reason.includes('没有已设定')) return 'not_here';
  return 'unavailable';
}

/** Day sheet for the narrator. Settlement still happens only through the service. */
export function livehouseBill(state: WorldState, authority?: WorldState) {
  const owner = visitOwner(state, authority);
  const skill = instrumentSkill(state, authority);
  return {
    hours: LIVEHOUSE_HOURS,
    instrumentSkill: skill,
    instrumentSkillCap: INSTRUMENT_SKILL_CAP,
    takiOnDuty: takiOnDuty(state.clock),
    shows: liveBill(state.clock.day).map(row => {
      const slot = SHOW_SLOTS.find(item => item.key === row.key)!;
      const id = showId(state.clock.day, row.key);
      return {
        id, label: slot.label, actId: row.act.id, actName: row.act.name, atmosphere: row.act.atmosphere,
        members: membersFor(row.act, owner),
        watched: watchedAlready(state, owner, id, authority),
        serviceId: `livehouse-watch-${row.key}`,
      };
    }),
    partners: practicePartners(state).map(person => ({
      id: person.id, name: person.name, affinity: person.affinity, eligible: person.eligible, here: person.here,
    })),
    practiceServices: ['livehouse-practice-1h', 'livehouse-practice-2h', 'livehouse-practice-1h-band', 'livehouse-practice-2h-band'],
    rule: '买票、租房、熟练度和好感只有在对应 service 保存成功后才成立。阵容、当班、好感是否够格都以上面的字段为准。',
  };
}

export function applyLivehouseVisit(state: WorldState, commit: LivehouseCommit): void {
  const visit = state.livehouseVisit ?? emptyLivehouseVisit();
  if ((visit.skill[commit.owner] ?? 0) !== commit.skillBefore) throw new Error('乐器熟练度已变化，请重新确认。');
  if (commit.type === 'watch') {
    const show = commit.showId;
    if (!show || visit.watched.some(row => row.owner === commit.owner && row.showId === show)) throw new Error(REASONS.already_watched);
    visit.watched.push({ owner: commit.owner, showId: show });
    if (visit.watched.length > 400) visit.watched.splice(0, visit.watched.length - 400);
  } else {
    visit.skill[commit.owner] = Math.min(INSTRUMENT_SKILL_CAP, commit.skillBefore + commit.gain);
    for (const partner of commit.partners) {
      const contact = state.contacts.find(row => row.id === partner.contactId);
      if (!contact || contact.affinity !== partner.affinityBefore) throw new Error('一起练习的好感已变化，请重新确认。');
      contact.affinity = Math.min(100, contact.affinity + partner.delta);
    }
  }
  state.livehouseVisit = visit;
}

export function parseLivehouseVisit(raw: unknown): LivehouseVisitState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('存档格式无效：livehouseVisit。原存档已保留，请先备份并检查数据。');
  const row = raw as Record<string, unknown>;
  const keys = Object.keys(row);
  if (keys.length !== 2 || keys.some(key => key !== 'watched' && key !== 'skill')) throw new Error('存档格式无效：livehouseVisit 字段。原存档已保留，请先备份并检查数据。');
  if (!Array.isArray(row.watched) || row.watched.length > 400) throw new Error('存档格式无效：livehouseVisit.watched。原存档已保留，请先备份并检查数据。');
  const watched = row.watched.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('存档格式无效：livehouseVisit.watched。原存档已保留，请先备份并检查数据。');
    const entry = item as Record<string, unknown>;
    if (Object.keys(entry).length !== 2 || !PROTAGONISTS.includes(entry.owner as ProtagonistId)) throw new Error('存档格式无效：livehouseVisit.watched。原存档已保留，请先备份并检查数据。');
    if (typeof entry.showId !== 'string' || !/^(?:circle-)?d\d+-(1800|1930)$/.test(entry.showId)) throw new Error('存档格式无效：livehouseVisit.watched。原存档已保留，请先备份并检查数据。');
    return { owner: entry.owner as ProtagonistId, showId: entry.showId };
  });
  if (new Set(watched.map(item => `${item.owner}:${item.showId}`)).size !== watched.length) throw new Error('存档格式无效：livehouseVisit.watched。原存档已保留，请先备份并检查数据。');
  const skillRow = row.skill;
  if (!skillRow || typeof skillRow !== 'object' || Array.isArray(skillRow)) throw new Error('存档格式无效：livehouseVisit.skill。原存档已保留，请先备份并检查数据。');
  const skill = skillRow as Record<string, unknown>;
  if (Object.keys(skill).length !== PROTAGONISTS.length || PROTAGONISTS.some(id => !Object.hasOwn(skill, id))) throw new Error('存档格式无效：livehouseVisit.skill。原存档已保留，请先备份并检查数据。');
  const parsed = emptyLivehouseVisit();
  parsed.watched = watched;
  for (const id of PROTAGONISTS) {
    const value = skill[id];
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > INSTRUMENT_SKILL_CAP) throw new Error('存档格式无效：livehouseVisit.skill。原存档已保留，请先备份并检查数据。');
    parsed.skill[id] = value;
  }
  return parsed;
}
