import type { PlayerState, WorldState } from '../frontend/types';
import { recordWeeklyEvidence } from './weekly-memory';
import { adjustEnergy } from './energy';
import { getActivityEffects } from './activity-effects';
import { TOKYO_DELIVERY_FEE } from './tokyo-world';
import { advancePlayerNutrition, getInventoryCatalog, getStoreItem, storeCatalog } from './convenience-store';
import { appiePayBalance, applyCardTransaction, FICTIONAL_CARDS, PROTAGONISTS, type ProtagonistId } from './dual-protagonists';
import { getAcademicTimetable } from './academics';
import { gameWeekday, hasStartedAcademicWeek } from './game-calendar';
import { isJapanesePublicHoliday } from './japan-calendar-events';
import { applyStoryActions, getNovelTravelQuote, reduceState } from './model';
import { activeProtagonist, gameMinute, legacyView, otherProtagonist, otherProtagonists, personalState, personState, protagonistNearby, protagonistNames, protagonistsNearby, reduceProtagonistAction, settlePhoneTime, type PersonalState, type PhoneCommand } from './protagonist-world';
import { protagonistSceneId, protagonistsInTalkingRange } from './world-presence';
import { agendaTargetProtagonist } from './social-agenda';
import { protagonistHomeRooms } from './natural-interactions';
export { protagonistsNearby } from './protagonist-world';

export type BackgroundEventKind = 'routine' | 'rest' | 'meal' | 'travel' | 'study' | 'calendar' | 'order' | 'message' | 'decision';
export interface BackgroundEvent { id: string; at: number; kind: BackgroundEventKind; text: string }
interface Arrival extends Pick<PersonalState, 'locationId' | 'scene' | 'interior' | 'transit'> { fareCents: number; energyCost: number }
interface BackgroundActivity {
  id: string;
  kind: 'routine' | 'rest' | 'meal' | 'travel' | 'study';
  start: number;
  due: number;
  target: string;
  label: string;
  origin: string;
  calendarKey: string;
  arrival: Arrival | null;
  routeContext: { player: PlayerState; journalLength: number } | null;
}
export interface BackgroundPerson {
  nextDecisionAt: number;
  pending: BackgroundActivity | null;
  calendarSeen: string[];
  lastMessageDay: number;
  events: BackgroundEvent[];
}
export interface BackgroundLife {
  version: 1;
  cursor: number;
  people: Record<ProtagonistId, BackgroundPerson>;
}

const EVENT_LIMIT = 48;
const MAX_MINUTE = 525_599_999;
const nextQuarter = (at: number) => Math.min(MAX_MINUTE, (Math.floor(at / 15) + 1) * 15);
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const clockAt = (at: number): WorldState['clock'] => ({ day: Math.floor(at / 1440) + 1, hour: Math.floor(at % 1440 / 60), minute: at % 60 });
const atLabel = (at: number) => { const c = clockAt(at); return `第 ${c.day} 天 ${String(c.hour).padStart(2, '0')}:${String(c.minute).padStart(2, '0')}`; };
const pose = (p: PersonalState) => JSON.stringify([p.locationId, p.scene && [p.scene.x, p.scene.z, p.scene.yaw, p.scene.areaId], p.interior && [p.interior.roomId, p.interior.x, p.interior.z, p.interior.yaw], p.transit.sequence]);
const stamp = (text: string) => { let hash = 2166136261; for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619); return (hash >>> 0).toString(16); };

export function createBackgroundLife(at: number): BackgroundLife {
  const person = (): BackgroundPerson => ({ nextDecisionAt: nextQuarter(at), pending: null, calendarSeen: [], lastMessageDay: 0, events: [] });
  return { version: 1, cursor: at, people: { soyo: person(), sakiko: person(), emma: person(), renako: person() } };
}

/** The save parser accepts the old 1.12 two-person shape, then starts here at its current clock. */
export function initializeBackgroundLife(state: WorldState): BackgroundLife {
  const life = createBackgroundLife(gameMinute(state));
  for (const owner of PROTAGONISTS) {
    // Do not replay already-past one-off appointments on migration.
    life.people[owner].calendarSeen = appointments(state, owner, life.cursor)
      .filter(event => event.start < life.cursor && event.source !== 'academic').map(event => event.key).slice(-200);
  }
  return life;
}

