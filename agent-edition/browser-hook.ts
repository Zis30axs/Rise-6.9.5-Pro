/**
 * Thin Tavern Helper stand-in for the development host.
 * generate() does not call a model. It waits until inject() receives the raw
 * upstream text, then the real bridge parses and commits that text.
 */
import type { StoryAction, WorldState } from '../src/frontend/types';
import type { ShellHandle } from '../src/frontend/lifecycle';

type ShellApi = {
  getShell(): ShellHandle | undefined;
  close(): void;
  open(): void;
};
type Kind = 'story' | 'autonomous_sms' | 'other';
type Pending = {
  id: string;
  userInput: string;
  system: string;
  kind: Kind;
  resolve(value: string): void;
  reject(error: Error): void;
};
type RequestLog = { id: string; kind: Kind; at: number; userInput: string; system: string };
type ReplyLog = { id: string; kind: Kind; at: number; rawText: string };
type SceneSpec = {
  openingMajorId?: string;
  protagonist?: 'soyo' | 'sakiko' | 'emma' | 'renako';
  majorId?: string;
  locationId?: string;
  clock?: { day?: number; hour?: number; minute?: number };
  relationships?: { npcId: string; delta: number; reason: string }[];
};
type ScenarioRow = { name: string; chatId: string; variables: Record<string, unknown>; savedAt: number };

const run = new URLSearchParams(location.search).get('run') || 'local';
const safeRun = /^[a-z0-9-]{1,40}$/.test(run) ? run : 'local';
const memoryName = `unread-city-agent-${safeRun}`;
const scenarioDbName = 'unread-city-agent-scenarios-v1';
(window as Window & { __unreadCityMemoryDb?: string }).__unreadCityMemoryDb = memoryName;
if (new URLSearchParams(location.search).get('presentation') === 'novel') {
  localStorage.setItem('unread-city.presentation-mode.v1', 'novel');
}

const chats = new Map<string, Record<string, unknown>>();
const listeners = new Map<string, Set<() => void>>();
const requests: RequestLog[] = [];
const replies: ReplyLog[] = [];
let pending: Pending | null = null;
let shellApi: ShellApi | undefined;
let saves = 0;

function parentWindow() {
  return window.parent as Window & {
    SillyTavern?: { getContext(): { chatId: string } };
    __unreadCityAgentSetChat?: (id: string) => void;
  };
}
function currentId() {
  const id = parentWindow().SillyTavern?.getContext().chatId;
  if (typeof id !== 'string' || !id.startsWith('agent-')) throw new Error('开发存档编号无效');
  return id;
}
function getVariables() {
  const id = currentId();
  let row = chats.get(id);
  if (!row) {
    row = { keep_agent: true };
    chats.set(id, row);
  }
  return row;
}
function replaceVariables(next: Record<string, unknown>) {
  if (!next || typeof next !== 'object' || Array.isArray(next)) throw new Error('聊天变量不可写入');
  chats.set(currentId(), next);
  saves += 1;
}
function classify(userInput: string, system: string): Kind {
  if (userInput.includes('主动短信子任务上下文') || system.includes('独立运行的私人短信子任务')) return 'autonomous_sms';
  if (system.includes('<story>') || userInput.includes('玩家本次行动')) return 'story';
  return 'other';
}
function generate(config: { generation_id?: string; user_input?: string; injects?: { content?: string }[] }) {
  const id = String(config.generation_id || 'agent-generation');
  const userInput = String(config.user_input ?? '');
  const system = (config.injects ?? []).map(item => String(item?.content ?? '')).join('\n');
  const kind = classify(userInput, system);
  return new Promise<string>((resolve, reject) => {
    pending = { id, userInput, system, kind, resolve, reject };
    requests.push({ id, kind, at: Date.now(), userInput, system });
    if (requests.length > 12) requests.shift();
  });
}
function stopGenerationById(id: string) {
  if (!pending) return false;
  if (pending.id !== id && !pending.id.startsWith(String(id))) return false;
  const current = pending;
  pending = null;
  const error = new Error('请求已取消或聊天已切换，回复已丢弃。');
  error.name = 'AbortError';
  current.reject(error);
  return true;
}
function requireShell() {
  if (!shellApi) throw new Error('游戏尚未启动');
  return shellApi;
}
function stateFromShell(): WorldState | null {
  return shellApi?.getShell()?.model.state ?? null;
}
function summarize(state: WorldState | null) {
  if (!state) return null;
  const active = state.protagonists?.accounts.active ?? 'soyo';
  const court = state.courtroom;
  const career = court?.careers?.[active];
  const board = court?.board && court.board.day === state.clock.day ? court.board.offers.map(offer => offer.title) : [];
  return {
    protagonist: active,
    clock: { ...state.clock },
    locationId: state.locationId,
    interior: state.interior?.roomId ?? null,
    majorId: state.academics?.majorId ?? null,
    subjects: (state.academics?.subjects ?? []).map(subject => ({ ...subject })),
    energy: state.player.energy,
    balance: state.player.balance,
    health: state.player.health,
    stress: state.player.stress,
    morale: state.player.morale,
    satiety: state.player.satiety,
    foodEnergy: state.player.foodEnergy,
    inventory: state.inventory.map(item => ({ ...item })),
    phone: state.phone.map(message => ({ npcId: message.npcId, text: message.text, read: message.read })),
    affinities: state.contacts.map(contact => ({ id: contact.id, name: contact.name, affinity: contact.affinity })),
    storyCount: state.story.length,
    storyTail: state.story.slice(-4).map(row => ({ role: row.role, text: row.text.slice(0, 800) })),
    enrolled: !!career?.enrolled,
    qualification: career?.qualification ?? null,
    boardTitles: board,
  };
}
function snapshotState(): WorldState | null {
  const saved = getVariables().unread_city;
  if (!saved || typeof saved !== 'object') return stateFromShell();
  return saved as WorldState;
}

