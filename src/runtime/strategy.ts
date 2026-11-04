/**
 * Deterministic offline focus-system foundation. No LLM calls, timers or UI side effects.
 * Four playable owners are bootstrapped today; other registered characters can be added
 * through a catalog without changing the condition/modifier/state machinery.
 */
export type StrategyOwner = 'soyo' | 'sakiko' | 'emma' | 'renako' | (string & {});
const DEFAULT_OWNERS = ['soyo', 'sakiko', 'emma', 'renako'] as const;
export type Condition =
  | { always: boolean }
  | { all: readonly Condition[] }
  | { any: readonly Condition[] }
  | { not: Condition }
  | { flag: string; equals?: boolean }
  | { stat: string; gte?: number; lte?: number }
  | { completed: string }
  | { hasSpirit: string }
  | { hasTrait: string };
export type ModifierTarget = 'focus_ai_weight' | 'focus_progress_rate' | 'social_xp_rate';
export interface StrategyModifier {
  target: ModifierTarget;
  operation: 'add' | 'multiply';
  amount: number;
  focusId?: string;
  when?: Condition;
}
export interface SpiritDefinition { id: string; title: string; modifiers: readonly StrategyModifier[]; activeWhen?: Condition }
export interface TraitDefinition { id: string; title: string; modifiers: readonly StrategyModifier[] }
export type StrategyEffect =
  | { type: 'set_flag'; key: string; value: boolean }
  | { type: 'add_stat'; key: string; amount: number }
  | { type: 'add_spirit'; id: string; durationMinutes?: number }
  | { type: 'remove_spirit'; id: string };
export interface FocusDefinition {
  id: string;
  owner: StrategyOwner;
  title: string;
  durationMinutes: number;
  prerequisites?: Condition;
  available?: Condition;
  cancel?: Condition;
  bypass?: Condition;
  aiWeight: number;
  aiModifiers?: readonly { when: Condition; add: number }[];
  onComplete?: readonly StrategyEffect[];
}
export interface DecisionDefinition {
  id: string;
  owner: StrategyOwner;
  title: string;
  available: Condition;
  cooldownMinutes?: number;
  effects: readonly StrategyEffect[];
}
export interface FocusRun { id: string; startedAt: number; progress: number }
export interface SpiritInstance { id: string; grantedAt: number; expiresAt: number | null }
export interface StrategyPerson {
  controller: 'manual' | 'auto';
  includeInPrompt: boolean;
  active: FocusRun | null;
  completed: string[];
  traits: string[];
  spirits: SpiritInstance[];
  decisionUsedAt: Record<string, number>;
}
export interface StrategyHistory {
  id: string;
  at: number;
  owner: StrategyOwner;
  kind: 'start' | 'complete' | 'cancel' | 'bypass' | 'decision' | 'spirit_expired';
  subject: string;
}
export interface StrategyState {
  version: 1;
  cursor: number;
  flags: Record<string, boolean>;
  stats: Record<string, number>;
  people: Record<StrategyOwner, StrategyPerson>;
  receipts: { id: string; command: string }[];
  history: StrategyHistory[];
}
export type StrategyCommand =
  | { type: 'set_control'; owner: StrategyOwner; controller: 'manual' | 'auto'; includeInPrompt: boolean }
  | { type: 'start_focus'; owner: StrategyOwner; focusId: string }
  | { type: 'cancel_focus'; owner: StrategyOwner }
  | { type: 'choose_decision'; owner: StrategyOwner; decisionId: string };

/** Registered world facts, not arbitrary paths into the save file. */
export const STRATEGY_FLAGS = [
  'sakiko_final_break', 'crychic_reunited', 'soyo_looked_back', 'soyo_rebuild_plan_ready',
  'sakiko_band_plan_ready', 'emma_circle_plan_ready', 'renako_circle_plan_ready',
] as const;
export const STRATEGY_STATS = ['soyo_resolve', 'sakiko_resolve', 'emma_trust', 'renako_confidence'] as const;

