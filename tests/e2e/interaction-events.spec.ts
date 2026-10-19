import { expect, test, type Frame, type Locator, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createSelectedInitialState } from './academics-fixture';
import { reduceState } from '../../src/runtime/model';
import { getCampusInterior } from '../../src/runtime/campus-interiors';
import { getSceneArea, sceneLocationId } from '../../src/runtime/scene-context';
import { transitStops } from '../../src/runtime/transit';
import type { WorldState } from '../../src/frontend/types';

// These fixtures execute the built production IIFE, with a local Helper and
// phone contract. No native SillyTavern page or paid model is contacted.
const bundle = readFileSync(new URL('../../dist/immersive-shell.js', import.meta.url));
const bundleSha256 = createHash('sha256').update(bundle).digest('hex');
const bundleUrl = 'http://127.0.0.1:5178/__interaction_events_final_bundle__.js';
const storageKey = 'unread-city-interaction-events-e2e';
const root = (page: Page) => page.locator('[data-unread-city-root]');
const composer = (page: Page) => page.getByRole('textbox', { name: '接下来，你想做什么？' });
const saved = async (page: Page): Promise<WorldState> => JSON.parse((await page.locator('body').getAttribute('data-action-state'))!);
const calls = async (page: Page): Promise<{ saves: number; generations: number; cancels: number }> => JSON.parse((await page.locator('body').getAttribute('data-action-calls'))!);
const delivered = async (page: Page): Promise<WorldState['phone']> => JSON.parse((await page.locator('body').getAttribute('data-action-phone'))!);
const minutes = (state: WorldState) => state.clock.day * 1440 + state.clock.hour * 60 + state.clock.minute;
const eventStory = '柜台旁的一封失物招领信让你停住脚步。你帮林同学找回了资料，得到一份小小谢礼。';
const eventReply = { story: eventStory, phone_messages: [{ npcId: 'lin', text: '谢谢你帮我找回资料！' }], world_actions: [{ type: 'activity', label: '帮忙找回资料', minutes: 5, effects: { energy: -3, morale: 4, stress: -2, health: 0, balance: 5, satiety: 0, foodEnergy: 0 } }, { type: 'relationship', npcId: 'lin', delta: 3, reason: '找回资料' }] };
type Reply = { story: string; phone_messages: { npcId: string; text: string }[]; world_actions: Record<string, unknown>[] };

function fresh(locationId = 'cafe'): WorldState {
  const state = reduceState(createSelectedInitialState(), { type: 'novel_travel', locationId });
  state.clock = { day: 2, hour: 14, minute: 20 };
  state.player = { energy: 25, balance: 200, morale: 35, health: 85, stress: 65, satiety: 70, foodEnergy: 1500 };
  state.airTraffic.nextAmbientAt = Date.now() + 3600000;
  return state;
}