export function parseBackgroundLife(value: unknown, base: WorldState, parseLegacy: (value: unknown) => WorldState, allowMissingOptional = false): BackgroundLife {
  const fail = (): never => { throw new Error('三主角状态：后台生活记录无效'); };
  const object = (value: unknown, keys: string[]) => {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length || Object.keys(value).some(key => !keys.includes(key))) return fail();
    return value as Record<string, unknown>;
  };
  const integer = (value: unknown, max = MAX_MINUTE) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= max ? value : fail();
  const text = (value: unknown, max: number, empty = false) => typeof value === 'string' && (empty || value.trim()) && value.length <= max && !/[\u0000-\u001f]/.test(value) ? value : fail();
  const row = object(value, ['version', 'cursor', 'people']);
  if (row.version !== 1) return fail();
  const cursor = integer(row.cursor);
  if (cursor !== gameMinute(base)) return fail();
  const hasEmma = !!row.people && typeof row.people === 'object' && !Array.isArray(row.people) && Object.hasOwn(row.people, 'emma');
  const hasRenako = !!row.people && typeof row.people === 'object' && !Array.isArray(row.people) && Object.hasOwn(row.people, 'renako');
  const expectedKeys = allowMissingOptional
    ? ['soyo', 'sakiko', ...(hasEmma ? ['emma'] : []), ...(hasRenako ? ['renako'] : [])]
    : ['soyo', 'sakiko', 'emma', 'renako'];
  const people = object(row.people, expectedKeys);
  const parsePerson = (raw: unknown, owner: ProtagonistId): BackgroundPerson => {
    const p = object(raw, ['nextDecisionAt', 'pending', 'calendarSeen', 'lastMessageDay', 'events']);
    const nextDecisionAt = integer(p.nextDecisionAt);
    if (nextDecisionAt < cursor) return fail();
    if (!Array.isArray(p.calendarSeen) || p.calendarSeen.length > 200 || !Array.isArray(p.events) || p.events.length > EVENT_LIMIT) return fail();
    const calendarSeen = p.calendarSeen.map(key => text(key, 240));
    if (new Set(calendarSeen).size !== calendarSeen.length) return fail();
    const events = p.events.map(raw => {
      const e = object(raw, ['id', 'at', 'kind', 'text']);
      const kind = text(e.kind, 20) as BackgroundEventKind;
      if (!['routine', 'rest', 'meal', 'travel', 'study', 'calendar', 'order', 'message', 'decision'].includes(kind)) return fail();
      const at = integer(e.at); if (at > cursor) return fail();
      const id = text(e.id, 120);
      if (!id.startsWith(`bg:${owner}:`) && !id.startsWith(`dual:bg:${owner}:`)) return fail();
      return { id, at, kind, text: text(e.text, 480) };
    });
    if (new Set(events.map(event => event.id)).size !== events.length || events.some((event, i) => i > 0 && event.at < events[i - 1].at)) return fail();
    let pending: BackgroundActivity | null = null;
    if (p.pending !== null) {
      const q = object(p.pending, ['id', 'kind', 'start', 'due', 'target', 'label', 'origin', 'calendarKey', 'arrival', 'routeContext']);
      const kind = text(q.kind, 20) as BackgroundActivity['kind'];
      if (!['routine', 'rest', 'meal', 'travel', 'study'].includes(kind)) return fail();
      const start = integer(q.start), due = integer(q.due);
      if (start > cursor || due <= cursor || due - start > 1440 || due <= start) return fail();
      let arrival: Arrival | null = null;
      let routeContext: BackgroundActivity['routeContext'] = null;
      if (kind === 'travel') {
        const a = object(q.arrival, ['locationId', 'scene', 'interior', 'transit', 'fareCents', 'energyCost']);
        const restored = parseLegacy({ ...base, schema_version: '1.11.0', clock: clockAt(due), locationId: a.locationId, scene: a.scene, interior: a.interior, transit: a.transit });
        const energyCost = typeof a.energyCost === 'number' && a.energyCost >= 0 && a.energyCost <= 100 && Math.abs(Math.round(a.energyCost * 100) / 100 - a.energyCost) < 1e-7 ? a.energyCost : fail();
        arrival = { locationId: restored.locationId, scene: restored.scene, interior: restored.interior, transit: restored.transit, fareCents: integer(a.fareCents, 2000000000), energyCost };
        if (q.target !== arrival.locationId) return fail();
        const context = object(q.routeContext, ['player', 'journalLength']);
        routeContext = { player: parseLegacy({ ...base, schema_version: '1.11.0', player: context.player }).player, journalLength: integer(context.journalLength, 100) };
      } else if (q.arrival !== null || q.routeContext !== null) return fail();
      const calendarKey = text(q.calendarKey, 240, kind !== 'travel' && kind !== 'study');
      if (q.id !== `bg:${owner}:${start}:${kind}`) return fail();
      pending = { id: text(q.id, 80), kind, start, due, target: text(q.target, 100, true), label: text(q.label, 160), origin: text(q.origin, 1000), calendarKey, arrival, routeContext };
    }
    return { nextDecisionAt, pending, calendarSeen, lastMessageDay: integer(p.lastMessageDay, clockAt(cursor).day), events };
  };
  const emptyPerson = (): BackgroundPerson => ({ nextDecisionAt: nextQuarter(cursor), pending: null, calendarSeen: [], lastMessageDay: 0, events: [] });
  const result: BackgroundLife = {
    version: 1,
    cursor,
    people: {
      soyo: parsePerson(people.soyo, 'soyo'),
      sakiko: parsePerson(people.sakiko, 'sakiko'),
      emma: hasEmma ? parsePerson(people.emma, 'emma') : emptyPerson(),
      renako: hasRenako ? parsePerson(people.renako, 'renako') : emptyPerson(),
    },
  };
  return result;
}

