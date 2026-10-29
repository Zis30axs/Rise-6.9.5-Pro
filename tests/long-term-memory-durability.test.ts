import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MEMORY_OUTBOX_KEY, MAX_OUTBOX_SOURCES,
  acknowledgeSavedMemoryOutbox, appendSavedMemoryOutbox, outboxOverflowCount,
  readSavedMemoryOutbox, recoverSavedMemoryOutbox, releaseAcknowledgedMemorySpills,
} from '../src/runtime/long-term-memory/outbox';
import type { MemorySource } from '../src/runtime/long-term-memory/types';
import { createInitialState } from '../src/runtime/model';
import { enableProtagonists } from '../src/runtime/protagonist-world';
import * as archive from '../src/runtime/long-term-memory/storage';
import { memoryBootstrap, memoryCommitted, memoryArchiveSafe } from '../src/runtime/long-term-memory';
import { searchMemory } from '../src/runtime/long-term-memory/retrieval';

vi.mock('../src/runtime/long-term-memory/storage', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/runtime/long-term-memory/storage')>();
  return { ...actual, ingestSources: vi.fn(async () => {}),
    pruneFutureMemory: vi.fn(async () => 0), rows: vi.fn(async () => []) };
});
vi.mock('../src/runtime/long-term-memory/scheduler', () => ({
  pauseMemoryWork: vi.fn(async () => {}),
  memoryPauseVersion: vi.fn(() => 1),
  resumeMemoryWork: vi.fn(),
  memoryIsPaused: vi.fn(() => false),
  scheduleMemoryWork: vi.fn(),
}));

function source(scope: string, id: string, turn = 2, at = 5,
  owner: MemorySource['owner'] = 'soyo', text = '雪花与纸鹤的约定。'): MemorySource {
  return { scope, key: JSON.stringify([scope, id]), id, kind: 'story',
    owner, knownBy: [], participants: [], text, at, turn, processed: false };
}
function many(scope: string, count: number, turn = 2, at = 5): MemorySource[] {
  return Array.from({ length: count }, (_, i) =>
    source(scope, 'story:soyo:segment-' + i, turn, at, 'soyo',
      '第' + i + '段：' + '蓝色纸鹤与星光。'.repeat(35)));
}
function fakeLocalStorage(quota = Infinity) {
  const data = new Map<string, string>();
  return {
    data,
    getItem(key: string) { return data.get(key) ?? null; },
    setItem(key: string, value: string) {
      const used = [...data].reduce((n, [id, content]) => n + (id === key ? 0 : content.length), 0);
      if (used + value.length > quota) throw new Error('QuotaExceededError');
      data.set(key, value);
    },
    removeItem(key: string) { data.delete(key); },
  };
}
let counter = 0;
const scopeName = () => 'memory-durability-chat-' + ++counter;

