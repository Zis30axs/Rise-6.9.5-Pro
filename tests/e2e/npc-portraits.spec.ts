import { createSelectedInitialState } from './academics-fixture';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { reduceState } from '../../src/runtime/model';
import { getScenePeople } from '../../src/runtime/scene-context';
import { characterForPerson } from '../../src/frontend/character-appearance';
import type { WorldState } from '../../src/frontend/types';

test.use({ screenshot: 'only-on-failure' });

const bundle = readFileSync(new URL('../../dist/immersive-shell.js', import.meta.url), 'utf8');
const root = (page: Page) => page.locator('[data-unread-city-root]');
const soyo = (page: Page) => page.locator('[data-live2d-status]');
const npc = (page: Page) => page.locator('[data-npc-portrait]');
const saved = async (page: Page): Promise<WorldState> => JSON.parse((await page.locator('body').getAttribute('data-npc-state'))!);

const emotions = [
  { input: '平静', key: 'neutral' }, { input: '开心', key: 'happy' }, { input: '难过', key: 'sad' },
  { input: '生气', key: 'angry' }, { input: '惊讶', key: 'surprised' }, { input: '害羞', key: 'shy' },
  { input: '思考', key: 'thinking' }, { input: '严肃', key: 'serious' }, { input: '安心', key: 'relieved' },
] as const;
type EmotionKey = typeof emotions[number]['key'];
type NpcId = 'claude' | 'xiaoyang' | 'deepseek';
interface DialogueRow { speaker: string; emotion: string; text: string; model: NpcId | null; expectedEmotion?: EmotionKey; fallback?: boolean }
interface FrameEvidence {
  viewBox: string;
  sha256: string;
  screenshot: string;
  fullBody: Awaited<ReturnType<typeof verifyFullBody>>;
}

function fixture(allEmotions: boolean) {
  const seed = 'npc-portrait-browser';
  let state = reduceState(createSelectedInitialState(), { type: 'walk', x: 0, z: 29, yaw: 0, seed });
  const stranger = getScenePeople(state.scene!).find(person => characterForPerson(person.id) === 'deepseek')!;
  // Make this an actual nearby encounter, so its real name is present in the generation context.
  state = reduceState(state, { type: 'walk', x: stranger.x, z: stranger.z, yaw: 0, seed });
  state = reduceState(state, { type: 'encounter', personId: stranger.id });
  state.airTraffic.nextAmbientAt = Date.now() + 3600000;
  const lin = state.contacts.find(contact => contact.id === 'lin')!;
  const zhou = state.contacts.find(contact => contact.id === 'zhou')!;
  const selectedEmotions = allEmotions ? emotions : emotions.filter(emotion => ['neutral', 'happy', 'angry', 'thinking'].includes(emotion.key));
  const cast: { speaker: string; model: NpcId }[] = [
    { speaker: lin.name, model: 'claude' }, { speaker: zhou.name, model: 'xiaoyang' }, { speaker: stranger.name, model: 'deepseek' },
  ];
  const npcRows: DialogueRow[] = cast.flatMap(person => [
    ...selectedEmotions.map(emotion => ({ ...person, emotion: emotion.input, expectedEmotion: emotion.key,
      text: `${person.speaker}用${emotion.input}的语气回应了眼前的话题。` })),
    { ...person, emotion: '未定义的情绪', expectedEmotion: 'neutral' as const, fallback: true, text: `${person.speaker}恢复了平常的神情。` },
  ]);
  const rows: DialogueRow[] = [
    { speaker: '素世', emotion: '开心', text: '大家都来了。', model: null },
    ...npcRows,
    { speaker: '未收录的来访者', emotion: '平静', text: '我只是路过。', model: null },
    { speaker: '素世', emotion: '安心', text: '那我们继续吧。', model: null },
  ];
  return { state, rows, cast, npcRows, selectedEmotions, reply: rows.map(row => `|${row.speaker}|${row.emotion}|${row.text}|`).join('\n') };
}

