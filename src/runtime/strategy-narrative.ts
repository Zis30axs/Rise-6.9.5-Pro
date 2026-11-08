/**
 * Optional narrative-to-strategy bridge. The model proposes narrowly typed deltas;
 * no arbitrary save paths, private phone state, movement or money can be patched.
 * This module is deliberately pure and has no model/provider dependency.
 */
import {
  FOCUS_CATALOG, STRATEGY_STATS, STRATEGY_OWNERS,
  adjustStrategyProgress, appendStrategyNarrativeAudit, consumeStrategyMajor,
  parseStrategyState, settleStrategyState, strategyLocalKey,
  type Condition, type StrategyOwner, type StrategyState,
} from './strategy';

export interface StrategyNarrativeUpdate {
  owner: StrategyOwner;
  focusId: string;
  note: string;
  progressDelta?: number;
  flags?: Record<string, boolean>;
  stats?: Record<string, number>;
}

/** Must be attached to a locally authorized Otherside milestone scene. */
export interface StrategyMajorUpdate {
  majorId: string;
  owner: StrategyOwner;
  note: string;
  flags?: Record<string, boolean>;
  stats?: Record<string, number>;
}

const statNames = new Set<string>(STRATEGY_STATS);
const LIMIT = 4;
function invalid(reason: string): never { throw new Error(`国策剧情更新无效：${reason}`); }
function object(raw: unknown, required: readonly string[], optional: readonly string[], name: string): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return invalid(name);
  const row = raw as Record<string, unknown>;
  if (required.some(k => !Object.hasOwn(row,k)) || Object.keys(row).some(k => !required.includes(k) && !optional.includes(k)))
    return invalid(`${name} 字段`);
  return row;
}
function note(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 180 || value.includes('\u0000')) return invalid('事件摘要');
  return value.trim();
}
function boundedDeltas(raw: unknown, maxKeys: number, amountLimit: number, owner:StrategyOwner): Record<string, number> {
  const row = object(raw, [], [...STRATEGY_STATS,...Object.keys(raw && typeof raw==='object' && !Array.isArray(raw)?raw:{})], '变量');
  if (!Object.keys(row).length || Object.keys(row).length > maxKeys) invalid('变量数量');
  const parsed: Record<string,number>={};
  for (const [key, amount] of Object.entries(row)) {
    if (!(strategyLocalKey(key,owner) || statNames.has(key) && key.startsWith(owner+'_')) || typeof amount !== 'number' || !Number.isSafeInteger(amount)
      || Math.abs(amount)>amountLimit) invalid(`变量 ${key}`);
    parsed[key]=amount;
  }
  return parsed;
}
function boundedFlags(raw: unknown, maxKeys: number, owner:StrategyOwner, majorFocusId?:string): Record<string, boolean> {
  const row = object(raw, [], Object.keys(raw && typeof raw==='object' && !Array.isArray(raw)?raw:{}), '世界标志');
  if (!Object.keys(row).length || Object.keys(row).length > maxKeys) invalid('世界标志数量');
  const parsed: Record<string,boolean>={};
  for (const [key,value] of Object.entries(row)) {
    // A global outcome cannot be declared by an unrelated personal focus.
    // Band reunion must wait for verified consent and organization state.
    const approvedWorldFact = key==='sakiko_final_break' && owner==='sakiko'
      && majorFocusId==='sakiko_redefine_band' && value===true;
    if (!(strategyLocalKey(key,owner) || approvedWorldFact) || typeof value!=='boolean')
      invalid(`标志 ${key} 只能通过授权的重大事件变更`);
    parsed[key]=value;
  }
  return parsed;
}

export function validateStrategyNarrativeUpdates(raw: unknown, state: StrategyState | undefined): StrategyNarrativeUpdate[] {
  if (!Array.isArray(raw) || raw.length > LIMIT || (!state && raw.length)) invalid('国策更新数量或权限');
  const used=new Set<string>();
  return raw.map((value,index) => {
    const row=object(value,['owner','focusId','note'],['progressDelta','stats','flags'],`更新 ${index+1}`);
    if (typeof row.owner !== 'string' || !STRATEGY_OWNERS.includes(row.owner) ||
        !['soyo','sakiko','emma','renako'].includes(row.owner) || used.has(row.owner)) invalid('主角身份或重复更新');
    const owner=row.owner;
    used.add(owner);
    const person=state!.people[owner];
    if (!person?.includeInPrompt || !person.active || row.focusId !== person.active.id) invalid('未授权或已失效的国策');
    const result:StrategyNarrativeUpdate={owner,focusId:person.active.id,note:note(row.note)};
    if (Object.hasOwn(row,'progressDelta')) {
      if (typeof row.progressDelta!=='number' || !Number.isFinite(row.progressDelta) ||
        Math.abs(row.progressDelta)>180 || Math.abs(Math.round(row.progressDelta*100)-row.progressDelta*100)>1e-7)
        invalid('国策进度修正');
      result.progressDelta=row.progressDelta;
    }
    if (Object.hasOwn(row,'stats')) result.stats=boundedDeltas(row.stats,3,10,owner);
    if (Object.hasOwn(row,'flags')) result.flags=boundedFlags(row.flags,2,owner);
    if (result.progressDelta===undefined && !result.stats && !result.flags) invalid('更新必须产生实际改变');
    return result;
  });
}

