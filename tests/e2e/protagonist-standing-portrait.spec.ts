import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { createInitialState, reduceState } from '../../src/runtime/model';
import { enableProtagonists } from '../../src/runtime/protagonist-world';
import type { WorldState } from '../../src/frontend/types';

const bundle = readFileSync(new URL('../../dist/immersive-shell.js', import.meta.url), 'utf8');
const viewports = [
  { width: 1440, height: 900 }, { width: 1280, height: 800 },
  { width: 390, height: 844 }, { width: 320, height: 568 },
];
const root = (page: Page) => page.locator('[data-unread-city-root]');

function withAcademics(state: WorldState): WorldState {
  state.academics = {
    majorId: 'computer-science',
    subjects: [
      { subjectId: 'cs-programming', points: 0 },
      { subjectId: 'cs-algorithms', points: 0 },
      { subjectId: 'cs-networks', points: 0 },
    ],
    lastGain: null,
  };
  return state;
}

/** Chat A keeps Soyo; chat B is the reopened chat with a non-soyo protagonist and a narration-only latest entry. */
function chatState(target: 'soyo' | 'sakiko' | 'emma'): WorldState {
  const state = enableProtagonists(withAcademics(createInitialState()));
  state.story = [{ id: 'narration-latest', role: 'assistant', text: '傍晚的街道安静下来，路灯一盏一盏亮起，晚风带着凉意。' }];
  return reduceState(state, { type: 'switch_protagonist', target });
}

async function noOverflow(page: Page) {
  const overflow = await page.locator('.uc-shell').evaluate(element => ({
    shell: element.scrollWidth - element.clientWidth,
    document: document.documentElement.scrollWidth - innerWidth,
  }));
  expect(overflow.shell).toBeLessThanOrEqual(1);
  expect(overflow.document).toBeLessThanOrEqual(1);
}

async function mountHost(page: Page, chatA: WorldState, chatB: WorldState) {
  const errors: string[] = [];
  await page.goto('/');
  await page.evaluate(() => {
    (window as Window & { __unreadCityShell?: { dispose(): void } }).__unreadCityShell?.dispose();
  });
  await page.route('**/api/**', route => route.abort('blockedbyclient'));
  await page.route('https://**', route => route.abort('blockedbyclient'));
  await page.route('**/scripts/personas.js', route => route.fulfill({ contentType: 'text/javascript', body: 'export let user_avatar = "";' }));
  await page.route('**/scripts/extensions/regex/engine.js', route => route.fulfill({ contentType: 'text/javascript', body: 'export const regex_placement = {}; export const getRegexedString = value => value;' }));
  page.on('pageerror', error => errors.push(error.message));
  await page.evaluate(() => {
    localStorage.setItem('unread-city.presentation-mode.v1', 'novel');
    document.body.innerHTML = '<main><label>原生输入<input id="native-phone-input"></label><div id="chat"></div><div id="extensions_settings"></div><div id="extensionsMenu"></div><button id="fixture-reenter">重新进入测试角色</button></main>';
    document.querySelector<HTMLInputElement>('#native-phone-input')!.focus();
    const host = window as unknown as Record<string, unknown>;
    const listeners = new Map<string, Set<(...args: unknown[]) => unknown>>();
    const eventSource = {
      on(name: string, listener: (...args: unknown[]) => unknown) { const set = listeners.get(name) ?? new Set(); set.add(listener); listeners.set(name, set); },
      removeListener(name: string, listener: (...args: unknown[]) => unknown) { listeners.get(name)?.delete(listener); },
      emit(name: string, ...args: unknown[]) { for (const listener of [...listeners.get(name) ?? []]) listener(...args); },
    };
    const denied = async () => { throw new Error('测试禁止模型调用'); };
    const ctx = {
      characterId: 0, groupId: null, chatId: 'portrait-chat-a', mainApi: 'openai',
      characters: [{ avatar: 'portrait-chat-a.png', name: '立绘测试角色 A', data: {} }, { avatar: 'portrait-chat-b.png', name: '立绘测试角色 B', data: {} }],
      groups: [], chat: [], chatMetadata: {}, extensionSettings: {}, name1: '我', name2: '立绘测试角色 A',
      eventSource,
      eventTypes: Object.fromEntries(['CHAT_CHANGED', 'MESSAGE_RECEIVED', 'MESSAGE_SWIPED', 'MESSAGE_EDITED', 'MESSAGE_DELETED', 'CHARACTER_MESSAGE_RENDERED', 'GENERATION_AFTER_COMMANDS'].map(name => [name, name])),
      setExtensionPrompt() {}, updateMessageBlock() {}, messageFormatting: (value: string) => value,
      saveSettingsDebounced() {}, getRequestHeaders: () => ({ 'Content-Type': 'application/json' }),
      getCurrentChatId: () => ctx.chatId,
      generateRaw: denied, generateQuietPrompt: denied, getThumbnailUrl: () => '',
    };
    host.SillyTavern = { getContext: () => ctx };
    host.toastr = { info() {}, warning() {}, error() {}, success() {} };
    host.fixtureNativeChange = () => { ctx.characterId = 1; ctx.chatId = 'portrait-chat-b'; ctx.name2 = ctx.characters[1]!.name; eventSource.emit('CHAT_CHANGED'); };
    document.getElementById('fixture-reenter')!.addEventListener('click', () => {
      (host.__unreadCityShell as { open(): void }).open();
    });
    const iframe = document.createElement('iframe'); iframe.id = 'portrait-helper'; iframe.hidden = true;
    iframe.srcdoc = '<!doctype html><html><body></body></html>'; document.body.append(iframe);
  });
  const handle = await page.locator('#portrait-helper').elementHandle();
  const helper = (await handle!.contentFrame())!;
  await helper.waitForLoadState();
  await helper.evaluate(({ chatA, chatB }) => {
    const host = window as unknown as Record<string, unknown>;
    const listeners = new Map<string, Set<() => void>>();
    const chats = new Map<string, Record<string, unknown>>();
    const currentChat = () => (window.parent as unknown as { SillyTavern: { getContext(): { chatId: string } } }).SillyTavern.getContext().chatId;
    const seed = (chatId: string, state: WorldState) => { chats.set(chatId, { keep_me: 42, unread_city: structuredClone(state) }); };
    const variables = () => {
      const chatId = currentChat();
      if (!chats.has(chatId)) seed(chatId, chatA);
      return chats.get(chatId)!;
    };
    seed('portrait-chat-a', chatA);
    seed('portrait-chat-b', chatB);
    host.tavern_events = { CHAT_CHANGED: 'chat_id_changed' };
    host.getVariables = () => variables();
    host.replaceVariables = (next: Record<string, unknown>) => { chats.set(currentChat(), next); };
    host.eventOn = (event: string, callback: () => void) => { const set = listeners.get(event) ?? new Set(); set.add(callback); listeners.set(event, set); };
    host.eventRemoveListener = (event: string, callback: () => void) => { listeners.get(event)?.delete(callback); };
    host.getButtonEvent = (name: string) => `button:${name}`;
    host.generate = async () => { throw new Error('测试没有设置本地剧情回复；禁止模型调用'); };
    host.fixtureRead = () => structuredClone(variables());
    host.fixtureChange = () => { for (const callback of [...listeners.get('chat_id_changed') ?? []]) callback(); };
    host.stopGenerationById = () => true;
  }, { chatA, chatB });
  await helper.addScriptTag({ content: bundle });
  await expect(root(page)).toBeVisible();
  return { helper, errors };
}