async function host(page: Page, initial?: WorldState, response: Reply = eventReply, deferred = false, presentation: 'novel' | 'scene' = 'novel'): Promise<Frame> {
  await page.unroute(bundleUrl);
  await page.route(bundleUrl, route => route.fulfill({ status: 200, contentType: 'application/javascript', body: bundle,
    headers: { 'content-length': String(bundle.length), 'x-fixture-bundle-sha256': bundleSha256, 'cache-control': 'no-store' } }));
  await page.route('http://127.0.0.1:5178/', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><label>原生输入<input id="native-input"></label></body></html>' }));
  await page.goto('/');
  await page.evaluate(({ initial, storageKey, presentation }) => {
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
    localStorage.setItem('unread-city.presentation-mode.v1', presentation);
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
  }, { initial, storageKey, presentation });
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
      if (body.dataset.failActionSave === 'true') throw new Error('模拟突发事件保存失败');
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
      if (body.dataset.failInteractionGenerate === 'true') throw new Error('模拟突发事件生成失败');
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
  await expect(page.locator('.uc-shell')).toHaveAttribute('data-presentation-mode', presentation);
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

async function report(page: Page, name: string, extra: Record<string, unknown> = {}) {
  writeFileSync(`outputs/interaction-events-${name}-state.json`, JSON.stringify({ bundleSha256, state: await saved(page),
    calls: await calls(page), delivered: await delivered(page), controlledHost: true, phone: 'stub', realModelCalls: 0,
    nativeSillyTavernPage: false, physicalTauriTavern: false, ...extra }, null, 2));
}

const overlay = (page: Page) => page.locator('[data-interaction-overlay]');
const phases = (page: Page, phase: string) => page.locator(`[data-interaction-overlay][data-interaction-phase="${phase}"]`);
const results: { name: string; status: string; expectedStatus: string }[] = [];
test.afterEach(async ({}, info) => { results.push({ name: info.title, status: info.status ?? 'unknown', expectedStatus: info.expectedStatus }); });
test.afterAll(() => {
  const summary = {
    bundleSha256, bundleBytes: bundle.length, scenarios: results, uniqueScenarios: results.length,
    uniquePassed: results.filter(result => result.status === 'passed').length,
    uniqueFailed: results.filter(result => result.status !== 'passed').length,
    scope: { productionIife: true, controlledHelperHost: true, phoneContract: 'stub', realModelCalls: 0, nativeSillyTavernPage: false, physicalTauriTavern: false },
  };
  writeFileSync('outputs/interaction-events-browser-results.json', JSON.stringify(summary, null, 2));
  writeFileSync('outputs/interaction-events-browser-summary.json', JSON.stringify(summary, null, 2));
});

/** All exercised base actions are deterministic. Replace exactly the next
 * lifecycle probability roll, then immediately restore the original RNG. */
async function nextRoll(frame: Frame, roll: number) {
  await frame.evaluate(value => {
    const original = Math.random;
    window.parent.document.body.dataset.eventRollConsumed = 'false';
    Math.random = () => {
      Math.random = original;
      window.parent.document.body.dataset.eventRollConsumed = 'true';
      return value;
    };
  }, roll);
}

async function startCoffee(page: Page, frame: Frame, roll: number) {
  if (!(await page.locator('[data-window=location]').isVisible())) await page.locator('.tool-dock [data-location-entry]').click();
  await nextRoll(frame, roll);
  const coffee = page.locator('[data-quick-service="drink-coffee"]');
  await reachable(coffee); await coffee.click();
  await expect(phases(page, 'progress')).toBeVisible();
  await expect(page.locator('body')).toHaveAttribute('data-event-roll-consumed', 'true');
}

async function chooseNo(page: Page) {
  await expect(phases(page, 'choice')).toBeVisible();
  const no = page.locator('[data-interaction-reject]'); await reachable(no); await no.click();
  await expect(overlay(page)).toHaveCount(0);
}

function expectOnlyCoffee(after: WorldState, before: WorldState) {
  expect(minutes(after) - minutes(before)).toBe(10);
  const satietyCost = Math.floor(minutes(after) / 15) - Math.floor(minutes(before) / 15);
  expect(after.player).toEqual({ ...before.player, energy: Math.min(100, before.player.energy + 18),
    balance: before.player.balance - 16, morale: Math.min(100, before.player.morale + 3),
    stress: Math.max(0, before.player.stress - 3), satiety: before.player.satiety - satietyCost, foodEnergy: before.player.foodEnergy - 10 });
  expect(after.story).toEqual(before.story); expect(after.phone).toEqual(before.phone); expect(after.contacts).toEqual(before.contacts);
  expect(after.journal).toHaveLength(before.journal.length + 1);
}

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 568 }]) {
  test(`${viewport.width}px 阅读无遮挡，地点悬浮窗可相邻往返且显示交互进度`, async ({ page }) => {
    test.setTimeout(120000); await page.setViewportSize(viewport);
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    const frame = await host(page, fresh('dorm'));
    await expect(page.locator('.reading-layer [data-place-actions]')).toHaveCount(0);
    await expect(page.locator('[data-place-actions]')).toHaveCount(0);
    const dialogue = await page.locator('.novel-dialogue-text').evaluate(node => ({ height: node.clientHeight, scrollHeight: node.scrollHeight }));
    expect(dialogue.height).toBeGreaterThanOrEqual(60);
    const draft = '我还没有发出这句话。'; await composer(page).fill(draft);
    await reachable(page.locator('.tool-dock [data-location-entry]'));
    await page.screenshot({ path: `outputs/interaction-events-${viewport.width}-reading.png` });
    await page.locator('.tool-dock [data-location-entry]').click();
    await expect(page.locator('[data-window=location]')).toBeVisible();
    const enter = page.locator('[data-adjacent-place="dorm-room"]'); await reachable(enter);
    const before = await saved(page), beforeCalls = await calls(page); await nextRoll(frame, .8); await enter.click();
    await expect(phases(page, 'progress')).toBeVisible();
    const progress = page.locator('[data-interaction-progress]'); await expect(progress).toHaveAttribute('role', 'progressbar');
    const firstValue = Number(await progress.getAttribute('aria-valuenow'));
    expect(firstValue).toBeGreaterThanOrEqual(0); expect(firstValue).toBeLessThan(100);
    await expect.poll(async () => Number(await progress.getAttribute('aria-valuenow'))).toBeGreaterThan(firstValue);
    expect(await saved(page)).toEqual(before); expect((await calls(page)).saves).toBe(beforeCalls.saves);
    await page.screenshot({ path: `outputs/interaction-events-${viewport.width}-progress.png` });
    await expect.poll(async () => (await saved(page)).locationId).toBe('dorm-room');
    await expect(overlay(page)).toHaveCount(0);
    const inside = await saved(page); expect(inside.interior?.roomId).toBe('dorm-room'); expect(inside.clock).toEqual(before.clock);
    expect(inside.player).toEqual(before.player); expect((await calls(page)).saves).toBe(beforeCalls.saves + 1);
    await expect(composer(page)).toHaveValue(draft);
    await page.locator('.tool-dock [data-location-entry]').click();
    const leave = page.locator('[data-adjacent-place="dorm"]'); await reachable(leave); await nextRoll(frame, .9); await leave.click();
    await expect(phases(page, 'progress')).toBeVisible();
    await expect.poll(async () => (await saved(page)).locationId).toBe('dorm');
    await expect(overlay(page)).toHaveCount(0);
    expect((await saved(page)).interior).toBeNull(); expect((await calls(page)).generations).toBe(0);
    await expect(page.locator('[data-place-actions]')).toHaveCount(0); await expect(composer(page)).toHaveValue(draft);
    await page.getByRole('button', { name: '全文回看', exact: true }).click();
    await expect(page.locator('.uc-shell')).toHaveAttribute('data-reading-mode', 'expanded');
    await expect(page.locator('.reading-layer [data-place-actions]')).toHaveCount(0);
    await page.locator('.tool-dock [data-location-entry]').click(); await expect(page.locator('[data-window=location]')).toBeVisible();
    await reachable(page.locator('[data-adjacent-place="dorm-room"]'));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); expect(errors).toEqual([]);
    await page.screenshot({ path: `outputs/interaction-events-${viewport.width}-location.png` });
    await report(page, String(viewport.width), { viewport, dialogue, errors });
  });
}