export function validateStrategyMajorUpdate(raw: unknown, state: StrategyState | undefined, majorId: string, owner: StrategyOwner): StrategyMajorUpdate {
  const row=object(raw,['majorId','owner','note'],['stats','flags'],'重大国策事件');
  const milestone=state?.majorQueue?.find(q=>q.id===majorId && q.owner===owner);
  if (!milestone || row.majorId!==majorId || row.owner!==owner)
    invalid('重大事件未由程序授权');
  const result:StrategyMajorUpdate={majorId,owner,note:note(row.note)};
  if (Object.hasOwn(row,'stats')) result.stats=boundedDeltas(row.stats,3,20,owner);
  if (Object.hasOwn(row,'flags')) result.flags=boundedFlags(row.flags,3,owner,milestone.focusId);
  return result;
}

const focusById=new Map(FOCUS_CATALOG.map(item=>[item.id,item]));
function conditionFlags(condition: Condition | undefined, keys: Set<string>, depth=0): void {
  if (!condition || depth>16) return;
  if ('flag' in condition) keys.add(condition.flag);
  else if ('all' in condition) condition.all.forEach(c=>conditionFlags(c,keys,depth+1));
  else if ('any' in condition) condition.any.forEach(c=>conditionFlags(c,keys,depth+1));
  else if ('not' in condition) conditionFlags(condition.not,keys,depth+1);
}
/** Send only explicitly enabled active focuses; do not send every tree or private diary. */
export function strategyPromptContext(state: StrategyState | undefined) {
  if (!state) return null;
  const focuses=STRATEGY_OWNERS.flatMap(owner=>{
    const person=state.people[owner];
    if (!person?.includeInPrompt || !person.active || !['soyo','sakiko','emma','renako'].includes(owner)) return [];
    const def=focusById.get(person.active.id);
    if (!def) return [];
    const relevant=new Set<string>();
    conditionFlags(def.available,relevant);
    conditionFlags(def.cancel,relevant);
    conditionFlags(def.bypass,relevant);
    for (const mod of def.aiModifiers ?? []) conditionFlags(mod.when,relevant);
    return [{owner,focusId:def.id,title:def.title,...(def.description?{description:def.description}:{}),
      progress:person.active.progress,duration:def.durationMinutes,
      localFacts:Object.fromEntries(Object.entries(state.flags).filter(([k])=>strategyLocalKey(k,owner)).slice(-8)),
      localStats:Object.fromEntries(Object.entries(state.stats).filter(([k])=>strategyLocalKey(k,owner)).slice(-8)),
      ...(relevant.size?{worldFacts:Object.fromEntries([...relevant].map(key=>[key,state.flags[key]??false]))}: {})}];
  });
  return focuses.length ? { focuses, allowedStats:STRATEGY_STATS.filter(key=>focuses.some(f=>key.startsWith(f.owner+'_'))),
    maxUpdates:LIMIT } : null;
}

function hash(value: string): string {
  let a=2166136261,b=0x811c9dc7;
  for (let i=0;i<value.length;i++) { const c=value.charCodeAt(i); a=Math.imul(a^c,16777619); b=Math.imul(b^(c+(i&255)),16777619); }
  return `${(a>>>0).toString(16)}${(b>>>0).toString(16)}`;
}
function effects(state: StrategyState, flags?:Record<string,boolean>, stats?:Record<string,number>):void {
  if (flags) for (const [key,value] of Object.entries(flags)) state.flags[key]=value;
  if (stats) for (const [key,delta] of Object.entries(stats))
    state.stats[key]=Math.max(-10000,Math.min(10000,(state.stats[key]??0)+delta));
}

/** After all foreground and Otherside actions, commit once and only once per narrative turn. */
export function commitStrategyNarrative(
  before: StrategyState, after: StrategyState,
  routine: readonly StrategyNarrativeUpdate[], major: readonly StrategyMajorUpdate[], turnId: string,
): StrategyState {
  const receiptId=`story:${hash(turnId)}`;
  const signature=`narrative:${hash(JSON.stringify({turnId,routine,major}))}`;
  const original=before.receipts.find(row=>row.id===receiptId);
  const existing=after.receipts.find(row=>row.id===receiptId) ?? original;
  if (existing) {
    if (existing.command!==signature) invalid('相同剧情 ID 的国策效果不同，禁止重新结算');
    return after;
  }
  // Ordinary turns should not add a meaningless receipt to the save.
  if (!routine.length && !major.length) return after;
  const result:StrategyState=structuredClone(after);
  for (const update of routine) {
    // The focus may have ended naturally during this turn's in-game time advance.
    // Reject changes based on a stale focus that completed during time advancement.
    if (result.people[update.owner].active?.id!==update.focusId) continue;
    if (update.progressDelta!==undefined) adjustStrategyProgress(result,update.owner,update.focusId,update.progressDelta);
    effects(result,update.flags,update.stats);
    appendStrategyNarrativeAudit(result,`${receiptId}:${update.owner}`,update.owner,update.focusId,update.note);
  }
  for (const update of major) {
    const milestone=consumeStrategyMajor(result,update.majorId,update.owner);
    effects(result,update.flags,update.stats);
    appendStrategyNarrativeAudit(result,`${receiptId}:major:${update.owner}`,update.owner,milestone.focusId,update.note,true);
  }
  const reconciled=settleStrategyState(result,result.cursor);
  reconciled.receipts.push({id:receiptId,command:signature});
  reconciled.receipts=reconciled.receipts.slice(-160);
  return parseStrategyState(reconciled,reconciled.cursor);
}

/** Detect a real saved effect on replay without exposing private receipt encoding. */
export function hasStrategyNarrativeReceipt(state: StrategyState | undefined, turnId: string): boolean {
  return !!state?.receipts.some(row => row.id === `story:${hash(turnId)}`);
}