/** Demonstration routes are plans, not forced claims about other people's choices. */
export const FOCUS_CATALOG: readonly FocusDefinition[] = [
  { id: 'soyo_face_past', owner: 'soyo', title: '面对过去', durationMinutes: 1440, aiWeight: 60,
    onComplete: [{ type: 'set_flag', key: 'soyo_looked_back', value: true }] },
  { id: 'soyo_rebuild_crychic', owner: 'soyo', title: '筹划重建 CRYCHIC', durationMinutes: 4320,
    prerequisites: { completed: 'soyo_face_past' }, available: { always: true },
    bypass: { flag: 'crychic_reunited' }, aiWeight: 100,
    aiModifiers: [{ when: { flag: 'sakiko_final_break' }, add: -10000 }],
    onComplete: [{ type: 'set_flag', key: 'soyo_rebuild_plan_ready', value: true }] },
  { id: 'sakiko_redefine_band', owner: 'sakiko', title: '重新确立乐队方向', durationMinutes: 2880, aiWeight: 100,
    onComplete: [{ type: 'set_flag', key: 'sakiko_band_plan_ready', value: true }] },
  { id: 'emma_daily_circle', owner: 'emma', title: '维系大家的日常', durationMinutes: 2880, aiWeight: 100,
    onComplete: [{ type: 'set_flag', key: 'emma_circle_plan_ready', value: true }] },
  { id: 'renako_small_circle', owner: 'renako', title: '组建小小的社交圈', durationMinutes: 2880, aiWeight: 100,
    onComplete: [{ type: 'set_flag', key: 'renako_circle_plan_ready', value: true }] },
];
export const TRAIT_CATALOG: readonly TraitDefinition[] = [
  { id: 'soyo_crychic_obsession', title: 'CRYCHIC 的执念', modifiers: [
    { target: 'focus_ai_weight', operation: 'add', amount: 50, focusId: 'soyo_rebuild_crychic' },
  ] },
];
export const SPIRIT_CATALOG: readonly SpiritDefinition[] = [
  { id: 'fragile_resolve', title: '动摇的决心', modifiers: [
    { target: 'focus_progress_rate', operation: 'multiply', amount: 0.8 },
  ] },
];
export const DECISION_CATALOG: readonly DecisionDefinition[] = [
  { id: 'soyo_sort_memories', owner: 'soyo', title: '整理旧日回忆',
    available: { completed: 'soyo_face_past' }, cooldownMinutes: 1440,
    effects: [{ type: 'add_stat', key: 'soyo_resolve', amount: 5 }] },
];
export const STRATEGY_OWNERS: readonly StrategyOwner[] = Object.freeze([...new Set<StrategyOwner>([...DEFAULT_OWNERS, ...FOCUS_CATALOG.map(row => row.owner)])]);
const focusById = new Map(FOCUS_CATALOG.map(row => [row.id, row]));
const decisionById = new Map(DECISION_CATALOG.map(row => [row.id, row]));
const traitById = new Map(TRAIT_CATALOG.map(row => [row.id, row]));
const spiritById = new Map(SPIRIT_CATALOG.map(row => [row.id, row]));
const permittedFlags = new Set<string>(STRATEGY_FLAGS);
const permittedStats = new Set<string>(STRATEGY_STATS);
const MAX_MINUTE = 525599999;
const HISTORY_LIMIT = 300;
const RECEIPT_LIMIT = 160;
function fail(message: string): never { throw new Error(`国策状态无效：${message}`); }
const record = (value: unknown, keys: readonly string[], label: string): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail(label);
  const row = value as Record<string, unknown>;
  if (Object.keys(row).some(key => !keys.includes(key)) || keys.some(key => !Object.hasOwn(row, key))) return fail(`${label} 字段`);
  return row;
};
const boundedInt = (value: unknown, min: number, max: number, label: string): number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max ? value : fail(label);
const identifier = (value: unknown, label: string): string =>
  typeof value === 'string' && /^[a-z][a-z0-9_:-]{0,79}$/.test(value) ? value : fail(label);
