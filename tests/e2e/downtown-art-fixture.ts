import { expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createSelectedInitialState } from './academics-fixture';
const bundle = readFileSync(new URL('../../dist/immersive-shell.js', import.meta.url), 'utf8');
const root = (page: Page) => page.locator('[data-unread-city-root]');
export async function withArtPhone(page: Page, initial = createSelectedInitialState()) {
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
    localStorage.setItem('unread-city.presentation-mode.v1', 'novel');
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
