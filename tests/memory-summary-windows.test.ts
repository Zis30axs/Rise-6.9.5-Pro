import { describe, expect, it } from 'vitest';
import { memoryArchiveBoundary, pendingJournalCount } from '../src/runtime/long-term-memory/thresholds';
import { PROMPT_CONTEXT_LIMITS, selectPromptJournal } from '../src/runtime/prompt-pruning';

const journals = (count: number, turn = 0) =>
  Array.from({ length: count }, (_, i) => ({ id: 'journal:emma:entry-' + i, kind: 'journal' as const, turn }));
const story = (turn: number) => [{ id: 'story:emma:turn-' + turn, kind: 'story' as const, turn }];

describe('memory summary windows', () => {
  it('sends every retained journal entry to the next main LLM prompt', () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({
      id: 'entry-' + i, at: '第 1 天 10:00', text: '已完成操作 ' + i,
    }));
    const projected = selectPromptJournal(rows);
    expect(PROMPT_CONTEXT_LIMITS.journalEntries).toBe(100);
    expect(projected).toHaveLength(100);
    expect(projected[0]?.id).toBe('entry-0');
    expect(projected[99]?.id).toBe('entry-99');
  });

  it('does not summarize before 20 story turns when at most 75 logs exist', () => {
    expect(memoryArchiveBoundary(journals(75), 0, 0, 20)).toBeNull();
    expect(memoryArchiveBoundary([...journals(75, 19), ...story(19)], 0, 0, 20)).toBeNull();
  });

  it('summarizes all pending evidence on the 20th story turn', () => {
    expect(memoryArchiveBoundary([...journals(75, 19), ...story(20)], 0, 0, 20)).toBe(20);
    expect(memoryArchiveBoundary([...journals(4, 39), ...story(39)], 20, 0, 20)).toBeNull();
    expect(memoryArchiveBoundary([...journals(4, 40), ...story(40)], 20, 0, 20)).toBe(40);
  });

  it('triggers early only after the 75th distinct log', () => {
    expect(memoryArchiveBoundary(journals(76), 0, 0, 20)).toBe(1);
    expect(pendingJournalCount([...journals(74), { id: 'journal:emma:long:part:0', kind: 'journal', turn: 0 },
      { id: 'journal:emma:long:part:1', kind: 'journal', turn: 0 }])).toBe(75);
  });

  it('drains a previously scheduled batch without creating unrelated early work', () => {
    expect(memoryArchiveBoundary(journals(25), 0, 1, 20)).toBe(1);
    expect(memoryArchiveBoundary(journals(3, 21), 20, 20, 20)).toBeNull();
  });

  it('keeps manual runs and disallows earlier custom intervals', () => {
    expect(memoryArchiveBoundary(story(12), 0, 0, 5)).toBeNull();
    expect(memoryArchiveBoundary(story(20), 0, 0, 5)).toBe(20);
    expect(memoryArchiveBoundary(story(1), 0, 0, 20, true)).toBe(1);
  });
});
