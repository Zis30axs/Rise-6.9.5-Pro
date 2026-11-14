import type { GeneratedStory, OtherSideEvent, WorldState } from '../frontend/types';
import { validateNotebookDrafts } from './notebook';
import { isProtagonistId } from './dual-protagonists';
import { sceneLandmarks } from '../frontend/scene-layout';
import { campusInteriors } from './campus-interiors';
import { sceneLocationId } from './scene-context';
import { otherSideOpportunity } from './other-side';
import { validateContactProposals } from './npc-phone';
import { validateStoryActions } from './story-actions';
import { validateStrategyNarrativeUpdates, validateStrategyMajorUpdate } from './strategy-narrative';
export { STORY_ACTION_LIMITS } from './story-actions';

export const STORY_OUTPUT_LIMITS = {
  storyText: 6000,
  inputText: 2000,
  phoneEvents: 8,
  notebookPages: 2,
  worldEvents: 1,
  otherSideEvents: 3,
  strategyUpdates: 4,
  otherSideText: 1200,
  storyReturnText: 2000,
  otherSideNpcEvents: 5,
  otherSideMessages: 2,
  messageText: 2000,
  // JSON can use six characters to encode one Unicode code unit. Bound the
  // complete transport without truncating valid JSON before it is parsed.
  protocolText: 160000,
} as const;

function invalid(detail: string): never {
  throw new Error(`剧情回复格式不正确：${detail}。正文、手机消息和世界事件均未写入，请重试。`);
}

function record(value: unknown, keys: readonly string[], path: string, optional: readonly string[] = []): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid(path);
  const ownKeys = Object.keys(value);
  if (keys.some(key => !Object.prototype.hasOwnProperty.call(value, key)) || ownKeys.some(key => !keys.includes(key) && !optional.includes(key))) return invalid(`${path} 字段`);
  return value as Record<string, unknown>;
}

function text(value: unknown, max: number, path: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || value.includes('\u0000')) return invalid(path);
  return value.trim();
}

const OTHER_SIDE_VARIABLE_KEYS = ['energy', 'health', 'stress', 'morale', 'satiety', 'foodEnergy'] as const;
const OTHER_SIDE_LOCATIONS = new Set([
  ...sceneLandmarks.map(landmark => sceneLocationId(landmark.id)),
  ...campusInteriors.map(room => room.id),
]);