test('80%范围内选择是：原交互与模型事件影响、正文、手机原子保存，刷新不重结算', async ({ page }) => {
  test.setTimeout(120000); await page.setViewportSize({ width: 390, height: 844 });
  const frame = await host(page, fresh());
  const before = await saved(page), beforeCalls = await calls(page), beforePhone = await delivered(page);
  await startCoffee(page, frame, .7999);
  await expect(phases(page, 'choice')).toBeVisible();
  await expect(overlay(page)).toContainText(/似乎.*不.*寻常.*继续/);
  expect(await saved(page)).toEqual(before); expect(await delivered(page)).toEqual(beforePhone);
  expect((await calls(page)).generations).toBe(beforeCalls.generations);
  const yes = page.locator('[data-interaction-accept]'); await reachable(yes); await reachable(page.locator('[data-interaction-reject]'));
  await page.screenshot({ path: 'outputs/interaction-events-choice.png' }); await yes.click();
  await expect.poll(async () => (await saved(page)).story.length).toBe(before.story.length + 2);
  await expect(overlay(page)).toHaveCount(0);
  const after = await saved(page);
  expect(minutes(after) - minutes(before)).toBe(15);
  expect(after.player).toEqual({ energy: 40, balance: 189, morale: 42, health: 85, stress: 60, satiety: 69, foodEnergy: 1480 });
  expect(after.contacts.find(item => item.id === 'lin')?.affinity).toBe(before.contacts.find(item => item.id === 'lin')!.affinity + 3);
  expect(after.story.at(-1)?.text).toBe(eventStory); expect(after.phone).toHaveLength(before.phone.length + 1);
  expect(after.journal.filter(entry => entry.text.includes('喝美式咖啡'))).toHaveLength(before.journal.filter(entry => entry.text.includes('喝美式咖啡')).length + 1);
  expect(await calls(page)).toEqual({ ...beforeCalls, saves: beforeCalls.saves + 1, generations: beforeCalls.generations + 1 });
  await expect.poll(async () => (await delivered(page)).filter(item => item.id === after.phone.at(-1)?.id).length).toBe(1);
  await expect(page.locator('body')).toHaveAttribute('data-action-contract', /本轮是玩家在交互中发现异常后/);
  const prompt = (await page.locator('body').getAttribute('data-action-prompt'))!;
  const summary = JSON.parse(prompt.split('\n')[1]) as { preparedInteraction: { action: { type: string; serviceId: string } }; player: WorldState['player'] };
  expect(summary.preparedInteraction.action).toEqual({ type: 'location_service', serviceId: 'drink-coffee' });
  expect(summary.player.balance).toBe(before.player.balance - 16);
  await host(page); expect(await saved(page)).toEqual(after);
  expect((await delivered(page)).filter(item => item.id === after.phone.at(-1)?.id)).toHaveLength(1);
  await report(page, 'yes-event');
});