/** Only the requested owner's events are exposed; callers must not serialize the whole background state into a prompt. */
export function backgroundLifeSummary(state: WorldState, owner: ProtagonistId = activeProtagonist(state)): BackgroundEvent[] {
  return copy(state.protagonists?.backgroundLife?.people[owner].events.slice(-8) ?? []);
}

function record(state: WorldState, owner: ProtagonistId, event: BackgroundEvent) {
  const p = state.protagonists!.backgroundLife!.people[owner];
  if (p.events.some(previous => previous.id === event.id)) return;
  recordWeeklyEvidence(state, owner, event);
  p.events.push(event); p.events = p.events.slice(-EVENT_LIMIT);
  const personal = personState(state, owner);
  if (!personal.journal.some(entry => entry.id === event.id)) personal.journal.push({ id: event.id, text: event.text, at: atLabel(event.at) });
  const storyIds = new Set(personal.story.filter(entry => entry.role === 'assistant').map(entry => entry.id));
  while (personal.journal.length > 100) {
    const index = personal.journal.findIndex(entry => { const match = /^(.*):wa:[0-9a-f]{24}$/.exec(entry.id); return !match || !storyIds.has(match[1]); });
    personal.journal.splice(index < 0 ? 0 : index, 1);
  }
}

/** A switch hands unfinished autonomous plans back to the player; it never completes a trip or pays on their behalf. */
export function suspendBackgroundActivity(state: WorldState, owner: ProtagonistId) {
  const life = state.protagonists?.backgroundLife;
  if (!life) return;
  const p = life.people[owner], at = gameMinute(state);
  if (p.pending) record(state, owner, { id: `${p.pending.id}:handoff`, at, kind: 'decision', text: `尚未完成的安排交回本人：${p.pending.label}。位置、未消费物品与未支付款项保持当前记录。` });
  p.pending = null; p.nextDecisionAt = nextQuarter(at);
}