/** An off-screen narrative is executable only through this narrow whitelist. */
/** Off-screen events are authorized again against the deterministic opportunity at commit. */
export function validateOtherSideEvents(value: unknown, state: WorldState): OtherSideEvent[] {
  if (!Array.isArray(value) || value.length > STORY_OUTPUT_LIMITS.otherSideEvents) return invalid('otherside 事件数量');
  if (!value.length) return [];
  const opportunity = otherSideOpportunity(state);
  if (!opportunity.allowed) return invalid('otherside 本轮尚未获得旁线机会');
  if (value.length > opportunity.groups.length) return invalid('otherside 超过本轮允许的旁线分组');
  const used = new Set<string>();
  return value.map((raw, index) => {
    const path = `otherside 第 ${index + 1} 项`;
    const item = record(raw, ['protagonists', 'text'], path, ['locationId', 'variables', 'npcs', 'messages']);
    if (!Array.isArray(item.protagonists) || !item.protagonists.length || item.protagonists.length > 3) return invalid(`${path} 主角列表`);
    if (item.protagonists.some(id => !isProtagonistId(id) || id === state.protagonists?.accounts.active || used.has(id)))
      return invalid(`${path} 必须使用尚未出现的非当前主角 ID`);
    const protagonists = item.protagonists as OtherSideEvent['protagonists'];
    const group = opportunity.groups.find(group => group.length === protagonists.length && group.every(id => protagonists.includes(id)));
    if (!group) return invalid(`${path} 必须完整使用本轮分配的同场主角分组，不得拆成两个标签`);
    protagonists.forEach(id => used.add(id));
    const result: OtherSideEvent = { protagonists: [...group], text: text(item.text, STORY_OUTPUT_LIMITS.otherSideText, `${path} 剧情`) };
    if (Object.hasOwn(item, 'locationId')) {
      if (typeof item.locationId !== 'string' || !OTHER_SIDE_LOCATIONS.has(item.locationId)) return invalid(`${path} 地点`);
      result.locationId = item.locationId;
    }
    if (Object.hasOwn(item, 'variables')) {
      const variables = record(item.variables, [], `${path} 变量`, protagonists);
      if (!Object.keys(variables).length) return invalid(`${path} 变量不能为空`);
      result.variables = {};
      for (const id of protagonists) {
        if (!Object.hasOwn(variables, id)) continue;
        const changes = record(variables[id], [], `${path} ${id} 变量`, OTHER_SIDE_VARIABLE_KEYS);
        if (!Object.keys(changes).length) return invalid(`${path} ${id} 变量不能为空`);
        const parsed: NonNullable<NonNullable<OtherSideEvent['variables']>[typeof id]> = {};
        for (const key of OTHER_SIDE_VARIABLE_KEYS) {
          if (!Object.hasOwn(changes, key)) continue;
          const amount = changes[key], bound = key === 'foodEnergy' ? 300 : 20;
          if (typeof amount !== 'number' || !Number.isInteger(amount) || Math.abs(amount) > bound) return invalid(`${path} 变量 ${key} 越界`);
          parsed[key] = amount;
        }
        result.variables[id] = parsed;
      }
    }
    if (Object.hasOwn(item, 'npcs')) {
      if (!Array.isArray(item.npcs) || item.npcs.length > STORY_OUTPUT_LIMITS.otherSideNpcEvents) return invalid(`${path} NPC数量`);
      const allowedNpcs = new Set(opportunity.npcGroups.find(group => group.protagonists.length === protagonists.length &&
        group.protagonists.every(id => protagonists.includes(id)))?.npcs.map(npc => npc.id) ?? []);
      const seen = new Set<string>();
      result.npcs = item.npcs.map((rawNpc, npcIndex) => {
        const npc = record(rawNpc, ['id'], `${path} NPC ${npcIndex + 1}`, ['locationId', 'status', 'affinityDelta']);
        if (typeof npc.id !== 'string' || !allowedNpcs.has(npc.id) || seen.has(npc.id))
          return invalid(`${path} NPC必须是本轮现场已有的非主角人物`);
        seen.add(npc.id);
        const parsed: NonNullable<OtherSideEvent['npcs']>[number] = { id: npc.id };
        if (Object.hasOwn(npc, 'locationId')) {
          if (typeof npc.locationId !== 'string' || !OTHER_SIDE_LOCATIONS.has(npc.locationId)) return invalid(`${path} NPC地点`);
          parsed.locationId = npc.locationId;
        }
        if (Object.hasOwn(npc, 'status')) parsed.status = text(npc.status, 120, `${path} NPC状态`);
        if (Object.hasOwn(npc, 'affinityDelta')) {
          if (typeof npc.affinityDelta !== 'number' || !Number.isInteger(npc.affinityDelta) || Math.abs(npc.affinityDelta) > 5)
            return invalid(`${path} NPC关系变化`);
          parsed.affinityDelta = npc.affinityDelta;
        }
        return parsed;
      });
    }
    if (Object.hasOwn(item, 'messages')) {
      if (!Array.isArray(item.messages) || item.messages.length > STORY_OUTPUT_LIMITS.otherSideMessages) return invalid(`${path} 短信数量`);
      result.messages = item.messages.map((rawMessage, msgIndex) => {
        const message = record(rawMessage, ['from', 'to', 'text'], `${path} 短信 ${msgIndex + 1}`);
        if (!isProtagonistId(message.from) || !protagonists.includes(message.from) || !isProtagonistId(message.to)
          || message.from === message.to) return invalid(`${path} 短信只能由本组主角发送到另一主角`);
        return { from: message.from, to: message.to, text: text(message.text, 400, `${path} 短信正文`) };
      });
    }
    return result;
  });
}