test('选择否正常完成原交互，不调用模型也不产生事件副作用', async ({ page }) => {
  test.setTimeout(120000); const frame = await host(page, fresh());
  const before = await saved(page), beforeCalls = await calls(page), beforePhone = await delivered(page);
  await startCoffee(page, frame, 0); await chooseNo(page);
  expectOnlyCoffee(await saved(page), before); expect(await delivered(page)).toEqual(beforePhone);
  expect(await calls(page)).toEqual({ ...beforeCalls, saves: beforeCalls.saves + 1 });
  await report(page, 'no-event');
});

test('恰好0.8在80%范围外，进度完成后直接普通结算，没有是否提示', async ({ page }) => {
  test.setTimeout(120000); const frame = await host(page, fresh());
  const before = await saved(page), beforeCalls = await calls(page);
  await startCoffee(page, frame, .8);
  await expect.poll(async () => (await saved(page)).player.balance).toBe(before.player.balance - 16);
  await expect(overlay(page)).toHaveCount(0); await expect(page.locator('[data-interaction-accept]')).toHaveCount(0);
  expectOnlyCoffee(await saved(page), before);
  expect(await calls(page)).toEqual({ ...beforeCalls, saves: beforeCalls.saves + 1 });
  await report(page, 'ordinary-20-percent');
});