async function buildScene(spec: SceneSpec): Promise<WorldState> {
  const game = await import('../src/runtime/model.ts');
  let state = game.createInitialState();
  if (spec.openingMajorId) state = game.reduceState(state, { type: 'choose_academics', majorId: spec.openingMajorId });
  if (spec.protagonist && spec.protagonist !== 'soyo') state = game.reduceState(state, { type: 'switch_protagonist', target: spec.protagonist });
  if (spec.majorId && !state.academics) state = game.reduceState(state, { type: 'choose_academics', majorId: spec.majorId });
  if (spec.locationId && spec.locationId !== state.locationId) state = game.reduceState(state, { type: 'novel_travel', locationId: spec.locationId });
  if (spec.relationships?.length) {
    const actions: StoryAction[] = spec.relationships.map(row => ({
      type: 'relationship', npcId: row.npcId, delta: row.delta, reason: row.reason,
    }));
    state = game.applyStoryActions(state, actions, 'agent-init');
  }
  if (spec.clock) {
    const target = { ...state.clock, ...spec.clock };
    const from = (state.clock.day - 1) * 1440 + state.clock.hour * 60 + state.clock.minute;
    const to = (target.day - 1) * 1440 + target.hour * 60 + target.minute;
    let left = to - from;
    if (left < 0) throw new Error('测试场景只能把时间向前推进');
    let index = 0;
    while (left > 0) {
      const minutes = Math.min(left, 10080);
      state = game.applyStoryActions(state, [{ type: 'rest', kind: 'wait', minutes }], `agent-init-clock-${index}`);
      left -= minutes;
      index += 1;
    }
  }
  return state;
}
function openScenarioDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(scenarioDbName, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('scenarios')) db.createObjectStore('scenarios', { keyPath: 'name' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('无法打开测试场景库'));
  });
}