/** Rebuild the only allowed data fields; never apply arbitrary model patches. */
export function validateGeneratedStory(value: unknown, state: WorldState, replayTurnId?: string): GeneratedStory {
  const result = record(value, ['text', 'phoneMessages'], '回复', ['worldEvents', 'worldActions', 'weeklySummary', 'contactRequests', 'otherSide', 'returnStory', 'strategyUpdates', 'strategyMajor', 'notebookPages']);
  const story = text(result.text, STORY_OUTPUT_LIMITS.storyText, '正文');
  if (!Array.isArray(result.phoneMessages) || result.phoneMessages.length > STORY_OUTPUT_LIMITS.phoneEvents) return invalid('手机消息数量');
  const knownNpcs = new Set(state.contacts.map(contact => contact.id));
  const phoneMessages = result.phoneMessages.map((value, index) => {
    const item = record(value, ['npcId', 'text'], `手机消息 ${index + 1}`);
    if (typeof item.npcId !== 'string' || !knownNpcs.has(item.npcId)) return invalid(`手机消息 ${index + 1} 的联系人`);
    return { npcId: item.npcId, text: text(item.text, STORY_OUTPUT_LIMITS.messageText, `手机消息 ${index + 1} 的正文`) };
  });
  const parsed: GeneratedStory = { text: story, phoneMessages };
  if (Object.hasOwn(result, 'notebookPages')) parsed.notebookPages = validateNotebookDrafts(result.notebookPages, state);
  if (Object.hasOwn(result, 'otherSide')) parsed.otherSide = validateOtherSideEvents(result.otherSide, state);
  if (Object.hasOwn(result, 'strategyUpdates'))
    parsed.strategyUpdates = validateStrategyNarrativeUpdates(result.strategyUpdates, state.protagonists?.strategy);
  // A model cannot quietly perform offscreen deeds outside an actual scene.
  // The local clock may still advance every owner's focused plan in the background.
  if (parsed.strategyUpdates?.some(update => update.owner !== state.protagonists?.accounts.active &&
    !parsed.otherSide?.some(event => event.protagonists.includes(update.owner as 'soyo' | 'sakiko' | 'emma' | 'renako'))))
    return invalid('非当前主角的国策更新必须附带获准的旁线事件');
  if (Object.hasOwn(result, 'strategyMajor')) {
    if (!Array.isArray(result.strategyMajor) || result.strategyMajor.length > 1) return invalid('重大国策事件数量');
    const opportunity = otherSideOpportunity(state);
    if (result.strategyMajor.length && (!opportunity.strategyMajor ||
      !parsed.otherSide?.some(event => event.protagonists.includes(opportunity.strategyMajor!.owner))))
      return invalid('重大国策事件必须有对应的合法旁线剧情');
    parsed.strategyMajor = result.strategyMajor.map(update =>
      validateStrategyMajorUpdate(update, state.protagonists?.strategy,
        opportunity.strategyMajor!.id, opportunity.strategyMajor!.owner));
  }
  if (Object.hasOwn(result, 'returnStory')) {
    if (!parsed.otherSide?.length) return invalid('story_continue 只能在真实旁线事件后使用');
    parsed.returnStory = text(result.returnStory, STORY_OUTPUT_LIMITS.storyReturnText, '回到当前视角的正文');
  }
  if (Object.hasOwn(result, 'contactRequests')) parsed.contactRequests = validateContactProposals(result.contactRequests);
  if (Object.prototype.hasOwnProperty.call(result, 'worldActions')) parsed.worldActions = validateStoryActions(result.worldActions, state, replayTurnId);
  if (Object.prototype.hasOwnProperty.call(result, 'worldEvents')) {
    if (!Array.isArray(result.worldEvents) || result.worldEvents.length > STORY_OUTPUT_LIMITS.worldEvents) return invalid('世界事件数量');
    parsed.worldEvents = result.worldEvents.map((value, index) => {
      const item = record(value, ['type'], `世界事件 ${index + 1}`);
      if (item.type !== 'airliner_pass') return invalid(`世界事件 ${index + 1} 的类型`);
      return { type: 'airliner_pass' };
    });
  }
  if (Object.prototype.hasOwnProperty.call(result, 'weeklySummary')) {
    const week = record(result.weeklySummary, ['week', 'text'], '七日摘要');
    if (typeof week.week !== 'number' || !Number.isSafeInteger(week.week) || week.week < 1) return invalid('七日摘要周次');
    const summary = text(week.text, 1800, '七日摘要正文');
    const pending = state.protagonists?.weeklyMemory?.closed.find(w => w.summary === null);
    if (!pending || pending.week !== week.week) return invalid('七日摘要必须对应等待总结的周期');
    parsed.weeklySummary = { week: week.week, text: summary };
  }
  return parsed;
}

