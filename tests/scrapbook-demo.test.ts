// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  adaptWorldStateToSnapshot,
  angled3DPose,
  backCoverPose,
  BOOK_CLIPS,
  BOOK_THEMES,
  buildDefaultCoverItemsByTheme,
  buildDefaultSpreadsByTheme,
  CHARM_MOUNTS,
  CHARM_PRESETS,
  closedFrontPose,
  CLIPPING_PRESETS,
  COVER_STYLES,
  createBlankSpread,
  createItemFromPreset,
  derivePageHeaderFromSnapshot,
  DESK_MOODS,
  DOODLE_PRESETS,
  exportNotebookPagesCompat,
  exportScrapbookBackup,
  extractWorldMemories,
  fitBookScale,
  flatEditPose,
  formatWorldCalendarDay,
  importScrapbookBackup,
  isBackFacing,
  isFlatEnough,
  moveItemLayer,
  PRESSED_PRESETS,
  resolveCharmAnchor,
  rotateBookPose,
  stepCharmPendulum,
  STICKER_DEFS,
  STICKY_NOTE_PRESETS,
  updatePlacedItem,
  WASHI_TAPES,
  WAX_SEAL_PRESETS,
  WORLD_SNAPSHOT_PRESETS,
  zoomBookPose,
} from '../scripts/scrapbook-demo-core.mjs';
import { buildScrapbookDemo } from '../scripts/build_scrapbook_demo.mjs';
import { createPhoneSolid, phoneModels } from '../src/frontend/phone-spatial-model';

const FORBIDDEN_ENGINEERING_WORDS = [
  'LLM',
  'MVU',
  'IndexedDB',
  'Schema',
  '提示词',
  '未调用模型',
  '不触发正文',
  'world_actions',
];

const FORBIDDEN_PERSONAL_WORDS = [
  '长崎素世',
  '丰川祥子',
  '樱羽艾玛',
  '甘织玲奈子',
  'SOYO',
  'SAKIKO',
  'EMMA',
  'RENAKO',
  '杂司谷',
  'TOKYO',
];