const api = {
  databaseName: () => memoryName,
  scenarioDatabaseName: () => scenarioDbName,
  saves: () => saves,
  status() {
    const shell = shellApi?.getShell();
    return {
      ready: !!shell,
      busy: !!shell?.model.busy,
      notice: shell?.model.notice ?? '',
      switching: !!shell?.model.switchingProtagonist,
      database: memoryName,
    };
  },
  pending() {
    if (!pending) return null;
    return { id: pending.id, kind: pending.kind, userInput: pending.userInput, system: pending.system };
  },
  inject(rawText: string) {
    if (typeof rawText !== 'string' || !rawText.trim()) throw new Error('上游回复不能为空');
    if (!pending) throw new Error('当前没有等待处理的上游回复');
    const current = pending;
    pending = null;
    replies.push({ id: current.id, kind: current.kind, at: Date.now(), rawText });
    current.resolve(rawText);
    return { id: current.id, kind: current.kind };
  },
  summary() { return summarize(stateFromShell()); },
  savedSummary() { return summarize(snapshotState()); },
  readState() {
    const state = snapshotState();
    return state ? JSON.parse(JSON.stringify(state)) as WorldState : null;
  },
  logs() {
    return {
      saves,
      requests: requests.map(item => ({ id: item.id, kind: item.kind, at: item.at, userInput: item.userInput.slice(0, 1500) })),
      replies: replies.map(item => ({ ...item })),
    };
  },
  async initScene(spec: SceneSpec) {
    const state = await buildScene(spec);
    const shell = requireShell();
    shell.close();
    replaceVariables({ ...getVariables(), unread_city: state });
    shell.open();
    return summarize(state);
  },
  newGame() {
    const shell = requireShell();
    const id = `agent-${Date.now().toString(36)}`;
    shell.close();
    parentWindow().__unreadCityAgentSetChat?.(id);
    chats.set(id, { keep_agent: true });
    shell.open();
    return id;
  },
  async saveScenario(name: string) {
    if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(name)) throw new Error('场景名称只使用小写英文、数字和连字符');
    const db = await openScenarioDb();
    const row: ScenarioRow = {
      name, chatId: currentId(), variables: JSON.parse(JSON.stringify(getVariables())) as Record<string, unknown>, savedAt: Date.now(),
    };
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('scenarios', 'readwrite');
      tx.objectStore('scenarios').put(row);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('测试场景保存失败'));
    });
    return { name, chatId: row.chatId };
  },
  async restoreScenario(name: string) {
    const db = await openScenarioDb();
    const row = await new Promise<ScenarioRow | undefined>((resolve, reject) => {
      const tx = db.transaction('scenarios', 'readonly');
      const request = tx.objectStore('scenarios').get(name);
      request.onsuccess = () => resolve(request.result as ScenarioRow | undefined);
      request.onerror = () => reject(request.error ?? new Error('测试场景读取失败'));
    });
    if (!row) throw new Error('没有这个测试场景');
    const shell = requireShell();
    shell.close();
    parentWindow().__unreadCityAgentSetChat?.(row.chatId);
    chats.set(row.chatId, JSON.parse(JSON.stringify(row.variables)) as Record<string, unknown>);
    shell.open();
    return { name, chatId: row.chatId };
  },
  async databaseNames() {
    const listed = await indexedDB.databases?.() ?? [];
    return listed.map(item => item.name ?? '');
  },
};

const helper = window as Window & {
  tavern_events?: { CHAT_CHANGED: string };
  getVariables?: typeof getVariables;
  replaceVariables?: typeof replaceVariables;
  eventOn?: (name: string, callback: () => void) => void;
  eventRemoveListener?: (name: string, callback: () => void) => void;
  getButtonEvent?: (name: string) => string;
  generate?: typeof generate;
  generateRaw?: (config: { generation_id?: string; ordered_prompts?: { role?: string; content?: string }[] }) => Promise<string>;
  stopGenerationById?: typeof stopGenerationById;
  __unreadCityAgentHook?: (next: ShellApi) => void;
  __unreadCityAgentBridge?: typeof api;
};
helper.tavern_events = { CHAT_CHANGED: 'chat_id_changed' };
helper.getVariables = getVariables;
helper.replaceVariables = (next: Record<string, unknown>) => replaceVariables(next);
helper.eventOn = (name, callback) => {
  const set = listeners.get(name) ?? new Set<() => void>();
  set.add(callback);
  listeners.set(name, set);
};
helper.eventRemoveListener = (name, callback) => { listeners.get(name)?.delete(callback); };
helper.getButtonEvent = name => `button:${name}`;
helper.generate = generate;
helper.generateRaw = config => {
  const prompts = config.ordered_prompts ?? [];
  const system = prompts.filter(item => item.role === 'system').map(item => String(item.content ?? '')).join('\n');
  const userInput = prompts.filter(item => item.role !== 'system').map(item => String(item.content ?? '')).join('\n');
  return generate({ generation_id: config.generation_id, user_input: userInput, injects: [{ content: system }] });
};
helper.stopGenerationById = stopGenerationById;
helper.__unreadCityAgentHook = next => { shellApi = next; };
helper.__unreadCityAgentBridge = api;

await import('../src/frontend/main.ts');