async function host(page: Page, initial: WorldState, reply: string) {
  await page.goto('/');
  if (await root(page).count()) await page.locator('[data-unread-city-rescue]').click();
  await page.evaluate(() => {
    const win = window as unknown as Record<string, unknown>;
    win.SillyTavern = { getContext: () => ({ characterId: 0, groupId: null, chatId: 'npc-portrait-test', mainApi: 'openai', characters: [{ avatar: 'npc-portrait-test.png' }] }) };
    localStorage.setItem('unread-city.presentation-mode.v1', 'novel');
    const frame = document.createElement('iframe');
    frame.id = 'npc-helper'; frame.hidden = true; frame.srcdoc = '<!doctype html><html><body></body></html>';
    document.body.append(frame);
    // Phone behavior is unchanged and has its own real embedded UI regression suite.
    win.STiPhoniePanelHost = { mount() { return { release() {}, sync() {}, focus() {} }; } };
  });
  const frame = await (await page.locator('#npc-helper').elementHandle())!.contentFrame();
  await frame!.waitForLoadState();
  await frame!.evaluate(({ initial, reply }) => {
    const win = window as unknown as Record<string, unknown>;
    const body = window.parent.document.body;
    let variables: Record<string, unknown> = { keep_me: 42, unread_city: initial };
    body.dataset.npcState = JSON.stringify(initial);
    win.tavern_events = { CHAT_CHANGED: 'chat_id_changed' }; win.eventOn = () => {}; win.eventRemoveListener = () => {};
    win.getButtonEvent = (name: string) => `button:${name}`;
    win.getVariables = () => variables;
    win.replaceVariables = (next: Record<string, unknown>) => {
      variables = next; body.dataset.npcState = JSON.stringify(next.unread_city);
    };
    win.generate = async (config: { user_input: string }) => {
      body.dataset.npcGenerations = String(Number(body.dataset.npcGenerations || 0) + 1);
      body.dataset.npcPrompt = config.user_input;
      return JSON.stringify({ story: reply, phone_messages: [] });
    };
    win.stopGenerationById = () => true;
  }, { initial, reply });
  await frame!.addScriptTag({ content: bundle });
  await expect(root(page)).toBeVisible();
}

async function unobstructed(control: Locator) {
  await expect(control).toBeVisible();
  const result = await control.evaluate(element => {
    const box = element.getBoundingClientRect();
    const root = element.getRootNode() as Document | ShadowRoot;
    const hit = root.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return { reachable: !!hit && element.contains(hit), label: element.getAttribute('aria-label') || element.textContent,
      hit: hit?.tagName, hitClass: hit?.getAttribute('class') };
  });
  expect(result.reachable, JSON.stringify(result)).toBe(true);
}

