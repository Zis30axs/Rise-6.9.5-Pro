import {expect,type Page} from '@playwright/test';
export async function mountSwitchHost(page: Page, options: {mode?: 'novel' | 'scene'; state:any; fallback?:boolean; bundle:string; installZip?:string}):Promise<{helper:import('@playwright/test').Frame;errors:string[]}> {
  const errors: string[] = [];
  await page.goto('/');
  await page.evaluate(() => (window as Window & { __unreadCityShell?: { dispose(): void } }).__unreadCityShell?.dispose());
  await page.route('**/api/**', route => route.abort('blockedbyclient'));
  await page.route('https://**', route => route.abort('blockedbyclient'));
  await page.route('**/scripts/personas.js', route => route.fulfill({ contentType: 'text/javascript', body: 'export let user_avatar = "";' }));
  await page.route('**/scripts/extensions/regex/engine.js', route => route.fulfill({ contentType: 'text/javascript', body: 'export const regex_placement = {}; export const getRegexedString = value => value;' }));
  page.on('pageerror', error => errors.push(error.message));
  await page.evaluate(({ mode, fallback }) => {
    if (fallback) {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function(this: HTMLCanvasElement, type: string, ...args: unknown[]) {
        if (/webgl/i.test(type)) return null;
        return Reflect.apply(original, this, [type, ...args]);
      } as typeof original;
    }
    localStorage.setItem('unread-city.presentation-mode.v1', mode);
    document.body.innerHTML = '<main><label>原生输入<input id="fixture-native-input"></label><div id="chat"></div><div id="extensions_settings"></div><div id="extensionsMenu"></div><button id="fixture-reenter">重新进入</button></main>';
    document.querySelector<HTMLInputElement>('#fixture-native-input')!.focus();
    const host = window as unknown as Record<string, unknown>;
    const listeners = new Map<string, Set<(...args: unknown[]) => unknown>>();
    const eventSource = {
      on(name: string, listener: (...args: unknown[]) => unknown) { const set = listeners.get(name) ?? new Set(); set.add(listener); listeners.set(name, set); },
      removeListener(name: string, listener: (...args: unknown[]) => unknown) { listeners.get(name)?.delete(listener); },
      emit(name: string) { for (const listener of [...listeners.get(name) ?? []]) listener(); },
    };
    const denied = async () => { throw new Error('禁止真实模型调用'); };
    const ctx = {
      characterId: 0, groupId: null, chatId: 'switch-chat-a', mainApi: 'openai',
      characters: [{ avatar: 'switch-a.png', name: '切换测试 A', data: {} }, { avatar: 'switch-b.png', name: '切换测试 B', data: {} }],
      groups: [], chat: [], chatMetadata: {}, extensionSettings: {}, name1: '我', name2: '切换测试 A', eventSource,
      eventTypes: Object.fromEntries(['CHAT_CHANGED', 'MESSAGE_RECEIVED', 'MESSAGE_SWIPED', 'MESSAGE_EDITED', 'MESSAGE_DELETED', 'CHARACTER_MESSAGE_RENDERED', 'GENERATION_AFTER_COMMANDS'].map(name => [name, name])),
      setExtensionPrompt() {}, updateMessageBlock() {}, messageFormatting: (value: string) => value,
      saveSettingsDebounced() {}, getRequestHeaders: () => ({ 'Content-Type': 'application/json' }),
      getCurrentChatId: () => ctx.chatId, generateRaw: denied, generateQuietPrompt: denied, getThumbnailUrl: () => '',
    };
    host.SillyTavern = { getContext: () => ctx };
    host.toastr = { info() {}, warning() {}, error() {}, success() {} };
    host.fixtureNativeChange = () => { ctx.characterId = 1; ctx.chatId = 'switch-chat-b'; ctx.name2 = ctx.characters[1]!.name; eventSource.emit('CHAT_CHANGED'); };
    document.getElementById('fixture-reenter')!.addEventListener('click', () => (host.__unreadCityShell as { open(): void }).open());
    const iframe = document.createElement('iframe'); iframe.id = 'switch-helper'; iframe.hidden = true;
    iframe.srcdoc = '<!doctype html><html><body></body></html>'; document.body.append(iframe);
  }, { mode: options.mode ?? 'novel', fallback: !!options.fallback });
  const helper = (await (await page.locator('#switch-helper').elementHandle())!.contentFrame())!;
  await helper.waitForLoadState();
  await helper.evaluate(({ chat, fallback }) => {
    if (fallback) {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function(this: HTMLCanvasElement, type: string, ...args: unknown[]) {
        if (/webgl/i.test(type)) return null;
        return Reflect.apply(original, this, [type, ...args]);
      } as typeof original;
    }
    const host = window as unknown as Record<string, unknown>;
    const listeners = new Map<string, Set<() => void>>();
    const chats = new Map<string, Record<string, unknown>>();
    const currentChat = () => (window.parent as unknown as { SillyTavern: { getContext(): { chatId: string } } }).SillyTavern.getContext().chatId;
    for (const id of ['switch-chat-a', 'switch-chat-b']) chats.set(id, { keep_me: 42, unread_city: structuredClone(chat) });
    let saves = 0, switchSaves = 0, generations = 0, cancellations = 0, fail = false;
    let resolve: ((value: string) => void) | undefined;
    host.tavern_events = { CHAT_CHANGED: 'chat_id_changed' };
    host.getVariables = () => chats.get(currentChat());
    host.replaceVariables = (next: Record<string, unknown>) => {
      if (fail) throw new Error('测试保存失败');
      const previous = chats.get(currentChat())!.unread_city as any;
      const saved = next.unread_city as any;
      if (previous.protagonists?.accounts.active !== saved.protagonists?.accounts.active) switchSaves++;
      saves++; chats.set(currentChat(), next);
    };
    host.eventOn = (name: string, callback: () => void) => { const set = listeners.get(name) ?? new Set(); set.add(callback); listeners.set(name, set); };
    host.eventRemoveListener = (name: string, callback: () => void) => { listeners.get(name)?.delete(callback); };
    host.getButtonEvent = (name: string) => `button:${name}`;
    host.generate = () => { generations++; return new Promise<string>(done => { resolve = done; }); };
    host.fixtureResolve = () => resolve?.('<story>迟到旧回复不应该保存。</story><phone_messages>[]</phone_messages>');
    host.fixtureRead = () => structuredClone(chats.get(currentChat()));
    host.fixtureCounts = () => ({ saves, switchSaves, generations, cancellations });
    host.fixtureFailSave = (value: boolean) => { fail = value; };
    host.fixtureChange = () => { for (const callback of [...listeners.get('chat_id_changed') ?? []]) callback(); };
    host.stopGenerationById = () => { cancellations++; return true; };
  }, { chat: options.state, fallback: !!options.fallback });
  const script = options.bundle;
  await helper.addScriptTag({ content: script });
  if (options.installZip) {
    await expect(page.locator('#unread-city-lite-import')).toBeVisible();
    await page.locator('input[type="file"][accept=".zip,application/zip"]').setInputFiles(options.installZip);
    await expect(page.locator('#unread-city-lite-import')).toContainText('已安装', { timeout: 60_000 });
    return mountSwitchHost(page,{...options,installZip:undefined});
  }
  await expect(page.locator('[data-unread-city-root]'),errors.join('\n')).toBeVisible({timeout:30_000});
  return { helper, errors };
}