const unique = (items: string[], label: string) => {
  if (new Set(items).size !== items.length) fail(`${label} 重复`);
  return items;
};
function personDefault(owner: StrategyOwner): StrategyPerson {
  return { controller: 'manual', includeInPrompt: false, active: null, completed: [],
    traits: owner === 'soyo' ? ['soyo_crychic_obsession'] : [], spirits: [], decisionUsedAt: {} };
}
export function createStrategyState(at: number): StrategyState {
  boundedInt(at, 0, MAX_MINUTE, '初始化时间');
  return { version: 1, cursor: at, flags: {}, stats: {},
    people: Object.fromEntries(STRATEGY_OWNERS.map(owner => [owner, personDefault(owner)])) as Record<StrategyOwner, StrategyPerson>,
    receipts: [], history: [] };
}

/** Reject malformed or forged fields before they enter the authoritative save. */
export function parseStrategyState(raw: unknown, at: number): StrategyState {
  const s = record(raw, ['version','cursor','flags','stats','people','receipts','history'], '根');
  if (s.version !== 1) fail('版本');
  const cursor = boundedInt(s.cursor, 0, at, '时钟');
  const flagsRaw = s.flags && typeof s.flags === 'object' && !Array.isArray(s.flags) ? s.flags as Record<string, unknown> : fail('标志');
  if (Object.keys(flagsRaw).length > STRATEGY_FLAGS.length) fail('标志数量');
  const flags: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(flagsRaw)) {
    if (!permittedFlags.has(key) || typeof value !== 'boolean') fail('标志字段');
    flags[key] = value;
  }
  const statsRaw = s.stats && typeof s.stats === 'object' && !Array.isArray(s.stats) ? s.stats as Record<string, unknown> : fail('变量');
  if (Object.keys(statsRaw).length > STRATEGY_STATS.length) fail('变量数量');
  const stats: Record<string, number> = {};
  for (const [key, value] of Object.entries(statsRaw)) {
    if (!permittedStats.has(key)) fail('变量名');
    stats[key] = boundedInt(value, -10000, 10000, `变量 ${key}`);
  }
  const peopleRaw = record(s.people, STRATEGY_OWNERS, '人物');
  const people = {} as Record<StrategyOwner, StrategyPerson>;
  for (const owner of STRATEGY_OWNERS) {
    const p = record(peopleRaw[owner], ['controller','includeInPrompt','active','completed','traits','spirits','decisionUsedAt'], `人物 ${owner}`);
    if (p.controller !== 'manual' && p.controller !== 'auto') fail('托管模式');
    if (typeof p.includeInPrompt !== 'boolean') fail('模型开关');
    const completed = Array.isArray(p.completed) && p.completed.length <= 100
      ? unique(p.completed.map(id => { const v=identifier(id,'已完成国策'); if (focusById.get(v)?.owner!==owner) fail('已完成国策归属'); return v; }), '国策') : fail('已完成国策');
    const traits = Array.isArray(p.traits) && p.traits.length <= 32
      ? unique(p.traits.map(id => { const v=identifier(id,'特质'); if (!traitById.has(v)) fail('未知特质'); return v; }), '特质') : fail('人物特质');
    if (!Array.isArray(p.spirits) || p.spirits.length > 32) fail('精神');
    const spirits = p.spirits.map(rawSpirit => {
      const spirit = record(rawSpirit, ['id','grantedAt','expiresAt'], '精神条目');
      const id = identifier(spirit.id, '精神 ID'); if (!spiritById.has(id)) fail('精神不存在');
      const grantedAt = boundedInt(spirit.grantedAt, 0, cursor, '获得时间');
      const expiresAt = spirit.expiresAt === null ? null : boundedInt(spirit.expiresAt, grantedAt + 1, MAX_MINUTE, '失效时间');
      return { id, grantedAt, expiresAt };
    });
    unique(spirits.map(row => row.id), '民族精神');
    const decisionUsedRaw = p.decisionUsedAt && typeof p.decisionUsedAt === 'object' && !Array.isArray(p.decisionUsedAt)
      ? p.decisionUsedAt as Record<string, unknown> : fail('决议记录');
    if (Object.keys(decisionUsedRaw).length > 100) fail('决议数量');
    const decisionUsedAt: Record<string, number> = {};
    for (const [id,value] of Object.entries(decisionUsedRaw)) {
      if (decisionById.get(id)?.owner !== owner) fail('决议归属');
      decisionUsedAt[id] = boundedInt(value, 0, cursor, '决议时间');
    }
    let active: FocusRun | null = null;
    if (p.active !== null) {
      const focus = record(p.active, ['id','startedAt','progress'], '进行中的国策');
      const id = identifier(focus.id,'进行中的国策 ID'), definition=focusById.get(id);
      if (!definition || definition.owner !== owner || completed.includes(id)) fail('进行中国策归属');
      const startedAt = boundedInt(focus.startedAt, 0, cursor, '国策启动时间');
      const progress = focus.progress;
      if (typeof progress !== 'number' || !Number.isFinite(progress) || progress < 0 || progress >= definition.durationMinutes || Math.abs(Math.round(progress*100) - progress*100) > 1e-7) fail('国策进度');
      active = { id, startedAt, progress };
    }
    people[owner] = { controller: p.controller, includeInPrompt: p.includeInPrompt, active, completed, traits, spirits, decisionUsedAt };
  }
  if (!Array.isArray(s.receipts) || s.receipts.length > RECEIPT_LIMIT) fail('操作记录');
  const receipts = s.receipts.map(rawReceipt => {
    const receipt = record(rawReceipt, ['id','command'], '操作回执');
    const id = identifier(receipt.id,'请求 ID');
    if (typeof receipt.command !== 'string' || receipt.command.length > 500) fail('请求内容');
    return { id, command: receipt.command };
  });
  unique(receipts.map(row => row.id), '请求回执');
  if (!Array.isArray(s.history) || s.history.length > HISTORY_LIMIT) fail('历史');
  const kinds = new Set(['start','complete','cancel','bypass','decision','spirit_expired']);
  const history: StrategyHistory[] = s.history.map(rawHistory => {
    const row = record(rawHistory,['id','at','owner','kind','subject'],'历史条目');
    const id=identifier(row.id,'历史 ID'), subject=identifier(row.subject,'历史对象');
    const owner = row.owner;
    if (!STRATEGY_OWNERS.some(value=>value===owner) || !kinds.has(String(row.kind))) fail('历史身份');
    return { id, at: boundedInt(row.at,0,cursor,'历史时间'), owner: owner as StrategyOwner, kind: row.kind as StrategyHistory['kind'], subject };
  });
  unique(history.map(row => row.id), '历史事件');
  return { version:1, cursor, flags, stats, people, receipts, history };
}