beforeEach(() => {
  vi.stubGlobal('localStorage', fakeLocalStorage());
  vi.mocked(archive.ingestSources).mockResolvedValue(undefined);
  vi.mocked(archive.pruneFutureMemory).mockResolvedValue(0);
  vi.mocked(archive.rows).mockResolvedValue([]);
});
afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe('memory Sidecar: synchronous durable overflow journal', () => {
  it('spills past 160 sources/96k and recovers every source after page reopening', () => {
    const scope = scopeName(), original = many(scope, 250);
    const saved = appendSavedMemoryOutbox({}, scope, original, 2, 5);
    const first = readSavedMemoryOutbox(saved, scope);
    expect(first.sources.length).toBeLessThanOrEqual(MAX_OUTBOX_SOURCES);
    expect(first.spillIds?.length).toBeGreaterThan(0);
    expect(first.overflowCount).toBe(0);
    // Simulate a new iframe after the old story array was context-pruned.
    const restored = structuredClone(saved);
    const recovered = recoverSavedMemoryOutbox(restored, scope, 2, 5);
    expect(new Set(recovered.sources.map(s => s.key)).size).toBe(original.length);
    expect(recovered.overflowCount).toBe(0);
  });

  it('replaces partially acknowledged pages and releases only confirmed entries', () => {
    const scope = scopeName(), original = many(scope, 190);
    let committed = appendSavedMemoryOutbox({}, scope, original, 2, 5);
    const first = recoverSavedMemoryOutbox(committed, scope);
    const half = new Map(first.sources.filter((_, i) => i % 2 === 0).map(s => [s.key, s.text]));
    const before = committed;
    committed = acknowledgeSavedMemoryOutbox(committed, scope, half);
    releaseAcknowledgedMemorySpills(before, committed, scope);
    expect(new Set(recoverSavedMemoryOutbox(committed, scope).sources.map(s => s.key)))
      .toEqual(new Set(first.sources.filter(s => !half.has(s.key)).map(s => s.key)));
    const all = new Map(recoverSavedMemoryOutbox(committed, scope).sources.map(s => [s.key, s.text]));
    const after = acknowledgeSavedMemoryOutbox(committed, scope, all);
    releaseAcknowledgedMemorySpills(committed, after, scope);
    expect(recoverSavedMemoryOutbox(after, scope).sources).toHaveLength(0);
    expect(readSavedMemoryOutbox(after, scope).spillIds).toHaveLength(0);
  });

  it('does not erase partially acknowledged pages when localStorage refuses replacement writes', () => {
    const scope = scopeName(), original = many(scope, 200);
    const store = fakeLocalStorage();
    vi.stubGlobal('localStorage', store);
    const saved = appendSavedMemoryOutbox({}, scope, original, 2, 5);
    const spilled = recoverSavedMemoryOutbox(saved, scope).sources.slice(160);
    expect(spilled.length).toBeGreaterThan(0);
    const quota = { ...store, setItem(_key: string, _value: string) {
      throw new Error('QuotaExceededError');
    } };
    vi.stubGlobal('localStorage', quota);
    const ack = acknowledgeSavedMemoryOutbox(saved, scope, new Map([[spilled[0].key, spilled[0].text]]));
    const recovered = recoverSavedMemoryOutbox(ack, scope);
    // It is okay to replay the already-ingested row: ingestSources is idempotent.
    expect(recovered.sources.some(s => s.key === spilled[1].key)).toBe(true);
  });

  it('rejects a delayed ACK for the same key with different corrected prose', () => {
    const scope = scopeName(), old = source(scope, 'story:soyo:same-id', 2, 5,
      'soyo', '先前错误文本');
    const current = appendSavedMemoryOutbox({}, scope, [old], 2, 5);
    const incorrectReceipt = new Map([[old.key, '修订后的文本']]);
    expect(acknowledgeSavedMemoryOutbox(current, scope, incorrectReceipt)).toBe(current);
    expect(recoverSavedMemoryOutbox(current, scope).sources).toEqual([old]);
  });

  it('cannot silently lose overflow when localStorage is disabled or quota-exhausted', () => {
    const scope = scopeName();
    vi.stubGlobal('localStorage', fakeLocalStorage(1));
    const saved = appendSavedMemoryOutbox({}, scope, many(scope, 240), 2, 5);
    expect(outboxOverflowCount(saved, scope)).toBeGreaterThan(0);
    expect(recoverSavedMemoryOutbox(saved, scope).sources.length).toBeLessThan(240);
    expect(saved).toHaveProperty(MEMORY_OUTBOX_KEY);
  });

  it('requires a committed chat-variable reference before replaying a spill page', () => {
    const scope = scopeName(), before: Record<string, unknown> = {};
    const attemptedSave = appendSavedMemoryOutbox(before, scope, many(scope, 200), 2, 5);
    expect(recoverSavedMemoryOutbox(attemptedSave, scope).sources.length).toBe(200);
    // replaceVariables threw; the old variables remain authoritative.
    expect(recoverSavedMemoryOutbox(before, scope).sources).toHaveLength(0);
  });

  it('isolates different ST chats and preserves owner-specific source permissions', () => {
    const a = scopeName(), b = scopeName();
    let aVars = appendSavedMemoryOutbox({}, a, many(a, 180), 2, 5);
    aVars = appendSavedMemoryOutbox(aVars, a, [
      source(a, 'story:sakiko:secret', 2, 5, 'sakiko', '祥子只在自己日记里写了秘密。'),
    ], 2, 5);
    const bVars = appendSavedMemoryOutbox({}, b, [source(b, 'story:soyo:other')], 2, 5);
    expect(recoverSavedMemoryOutbox(aVars, a).sources.some(s => s.owner === 'sakiko')).toBe(true);
    expect(recoverSavedMemoryOutbox(aVars, b).sources).toHaveLength(0);
    expect(recoverSavedMemoryOutbox(bVars, b).sources).toHaveLength(1);
    expect(recoverSavedMemoryOutbox(bVars, a).sources).toHaveLength(0);
  });

  it('does not resurrect orphaned future pages after rollback and later replay', () => {
    const scope = scopeName();
    let saved = appendSavedMemoryOutbox({}, scope, many(scope, 175), 2, 5);
    saved = appendSavedMemoryOutbox(saved, scope, [
      source(scope, 'story:soyo:future-turn', 3, 30),
    ], 3, 30);
    expect(recoverSavedMemoryOutbox(saved, scope, 3, 30).sources
      .some(s => s.id === 'story:soyo:future-turn')).toBe(true);
    const rolled = appendSavedMemoryOutbox(saved, scope, [], 2, 5);
    // Even when the new branch eventually reaches turn 10, its old future
    // from turn 3 must not return through an unchanged localStorage page.
    expect(recoverSavedMemoryOutbox(rolled, scope, 10, 9999).sources
      .some(s => s.id === 'story:soyo:future-turn')).toBe(false);
    expect(recoverSavedMemoryOutbox(rolled, scope, 10, 9999).sources
      .some(s => s.id === 'story:soyo:segment-174')).toBe(true);
  });

  it('warns on an absent/corrupt spill page without reporting a complete recovery', () => {
    const scope = scopeName(), store = fakeLocalStorage();
    vi.stubGlobal('localStorage', store);
    const saved = appendSavedMemoryOutbox({}, scope, many(scope, 210), 2, 5);
    const spillId = readSavedMemoryOutbox(saved, scope).spillIds?.[0];
    expect(spillId).toBeTruthy();
    for (const key of store.data.keys()) if (key.endsWith(':' + spillId)) store.removeItem(key);
    expect(recoverSavedMemoryOutbox(saved, scope).overflowCount).toBeGreaterThan(0);
  });

  it('deduplicates repeated recovery instead of growing the journal', () => {
    const scope = scopeName(), items = many(scope, 185);
    const once = appendSavedMemoryOutbox({}, scope, items, 2, 5);
    const twice = appendSavedMemoryOutbox(once, scope, items, 2, 5);
    expect(recoverSavedMemoryOutbox(twice, scope).sources).toHaveLength(items.length);
    expect(readSavedMemoryOutbox(twice, scope).spillIds)
      .toEqual(readSavedMemoryOutbox(once, scope).spillIds);
  });
});

