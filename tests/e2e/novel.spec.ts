import { createSelectedInitialState } from './academics-fixture';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { getNovelTravelQuote, reduceState } from '../../src/runtime/model';
import type { WorldState } from '../../src/frontend/types';

const bundle = readFileSync(new URL('../../dist/immersive-shell.js', import.meta.url), 'utf8');
const storageKey = 'unread-city-novel-e2e';
const root = (page: Page) => page.locator('[data-unread-city-root]');
const shell = (page: Page) => page.locator('.uc-shell');
const portrait = (page: Page) => page.locator('[data-live2d-status]');
const reply = '风轻轻吹过。\n|charac|emot|says|\n|素世|开心|今天天气真好。|\n|素世|生气|说好的事情可不能忘了。|\n|素世|安心|那就一起走吧。|';

async function host(page: Page, initial?: WorldState, mode: 'scene' | 'novel' = 'novel') {
  // Start the production Helper bundle on a native host without booting the
  // separate Vite demo shell. Reloads retain the fixture's saved state/preferences.
  await page.route('http://127.0.0.1:5178/', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><label>原生输入<input id="native-input"></label></body></html>',
  }));
  await page.goto('/');
  await page.evaluate(({ initial, storageKey, mode }) => {
    const win = window as unknown as Record<string, unknown>;
    win.SillyTavern = { getContext: () => ({ characterId: 0, groupId: null, chatId: 'novel-test', mainApi: 'openai', characters: [{ avatar: 'novel-test.png' }] }) };
    if (initial) { localStorage.setItem(storageKey, JSON.stringify(initial)); localStorage.setItem('unread-city.presentation-mode.v1', mode); }
    const frame = document.createElement('iframe'); frame.id = 'novel-helper'; frame.hidden = true; frame.srcdoc = '<!doctype html><html><body></body></html>'; document.body.append(frame);
    // The real bundled phone is covered separately in embedded-phone.spec.ts.
    win.STiPhoniePanelHost = { mount() { return { release() {}, sync() {}, focus() {} }; } };
  }, { initial, storageKey, mode });
  const frame = await (await page.locator('#novel-helper').elementHandle())!.contentFrame();
  await frame!.waitForLoadState();
  await frame!.evaluate(({ storageKey, reply }) => {
    const win = window as unknown as Record<string, unknown>;
    const body = window.parent.document.body;
    let variables: Record<string, unknown> = { keep_me: 42, unread_city: JSON.parse(localStorage.getItem(storageKey)!) };
    body.dataset.novelState = JSON.stringify(variables.unread_city);
    win.tavern_events = { CHAT_CHANGED: 'chat_id_changed' }; win.eventOn = () => {}; win.eventRemoveListener = () => {};
    win.getButtonEvent = (name: string) => `button:${name}`;
    win.getVariables = () => variables;
    win.replaceVariables = (next: Record<string, unknown>) => {
      if (body.dataset.failNovelSave === 'true') throw new Error('模拟保存失败');
      variables = next; body.dataset.novelState = JSON.stringify(next.unread_city);
      localStorage.setItem(storageKey, JSON.stringify(next.unread_city));
    };
    win.generate = async (config: { injects: { content: string }[] }) => {
      body.dataset.novelGenerations = String(Number(body.dataset.novelGenerations || 0) + 1);
      body.dataset.novelProtocol = config.injects[0].content;
      return JSON.stringify({ story: reply, phone_messages: [] });
    };
    win.stopGenerationById = () => true;
  }, { storageKey, reply });
  await page.locator('#native-input').focus();
  await frame!.addScriptTag({ content: bundle });
  await expect(root(page)).toBeVisible();
  await expect(page.locator('[data-unread-city-rescue]')).toHaveCount(0);
  if (initial) await expect(shell(page)).toHaveAttribute('data-presentation-mode', mode);
}
const saved = async (page: Page): Promise<WorldState> => JSON.parse((await page.locator('body').getAttribute('data-novel-state'))!);
function initialState() {
  const state = reduceState(createSelectedInitialState(), { type: 'walk', x: 0, z: 29, yaw: 0, seed: 'novel-browser' });
  state.airTraffic.nextAmbientAt = Date.now() + 3600000;
  return state;
}
async function finishInteraction(page: Page, saveFails = false) {
  const overlay = page.locator('[data-interaction-overlay]');
  await expect(overlay).toBeVisible();
  await expect.poll(() => overlay.evaluateAll(nodes => nodes[0]?.getAttribute('data-interaction-phase') ?? 'idle')).not.toBe('progress');
  // Exercise the current normal-completion path without requesting event prose.
  const decline = page.locator('[data-interaction-phase="choice"] [data-interaction-reject]');
  if (await decline.count()) await decline.click();
  if (saveFails) await expect(overlay).toHaveAttribute('data-interaction-phase', 'error');
  else await expect(overlay).toHaveCount(0);
}
async function boundsOf(control: Locator) {
  await expect(control).toBeVisible();
  const bounds = await control.boundingBox();
  expect(bounds).not.toBeNull();
  return bounds!;
}
async function expectNovelControlsClear(page: Page, viewport: { width: number; height: number }) {
  const switchChat = page.getByRole('button', { name: '切换聊天并恢复原生界面', exact: true });
  const chat = await boundsOf(switchChat), dock = await boundsOf(page.locator('.tool-dock'));
  for (const control of [switchChat, page.getByRole('textbox', { name: '接下来，你想做什么？' }), page.getByRole('button', { name: '继续故事', exact: true })]) {
    const bounds = await boundsOf(control);
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height + 1);
    // A hit test also detects overlays that geometry comparisons alone miss.
    expect(await control.evaluate(node => {
      const box = node.getBoundingClientRect(), surface = node.getRootNode() as ShadowRoot;
      return node.contains(surface.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
    })).toBe(true);
    if (control === switchChat) continue;
    for (const obstacle of [chat, dock]) {
      const overlaps = bounds.x < obstacle.x + obstacle.width && bounds.x + bounds.width > obstacle.x
        && bounds.y < obstacle.y + obstacle.height && bounds.y + bounds.height > obstacle.y;
      expect(overlaps).toBe(false);
    }
  }
  if (viewport.width <= 760) {
    const reading = await boundsOf(page.locator('[data-reading-layer]'));
    expect(reading.y + reading.height).toBeLessThanOrEqual(dock.y - 4);
  }
  expect(await shell(page).evaluate(node => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
}
async function localTravel(page: Page, name: string) {
  await page.getByRole('button', { name: '地图', exact: true }).click();
  await page.locator('.wm-destination').filter({ has: page.locator('b', { hasText: new RegExp(`^${name}$`) }) }).click();
  await finishInteraction(page);
  await expect(page.locator('[data-window=map]')).toHaveCount(0);
}

test('纯小说与3D切换保留剧情草稿，偏好和地点背景刷新恢复', async ({ page }) => {
  test.setTimeout(90000);
  const initial = initialState();
  initial.story.push({ id: 'reading-position-fixture', role: 'assistant', text: Array.from({ length: 36 }, (_, index) => `第 ${index + 1} 段。傍晚的光落在校园的步道上，图书馆的玻璃映出树影。你停在路边，继续阅读此前发生的事情。`).join('\n\n') });
  await host(page, initial, 'scene');
  await page.getByRole('textbox', { name: '接下来，你想做什么？' }).fill('尚未发送的草稿');
  await page.getByRole('button', { name: '展开正文', exact: true }).click();
  await expect(shell(page)).toHaveAttribute('data-reading-mode', 'expanded');
  const storyList = page.locator('.story-list');
  await expect.poll(async () => storyList.evaluate(element => element.scrollHeight - element.clientHeight)).toBeGreaterThan(300);
  const readingPosition = await storyList.evaluate(element => {
    element.scrollTop = Math.round((element.scrollHeight - element.clientHeight) * .45);
    element.dispatchEvent(new Event('scroll'));
    return element.scrollTop;
  });
  expect(readingPosition).toBeGreaterThan(100);
  const before = await saved(page);
  await page.getByRole('button', { name: '纯小说', exact: true }).click();
  await expect(shell(page)).toHaveAttribute('data-presentation-mode', 'novel');
  await expect(page.locator('[data-unread-city-scene], [data-unread-city-interior]')).toHaveCount(0);
  await expect(page.locator('[data-novel-background] img')).toBeVisible();
  const after = await saved(page);
  for (const key of ['clock', 'player', 'story', 'phone', 'transit', 'interior'] as const) expect(after[key]).toEqual(before[key]);
  await expect(page.getByRole('textbox', { name: '接下来，你想做什么？' })).toHaveValue('尚未发送的草稿');
  await page.getByRole('button', { name: '3D 漫游', exact: true }).click();
  await expect(page.locator('[data-unread-city-scene]')).toBeVisible();
  await expect(shell(page)).toHaveAttribute('data-reading-mode', 'expanded');
  await expect.poll(async () => storyList.evaluate(element => element.scrollTop)).toBeCloseTo(readingPosition, 0);
  await expect(page.getByRole('textbox', { name: '接下来，你想做什么？' })).toHaveValue('尚未发送的草稿');
  expect((await saved(page)).story).toEqual(before.story);
  await page.getByRole('button', { name: '纯小说', exact: true }).click();
  await localTravel(page, '普通教室');
  await expect(page.locator('[data-novel-background]')).toHaveAttribute('data-novel-background', 'classroom');
  await page.getByRole('button', { name: '地点', exact: true }).click();
  await page.locator('[data-place-actions] [data-place-activity="classroom-notes"]').click();
  await page.locator('[data-study-subject]').selectOption('cs-programming');
  await page.getByRole('button', { name: /短时学习/ }).click();
  await finishInteraction(page);
  const complete = await saved(page);
  expect(complete.interior?.lastStudy?.interactionId).toBe('classroom-notes');
  expect(complete.story).toEqual(before.story);
  await host(page);
  await expect(shell(page)).toHaveAttribute('data-presentation-mode', 'novel');
  await expect(page.locator('[data-novel-background]')).toHaveAttribute('data-novel-background', 'classroom');
  expect(await saved(page)).toEqual(complete);
  await expect(page.locator('body')).not.toHaveAttribute('data-novel-generations');
});

test('AVG按点击逐句推进并切换真实Live2D表情，协议仍保留手机JSON', async ({ page }) => {
  test.setTimeout(90000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await host(page, initialState());
  await page.getByRole('textbox', { name: '接下来，你想做什么？' }).fill('看看今天的天气。');
  await page.getByRole('button', { name: '继续故事', exact: true }).click();
  await expect(page.locator('.novel-speech')).toHaveText('风轻轻吹过。');
  await expect(page.locator('[data-novel-dialogue]')).toHaveAttribute('data-emotion', '平静');
  await expect(page.locator('[data-toggle-dialogue]')).toHaveCount(0);
  await expect(page.locator('body')).toHaveAttribute('data-novel-protocol', /\|charac\|emot\|says\|/);
  await expect(portrait(page)).toHaveAttribute('data-live2d-status', 'ready', { timeout: 30000 });
  await page.getByRole('button', { name: '下一句剧情', exact: true }).click();
  await expect(page.locator('.novel-speaker')).toHaveText('素世');
  await expect(page.locator('.novel-speech')).toHaveText('今天天气真好。');
  await expect(portrait(page)).toHaveAttribute('data-live2d-emotion', '开心');
  await page.waitForTimeout(700); // Cubism expressions cross-fade for 500 ms.
  await page.screenshot({ path: 'outputs/novel-live2d-happy.png' });
  await page.getByRole('button', { name: '点击推进剧情', exact: true }).click();
  await expect(page.locator('.novel-speech')).toHaveText('说好的事情可不能忘了。');
  await expect(portrait(page)).toHaveAttribute('data-live2d-emotion', '生气');
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'outputs/novel-live2d-angry.png' });
  await page.getByRole('button', { name: '3D 漫游', exact: true }).click();
  await page.getByRole('button', { name: '纯小说', exact: true }).click();
  await expect(page.locator('.novel-speech')).toHaveText('说好的事情可不能忘了。');
  await expect(portrait(page)).toHaveAttribute('data-live2d-emotion', '生气');
  await page.getByRole('button', { name: '下一句剧情', exact: true }).click();
  await expect(page.getByRole('button', { name: '下一句剧情', exact: true })).toBeDisabled();
  await expect(page.locator('body')).toHaveAttribute('data-novel-generations', '1');
  expect((await saved(page)).story.at(-1)?.text).toBe(reply);
  await page.getByRole('button', { name: '全文回看', exact: true }).click();
  const dialogue = page.locator('.story-list .story-entry').last().locator('[data-story-dialogue]');
  await dialogue.locator('summary').click();
  await expect(dialogue.locator('.story-speaker').first()).toHaveText('素世');
  await expect(dialogue.locator('p').first()).toHaveText(/素世\s*今天天气真好。/);
  await expect(page.locator('.story-list')).not.toContainText('|charac|');
  await page.getByRole('button', { name: '逐句阅读', exact: true }).click();
  await expect(page.locator('.novel-speech')).toHaveText('那就一起走吧。');
  expect(errors).toEqual([]);
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }, { width: 390, height: 844 }, { width: 320, height: 568 }]) {
  test('小说对白缺少竖线时仍逐句点击、同步表情、保留原始存档 ' + viewport.width + 'x' + viewport.height, async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize(viewport);
    const state = initialState();
    state.story.push({
      id: 'renako-pipe-regression', role: 'assistant',
      text: [
        '房间里传来游戏音效。',
        '甘織玲奈子|生气|“因为这个战争雷霆真的太让人火大了，不管怎么玩都是这种莫名其妙的结局。”',
        '|素世|开心|下次再试试吧。',
        '素世|安心|别急，慢慢来。|',
      ].join('\n'),
    });
    await host(page, state);
    const reader = page.locator('[data-novel-dialogue]');
    await expect(page.locator('.novel-speech')).toHaveText('房间里传来游戏音效。');
    await expect(reader).toHaveAttribute('data-emotion', '平静');
    await expect(reader).not.toContainText('战争雷霆');

    await page.getByRole('button', { name: '下一句剧情', exact: true }).click();
    await expect(reader).toHaveAttribute('data-speaker', '甘織玲奈子');
    await expect(reader).toHaveAttribute('data-emotion', '生气');
    await expect(page.locator('.novel-speech')).toHaveText('“因为这个战争雷霆真的太让人火大了，不管怎么玩都是这种莫名其妙的结局。”');
    await expect(reader).not.toContainText('|生气|');

    await page.getByRole('button', { name: '点击推进剧情', exact: true }).click();
    await expect(reader).toHaveAttribute('data-speaker', '素世');
    await expect(reader).toHaveAttribute('data-emotion', '开心');
    await expect(page.locator('.novel-speech')).toHaveText('下次再试试吧。');
    await expect(portrait(page)).toHaveAttribute('data-live2d-emotion', '开心', { timeout: 30000 });

    await page.getByRole('button', { name: '下一句剧情', exact: true }).click();
    await expect(page.locator('.novel-speech')).toHaveText('别急，慢慢来。');
    await expect(reader).toHaveAttribute('data-emotion', '安心');
    await expect(page.getByRole('button', { name: '下一句剧情', exact: true })).toBeDisabled();
    expect(await saved(page)).toEqual(state);
    await expect(page.locator('body')).not.toHaveAttribute('data-novel-generations');
  });
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }, { width: 390, height: 844 }, { width: 320, height: 568 }]) {
  const { width, height } = viewport;
  test(`${width}x${height}小说地图只保留沙盘，跨区付费、背景切换与失败回滚`, async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize(viewport);
    await host(page, initialState());
    await expectNovelControlsClear(page, viewport);
    await page.getByRole('button', { name: '地图', exact: true }).click();
    await expect(page.locator('[data-world-map-viewport]')).toHaveAttribute('data-map-layer', 'sandtable');
    await expect(page.locator('[data-world-map-viewport]')).toHaveAttribute('data-map-rise', '1.000');
    await expect(page.getByRole('button', { name: '校园', exact: true })).toHaveCount(0);
    await page.screenshot({ path: `outputs/novel-map-${width}.png` });
    await page.getByRole('button', { name: '城市', exact: true }).click();
    await page.locator('.wm-district-list').getByRole('button', { name: '商业区', exact: true }).click();
    const before = await saved(page), quote = getNovelTravelQuote(before, 'commercial');
    await page.getByRole('button', { name: '前往商业区', exact: true }).click();
    await finishInteraction(page);
    const after = await saved(page);
    expect(after.player.balance).toBe(before.player.balance - quote.fare);
    expect(after.transit.sequence).toBe(before.transit.sequence + quote.rides.length);
    await expect(page.locator('[data-novel-background]')).toHaveAttribute('data-novel-background', 'commercial');
    await expect(page.locator('[data-novel-background] img')).toBeVisible();
    await expect(portrait(page)).toHaveAttribute('data-live2d-status', 'ready', { timeout: 30000 });
    await expect(portrait(page)).toHaveCSS('opacity', '1');
    const modelStage = await portrait(page).boundingBox();
    const dialoguePanel = await page.locator('[data-reading-layer]').boundingBox();
    expect(modelStage).not.toBeNull();
    expect(dialoguePanel).not.toBeNull();
    expect(modelStage!.y + modelStage!.height).toBeLessThanOrEqual(dialoguePanel!.y + 1);
    await expectNovelControlsClear(page, viewport);
    await page.waitForTimeout(700);
    await page.screenshot({ path: `outputs/novel-mode-${width}.png` });
    await page.evaluate(() => { document.body.dataset.failNovelSave = 'true'; });
    await page.getByRole('button', { name: '地图', exact: true }).click();
    await page.locator('.wm-destination').filter({ has: page.locator('b', { hasText: /^校园南门$/ }) }).click();
    await finishInteraction(page, true);
    await expect(page.locator('.notice')).toContainText('模拟保存失败');
    expect(await saved(page)).toEqual(after);
    await expect(page.locator('[data-novel-background]')).toHaveAttribute('data-novel-background', 'commercial');
    await page.getByRole('button', { name: '取消本次交互', exact: true }).click();
    await expect(page.locator('[data-interaction-overlay]')).toHaveCount(0);
    await page.getByRole('button', { name: '地图', exact: true }).click();
    await expectNovelControlsClear(page, viewport);
    await expect(page.locator('body')).not.toHaveAttribute('data-novel-generations');
    await page.getByRole('button', { name: '切换聊天并恢复原生界面', exact: true }).click();
    await expect(root(page)).toHaveCount(0);
    await expect(page.locator('#native-input')).toBeFocused();
    expect(await saved(page)).toEqual(after);
    await host(page);
    expect(await saved(page)).toEqual(after);
    await expect(page.locator('[data-novel-background]')).toHaveAttribute('data-novel-background', 'commercial');
    await expectNovelControlsClear(page, viewport);
  });
}