/**
 * Be forgiving about model-facing tag syntax. Some models include reasoning,
 * quoted examples, duplicate tags or a missing closing tag. Those are not
 * reasons to discard a complete story.
 *
 * Structured side effects are read ONLY after the chosen story. Malformed
 * optional data is ignored here; any accepted data still goes through the
 * unchanged, strict world-state validators before it can be committed.
 */
function parseTaggedStory(source: string): Record<string, unknown> | null {
  const cleaned = source
    .replace(/\[assistant\]\s*\[reasoning\][\s\S]*?\[content\]/gi, '')
    .replace(/<(think|analysis|reasoning|konatan_planning~|tucao)(?:\s[^>]*)?>[\s\S]*?<\/\1\s*>/gi, '')
    .trim();
  const opens = [...cleaned.matchAll(/<story>/gi)];
  let story = '';
  let tail = cleaned;
  // Prefer the last story opener: earlier occurrences are usually examples
  // inside planning or a discarded draft.
  for (let i = opens.length - 1; i >= 0; i--) {
    const open = opens[i];
    const start = (open.index ?? 0) + open[0].length;
    const closing = /<\/story>/gi;
    closing.lastIndex = start;
    const close = closing.exec(cleaned);
    let end = close?.index ?? cleaned.length;
    if (!close) {
      // Even an unclosed story can be recovered when data tags follow it.
      const next = /<(?:phone_messages|world_actions|world_events|weekly_summary|contact_requests|otherside|story_continue|strategy_updates|strategy_major|notebook_pages)>/i.exec(cleaned.slice(start));
      if (next) end = start + next.index;
    }
    const candidate = cleaned.slice(start, end).trim();
    if (!candidate) continue;
    story = candidate;
    tail = cleaned.slice(close ? close.index + close[0].length : end);
    break;
  }
  if (!story) return null;

  const readJson = (name: string, kind: 'array' | 'object'): unknown => {
    const pattern = new RegExp('<' + name + '>([\\s\\S]*?)<\\/' + name + '>', 'gi');
    const blocks = [...tail.matchAll(pattern)];
    for (let i = blocks.length - 1; i >= 0; i--) {
      const original = blocks[i][1].trim();
      const fence = String.fromCharCode(96).repeat(3);
      const fenced = new RegExp('^' + fence + '(?:json)?\\s*\\n([\\s\\S]*?)\\n' + fence + '$', 'i').exec(original);
      try {
        const value: unknown = JSON.parse((fenced ? fenced[1] : original).trim());
        if (kind === 'array' ? Array.isArray(value) : !!value && typeof value === 'object' && !Array.isArray(value)) return value;
      } catch { /* A malformed optional block is not a failed story. */ }
    }
    return undefined;
  };
  const readText = (name: string): string | undefined => {
    const pattern = new RegExp('<' + name + '>([\\s\\S]*?)<\\/' + name + '>', 'gi');
    const blocks = [...tail.matchAll(pattern)];
    return blocks.length ? blocks[blocks.length - 1][1].trim() || undefined : undefined;
  };
  const phone = readJson('phone_messages', 'array');
  const contacts = readJson('contact_requests', 'array');
  const otherSide = readJson('otherside', 'array');
  const actions = readJson('world_actions', 'array');
  const events = readJson('world_events', 'array');
  const weekly = readJson('weekly_summary', 'object');
  const strategyUpdates = readJson('strategy_updates', 'array');
  const strategyMajor = readJson('strategy_major', 'array');
  const notebookPages = readJson('notebook_pages', 'array');
  const continued = Array.isArray(otherSide) && otherSide.length ? readText('story_continue') : undefined;
  return {
    story,
    phone_messages: phone ?? [],
    ...(contacts !== undefined ? { contact_requests: contacts } : {}),
    ...(otherSide !== undefined ? { other_side: otherSide } : {}),
    ...(continued !== undefined ? { story_continue: continued } : {}),
    ...(actions !== undefined ? { world_actions: actions } : {}),
    ...(events !== undefined ? { world_events: events } : {}),
    ...(weekly !== undefined ? { weekly_summary: weekly } : {}),
    ...(strategyUpdates !== undefined ? { strategy_updates: strategyUpdates } : {}),
    ...(strategyMajor !== undefined ? { strategy_major: strategyMajor } : {}),
    ...(notebookPages !== undefined ? { notebook_pages: notebookPages } : {}),
  };
}

