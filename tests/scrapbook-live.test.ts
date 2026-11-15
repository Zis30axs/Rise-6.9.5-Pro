import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick, type App } from 'vue';
import { createInitialState, parseState } from '../src/runtime/model';
import { enableProtagonists } from '../src/runtime/protagonist-world';
import { parseGeneratedStory } from '../src/runtime/story-protocol';
import { createDemoHost } from '../src/frontend/demo';
import {
  applyDraftToScrapbook,
  createInitialScrapbook,
  exportAllScrapbooksBackup,
  hydratePersonScrapbook,
  importScrapbookBackupIntoStore,
  listScrapbookSummaries,
  mergePagesIntoScrapbook,
  notebookPageFromDraft,
  notebookPeople,
  readScrapbook,
  saveScrapbook,
  validateNotebookDrafts,
  writeNotebook,
} from '../src/runtime/notebook';
import {
  defaultBookProfileForPerson,
  PEN_MARK_PRESETS,
  SCRAPBOOK_FONT_FACES_CSS,
  STICKER_DATA_URLS,
} from '../src/runtime/notebook-scrapbook';
import ToolDock from '../src/frontend/ToolDock.vue';
import NotebookPanel from '../src/frontend/NotebookPanel.vue';
import type { ShellActions, ShellModel, WorldState } from '../src/frontend/types';

function installMemoryIndexedDB() {
  const databases = new Map<string, Map<string, Map<string, Record<string, unknown>>>>();

  const fakeIdb = {
    open(name: string) {
      let stores = databases.get(name);
      const isNew = !stores;
      if (!stores) {
        stores = new Map();
        databases.set(name, stores);
      }

      const db = {
        objectStoreNames: {
          contains: (storeName: string) => stores!.has(storeName),
        },
        createObjectStore(storeName: string) {
          if (!stores!.has(storeName)) stores!.set(storeName, new Map());
          return { createIndex: () => ({}) };
        },
        transaction(_storeNames: string | string[]) {
          let pending = 0;
          let scheduled = false;
          const txObj: Record<string, unknown> = {
            error: null,
            oncomplete: null,
            onerror: null,
            onabort: null,
            objectStore: (storeName: string) => storeHandle(storeName),
          };
          const maybeCommit = () => {
            if (scheduled || pending > 0) return;
            scheduled = true;
            setTimeout(() => {
              if (pending === 0) (txObj.oncomplete as ((ev: unknown) => void) | null)?.({});
            }, 0);
          };
          const trackReq = <T>(runner: () => T): IDBRequest<T> => {
            pending += 1;
            const req: Record<string, unknown> = {
              result: undefined,
              error: null,
              onsuccess: null,
              onerror: null,
            };
            queueMicrotask(() => {
              try {
                req.result = runner();
                (req.onsuccess as ((ev: unknown) => void) | null)?.({});
              } catch (err) {
                req.error = err;
                txObj.error = err;
                (req.onerror as ((ev: unknown) => void) | null)?.({});
              } finally {
                pending -= 1;
                if (pending === 0) {
                  scheduled = false;
                  maybeCommit();
                }
              }
            });
            return req as unknown as IDBRequest<T>;
          };
          const storeHandle = (storeName: string) => {
            const table = stores!.get(storeName)!;
            return {
              get(key: string) {
                return trackReq(() => {
                  const row = table.get(key);
                  return row ? structuredClone(row) : undefined;
                });
              },
              put(val: Record<string, unknown>) {
                return trackReq(() => {
                  const key = String(val.key);
                  table.set(key, structuredClone(val));
                  return key;
                });
              },
              index(idxName: string) {
                return {
                  getAll(query: unknown) {
                    return trackReq(() =>
                      [...table.values()]
                        .filter(row => row[idxName] === query)
                        .map(row => structuredClone(row)),
                    );
                  },
                };
              },
            };
          };
          maybeCommit();
          return txObj;
        },
        close() {},
      };

      const openReq: Record<string, unknown> = {
        result: db,
        error: null,
        onupgradeneeded: null,
        onsuccess: null,
        onerror: null,
      };
      queueMicrotask(() => {
        if (isNew || !stores!.has('scrapbooks')) {
          (openReq.onupgradeneeded as ((ev: unknown) => void) | null)?.({});
        }
        (openReq.onsuccess as ((ev: unknown) => void) | null)?.({});
      });
      return openReq;
    },
  };

  vi.stubGlobal('indexedDB', fakeIdb);
}