async function verifyFullBody(svg: Locator, image: Locator) {
  const geometry = await svg.evaluate(element => {
    const svg = element as SVGSVGElement;
    const matrix = svg.getScreenCTM();
    if (!matrix) throw new Error('Portrait SVG has no screen transform');
    const frame = svg.viewBox.baseVal;
    const corners = [
      new DOMPoint(frame.x, frame.y), new DOMPoint(frame.x + frame.width, frame.y),
      new DOMPoint(frame.x, frame.y + frame.height), new DOMPoint(frame.x + frame.width, frame.y + frame.height),
    ].map(point => point.matrixTransform(matrix));
    const rect = (value: DOMRect) => ({ left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height });
    const reading = (svg.getRootNode() as ShadowRoot).querySelector('[data-reading-layer]')!;
    return {
      frame: [frame.x, frame.y, frame.width, frame.height],
      renderRect: { left: Math.min(...corners.map(point => point.x)), top: Math.min(...corners.map(point => point.y)),
        right: Math.max(...corners.map(point => point.x)), bottom: Math.max(...corners.map(point => point.y)) },
      svg: rect(svg.getBoundingClientRect()), wrapper: rect(svg.parentElement!.getBoundingClientRect()),
      reading: rect(reading.getBoundingClientRect()), viewport: { width: innerWidth, height: innerHeight },
    };
  });
  const { svg: svgBounds, wrapper, renderRect, reading, viewport } = geometry;
  // A full viewBox must fit the visible wrapper; the old 175% bust zoom fails this check.
  expect(svgBounds.width).toBeLessThanOrEqual(wrapper.width + .5);
  expect(svgBounds.height).toBeLessThanOrEqual(wrapper.height + .5);
  expect(svgBounds.left).toBeGreaterThanOrEqual(wrapper.left - .5);
  expect(svgBounds.top).toBeGreaterThanOrEqual(wrapper.top - .5);
  expect(svgBounds.right).toBeLessThanOrEqual(wrapper.right + .5);
  expect(svgBounds.bottom).toBeLessThanOrEqual(wrapper.bottom + .5);
  expect(renderRect.left).toBeGreaterThanOrEqual(Math.max(0, wrapper.left) - .5);
  expect(renderRect.top).toBeGreaterThanOrEqual(Math.max(0, wrapper.top) - .5);
  expect(renderRect.right).toBeLessThanOrEqual(Math.min(viewport.width, wrapper.right) + .5);
  expect(renderRect.bottom).toBeLessThanOrEqual(Math.min(viewport.height, wrapper.bottom) + .5);
  const overlapsReading = renderRect.left < reading.right - .5 && renderRect.right > reading.left + .5
    && renderRect.top < reading.bottom - .5 && renderRect.bottom > reading.top + .5;
  expect(overlapsReading, `Portrait frame overlaps dialogue: ${JSON.stringify(geometry)}`).toBe(false);

  const sourceEdges = await image.evaluate(async (element, frame) => {
    type PixelCache = { source: string; width: number; height: number; pixels: Uint8ClampedArray };
    const node = element as SVGImageElement & { __fullBodyPixelProbe?: PixelCache };
    const source = node.href.baseVal;
    let cache = node.__fullBodyPixelProbe;
    if (!cache || cache.source !== source) {
      const probe = new Image(); probe.src = source; await probe.decode();
      // Test-only source inspection. This never adds a canvas to the UI or modifies the PNG.
      const surface = new OffscreenCanvas(probe.naturalWidth, probe.naturalHeight);
      const context = surface.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('Source alpha inspection unavailable');
      context.drawImage(probe, 0, 0);
      cache = { source, width: probe.naturalWidth, height: probe.naturalHeight,
        pixels: context.getImageData(0, 0, probe.naturalWidth, probe.naturalHeight).data };
      node.__fullBodyPixelProbe = cache;
    }
    const [left, top, width, height] = frame.map(Math.round);
    if (left < 0 || top < 0 || left + width > cache.width || top + height > cache.height) throw new Error('Frame exceeds source atlas');
    let minX = width, minY = height, maxX = -1, maxY = -1, opaquePixels = 0;
    const alphaThreshold = 32; // Ignore low-alpha generation preview debris, not visible character edges.
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      if (cache.pixels[((top + y) * cache.width + left + x) * 4 + 3] < alphaThreshold) continue;
      opaquePixels++; minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
    return { alphaThreshold, opaquePixels, margins: { top: minY, bottom: height - 1 - maxY, left: minX, right: width - 1 - maxX } };
  }, geometry.frame);
  expect(sourceEdges.opaquePixels).toBeGreaterThan(100);
  // Transparent padding proves the source crop does not cut directly through head or shoes.
  // Semantic completeness (real feet/shoes, full hair silhouette) is still inspected in the screenshots.
  expect(sourceEdges.margins.top, `No head padding: ${JSON.stringify(sourceEdges)}`).toBeGreaterThanOrEqual(1);
  expect(sourceEdges.margins.bottom, `No shoe padding: ${JSON.stringify(sourceEdges)}`).toBeGreaterThanOrEqual(1);
  return { geometry, sourceEdges };
}