interface Appointment { key: string; title: string; locationId: string; start: number; duration: number; source: 'calendar' | 'schedule' | 'academic'; subjectId?: string; shared: boolean; departAt?: number }
function appointments(state: WorldState, owner: ProtagonistId, at: number): Appointment[] {
  const p = state.protagonists!;
  const personal = personState(state, owner), day = Math.floor(at / 1440), others = otherProtagonists(owner);
  const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  const sharedName = (title: string) => others.some(other => ({ soyo: /素世|soyo/i, sakiko: /祥子|sakiko/i, emma: /艾玛|emma/i, renako: /玲奈子|甘织|renako/i })[other].test(title));
  const sharedCalendar = (event: { locationId: string; start: number; duration: number }) => others.some(other => p.devices[other].calendar.some(otherEvent => otherEvent.locationId === event.locationId && otherEvent.start < event.start + event.duration && event.start < otherEvent.start + otherEvent.duration));
  const calendar: Appointment[] = p.devices[owner].calendar.map(event => ({ ...event,
    key: `calendar:${event.id}:${event.start}:${stamp(JSON.stringify([event.title, event.locationId, event.duration]))}`, source: 'calendar',
    shared: sharedName(event.title) || sharedCalendar(event),
  }));
  const schedule: Appointment[] = personal.schedule.filter(event => !event.done).map(event => ({
    key: `schedule:${stamp(JSON.stringify(event))}`, title: event.title, locationId: event.locationId, start: day * 1440 + toMinutes(event.time), duration: 30, source: 'schedule', shared: sharedName(event.title),
  }));
  const academic: Appointment[] = getAcademicTimetable(personal.academics).filter(slot => hasStartedAcademicWeek(day + 1) && !isJapanesePublicHoliday(day + 1) && slot.weekday === gameWeekday(day + 1)).map(slot => ({
    key: `academic:${slot.id}:${day}`, title: slot.subjectName, locationId: slot.locationId, start: day * 1440 + toMinutes(slot.start), duration: toMinutes(slot.end) - toMinutes(slot.start), source: 'academic', subjectId: slot.subjectId, shared: false,
  }));
  // Existing playable-background planner follows the invited protagonist's
  // saved intention. Two ordinary travel appointments reuse its route quote,
  // wallet checks, nutrition settlement and recorded arrival, not a teleport.
  const social:Appointment[]=(state.protagonists?.socialInvitations??[])
    .filter(row=>row.status==='accepted' && row.agenda?.status==='scheduled' &&
      agendaTargetProtagonist(state,row)===owner)
    .flatMap(row=>{
      const depart=row.agenda!.steps.find(step=>step.kind==='depart')!;
      const arrive=row.agenda!.steps.find(step=>step.kind==='arrive')!;
      const leave=row.agenda!.steps.find(step=>step.kind==='leave')!;
      const meeting:Appointment={key:'agenda:'+row.id+':'+row.agenda!.revision,
        title:'与'+protagonistNames[row.owner]+'约好的见面',
        locationId:row.locationId,start:arrive.at,duration:Math.max(1,leave.at-arrive.at),
        source:'calendar',shared:false,departAt:depart.at};
      const returning:Appointment={key:'agenda-return:'+row.id+':'+row.agenda!.revision,
        title:'约定结束后离开',locationId:protagonistHomeRooms[owner],
        start:leave.at,duration:120,source:'calendar',shared:false,departAt:leave.at};
      return [meeting,returning];
    });
  return [...calendar, ...schedule, ...social, ...academic].sort((a, b) => a.start - b.start || a.key.localeCompare(b.key));
}

/** Use the existing authoritative phone command reducer as the actual owner, then restore the foreground projection. */
function ownPhone(state: WorldState, owner: ProtagonistId, at: number, id: string, command: PhoneCommand) {
  const activeId = activeProtagonist(state), p = state.protagonists!, life = p.backgroundLife;
  const ownerOthers = otherProtagonists(owner);
  const view = copy(state);
  Object.assign(view, personalState(personState(state, owner)));
  view.clock = clockAt(at);
  view.protagonists!.inactive = personalState(personState(state, ownerOthers[0]));
  view.protagonists!.third = personalState(personState(state, ownerOthers[1]));
  view.protagonists!.fourth = personalState(personState(state, ownerOthers[2]));
  view.protagonists!.accounts.active = owner;
  const result = reduceProtagonistAction(view, { type: 'phone_app', requestId: id, owner, command });
  const ownerState = personalState(result);
  const updatedOthers: Record<string, PersonalState> = {
    [ownerOthers[0]]: personalState(result.protagonists!.inactive),
    [ownerOthers[1]]: personalState(result.protagonists!.third),
    [ownerOthers[2]]: personalState(result.protagonists!.fourth),
  };
  const restoredActive = updatedOthers[activeId]!;
  const nonActive = otherProtagonists(activeId);
  const states: Record<string, PersonalState> = { ...updatedOthers, [owner]: ownerState };
  Object.assign(p, result.protagonists, {
    backgroundLife: life,
    inactive: states[nonActive[0]]!,
    third: states[nonActive[1]]!,
    fourth: states[nonActive[2]]!,
  });
  p.accounts.active = activeId;
  Object.assign(state, restoredActive);
}

function ownedView(state: WorldState, owner: ProtagonistId, at: number): WorldState {
  return { ...legacyView(state), ...personalState(personState(state, owner)), clock: clockAt(at) };
}

function pay(state: WorldState, owner: ProtagonistId, id: string, cents: number, note: string) {
  const p = state.protagonists!;
  if (appiePayBalance(p.accounts, owner) < cents) throw new Error('本人余额不足');
  let accounts = p.accounts, remaining = cents;
  for (const card of FICTIONAL_CARDS) {
    const amount = Math.min(remaining, accounts.people[owner].cards[card]);
    if (amount) accounts = applyCardTransaction(accounts, { id: `${id}:${card}`, actor: owner, card, deltaCents: -amount, note });
    remaining -= amount;
  }
  p.accounts = accounts;
  personState(state, owner).player.balance = appiePayBalance(accounts, owner) / 100;
}