/** Both legacy JSON and tagged narrative share one strict validation path. */
export function parseGeneratedStory(value: unknown, state: WorldState, replayTurnId?: string): GeneratedStory {
  if (typeof value !== 'string' || !value.trim() || value.length > STORY_OUTPUT_LIMITS.protocolText) return invalid('回复为空或过长');
  let source = value.trim();
  if (source.startsWith('```')) {
    const fenced = /^```(?:json|xml|text)?\s*\n([\s\S]*?)\n```$/i.exec(source);
    if (fenced) source = fenced[1].trim();
  }
  let valueObject: unknown;
  try { valueObject = JSON.parse(source); }
  catch { valueObject = parseTaggedStory(source); }
  if (!valueObject) return invalid('请返回完整 JSON 或包含 <story> 的标签块');
  const envelope = record(valueObject, ['story', 'phone_messages'], '回复', ['world_events', 'world_actions', 'weekly_summary', 'contact_requests', 'other_side', 'story_continue', 'strategy_updates', 'strategy_major', 'notebook_pages']);
  return validateGeneratedStory({ text: envelope.story, phoneMessages: envelope.phone_messages,
    ...(Object.prototype.hasOwnProperty.call(envelope, 'contact_requests') ? { contactRequests: envelope.contact_requests } : {}),
    ...(Object.prototype.hasOwnProperty.call(envelope, 'other_side') ? { otherSide: envelope.other_side } : {}),
    ...(Object.prototype.hasOwnProperty.call(envelope, 'story_continue') ? { returnStory: envelope.story_continue } : {}),
    ...(Object.prototype.hasOwnProperty.call(envelope, 'world_events') ? { worldEvents: envelope.world_events } : {}),
    ...(Object.prototype.hasOwnProperty.call(envelope, 'world_actions') ? { worldActions: envelope.world_actions } : {}),
    ...(Object.prototype.hasOwnProperty.call(envelope, 'weekly_summary') ? { weeklySummary: envelope.weekly_summary } : {}),
    ...(Object.prototype.hasOwnProperty.call(envelope, 'strategy_updates') ? { strategyUpdates: envelope.strategy_updates } : {}),
    ...(Object.prototype.hasOwnProperty.call(envelope, 'strategy_major') ? { strategyMajor: envelope.strategy_major } : {}),
    ...(Object.prototype.hasOwnProperty.call(envelope, 'notebook_pages') ? { notebookPages: envelope.notebook_pages } : {}),
  }, state, replayTurnId);
}

