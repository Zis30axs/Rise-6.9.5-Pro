import type { GeneratedStory, WorldState } from '../frontend/types';

export const STORY_OUTPUT_LIMITS = {
  storyText: 6000,
  inputText: 2000,
  phoneEvents: 8,
  messageText: 2000,
  // JSON can use six characters to encode one Unicode code unit. Bound the
  // complete transport without truncating valid JSON before it is parsed.
  protocolText: 160000,
} as const;

function invalid(detail: string): never {
  throw new Error(`剧情回复格式不正确：${detail}。正文和手机消息均未写入，请重试。`);
}

function record(value: unknown, keys: readonly string[], path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid(path);
  const ownKeys = Object.keys(value);
  if (ownKeys.length !== keys.length || ownKeys.some(key => !keys.includes(key))) return invalid(`${path} 字段`);
  return value as Record<string, unknown>;
}

function text(value: unknown, max: number, path: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || value.includes('\u0000')) return invalid(path);
  return value.trim();
}

/** Rebuild the only allowed data fields; never apply arbitrary model patches. */
export function validateGeneratedStory(value: unknown, state: WorldState): GeneratedStory {
  const result = record(value, ['text', 'phoneMessages'], '回复');
  const story = text(result.text, STORY_OUTPUT_LIMITS.storyText, '正文');
  if (!Array.isArray(result.phoneMessages) || result.phoneMessages.length > STORY_OUTPUT_LIMITS.phoneEvents) return invalid('手机消息数量');
  const knownNpcs = new Set(state.contacts.map(contact => contact.id));
  const phoneMessages = result.phoneMessages.map((value, index) => {
    const item = record(value, ['npcId', 'text'], `手机消息 ${index + 1}`);
    if (typeof item.npcId !== 'string' || !knownNpcs.has(item.npcId)) return invalid(`手机消息 ${index + 1} 的联系人`);
    return { npcId: item.npcId, text: text(item.text, STORY_OUTPUT_LIMITS.messageText, `手机消息 ${index + 1} 的正文`) };
  });
  return { text: story, phoneMessages };
}

/** A whole JSON envelope (optionally fenced) is required. Prose is never scraped for events. */
export function parseGeneratedStory(value: unknown, state: WorldState): GeneratedStory {
  if (typeof value !== 'string' || !value.trim() || value.length > STORY_OUTPUT_LIMITS.protocolText) return invalid('回复为空或过长');
  let source = value.trim();
  if (source.startsWith('```')) {
    const fenced = /^```(?:json)?\s*\n([\s\S]*?)\n```$/i.exec(source);
    if (!fenced) return invalid('请返回完整 JSON');
    source = fenced[1].trim();
  }
  let valueObject: unknown;
  try { valueObject = JSON.parse(source); }
  catch { return invalid('请返回完整 JSON'); }
  const envelope = record(valueObject, ['story', 'phone_messages'], 'JSON');
  return validateGeneratedStory({ text: envelope.story, phoneMessages: envelope.phone_messages }, state);
}