function complete(state: WorldState, owner: ProtagonistId, activity: BackgroundActivity) {
  const personal = personState(state, owner), p = state.protagonists!.backgroundLife!.people[owner], at = activity.due;
  const minutes = activity.due - activity.start;
  p.pending = null; p.nextDecisionAt = nextQuarter(at);
  try {
    if (pose(personal) !== activity.origin) throw new Error('位置或行程已改变');
    const appointment = activity.calendarKey ? appointments(state, owner, activity.start).find(event => event.key === activity.calendarKey) : null;
    if (activity.calendarKey && !appointment) throw new Error('原日程已变更');
    if (activity.kind === 'travel') {
      const arrival = activity.arrival!;
      if (!appointment || appointment.locationId !== activity.target || !activity.routeContext) throw new Error('行程与原日程不一致');
      const context = activity.routeContext;
      const expectedBody = advancePlayerNutrition(context.player, clockAt(activity.start), minutes);
      if ((['energy', 'health', 'stress', 'morale', 'satiety', 'foodEnergy'] as const).some(key => expectedBody[key] !== personal.player[key])) throw new Error('出发条件已改变');
      // Rebuild the deterministic route from its start-time inputs; a stored arrival is never trusted as a state patch.
      const departure = ownedView(state, owner, activity.start);
      departure.player = { ...context.player, balance: personal.player.balance };
      departure.journal = Array.from({ length: context.journalLength }, (_, index) => ({ id: `bg-route-${index}`, text: '出发时的记录占位，用于确定同一条路线。', at: atLabel(activity.start) }));
      const quote = getNovelTravelQuote(departure, activity.target);
      if (quote.blockedReason || quote.minutes !== minutes || Math.round(quote.fare * 100) !== arrival.fareCents || quote.energyCost !== arrival.energyCost) throw new Error('原路线报价已失效');
      const checked = reduceState(departure, { type: 'novel_travel', locationId: activity.target }, owner);
      if (JSON.stringify([checked.locationId, checked.scene, checked.interior, checked.transit]) !== JSON.stringify([arrival.locationId, arrival.scene, arrival.interior, arrival.transit])) throw new Error('到达记录与实际路线不符');
      pay(state, owner, activity.id, arrival.fareCents, `后台出行：${activity.label}`);
      personal.player.energy = adjustEnergy(personal.player.energy, -arrival.energyCost);
      Object.assign(personal, copy({ locationId: arrival.locationId, scene: arrival.scene, interior: arrival.interior, transit: arrival.transit }));
    } else if (activity.kind === 'meal') {
      const item = getStoreItem(activity.target), owned = personal.inventory.find(row => row.itemId === activity.target);
      if (!item || item.category === 'cigarette' || !owned?.quantity || personal.player.health < -item.effects.health || minutes !== item.useMinutes) throw new Error('原食物已不可用');
      personal.inventory = personal.inventory.flatMap(row => row !== owned ? [row] : row.quantity > 1 ? [{ ...row, quantity: row.quantity - 1 }] : []);
      personal.player.energy = adjustEnergy(personal.player.energy, item.effects.energy);
      for (const key of ['satiety', 'health', 'stress'] as const) personal.player[key] = Math.max(0, Math.min(100, personal.player[key] + item.effects[key]));
      personal.player.morale = Math.max(0, Math.min(100, personal.player.morale + (item.effects.morale ?? 0)));
      personal.player.foodEnergy = Math.min(3000, personal.player.foodEnergy + item.kcal);
    } else if (activity.kind === 'study') {
      if (appointment?.source !== 'academic' || appointment.subjectId !== activity.target || activity.start < appointment.start || activity.due > appointment.start + appointment.duration) throw new Error('学习安排与本人课表不一致');
      const outcome = applyStoryActions(ownedView(state, owner, activity.start), [{ type: 'study', subjectId: activity.target, minutes }], activity.id, owner);
      // Nutrition has already advanced through this interval, once, below.
      const { foodEnergy, satiety } = personal.player;
      personal.player = { ...outcome.player, foodEnergy, satiety };
      personal.academics = outcome.academics; personal.interior = outcome.interior;
    } else {
      if (minutes !== 30) throw new Error('日常活动时长无效');
      const changes = getActivityEffects(activity.kind === 'rest' ? 'rest' : 'bookshelf', minutes);
      for (const key of ['morale', 'stress', 'health'] as const) personal.player[key] = Math.max(0, Math.min(100, personal.player[key] + changes[key]));
      if (activity.kind === 'rest') personal.player.energy = adjustEnergy(personal.player.energy, Math.floor(minutes * .4));
    }
    record(state, owner, { id: activity.id, at, kind: activity.kind, text: `${activity.label}，用了 ${minutes} 分钟。${activity.kind === 'travel' ? '已按实际路线到达，车费由本人 Appie Pay 支付。' : ''}` });
  } catch (error) {
    record(state, owner, { id: activity.id, at, kind: 'decision', text: `${activity.label}未执行：${error instanceof Error ? error.message : '条件变化'}。留待本人决定。` });
  }
}