export interface ConditionContext { state: StrategyState; owner: StrategyOwner; at?: number }
export function checkCondition(condition: Condition, context: ConditionContext, depth=0): boolean {
  if (depth > 16) return false;
  if ('always' in condition) return condition.always;
  if ('all' in condition) return condition.all.every(c => checkCondition(c,context,depth+1));
  if ('any' in condition) return condition.any.some(c => checkCondition(c,context,depth+1));
  if ('not' in condition) return !checkCondition(condition.not,context,depth+1);
  if ('flag' in condition) return (context.state.flags[condition.flag] ?? false) === (condition.equals ?? true);
  if ('stat' in condition) {
    const value=context.state.stats[condition.stat] ?? 0;
    return (condition.gte===undefined || value>=condition.gte) && (condition.lte===undefined || value<=condition.lte);
  }
  if ('completed' in condition) return context.state.people[context.owner].completed.includes(condition.completed);
  if ('hasSpirit' in condition) return context.state.people[context.owner].spirits.some(x=>x.id===condition.hasSpirit && (x.expiresAt===null || x.expiresAt>(context.at??context.state.cursor)));
  return context.state.people[context.owner].traits.includes(condition.hasTrait);
}
export interface ModifierBreakdown { source: string; operation: 'add'|'multiply'; amount: number }
export function calculateModifier(context: ConditionContext, target: ModifierTarget, initial: number, focusId?: string): { value: number; breakdown: ModifierBreakdown[] } {
  const person=context.state.people[context.owner];
  const sources = [
    ...person.traits.flatMap(id => traitById.get(id)?.modifiers.map(modifier=>({source:`trait:${id}`,modifier}))??[]),
    ...person.spirits.flatMap(item => {
      const spirit=spiritById.get(item.id);
      if (!spirit || (item.expiresAt!==null && item.expiresAt<=(context.at??context.state.cursor)) ||
          (spirit.activeWhen && !checkCondition(spirit.activeWhen,context))) return [];
      return spirit.modifiers.map(modifier=>({source:`spirit:${item.id}`,modifier}));
    }),
  ];
  let adds=0, multiplier=1; const breakdown: ModifierBreakdown[]=[];
  for (const {source,modifier} of sources) {
    if (modifier.target!==target || (modifier.focusId && modifier.focusId!==focusId) ||
      (modifier.when && !checkCondition(modifier.when,context))) continue;
    breakdown.push({source,operation:modifier.operation,amount:modifier.amount});
    if (modifier.operation==='add') adds+=modifier.amount; else multiplier*=modifier.amount;
  }
  return { value: Math.max(0,Math.round((initial+adds)*multiplier*100)/100), breakdown };
}
export function focusWeight(state: StrategyState, owner: StrategyOwner, focus: FocusDefinition): { value: number; breakdown: ModifierBreakdown[] } {
  const context={state,owner,at:state.cursor}, score=calculateModifier(context,'focus_ai_weight',focus.aiWeight,focus.id);
  let value=score.value;
  for (const modifier of focus.aiModifiers??[]) if (checkCondition(modifier.when,context)) {
    value+=modifier.add; score.breakdown.push({source:`focus:${focus.id}`,operation:'add',amount:modifier.add});
  }
  return {value:Math.round(value*100)/100,breakdown:score.breakdown};
}
export function canStartFocus(state: StrategyState,owner: StrategyOwner, focus: FocusDefinition): boolean {
  const p=state.people[owner],ctx={state,owner};
  return focus.owner===owner && !p.completed.includes(focus.id) &&
    (!focus.prerequisites || checkCondition(focus.prerequisites,ctx)) &&
    (!focus.available || checkCondition(focus.available,ctx)) &&
    (!focus.cancel || !checkCondition(focus.cancel,ctx)) &&
    (!focus.bypass || !checkCondition(focus.bypass,ctx));
}
function pushHistory(state: StrategyState, owner: StrategyOwner, kind: StrategyHistory['kind'],subject:string,at=state.cursor) {
  const id=`focus:${owner}:${at}:${kind}:${subject}`;
  if (state.history.some(e=>e.id===id)) return;
  state.history.push({id,at,owner,kind,subject});
  state.history=state.history.slice(-HISTORY_LIMIT);
}
function applyEffects(state: StrategyState,owner:StrategyOwner,effects:readonly StrategyEffect[],at:number) {
  const p=state.people[owner];
  for (const effect of effects) {
    if (effect.type==='set_flag') {
      if (!permittedFlags.has(effect.key)) fail(`未注册的标志 ${effect.key}`);
      state.flags[effect.key]=effect.value;
    } else if (effect.type==='add_stat') {
      if (!permittedStats.has(effect.key) || !Number.isSafeInteger(effect.amount) || Math.abs(effect.amount)>1000) fail('变量更改无效');
      state.stats[effect.key]=Math.max(-10000,Math.min(10000,(state.stats[effect.key]??0)+effect.amount));
    } else if (effect.type==='add_spirit') {
      if (!spiritById.has(effect.id)) fail('民族精神未注册');
      if (effect.durationMinutes!==undefined && (!Number.isSafeInteger(effect.durationMinutes)||effect.durationMinutes<1||at+effect.durationMinutes>MAX_MINUTE)) fail('民族精神时限');
      const instance:SpiritInstance={id:effect.id,grantedAt:at,expiresAt:effect.durationMinutes?at+effect.durationMinutes:null};
      p.spirits=[...p.spirits.filter(s=>s.id!==effect.id),instance];
    } else if (effect.type==='remove_spirit') p.spirits=p.spirits.filter(s=>s.id!==effect.id);
  }
}
function finishFocus(state:StrategyState,owner:StrategyOwner,kind:'complete'|'bypass',at:number) {
  const p=state.people[owner],focus=p.active;
  if (!focus) return;
  const definition=focusById.get(focus.id)!;
  p.active=null;
  p.completed.push(focus.id);
  if (kind==='complete') applyEffects(state,owner,definition.onComplete??[],at);
  pushHistory(state,owner,kind,focus.id,at);
}
export function applyStrategyCommand(state: StrategyState,command:StrategyCommand,requestId:string):StrategyState {
  const id=identifier(requestId,'请求 ID'), encoded=JSON.stringify(command);
  if (encoded.length>500 || !STRATEGY_OWNERS.includes(command.owner)) fail('命令参数');
  const schema: Record<StrategyCommand['type'], string[]> = {
    set_control: ['type','owner','controller','includeInPrompt'],
    start_focus: ['type','owner','focusId'],
    cancel_focus: ['type','owner'],
    choose_decision: ['type','owner','decisionId'],
  };
  if (!Object.hasOwn(schema, command.type)) fail('命令类型');
  record(command, schema[command.type], '命令');
  const old=state.receipts.find(row=>row.id===id);
  if (old) { if (old.command!==encoded) fail('重复请求内容不一致'); return state; }
  const next:StrategyState=structuredClone(state),p=next.people[command.owner],at=next.cursor;
  if (command.type==='set_control') {
    if (!['manual','auto'].includes(command.controller) || typeof command.includeInPrompt!=='boolean') fail('托管配置');
    p.controller=command.controller; p.includeInPrompt=command.includeInPrompt;
  } else if (command.type==='start_focus') {
    if (p.controller!=='manual' || p.active) fail('当前不能手动启动国策');
    const focus=focusById.get(command.focusId);
    if (!focus || !canStartFocus(next,command.owner,focus)) fail('国策条件未满足');
    p.active={id:focus.id,startedAt:at,progress:0};
    pushHistory(next,command.owner,'start',focus.id);
  } else if (command.type==='cancel_focus') {
    if (!p.active || p.controller!=='manual') fail('没有可取消的手动国策');
    const oldFocus=p.active.id; p.active=null;
    pushHistory(next,command.owner,'cancel',oldFocus);
  } else if (command.type==='choose_decision') {
    if (p.controller!=='manual') fail('当前由 AI 托管');
    const decision=decisionById.get(command.decisionId);
    if (!decision || decision.owner!==command.owner || !checkCondition(decision.available,{state:next,owner:command.owner})) fail('决议条件未满足');
    const last=p.decisionUsedAt[decision.id];
    if (last!==undefined && (!decision.cooldownMinutes || at-last<decision.cooldownMinutes)) fail('决议尚在冷却');
    applyEffects(next,command.owner,decision.effects,at);
    p.decisionUsedAt[decision.id]=at;
    pushHistory(next,command.owner,'decision',decision.id);
  } else fail('未知命令');
  next.receipts.push({id,command:encoded});next.receipts=next.receipts.slice(-RECEIPT_LIMIT);
  return next;
}

