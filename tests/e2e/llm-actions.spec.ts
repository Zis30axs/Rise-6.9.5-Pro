import { expect, test, type Frame, type Locator, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createSelectedInitialState } from './academics-fixture';
import { getNovelTravelQuote, reduceState } from '../../src/runtime/model';
import type { WorldState } from '../../src/frontend/types';

// These fixtures execute the built production IIFE, with a local Helper and
// phone contract. No native SillyTavern page or paid model is contacted.
const bundle = readFileSync(new URL('../../dist/immersive-shell.js', import.meta.url));
const bundleSha256 = createHash('sha256').update(bundle).digest('hex');
const bundleUrl = 'http://127.0.0.1:5178/__llm_actions_final_bundle__.js';
const storageKey = 'unread-city-llm-actions-e2e';
const root = (page: Page) => page.locator('[data-unread-city-root]');
const composer = (page: Page) => page.getByRole('textbox', { name: '接下来，你想做什么？' });
const saved = async (page: Page): Promise<WorldState> => JSON.parse((await page.locator('body').getAttribute('data-action-state'))!);
const calls = async (page: Page): Promise<{ saves: number; generations: number; cancels: number }> => JSON.parse((await page.locator('body').getAttribute('data-action-calls'))!);
const delivered = async (page: Page): Promise<WorldState['phone']> => JSON.parse((await page.locator('body').getAttribute('data-action-phone'))!);
const minutes = (state: WorldState) => state.clock.day * 1440 + state.clock.hour * 60 + state.clock.minute;
const sleepStory = '你睡了整整十个小时，醒来时窗外已经换了天色。';
const sleepReply = { story: sleepStory, phone_messages: [{ npcId: 'lin', text: '醒了以后再联系我。' }], world_actions: [{ type: 'rest', minutes: 600, kind: 'sleep' }] };
type Reply = { story: string; phone_messages: { npcId: string; text: string }[]; world_actions: Record<string, unknown>[] };

function fresh(locationId = 'dorm-room'): WorldState {
  const state = reduceState(createSelectedInitialState(), { type: 'novel_travel', locationId });
  state.clock = { day: 2, hour: 14, minute: 20 };
  state.player = { energy: 25, balance: 200, morale: 35, health: 85, stress: 65, satiety: 70, foodEnergy: 1500 };
  state.airTraffic.nextAmbientAt = Date.now() + 3600000;
  return state;
}