function nextReservedAppointmentAt(state: WorldState, owner: ProtagonistId, at: number, fallback: number): number {
  const life = state.protagonists!.backgroundLife!.people[owner];
  const personal = personState(state, owner);
  const appointment = appointments(state, owner, at).find(event =>
    !life.calendarSeen.includes(event.key) &&
    (event.start <= at + 90 || event.departAt !== undefined && event.departAt <= at + 90));
  if (!appointment) return fallback;
  const critical = /和解|决裂|告白|分手|结婚|离婚|退学|签约|辞职|借款|贷款|重大|争执/.test(appointment.title);
  if (!appointment.shared && !critical && at < appointment.start + appointment.duration && personal.locationId !== appointment.locationId) {
    const view = ownedView(state, owner, at), quote = getNovelTravelQuote(view, appointment.locationId);
    const departureAt = appointment.departAt === undefined ? appointment.start - quote.minutes :
      Math.max(appointment.departAt, appointment.start - quote.minutes);
    return Math.min(fallback, departureAt);
  }
  return Math.min(fallback, appointment.start);
}

function choose(state: WorldState, owner: ProtagonistId, at: number, reserved = false) {
  const p = state.protagonists!, life = p.backgroundLife!.people[owner];
  life.nextDecisionAt = nextQuarter(at);
  const id = (kind: string) => `bg:${owner}:${at}:${kind}`;
  const plan = (kind: BackgroundActivity['kind'], minutes: number, label: string, target = '', calendarKey = '', arrival: Arrival | null = null) => {
    if (at + minutes > MAX_MINUTE) return;
    const personal = personState(state, owner);
    life.pending = { id: id(kind), kind, start: at, due: at + minutes, target, label, origin: pose(personal), calendarKey, arrival,
      routeContext: kind === 'travel' ? { player: { ...personal.player }, journalLength: personal.journal.length } : null };
    life.nextDecisionAt = at + minutes;
  };
  const seen = (key: string) => { life.calendarSeen = [...life.calendarSeen.filter(old => old !== key), key].slice(-200); };
  const nourish = (): boolean => {
    // Phone operations may replace this personal projection; read the owner afresh.
    const current = personState(state, owner);
    if (current.player.satiety > 40) return false;
    const foods = getInventoryCatalog().filter(item => item.category !== 'cigarette' && item.effects.satiety > 0 && current.inventory.some(row => row.itemId === item.id && row.quantity > 0));
    const food = foods.find(item => item.category === 'meal') ?? foods[0];
    if (food) { plan('meal', food.useMinutes, `吃了自己背包中的${food.name}`, food.id); return true; }
    const outstanding = p.orders.some(order => order.owner === owner && (order.status === 'paid' || order.status === 'delivered') && storeCatalog.some(item => item.id === order.itemId && item.category !== 'cigarette'));
    if (!outstanding && p.devices[owner].notifications.length < 198 && p.orders.length < 500 && p.operations.length < 1998) {
      const preference = owner === 'soyo' ? ['meal-standard', 'meal-basic'] : ['meal-basic', 'meal-standard'];
      const item = preference.map(itemId => storeCatalog.find(item => item.id === itemId)!).find(item => FICTIONAL_CARDS.some(card => p.accounts.people[owner].cards[card] >= Math.round((item.price + TOKYO_DELIVERY_FEE) * 100)));
      if (item) {
        const card = FICTIONAL_CARDS.find(card => p.accounts.people[owner].cards[card] >= Math.round((item.price + TOKYO_DELIVERY_FEE) * 100))!;
        try {
          ownPhone(state, owner, at, id('order'), { type: 'order', kind: 'delivery', itemId: item.id, quantity: 1, card, address: current.locationId });
          record(state, owner, { id: id('order'), at, kind: 'order', text: `用自己的 Appie Pay 订了${item.name}，支付 ${item.price + TOKYO_DELIVERY_FEE} 日元（含配送费），送到自己当前的地点。` });
          return true;
        } catch { /* An unavailable address or balance remains a local pending choice. */ }
      }
    }
    // Existing deliveries can finish while the owner continues her other activities.
    return false;
  };

  if (!reserved) {
    for (const order of [...p.orders]) {
      if (order.owner !== owner || order.status !== 'delivered' || order.address !== personState(state, owner).locationId) continue;
      try {
        ownPhone(state, owner, at, id(`receive-${stamp(order.id)}`), { type: 'receive_order', id: order.id });
        record(state, owner, { id: id(`received-${stamp(order.id)}`), at, kind: 'order', text: '在订单记录的收货地点领到了自己的包裹，物品已放入本人背包。' });
      } catch { /* A full inventory or receipt log leaves the same delivered order for manual collection. */ }
    }

    // A factual, modest daily message. Sending it is a shared event; both sides retain the same source ID.
    const day = Math.floor(at / 1440) + 1;
    if (at % 1440 >= 1080 && at % 1440 < 1260 && life.lastMessageDay !== day && !protagonistsNearby(state)
      && owner === otherProtagonists(activeProtagonist(state))[0]) {
      const recipient = personState(state, otherProtagonist(owner));
      if (recipient.phone.length < 200 && recipient.contacts.length < 50 && p.devices[otherProtagonist(owner)].notifications.length < 200 && p.operations.length < 2000) {
        const text = owner === 'soyo' ? '我这边先照顾一下自己的安排。你忙完后，方便的话给我留个消息。' : '我会先处理自己的安排。若有需要协调的事，请给我留言。';
        try {
          ownPhone(state, owner, at, id('message'), { type: 'send_message', text });
          record(state, owner, { id: `dual:${id('message')}`, at, kind: 'message', text: `给${protagonistNames[otherProtagonist(owner)]}发了消息：${text}` });
          life.lastMessageDay = day;
        } catch { /* No automatic retry loop or substitution with someone else's account. */ }
      }
    }

    if (personState(state, owner).player.satiety <= 20 && nourish()) return;
  }
  const personal = personState(state, owner);
  const appointment = appointments(state, owner, at).find(event =>
    !life.calendarSeen.includes(event.key) &&
    (event.start <= at + 90 || event.departAt!==undefined && event.departAt <= at + 90));
  if (appointment) {
    const critical = /和解|决裂|告白|分手|结婚|离婚|退学|签约|辞职|借款|贷款|重大|争执/.test(appointment.title);
    if ((appointment.shared || critical) && at >= appointment.start) {
      seen(appointment.key);
      record(state, owner, { id: id('calendar'), at, kind: 'decision', text: `日程「${appointment.title}」需要本人参与或双方协调，已保留为待决事项。` });
      return;
    }
    if (!appointment.shared && !critical && at < appointment.start + appointment.duration && personal.locationId !== appointment.locationId) {
      const view = ownedView(state, owner, at), quote = getNovelTravelQuote(view, appointment.locationId);
      const departureAt=appointment.departAt===undefined ? appointment.start-quote.minutes :
        Math.max(appointment.departAt,appointment.start-quote.minutes);
      if (at >= departureAt) {
        if (quote.blockedReason || quote.minutes <= 0) {
          seen(appointment.key);
          record(state, owner, { id: id('calendar'), at, kind: 'decision', text: `日程「${appointment.title}」的出行暂缓：${quote.blockedReason ?? '当前路线需要本人处理'}。` });
        } else {
          const arrival = reduceState(view, { type: 'novel_travel', locationId: appointment.locationId }, owner);
          plan('travel', quote.minutes, `为日程「${appointment.title}」前往目标地点`, appointment.locationId, appointment.key, { locationId: arrival.locationId, scene: arrival.scene, interior: arrival.interior, transit: arrival.transit, fareCents: Math.round(quote.fare * 100), energyCost: quote.energyCost });
        }
        return;
      }
      // Do not start a thirty-minute filler activity across the planned departure.
      life.nextDecisionAt = Math.min(nextQuarter(at), Math.max(at + 1, departureAt));
      return;
    } else if (at >= appointment.start) {
      seen(appointment.key);
      if (appointment.source === 'academic' && appointment.subjectId && personal.locationId === appointment.locationId && at < appointment.start + appointment.duration && personal.player.energy >= Math.ceil((appointment.start + appointment.duration - at) / 6)) {
        plan('study', appointment.start + appointment.duration - at, `按自己的课表学习${appointment.title}`, appointment.subjectId, appointment.key);
      } else {
        record(state, owner, { id: id('calendar'), at, kind: 'calendar', text: `日程「${appointment.title}」已到时${personal.locationId === appointment.locationId ? '，本人在安排的地点' : '，本人尚未到达安排的地点'}；具体行动留待本人决定。` });
      }
      return;
    }
    if (appointment.start > at && appointment.start - at < 30) {
      life.nextDecisionAt = appointment.start;
      return;
    }
  }
  if (reserved) return;

  if (nourish()) return;
  const current = personState(state, owner);
  if (current.player.energy <= 35 || at % 1440 >= 1380 || at % 1440 < 360) {
    plan('rest', 30, '在当前地点安静休息');
  } else {
    plan('routine', 30, owner === 'soyo' ? '独自读了会儿随身文字，整理自己的日常安排' : owner === 'renako' ? '独自玩了会儿掌机游戏，缓和紧绷的社交神经' : '独自梳理了练习内容与下一段日程');
  }
}