test('生成失败与保存失败均保留整轮状态，错误时选正常继续只结算一次原交互', async ({ page }) => {
  test.setTimeout(120000); const frame = await host(page, fresh());
  const before = await saved(page), beforeCalls = await calls(page), beforePhone = await delivered(page);
  await page.locator('body').evaluate(body => { body.dataset.failInteractionGenerate = 'true'; });
  await startCoffee(page, frame, .2); await expect(phases(page, 'choice')).toBeVisible(); await page.locator('[data-interaction-accept]').click();
  await expect(phases(page, 'error')).toContainText('模拟突发事件生成失败');
  expect(await saved(page)).toEqual(before); expect(await delivered(page)).toEqual(beforePhone);
  expect((await calls(page)).saves).toBe(beforeCalls.saves);
  await reachable(page.locator('[data-interaction-retry]')); await reachable(page.locator('[data-interaction-reject]'));
  await page.screenshot({ path: 'outputs/interaction-events-error.png' });
  await page.locator('body').evaluate(body => { delete body.dataset.failInteractionGenerate; });
  await page.locator('[data-interaction-reject]').click(); await expect(overlay(page)).toHaveCount(0);
  const afterNormal = await saved(page); expectOnlyCoffee(afterNormal, before);
  const afterNormalCalls = await calls(page); expect(afterNormalCalls).toEqual({ ...beforeCalls, saves: beforeCalls.saves + 1, generations: beforeCalls.generations + 1 });
  await page.locator('body').evaluate(body => { body.dataset.failActionSave = 'true'; });
  await startCoffee(page, frame, .3); await expect(phases(page, 'choice')).toBeVisible(); await page.locator('[data-interaction-accept]').click();
  await expect(phases(page, 'error')).toContainText('模拟突发事件保存失败');
  expect(await saved(page)).toEqual(afterNormal); expect(await delivered(page)).toEqual(beforePhone);
  expect((await calls(page)).saves).toBe(afterNormalCalls.saves);
  await page.locator('body').evaluate(body => { delete body.dataset.failActionSave; });
  await page.locator('[data-interaction-reject]').click(); await expect(overlay(page)).toHaveCount(0);
  const afterRetry = await saved(page); expectOnlyCoffee(afterRetry, afterNormal);
  expect(await delivered(page)).toEqual(beforePhone); expect((await calls(page)).saves).toBe(afterNormalCalls.saves + 1);
  expect((await calls(page)).generations).toBe(afterNormalCalls.generations + 1);
  await report(page, 'failures-atomic');
});

test('突发事件生成中切聊天或退出，迟到回复不发布原交互、事件正文或手机', async ({ page }) => {
  test.setTimeout(180000);
  for (const reason of ['switch', 'exit'] as const) {
    const frame = await host(page, fresh(), eventReply, true);
    const before = await saved(page), beforeCalls = await calls(page), beforePhone = await delivered(page);
    await startCoffee(page, frame, .1); await expect(phases(page, 'choice')).toBeVisible();
    await page.locator('[data-interaction-accept]').click(); await expect(phases(page, 'generating')).toBeVisible();
    expect(await saved(page)).toEqual(before);
    if (reason === 'switch') await frame.evaluate(() => (window as unknown as { changeActionChat(): void }).changeActionChat());
    else await page.locator('[data-unread-city-rescue]').click();
    await expect(root(page)).toHaveCount(0);
    await frame.evaluate(() => (window as unknown as { releaseActionGeneration(): void }).releaseActionGeneration());
    await expect(page.locator('body')).toHaveAttribute('data-action-resolved', 'true');
    await frame.evaluate(async () => { await new Promise<void>(resolve => setTimeout(resolve, 0)); });
    expect(await saved(page)).toEqual(before); expect(await delivered(page)).toEqual(beforePhone);
    expect(await calls(page)).toEqual({ saves: beforeCalls.saves, generations: beforeCalls.generations + 1, cancels: beforeCalls.cancels + 1 });
    await page.locator('#native-input').fill('退出后仍然能输入。'); await expect(page.locator('#native-input')).toHaveValue('退出后仍然能输入。');
    await report(page, `late-${reason}`);
  }
});

