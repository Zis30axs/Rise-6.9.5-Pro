import { memoryKey } from './types';
import type { MemoryEvent, MemorySource } from './types';

const CATEGORIES = new Set(['interaction', 'promise', 'relationship', 'item', 'discovery', 'decision', 'conflict', 'resolution']);

export function memoryExtractionPrompt(): string {
  return [
    '你是结构化史料整理员，不是小说作者。输入仅为已保存剧情的历史来源。',
    '每批一次性整理并定稿：输出就是游戏的正式长期历史记忆。准确总结已保存的事件、承诺、关系和物品经历，不续写、不幻想、不推断未发生之事。',
    '只输出 JSON 对象：{"events":[{"sourceIds":["来源ID"],"kind":"interaction|promise|relationship|item|discovery|decision|conflict|resolution","summary":"事实摘要","participants":["出现的稳定人物ID"],"entities":["稳定实体ID或已有名称"],"keywords":["索引词"],"importance":1}]}。',
    'sourceIds 必须逐字取自输入。允许忠于原意的语义改写，不能增添原文不存在的行动或结论。来源 ID 只用于追溯历史，不用于字面判决。',
    '人物私人知情不能凭猜测扩大；有人说过某句话，不意味着话中的内容是客观事实；未执行的意图不能写成完成的行为。',
    '一次定稿后历史摘要不再接受其他模型反复复核或修改。为同一事件去重；没有值得保存的事实时返回 {"events":[]}。',
    '每个摘要不超过350字，每批最多30条，每条仅能引用本批来源。不要输出 Markdown。',
  ].join('\n');
}
export function memoryExtractionInput(sources: MemorySource[]): string {
  return JSON.stringify(sources.map(s => ({
    sourceId: s.id, gameMinute: s.at, turn: s.turn, kind: s.kind,
    owner: s.owner, knownBy: s.knownBy, participants: s.participants,
    text: s.text,
  })));
}
export function parseExtraction(scope: string, sourceRows: MemorySource[], raw: string): MemoryEvent[] {
  const cleaned = raw.trim().replace(/^\`\`\`(?:json)?\s*/i, '').replace(/\`\`\`$/, '').trim();
  const parsed: unknown = JSON.parse(cleaned);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('整理结果必须是对象');
  const body = parsed as Record<string, unknown>;
  if (!Array.isArray(body.events) || body.events.length > 30) throw new Error('整理事件数量不合法');
  const index = new Map(sourceRows.map(s => [s.id, s]));
  const result: MemoryEvent[] = [];
  // A second paraphrase of the same committed source must never create an
  // alternative historical entry. Memory identity does not depend on wording.
  const sourceKindCounts = new Map<string, number>();
  for (const [i, value] of body.events.entries()) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('事件结构非法');
    const e = value as Record<string, unknown>;
    if (!Array.isArray(e.sourceIds) || !e.sourceIds.length || e.sourceIds.length > 10
      || e.sourceIds.some(x => typeof x !== 'string' || !index.has(x))
      || !CATEGORIES.has(e.kind as string)
      || typeof e.summary !== 'string' || !e.summary.trim() || e.summary.length > 350) throw new Error('事件字段非法');
    const origin = (e.sourceIds as string[]).map(id => index.get(id)!);
    const strings = (value: unknown, limit: number) => Array.isArray(value) && value.length <= limit
      && value.every(s => typeof s === 'string' && s.length <= 100)
      ? value as string[] : [];
    const known = origin.reduce<string[]>((all, source) =>
      all.filter(id => source.knownBy.includes(id)), [...new Set(origin[0].knownBy)]);
    // Stable bounded ID: source IDs may be long and the batch can be reordered.
    const grouping = JSON.stringify([origin.map(s => s.id).sort(), e.kind]);
    const ordinal = sourceKindCounts.get(grouping) ?? 0;
    sourceKindCounts.set(grouping, ordinal + 1);
    const identity = grouping + ':' + ordinal;
    let signature = 2166136261;
    for (const char of identity) signature = Math.imul(signature ^ char.charCodeAt(0), 16777619);
    const eventId = 'extract:' + (signature >>> 0).toString(36) + ':' + identity.length + ':' + ordinal;
    const participants = strings(e.participants, 12);
    result.push({
      scope, key: memoryKey(scope, eventId), id: eventId,
      sourceIds: origin.map(s => s.id), kind: e.kind as MemoryEvent['kind'],
      summary: e.summary.trim(), at: Math.max(...origin.map(s => s.at)),
      turn: Math.max(...origin.map(s => s.turn)),
      participants, entities: strings(e.entities, 16), keywords: strings(e.keywords, 20),
      knownBy: known,
      importance: Math.max(1, Math.min(5, Number.isInteger(e.importance) ? e.importance as number : 2)),
      visibility: known.length ? 'character' : 'narrator',
    });
  }
  return result;
}