/** Advance each background person on the one committed game timeline. No timers, network, or model calls. */
export function settleBackgroundLife(before: WorldState, state: WorldState, reservedOtherSide?: ReadonlySet<ProtagonistId>) {
  const p = state.protagonists!;
  const start = gameMinute(before), end = gameMinute(state), activeId = activeProtagonist(state);
  const life = p.backgroundLife ?? (p.backgroundLife = initializeBackgroundLife(before));
  if (end < start || life.cursor !== start) throw new Error('三主角状态：后台时钟与世界时钟不一致');
  if (end === start) return;
  const foreground = life.people[activeId];
  foreground.pending = null; foreground.nextDecisionAt = nextQuarter(end);
  for (const owner of otherProtagonists(activeId)) settleBackgroundPerson(before, state, owner, start, end, reservedOtherSide?.has(owner) ?? false);
  life.cursor = end;
}

function advanceBackgroundPlayer(state: WorldState, owner: ProtagonistId, from: number, minutes: number) {
  if (minutes <= 0) return;
  const personal = personState(state, owner);
  personal.player = advancePlayerNutrition(personal.player, clockAt(from), minutes);
}

function belongsToForegroundScene(state: WorldState, owner: ProtagonistId): boolean {
  // Switching viewpoints preserves the encounter in the previous owner's save.
  const selected = state.scene?.encounterId === protagonistSceneId(owner)
    || personState(state, owner).scene?.encounterId === protagonistSceneId(activeProtagonist(state));
  return protagonistNearby(state, owner) || selected
    && protagonistsInTalkingRange(state).some(person => person.protagonistId === owner);
}

