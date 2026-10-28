import { describe, expect, it } from 'vitest';
import { createInitialState } from '../src/runtime/model';
import { enableProtagonists } from '../src/runtime/protagonist-world';
import { collectCommittedSources } from '../src/runtime/long-term-memory/source';
import { parseExtraction } from '../src/runtime/long-term-memory/extractor';
import { chunk } from '../src/runtime/long-term-memory/scheduler';
import { isFutureMemory } from '../src/runtime/long-term-memory/storage';
import { parseMemoryTag } from '../src/runtime/long-term-memory/protocol';
import { approximateTokens } from '../src/runtime/long-term-memory/providers';
import type { MemorySource } from '../src/runtime/long-term-memory/types';

function source(id: string, kind: MemorySource['kind'], text: string, knownBy: MemorySource['knownBy']): MemorySource {
  const scope = 'test-chat';
  return { scope, key: JSON.stringify([scope, id]), id, kind, owner: 'emma',
    knownBy, participants: ['majo-emma'], text, at: 40, turn: 2, processed: false };
}

describe('long-term memory: source authority and bounded batching', () => {
  it('keeps the full long narrative split into independently addressable source parts', () => {
    const before = enableProtagonists(createInitialState());
    const after = structuredClone(before), owner = after.protagonists!.accounts.active;
    const text = '雪花项链与过去的约定。'.repeat(660);
    after.protagonists!.narrativeTurn = (before.protagonists!.narrativeTurn ?? 0) + 1;
    after.story.push({ id: 'memory-long-user', role: 'user', text: '请继续这一段回忆。' });
    after.story.push({ id: 'memory-long-assistant', role: 'assistant', text });
    const rows = collectCommittedSources('test-chat', before, after);
    const prose = rows.filter(s => s.id.startsWith('story:' + owner + ':memory-long-assistant'));
    expect(prose.length).toBeGreaterThan(1);
    expect(prose.map(s => s.text).join('')).toBe(text);
    expect(prose.every(s => s.text.length <= 640)).toBe(true);
    expect(prose.every(s => s.knownBy.length === 0)).toBe(true);
    expect(rows.some(s => s.id.startsWith('input:' + owner + ':memory-long-user'))).toBe(true);
  });

  it('keeps confirmed personal journals separate from omniscient prose', () => {
    const before = enableProtagonists(createInitialState());
    const after = structuredClone(before), owner = after.protagonists!.accounts.active;
    after.journal.push({ id: 'memory-journal-1', text: '收到一封信。', at: '第 1 天 12:00' });
    const rows = collectCommittedSources('test-chat', before, after);
    const journal = rows.find(s => s.id === 'journal:' + owner + ':memory-journal-1');
    expect(journal?.knownBy).toEqual([owner]);
  });

  it('never silently exceeds a deliberately small input batch budget', () => {
    const sources = [source('1', 'story', '茶'.repeat(640), []),
      source('2', 'story', '信'.repeat(640), [])];
    expect(approximateTokens(sources[0].text)).toBeGreaterThan(900);
    const selected = chunk(sources, 2000);
    expect(selected).toHaveLength(1);
    expect(() => chunk([source('oversize', 'story', '谜'.repeat(3000), [])], 2000)).toThrow();
  });
});

describe('long-term memory: rollback cutoff', () => {
  it('excludes future days and future narrative turns independently', () => {
    expect(isFutureMemory({ turn: 20, at: 22000 }, { turn: 18, at: 22000 })).toBe(true);
    expect(isFutureMemory({ turn: 15, at: 23000 }, { turn: 18, at: 22000 })).toBe(true);
    expect(isFutureMemory({ turn: 15, at: 21000 }, { turn: 18, at: 22000 })).toBe(false);
  });
});

describe('long-term memory: validated extraction and query protocol', () => {
  it('derives memory knowledge only from committed source permissions', () => {
    const first = source('a', 'journal', '艾玛收藏了那封信。', ['emma']);
    const second = source('b', 'story', '叙事者知道雪的秘密。', []);
    const response = JSON.stringify({ events: [
      { sourceIds: ['a'], kind: 'item', summary: '艾玛收藏了那封信。', importance: 5, entities: ['letter'], participants: ['majo-emma'], keywords: ['信件'] },
      { sourceIds: ['a', 'b'], kind: 'discovery', summary: '提及未知的秘密。', importance: 5 },
    ] });
    const events = parseExtraction('test-chat', [first, second], response);
    expect(events).toHaveLength(2);
    expect(events[0].knownBy).toEqual(['emma']);
    expect(events[0].factuality).toBe('confirmed');
    expect(events[1].knownBy).toEqual([]);
    expect(events[1].factuality).toBe('inferred');
  });

  it('rejects invented source IDs instead of accepting model hallucinations', () => {
    expect(() => parseExtraction('test-chat', [source('a', 'story', '已有记录', [])],
      '{"events":[{"sourceIds":["fabricated"],"kind":"promise","summary":"编造的承诺"}]}')).toThrow();
  });

  it('only accepts a standalone, bounded memory lookup tag', () => {
    expect(parseMemoryTag('<memory_lookup>{"operation":"search_memory","query":"旧项链"}</memory_lookup>'))
      .toEqual({ operation: 'search_memory', query: '旧项链' });
    expect(parseMemoryTag('<story>继续故事。</story>')).toBeNull();
    expect(() => parseMemoryTag('<story>先写故事</story><memory_lookup>{"operation":"search_memory","query":"秘密"}</memory_lookup>')).toThrow();
    expect(() => parseMemoryTag('<memory_lookup>{"operation":"delete_database","query":"秘密"}</memory_lookup>')).toThrow();
  });
});