async function host(page: Page, initial?: WorldState, response: Reply = sleepReply, deferred = false): Promise<Frame> {
  await page.unroute(bundleUrl);
  await page.route(bundleUrl, route => route.fulfill({ status: 200, contentType: 'application/javascript', body: bundle,
    headers: { 'content-length': String(bundle.length), 'x-fixture-bundle-sha256': bundleSha256, 'cache-control': 'no-store' } }));
  await page.route('http://127.0.0.1:5178/', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><label>原生输入<input id="native-input"></label></body></html>' }));
  await page.goto('/');
  await page.evaluate(({ initial, storageKey }) => {
    const win = window as unknown as Record<string, unknown>, body = document.body;
    if (initial !== undefined) {
      localStorage.setItem(storageKey, JSON.stringify(initial));
      localStorage.setItem(`${storageKey}-calls`, JSON.stringify({ saves: 0, generations: 0, cancels: 0 }));
      localStorage.setItem(`${storageKey}-phone`, '[]');
    }
    body.dataset.actionChat = 'action-test';
    body.dataset.actionPhone = localStorage.getItem(`${storageKey}-phone`)!;
    win.SillyTavern = { getContext: () => ({ characterId: 0, groupId: null, chatId: body.dataset.actionChat,
      mainApi: 'openai', characters: [{ avatar: 'action-test.png' }] }) };
    localStorage.setItem('unread-city.presentation-mode.v1', 'novel');
    win.STiPhoniePanelHost = { mount() { return { release() {}, sync() {}, focus() {} }; } };
    win.STiPhonieStoryHost = { async bind({ sessionId }: { sessionId: string }) {
      const snapshot = () => ({ sessionId, unreadTotal: 0, contacts: [], receipts: [] });
      return {
        async sync({ messages }: { messages: { id: string }[] }) {
          const previous = JSON.parse(localStorage.getItem(`${storageKey}-phone`)!) as { id: string }[];
          const ids = new Set(previous.map(message => message.id));
          const next = [...previous, ...messages.filter(message => !ids.has(message.id))];
          localStorage.setItem(`${storageKey}-phone`, JSON.stringify(next));
          body.dataset.actionPhone = JSON.stringify(next); body.dataset.actionPhoneReady = 'true';
          return snapshot();
        }, async snapshot() { return snapshot(); }, subscribe() { return () => {}; }, async openContact() {}, release() {},
      };
    } };
    const frame = document.createElement('iframe'); frame.id = 'action-helper'; frame.hidden = true;
    frame.srcdoc = '<!doctype html><html><body></body></html>'; body.append(frame);
  }, { initial, storageKey });
  const frame = await (await page.locator('#action-helper').elementHandle())!.contentFrame();
  await frame!.waitForLoadState();
  await frame!.evaluate(({ storageKey, response, deferred }) => {
    const win = window as unknown as Record<string, unknown>, body = window.parent.document.body;
    let variables: Record<string, unknown> = { keep_me: 42, unread_city: JSON.parse(localStorage.getItem(storageKey)!) };
    const counters = JSON.parse(localStorage.getItem(`${storageKey}-calls`)!);
    const record = () => { body.dataset.actionCalls = JSON.stringify(counters); localStorage.setItem(`${storageKey}-calls`, JSON.stringify(counters)); };
    body.dataset.actionState = JSON.stringify(variables.unread_city); record();
    const listeners = new Map<string, Set<() => void>>();
    win.tavern_events = { CHAT_CHANGED: 'chat_id_changed' };
    win.eventOn = (event: string, callback: () => void) => { const set = listeners.get(event) ?? new Set(); set.add(callback); listeners.set(event, set); };
    win.eventRemoveListener = (event: string, callback: () => void) => { listeners.get(event)?.delete(callback); };
    win.getButtonEvent = (name: string) => `button:${name}`;
    win.getVariables = () => variables;
    win.replaceVariables = (next: Record<string, unknown>) => {
      if (body.dataset.failActionSave === 'true') throw new Error('模拟整轮保存失败');
      if (next.keep_me !== 42) throw new Error('无关聊天变量被改动');
      variables = next; body.dataset.actionState = JSON.stringify(next.unread_city);
      localStorage.setItem(storageKey, JSON.stringify(next.unread_city)); counters.saves++; record();
    };
    win.actionReply = response;
    let release: (() => void) | undefined;
    win.releaseActionGeneration = () => release?.();
    win.changeActionChat = () => { body.dataset.actionChat = 'another-chat'; for (const fn of [...listeners.get('chat_id_changed') ?? []]) fn(); };
    win.generate = async (config: { user_input: string; injects: { content: string }[] }) => {
      counters.generations++; record(); body.dataset.actionPrompt = config.user_input;
      body.dataset.actionContract = config.injects.map(injection => injection.content).join('\n');
      if (deferred) await new Promise<void>(resolve => { release = resolve; });
      body.dataset.actionResolved = 'true';
      return JSON.stringify(win.actionReply);
    };
    win.stopGenerationById = () => { counters.cancels++; record(); return true; };
  }, { storageKey, response, deferred });
  const responsePromise = page.waitForResponse(item => item.url() === bundleUrl);
  await frame!.addScriptTag({ url: bundleUrl });
  const loaded = await responsePromise;
  expect(loaded.status()).toBe(200); expect(loaded.headers()['x-fixture-bundle-sha256']).toBe(bundleSha256);
  expect(loaded.headers()['content-length']).toBe(String(bundle.length)); expect(await loaded.finished()).toBeNull();
  await expect(root(page)).toBeVisible();
  await expect(page.locator('.uc-shell')).toHaveAttribute('data-presentation-mode', 'novel');
  await expect(page.locator('body')).toHaveAttribute('data-action-phone-ready', 'true');
  return frame!;
}

async function reachable(control: Locator) {
  await control.evaluate(node => node.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
  const hit = await control.evaluate(node => {
    const box = node.getBoundingClientRect(), surface = node.getRootNode() as ShadowRoot;
    return { hit: node.contains(surface.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)),
      left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: innerWidth, height: innerHeight, touchHeight: box.height };
  });
  expect(hit.hit).toBe(true); expect(hit.left).toBeGreaterThanOrEqual(0); expect(hit.right).toBeLessThanOrEqual(hit.width + .5);
  expect(hit.top).toBeGreaterThanOrEqual(0); expect(hit.bottom).toBeLessThanOrEqual(hit.height + .5); expect(hit.touchHeight).toBeGreaterThanOrEqual(44);
}

async function send(page: Page, input: string) {
  await composer(page).fill(input); await page.getByRole('button', { name: /继续故事/ }).click();
}

async function report(page: Page, name: string, extra: Record<string, unknown> = {}) {
  writeFileSync(`outputs/llm-actions-${name}-state.json`, JSON.stringify({ bundleSha256, state: await saved(page),
    calls: await calls(page), delivered: await delivered(page), controlledHost: true, phone: 'stub', realModelCalls: 0,
    nativeSillyTavernPage: false, physicalTauriTavern: false, ...extra }, null, 2));
}

for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }]) {
  test(`${viewport.width}px 常驻交互在全文阅读直接往返学生公寓与宿舍，服务结算保留草稿`, async ({ page }) => {
    test.setTimeout(120000); await page.setViewportSize(viewport);
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await host(page, fresh('dorm'));
    await expect(page.getByRole('button', { name: '人物', exact: true })).toHaveCount(0);
    await expect(page.locator('.tool-dock [data-inventory-entry]')).toBeInViewport();
    await reachable(page.locator('[data-place-actions] [data-adjacent-place="dorm-room"]'));
    await expect(composer(page)).toBeInViewport();
    const compactText = await page.locator('.novel-dialogue-text').evaluate(node => ({
      clientHeight: node.clientHeight, scrollHeight: node.scrollHeight,
      speechHeight: node.querySelector('.novel-speech')?.getBoundingClientRect().height ?? 0,
    }));
    expect(compactText.clientHeight).toBeGreaterThanOrEqual(60);
    let compactScrollTop = 0;
    if (compactText.scrollHeight > compactText.clientHeight) {
      compactScrollTop = await page.locator('.novel-dialogue-text').evaluate(node => { node.scrollTop = 24; return node.scrollTop; });
      expect(compactScrollTop).toBeGreaterThan(0);
      await page.locator('.novel-dialogue-text').evaluate(node => { node.scrollTop = 0; });
    }
    await page.screenshot({ path: `outputs/llm-actions-${viewport.width}-compact.png` });
    const draft = '我还有一段没发出去的话。'; await composer(page).fill(draft);
    await page.getByRole('button', { name: '全文回看', exact: true }).click();
    await expect(page.locator('.uc-shell')).toHaveAttribute('data-reading-mode', 'expanded');
    const actions = page.locator('[data-place-actions]'); await expect(actions).toBeVisible();
    const enter = actions.locator('[data-adjacent-place="dorm-room"]'); await reachable(enter);
    const before = await saved(page), beforeCalls = await calls(page);
    await page.screenshot({ path: `outputs/llm-actions-${viewport.width}-persistent.png` }); await enter.click();
    await expect.poll(async () => (await saved(page)).locationId).toBe('dorm-room');
    const inside = await saved(page); expect(inside.interior?.roomId).toBe('dorm-room');
    expect(inside.clock).toEqual(before.clock); expect(inside.player).toEqual(before.player);
    expect(inside.story).toEqual(before.story); expect(inside.phone).toEqual(before.phone);
    expect((await calls(page)).saves).toBe(beforeCalls.saves + 1);
    await expect(composer(page)).toHaveValue(draft); await expect(page.locator('.uc-shell')).toHaveAttribute('data-reading-mode', 'expanded');
    const bed = actions.locator('[data-place-activity="dorm-rest"]'); await reachable(bed);
    await page.screenshot({ path: `outputs/llm-actions-${viewport.width}-dorm.png` });
    await bed.click(); await expect(page.locator('[data-bed-rest-picker]')).toBeVisible();
    await page.locator('[data-bed-rest-picker]').getByRole('button', { name: '取消', exact: true }).click();
    await expect(actions).toBeVisible(); await expect(composer(page)).toHaveValue(draft);
    expect((await saved(page)).clock).toEqual(inside.clock); expect((await saved(page)).player).toEqual(inside.player);
    const leave = actions.locator('[data-adjacent-place="dorm"]'); await reachable(leave); await leave.click();
    await expect.poll(async () => (await saved(page)).locationId).toBe('dorm');
    expect((await saved(page)).interior).toBeNull(); await expect(composer(page)).toHaveValue(draft);
    await page.getByRole('button', { name: '地图', exact: true }).click();
    const cafe = page.locator('[data-destination="cafe"]'); await cafe.scrollIntoViewIfNeeded(); await cafe.click();
    await expect.poll(async () => (await saved(page)).locationId).toBe('cafe');
    if (await page.getByRole('button', { name: '全文回看', exact: true }).isVisible()) await page.getByRole('button', { name: '全文回看', exact: true }).click();
    const coffee = actions.locator('[data-quick-service="drink-coffee"]'); await reachable(coffee);
    const beforeCoffee = await saved(page), beforeCoffeeCalls = await calls(page); await coffee.click();
    await expect.poll(async () => (await saved(page)).player.balance).toBe(beforeCoffee.player.balance - 16);
    const afterCoffee = await saved(page); expect(minutes(afterCoffee) - minutes(beforeCoffee)).toBe(10);
    expect(afterCoffee.journal).toHaveLength(beforeCoffee.journal.length + 1);
    expect((await calls(page)).saves).toBe(beforeCoffeeCalls.saves + 1);
    expect(afterCoffee.story).toEqual(beforeCoffee.story); expect(afterCoffee.phone).toEqual(beforeCoffee.phone);
    await expect(composer(page)).toHaveValue(draft); await expect(page.locator('.uc-shell')).toHaveAttribute('data-reading-mode', 'expanded');
    await page.screenshot({ path: `outputs/llm-actions-${viewport.width}-coffee.png` });
    expect(await actions.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const takeaway = actions.locator('[data-quick-package-service="eat-dessert"]'); await reachable(takeaway); await takeaway.click();
    await expect.poll(async () => (await saved(page)).inventory.find(item => item.itemId === 'takeaway-eat-dessert')?.quantity).toBe(1);
    expect((await saved(page)).player).toEqual({ ...afterCoffee.player, balance: afterCoffee.player.balance - 20 });
    expect((await saved(page)).clock).toEqual(afterCoffee.clock);
    await page.locator('.tool-dock [data-inventory-entry]').click();
    await expect(page.locator('[data-window=inventory] [data-inventory-product="takeaway-eat-dessert"]')).toBeVisible();
    await page.screenshot({ path: `outputs/llm-actions-${viewport.width}-inventory.png` });
    const usePacked = page.locator('[data-window=inventory] [data-inventory-product="takeaway-eat-dessert"]').getByRole('button', { name: /^使用/ });
    await usePacked.evaluate(node => node.scrollIntoView({ block: 'center' })); await reachable(usePacked);
    await page.locator('[data-window=inventory]').getByRole('button', { name: '关闭背包窗口', exact: true }).click();
    await page.getByRole('button', { name: '状态', exact: true }).click();
    await expect(page.locator('[data-status-section="body"]')).toBeVisible();
    await page.screenshot({ path: `outputs/llm-actions-${viewport.width}-status.png` });
    await page.locator('[data-window=status]').getByRole('button', { name: '关闭状态窗口', exact: true }).click();
    await expect(composer(page)).toHaveValue(draft);
    expect((await calls(page)).generations).toBe(0); expect(errors).toEqual([]);
    await report(page, String(viewport.width), { viewport, compactText, compactScrollTop, errors });
  });
}

test('自然语言睡十小时精确推进600分钟，状态正文和手机整轮保存，刷新不重复结算', async ({ page }) => {
  test.setTimeout(120000); await page.setViewportSize({ width: 1280, height: 900 });
  await host(page, fresh());
  const before = await saved(page), beforeCalls = await calls(page);
  await send(page, '睡了10个小时。'); await expect(composer(page)).toHaveValue('');
  const after = await saved(page); expect(minutes(after) - minutes(before)).toBe(600);
  expect(after.clock).toEqual({ day: 3, hour: 0, minute: 20 });
  expect(after.player).toEqual({ ...before.player, energy: 100, morale: 100, health: 90, stress: 0, satiety: 30, foodEnergy: 300 });
  expect(after.journal).toHaveLength(before.journal.length + 2);
  expect(after.journal.slice(before.journal.length).filter(entry => entry.text.includes('睡眠 600 分钟'))).toHaveLength(1);
  expect(after.journal.slice(before.journal.length).filter(entry => entry.id.includes(':wa:'))).toHaveLength(1);
  expect(after.story).toHaveLength(before.story.length + 2); expect(after.story.at(-1)?.text).toBe(sleepStory);
  expect(after.phone).toHaveLength(before.phone.length + 1); expect(after.phone.at(-1)?.text).toBe('醒了以后再联系我。');
  expect(await calls(page)).toEqual({ ...beforeCalls, saves: beforeCalls.saves + 1, generations: beforeCalls.generations + 1 });
  await expect.poll(async () => (await delivered(page)).filter(item => item.id === after.phone.at(-1)?.id).length).toBe(1);
  await expect(page.locator('body')).toHaveAttribute('data-action-contract', /world_actions/);
  await page.getByRole('button', { name: '全文回看', exact: true }).click();
  await expect(page.getByRole('log')).toContainText(sleepStory);
  await page.screenshot({ path: 'outputs/llm-actions-sleep-600.png' });
  await host(page); expect(await saved(page)).toEqual(after);
  expect((await calls(page)).generations).toBe(beforeCalls.generations + 1);
  expect((await delivered(page)).filter(item => item.id === after.phone.at(-1)?.id)).toHaveLength(1);
  await report(page, 'sleep-600');
});

test('模型在一轮依次旅行和精确睡眠，地点与消耗一起提交', async ({ page }) => {
  test.setTimeout(120000); await page.setViewportSize({ width: 390, height: 844 });
  const response = { story: '你回到宿舍，睡足十小时后才醒来。', phone_messages: [], world_actions: [
    { type: 'travel', locationId: 'dorm-room' }, { type: 'rest', minutes: 600, kind: 'sleep' },
  ] };
  await host(page, fresh('cafe'), response);
  const before = await saved(page), beforeCalls = await calls(page), quote = getNovelTravelQuote(before, 'dorm-room');
  await send(page, '回宿舍睡10个小时。'); await expect(composer(page)).toHaveValue('');
  const after = await saved(page); expect(after.locationId).toBe('dorm-room'); expect(after.interior?.roomId).toBe('dorm-room');
  expect(minutes(after) - minutes(before)).toBe(quote.minutes + 600); expect(after.player.energy).toBe(100);
  expect(after.player.balance).toBe(before.player.balance - quote.fare); expect(after.phone).toEqual(before.phone);
  expect(after.story).toHaveLength(before.story.length + 2); expect(after.journal.length).toBeGreaterThanOrEqual(before.journal.length + 2);
  expect(await calls(page)).toEqual({ ...beforeCalls, saves: beforeCalls.saves + 1, generations: beforeCalls.generations + 1 });
  await page.screenshot({ path: 'outputs/llm-actions-multiple.png' }); await report(page, 'multiple');
});

test('保存失败或动作无法执行都拒绝整轮，保留草稿且没有部分时间正文手机，再次发送可成功', async ({ page }) => {
  test.setTimeout(120000); const frame = await host(page, fresh());
  const before = await saved(page), beforeCalls = await calls(page), beforePhone = await delivered(page);
  const draft = '睡10小时后告诉林同学我醒了。';
  await page.locator('body').evaluate(body => { body.dataset.failActionSave = 'true'; });
  await send(page, draft); await expect(page.locator('.notice')).toContainText('模拟整轮保存失败');
  await expect(composer(page)).toHaveValue(draft); expect(await saved(page)).toEqual(before); expect(await delivered(page)).toEqual(beforePhone);
  expect((await calls(page)).saves).toBe(beforeCalls.saves);
  await page.locator('body').evaluate(body => { delete body.dataset.failActionSave; });
  // The first action is legal; a later unavailable service must roll it back.
  await frame.evaluate(() => { (window as unknown as Record<string, unknown>).actionReply = {
    story: '这段不应写入存档。', phone_messages: [{ npcId: 'lin', text: '这条不应投递。' }],
    world_actions: [{ type: 'rest', minutes: 600, kind: 'sleep' }, { type: 'service', serviceId: 'drink-coffee' }],
  }; });
  await page.getByRole('button', { name: /继续故事/ }).click(); await expect(page.locator('.notice')).toBeVisible();
  await expect(page.locator('.notice')).not.toContainText('模拟整轮保存失败');
  expect(await saved(page)).toEqual(before); expect(await delivered(page)).toEqual(beforePhone); await expect(composer(page)).toHaveValue(draft);
  expect((await calls(page)).saves).toBe(beforeCalls.saves);
  await page.screenshot({ path: 'outputs/llm-actions-atomic-reject.png' });
  await frame.evaluate(() => { (window as unknown as Record<string, unknown>).actionReply = {
    story: '这次赠送也不应写入存档。', phone_messages: [{ npcId: 'lin', text: '这条也不应投递。' }],
    world_actions: [{ type: 'rest', minutes: 600, kind: 'sleep' }, { type: 'gift', itemId: 'meal-basic', quantity: 1, npcId: 'lin', affinityDelta: 3, reason: '送一份便当' }],
  }; });
  await composer(page).fill('先睡10小时，再把背包里的便当送给林同学。');
  await page.getByRole('button', { name: /继续故事/ }).click(); await expect(page.locator('.notice')).toContainText(/不足|没有|持有/);
  expect(await saved(page)).toEqual(before); expect(await delivered(page)).toEqual(beforePhone);
  await expect(composer(page)).toHaveValue('先睡10小时，再把背包里的便当送给林同学。');
  expect((await calls(page)).saves).toBe(beforeCalls.saves);
  await frame.evaluate(response => { (window as unknown as Record<string, unknown>).actionReply = response; }, sleepReply);
  await composer(page).fill(draft);
  await page.getByRole('button', { name: /继续故事/ }).click(); await expect(composer(page)).toHaveValue('');
  expect(minutes(await saved(page)) - minutes(before)).toBe(600);
  expect(await calls(page)).toEqual({ ...beforeCalls, saves: beforeCalls.saves + 1, generations: beforeCalls.generations + 4 });
  await report(page, 'atomic-reject');
});

test('食品加2元打包进入独立背包，可由模型赠送扣库存并改善关系，状态与刷新一致', async ({ page }) => {
  test.setTimeout(120000); await page.setViewportSize({ width: 390, height: 844 });
  const response: Reply = { story: '林同学接过你打包的甜点，笑着向你道谢。', phone_messages: [{ npcId: 'lin', text: '谢谢你的甜点！' }],
    world_actions: [{ type: 'gift', itemId: 'takeaway-eat-dessert', quantity: 1, npcId: 'lin', affinityDelta: 3, reason: '将打包甜点送给林同学' }] };
  await host(page, fresh('cafe'), response);
  await expect(page.getByRole('button', { name: '人物', exact: true })).toHaveCount(0);
  const draft = '打包一份甜点，等会儿送给林同学。'; await composer(page).fill(draft);
  const before = await saved(page), beforeCalls = await calls(page);
  await page.locator('.tool-dock [data-location-entry]').click();
  const packageDessert = page.locator('[data-package-service="eat-dessert"]');
  await reachable(packageDessert); await packageDessert.click();
  await expect.poll(async () => (await saved(page)).inventory.find(item => item.itemId === 'takeaway-eat-dessert')?.quantity).toBe(1);
  const packed = await saved(page); expect(packed.player).toEqual({ ...before.player, balance: before.player.balance - 20 });
  expect(packed.clock).toEqual(before.clock); expect(packed.contacts).toEqual(before.contacts);
  expect(packed.story).toEqual(before.story); expect(packed.phone).toEqual(before.phone);
  expect((await calls(page)).saves).toBe(beforeCalls.saves + 1); expect((await calls(page)).generations).toBe(0);
  await page.locator('[data-window=location]').getByRole('button', { name: '关闭地点窗口', exact: true }).click();
  const inventoryEntry = page.locator('.tool-dock [data-inventory-entry]'); await reachable(inventoryEntry); await inventoryEntry.click();
  const inventoryPanel = page.locator('[data-window=inventory] [data-inventory-panel]'); await expect(inventoryPanel).toBeVisible();
  const dessert = inventoryPanel.locator('[data-inventory-product="takeaway-eat-dessert"]');
  await expect(dessert).toBeVisible(); await expect(dessert.locator('[data-inventory-quantity]')).toContainText('1');
  await page.screenshot({ path: 'outputs/llm-actions-takeaway-inventory.png' });
  await page.locator('[data-window=inventory]').getByRole('button', { name: '关闭背包窗口', exact: true }).click();
  await expect(composer(page)).toHaveValue(draft);
  await page.getByRole('button', { name: '状态', exact: true }).click();
  for (const section of ['overview', 'body', 'mind', 'resources', 'recent']) await expect(page.locator(`[data-status-section="${section}"]`)).toHaveCount(1);
  await expect(page.locator('[data-window=status] [data-inventory-panel]')).toHaveCount(0);
  await page.screenshot({ path: 'outputs/llm-actions-detailed-status.png' });
  await page.locator('[data-window=status]').getByRole('button', { name: '关闭状态窗口', exact: true }).click();
  const beforeGiftCalls = await calls(page);
  await send(page, '把背包里打包的甜点送给林同学。'); await expect(composer(page)).toHaveValue('');
  const gifted = await saved(page);
  expect(gifted.inventory.find(item => item.itemId === 'takeaway-eat-dessert')).toBeUndefined();
  expect(gifted.contacts.find(person => person.id === 'lin')?.affinity).toBe(packed.contacts.find(person => person.id === 'lin')!.affinity + 3);
  expect(gifted.player).toEqual(packed.player); expect(gifted.clock).toEqual(packed.clock);
  expect(gifted.story).toHaveLength(packed.story.length + 2); expect(gifted.phone).toHaveLength(packed.phone.length + 1);
  expect(await calls(page)).toEqual({ ...beforeGiftCalls, saves: beforeGiftCalls.saves + 1, generations: beforeGiftCalls.generations + 1 });
  await expect.poll(async () => (await delivered(page)).filter(item => item.id === gifted.phone.at(-1)?.id).length).toBe(1);
  await host(page); expect(await saved(page)).toEqual(gifted);
  expect((await delivered(page)).filter(item => item.id === gifted.phone.at(-1)?.id)).toHaveLength(1);
  await report(page, 'takeaway-gift');
});

test('模型处理中切换聊天或退出后，迟到的行动正文和手机结果不会写入', async ({ page }) => {
  test.setTimeout(180000);
  for (const reason of ['switch', 'exit'] as const) {
    const frame = await host(page, fresh(), sleepReply, true);
    const before = await saved(page), beforeCalls = await calls(page), beforePhone = await delivered(page);
    await send(page, '我睡了10个小时，醒来看看手机。');
    await expect(page.getByRole('button', { name: /叙事中/ })).toBeDisabled();
    if (reason === 'switch') await frame.evaluate(() => (window as unknown as { changeActionChat(): void }).changeActionChat());
    else await page.locator('[data-unread-city-rescue]').click();
    await expect(root(page)).toHaveCount(0);
    await frame.evaluate(() => (window as unknown as { releaseActionGeneration(): void }).releaseActionGeneration());
    await expect(page.locator('body')).toHaveAttribute('data-action-resolved', 'true');
    // Let the resolved transport's Promise callbacks and session check settle.
    await frame.evaluate(async () => { await new Promise<void>(resolve => setTimeout(resolve, 0)); });
    expect(await saved(page)).toEqual(before); expect(await delivered(page)).toEqual(beforePhone);
    expect(await calls(page)).toEqual({ saves: beforeCalls.saves, generations: beforeCalls.generations + 1, cancels: beforeCalls.cancels + 1 });
    await page.locator('#native-input').fill('退出后仍可输入。'); await expect(page.locator('#native-input')).toHaveValue('退出后仍可输入。');
    await report(page, `late-${reason}`);
  }
});