async function flushUi(ticks = 6) {
  for (let i = 0; i < ticks; i++) {
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 4));
    await nextTick();
  }
}

function makeModel(state: WorldState): ShellModel {
  return {
    mode: 'demo',
    memoryScope: 'test:scrapbook-live',
    state,
    busy: false,
    notice: '',
    connection: 'demo',
    externalPhoneAvailable: false,
    externalPhoneOpen: false,
    phoneStatus: 'idle',
    phoneError: '',
    phoneSource: 'embedded',
    phoneLinkStatus: 'idle',
    phoneLinkError: '',
    phoneUnread: 0,
    phoneContactUnread: [],
    notebookRevision: 0,
  };
}

describe('Hand-journal live integration & 3D scrapbook storage', () => {
  let app: App | undefined;
  let host: HTMLElement | undefined;

  afterEach(() => {
    app?.unmount();
    app = undefined;
    host?.remove();
    host = undefined;
    vi.unstubAllGlobals();
  });

  it('embeds all 13 local PNG sticker data URLs, offline Anthropic Serif font faces, Sakiko exception, and validates pen marks', () => {
    expect(Object.keys(STICKER_DATA_URLS)).toHaveLength(13);
    for (const url of Object.values(STICKER_DATA_URLS)) {
      expect(url.startsWith('data:image/png;base64,') || url.includes('assets/stickers/')).toBe(true);
    }

    expect(SCRAPBOOK_FONT_FACES_CSS).toContain("font-family: 'Anthropic Serif Display'");
    expect(SCRAPBOOK_FONT_FACES_CSS).toContain("font-family: 'Anthropic Serif Text'");
    expect(SCRAPBOOK_FONT_FACES_CSS).toMatch(/data:font|anthropic_serif_/);
    expect(defaultBookProfileForPerson('sakiko', '丰川祥子').defaultFontStyle).toBe('anthropic-serif');
    expect(defaultBookProfileForPerson('sakiko', '丰川祥子').defaultInkColor).toBe('navy');
    expect(defaultBookProfileForPerson('soyo', '长崎素世').defaultFontStyle).toBe('handwriting');
    expect(defaultBookProfileForPerson('bang-mutsumi', '若叶睦').defaultFontStyle).toBe('handwriting');

    const state = parseState(enableProtagonists(createInitialState()));
    const drafts = validateNotebookDrafts([{
      personId: 'bang-mutsumi',
      title: '阳台与黄瓜苗',
      text: '今天新长了两片叶子，顺手贴上一张贴纸。',
      side: 'right',
      weather: '微风',
      mood: '平静',
      paperStyle: 'dot',
      fontStyle: 'handwriting',
      inkColor: 'forest',
      titleMark: 'wave-underline',
      dateCircled: true,
      themeId: 'forest',
      coverStyle: 'botanical-press',
      charmId: '咖啡杯黑猫坠',
      clipId: 'brass-clip',
      items: [
        { type: 'sticker', presetId: '睦-鼓脸', x: 999, y: -12, scale: 5, rotate: 90, caption: '鼓脸睦' },
        { type: 'mark', presetId: 'mark-circle-red', tint: '#345f9e', x: 35, y: 24, scale: 1.1 },
        { type: 'tape', presetId: '不存在的胶带样式' },
        { type: 'pressed', presetId: 'pressed-clover', side: 'cover', x: 30, y: 70 },
      ],
    }], state);

    expect(drafts).toHaveLength(1);
    const d = drafts[0]!;
    expect(d.charmId).toBe('charm-cat');
    expect(d.paperStyle).toBe('dot');
    expect(d.fontStyle).toBe('handwriting');
    expect(d.inkColor).toBe('forest');
    expect(d.titleMark).toBe('wave-underline');
    expect(d.dateCircled).toBe(true);
    expect(d.items).toHaveLength(3);
    expect(d.items![0]).toMatchObject({
      type: 'sticker',
      presetId: 'chibi-01',
      x: 92,
      y: 8,
      scale: 1.8,
      rotate: 45,
      caption: '鼓脸睦',
    });
    expect(d.items![1]).toMatchObject({
      type: 'mark',
      presetId: 'mark-circle-red',
      tint: '#345f9e',
    });
    expect(d.items![2]).toMatchObject({
      type: 'pressed',
      presetId: 'pressed-clover',
      side: 'cover',
    });

    expect(() => validateNotebookDrafts([{ personId: 'soyo', title: '一', text: '二', wallet: 10 }], state)).toThrow();
    expect(() => validateNotebookDrafts([{
      personId: 'soyo',
      title: '一',
      text: '二',
      items: [{ type: 'sticker', presetId: 'chibi-01', hacked: true }],
    }], state)).toThrow();
  });

  it('parses decorated <notebook_pages> alongside story and <phone_messages>[]', () => {
    const state = parseState(enableProtagonists(createInitialState()));
    const raw = [
      '<story>黄昏风吹过音乐室，祥子在谱架边合上了笔记本。</story>',
      '<phone_messages>[]</phone_messages>',
      `<notebook_pages>${JSON.stringify([{
        personId: 'sakiko',
        title: '晚间曲谱笔记',
        text: '记下一段新的前奏和弦，明天试着弹一遍。',
        side: 'right',
        mood: '专注',
        paperStyle: 'music',
        items: [
          { type: 'sticker', presetId: 'chibi-04', caption: '音符草稿', x: 74, y: 76 },
          { type: 'stamp', presetId: 'stamp-music', x: 78, y: 24 },
        ],
      }])}</notebook_pages>`,
    ].join('\n');

    const reply = parseGeneratedStory(raw, state);
    expect(reply.text).toContain('祥子在谱架边合上了笔记本');
    expect(reply.notebookPages).toHaveLength(1);
    expect(reply.notebookPages![0]!.personId).toBe('sakiko');
    expect(reply.notebookPages![0]!.items).toHaveLength(2);
  });

  it('persists separate books per character, preserves edits against repeated page merges, and roundtrips backups', async () => {
    installMemoryIndexedDB();
    const state = parseState(enableProtagonists(createInitialState()));
    const scope = 'test:persistence';

    const page = notebookPageFromDraft({
      personId: 'soyo',
      title: '初入轻音部的一页',
      text: '红茶很香，大家还在磨合。',
      paperStyle: 'grid',
      mood: '温暖',
      items: [{ type: 'sticker', presetId: 'mygo-o', x: 75, y: 74, caption: '下午茶时间' }],
    }, state, 'msg-1', 0);
    await writeNotebook(scope, [page]);

    // First hydration imports page msg-1:0 into soyo's spread
    const hydrated = await hydratePersonScrapbook(scope, state, 'soyo', '长崎素世');
    expect(hydrated.importedPageIds).toContain('msg-1:0');
    expect(hydrated.spreads[0]!.left.title).toBe('初入轻音部的一页');
    expect(hydrated.spreads[0]!.items.some(i => i.presetId === 'mygo-o')).toBe(true);

    // Player edits title and deletes sticker -> re-merging same store pages must NOT overwrite edits
    hydrated.spreads[0]!.left.title = '被我改写后的真实手账标题';
    hydrated.spreads[0]!.items = [];
    await saveScrapbook(scope, hydrated);

    const rehydrated = await hydratePersonScrapbook(scope, state, 'soyo', '长崎素世');
    expect(rehydrated.spreads[0]!.left.title).toBe('被我改写后的真实手账标题');
    expect(rehydrated.spreads[0]!.items).toHaveLength(0);

    // Separate character book remains isolated
    const sakikoBook = await hydratePersonScrapbook(scope, state, 'sakiko', '丰川祥子');
    expect(sakikoBook.personId).toBe('sakiko');
    expect(sakikoBook.themeId).toBe('indigo');
    expect(sakikoBook.spreads[0]!.left.title).not.toBe('被我改写后的真实手账标题');

    // Summary listing and full backup export -> restore into fresh scope
    const summaries = await listScrapbookSummaries(scope);
    expect(summaries.get('soyo')?.filledPages).toBeGreaterThanOrEqual(1);
    expect(summaries.has('sakiko')).toBe(true);

    const backupJson = await exportAllScrapbooksBackup(scope);
    const restoreScope = 'test:restored';
    const imported = await importScrapbookBackupIntoStore(restoreScope, backupJson, state, 'soyo');
    expect(imported.importedBooks).toBeGreaterThanOrEqual(2);
    const restoredSoyo = await readScrapbook(restoreScope, 'soyo');
    expect(restoredSoyo?.spreads[0]!.left.title).toBe('被我改写后的真实手账标题');

    // Pure merge test for direct manual verification
    const initial = createInitialScrapbook(scope, 'bang-mutsumi', '若叶睦', state);
    const updated = applyDraftToScrapbook(initial, {
      personId: 'bang-mutsumi',
      title: '给小黄瓜换水',
      text: '今天阳光正好。',
      side: 'right',
    }, state, { pageId: 'direct-1' });
    const remerged = mergePagesIntoScrapbook(updated, [{
      ...page,
      id: 'direct-1',
      personId: 'bang-mutsumi',
      title: '不应覆盖旧标题',
    }], state);
    expect(remerged.changed).toBe(false);
    expect(remerged.book.spreads[0]!.right.title).toBe('给小黄瓜换水');
  });

  it('supports demo bridge notebook_compose generation with bespoke stickers, fonts, marks & metadata', async () => {
    const demo = createDemoHost();
    const bridge = demo.createBridge();
    const state = bridge.load();
    const reply = await bridge.generate('', state, {
      kind: 'notebook_compose',
      personId: 'bang-mutsumi',
      spreadIndex: 0,
      targetSide: 'right',
      instruction: '写一下今天阳台薄荷发芽的事情',
    });
    expect(reply.notebookPages).toHaveLength(1);
    expect(reply.notebookPages![0]!.personId).toBe('bang-mutsumi');
    expect(reply.notebookPages![0]!.items?.some(it => it.presetId === 'chibi-01')).toBe(true);

    const sakikoReply = await bridge.generate('', state, {
      kind: 'notebook_compose',
      personId: 'sakiko',
      spreadIndex: 0,
      targetSide: 'right',
    });
    expect(sakikoReply.notebookPages).toHaveLength(1);
    expect(sakikoReply.notebookPages![0]!).toMatchObject({
      personId: 'sakiko',
      fontStyle: 'anthropic-serif',
      inkColor: 'navy',
      titleMark: 'double-underline',
      dateCircled: true,
    });
    expect(sakikoReply.notebookPages![0]!.items?.some(it => it.type === 'mark')).toBe(true);
  });

  it('promotes hand-journal launcher in ToolDock with bespoke multi-layered SVG outside secondary menu', async () => {
    host = document.createElement('div');
    document.body.append(host);
    const selected: string[] = [];
    app = createApp(ToolDock, {
      items: [
        { id: 'phone', title: '手机', path: 'M8 3h8' },
        { id: 'map', title: '地图', path: 'M9 4 3 7' },
        { id: 'notebook', title: '手账', path: 'M5 4h14' },
        { id: 'location', title: '场景', path: 'M12 2' },
      ],
      active: null,
      unread: 0,
      editing: false,
      onSelect: (panel: string) => selected.push(panel),
    });
    app.mount(host);
    await nextTick();

    const shortcuts = host.querySelector('.tool-dock-shortcuts');
    const launcher = shortcuts?.querySelector<HTMLButtonElement>('[data-notebook-entry].notebook-launcher');
    expect(launcher).toBeTruthy();
    expect(launcher?.querySelector('.notebook-bespoke-svg path')).toBeTruthy();
    expect(launcher?.querySelector('.notebook-bespoke-svg rect')).toBeTruthy();
    expect(launcher?.querySelector('.notebook-bespoke-svg circle')).toBeTruthy();
    launcher!.click();
    expect(selected).toEqual(['notebook']);
  });

  it('mounts NotebookPanel, switches character books, accepts character co-authoring, edits items, and persists across remount without engineering copy', async () => {
    installMemoryIndexedDB();
    const state = parseState(enableProtagonists(createInitialState()));
    const composeCalls: unknown[] = [];

    const actions: Partial<ShellActions> = {
      async composeNotebookPage(params) {
        composeCalls.push(params);
        return {
          personId: params.personId,
          title: '琴房黄昏便签',
          text: '顺手把一段降B调草稿抄在了右侧，风从百叶窗缝隙吹了进来。',
          side: params.targetSide,
          mood: '专注',
          paperStyle: 'music',
          fontStyle: 'anthropic-serif',
          inkColor: 'navy',
          titleMark: 'double-underline',
          dateCircled: true,
          items: [
            { type: 'sticker', presetId: 'chibi-04', side: params.targetSide, x: 74, y: 74, caption: '夜晚练琴卡' },
            { type: 'pressed', presetId: 'pressed-lavender', side: params.targetSide, x: 26, y: 78 },
          ],
        };
      },
    };

    const mountPanel = async () => {
      host?.remove();
      app?.unmount();
      host = document.createElement('div');
      document.body.append(host);
      app = createApp(NotebookPanel, {
        model: makeModel(state),
        actions: actions as ShellActions,
      });
      app.mount(host);
      await flushUi(8);
    };

    await mountPanel();

    // Ensure zero forbidden engineering terminology leaks into player UI
    const visibleText = host!.textContent ?? '';
    for (const forbidden of ['LLM', 'Agent', 'IndexedDB', 'MVU', 'Prompt', 'Schema', 'world_actions']) {
      expect(visibleText).not.toContain(forbidden);
    }

    // Verify all characters listed & search works cleanly
    expect(notebookPeople(state).length).toBeGreaterThan(3);
    expect(host!.querySelector('[data-notebook-person="soyo"]')).toBeTruthy();
    expect(host!.querySelector('[data-notebook-person="sakiko"]')).toBeTruthy();
    expect(host!.querySelector('[data-notebook-person="bang-mutsumi"]')).toBeTruthy();

    // Switch to another character's hand-journal (Sakiko) — uses Anthropic Serif exception by default
    host!.querySelector<HTMLButtonElement>('[data-notebook-person="sakiko"]')!.click();
    await flushUi(8);
    expect(host!.querySelector('[data-spread-side="left"]')?.getAttribute('data-font-style')).toBe('anthropic-serif');
    expect(host!.querySelector('[data-spread-side="right"]')?.getAttribute('data-font-style')).toBe('anthropic-serif');

    // Ask character to write & decorate page
    const hintInput = host!.querySelector<HTMLInputElement>('[data-scrapbook-compose-hint]')!;
    hintInput.value = '写一段傍晚在琴房练习的心情';
    hintInput.dispatchEvent(new Event('input'));
    await nextTick();
    host!.querySelector<HTMLButtonElement>('[data-scrapbook-compose]')!.click();
    await flushUi(10);

    expect(composeCalls).toHaveLength(1);
    const rightTitle = host!.querySelector<HTMLInputElement>('[data-page-title="right"]')!;
    const rightBody = host!.querySelector<HTMLTextAreaElement>('[data-page-body="right"]')!;
    expect(rightTitle.value).toBe('琴房黄昏便签');
    expect(rightBody.value).toContain('降B调草稿');
    expect(host!.querySelector('[data-spread-side="right"]')?.getAttribute('data-title-mark')).toBe('double-underline');
    expect(host!.querySelector('[data-spread-side="right"]')?.getAttribute('data-date-circled')).toBe('1');
    expect(host!.querySelectorAll('[data-placed-item]').length).toBeGreaterThanOrEqual(2);

    // Edit title, toggle wave underline & date circle off/on, add sticker + hand-drawn red circle mark & tint
    rightTitle.value = '玩家亲手修改的终稿标题';
    rightTitle.dispatchEvent(new Event('input'));
    host!.querySelector<HTMLButtonElement>('[data-title-mark="wave-underline"]')?.click();
    host!.querySelector<HTMLButtonElement>('[data-toggle-date-circle]')?.click();
    await nextTick();
    expect(host!.querySelector('[data-spread-side="right"]')?.getAttribute('data-title-mark')).toBe('wave-underline');
    expect(host!.querySelector('[data-spread-side="right"]')?.getAttribute('data-date-circled')).toBe('0');
    host!.querySelector<HTMLButtonElement>('[data-toggle-date-circle]')?.click();
    await nextTick();

    const stickersTab = Array.from(host!.querySelectorAll<HTMLButtonElement>('button')).find(b => b.textContent?.includes('贴纸扩展'));
    stickersTab!.click();
    await nextTick();
    expect(host!.querySelectorAll('[data-add-mark]').length).toBe(PEN_MARK_PRESETS.length);
    host!.querySelector<HTMLButtonElement>('[data-add-sticker="chibi-01"]')!.click();
    await flushUi(4);

    stickersTab!.click();
    await nextTick();
    host!.querySelector<HTMLButtonElement>('[data-add-mark="mark-circle-red"]')!.click();
    await flushUi(4);
    host!.querySelector<HTMLButtonElement>('[data-mark-tint="#593e6d"]')?.click();
    await flushUi(8);

    // Wait for debounced permanent save (280ms) to finish before unmounting
    await new Promise(resolve => setTimeout(resolve, 360));
    await flushUi(6);
    expect(host!.querySelector('[data-scrapbook-save-state]')?.textContent).toContain('已永久保存');

    // Unmount and remount fresh component instance to verify permanent recovery from IndexedDB
    await mountPanel();
    host!.querySelector<HTMLButtonElement>('[data-notebook-person="sakiko"]')!.click();
    await flushUi(8);

    expect(host!.querySelector<HTMLInputElement>('[data-page-title="right"]')!.value).toBe('玩家亲手修改的终稿标题');
    expect(host!.querySelector('[data-spread-side="right"]')?.getAttribute('data-title-mark')).toBe('wave-underline');
    expect(host!.querySelector('[data-spread-side="right"]')?.getAttribute('data-date-circled')).toBe('1');
    expect(host!.querySelectorAll('[data-placed-item]').length).toBeGreaterThanOrEqual(4);
    expect(host!.querySelectorAll('.nb-pen-mark').length).toBeGreaterThanOrEqual(1);

    // Verify unlimited zoom-in, wheel zoom even when view is locked, workshop collapse, and zoom reset
    const lockBtn = Array.from(host!.querySelectorAll<HTMLButtonElement>('button')).find(b => b.textContent?.includes('锁定视角'));
    lockBtn!.click();
    await nextTick();

    const zoomInBtn = host!.querySelector<HTMLButtonElement>('[data-scrapbook-zoom-in]')!;
    for (let i = 0; i < 8; i += 1) {
      zoomInBtn.click();
    }
    await nextTick();
    const zoomText = host!.querySelector('[data-scrapbook-zoom-value]')?.textContent?.trim() ?? '';
    const zoomPct = Number.parseInt(zoomText, 10);
    expect(zoomPct).toBeGreaterThan(300);

    const stageEl = host!.querySelector<HTMLElement>('[data-scrapbook-stage]')!;
    stageEl.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, bubbles: true, cancelable: true }));
    await nextTick();
    const wheelZoomPct = Number.parseInt(host!.querySelector('[data-scrapbook-zoom-value]')?.textContent?.trim() ?? '', 10);
    expect(wheelZoomPct).toBeGreaterThan(zoomPct);

    const workshopBtn = host!.querySelector<HTMLButtonElement>('[data-notebook-toggle-workshop]')!;
    workshopBtn.click();
    await nextTick();
    expect(host!.querySelector('.nb-studio-grid')?.classList.contains('is-workshop-collapsed')).toBe(true);
    workshopBtn.click();
    await nextTick();

    host!.querySelector<HTMLButtonElement>('[data-scrapbook-reset-view]')!.click();
    await nextTick();
    expect(host!.querySelector('[data-scrapbook-zoom-value]')?.textContent?.trim()).toBe('104%');
  });
});
