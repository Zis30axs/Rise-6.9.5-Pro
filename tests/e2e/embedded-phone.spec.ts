import { createSelectedInitialState } from './academics-fixture';
import { expect, test, type Frame, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { WorldState } from '../../src/frontend/types';

const bundle = readFileSync(new URL('../../dist/immersive-shell.js', import.meta.url), 'utf8');
const root = (page: Page) => page.locator('[data-unread-city-root]');
const phoneFrame = (page: Page) => page.frameLocator('#sttts-panel iframe');
const unreadBadge = (page: Page) => page.locator('[data-phone-unread]');

type HelperFixture = {
  fixtureReply(response: string, hold?: boolean): void;
  fixtureResolve(): void;
  fixtureRead(chatId?: string): { keep_me: number; unread_city: WorldState };
  fixtureChange(): void;
};

/** The phone itself is the production bundle. Only the Tavern/Helper host is a
 * fixture; all model/network generation is rejected, never sent to a service. */
async function withRealEmbeddedPhone(page: Page, initial = createSelectedInitialState()) {
  const errors: string[] = [];
  const modelRequests: string[] = [];
  const extensionResources: string[] = [];
  await page.goto('/');
  await page.evaluate(() => {
    (window as Window & { __unreadCityShell?: { dispose(): void } }).__unreadCityShell?.dispose();
  });
  await page.route('**/api/**', route => {
    modelRequests.push(route.request().url());
    return route.abort('blockedbyclient');
  });
  await page.route('https://**', route => {
    modelRequests.push(route.request().url());
    return route.abort('blockedbyclient');
  });
  await page.route('**/scripts/personas.js', route => route.fulfill({ contentType: 'text/javascript', body: 'export let user_avatar = "";' }));
  await page.route('**/scripts/extensions/regex/engine.js', route => route.fulfill({ contentType: 'text/javascript', body: 'export const regex_placement = {}; export const getRegexedString = value => value;' }));
  page.on('request', request => {
    if (/\/scripts\/extensions\/third-party\/.*(?:iphonie|st-tts)/i.test(request.url())) extensionResources.push(request.url());
  });
  page.on('pageerror', error => errors.push(error.message));
  await page.evaluate(() => {
    document.body.innerHTML = '<main><label>原生输入<input id="native-phone-input"></label><div id="chat"></div><div id="extensions_settings"></div><div id="extensionsMenu"></div><button id="fixture-reenter">重新进入测试角色</button></main>';
    document.querySelector<HTMLInputElement>('#native-phone-input')!.focus();
    const host = window as unknown as Record<string, unknown>;
    const listeners = new Map<string, Set<(...args: unknown[]) => unknown>>();
    const eventSource = {
      on(name: string, listener: (...args: unknown[]) => unknown) {
        const set = listeners.get(name) ?? new Set(); set.add(listener); listeners.set(name, set);
      },
      removeListener(name: string, listener: (...args: unknown[]) => unknown) { listeners.get(name)?.delete(listener); },
      emit(name: string, ...args: unknown[]) { for (const listener of [...listeners.get(name) ?? []]) listener(...args); },
    };
    const denied = async () => {
      document.body.dataset.modelCalls = String(Number(document.body.dataset.modelCalls || '0') + 1);
      throw new Error('测试禁止模型调用');
    };
    const ctx = {
      characterId: 0, groupId: null, chatId: 'embedded-phone-a', mainApi: 'openai',
      characters: [{ avatar: 'embedded-phone-a.png', name: '手机测试角色 A', data: {} }, { avatar: 'embedded-phone-b.png', name: '手机测试角色 B', data: {} }],
      groups: [], chat: [], chatMetadata: {}, extensionSettings: {}, name1: '我', name2: '手机测试角色 A',
      eventSource,
      eventTypes: Object.fromEntries(['CHAT_CHANGED', 'MESSAGE_RECEIVED', 'MESSAGE_SWIPED', 'MESSAGE_EDITED', 'MESSAGE_DELETED', 'CHARACTER_MESSAGE_RENDERED', 'GENERATION_AFTER_COMMANDS'].map(name => [name, name])),
      setExtensionPrompt() {}, updateMessageBlock() {}, messageFormatting: (text: string) => text,
      saveSettingsDebounced() { document.body.dataset.phoneSettingsWrites = String(Number(document.body.dataset.phoneSettingsWrites || '0') + 1); },
      getRequestHeaders: () => ({ 'Content-Type': 'application/json' }),
      getCurrentChatId: () => ctx.chatId,
      generateRaw: denied, generateQuietPrompt: denied,
      getThumbnailUrl: () => '',
    };
    host.SillyTavern = { getContext: () => ctx };
    host.toastr = { info() {}, warning() {}, error() {}, success() {} };
    host.fixtureNativeChange = (next?: { chatId: string; characterId?: number }) => {
      ctx.characterId = next?.characterId ?? 1;
      ctx.chatId = next?.chatId ?? 'embedded-phone-b';
      ctx.name2 = ctx.characters[ctx.characterId]!.name;
      eventSource.emit('CHAT_CHANGED');
    };
    document.getElementById('fixture-reenter')!.addEventListener('click', () => {
      (host.__unreadCityShell as { open(): void }).open();
    });
    const iframe = document.createElement('iframe'); iframe.id = 'embedded-phone-helper'; iframe.hidden = true;
    iframe.srcdoc = '<!doctype html><html><body></body></html>'; document.body.append(iframe);
  });
  const handle = await page.locator('#embedded-phone-helper').elementHandle();
  const helper = (await handle!.contentFrame())!;
  await helper.waitForLoadState();
  await helper.evaluate(initial => {
    const host = window as unknown as Record<string, unknown>;
    const listeners = new Map<string, Set<() => void>>();
    const chats = new Map<string, Record<string, unknown>>();
    const currentChat = () => (window.parent as unknown as { SillyTavern: { getContext(): { chatId: string } } }).SillyTavern.getContext().chatId;
    const variables = (chatId = currentChat()) => {
      let value = chats.get(chatId);
      if (!value) { value = { keep_me: 42, unread_city: structuredClone(initial) }; chats.set(chatId, value); }
      return value;
    };
    let response: string | undefined;
    let hold = false;
    let finish: (() => void) | undefined;
    host.tavern_events = { CHAT_CHANGED: 'chat_id_changed' };
    host.getVariables = () => variables();
    host.replaceVariables = (next: Record<string, unknown>) => { chats.set(currentChat(), next); };
    host.eventOn = (event: string, callback: () => void) => { const set = listeners.get(event) ?? new Set(); set.add(callback); listeners.set(event, set); };
    host.eventRemoveListener = (event: string, callback: () => void) => { listeners.get(event)?.delete(callback); };
    host.getButtonEvent = (name: string) => `button:${name}`;
    // These are literal local fixtures, never a model/API call. Holding a reply
    // lets the actual Bridge reject it after a same-character chat switch.
    host.fixtureReply = (next: string, delayed = false) => { response = next; hold = delayed; };
    host.generate = async () => {
      if (response === undefined) throw new Error('测试没有设置本地剧情回复；禁止模型调用');
      const result = response;
      response = undefined;
      document.body.dataset.fixtureGenerations = String(Number(document.body.dataset.fixtureGenerations || '0') + 1);
      if (hold) { hold = false; await new Promise<void>(resolve => { finish = resolve; }); }
      return result;
    };
    host.fixtureResolve = () => { finish?.(); finish = undefined; };
    host.fixtureRead = (chatId?: string) => structuredClone(variables(chatId));
    host.stopGenerationById = () => true;
    host.fixtureChange = () => { for (const callback of [...listeners.get('chat_id_changed') ?? []]) callback(); };
  }, initial);
  await helper.addScriptTag({ content: bundle });
  await expect(root(page)).toBeVisible();
  return { helper, errors, modelRequests, extensionResources };
}

async function openPhone(page: Page) {
  await page.getByRole('button', { name: '手机', exact: true }).click();
  await expect(page.locator('[data-unread-city-phone-slot]')).toHaveAttribute('data-phone-status', 'ready', { timeout: 20000 });
  await expect(page.locator('#sttts-panel')).toBeVisible();
  await expect(phoneFrame(page).locator('.device')).toBeVisible();
}

/** The phone keeps its full design viewport; only its presentation scale changes. */
async function expectProportionalPhone(page: Page) {
  const iframe = page.locator('#sttts-panel iframe');
  await expect.poll(() => iframe.evaluate(element => ({ width: element.clientWidth, height: element.clientHeight })))
    .toEqual({ width: 390, height: 844 });
  const content = (await (await iframe.elementHandle())!.contentFrame())!;
  await expect.poll(() => content.evaluate(() => ({ width: innerWidth, height: innerHeight })))
    .toEqual({ width: 390, height: 844 });
  // Wait for the presentation resize observer before comparing the fitted rectangle.
  await expect.poll(async () => {
    const slot = (await page.locator('[data-unread-city-phone-slot]').boundingBox())!;
    const frame = (await iframe.boundingBox())!;
    const scale = Math.min(slot.width / 390, slot.height / 844);
    return Math.max(Math.abs(frame.width / 390 - scale), Math.abs(frame.height / 844 - scale));
  }).toBeLessThan(0.001);
  const slot = (await page.locator('[data-unread-city-phone-slot]').boundingBox())!;
  const frame = (await iframe.boundingBox())!;
  expect(frame.x).toBeGreaterThanOrEqual(slot.x - 1);
  expect(frame.y).toBeGreaterThanOrEqual(slot.y - 1);
  expect(frame.x + frame.width).toBeLessThanOrEqual(slot.x + slot.width + 1);
  expect(frame.y + frame.height).toBeLessThanOrEqual(slot.y + slot.height + 1);
  expect(Math.abs(frame.x + frame.width / 2 - slot.x - slot.width / 2)).toBeLessThan(1);
  expect(Math.abs(frame.y + frame.height / 2 - slot.y - slot.height / 2)).toBeLessThan(1);
  expect(frame.width / 390).toBeCloseTo(frame.height / 844, 3);
  return frame;
}

async function expectUncoveredPhoneHome(page: Page) {
  await expect.poll(() => phoneFrame(page).locator('.screen').evaluate(screen => {
    const bounds = screen.getBoundingClientRect();
    const foot = screen.querySelector('.home-foot')!.getBoundingClientRect();
    const content = ['.clock-block', '.widgets', '.home-page .apps-grid'].map(selector => screen.querySelector(selector)!.getBoundingClientRect());
    const bottomControls = ['.phone-dock', '.home-indicator'].map(selector => screen.querySelector(selector)!.getBoundingClientRect());
    return {
      contentAboveDock: content.every(rect => rect.top >= bounds.top - 1 && rect.bottom <= foot.top + 1),
      controlsInsideScreen: bottomControls.every(rect => rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1 && rect.top >= bounds.top - 1 && rect.bottom <= bounds.bottom + 1),
    };
  })).toEqual({ contentAboveDock: true, controlsInsideScreen: true });
}

async function expectBarePhonePresentation(page: Page) {
  const window = page.locator('.phone-window');
  await expect(window.locator('.window-heading, h1, .window-phone-label')).toHaveCount(0);
  for (const container of [window, page.locator('[data-unread-city-phone-slot]'), page.locator('#sttts-panel')]) {
    await expect.poll(() => container.evaluate(element => {
      const style = getComputedStyle(element);
      return {
        transparent: style.backgroundColor === 'rgba(0, 0, 0, 0)' || style.backgroundColor === 'transparent',
        backgroundImage: style.backgroundImage,
        shadow: style.boxShadow,
        border: ['borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth'].reduce((sum, key) => sum + parseFloat(style[key as keyof CSSStyleDeclaration] as string), 0),
        pointerEvents: style.pointerEvents,
      };
    })).toEqual({ transparent: true, backgroundImage: 'none', shadow: 'none', border: 0, pointerEvents: 'none' });
  }
  const phone = (await page.locator('#sttts-panel iframe').boundingBox())!;
  const controls = [window.getByRole('button', { name: '关闭手机窗口', exact: true }), window.getByRole('button', { name: /^(放大手机|人物同框)$/ })];
  await expect(window.getByRole('button')).toHaveCount(2);
  const controlBounds: { x: number; y: number; width: number; height: number }[] = [];
  for (const control of controls) {
    await expect(control).toBeInViewport({ ratio: 1 });
    await control.click({ trial: true });
    const bounds = (await control.boundingBox())!;
    expect(bounds.height).toBeGreaterThanOrEqual(44);
    expect(bounds.width).toBeGreaterThanOrEqual(44);
    expect(bounds.x + bounds.width <= phone.x + 1 || phone.x + phone.width <= bounds.x + 1
      || bounds.y + bounds.height <= phone.y + 1 || phone.y + phone.height <= bounds.y + 1).toBe(true);
    controlBounds.push(bounds);
  }
  const slot = (await page.locator('[data-unread-city-phone-slot]').boundingBox())!;
  const emptyPoints = [
    { x: slot.x + 2, y: slot.y + slot.height / 2 },
    { x: slot.x + slot.width - 2, y: slot.y + slot.height / 2 },
    { x: slot.x + slot.width / 2, y: slot.y + 2 },
    { x: slot.x + slot.width / 2, y: slot.y + slot.height - 2 },
  ].filter(point => ![phone, ...controlBounds].some(rect => point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height));
  // A transparent rectangle must also stop intercepting input beside the actual phone.
  for (const point of emptyPoints) {
    expect(await page.evaluate(({ x, y }) => {
      let target = document.elementFromPoint(x, y);
      while (target?.shadowRoot) {
        const next = target.shadowRoot.elementFromPoint(x, y);
        if (!next || next === target) break;
        target = next;
      }
      return !!target?.closest('#sttts-panel, .phone-window, [data-unread-city-phone-slot]');
    }, point)).toBe(false);
  }
}

/** Use actual parent-page coordinates to exercise input mapping through the scaled iframe. */
async function clickScaledPhone(page: Page, target: Locator) {
  await expect(target).toBeVisible();
  await target.click({ trial: true });
  const bounds = (await target.boundingBox())!;
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
}

test('未安装手机扩展时，PNG 内的真实手机启动并保留设置、备忘录与草稿', async ({ page }) => {
  test.setTimeout(60000);
  const fixture = await withRealEmbeddedPhone(page);
  // Story sync may start the backend before the first tap; it must remain one
  // bundled backend and the phone itself must stay closed until requested.
  await expect(page.locator('#sttts-panel')).not.toBeVisible();
  await openPhone(page);
  await expect(page.locator('script[data-unread-city-embedded-phone]')).toHaveCount(1);
  await expectProportionalPhone(page);
  await expectUncoveredPhoneHome(page);
  await expectBarePhonePresentation(page);
  await expect(page.locator('[data-unread-city-scene]')).toHaveAttribute('data-player-status', 'ready');
  await page.screenshot({ path: 'outputs/phone-bare-desktop.png' });
  const phone = phoneFrame(page);
  await phone.getByRole('button', { name: '设置', exact: true }).click();
  await phone.getByRole('button', { name: '夜间', exact: true }).click();
  await expect(phone.getByRole('button', { name: '夜间', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await phone.getByRole('button', { name: '返回桌面', exact: true }).first().click();
  await phone.getByRole('button', { name: '备忘录', exact: true }).click();
  await phone.getByRole('button', { name: '新增备忘录', exact: true }).click();
  await phone.locator('input[data-field="title"]').fill('内嵌手机持久化测试');
  await phone.locator('textarea[data-field="text"]').fill('草稿收起后仍然在。');
  const originalFrame = await page.locator('#sttts-panel iframe').elementHandle();
  await page.getByRole('button', { name: '关闭手机窗口', exact: true }).click();
  await expect(page.locator('#sttts-panel')).not.toBeVisible();
  await openPhone(page);
  expect(await page.locator('#sttts-panel iframe').evaluate((node, original) => node === original, originalFrame)).toBe(true);
  await expect(phone.locator('textarea[data-field="text"]')).toHaveValue('草稿收起后仍然在。');
  await phone.getByRole('button', { name: '保存', exact: true }).click();
  await expect(phone.locator('[data-save-state]')).toHaveText('已保存');
  await page.locator('[data-unread-city-rescue]').click();
  await expect(root(page)).toHaveCount(0);
  await expect(page.locator('#native-phone-input')).toBeFocused();
  await page.locator('#fixture-reenter').click();
  await openPhone(page);
  await expect(phone.locator('input[data-field="title"]')).toHaveValue('内嵌手机持久化测试');
  await phone.getByRole('button', { name: '返回桌面', exact: true }).first().click();
  await phone.getByRole('button', { name: '设置', exact: true }).click();
  await expect(phone.getByRole('button', { name: '夜间', exact: true })).toHaveAttribute('aria-pressed', 'true');
  // Recreate the backend and iframe as a script reload would; the saved note
  // and preference must come from storage, not the old UI object in memory.
  await fixture.helper.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await expect(page.locator('#sttts-panel')).toHaveCount(0);
  await expect(page.locator('[data-unread-city-embedded-phone]')).toHaveCount(0);
  await fixture.helper.addScriptTag({ content: bundle });
  await openPhone(page);
  await phone.getByRole('button', { name: '设置', exact: true }).click();
  await expect(phone.getByRole('button', { name: '夜间', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await phone.getByRole('button', { name: '返回桌面', exact: true }).first().click();
  await phone.getByRole('button', { name: '备忘录', exact: true }).click();
  await phone.getByRole('button', { name: /内嵌手机持久化测试/ }).click();
  await expect(phone.locator('textarea[data-field="text"]')).toHaveValue('草稿收起后仍然在。');
  expect(fixture.modelRequests).toEqual([]);
  expect(fixture.extensionResources).toEqual([]);
  expect(fixture.errors).toEqual([]);
  expect(await page.locator('body').getAttribute('data-model-calls')).toBeNull();
});

for (const size of [{ width: 390, height: 844 }, { width: 320, height: 568 }]) {
  test(`${size.width}px 手机入口常驻可点，真实手机等比例完整显示并保留草稿`, async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize(size);
    const fixture = await withRealEmbeddedPhone(page);
    const entry = page.getByRole('button', { name: '手机', exact: true });
    await expect(entry).toHaveClass(/phone-launcher/);
    for (const action of ['展开正文', '收起正文']) {
      await page.getByRole('button', { name: action, exact: true }).click();
      await expect(entry).toBeInViewport();
      const bounds = (await entry.boundingBox())!;
      expect(bounds.width).toBeGreaterThanOrEqual(44);
      expect(bounds.height).toBeGreaterThanOrEqual(44);
    }
    await openPhone(page);
    await expect(entry).toBeInViewport();
    const phone = await page.locator('#sttts-panel').boundingBox();
    const entryBounds = await entry.boundingBox();
    expect(phone).not.toBeNull(); expect(entryBounds).not.toBeNull();
    expect(phone!.y + phone!.height).toBeLessThanOrEqual(entryBounds!.y + 1);
    const phoneIframe = await page.locator('#sttts-panel iframe').elementHandle();
    const fitted = await expectProportionalPhone(page);
    await expectUncoveredPhoneHome(page);
    await expectBarePhonePresentation(page);
    await expect(page.locator('[data-unread-city-scene]')).toHaveAttribute('data-player-status', 'ready');
    await page.screenshot({ path: `outputs/phone-bare-${size.width}.png` });
    await page.getByRole('button', { name: '放大手机', exact: true }).click();
    await expect.poll(async () => (await page.locator('#sttts-panel').boundingBox())!.height).toBeGreaterThan(phone!.height + 50);
    const expanded = await expectProportionalPhone(page);
    expect(expanded.height).toBeGreaterThan(fitted.height + 20);
    await expectUncoveredPhoneHome(page);
    await expectBarePhonePresentation(page);
    await page.screenshot({ path: `outputs/phone-bare-${size.width}-expanded.png` });
    await page.getByRole('button', { name: '人物同框', exact: true }).click();
    await expect.poll(async () => Math.abs((await page.locator('#sttts-panel').boundingBox())!.height - phone!.height)).toBeLessThan(2);
    await expectProportionalPhone(page);
    expect(await phoneIframe!.evaluate(element => element === document.querySelector('#sttts-panel iframe'))).toBe(true);

    const app = phoneFrame(page);
    await clickScaledPhone(page, app.getByRole('button', { name: '备忘录', exact: true }));
    await clickScaledPhone(page, app.getByRole('button', { name: '新增备忘录', exact: true }));
    const draft = app.locator('textarea[data-field="text"]');
    await clickScaledPhone(page, draft);
    await expect(draft).toBeFocused();
    await page.keyboard.insertText(`缩放后仍可输入 ${size.width}px 草稿`);
    await expect(draft).toHaveValue(`缩放后仍可输入 ${size.width}px 草稿`);
    await page.getByRole('button', { name: '放大手机', exact: true }).click();
    await expectProportionalPhone(page);
    await expect(draft).toHaveValue(`缩放后仍可输入 ${size.width}px 草稿`);
    await page.getByRole('button', { name: '人物同框', exact: true }).click();
    await expectProportionalPhone(page);
    await expect(draft).toHaveValue(`缩放后仍可输入 ${size.width}px 草稿`);
    expect(await phoneIframe!.evaluate(element => element === document.querySelector('#sttts-panel iframe'))).toBe(true);
    await entry.click();
    await expect(page.locator('#sttts-panel')).not.toBeVisible();
    await openPhone(page);
    await expectProportionalPhone(page);
    expect(await phoneIframe!.evaluate(element => element === document.querySelector('#sttts-panel iframe'))).toBe(true);
    await expect(draft).toHaveValue(`缩放后仍可输入 ${size.width}px 草稿`);
    await page.locator('[data-unread-city-rescue]').click();
    await expect(root(page)).toHaveCount(0);
    await page.locator('#native-phone-input').fill('恢复后可以输入');
    await expect(page.locator('#native-phone-input')).toHaveValue('恢复后可以输入');
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
    expect(fixture.errors).toEqual([]);
    expect(fixture.modelRequests).toEqual([]);
    expect(fixture.extensionResources).toEqual([]);
  });
}

test('纯小说模式真实手机缩放与重开保留同一草稿，返回后继续原句阅读', async ({ page }) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 390, height: 844 });
  const initial = createSelectedInitialState();
  initial.story = [{ id: 'novel-phone-opening', role: 'assistant', text: '|素世|开心|先看看今天的安排。|\n|素世|思考|这一句读到一半，先记下来。|\n|素世|安心|手机收好，我们继续。|' }];
  const fixture = await withRealEmbeddedPhone(page, initial);
  const shell = page.locator('.uc-shell'), background = page.locator('[data-novel-background]');
  await page.getByRole('button', { name: '纯小说', exact: true }).click();
  await expect(shell).toHaveAttribute('data-presentation-mode', 'novel');
  await expect(background.locator('img')).toBeVisible();
  await page.getByRole('button', { name: '下一句剧情', exact: true }).click();
  await expect(page.locator('.novel-speech')).toHaveText('这一句读到一半，先记下来。');
  const segment = await page.locator('[data-novel-dialogue]').getAttribute('data-segment');
  const backgroundId = await background.getAttribute('data-background-id');
  const saved = await fixture.helper.evaluate(() => (window as unknown as HelperFixture).fixtureRead());

  const expectNovelPhone = async () => {
    await expect(shell).toHaveAttribute('data-presentation-mode', 'novel');
    await expect(page.locator('[data-unread-city-scene], [data-unread-city-interior]')).toHaveCount(0);
    await expect(background).toHaveAttribute('data-background-id', backgroundId!);
    await expectProportionalPhone(page);
    for (const container of [page.locator('.phone-window'), page.locator('[data-unread-city-phone-slot]'), page.locator('#sttts-panel')]) {
      await expect.poll(() => container.evaluate(element => {
        const style = getComputedStyle(element);
        return { background: style.backgroundColor, image: style.backgroundImage, shadow: style.boxShadow, border: parseFloat(style.borderTopWidth) + parseFloat(style.borderRightWidth) + parseFloat(style.borderBottomWidth) + parseFloat(style.borderLeftWidth) };
      })).toEqual({ background: 'rgba(0, 0, 0, 0)', image: 'none', shadow: 'none', border: 0 });
    }
  };

  await openPhone(page);
  await expect(shell).toHaveAttribute('data-phone-expanded', 'true');
  await expect(page.getByRole('button', { name: '缩小手机', exact: true })).toBeVisible();
  await expectNovelPhone();
  await expectUncoveredPhoneHome(page);
  const phone = phoneFrame(page), draft = phone.locator('textarea[data-field="text"]');
  await phone.getByRole('button', { name: '备忘录', exact: true }).click();
  await phone.getByRole('button', { name: '新增备忘录', exact: true }).click();
  await phone.locator('input[data-field="title"]').fill('小说阅读中的备忘录');
  await draft.fill('逐句阅读暂停时写下的未保存草稿。');
  const originalFrame = await page.locator('#sttts-panel iframe').elementHandle();
  for (const [name, expanded] of [['缩小手机', 'false'], ['放大手机', 'true']] as const) {
    await page.getByRole('button', { name, exact: true }).click();
    await expect(shell).toHaveAttribute('data-phone-expanded', expanded);
    await expectNovelPhone();
    await expect(draft).toHaveValue('逐句阅读暂停时写下的未保存草稿。');
    expect(await originalFrame!.evaluate(element => element === document.querySelector('#sttts-panel iframe'))).toBe(true);
  }
  await page.screenshot({ path: 'outputs/novel-real-phone-390.png' });
  await page.getByRole('button', { name: '关闭手机窗口', exact: true }).click();
  await expect(page.locator('#sttts-panel')).not.toBeVisible();
  await expect(page.locator('[data-novel-dialogue]')).toHaveAttribute('data-segment', segment!);
  await expect(page.locator('.novel-speech')).toHaveText('这一句读到一半，先记下来。');
  await openPhone(page);
  await expectNovelPhone();
  await expect(draft).toHaveValue('逐句阅读暂停时写下的未保存草稿。');
  expect(await originalFrame!.evaluate(element => element === document.querySelector('#sttts-panel iframe'))).toBe(true);
  await page.getByRole('button', { name: '关闭手机窗口', exact: true }).click();
  await expect(page.locator('[data-novel-dialogue]')).toHaveAttribute('data-segment', segment!);
  await page.getByRole('button', { name: '下一句剧情', exact: true }).click();
  await expect(page.locator('.novel-speech')).toHaveText('手机收好，我们继续。');
  await expect(background).toHaveAttribute('data-background-id', backgroundId!);
  expect(await fixture.helper.evaluate(() => (window as unknown as HelperFixture).fixtureRead())).toEqual(saved);
  await expect(page.locator('body')).not.toHaveAttribute('data-model-calls');
  await expect(fixture.helper.locator('body')).not.toHaveAttribute('data-fixture-generations');
  onlyLocalCalls(fixture);
});

test('切换角色释放手机展示，助手脚本卸载清理后台和全局入口', async ({ page }) => {
  const fixture = await withRealEmbeddedPhone(page);
  await openPhone(page);
  await page.evaluate(() => (window as unknown as { fixtureNativeChange(): void }).fixtureNativeChange());
  await fixture.helper.evaluate(() => (window as unknown as { fixtureChange(): void }).fixtureChange());
  await expect(root(page)).toHaveCount(0);
  await expect(page.locator('#sttts-panel')).not.toBeVisible();
  await page.locator('#fixture-reenter').click();
  await openPhone(page);
  await fixture.helper.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await expect(root(page)).toHaveCount(0);
  await expect(page.locator('#sttts-panel')).toHaveCount(0);
  await expect(page.locator('[data-unread-city-embedded-phone]')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => !!(window as unknown as { STiPhoniePanelHost?: unknown }).STiPhoniePanelHost)).toBe(false);
  await expect.poll(() => page.evaluate(() => !!(window as unknown as { __unreadCityEmbeddedPhoneRuntime?: unknown }).__unreadCityEmbeddedPhoneRuntime)).toBe(false);
  expect(fixture.errors).toEqual([]);
  expect(fixture.modelRequests).toEqual([]);
});

async function localStory(page: Page, helper: Frame, story: string, text: string, hold = false) {
  await helper.evaluate(({ response, hold }) => {
    (window as unknown as HelperFixture).fixtureReply(response, hold);
  }, { response: JSON.stringify({ story, phone_messages: [{ npcId: 'lin', text }] }), hold });
  await page.getByRole('textbox', { name: '接下来，你想做什么？', exact: true }).fill('看看林同学有没有发来消息。');
  await page.getByRole('button', { name: /继续故事/ }).click();
  if (!hold) await expect(page.getByRole('log', { name: '故事记录' })).toContainText(story);
}

async function switchSameCardChat(page: Page, helper: Frame, chatId: string) {
  await page.evaluate(chatId => {
    (window as unknown as { fixtureNativeChange(next: { characterId: number; chatId: string }): void }).fixtureNativeChange({ characterId: 0, chatId });
  }, chatId);
  await helper.evaluate(() => (window as unknown as HelperFixture).fixtureChange());
  await expect(root(page)).toHaveCount(0);
  await page.locator('#fixture-reenter').click();
  await expect(root(page)).toBeVisible();
}

function onlyLocalCalls(fixture: Awaited<ReturnType<typeof withRealEmbeddedPhone>>) {
  expect(fixture.errors).toEqual([]);
  expect(fixture.modelRequests).toEqual([]);
  expect(fixture.extensionResources).toEqual([]);
}

test('剧情消息进入真实 NPC 联系人，读回执回到存档，收起和重新加载均不重发', async ({ page }) => {
  test.setTimeout(90000);
  const initial = createSelectedInitialState(); initial.phone = [];
  const fixture = await withRealEmbeddedPhone(page, initial);
  const first = '第一条剧情消息：图书馆二楼靠窗的位置还空着。';
  const second = '第二条剧情消息：我已整理好笔记，等你过来。';
  await localStory(page, fixture.helper, '你收到林同学的新消息。', first);
  await expect(unreadBadge(page)).toHaveAttribute('data-phone-unread', '1');
  await openPhone(page);
  const phone = phoneFrame(page);
  // Opening the launcher, chat list, or contact list must not read a conversation.
  await expect(unreadBadge(page)).toHaveAttribute('data-phone-unread', '1');
  await phone.getByRole('button', { name: /^聊天(?:，|$)/ }).click();
  await phone.getByRole('button', { name: '联系人', exact: true }).click();
  await expect(phone.locator('[data-action="profile"][data-name="林同学"]')).toHaveCount(1);
  await expect(phone.locator('[data-action="profile"][data-name="周同学"]')).toHaveCount(1);
  await expect(unreadBadge(page)).toHaveAttribute('data-phone-unread', '1');
  await phone.locator('[data-action="tab"][data-tab="msgs"]').click();
  const conversation = phone.locator('.conv').filter({ hasText: '林同学' });
  await expect(conversation).toHaveCount(1);
  await conversation.click();
  await expect(phone.locator('.msgs').getByText(first, { exact: true })).toHaveCount(1);
  await expect(unreadBadge(page)).toHaveCount(0);
  await expect.poll(() => fixture.helper.evaluate(() => {
    return (window as unknown as HelperFixture).fixtureRead().unread_city.phone.every(message => message.read);
  })).toBe(true);

  await page.getByRole('button', { name: '关闭手机窗口', exact: true }).click();
  await localStory(page, fixture.helper, '收起的手机再次轻震了一下。', second);
  await expect(unreadBadge(page)).toHaveAttribute('data-phone-unread', '1');
  // The retained iframe is still on this thread, but hidden; it cannot read it.
  await expect.poll(() => fixture.helper.evaluate(() => {
    return (window as unknown as HelperFixture).fixtureRead().unread_city.phone.filter(message => !message.read).length;
  })).toBe(1);
  await openPhone(page);
  await expect(phone.locator('.msgs').getByText(second, { exact: true })).toHaveCount(1);
  await expect(unreadBadge(page)).toHaveCount(0);

  await fixture.helper.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await expect(page.locator('#sttts-panel')).toHaveCount(0);
  await fixture.helper.addScriptTag({ content: bundle });
  await openPhone(page);
  await phone.getByRole('button', { name: /^聊天(?:，|$)/ }).click();
  await expect(phone.locator('.conv').filter({ hasText: '林同学' })).toHaveCount(1);
  await phone.locator('.conv').filter({ hasText: '林同学' }).click();
  await expect(phone.locator('.msgs').getByText(first, { exact: true })).toHaveCount(1);
  await expect(phone.locator('.msgs').getByText(second, { exact: true })).toHaveCount(1);
  await expect(unreadBadge(page)).toHaveCount(0);
  const saved = await fixture.helper.evaluate(() => (window as unknown as HelperFixture).fixtureRead());
  expect(saved.keep_me).toBe(42);
  expect(saved.unread_city.phone).toHaveLength(2);
  expect(saved.unread_city.phone.every(message => message.read)).toBe(true);
  onlyLocalCalls(fixture);
});

test('同一角色的不同聊天隔离手机消息，切换后的迟到剧情不得写入新会话', async ({ page }) => {
  test.setTimeout(90000);
  const initial = createSelectedInitialState(); initial.phone = [];
  const fixture = await withRealEmbeddedPhone(page, initial);
  const aText = '存档 A：我在图书馆等你。';
  const bText = '存档 B：我在校园南门等你。';
  await localStory(page, fixture.helper, 'A 的手机亮了一下。', aText);
  await expect(unreadBadge(page)).toHaveAttribute('data-phone-unread', '1');
  await localStory(page, fixture.helper, '这条迟到的 A 剧情必须被丢弃。', '不应进入任何手机的迟到消息。', true);
  await expect(page.getByRole('log', { name: '故事记录' })).toHaveAttribute('aria-busy', 'true');
  await switchSameCardChat(page, fixture.helper, 'same-card-chat-b');
  await fixture.helper.evaluate(() => (window as unknown as HelperFixture).fixtureResolve());
  await expect(unreadBadge(page)).toHaveCount(0);
  await localStory(page, fixture.helper, 'B 的手机亮了一下。', bText);
  await expect(unreadBadge(page)).toHaveAttribute('data-phone-unread', '1');
  await openPhone(page);
  const phone = phoneFrame(page);
  await phone.getByRole('button', { name: /^聊天(?:，|$)/ }).click();
  await expect(phone.locator('.conv').filter({ hasText: '林同学' })).toHaveCount(1);
  await phone.locator('.conv').filter({ hasText: '林同学' }).click();
  await expect(phone.locator('.msgs').getByText(bText, { exact: true })).toBeVisible();
  await expect(phone.locator('.msgs').getByText(aText, { exact: true })).toHaveCount(0);
  await expect(unreadBadge(page)).toHaveCount(0);
  await switchSameCardChat(page, fixture.helper, 'embedded-phone-a');
  await expect(unreadBadge(page)).toHaveAttribute('data-phone-unread', '1');
  // The NPC shortcut must select A's actual phone thread, even if B was open.
  await page.getByRole('button', { name: '人物', exact: true }).click();
  await page.getByRole('button', { name: '查看林同学的手机会话', exact: true }).click();
  await expect(phone.locator('.msgs').getByText(aText, { exact: true })).toBeVisible();
  await expect(phone.locator('.msgs').getByText(bText, { exact: true })).toHaveCount(0);
  await expect(unreadBadge(page)).toHaveCount(0);
  const saved = await fixture.helper.evaluate(() => {
    const fixture = window as unknown as HelperFixture;
    return [fixture.fixtureRead('embedded-phone-a'), fixture.fixtureRead('same-card-chat-b')];
  });
  expect(saved[0]!.unread_city.phone.map(message => message.text)).toEqual([aText]);
  expect(saved[1]!.unread_city.phone.map(message => message.text)).toEqual([bText]);
  expect(saved.flatMap(value => value.unread_city.story).some(entry => entry.text.includes('迟到'))).toBe(false);
  onlyLocalCalls(fixture);
});

for (const size of [{ width: 390, height: 844 }, { width: 320, height: 568 }]) {
  test(`${size.width}px NPC 会话入口适合触控，真实未读逐个读后清零`, async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize(size);
    const fixture = await withRealEmbeddedPhone(page);
    const entry = page.getByRole('button', { name: '手机', exact: true });
    await expect(unreadBadge(page)).toHaveAttribute('data-phone-unread', '2');
    const phone = phoneFrame(page);
    for (const [name, unread] of [['林同学', 1], ['周同学', 0]] as const) {
      await page.getByRole('button', { name: '人物', exact: true }).click();
      const shortcut = page.getByRole('button', { name: `查看${name}的手机会话`, exact: true });
      await expect(shortcut).toBeVisible();
      const touchBounds = (await shortcut.boundingBox())!;
      expect(touchBounds.height).toBeGreaterThanOrEqual(44);
      await shortcut.click();
      await expect(phone.locator('.th-title strong')).toHaveText(name);
      if (unread) await expect(unreadBadge(page)).toHaveAttribute('data-phone-unread', String(unread));
      else await expect(unreadBadge(page)).toHaveCount(0);
      await expect(entry).toBeInViewport();
      const bounds = (await entry.boundingBox())!;
      expect(bounds.width).toBeGreaterThanOrEqual(44);
      expect(bounds.height).toBeGreaterThanOrEqual(44);
      const phoneBounds = (await page.locator('#sttts-panel').boundingBox())!;
      expect(phoneBounds.y + phoneBounds.height).toBeLessThanOrEqual(bounds.y + 1);
      await expect(page.locator('[data-unread-city-rescue]')).toBeInViewport();
      await page.getByRole('button', { name: '关闭手机窗口', exact: true }).click();
    }
    await expect.poll(() => fixture.helper.evaluate(() => (window as unknown as HelperFixture).fixtureRead().unread_city.phone.every(message => message.read))).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
    onlyLocalCalls(fixture);
  });
}
