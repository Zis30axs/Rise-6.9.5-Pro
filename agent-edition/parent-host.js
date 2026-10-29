/** Development host page. This is not shown inside the novel, phone, or map. */
(function installParentHost() {
  const params = new URLSearchParams(location.search);
  const run = /^[a-z0-9-]{1,40}$/.test(params.get('run') || '') ? params.get('run') : 'local';
  const presentation = params.get('presentation') === 'novel' ? 'novel' : '';
  const ctx = {
    characterId: 0,
    groupId: null,
    chatId: 'agent-fresh',
    mainApi: 'openai',
    characters: [{ avatar: 'agent-unread-city.png', name: '未读之城', data: {} }],
    groups: [],
    chat: [],
    chatMetadata: {},
    extensionSettings: {},
    name1: '我',
    name2: '未读之城',
    eventTypes: {},
    getCurrentChatId() { return ctx.chatId; },
    setExtensionPrompt() {},
    updateMessageBlock() {},
    messageFormatting(value) { return value; },
    saveSettingsDebounced() {},
    getRequestHeaders() { return { 'Content-Type': 'application/json' }; },
    generateRaw() { throw new Error('开发入口不调用模型'); },
    generateQuietPrompt() { throw new Error('开发入口不调用模型'); },
    getThumbnailUrl() { return ''; },
  };
  const listeners = new Map();
  const eventSource = {
    on(name, listener) {
      const set = listeners.get(name) ?? new Set();
      set.add(listener);
      listeners.set(name, set);
    },
    removeListener(name, listener) { listeners.get(name)?.delete(listener); },
    emit(name) { for (const listener of [...(listeners.get(name) ?? [])]) listener(); },
  };
  ctx.eventSource = eventSource;
  window.SillyTavern = { getContext: () => ctx };
  window.toastr = { info() {}, warning() {}, error() {}, success() {} };
  window.__unreadCityAgentSetChat = id => {
    if (typeof id !== 'string' || !id.startsWith('agent-')) throw new Error('开发存档编号无效');
    ctx.chatId = id;
  };

  function helperWindow() {
    const frame = document.getElementById('agent-helper');
    return frame && frame.contentWindow ? frame.contentWindow : null;
  }
  function bridge() {
    const helper = helperWindow();
    if (!helper || !helper.__unreadCityAgentBridge) throw new Error('开发助手还没有准备好');
    return helper.__unreadCityAgentBridge;
  }
  function shellRoot() {
    const root = document.querySelector('[data-unread-city-root]');
    if (!root || !root.shadowRoot) throw new Error('游戏界面尚未打开');
    return root.shadowRoot;
  }
  async function ready() {
    const start = Date.now();
    while (Date.now() - start < 60000) {
      const helper = helperWindow();
      if (helper && helper.__unreadCityAgentBridge && helper.__unreadCityAgentBridge.status().ready) return helper.__unreadCityAgentBridge.status();
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error('游戏界面没有在开发入口中打开');
  }

  window.__unreadCityAgent = {
    ready,
    status: () => bridge().status(),
    pending: () => bridge().pending(),
    injectReply: rawText => bridge().inject(rawText),
    readState: () => bridge().readState(),
    summary: () => bridge().summary(),
    logs: () => bridge().logs(),
    databaseNames: () => bridge().databaseNames(),
    initScene: spec => bridge().initScene(spec),
    newGame: () => bridge().newGame(),
    saveScenario: name => bridge().saveScenario(name),
    restoreScenario: name => bridge().restoreScenario(name),
    playerSay(text) {
      const root = shellRoot();
      const area = root.querySelector('#uc-action-input');
      if (!area) throw new Error('找不到行动输入框');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(area, text);
      area.dispatchEvent(new Event('input', { bubbles: true }));
      const button = root.querySelector('form.composer button[type="submit"]');
      if (!button) throw new Error('找不到继续故事按钮');
      button.click();
    },
    click(selector) {
      const node = shellRoot().querySelector(selector);
      if (!node) throw new Error('找不到界面元素：' + selector);
      node.click();
    },
    text(selector) {
      const node = shellRoot().querySelector(selector);
      return node ? node.textContent : '';
    },
  };

  const frame = document.createElement('iframe');
  frame.id = 'agent-helper';
  frame.hidden = true;
  frame.src = '/agent-edition/helper.html?run=' + encodeURIComponent(run) + (presentation ? '&presentation=novel' : '');
  document.body.append(frame);
})();
