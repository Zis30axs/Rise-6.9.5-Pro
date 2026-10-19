import { createSelectedInitialState } from './academics-fixture';
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getSceneArea, getScenePeople, sceneLocationId } from '../../src/runtime/scene-context';
import { getCampusInterior } from '../../src/runtime/campus-interiors';
import type { WorldState } from '../../src/frontend/types';

const bundle = readFileSync(new URL('../../dist/immersive-shell.js', import.meta.url), 'utf8');
const root = (page: Page) => page.locator('[data-unread-city-root]');
const scene = (page: Page) => page.locator('[data-unread-city-scene]');
const modelIds = ['claude', 'deepseek', 'soyo', 'xiaoyang'];
const outputDirectory = new URL('../../outputs/', import.meta.url);
const screenshotPath = (name: string) => fileURLToPath(new URL(`character-models-${name}.png`, outputDirectory));
test.beforeAll(() => { mkdirSync(outputDirectory, { recursive: true }); });

function initialState(): WorldState {
  const state = createSelectedInitialState();
  const area = getSceneArea(0, 18)!;
  state.scene = { x: 0, z: 18, yaw: 0, areaId: area.id, seed: 'bundled-character-test', encounterId: null };
  state.locationId = sceneLocationId(area.id);
  state.airTraffic.nextAmbientAt = Date.now() + 3600000;
  return state;
}

function initialInside(): WorldState {
  const initial = initialState();
  const room = getCampusInterior('dorm-room')!;
  initial.scene = { ...initial.scene!, ...room.entrance, areaId: getSceneArea(room.entrance.x, room.entrance.z)!.id };
  initial.locationId = room.id;
  initial.interior = { roomId: room.id, ...room.spawn, activityId: null, lastRest: null, lastStudy: null };
  return initial;
}

/** An empty, simulated helper host runs the release IIFE with all network assets blocked.
 * This verifies the embedded model bytes rather than Vite's development asset server.
 */
