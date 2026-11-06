import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearNovelReadingProgressCache,
  getNovelReadingProgress,
  novelProgressStorageKey,
  resolveReadingCursor,
  saveNovelReadingProgress,
  type ReadingRowItem,
} from '../src/frontend/novel-reading-progress';

describe('小说对白阅读进度（防切换重读）', () => {
  beforeEach(() => {
    clearNovelReadingProgressCache();
    try {
      globalThis.localStorage?.clear();
    } catch {
      // ignore
    }
  });

  const makeRow = (entryId: string, index: number, text = '台词'): ReadingRowItem => ({
    id: `${entryId}:${index}`,
    entryId,
    text,
  });

  it('生成作用域与主角隔离的存储键名', () => {
    expect(novelProgressStorageKey('chat-123', 'soyo')).toBe('unread-city.novel-progress.v1:chat-123:soyo');
    expect(novelProgressStorageKey('chat-123', 'sakiko')).toBe('unread-city.novel-progress.v1:chat-123:sakiko');
    expect(novelProgressStorageKey(undefined, undefined)).toBe('unread-city.novel-progress.v1:default:soyo');
  });

  it('跨主角保存与读取阅读进度互不干扰', () => {
    saveNovelReadingProgress('session-a', 'soyo', {
      entryId: 'entry-soyo-1',
      segmentId: 'entry-soyo-1:4',
      segmentIndex: 4,
      completed: false,
      updatedAt: 1000,
    });
    saveNovelReadingProgress('session-a', 'sakiko', {
      entryId: 'entry-sakiko-1',
      segmentId: 'entry-sakiko-1:1',
      segmentIndex: 1,
      completed: false,
      updatedAt: 2000,
    });

    const soyoProgress = getNovelReadingProgress('session-a', 'soyo');
    const sakikoProgress = getNovelReadingProgress('session-a', 'sakiko');

    expect(soyoProgress?.segmentId).toBe('entry-soyo-1:4');
    expect(sakikoProgress?.segmentId).toBe('entry-sakiko-1:1');
  });

  it('跨会话保存与读取阅读进度互不干扰', () => {
    saveNovelReadingProgress('session-1', 'soyo', {
      entryId: 'entry-1',
      segmentId: 'entry-1:2',
      segmentIndex: 2,
      completed: false,
      updatedAt: 1000,
    });
    saveNovelReadingProgress('session-2', 'soyo', {
      entryId: 'entry-2',
      segmentId: 'entry-2:5',
      segmentIndex: 5,
      completed: true,
      updatedAt: 2000,
    });

    expect(getNovelReadingProgress('session-1', 'soyo')?.segmentId).toBe('entry-1:2');
    expect(getNovelReadingProgress('session-2', 'soyo')?.segmentId).toBe('entry-2:5');
    expect(getNovelReadingProgress('session-2', 'soyo')?.completed).toBe(true);
  });

  it('现有对话重新载入时，默认停留在本段最后一句，不重新开始读', () => {
    const rows: ReadingRowItem[] = [
      makeRow('entry-1', 0),
      makeRow('entry-1', 1),
      makeRow('entry-2', 0),
      makeRow('entry-2', 1),
      makeRow('entry-2', 2),
    ];
    const entries = [
      { id: 'entry-1', role: 'assistant' as const },
      { id: 'entry-2', role: 'assistant' as const },
    ];

    const cursor = resolveReadingCursor({
      rows,
      entries,
      scope: 'existing-chat',
      protagonistId: 'soyo',
      lastKnownLatestEntryId: null, // 初次载入或重进
    });

    expect(cursor).toBe(rows.length - 1); // 停留在最后一句（索引 4），而非第 2 句（entry-2 起始）或第 0 句
  });

  it('现有对话已保存阅读位置时，精准恢复到上次停留在的具体台词', () => {
    const rows: ReadingRowItem[] = [
      makeRow('entry-1', 0),
      makeRow('entry-1', 1),
      makeRow('entry-2', 0),
      makeRow('entry-2', 1),
      makeRow('entry-2', 2),
    ];
    const entries = [
      { id: 'entry-1', role: 'assistant' as const },
      { id: 'entry-2', role: 'assistant' as const },
    ];

    saveNovelReadingProgress('existing-chat', 'soyo', {
      entryId: 'entry-2',
      segmentId: 'entry-2:1',
      segmentIndex: 3,
      completed: false,
      updatedAt: 1000,
    });

    const cursor = resolveReadingCursor({
      rows,
      entries,
      scope: 'existing-chat',
      protagonistId: 'soyo',
      lastKnownLatestEntryId: null,
    });

    expect(cursor).toBe(3); // 精准恢复到 entry-2:1
  });

  it('新游戏初始唯一开场白，从第 0 句开始读', () => {
    const rows: ReadingRowItem[] = [
      makeRow('opening-1', 0),
      makeRow('opening-1', 1),
      makeRow('opening-1', 2),
    ];
    const entries = [
      { id: 'opening-1', role: 'assistant' as const },
    ];

    const cursor = resolveReadingCursor({
      rows,
      entries,
      scope: 'fresh-new-game',
      protagonistId: 'soyo',
      lastKnownLatestEntryId: null,
    });

    expect(cursor).toBe(0);
  });

  it('交互产生新生成（新条目到达）时，从新条目的第 0 句开始读', () => {
    const rows: ReadingRowItem[] = [
      makeRow('entry-1', 0),
      makeRow('entry-1', 1),
      makeRow('entry-2', 0), // 索引 2
      makeRow('entry-2', 1),
      makeRow('entry-2', 2),
    ];
    const entries = [
      { id: 'entry-1', role: 'assistant' as const },
      { id: 'entry-2', role: 'assistant' as const },
    ];

    const cursor = resolveReadingCursor({
      rows,
      entries,
      scope: 'active-chat',
      protagonistId: 'soyo',
      lastKnownLatestEntryId: 'entry-1', // 上一次已知是 entry-1，现在产生了 entry-2
    });

    expect(cursor).toBe(2); // 定位到 entry-2 的第一句（索引 2）
  });
});