for (const viewport of [
  { label: 'desktop', width: 1280, height: 900 },
  { label: '390', width: 390, height: 844 },
  { label: '320', width: 320, height: 568 },
  { label: '720', width: 720, height: 568 },
]) {
  test(`${viewport.label} NPC全身表情完整显示，素世往返保留Live2D与阅读游标`, async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    const { state, rows, cast, npcRows, selectedEmotions, reply } = fixture(viewport.label === 'desktop');
    await host(page, state, reply);
    await expect(soyo(page)).toHaveAttribute('data-live2d-status', 'ready', { timeout: 30000 });
    const originalCanvas = (await soyo(page).locator('canvas').elementHandle())!;
    await page.getByRole('textbox', { name: '接下来，你想做什么？' }).fill('听听大家怎么说。');
    await page.getByRole('button', { name: '继续故事', exact: true }).click();
    await expect(page.locator('.novel-speech')).toHaveText(rows[0].text);
    await expect(soyo(page)).toHaveCSS('opacity', '1');
    const startingCursor = Number(await page.locator('[data-novel-dialogue]').getAttribute('data-segment'));
    const afterGeneration = await saved(page);
    const prompt = (await page.locator('body').getAttribute('data-npc-prompt'))!;
    for (const person of cast) expect(prompt).toContain(person.speaker);
    const sources = new Map<NpcId, string>();
    const frames = new Map<NpcId, Map<EmotionKey, FrameEvidence>>();

    for (const row of npcRows) {
      await page.getByRole('button', { name: '下一句剧情', exact: true }).click();
      await expect(page.locator('.novel-speaker')).toHaveText(row.speaker);
      await expect(page.locator('.novel-speech')).toHaveText(row.text);
      await expect(npc(page)).toHaveCount(1);
      await expect(npc(page)).toHaveAttribute('data-npc-portrait', row.model!);
      await expect(npc(page)).toHaveAttribute('data-npc-speaker', row.speaker);
      await expect(npc(page)).toHaveAttribute('data-npc-emotion', row.expectedEmotion!);
      const svg = npc(page).locator('svg');
      const image = svg.locator('image');
      await expect(svg).toBeVisible();
      await expect(image).toHaveCount(1);
      const source = await image.evaluate(element => (element as SVGImageElement).href.baseVal);
      expect(source).toMatch(/^data:image\/webp;base64,/);
      const model = row.model!;
      if (sources.has(model)) expect(source).toBe(sources.get(model));
      else {
        const decoded = await image.evaluate(async element => {
          const probe = new Image(); probe.src = (element as SVGImageElement).href.baseVal;
          await probe.decode(); return { width: probe.naturalWidth, height: probe.naturalHeight };
        });
        expect(decoded.width).toBeGreaterThan(300); expect(decoded.height).toBeGreaterThan(300);
        sources.set(model, source);
      }
      const viewBox = (await svg.getAttribute('viewBox'))!;
      const coordinates = viewBox.trim().split(/[ ,]+/).map(Number);
      expect(coordinates).toHaveLength(4);
      expect(coordinates.every(Number.isFinite)).toBe(true);
      expect(coordinates[2]).toBeGreaterThan(0); expect(coordinates[3]).toBeGreaterThan(0);
      const fullBody = await verifyFullBody(svg, image);
      await expect(soyo(page)).toHaveClass(/is-muted/);
      await expect(soyo(page)).toHaveCSS('opacity', '0');
      await expect(root(page).locator('canvas')).toHaveCount(1);
      expect(await soyo(page).locator('canvas').evaluate((canvas, original) => canvas === original, originalCanvas)).toBe(true);
      const screenshot = `outputs/npc-fullbody-crop-${viewport.label}-${model}-${row.fallback ? 'fallback' : row.expectedEmotion}.png`;
      // Hide surrounding labels while sampling pixels: changing dialogue must not create a false difference.
      const pixels = await svg.screenshot({ path: screenshot, animations: 'disabled',
        style: '* { visibility: hidden !important; } [data-npc-portrait], [data-npc-portrait] * { visibility: visible !important; }' });
      const sha256 = createHash('sha256').update(pixels).digest('hex');
      const modelFrames = frames.get(model) ?? new Map<EmotionKey, FrameEvidence>();
      if (row.fallback) {
        expect(viewBox).toBe(modelFrames.get('neutral')!.viewBox);
        expect(sha256).toBe(modelFrames.get('neutral')!.sha256);
      } else {
        modelFrames.set(row.expectedEmotion!, { viewBox, sha256, screenshot, fullBody });
        frames.set(model, modelFrames);
      }
      if (!row.fallback && ['neutral', 'happy', 'angry', 'thinking'].includes(row.expectedEmotion!)) {
        for (const control of [
          page.getByRole('button', { name: '纯小说', exact: true }),
          page.getByRole('button', { name: '打开地图切换地点', exact: true }),
          page.getByRole('button', { name: '下一句剧情', exact: true }),
          page.getByRole('textbox', { name: '接下来，你想做什么？' }),
          page.locator('[data-unread-city-rescue]'),
        ]) await unobstructed(control);
        await page.screenshot({ path: `outputs/npc-fullbody-${viewport.label}-${model}-${row.expectedEmotion}.png` });
        if (model === 'deepseek' && row.expectedEmotion === 'thinking') await page.screenshot({ path: `outputs/npc-fullbody-${viewport.label}.png` });
      }
    }
    expect(new Set(sources.values()).size).toBe(3);
    for (const modelFrames of frames.values()) {
      expect(modelFrames.size).toBe(selectedEmotions.length);
      expect(new Set([...modelFrames.values()].map(frame => frame.viewBox)).size).toBe(selectedEmotions.length);
      expect(new Set([...modelFrames.values()].map(frame => frame.sha256)).size).toBe(selectedEmotions.length);
    }
    writeFileSync(`outputs/npc-fullbody-pixels-${viewport.label}.json`, JSON.stringify({ viewport,
      sourceCount: sources.size, emotionsPerNpc: selectedEmotions.length, unknownEmotionFallbackPassed: true,
      frames: Object.fromEntries([...frames].map(([model, frames]) => [model, Object.fromEntries(frames)])) }, null, 2));

    await page.getByRole('button', { name: '下一句剧情', exact: true }).click();
    await expect(page.locator('.novel-speaker')).toHaveText(rows.at(-2)!.speaker);
    await expect(npc(page)).toHaveCount(0);
    await expect(soyo(page)).toHaveCSS('opacity', '0');
    await page.getByRole('button', { name: '下一句剧情', exact: true }).click();
    await expect(page.locator('.novel-speech')).toHaveText(rows.at(-1)!.text);
    await expect(npc(page)).toHaveCount(0);
    await expect(soyo(page)).toHaveAttribute('data-live2d-status', 'ready');
    await expect(soyo(page)).toHaveAttribute('data-live2d-emotion', '安心');
    await expect(soyo(page)).toHaveCSS('opacity', '1');
    expect(await soyo(page).locator('canvas').evaluate((canvas, original) => canvas === original, originalCanvas)).toBe(true);
    await page.waitForTimeout(700);
    await page.screenshot({ path: `outputs/npc-fullbody-${viewport.label}-soyo.png` });

    // Rewind across an unknown voice and an NPC, then resume the exact same sentence.
    await page.getByRole('button', { name: '上一句剧情', exact: true }).click();
    await expect(npc(page)).toHaveCount(0);
    await page.getByRole('button', { name: '上一句剧情', exact: true }).click();
    await expect(npc(page)).toHaveAttribute('data-npc-portrait', 'deepseek');
    await expect(npc(page)).toHaveAttribute('data-npc-emotion', 'neutral');
    await expect(page.locator('.novel-speech')).toHaveText(npcRows.at(-1)!.text);
    await expect(page.locator('[data-novel-dialogue]')).toHaveAttribute('data-segment', String(startingCursor + rows.length - 3));
    await page.getByRole('button', { name: '下一句剧情', exact: true }).click();
    await page.getByRole('button', { name: '下一句剧情', exact: true }).click();
    await expect(page.locator('.novel-speech')).toHaveText(rows.at(-1)!.text);
    await expect(page.locator('[data-novel-dialogue]')).toHaveAttribute('data-segment', String(startingCursor + rows.length - 1));
    await expect(page.getByRole('button', { name: '下一句剧情', exact: true })).toBeDisabled();
    await expect(page.locator('body')).toHaveAttribute('data-npc-generations', '1');
    expect((await saved(page)).story.at(-1)?.text).toBe(reply);
    expect(await saved(page)).toEqual(afterGeneration);
    expect(errors).toEqual([]);
  });
}