/** Event-boundary scheduler: all owners share one chronological clock. No model calls. */
export function settleStrategyState(input: StrategyState, end: number): StrategyState {
  boundedInt(end, input.cursor, MAX_MINUTE, '结算时间');
  if (end === input.cursor) return input;
  const state: StrategyState = structuredClone(input);
  let at = state.cursor, iterations = 0;
  const limit = 16 + FOCUS_CATALOG.length * 4 + SPIRIT_CATALOG.length * STRATEGY_OWNERS.length;
  while (at <= end) {
    if (++iterations > limit) fail('事件结算超过安全上限');
    state.cursor = at;
    // Expiry happens at the exact game minute, not after a long overnight step.
    for (const owner of STRATEGY_OWNERS) {
      const p = state.people[owner];
      for (const spirit of [...p.spirits]) if (spirit.expiresAt !== null && spirit.expiresAt <= at) {
        p.spirits = p.spirits.filter(x => x.id !== spirit.id);
        pushHistory(state, owner, 'spirit_expired', spirit.id, at);
      }
    }
    // Resolve same-minute completion/cancellation dependencies before time advances.
    for (let attempt = 0; attempt < FOCUS_CATALOG.length + 2; attempt++) {
      let changed = false;
      for (const owner of STRATEGY_OWNERS) {
        const p = state.people[owner], context = { state, owner, at };
        if (p.active) {
          const def = focusById.get(p.active.id)!;
          if (def.cancel && checkCondition(def.cancel, context)) {
            const old = p.active.id; p.active = null;
            pushHistory(state, owner, 'cancel', old, at); changed = true;
          } else if (def.bypass && checkCondition(def.bypass, context)) {
            finishFocus(state, owner, 'bypass', at); changed = true;
          }
        }
        if (!p.active && p.controller === 'auto') {
          const chosen = FOCUS_CATALOG.filter(f => canStartFocus(state, owner, f))
            .map(f => ({ f, score: focusWeight(state, owner, f).value }))
            .filter(x => x.score > 0).sort((a, b) => b.score - a.score || a.f.id.localeCompare(b.f.id))[0]?.f;
          if (chosen) {
            p.active = { id: chosen.id, startedAt: at, progress: 0 };
            pushHistory(state, owner, 'start', chosen.id, at); changed = true;
          }
        }
      }
      if (!changed) break;
    }
    if (at === end) break;
    let nextAt = end;
    const rates = new Map<StrategyOwner, number>();
    for (const owner of STRATEGY_OWNERS) {
      const p = state.people[owner];
      for (const spirit of p.spirits) if (spirit.expiresAt !== null && spirit.expiresAt > at)
        nextAt = Math.min(nextAt, spirit.expiresAt);
      if (!p.active) continue;
      const def = focusById.get(p.active.id)!;
      if (def.available && !checkCondition(def.available, { state, owner, at })) continue;
      const rate = calculateModifier({ state, owner, at }, 'focus_progress_rate', 1, def.id).value;
      if (rate <= 0) continue;
      rates.set(owner, rate);
      nextAt = Math.min(nextAt, at + Math.max(1, Math.ceil((def.durationMinutes - p.active.progress - 1e-9) / rate)));
    }
    if (nextAt <= at) fail('事件时间没有推进');
    const delta = nextAt - at;
    for (const [owner, rate] of rates) {
      const focus = state.people[owner].active!;
      focus.progress = Math.round((focus.progress + delta * rate) * 100) / 100;
    }
    at = nextAt;
    state.cursor = at;
    for (const owner of STRATEGY_OWNERS) {
      const focus = state.people[owner].active;
      if (focus && focus.progress >= focusById.get(focus.id)!.durationMinutes)
        finishFocus(state, owner, 'complete', at);
    }
  }
  state.cursor = end;
  return state;
}