async function withCharacterHost(page: Page, initial = initialState()) {
  const network: string[] = [];
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    if (route.request().isNavigationRequest() && route.request().url() === 'http://127.0.0.1:5178/character-fixture') {
      return route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><html><head><meta charset="utf-8"><link rel="icon" href="data:,"></head><body><label>原生输入<input id="native-input"></label></body></html>' });
    }
    if (/^https?:/.test(route.request().url())) {
      network.push(route.request().url());
      return route.abort();
    }
    return route.continue();
  });
  await page.goto('/character-fixture');
  await page.evaluate(() => {
    const host = window as unknown as Record<string, unknown>;
    host.SillyTavern = { getContext: () => ({ characterId: 0, groupId: null, chatId: 'character-test', mainApi: 'openai', characters: [{ avatar: 'character-test.png' }] }) };
    // A visible, interactive host fixture exercises the phone's actual presentation lease.
    // No phone backend, model or paid service is called by these scene tests.
    const phone = document.createElement('section');
    phone.id = 'character-phone'; phone.hidden = true;
    phone.setAttribute('aria-label', '宿主测试手机');
    phone.style.cssText = 'position:fixed;z-index:2147483500;box-sizing:border-box;background:#eef3ed;color:#234333;padding:18px;border-radius:20px;font:14px system-ui;';
    const heading = document.createElement('h2'); heading.textContent = '宿主测试手机';
    const note = document.createElement('p'); note.textContent = '打开手机时查看主角，关闭后回到原来的视角。';
    const input = document.createElement('input'); input.setAttribute('aria-label', '手机草稿');
    input.style.cssText = 'box-sizing:border-box;width:100%;min-height:44px;border:1px solid #8da492;border-radius:8px;padding:8px;font:inherit;';
    phone.append(heading, note, input); document.body.append(phone);
    host.STiPhoniePanelHost = { mount(anchor: HTMLElement) {
      document.body.dataset.characterPhoneMounts = String(Number(document.body.dataset.characterPhoneMounts || '0') + 1);
      const sync = () => { const rect = anchor.getBoundingClientRect(); Object.assign(phone.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` }); };
      phone.hidden = false; sync();
      return { release() { phone.hidden = true; }, sync, focus() { input.focus(); } };
    } };
    host.STiPhonieStoryHost = { async bind(data: { sessionId: string; contacts: { id: string; name: string }[] }) {
      const snapshot = { sessionId: data.sessionId, unreadTotal: 2, contacts: data.contacts.map(contact => ({ npcId: contact.id, threadId: contact.id, name: contact.name, unread: 1 })), receipts: [] };
      return { async sync() { return snapshot; }, async snapshot() { return snapshot; }, subscribe() { return () => {}; }, async openContact() {}, release() {} };
    } };
    const helper = document.createElement('iframe');
    helper.id = 'character-helper'; helper.hidden = true;
    helper.srcdoc = '<!doctype html><html><body></body></html>';
    document.body.append(helper);
  });
  const frame = await (await page.locator('#character-helper').elementHandle())!.contentFrame();
  await frame!.waitForLoadState();
  await frame!.evaluate(initial => {
    const host = window as unknown as Record<string, unknown>;
    const body = window.parent.document.body;
    let variables: Record<string, unknown> = { keep_me: 42, unread_city: initial };
    body.dataset.characterState = JSON.stringify(initial);
    host.tavern_events = { CHAT_CHANGED: 'chat_id_changed' };
    host.getVariables = () => variables;
    host.replaceVariables = (next: Record<string, unknown>) => {
      variables = next;
      body.dataset.characterState = JSON.stringify(next.unread_city);
      body.dataset.characterOtherVariable = String(next.keep_me);
    };
    host.eventOn = () => {}; host.eventRemoveListener = () => {};
    host.getButtonEvent = (name: string) => `button:${name}`;
    host.generate = async () => { body.dataset.characterGenerated = 'true'; throw new Error('Character rendering must not generate a story'); };
    host.stopGenerationById = () => true;
  }, initial);
  await frame!.addScriptTag({ content: bundle });
  await expect(root(page)).toBeVisible();
  return { network, errors, initial };
}

async function expectModels(page: Page) {
  await expect(scene(page)).toHaveAttribute('data-renderer', 'webgl');
  await expect(scene(page)).toHaveAttribute('data-character-assets', 'ready', { timeout: 20000 });
  await expect(scene(page)).toHaveAttribute('data-player-model', 'soyo');
  await expect.poll(async () => (await scene(page).getAttribute('data-character-models'))!.split(',').sort()).toEqual(modelIds);
  await expect.poll(async () => Number(await scene(page).getAttribute('data-character-instance-count'))).toBeGreaterThanOrEqual(4);
}

async function savedState(page: Page): Promise<WorldState> {
  return JSON.parse((await page.locator('body').getAttribute('data-character-state'))!) as WorldState;
}

function disjoint(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) {
  return a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
}

test('内嵌角色：四个 GLB 离线进入真实 WebGL，默认素世第三人称，切换与重入保留原存档', async ({ page }) => {
  test.setTimeout(60000);
  const { network, errors, initial } = await withCharacterHost(page);
  await expectModels(page);
  await expect(scene(page)).toHaveAttribute('data-camera-mode', 'third-person');
  const before = await savedState(page);
  const instances = await scene(page).getAttribute('data-character-instance-count');
  await page.getByRole('button', { name: '自由行走', exact: true }).click();
  await page.screenshot({ path: screenshotPath('outdoor') });
  const firstPerson = page.getByRole('button', { name: '切换为第一人称视角', exact: true });
  await expect(firstPerson).toBeInViewport({ ratio: 1 });
  await firstPerson.click();
  await expect(scene(page)).toHaveAttribute('data-camera-mode', 'first-person');
  await page.getByRole('button', { name: '切换为第三人称视角', exact: true }).click();
  await expect(scene(page)).toHaveAttribute('data-camera-mode', 'third-person');
  expect(await savedState(page)).toEqual(before);
  expect(before.contacts).toEqual(initial.contacts);
  expect(before.phone).toEqual(initial.phone);
  const nearby = await page.locator('[data-scene-person-id]').evaluateAll(elements => elements.map(element => element.getAttribute('data-scene-person-id')));
  expect(nearby.length).toBeGreaterThan(0);
  expect(nearby.every(id => getScenePeople(initial.scene!).some(person => person.id === id))).toBe(true);
  await page.locator('[data-unread-city-rescue]').click();
  await expect(root(page)).toHaveCount(0);
  await page.locator('#native-input').fill('模型退出后仍能输入');
  await page.evaluate(() => (window as Window & { __unreadCityShell?: { open(): void } }).__unreadCityShell!.open());
  await expectModels(page);
  await expect(scene(page)).toHaveAttribute('data-character-instance-count', instances!);
  expect(await savedState(page)).toEqual(before);
  await expect(page.locator('body')).not.toHaveAttribute('data-character-generated');
  expect(network).toEqual([]);
  expect(errors).toEqual([]);
});

test('内嵌角色：室内素世真实加载，切换视角保留房间位置、活动和世界存档', async ({ page }) => {
  test.setTimeout(60000);
  const initial = initialInside();
  const { network, errors } = await withCharacterHost(page, initial);
  const interior = page.locator('[data-unread-city-interior]');
  await expect(interior).toHaveAttribute('data-renderer', 'webgl');
  await expect(interior).toHaveAttribute('data-character-assets', 'ready', { timeout: 20000 });
  await expect(interior).toHaveAttribute('data-player-model', 'soyo');
  await expect(interior).toHaveAttribute('data-camera-mode', 'third-person');
  await page.getByRole('button', { name: '自由行走', exact: true }).click();
  await page.screenshot({ path: screenshotPath('interior') });
  const position = await interior.getAttribute('data-position');
  await page.getByRole('button', { name: '切换为第一人称视角', exact: true }).click();
  await expect(interior).toHaveAttribute('data-camera-mode', 'first-person');
  await expect(interior).toHaveAttribute('data-position', position!);
  await page.getByRole('button', { name: '切换为第三人称视角', exact: true }).click();
  await expect(interior).toHaveAttribute('data-camera-mode', 'third-person');
  expect(await savedState(page)).toEqual(initial);
  await expect(page.locator('body')).not.toHaveAttribute('data-character-generated');
  expect(network).toEqual([]);
  expect(errors).toEqual([]);
});

for (const indoors of [false, true]) {
  test(`看手机角色视角：${indoors ? '室内' : '户外'}正面握持手机，关闭恢复第一或第三人称和完整存档`, async ({ page }) => {
    test.setTimeout(60000);
    const { network, errors } = await withCharacterHost(page, indoors ? initialInside() : initialState());
    const stage = page.locator(indoors ? '[data-unread-city-interior]' : '[data-unread-city-scene]');
    await expect(stage).toHaveAttribute('data-character-assets', 'ready', { timeout: 20000 });
    await page.getByRole('button', { name: '自由行走', exact: true }).click();
    const before = await savedState(page);
    const position = await stage.getAttribute('data-position');
    const view = await stage.getAttribute('data-view');
    for (const preference of ['third-person', 'first-person']) {
      if (preference === 'first-person') await page.getByRole('button', { name: '切换为第一人称视角', exact: true }).click();
      await page.getByRole('button', { name: '手机', exact: true }).click();
      await expect(page.getByRole('region', { name: '宿主测试手机' })).toBeVisible();
      await expect(stage).toHaveAttribute('data-phone-view', 'true');
      await expect(stage).toHaveAttribute('data-player-pose', 'phone');
      await expect(stage).toHaveAttribute('data-camera-mode', preference);
      await page.getByLabel('手机草稿', { exact: true }).fill('wasd 看完手机再回场景');
      await expect(stage).toHaveAttribute('data-position', position!);
      await expect(stage).toHaveAttribute('data-view', view!);
      await stage.locator('canvas').focus();
      await page.keyboard.down('w'); await page.waitForTimeout(180); await page.keyboard.up('w');
      await expect(stage).toHaveAttribute('data-position', position!);
      await page.getByLabel('手机草稿', { exact: true }).focus();
      await page.screenshot({ path: screenshotPath(`phone-${indoors ? 'interior' : 'outdoor'}-${preference}`) });
      await page.getByRole('button', { name: '关闭手机窗口', exact: true }).click();
      await expect(page.getByRole('region', { name: '宿主测试手机' })).toBeHidden();
      await expect(stage).toHaveAttribute('data-phone-view', 'false');
      await expect(stage).toHaveAttribute('data-player-pose', 'standing');
      await expect(stage).toHaveAttribute('data-camera-mode', preference);
      await expect(stage).toHaveAttribute('data-position', position!);
      await expect(stage).toHaveAttribute('data-view', view!);
      expect(await savedState(page)).toEqual(before);
    }
    await expect(page.locator('body')).not.toHaveAttribute('data-character-generated');
    expect(network).toEqual([]); expect(errors).toEqual([]);
  });
}

for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }]) {
  test(`内嵌角色：${viewport.width}px 素世视角按钮与双手行走可用，松手停步且不修改时间与手机`, async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize(viewport);
    const { network, errors, initial } = await withCharacterHost(page);
    await expectModels(page);
    await page.getByRole('button', { name: '自由行走', exact: true }).click();
    await page.screenshot({ path: screenshotPath(`mobile-${viewport.width}`) });
    const toggle = page.getByRole('button', { name: '切换为第一人称视角', exact: true });
    await expect(toggle).toBeInViewport({ ratio: 1 });
    const toggleBox = (await toggle.boundingBox())!;
    expect(toggleBox.height).toBeGreaterThanOrEqual(44);
    const controls = [
      page.getByRole('group', { name: '移动摇杆', exact: true }),
      page.getByRole('group', { name: '视角环视区域', exact: true }),
      page.getByRole('button', { name: '手机', exact: true }),
      page.locator('[data-unread-city-rescue]'),
    ];
    for (const control of controls) {
      await expect(control).toBeInViewport({ ratio: 1 });
      expect(disjoint(toggleBox, (await control.boundingBox())!)).toBe(true);
    }
    await toggle.click();
    await expect(scene(page)).toHaveAttribute('data-camera-mode', 'first-person');
    await page.getByRole('button', { name: '切换为第三人称视角', exact: true }).click();
    const moveBox = (await controls[0].boundingBox())!;
    const lookBox = (await controls[1].boundingBox())!;
    const move = { id: 21, x: moveBox.x + moveBox.width / 2, y: moveBox.y + moveBox.height / 2 - 28 };
    const look = { id: 22, x: lookBox.x + lookBox.width / 2, y: lookBox.y + lookBox.height / 2 };
    const session = await page.context().newCDPSession(page);
    const start = await scene(page).getAttribute('data-position');
    const view = await scene(page).getAttribute('data-view');
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [move] });
    await expect(scene(page)).not.toHaveAttribute('data-position', start!);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [move, look] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [move, { ...look, x: look.x - 50, y: look.y - 10 }] });
    await expect(scene(page)).not.toHaveAttribute('data-view', view!);
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const stopped = await scene(page).getAttribute('data-position');
    await page.waitForTimeout(180);
    await expect(scene(page)).toHaveAttribute('data-position', stopped!);
    const after = await savedState(page);
    expect(after.clock).toEqual(initial.clock);
    expect(after.player).toEqual(initial.player);
    expect(after.phone).toEqual(initial.phone);
    expect(after.contacts).toEqual(initial.contacts);
    expect(after.scene!.seed).toBe(initial.scene!.seed);
    await expect(page.locator('body')).not.toHaveAttribute('data-character-generated');
    await expect(page.locator('body')).toHaveAttribute('data-character-other-variable', '42');
    expect(network).toEqual([]);
    expect(errors).toEqual([]);
    await session.detach();
  });

  test(`看手机角色视角：${viewport.width}px 手机保持可输入和关闭，主角前视恢复不改进度`, async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize(viewport);
    const { network, errors } = await withCharacterHost(page);
    await expectModels(page);
    await page.getByRole('button', { name: '自由行走', exact: true }).click();
    const before = await savedState(page);
    await page.getByRole('button', { name: '手机', exact: true }).click();
    await expect(scene(page)).toHaveAttribute('data-phone-view', 'true');
    await expect(scene(page)).toHaveAttribute('data-player-pose', 'phone');
    const phone = page.getByRole('region', { name: '宿主测试手机' });
    const close = page.getByRole('button', { name: '关闭手机窗口', exact: true });
    for (const control of [phone, close, page.locator('[data-unread-city-rescue]')]) await expect(control).toBeInViewport({ ratio: 1 });
    expect((await close.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(disjoint((await phone.boundingBox())!, (await page.locator('[data-unread-city-rescue]').boundingBox())!)).toBe(true);
    await page.getByLabel('手机草稿', { exact: true }).fill('wasd 手机输入不移动角色');
    await page.screenshot({ path: screenshotPath(`phone-mobile-${viewport.width}`) });
    const phoneBefore = (await phone.boundingBox())!;
    const phoneElement = await phone.elementHandle();
    const mountsBefore = await page.locator('body').getAttribute('data-character-phone-mounts');
    await page.getByRole('button', { name: '放大手机', exact: true }).click();
    await expect(page.locator('.uc-shell')).toHaveAttribute('data-phone-expanded', 'true');
    await expect.poll(async () => (await phone.boundingBox())!.height).toBeGreaterThan(phoneBefore.height + 20);
    await expect(phone).toBeInViewport({ ratio: 1 });
    await expect(page.getByLabel('手机草稿', { exact: true })).toHaveValue('wasd 手机输入不移动角色');
    expect(await phone.evaluate((element, original) => element === original, phoneElement)).toBe(true);
    await expect(page.locator('body')).toHaveAttribute('data-character-phone-mounts', mountsBefore!);
    await page.screenshot({ path: screenshotPath(`phone-mobile-${viewport.width}-expanded`) });
    await page.getByRole('button', { name: '人物同框', exact: true }).click();
    await expect(page.locator('.uc-shell')).toHaveAttribute('data-phone-expanded', 'false');
    await expect.poll(async () => (await phone.boundingBox())!.height).toBeCloseTo(phoneBefore.height, 0);
    await expect(page.getByLabel('手机草稿', { exact: true })).toHaveValue('wasd 手机输入不移动角色');
    expect(await phone.evaluate((element, original) => element === original, phoneElement)).toBe(true);
    await expect(page.locator('body')).toHaveAttribute('data-character-phone-mounts', mountsBefore!);
    await close.click();
    await expect(phone).toBeHidden();
    await expect(scene(page)).toHaveAttribute('data-phone-view', 'false');
    await expect(scene(page)).toHaveAttribute('data-camera-mode', 'third-person');
    expect(await savedState(page)).toEqual(before);
    await expect(page.locator('body')).not.toHaveAttribute('data-character-generated');
    expect(network).toEqual([]); expect(errors).toEqual([]);
  });
}
