import type { GeneratedStory, Location, WorldAction, WorldState } from '../frontend/types';
import { STORY_OUTPUT_LIMITS, validateGeneratedStory } from './story-protocol';

/** Bounded P0/P1 save format. All names and places below are prototype examples. */
export const STATE_LIMITS = { journal: 100, story: 40, phone: 200, ...STORY_OUTPUT_LIMITS } as const;
export const locations: Location[] = [
  { id: 'gate', name: '校园南门', subtitle: '城市与校园的交界', description: '【示例场景】傍晚的光落在校门旁。公告栏有新贴的海报，路口传来单车铃声。', x: 46, y: 75 },
  { id: 'library', name: '图书馆', subtitle: '安静的公共空间', description: '【示例场景】阅览室里亮起暖灯。书页翻动的声音很轻，窗边还有空着的位置。', x: 36, y: 28 },
  { id: 'cafe', name: '街角咖啡店', subtitle: '放慢一点也可以', description: '【示例场景】玻璃门后是低低的交谈声。店员正在擦拭吧台，靠街的桌子空着。', x: 76, y: 64 },
  { id: 'dorm', name: '学生公寓', subtitle: '属于自己的日常', description: '【示例场景】楼道里有人提着晚餐经过。窗外的天色渐渐暗了，桌上还有没整理的笔记。', x: 70, y: 23 },
];

export interface RouteOutlook {
  extraMinutes: number;
  event: null | { kind: 'traffic' | 'special'; title: string; description: string };
}

/** Reproducible demo outlook: opening the map never rerolls a route or changes the save. */
export function getRouteOutlook(state: WorldState, targetId: string): RouteOutlook {
  if (targetId === state.locationId || !locations.some(location => location.id === targetId)) return { extraMinutes: 0, event: null };
  const seed = ['unread-city-route-v1:2', state.clock.day, state.clock.hour, state.clock.minute, state.locationId, targetId, state.journal.length].join('|');
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index++) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const sample = (hash >>> 0) % 100;
  if (sample < 20) {
    return (hash & 1) === 0
      ? { extraMinutes: 10, event: { kind: 'traffic', title: '路口施工', description: '【演示路况】前方路口正在施工，需要沿旁边的人行道绕行。' } }
      : { extraMinutes: 15, event: { kind: 'traffic', title: '下课人流', description: '【演示路况】下课的人流集中经过路口，步行速度暂时放慢。' } };
  }
  if (sample < 35) {
    return ((hash >>> 8) & 1) === 0
      ? { extraMinutes: 5, event: { kind: 'special', title: '行人问路', description: '【演示路遇】一位行人停下来问路，途中多停留了片刻。' } }
      : { extraMinutes: 5, event: { kind: 'special', title: '临时校园活动', description: '【演示路遇】路边正举行临时校园活动，经过时短暂停留。' } };
  }
  return { extraMinutes: 0, event: null };
}

export function createInitialState(): WorldState {
  return {
    schema_version: '1.0.0', clock: { day: 1, hour: 17, minute: 20 }, locationId: 'gate',
    player: { energy: 80, balance: 328 },
    phone: [
      { id: 'phone-lin', npcId: 'lin', text: '【示例剧情消息】我在图书馆整理笔记。你经过的话，可以来坐一会儿。', read: false, at: '第 1 天 17:12' },
      { id: 'phone-zhou', npcId: 'zhou', text: '【示例剧情消息】社团活动的时间暂定今晚六点，在街角咖啡店。', read: false, at: '第 1 天 17:16' },
    ],
    contacts: [
      { id: 'lin', name: '林同学', tag: '演示 NPC · 同学', summary: '用于验证人物档案、消息与关系展示的示例。正式身份和经历尚待作者确认。', affinity: 12, status: '正在图书馆整理笔记' },
      { id: 'zhou', name: '周同学', tag: '演示 NPC · 社团成员', summary: '用于验证社交入口与日程的示例人物。原型不会让一次行动自动改变所有关系。', affinity: 5, status: '准备晚间的社团活动' },
    ],
    schedule: [
      { id: 'library-notes', title: '【演示】去图书馆整理笔记', locationId: 'library', time: '17:30', done: false },
      { id: 'club-meet', title: '【演示】社团见面', locationId: 'cafe', time: '18:00', done: false },
    ],
    journal: [{ id: 'entry-1', text: '开始原型体验。人物、地点及安排均为演示内容，可在源码中替换。', at: '第 1 天 17:20' }],
    story: [{ id: 'opening', role: 'assistant', text: '【原型示例】傍晚的风穿过校园南门。手机轻震了两下。你可以先读消息、去一个地方，或留在这里说出自己的行动。' }],
  };
}

