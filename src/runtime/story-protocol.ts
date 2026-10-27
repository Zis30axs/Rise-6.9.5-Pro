import type { GeneratedStory, OtherSideEvent, WorldState } from '../frontend/types';
import { isProtagonistId } from './dual-protagonists';
import { sceneLandmarks } from '../frontend/scene-layout';
import { campusInteriors } from './campus-interiors';
import { sceneLocationId } from './scene-context';
import { validateContactProposals } from './npc-phone';
import { validateStoryActions } from './story-actions';
export { STORY_ACTION_LIMITS } from './story-actions';

export const STORY_OUTPUT_LIMITS = {
  storyText: 6000,
  inputText: 2000,
  phoneEvents: 8,
  worldEvents: 1,
  otherSideEvents: 3,
  otherSideText: 1200,
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
export function validateOtherSideEvents(value: unknown, state: WorldState): OtherSideEvent[] {
  if (!Array.isArray(value) || value.length > STORY_OUTPUT_LIMITS.otherSideEvents) return invalid('otherside 事件数量');
  if (value.length && !state.protagonists) return invalid('otherside 需要已启用多主角存档');
  const used = new Set<string>();
  return value.map((raw, index) => {
    const path = `otherside 第 ${index + 1} 项`;
    const item = record(raw, ['protagonist', 'text'], path, ['locationId', 'variables']);
    if (!isProtagonistId(item.protagonist) || item.protagonist === state.protagonists?.accounts.active || used.has(item.protagonist))
      return invalid(`${path} 必须是本轮尚未使用的非当前主角 ID`);
    const protagonist = item.protagonist;
    used.add(protagonist);
    const result: OtherSideEvent = { protagonist, text: text(item.text, STORY_OUTPUT_LIMITS.otherSideText, `${path} 剧情`) };
    if (Object.hasOwn(item, 'locationId')) {
      if (typeof item.locationId !== 'string' || !OTHER_SIDE_LOCATIONS.has(item.locationId)) return invalid(`${path} 地点`);
      result.locationId = item.locationId;
    }
    if (Object.hasOwn(item, 'variables')) {
      const variables = record(item.variables, [], `${path} 变量`, OTHER_SIDE_VARIABLE_KEYS);
      if (!Object.keys(variables).length) return invalid(`${path} 变量不能为空`);
      result.variables = {};
      for (const key of OTHER_SIDE_VARIABLE_KEYS) {
        if (!Object.hasOwn(variables, key)) continue;
        const value = variables[key], bound = key === 'foodEnergy' ? 300 : 20;
        if (typeof value !== 'number' || !Number.isInteger(value) || Math.abs(value) > bound) return invalid(`${path} 变量 ${key} 越界`);
        result.variables[key] = value;
      }
    }
    return result;
  });
}

/** Rebuild the only allowed data fields; never apply arbitrary model patches. */
export function validateGeneratedStory(value: unknown, state: WorldState): GeneratedStory {
  const result = record(value, ['text', 'phoneMessages'], '回复', ['worldEvents', 'worldActions', 'weeklySummary', 'contactRequests', 'otherSide']);
  const story = text(result.text, STORY_OUTPUT_LIMITS.storyText, '正文');
  if (!Array.isArray(result.phoneMessages) || result.phoneMessages.length > STORY_OUTPUT_LIMITS.phoneEvents) return invalid('手机消息数量');
  const knownNpcs = new Set(state.contacts.map(contact => contact.id));
  const phoneMessages = result.phoneMessages.map((value, index) => {
    const item = record(value, ['npcId', 'text'], `手机消息 ${index + 1}`);
    if (typeof item.npcId !== 'string' || !knownNpcs.has(item.npcId)) return invalid(`手机消息 ${index + 1} 的联系人`);
    return { npcId: item.npcId, text: text(item.text, STORY_OUTPUT_LIMITS.messageText, `手机消息 ${index + 1} 的正文`) };
  });
  const parsed: GeneratedStory = { text: story, phoneMessages };
  if (Object.hasOwn(result, 'otherSide')) parsed.otherSide = validateOtherSideEvents(result.otherSide, state);
  if (Object.hasOwn(result, 'contactRequests')) parsed.contactRequests = validateContactProposals(result.contactRequests);
  if (Object.prototype.hasOwnProperty.call(result, 'worldActions')) parsed.worldActions = validateStoryActions(result.worldActions, state);
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
 * Prefer explicit data tags when a model cannot keep a whole JSON envelope.
 * Only known tags are structural; text outside them is never executed.
 * The model's actions still pass the exact same whitelist validator as JSON.
 */
function parseTaggedStory(source: string): Record<string, unknown> | null {
  const matches = [...source.matchAll(/<(story|phone_messages|world_actions|world_events|weekly_summary|contact_requests|otherside)>([\s\S]*?)<\/\1>/gi)];
  if (!matches.length) return null;
  const tokens = [...source.matchAll(/<\/?(?:story|phone_messages|world_actions|world_events|weekly_summary|contact_requests|otherside)>/gi)];
  if (tokens.length !== matches.length * 2) return invalid('关键标签重复或未闭合');
  const blocks = new Map<string, string>();
  let end = 0;
  for (const match of matches) {
    const start = match.index ?? 0;
    if (start < end) return invalid('关键标签嵌套');
    end = start + match[0].length;
    const name = match[1].toLowerCase();
    if (blocks.has(name)) return invalid('关键标签重复');
    blocks.set(name, match[2].trim());
  }
  if (!blocks.has('story')) return invalid('缺少 story 标签');
  const jsonArray = (name: string): unknown => {
    const original = blocks.get(name);
    if (original === undefined || !original) return [];
    const fenced = /^```(?:json)?\s*\n([\s\S]*?)\n```$/i.exec(original);
    try { return JSON.parse((fenced ? fenced[1] : original).trim()); }
    catch { return invalid(name + ' 必须为 JSON 数组'); }
  };
  return {
    story: blocks.get('story'),
    phone_messages: jsonArray('phone_messages'),
    ...(blocks.has('contact_requests') ? { contact_requests: jsonArray('contact_requests') } : {}),
    ...(blocks.has('otherside') ? { other_side: jsonArray('otherside') } : {}),
    ...(blocks.has('world_actions') ? { world_actions: jsonArray('world_actions') } : {}),
    ...(blocks.has('world_events') ? { world_events: jsonArray('world_events') } : {}),
    ...(blocks.has('weekly_summary') ? { weekly_summary: (() => { try { return JSON.parse(blocks.get('weekly_summary')!); } catch { return invalid('weekly_summary 必须为 JSON 对象'); } })() } : {}),
  };
}

/** Both legacy JSON and tagged narrative share one strict validation path. */
export function parseGeneratedStory(value: unknown, state: WorldState): GeneratedStory {
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
  const envelope = record(valueObject, ['story', 'phone_messages'], '回复', ['world_events', 'world_actions', 'weekly_summary', 'contact_requests', 'other_side']);
  return validateGeneratedStory({ text: envelope.story, phoneMessages: envelope.phone_messages,
    ...(Object.prototype.hasOwnProperty.call(envelope, 'contact_requests') ? { contactRequests: envelope.contact_requests } : {}),
    ...(Object.prototype.hasOwnProperty.call(envelope, 'other_side') ? { otherSide: envelope.other_side } : {}),
    ...(Object.prototype.hasOwnProperty.call(envelope, 'world_events') ? { worldEvents: envelope.world_events } : {}),
    ...(Object.prototype.hasOwnProperty.call(envelope, 'world_actions') ? { worldActions: envelope.world_actions } : {}),
    ...(Object.prototype.hasOwnProperty.call(envelope, 'weekly_summary') ? { weeklySummary: envelope.weekly_summary } : {}),
  }, state);
}