function settleBackgroundPerson(before: WorldState, state: WorldState, owner: ProtagonistId, start: number, end: number, reserved = false) {
  const p = state.protagonists!, life = p.backgroundLife!, background = life.people[owner];
  // A shared physical scene belongs to the foreground narrator, including arrivals during this action.
  if (belongsToForegroundScene(before, owner) || belongsToForegroundScene(state, owner)) {
    if (background.pending) suspendBackgroundActivity(state, owner);
    advanceBackgroundPlayer(state, owner, start, end - start);
    background.nextDecisionAt = nextQuarter(end); return;
  }
  let cursor = start, lastChosenAt = -1;
  while (cursor < end) {
    const rawDecisionAt = reserved && !background.pending
      ? nextReservedAppointmentAt(state, owner, cursor, background.nextDecisionAt)
      : background.nextDecisionAt;
    const decisionAt = lastChosenAt === cursor ? Math.max(cursor + 1, rawDecisionAt) : Math.max(cursor, rawDecisionAt);
    const dueOrder = p.orders.filter(order => order.owner === owner && order.status === 'paid' && order.due > cursor).reduce((nearest, order) => Math.min(nearest, order.due), end);
    const boundary = Math.min(end, dueOrder, background.pending?.due ?? decisionAt);
    if (boundary > cursor) advanceBackgroundPlayer(state, owner, cursor, boundary - cursor);
    cursor = boundary; life.cursor = cursor;
    settlePhoneTime({ ...state, clock: clockAt(cursor) });
    if (background.pending && background.pending.due === cursor) complete(state, owner, background.pending);
    if (belongsToForegroundScene(state, owner)) {
      // A completed trip can join the foreground in the middle of one long wait.
      // Do not continue private automation through the remainder of that shared scene.
      advanceBackgroundPlayer(state, owner, cursor, end - cursor);
      background.pending = null; background.nextDecisionAt = nextQuarter(end);
      return;
    }
    const nextDecision = reserved && !background.pending
      ? nextReservedAppointmentAt(state, owner, cursor, background.nextDecisionAt)
      : background.nextDecisionAt;
    if (!background.pending && nextDecision <= cursor && lastChosenAt !== cursor) {
      lastChosenAt = cursor;
      choose(state, owner, cursor, reserved);
    }
    if (background.nextDecisionAt <= cursor && !background.pending) background.nextDecisionAt = nextQuarter(cursor);
  }
}