function invalid(path: string): never { throw new Error(`存档格式无效：${path}。原存档已保留，请先备份并检查数据。`); }
function object(value: unknown, keys: string[], path: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return invalid(path);
  const ownKeys = Object.keys(value);
  if (ownKeys.length !== keys.length || ownKeys.some(key => !keys.includes(key))) return invalid(`${path} 字段`);
  return value as Record<string, unknown>;
}
function text(value: unknown, path: string, max = 1000): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || value.includes('\u0000')) return invalid(path);
  return value;
}
function id(value: unknown, path: string): string {
  const result = text(value, path, 128);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(result)) return invalid(path);
  return result;
}
function number(value: unknown, path: string, min: number, max: number, integer = true): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) return invalid(path);
  return value;
}
function boolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') return invalid(path);
  return value;
}
function list<T extends { id: string }>(value: unknown, path: string, max: number, parse: (item: unknown, path: string) => T): T[] {
  if (!Array.isArray(value) || value.length > max) return invalid(path);
  const result = value.map((item, index) => parse(item, `${path}[${index}]`));
  if (new Set(result.map(item => item.id)).size !== result.length) return invalid(`${path} ID 重复`);
  return result;
}
function place(value: unknown, path: string): string {
  const result = id(value, path);
  if (!locations.some(location => location.id === result)) return invalid(path);
  return result;
}
function time(value: unknown, path: string): string {
  const result = text(value, path, 5);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(result)) return invalid(path);
  return result;
}

/** Reconstruct known fields; never merge untrusted save objects into live state. */
export function parseState(value: unknown): WorldState {
  const state = object(value, ['schema_version', 'clock', 'locationId', 'player', 'phone', 'contacts', 'schedule', 'journal', 'story'], 'state');
  if (state.schema_version !== '1.0.0') return invalid('schema_version（仅支持 1.0.0）');
  const clock = object(state.clock, ['day', 'hour', 'minute'], 'clock');
  const player = object(state.player, ['energy', 'balance'], 'player');
  const result: WorldState = {
    schema_version: '1.0.0',
    clock: { day: number(clock.day, 'clock.day', 1, 365000), hour: number(clock.hour, 'clock.hour', 0, 23), minute: number(clock.minute, 'clock.minute', 0, 59) },
    locationId: place(state.locationId, 'locationId'),
    player: { energy: number(player.energy, 'player.energy', 0, 100), balance: number(player.balance, 'player.balance', 0, 1_000_000, false) },
    phone: list(state.phone, 'phone', STATE_LIMITS.phone, (value, path) => {
      const item = object(value, ['id', 'npcId', 'text', 'read', 'at'], path);
      return { id: id(item.id, `${path}.id`), npcId: id(item.npcId, `${path}.npcId`), text: text(item.text, `${path}.text`, 4000), read: boolean(item.read, `${path}.read`), at: text(item.at, `${path}.at`, 40) };
    }),
    contacts: list(state.contacts, 'contacts', 50, (value, path) => {
      const item = object(value, ['id', 'name', 'tag', 'summary', 'affinity', 'status'], path);
      return { id: id(item.id, `${path}.id`), name: text(item.name, `${path}.name`, 80), tag: text(item.tag, `${path}.tag`, 80), summary: text(item.summary, `${path}.summary`, 2000), affinity: number(item.affinity, `${path}.affinity`, -100, 100), status: text(item.status, `${path}.status`, 200) };
    }),
    schedule: list(state.schedule, 'schedule', 100, (value, path) => {
      const item = object(value, ['id', 'title', 'locationId', 'time', 'done'], path);
      return { id: id(item.id, `${path}.id`), title: text(item.title, `${path}.title`, 200), locationId: place(item.locationId, `${path}.locationId`), time: time(item.time, `${path}.time`), done: boolean(item.done, `${path}.done`) };
    }),
    journal: list(state.journal, 'journal', STATE_LIMITS.journal, (value, path) => {
      const item = object(value, ['id', 'text', 'at'], path);
      return { id: id(item.id, `${path}.id`), text: text(item.text, `${path}.text`, 1000), at: text(item.at, `${path}.at`, 40) };
    }),
    story: list(state.story, 'story', STATE_LIMITS.story, (value, path) => {
      const item = object(value, ['id', 'role', 'text'], path);
      if (item.role !== 'user' && item.role !== 'assistant') return invalid(`${path}.role`);
      return { id: id(item.id, `${path}.id`), role: item.role, text: text(item.text, `${path}.text`, STATE_LIMITS.storyText) };
    }),
  };
  if (result.phone.some(message => !result.contacts.some(contact => contact.id === message.npcId))) return invalid('phone.npcId 引用');
  return result;
}