test('3D进入室内和公交乘车选择事件后，异步收尾不会再次收起新正文', async ({ page }) => {
  test.setTimeout(180000); await page.setViewportSize({ width: 1280, height: 900 });
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { configurable: true, value(type: string, ...args: unknown[]) {
      if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null;
      return Reflect.apply(original, this, [type, ...args]);
    } });
  });
  for (const flow of ['enter', 'transit'] as const) {
    const entrance = getCampusInterior('dorm-room')!.entrance;
    const stop = transitStops.find(item => item.id === 'campus')!;
    const point = flow === 'enter' ? entrance : stop;
    const area = getSceneArea(point.x, point.z)!;
    const initial = fresh(flow === 'enter' ? 'dorm' : 'bus-stop');
    initial.scene = { x: point.x, z: point.z, yaw: point.yaw, areaId: area.id, seed: `event-3d-${flow}`, encounterId: null };
    initial.locationId = sceneLocationId(area.id);
    const story = flow === 'enter' ? '门边的一张便笺引起你的注意。你帮室友整理好散落的资料，心情轻松了一些。'
      : '下车时一位路人掉落了车票。你拾起交还，对方道谢后你也轻松了些。';
    const reply: Reply = { story, phone_messages: [], world_actions: [{ type: 'activity', label: flow === 'enter' ? '整理散落的资料' : '交还车票', minutes: 2,
      effects: { energy: 0, morale: 3, stress: -1, health: 0, balance: 0, satiety: 0, foodEnergy: 0 } }] };
    const frame = await host(page, initial, reply, false, 'scene');
    await expect(page.locator('[data-unread-city-scene]')).toHaveAttribute('data-renderer', 'fallback');
    const draft = '这句话先留在输入框里。'; await composer(page).fill(draft);
    await page.getByRole('button', { name: '自由行走', exact: true }).click();
    await expect(page.locator('.uc-shell')).toHaveAttribute('data-reading-mode', 'hidden');
    if (flow === 'transit') {
      await page.locator('[data-transit-entry]').click();
      await expect(page.locator('[data-transit-panel]')).toBeVisible();
    }
    const before = await saved(page), beforeCalls = await calls(page);
    const button = flow === 'enter' ? page.getByRole('button', { name: '进入学生宿舍', exact: true })
      : page.locator('[data-transit-target="commercial"]');
    await reachable(button); await nextRoll(frame, .1); await button.click();
    await expect(phases(page, 'choice')).toBeVisible(); await page.locator('[data-interaction-accept]').click();
    await expect.poll(async () => (await saved(page)).story.at(-1)?.text).toBe(story);
    await expect(overlay(page)).toHaveCount(0);
    // Both Vue's watcher and the awaiting action callback must finish before
    // checking visibility; the regression hid the event in the latter callback.
    await page.evaluate(async () => { await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); });
    await expect(page.locator('.uc-shell')).toHaveAttribute('data-presentation-mode', 'scene');
    await expect(page.locator('.uc-shell')).toHaveAttribute('data-reading-mode', 'compact');
    await expect(page.locator('[data-reading-layer]')).toBeVisible();
    await expect(page.locator('[data-active-window]')).toHaveAttribute('data-active-window', '');
    await expect(page.getByRole('log').locator('.story-entry').last()).toContainText(story);
    await expect(page.getByRole('log').locator('.story-entry').last()).toBeInViewport();
    await expect(composer(page)).toHaveValue(draft);
    const after = await saved(page);
    expect(after.locationId).toBe(flow === 'enter' ? 'dorm-room' : 'commercial');
    expect(after.player.morale).toBe(before.player.morale + 3);
    expect(after.player.stress).toBe(before.player.stress - 1);
    expect(after.story).toHaveLength(before.story.length + 2);
    expect(await calls(page)).toEqual({ ...beforeCalls, saves: beforeCalls.saves + 1, generations: beforeCalls.generations + 1 });
    await page.screenshot({ path: `outputs/interaction-events-3d-${flow}-event.png` });
    await report(page, `3d-${flow}-event`, { renderer: 'fallback', afterActionCallbacks: true });
  }
});