describe('memory Sidecar: failed IndexedDB writes and pruned-history retrieval', () => {
  it('leaves sources replayable after a failed IDB ingestion, and confirms only after success', async () => {
    const scope = scopeName(), items = many(scope, 200);
    let committed = appendSavedMemoryOutbox({}, scope, items, 2, 5);
    const ingest = vi.mocked(archive.ingestSources);
    ingest.mockRejectedValueOnce(new Error('transaction aborted'));
    const acknowledge = vi.fn((texts: ReadonlyMap<string, string>) => {
      const next = acknowledgeSavedMemoryOutbox(committed, scope, texts);
      releaseAcknowledgedMemorySpills(committed, next, scope);
      committed = next;
    });
    const state = enableProtagonists(createInitialState());
    state.protagonists!.narrativeTurn = 2;
    state.clock.day = 1; state.clock.hour = 0; state.clock.minute = 5;
    memoryBootstrap(scope, state, recoverSavedMemoryOutbox(committed, scope).sources, acknowledge);
    await vi.waitFor(() => expect(ingest).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(memoryArchiveSafe(scope)).toBe(false));
    expect(acknowledge).not.toHaveBeenCalled();
    expect(recoverSavedMemoryOutbox(committed, scope).sources).toHaveLength(items.length);
    // New iframe/chat entry: failure did not drain the journal.
    memoryBootstrap(scope, state, recoverSavedMemoryOutbox(committed, scope).sources, acknowledge);
    await vi.waitFor(() => expect(acknowledge).toHaveBeenCalledTimes(1));
    expect(recoverSavedMemoryOutbox(committed, scope).sources).toHaveLength(0);
    expect(memoryArchiveSafe(scope)).toBe(true);
  });

  it('can keyword-retrieve an original passage after it is absent from the trimmed game story', async () => {
    const scope = scopeName(), original = source(scope, 'story:soyo:archived-paper-crane',
      2, 5, 'soyo', '素世在冬夜把蓝色纸鹤藏在书架背面。');
    const items = [...many(scope, 180), original];
    const committed = appendSavedMemoryOutbox({}, scope, items, 2, 5);
    const archiveRows = recoverSavedMemoryOutbox(committed, scope).sources;
    const persisted = new Map(archiveRows.map(row => [row.key, row]));
    vi.mocked(archive.rows).mockImplementation(async <T>(table: string): Promise<T[]> =>
      (table === 'sources' ? [...persisted.values()] : []) as T[]);
    const trimmedGameState = createInitialState();
    trimmedGameState.story = [];
    expect(trimmedGameState.story).toHaveLength(0);
    const found = await searchMemory(scope, '蓝色纸鹤 书架背面', 'soyo', 50,
      { narrator: true, maxTurn: 2, limit: 8 });
    expect(found.some(row => row.id === original.id && row.text.includes('书架背面'))).toBe(true);
  });

  it('waits for an in-flight source transaction before pruning a committed rollback', async () => {
    const scope = scopeName(), before = enableProtagonists(createInitialState());
    const after = structuredClone(before);
    after.protagonists!.narrativeTurn = 3;
    after.clock.day = 1; after.clock.hour = 0; after.clock.minute = 30;
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const ingest = vi.mocked(archive.ingestSources);
    ingest.mockImplementationOnce(() => gate).mockResolvedValue(undefined);
    memoryCommitted(scope, before, after,
      [source(scope, 'story:soyo:inflight', 3, 30)]);
    await vi.waitFor(() => expect(ingest).toHaveBeenCalledTimes(1));
    const rewound = enableProtagonists(createInitialState());
    rewound.protagonists!.narrativeTurn = 2;
    rewound.clock.day = 1; rewound.clock.hour = 0; rewound.clock.minute = 5;
    memoryBootstrap(scope, rewound, []);
    await Promise.resolve();
    await Promise.resolve();
    expect(archive.pruneFutureMemory).not.toHaveBeenCalled();
    release();
    await vi.waitFor(() => expect(archive.pruneFutureMemory).toHaveBeenCalledTimes(1));
  });

  it('never reimports old same-turn prose after a confirmed rewrite', async () => {
    const scope = scopeName(), state = enableProtagonists(createInitialState());
    state.protagonists!.narrativeTurn = 3;
    state.clock.day = 1; state.clock.hour = 0; state.clock.minute = 30;
    state.story = [{ id: 'rewritten', role: 'assistant', text: '修正的本轮真实对白。' }];
    const old = source(scope, 'story:soyo:rewritten', 3, 30, 'soyo', '旧分支错误对白。');
    const written: MemorySource[][] = [];
    vi.mocked(archive.rows).mockResolvedValue([old]);
    vi.mocked(archive.ingestSources).mockImplementation(async batch => { written.push(batch); });
    const acknowledged = vi.fn();
    memoryBootstrap(scope, state, [old], acknowledged);
    await vi.waitFor(() => expect(acknowledged).toHaveBeenCalledTimes(1));
    expect(written.length).toBe(1);
    expect(written[0].some(row => row.key === old.key && row.text === old.text)).toBe(false);
    expect(written[0].some(row => row.key === old.key && row.text === '修正的本轮真实对白。')).toBe(true);
  });

  it('requires text evidence to declare same-turn divergence, not a missing pruned source', () => {
    const scope = scopeName(), archived = [
      source(scope, 'story:soyo:previous-pruned', 7, 100),
      source(scope, 'story:soyo:still-visible', 7, 100),
    ];
    const cutoff = { turn: 7, at: 100 };
    expect(archive.hasConfirmedSameTurnDivergence(archived, [archived[1]], cutoff)).toBe(false);
    expect(archive.hasConfirmedSameTurnDivergence(archived, [
      { ...archived[1], text: '改写了同一稳定ID对应的事件' },
    ], cutoff)).toBe(true);
  });
});