/**
 * Build one atomic world snapshot. The caller saves this snapshot once, then
 * delivers its persisted phone records. Retrying delivery keeps the same IDs.
 * The 1.0 save shape is unchanged; existing contacts/messages keep their IDs.
 */
export function commitStoryTurn(
  state: WorldState,
  input: string,
  result: GeneratedStory,
  ids: { userId: string; assistantId: string },
): WorldState {
  const next = parseState(state);
  if (typeof input !== 'string' || !input.trim() || input.length > STATE_LIMITS.inputText || input.includes('\u0000')) {
    throw new Error(`请输入 1–${STATE_LIMITS.inputText} 字的行动。`);
  }
  const reply = validateGeneratedStory(result, next);
  // Leave room for the stable message suffix within the 128-char save ID limit.
  const validId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(value);
  if (!ids || !validId(ids.userId) || !validId(ids.assistantId) || ids.userId === ids.assistantId) throw new Error('剧情记录 ID 无效；本轮未写入。');
  const inputText = input.trim();
  const existingUser = next.story.find(entry => entry.id === ids.userId);
  const existingAssistant = next.story.find(entry => entry.id === ids.assistantId);
  if (existingUser || existingAssistant) {
    if (existingUser?.role === 'user' && existingUser.text === inputText && existingAssistant?.role === 'assistant' && existingAssistant.text === reply.text) {
      const unchanged = reply.phoneMessages.every((message, index) => {
        const existing = next.phone.find(item => item.id === `${ids.assistantId}:phone:${index}`);
        return existing && existing.npcId === message.npcId && existing.text === message.text;
      });
      const prefix = `${ids.assistantId}:phone:`;
      if (unchanged && next.phone.filter(item => item.id.startsWith(prefix)).length === reply.phoneMessages.length) return next;
    }
    throw new Error('剧情记录 ID 冲突；本轮未写入。');
  }
  const at = `第 ${next.clock.day} 天 ${String(next.clock.hour).padStart(2, '0')}:${String(next.clock.minute).padStart(2, '0')}`;
  const messages = reply.phoneMessages.map((message, index) => ({
    id: `${ids.assistantId}:phone:${index}`, npcId: message.npcId, text: message.text, read: false, at,
  }));
  if (messages.some(message => next.phone.some(existing => existing.id === message.id))) throw new Error('手机消息 ID 冲突；本轮未写入。');
  // Prune only acknowledged records from this bounded delivery list. The phone
  // owns its history; this function never deletes messages in its storage.
  let excess = Math.max(0, next.phone.length + messages.length - STATE_LIMITS.phone);
  if (next.phone.filter(message => message.read).length < excess) throw new Error('未读剧情消息已满，请先阅读手机消息后重试。本轮正文和消息均未写入。');
  next.phone = next.phone.filter(message => {
    if (excess > 0 && message.read) { excess--; return false; }
    return true;
  });
  next.phone.push(...messages);
  next.story.push(
    { id: ids.userId, role: 'user', text: inputText },
    { id: ids.assistantId, role: 'assistant', text: reply.text },
  );
  next.story = next.story.slice(-STATE_LIMITS.story);
  return parseState(next);
}