describe('3D Scrapbook Workbench Demo', () => {
  it('defines themes, ornate cover defaults, and sample spreads with zero personal info', () => {
    const coverItems = buildDefaultCoverItemsByTheme();
    const spreads = buildDefaultSpreadsByTheme();
    for (const themeId of ['sage', 'indigo', 'dusk', 'blossom'] as const) {
      expect(BOOK_THEMES[themeId]).toBeDefined();
      expect(coverItems[themeId]?.length).toBeGreaterThanOrEqual(4);
      expect(spreads[themeId]?.length).toBeGreaterThanOrEqual(2);
    }
    expect(STICKER_DEFS).toHaveLength(13);
    expect(STICKER_DEFS.find((d) => d.id === 'chibi-01')?.label).toBe('睦-鼓脸');
    expect(STICKER_DEFS.find((d) => d.id === 'mygo-m')?.label).toBe('乐奈-对指 M');
    expect(WASHI_TAPES.length).toBeGreaterThanOrEqual(6);
    expect(CLIPPING_PRESETS.length).toBeGreaterThanOrEqual(7);
    expect(PRESSED_PRESETS).toHaveLength(4);
    expect(DOODLE_PRESETS).toHaveLength(4);
    expect(DESK_MOODS).toHaveLength(3);
    expect(CHARM_PRESETS.length).toBeGreaterThanOrEqual(7);
    expect(CHARM_MOUNTS).toHaveLength(3);
    expect(BOOK_CLIPS.length).toBeGreaterThanOrEqual(5);
    expect(COVER_STYLES).toHaveLength(4);
    expect(STICKY_NOTE_PRESETS).toHaveLength(4);
    expect(WAX_SEAL_PRESETS).toHaveLength(4);

    // Charm anchor & spring-pendulum physics check
    expect(resolveCharmAnchor('spine-bottom')).toEqual({ x: 0, y: 245, z: 2 });
    expect(resolveCharmAnchor('ribbon-tip')).toEqual({ x: 66, y: 274, z: -2 });
    const swing = stepCharmPendulum({ angle: 0, vel: 24, tilt: 4 }, 0.016, 0);
    expect(swing.angle).toBeGreaterThan(0);
    expect(swing.settled).toBe(false);
    const rested = stepCharmPendulum({ angle: 0.01, vel: 0.01, tilt: 0 }, 0.016, 0);
    expect(rested.settled).toBe(true);
  });

  it('rotates, zooms, and fits 3D book solids safely inside stage bounds', () => {
    const wrapped = rotateBookPose({ ...angled3DPose(), yaw: 175, pitch: 68 }, 25, -40);
    expect(wrapped.yaw).toBeGreaterThanOrEqual(-180);
    expect(wrapped.yaw).toBeLessThan(180);
    expect(wrapped.pitch).toBeLessThanOrEqual(72);

    const zoomedIn = zoomBookPose(angled3DPose(), 10);
    const zoomedExtreme = zoomBookPose(zoomedIn, 5);
    const zoomedOut = zoomBookPose(angled3DPose(), 0.01);
    const zoomedBad = zoomBookPose(angled3DPose(), Number.NaN);
    expect(zoomedIn.zoom).toBe(10);
    expect(zoomedExtreme.zoom).toBe(50);
    expect(zoomedOut.zoom).toBe(0.52);
    expect(zoomedBad.zoom).toBe(1);

    const desktopOpenScale = fitBookScale(angled3DPose(), 960, 620);
    const desktopZoomed8xScale = fitBookScale({ ...angled3DPose(), zoom: 8 }, 960, 620);
    const mobileClosedScale = fitBookScale(closedFrontPose(), 360, 440);
    expect(desktopOpenScale).toBeGreaterThan(0.5);
    expect(desktopZoomed8xScale).toBeCloseTo(desktopOpenScale * 8, 5);
    expect(mobileClosedScale).toBeGreaterThan(0.4);
    expect(isBackFacing(backCoverPose().yaw)).toBe(true);
    expect(isBackFacing(closedFrontPose().yaw)).toBe(false);
    expect(isFlatEnough(flatEditPose())).toBe(true);
    expect(isFlatEnough(angled3DPose())).toBe(false);
  });

  it('adds, clamps, reorders, and updates placed cover and inner collage items', () => {
    const blank = createBlankSpread(3);
    expect(blank.items).toEqual([]);

    const coverSticker = createItemFromPreset('sticker', 'chibi-01', 'cover', []);
    expect(coverSticker.side).toBe('cover');
    const added = createItemFromPreset('sticker', 'chibi-01', 'left', blank.items);
    const list = [added, createItemFromPreset('tape', 'tape-sage-grid', 'right', [added])];
    const clamped = updatePlacedItem(list, added.id, { side: 'cover', x: 200, y: -50, rotate: 99, scale: 5, opacity: 0.1 });
    const updated = clamped.find((i) => i.id === added.id)!;
    expect(updated.side).toBe('cover');
    expect(updated.x).toBe(94);
    expect(updated.y).toBe(6);
    expect(updated.rotate).toBe(65);
    expect(updated.scale).toBe(1.7);
    expect(updated.opacity).toBe(0.35);

    const broughtFront = moveItemLayer(clamped, added.id, 'front');
    const maxZ = Math.max(...broughtFront.map((i) => i.zIndex));
    expect(broughtFront.find((i) => i.id === added.id)!.zIndex).toBe(maxZ);
  });

  it('builds a self-contained single HTML demo with all 13 local PNG stickers and boots cleanly in DOM', () => {
    const built = buildScrapbookDemo({ write: false });
    const diskHtml = readFileSync(resolve(process.cwd(), 'outputs/scrapbook-workbench-3d-demo.html'), 'utf8');

    expect(built.stickerCount).toBe(13);
    expect(diskHtml).toBe(built.html);
    expect(built.html).not.toMatch(/https?:\/\//i);

    const stickerJsonMatch = built.html.match(/<script id="sticker-data-json" type="application\/json">([\s\S]*?)<\/script>/);
    expect(stickerJsonMatch).toBeTruthy();
    const stickerMap = JSON.parse(stickerJsonMatch![1]!) as Record<string, string>;
    expect(Object.keys(stickerMap)).toHaveLength(13);
    for (const url of Object.values(stickerMap)) {
      expect(url.startsWith('data:image/png;base64,')).toBe(true);
    }

    // Strip embedded PNG base64 strings before scanning template/script copy for engineering jargon & personal info
    const htmlWithoutBase64 = built.html.replace(/<script id="sticker-data-json"[\s\S]*?<\/script>/, '');
    for (const forbidden of [...FORBIDDEN_ENGINEERING_WORDS, ...FORBIDDEN_PERSONAL_WORDS]) {
      expect(htmlWithoutBase64).not.toContain(forbidden);
    }

    // Boot the standalone HTML inside jsdom and exercise interactive flows
    (window as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      disconnect() {}
    };
    const parsed = new DOMParser().parseFromString(built.html, 'text/html');
    document.head.innerHTML = parsed.head.innerHTML;
    document.body.innerHTML = parsed.body.innerHTML;
    const scripts = Array.from(parsed.querySelectorAll('script:not([type="application/json"])'));
    expect(scripts).toHaveLength(1);
    const runner = new Function(scripts[0]!.textContent ?? '');
    runner();

    expect(document.querySelectorAll('#owner-tabs button')).toHaveLength(4);
    expect(document.querySelectorAll('#band-sticker-grid button')).toHaveLength(5);
    expect(document.querySelectorAll('#chibi-sticker-grid button')).toHaveLength(8);
    expect(document.querySelectorAll('#cover-items .scrap-item').length).toBeGreaterThanOrEqual(4);
    expect(document.querySelectorAll('.scrap-item').length).toBeGreaterThanOrEqual(8);

    // Ensure rendered player UI text contains zero engineering jargon or personal attribution
    const bodyClone = document.body.cloneNode(true) as HTMLElement;
    bodyClone.querySelectorAll('script, style').forEach((el) => el.remove());
    const visibleCopy = bodyClone.textContent ?? '';
    for (const forbidden of [...FORBIDDEN_ENGINEERING_WORDS, ...FORBIDDEN_PERSONAL_WORDS]) {
      expect(visibleCopy).not.toContain(forbidden);
    }

    // Initially closed on the rich cover: cover & back cover are never numbered as inner pages
    expect(document.getElementById('spread-indicator')!.textContent).toBe('封面（内含 2 跨页）');
    expect(document.getElementById('book-clasp')!.tagName).toBe('BUTTON');
    expect(document.getElementById('btn-cover-unlock')).not.toBeNull();

    const beforeCoverItems = document.querySelectorAll('#cover-items .scrap-item').length;
    (document.querySelector('#chibi-sticker-grid button') as HTMLButtonElement).click();
    (document.querySelector('#wax-grid button') as HTMLButtonElement).click();
    expect(document.querySelectorAll('#cover-items .scrap-item').length).toBe(beforeCoverItems + 2);

    // Clicking the clasp unlocks & opens straight into inner spread 1
    (document.getElementById('book-clasp') as HTMLButtonElement).click();
    expect(document.getElementById('btn-toggle-open')!.textContent).toBe('合上封面');
    expect(document.getElementById('spread-indicator')!.textContent).toBe('内页 第 1 / 2 页');

    // Clicking next spread turns from inner spread 1 -> 2
    (document.getElementById('btn-next-spread') as HTMLButtonElement).click();
    expect(document.getElementById('spread-indicator')!.textContent).toBe('内页 第 2 / 2 页');

    // Switching target to right page keeps book open and drops item into #right-items
    const beforeRightItems = document.querySelectorAll('#right-items .scrap-item').length;
    (document.getElementById('target-right') as HTMLButtonElement).click();
    (document.querySelector('#note-list button') as HTMLButtonElement).click();
    expect(document.querySelectorAll('#right-items .scrap-item').length).toBe(beforeRightItems + 1);
    expect(document.getElementById('btn-toggle-open')!.textContent).toBe('合上封面');

    // Selecting an acrylic charm, mount position, binder clip, and cover style updates 3D DOM
    expect(document.querySelectorAll('#acrylic-charm-grid button')).toHaveLength(13);
    (document.querySelector('#acrylic-charm-grid button') as HTMLButtonElement).click();
    expect(document.getElementById('charm-face-front')!.innerHTML).toContain('acrylic-shell');
    expect(document.getElementById('charm-face-back')!.innerHTML).toContain('UNREAD CITY');

    (document.querySelectorAll('#charm-mount-picker button')[2] as HTMLButtonElement).click();
    expect(document.getElementById('book-charm-mount')!.style.transform).toContain('342px');

    (document.querySelectorAll('#cover-style-picker button')[2] as HTMLButtonElement).click();
    expect(document.getElementById('cover-front')!.dataset.coverStyle).toBe('plaid');

    // Switching craft theme, viewing back cover, and using next-spread from cover opens cleanly
    (document.querySelectorAll('#owner-tabs button')[2] as HTMLButtonElement).click();
    expect(document.getElementById('hud-book-name')!.textContent).toContain('黑樱柔绒');
    (document.querySelector('[data-cam="back"]') as HTMLButtonElement).click();
    expect(document.getElementById('spread-indicator')!.textContent).toBe('封底外观');
    (document.getElementById('btn-next-spread') as HTMLButtonElement).click();
    expect(document.getElementById('btn-toggle-open')!.textContent).toBe('合上封面');
    expect(document.getElementById('spread-indicator')!.textContent).toBe('内页 第 1 / 2 页');
    (document.getElementById('btn-toggle-open') as HTMLButtonElement).click();
    expect(document.getElementById('btn-toggle-open')!.textContent).toBe('翻开手账');
  }, 15000);

  it('keeps left-page items editable after moving across pages and supports mirror/clone/mood/lucky tools', () => {
    const built = buildScrapbookDemo({ write: false });
    expect(built.html).toMatch(/\.book-hinge\s*\{[^}]*pointer-events:\s*none;/);

    (window as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      disconnect() {}
    };
    const parsed = new DOMParser().parseFromString(built.html, 'text/html');
    document.head.innerHTML = parsed.head.innerHTML;
    document.body.innerHTML = parsed.body.innerHTML;
    const scripts = Array.from(parsed.querySelectorAll('script:not([type="application/json"])'));
    const runner = new Function(scripts[0]!.textContent ?? '');
    runner();

    // Sticker catalog renders named labels
    const bandText = document.getElementById('band-sticker-grid')!.textContent ?? '';
    const chibiText = document.getElementById('chibi-sticker-grid')!.textContent ?? '';
    expect(bandText).toContain('乐奈-对指 M');
    expect(chibiText).toContain('睦-鼓脸');
    expect(chibiText).toContain('祥子-招手');
    expect(chibiText).toContain('海铃-冷漠抱胸');

    // Open book and flip from spread 1 -> spread 2 -> spread 1 cleanly
    (document.getElementById('book-clasp') as HTMLButtonElement).click();
    (document.getElementById('btn-next-spread') as HTMLButtonElement).click();
    expect(document.getElementById('spread-indicator')!.textContent).toBe('内页 第 2 / 2 页');

    // Move the first right-page item ("第二页") to the left page ("第一页") and re-select that exact moved item on #left-items
    const rightItem = document.querySelector('#right-items .scrap-item') as HTMLElement;
    const movedId = rightItem.dataset.itemId!;
    rightItem.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
    (document.getElementById('btn-move-side') as HTMLButtonElement).click();
    expect(document.getElementById('inspector-title')!.textContent).toContain('（左页）');
    const movedLeftItem = document.querySelector(`#left-items .scrap-item[data-item-id="${movedId}"]`) as HTMLElement;
    expect(movedLeftItem).not.toBeNull();
    movedLeftItem.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
    expect(document.getElementById('inspector-title')!.textContent).toContain('（左页）');

    // Flip horizontally & clone the moved pressed botanical item on left page
    (document.getElementById('btn-flip-item') as HTMLButtonElement).click();
    expect(document.querySelector('#left-items .scrap-item.is-selected.is-mirrored-item .is-mirrored-gfx')).not.toBeNull();
    // Flip a tape on the left page -> marks mirrored state without reversing tape caption
    const leftTape = document.querySelector('#left-items .scrap-item:last-child') as HTMLElement;
    leftTape.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
    (document.getElementById('btn-flip-item') as HTMLButtonElement).click();
    expect(document.querySelector('#left-items .scrap-item.is-selected.is-mirrored-item .washi-tape')).not.toBeNull();

    // Move right-page sticker ("睦-发卡惊喜") to left page, flip & clone it
    const rightSticker = document.querySelector('#right-items .scrap-item img.sticker-img')?.closest('.scrap-item') as HTMLElement;
    expect(rightSticker).not.toBeNull();
    const stickerId = rightSticker.dataset.itemId!;
    rightSticker.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
    (document.getElementById('btn-move-side') as HTMLButtonElement).click();
    const leftSticker = document.querySelector(`#left-items .scrap-item[data-item-id="${stickerId}"]`) as HTMLElement;
    expect(leftSticker).not.toBeNull();
    leftSticker.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
    expect(document.getElementById('inspector-title')!.textContent).toContain('睦-发卡惊喜（左页）');
    (document.getElementById('btn-flip-item') as HTMLButtonElement).click();
    expect(document.querySelector('#left-items .scrap-item.is-selected img.sticker-img.is-mirrored-gfx')).not.toBeNull();

    const countBeforeClone = document.querySelectorAll('#left-items .scrap-item').length;
    (document.getElementById('btn-clone-item') as HTMLButtonElement).click();
    expect(document.querySelectorAll('#left-items .scrap-item').length).toBe(countBeforeClone + 1);

    // Flip back to spread 1 -> verify spread 1 left page items remain selectable & editable
    (document.getElementById('btn-prev-spread') as HTMLButtonElement).click();
    expect(document.getElementById('spread-indicator')!.textContent).toBe('内页 第 1 / 2 页');
    const s1LeftItem = document.querySelector('#left-items .scrap-item') as HTMLElement;
    s1LeftItem.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
    expect(document.getElementById('inspector-title')!.textContent).toContain('（左页）');

    // Pressed botanical specimens, handwritten speech bubbles, desk moods, sound toggle & lucky corner work
    expect(document.querySelectorAll('#pressed-grid button')).toHaveLength(4);
    expect(document.querySelectorAll('#doodle-list button')).toHaveLength(4);
    (document.querySelector('#doodle-list button') as HTMLButtonElement).click();
    expect(document.getElementById('caption-row')!.style.display).toBe('flex');

    (document.getElementById('btn-desk-mood') as HTMLButtonElement).click();
    expect(document.getElementById('stage-card')!.dataset.deskMood).toBe('lamp');
    (document.getElementById('btn-desk-mood') as HTMLButtonElement).click();
    expect(document.getElementById('stage-card')!.dataset.deskMood).toBe('night');

    (document.getElementById('btn-sound-toggle') as HTMLButtonElement).click();
    expect(document.getElementById('btn-sound-toggle')!.textContent).toContain('开');

    const beforeLucky = document.querySelectorAll('#left-items .scrap-item, #right-items .scrap-item').length;
    (document.getElementById('btn-lucky-layout') as HTMLButtonElement).click();
    const afterLucky = document.querySelectorAll('#left-items .scrap-item, #right-items .scrap-item').length;
    expect(afterLucky).toBe(beforeLucky + 3);
  }, 15000);

  it('animates double-sided 3D page turns forward and backward cleanly', () => {
    const built = buildScrapbookDemo({ write: false });
    (window as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      disconnect() {}
    };

    const animations: Array<{ cancel: () => void; onfinish: (() => void) | null; cancelled: boolean }> = [];
    const origAnimate = HTMLElement.prototype.animate;
    HTMLElement.prototype.animate = function mockAnimate() {
      const handle = {
        cancelled: false,
        onfinish: null as (() => void) | null,
        cancel() {
          this.cancelled = true;
        },
      };
      animations.push(handle);
      return handle as unknown as Animation;
    };

    try {
      const parsed = new DOMParser().parseFromString(built.html, 'text/html');
      document.head.innerHTML = parsed.head.innerHTML;
      document.body.innerHTML = parsed.body.innerHTML;
      const scripts = Array.from(parsed.querySelectorAll('script:not([type="application/json"])'));
      const runner = new Function(scripts[0]!.textContent ?? '');
      runner();

      const flipper = document.getElementById('page-flipper')!;
      const flipFront = document.getElementById('flip-face-front')!;
      const flipBack = document.getElementById('flip-face-back')!;

      // Open inner spread 1
      (document.getElementById('book-clasp') as HTMLButtonElement).click();
      const spread1LeftTitle = (document.getElementById('left-title') as HTMLInputElement).value;
      const spread1RightTitle = (document.getElementById('right-title') as HTMLInputElement).value;

      // Turn forward from spread 1 -> 2
      (document.getElementById('btn-next-spread') as HTMLButtonElement).click();
      expect(document.getElementById('spread-indicator')!.textContent).toBe('内页 第 2 / 2 页');
      expect(flipper.classList.contains('is-flipping')).toBe(true);
      expect(flipper.dataset.flipDir).toBe('forward');
      expect(flipFront.textContent).toContain(spread1RightTitle);
      expect(flipBack.textContent).not.toContain(spread1LeftTitle);
      expect(flipBack.textContent!.trim().length).toBeGreaterThan(0);

      // Finish forward animation -> settles cleanly onto spread 2 live inputs
      animations[0]!.onfinish?.();
      expect(flipper.classList.contains('is-flipping')).toBe(false);
      const spread2LeftTitle = (document.getElementById('left-title') as HTMLInputElement).value;
      expect(spread2LeftTitle).not.toBe(spread1LeftTitle);

      // Turn backward from spread 2 -> 1
      (document.getElementById('btn-prev-spread') as HTMLButtonElement).click();
      expect(document.getElementById('spread-indicator')!.textContent).toBe('内页 第 1 / 2 页');
      expect(flipper.classList.contains('is-flipping')).toBe(true);
      expect(flipper.dataset.flipDir).toBe('backward');
      expect(flipBack.textContent).toContain(spread2LeftTitle);
      expect(flipFront.textContent).toContain(spread1RightTitle);

      // Closing the book mid-flip cancels active animation cleanly without leaving overlay stuck
      (document.getElementById('btn-toggle-open') as HTMLButtonElement).click();
      expect(flipper.classList.contains('is-flipping')).toBe(false);
      expect(animations.some((a) => a.cancelled)).toBe(true);
    } finally {
      HTMLElement.prototype.animate = origAnimate;
    }
  }, 15000);

  it('omits color case captions and owner/brand labels from 3D spatial phones', () => {
    for (const owner of ['soyo', 'sakiko', 'emma', 'renako'] as const) {
      const spec = phoneModels[owner] as Record<string, unknown>;
      expect(spec.caseName).toBeUndefined();
      expect(spec.name).toBeUndefined();

      const solid = createPhoneSolid(document, owner);
      expect(solid.dataset.phoneOwner).toBeUndefined();
      expect(solid.dataset.phoneModel).toBeUndefined();
      expect(solid.querySelector('.uc-phone-brand')).toBeNull();
      expect(solid.querySelector('.uc-phone-case-name')).toBeNull();
      expect(solid.querySelector('.uc-phone-back')).not.toBeNull();
      expect(solid.querySelector('.uc-phone-camera')).not.toBeNull();
    }
  });

  it('connects world snapshots, receipts, chat snippets, and NotebookPage backups without seam', () => {
    expect(WORLD_SNAPSHOT_PRESETS).toHaveLength(4);
    expect(formatWorldCalendarDay(5).display).toBe('2025年9月1日 周一');

    // Adapt a realistic host world state object cleanly
    const adapted = adaptWorldStateToSnapshot({
      clock: { day: 3, hour: 21, minute: 35 },
      weather: { id: 'rain', day: 3 },
      locationId: 'margo-cafe',
      player: { energy: 70, morale: 82, stress: 18, health: 95, balance: 8800 },
      contacts: [{ id: 'c1', name: '爱音' }],
      phone: [{ id: 'pm1', npcId: 'c1', text: '下雨了记得带伞来咖啡馆找我！', read: false, at: '第 3 天 21:10' }],
      journal: [{ id: 'j1', text: '在玛格咖啡馆避雨写笔记。', at: '第 3 天 21:25' }],
      protagonists: {
        accounts: {
          active: 'soyo',
          ledger: [{ id: 'tx1', actor: 'soyo', card: 'gpt', deltaCents: -48000, note: '热摩卡一杯' }],
        },
      },
    });
    expect(adapted.locationName).toBe('玛格咖啡馆');
    expect(adapted.transactions[0]?.amountYen).toBe(480);
    expect(adapted.messages[0]?.sender).toBe('爱音');
    expect(derivePageHeaderFromSnapshot(adapted).suggestedDeskMood).toBe('night');

    const extracted = extractWorldMemories(adapted);
    expect(extracted.receipts).toHaveLength(1);
    expect(extracted.messages).toHaveLength(1);
    expect(extracted.stamps).toHaveLength(2);
    expect(extracted.notes).toHaveLength(1);

    // Export both rich scrapbook backup & NotebookPage[] interop format
    const spreads = buildDefaultSpreadsByTheme();
    const pagesCompat = exportNotebookPagesCompat(spreads, 'sage', adapted);
    expect(pagesCompat.length).toBeGreaterThanOrEqual(4);
    expect(pagesCompat[0]?.id).toContain('scrap:sage:');

    const bundle = exportScrapbookBackup({
      themeId: 'indigo',
      snapshot: WORLD_SNAPSHOT_PRESETS[1],
      spreadsByTheme: spreads,
      deskMood: 'lamp',
    });
    const reimported = importScrapbookBackup(JSON.stringify(bundle), 'sage');
    expect(reimported.kind).toBe('scrapbook');
    expect(reimported.themeId).toBe('indigo');
    expect(reimported.deskMood).toBe('lamp');

    // Import a plain NotebookPanel { version: 1, pages } export directly into open spreads
    const fromNotebook = importScrapbookBackup({
      version: 1,
      pages: [
        { id: 'n1', personId: 'soyo', title: '傍晚的散步记录', text: '沿南门逛到书店。', kind: 'character', at: 1440 + 900, turn: 1, sourceId: '' },
        { id: 'n2', personId: 'soyo', title: '排练室小休', text: '喝了热拿铁。', kind: 'character', at: 1440 + 1100, turn: 2, sourceId: '' },
      ],
    }, 'sage');
    expect(fromNotebook.kind).toBe('notebook-pages');
    expect((fromNotebook.spreads as Array<{ left: { date: string; title: string } }>)[0]?.left.date).toBe('2025年8月29日');

    // Mount standalone HTML in DOM and test Tab 5 ("世界取材") & host JS API
    const built = buildScrapbookDemo({ write: false });
    (window as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      disconnect() {}
    };
    const parsed = new DOMParser().parseFromString(built.html, 'text/html');
    document.head.innerHTML = parsed.head.innerHTML;
    document.body.innerHTML = parsed.body.innerHTML;
    const scripts = Array.from(parsed.querySelectorAll('script:not([type="application/json"])'));
    const runner = new Function(scripts[0]!.textContent ?? '');
    runner();

    const api = (window as unknown as {
      __unreadCityScrapbook: {
        getState: () => { themeId: string; spreadCount: number };
        loadWorldState: (s: unknown) => { locationName: string };
        exportBackup: () => Record<string, unknown>;
        importBackup: (raw: unknown) => { kind: string; importedCount: number };
      };
    }).__unreadCityScrapbook;
    expect(api).toBeDefined();

    // Switch to World Material tab ("世界取材") and select 3rd moment
    (document.querySelector('[data-dock="world"]') as HTMLButtonElement).click();
    expect(document.getElementById('pane-world')!.style.display).toBe('block');
    (document.querySelectorAll('#world-snapshot-tabs button')[2] as HTMLButtonElement).click();
    expect(document.getElementById('world-location-label')!.textContent).toContain('口袋公园');

    // Sync header -> opens book cleanly & writes snapshot calendar date/weather/mood
    (document.getElementById('btn-sync-page-header') as HTMLButtonElement).click();
    expect((document.getElementById('left-date') as HTMLInputElement).value).toBe('2025年8月31日');
    expect(document.getElementById('left-weather')!.textContent).toContain('小雨');

    // Paste thermal receipt, chat snippet, and dynamic stamp onto the active page
    (document.querySelector('#world-receipt-list button') as HTMLButtonElement).click();
    expect(document.querySelector('#left-items .paper-receipt')).not.toBeNull();
    expect(document.querySelector('#world-receipt-list .world-memory-badge')!.textContent).toContain('已入册');

    (document.querySelector('#world-message-list button') as HTMLButtonElement).click();
    expect(document.querySelector('#left-items .chat-snippet-card')).not.toBeNull();

    // Inspector caption edit updates live chat snippet text
    (document.getElementById('input-caption') as HTMLInputElement).value = '记在本子里的暖心提醒';
    document.getElementById('input-caption')!.dispatchEvent(new Event('input'));
    expect(document.querySelector('#left-items .chat-snippet-card')!.textContent).toContain('记在本子里的暖心提醒');

    // Create a new day-stamped world spread & sync lamp mood
    const beforeSpreads = api.getState().spreadCount;
    (document.getElementById('btn-new-world-spread') as HTMLButtonElement).click();
    expect(api.getState().spreadCount).toBe(beforeSpreads + 1);
    (document.getElementById('btn-sync-desk-mood') as HTMLButtonElement).click();
    expect(document.getElementById('stage-card')!.dataset.deskMood).toBe('night');

    // Host live loadWorldState + importBackup round-trip
    const loaded = api.loadWorldState({
      clock: { day: 5, hour: 9, minute: 10 },
      weather: { id: 'sunny', day: 5 },
      locationId: 'library',
      player: { energy: 90, morale: 85, stress: 10, health: 100, balance: 5000 },
    });
    expect(loaded.locationName).toBe('图书馆');
    expect(document.getElementById('world-date-label')!.textContent).toContain('2025年9月1日');

    const exported = api.exportBackup();
    const restored = api.importBackup(exported);
    expect(restored.kind).toBe('scrapbook');
  }, 15000);
});