for (const viewport of viewports) {
  test(`${viewport.width}x${viewport.height} reopened chat shows the current protagonist, not always Soyo Live2D`, async ({ page }) => {
    test.setTimeout(150_000);
    await page.setViewportSize(viewport);
    mkdirSync('outputs/standing-portrait-qa', { recursive: true });
    const { helper, errors } = await mountHost(page, chatState('soyo'), chatState('sakiko'));

    // Chat A (Soyo, narration-only entry): the standing Live2D stays the Soyo portrait.
    await expect(page.locator('.uc-shell')).toHaveAttribute('data-current-protagonist', 'soyo');
    await expect(page.locator('[data-live2d-speaker-visible="true"]')).toHaveCount(1);
    await expect(page.locator('[data-sakiko-sprite]')).toHaveCount(0);
    await noOverflow(page);

    // Switch chats: the shell exits, then the user re-enters Unread City in chat B.
    await page.evaluate(() => { (window as unknown as { fixtureNativeChange(): void }).fixtureNativeChange(); });
    await helper.evaluate(() => { (window as unknown as { fixtureChange(): void }).fixtureChange(); });
    await expect(root(page)).toHaveCount(0);
    await page.locator('#fixture-reenter').click();
    await expect(root(page)).toBeVisible();

    // Chat B is Sakiko's chat with a narration-only latest entry: her sprite stands,
    // and the Soyo Live2D must stay muted instead of defaulting to visible.
    await expect(page.locator('.uc-shell')).toHaveAttribute('data-current-protagonist', 'sakiko');
    await expect(page.locator('[data-live2d-speaker-visible="true"]')).toHaveCount(0);
    await expect(page.locator('.soyo-live2d')).toHaveClass(/is-muted/);
    await expect(page.locator('[data-sakiko-sprite]')).toHaveCount(1);
    await expect(page.locator('[data-majo-portrait]')).toHaveCount(0);
    await noOverflow(page);
    await page.screenshot({ path: `outputs/standing-portrait-qa/${viewport.width}x${viewport.height}-sakiko.png` });

    // Switching to Emma inside the reopened chat shows her sprite the same way.
    const select = page.locator('[data-protagonist-select]');
    await select.selectOption('emma');
    await expect(page.locator('.uc-shell')).toHaveAttribute('data-current-protagonist', 'emma');
    await expect(page.locator('[data-live2d-speaker-visible="true"]')).toHaveCount(0);
    await expect(page.locator('[data-majo-portrait="majo-emma"]')).toHaveCount(1);
    await expect(page.locator('[data-sakiko-sprite]')).toHaveCount(0);
    await noOverflow(page);
    await page.screenshot({ path: `outputs/standing-portrait-qa/${viewport.width}x${viewport.height}-emma.png` });

    // Back to Soyo: her Live2D stands again during narration.
    await select.selectOption('soyo');
    await expect(page.locator('.uc-shell')).toHaveAttribute('data-current-protagonist', 'soyo');
    await expect(page.locator('[data-live2d-speaker-visible="true"]')).toHaveCount(1);
    await expect(page.locator('[data-majo-portrait]')).toHaveCount(0);
    expect((await helper.evaluate(() => (window as unknown as { fixtureRead(): { unread_city: WorldState } }).fixtureRead())).unread_city.protagonists?.accounts.active).toBe('soyo');
    expect(errors).toEqual([]);
    writeFileSync(`outputs/standing-portrait-qa/${viewport.width}x${viewport.height}.json`, JSON.stringify({
      viewport, chatA: 'soyo narration visible', chatB: 'sakiko narration sprite',
      emmaSprite: true, soyoRestored: true, stage: 'passed',
    }, null, 2) + '\n');
  });
}