/** Read receipts can only mark known message IDs; unknown/stale IDs do nothing. */
export function acknowledgePhoneRead(state: WorldState, ids: readonly string[]): WorldState {
  const next = parseState(state);
  if (!Array.isArray(ids) || ids.length > STATE_LIMITS.phone || ids.some(value => typeof value !== 'string')) throw new Error('手机已读回执无效，世界存档未更新。');
  const received = new Set(ids);
  for (const message of next.phone) if (received.has(message.id)) message.read = true;
  return next;
}

function advance(state: WorldState, minutes: number) {
  const next = state.clock.hour * 60 + state.clock.minute + minutes;
  state.clock = { day: state.clock.day + Math.floor(next / 1440), hour: Math.floor(next / 60) % 24, minute: next % 60 };
  if (state.clock.day > 365000) throw new Error('原型已到达最大天数，无法继续推进。');
}
function note(state: WorldState, message: string) {
  const prefix = `entry-${state.clock.day}-${state.clock.hour}-${state.clock.minute}-`;
  const occupied = new Set(state.journal.map(entry => entry.id));
  let sequence = 1;
  while (occupied.has(`${prefix}${sequence}`)) sequence++;
  const at = `第 ${state.clock.day} 天 ${String(state.clock.hour).padStart(2, '0')}:${String(state.clock.minute).padStart(2, '0')}`;
  state.journal = [...state.journal, { id: `${prefix}${sequence}`, text: message, at }].slice(-STATE_LIMITS.journal);
}

/**
 * Prototype rules: travel costs 15 min plus the deterministic route outlook / 5 energy; waiting 1..120 min restores
 * 2 energy per complete 15 min. Reading costs no time. A schedule item is a
 * one-off task: complete at its location at/after its HH:mm on the current day.
 * There is no recurrence, deadline, relationship reward or LLM state mutation.
 */
export function reduceState(state: WorldState, action: WorldAction): WorldState {
  const next = parseState(state);
  if (!action || typeof action !== 'object') throw new Error('无效行动。');
  switch (action.type) {
    case 'travel': {
      if (!locations.some(location => location.id === action.locationId)) throw new Error('不存在的地点。');
      if (next.locationId === action.locationId) return next;
      if (next.player.energy < 5) throw new Error('精力不足，请先等待休息。');
      const outlook = getRouteOutlook(next, action.locationId);
      const minutes = 15 + outlook.extraMinutes;
      advance(next, minutes); next.player.energy -= 5; next.locationId = action.locationId;
      const eventNote = outlook.event ? `途中遇到${outlook.event.title}，额外停留 ${outlook.extraMinutes} 分钟。${outlook.event.description}` : '';
      note(next, `前往${locations.find(location => location.id === action.locationId)!.name}，步行耗时 ${minutes} 分钟。${eventNote}`);
      break;
    }
    case 'wait':
      if (!Number.isInteger(action.minutes) || action.minutes < 1 || action.minutes > 120) throw new Error('等待时间必须是 1–120 的整数分钟。');
      advance(next, action.minutes); next.player.energy = Math.min(100, next.player.energy + Math.floor(action.minutes / 15) * 2);
      note(next, `休息等待 ${action.minutes} 分钟。`);
      break;
    case 'read_phone': {
      const message = next.phone.find(message => message.id === action.id);
      if (!message) throw new Error('找不到这条消息。');
      if (message.read) return next;
      message.read = true;
      note(next, `读了${next.contacts.find(contact => contact.id === message.npcId)!.name}的消息。`);
      break;
    }
    case 'complete_schedule': {
      const item = next.schedule.find(item => item.id === action.id);
      if (!item) throw new Error('找不到这项日程。');
      if (item.done) return next;
      if (next.locationId !== item.locationId) throw new Error('请先到达日程地点。');
      const [hour, minute] = item.time.split(':').map(Number);
      if (next.clock.hour * 60 + next.clock.minute < hour * 60 + minute) throw new Error('尚未到日程时间。');
      item.done = true; note(next, `完成日程：${item.title}。`);
      break;
    }
    default: throw new Error('不支持的行动。');
  }
  return next;
}
