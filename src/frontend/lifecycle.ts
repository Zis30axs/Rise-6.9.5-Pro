import { createApp, reactive, toRaw, type App as VueApp } from 'vue';
import App from './App.vue';
import css from './shell.css?inline';
import { acknowledgePhoneRead, commitStoryTurn, parseState, reduceState } from '../runtime/model';
import type { Bridge, ShellActions, ShellModel } from './types';
import type { PhoneLease, PhonePanelHost, PhoneRuntime } from './phone-runtime';
import { createStoryPhoneLink, type StoryPhoneLink } from './story-phone';

export interface ShellHandle {
  dispose(reason?: string): void;
  model: ShellModel;
  actions: ShellActions;
}

type PhoneWindow = Window & { STiPhoniePanelHost?: PhonePanelHost };

/** The native chat DOM is covered, never removed or replaced. */
export function mountShell(
  hostWindow: Window,
  ownerWindow: Window,
  bridge: Bridge,
  onExit: (reason: string) => void,
  phoneRuntime?: PhoneRuntime,
): ShellHandle {
  const doc = hostWindow.document;
  const session = bridge.session();
  if (!session) throw new Error('请先打开《未读之城》的单人聊天。');
  // Load and validate before touching native UI, including overflow and focus.
  const state = bridge.load();
  const previousFocus = doc.activeElement as HTMLElement | null;
  const previousOverflow = doc.body.style.getPropertyValue('overflow');
  const previousPriority = doc.body.style.getPropertyPriority('overflow');
  const ownerFrame = ownerWindow === hostWindow ? null : ownerWindow.frameElement;
  const host = doc.createElement('div');
  host.setAttribute('data-unread-city-root', '');
  host.setAttribute('role', 'dialog');
  host.setAttribute('aria-label', '未读之城沉浸界面');
  host.setAttribute('aria-modal', 'true');
  host.style.cssText = 'position:fixed;inset:0;height:100dvh;z-index:2147483000;isolation:isolate;';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = doc.createElement('style');
  style.textContent = css;
  const mount = doc.createElement('div');
  mount.id = 'unread-city-app';
  shadow.append(style, mount);

  // This control is independent of Vue and its shadow DOM.
  const rescue = doc.createElement('button');
  rescue.type = 'button';
  rescue.textContent = '恢复酒馆';
  rescue.title = '恢复原生界面（Esc）';
  rescue.setAttribute('data-unread-city-rescue', '');
  rescue.style.cssText = 'position:fixed;right:12px;top:calc(100dvh - 46px);z-index:2147483647;padding:8px 12px;border:1px solid #a4b6a7;border-radius:6px;background:#f5f1e5;color:#263c39;font:12px system-ui;cursor:pointer;';

  const phoneApi = () => {
    if (phoneRuntime) return phoneRuntime.available();
    const api = (hostWindow as PhoneWindow).STiPhoniePanelHost;
    return typeof api?.mount === 'function' ? api : null;
  };
  const model = reactive<ShellModel>({ mode: bridge.kind, state, busy: false, notice: '', connection: bridge.label, externalPhoneAvailable: !!phoneApi(), externalPhoneOpen: false, phoneStatus: phoneApi() ? 'ready' : 'idle', phoneError: '', phoneSource: phoneRuntime?.source() ?? (phoneApi() ? 'extension' : 'none'), phoneLinkStatus: 'idle', phoneLinkError: '', phoneUnread: 0, phoneContactUnread: [] });
  let app: VueApp | undefined;
  let dead = false;
  let epoch = 0;
  let stopSession: (() => void) | undefined;
  let timer: number | undefined;
  let observer: MutationObserver | undefined;
  let appliedOverflowPriority: string | undefined;
  let phoneLease: PhoneLease | undefined;
  let phoneAnchor: HTMLElement | undefined;
  let loadingPhoneAnchor: HTMLElement | undefined;
  let mountedPhoneApi: PhonePanelHost | undefined;
  let phoneSequence = 0;
  let dismissOverlay: (() => boolean) | undefined;
  let storyPhone: StoryPhoneLink | undefined;
  const storyIdPrefix = `story-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  let storySequence = 0;
  const storyId = () => globalThis.crypto?.randomUUID?.() ?? `${storyIdPrefix}-${++storySequence}`;

  function dispose(reason = '已恢复原生界面。') {
    if (dead) return;
    dead = true; epoch++;
    const cleanups = [
      () => closePhone(),
      () => storyPhone?.dispose(),
      () => { dismissOverlay = undefined; },
      () => stopSession?.(),
      () => bridge.cancel(),
      () => bridge.dispose(),
      () => app?.unmount(),
      () => observer?.disconnect(),
      () => timer !== undefined && hostWindow.clearInterval(timer),
      () => doc.removeEventListener('keydown', keydown, true),
      () => doc.removeEventListener('focusin', focusin, true),
      () => ownerWindow.removeEventListener('pagehide', pagehide),
      () => hostWindow.removeEventListener('resize', layoutRescue),
      () => rescue.removeEventListener('click', rescueClick),
      () => host.remove(),
      () => rescue.remove(),
    ];
    for (const cleanup of cleanups) {
      try { cleanup(); } catch (error) { console.error('[UnreadCity] cleanup', error); }
    }
    // Do not overwrite an overflow change another extension made after mounting.
    if (appliedOverflowPriority !== undefined && doc.body.style.getPropertyValue('overflow') === 'hidden' && doc.body.style.getPropertyPriority('overflow') === appliedOverflowPriority) {
      if (previousOverflow) doc.body.style.setProperty('overflow', previousOverflow, previousPriority);
      else doc.body.style.removeProperty('overflow');
    }
    try {
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    } catch { /* A native element may become non-focusable while exiting. */ }
    onExit(reason);
  }

  const stillCurrent = (request: number) => !dead && epoch === request && bridge.session() === session;
  const snapshot = () => parseState(toRaw(model.state));
  function closePhone() {
    const lease = phoneLease;
    phoneLease = undefined; phoneAnchor = undefined; mountedPhoneApi = undefined;
    loadingPhoneAnchor = undefined;
    phoneSequence++;
    model.externalPhoneOpen = false;
    if (model.phoneStatus === 'loading') model.phoneStatus = 'idle';
    host.removeAttribute('aria-owns');
    try { lease?.release(); }
    catch (error) { console.error('[UnreadCity] phone cleanup', error); }
  }
  function acquirePhone(api: PhonePanelHost, anchor: HTMLElement, sequence: number) {
    if (dead || sequence !== phoneSequence || !anchor.isConnected || bridge.session() !== session) return;
    let acquired: PhoneLease | undefined;
    try {
      acquired = api.mount(anchor, { onClose() {
        if (dead || sequence !== phoneSequence) return;
        closePhone();
        shadow.querySelector<HTMLElement>('button[aria-label="手机"]')?.focus({ preventScroll: true });
      } });
      if (dead || sequence !== phoneSequence) { acquired?.release(); return; }
      if (!acquired || typeof acquired.release !== 'function' || typeof acquired.sync !== 'function' || typeof acquired.focus !== 'function') {
        throw new Error('手机连接未完成，请重试。');
      }
      loadingPhoneAnchor = undefined;
      phoneLease = acquired; phoneAnchor = anchor; mountedPhoneApi = api;
      model.externalPhoneAvailable = true; model.externalPhoneOpen = true;
      model.phoneStatus = 'ready'; model.phoneError = ''; model.notice = '';
      model.phoneSource = phoneRuntime?.source() ?? 'extension';
      host.setAttribute('aria-owns', 'sttts-panel');
      acquired.focus();
    } catch (error) {
      if (acquired && acquired !== phoneLease) {
        try { acquired.release?.(); } catch { /* Keep recovery independent. */ }
      }
      closePhone(); model.phoneStatus = 'error'; model.phoneError = message(error); model.notice = message(error);
    }
  }
  const actions: ShellActions = {
    dispatch(action) {
      if (dead || model.busy) return;
      try {
        const next = reduceState(snapshot(), action);
        bridge.save(next);
        model.state = next;
        model.notice = '';
        if (storyPhone) void storyPhone.sync().catch(() => {});
      } catch (error) { model.notice = message(error); }
    },
    async send(text) {
      const trimmed = text.trim();
      if (dead || model.busy || !trimmed) return;
      if (trimmed.length > 2000) { model.notice = '行动请控制在 2000 字以内。'; return; }
      const request = ++epoch;
      model.busy = true; model.notice = '';
      try {
        const reply = await bridge.generate(trimmed, snapshot());
        if (!stillCurrent(request)) return;
        // Read receipts may have arrived while generation was in flight. Merge
        // the validated turn into the latest state, then save before delivery.
        const next = commitStoryTurn(snapshot(), trimmed, reply, { userId: storyId(), assistantId: storyId() });
        bridge.save(next);
        model.state = next;
        if (storyPhone) void storyPhone.sync().catch(() => {});
      } catch (error) {
        if (stillCurrent(request)) model.notice = message(error);
      } finally {
        if (stillCurrent(request)) model.busy = false;
      }
    },
    exit: () => dispose(),
    switchChat: () => dispose('已退出沉浸模式，请在酒馆原生界面选择聊天，再点“进入未读之城”。'),
    openPhone(anchor) {
      if (dead) return;
      const api = phoneApi();
      if (!api && !phoneRuntime) {
        model.externalPhoneAvailable = false;
        model.phoneStatus = 'error'; model.phoneError = '小手机尚未连接，请重新进入后重试。';
        model.notice = model.phoneError;
        return;
      }
      if (!anchor?.isConnected || anchor.ownerDocument !== doc || !shadow.contains(anchor)) {
        model.notice = '手机区域尚未准备好，请重新打开手机面板。';
        return;
      }
      if (phoneLease && phoneAnchor === anchor && mountedPhoneApi === api) {
        try { phoneLease.sync(); } catch (error) { closePhone(); model.notice = message(error); }
        return;
      }
      if (loadingPhoneAnchor === anchor && model.phoneStatus === 'loading') return;
      closePhone();
      const sequence = ++phoneSequence;
      if (api) { acquirePhone(api, anchor, sequence); return; }
      loadingPhoneAnchor = anchor;
      model.phoneStatus = 'loading'; model.phoneError = ''; model.notice = '';
      void phoneRuntime!.ensure().then(loaded => acquirePhone(loaded, anchor, sequence)).catch(error => {
        if (dead || sequence !== phoneSequence) return;
        loadingPhoneAnchor = undefined;
        model.phoneStatus = 'error'; model.phoneError = message(error);
      });
    },
    closePhone,
    async openPhoneContact(npcId) {
      if (!storyPhone || dead) return;
      const sequence = phoneSequence;
      try { await storyPhone.openContact(npcId, () => !dead && sequence === phoneSequence && model.externalPhoneOpen); }
      catch (error) { if (!dead && sequence === phoneSequence) model.notice = message(error); }
    },
    retryPhoneSync() {
      if (dead || !storyPhone) return;
      try {
        bridge.save(snapshot());
        void storyPhone.sync().catch(() => {});
      } catch (error) { model.phoneLinkStatus = 'error'; model.phoneLinkError = message(error); }
    },
    setDismissHandler(handler) { dismissOverlay = handler; },
  };

  function keydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && !event.isComposing) {
      event.preventDefault(); event.stopPropagation();
      if (phoneLease) actions.closePhone();
      else if (!dismissOverlay?.()) dispose();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusables = [...shadow.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]')].filter(el => el.getClientRects().length);
    if (phoneLease) {
      const frame = doc.querySelector<HTMLIFrameElement>('#sttts-panel iframe');
      if (frame) focusables.push(frame);
    }
    focusables.push(rescue);
    const first = focusables[0]; const last = focusables.at(-1);
    const focused = shadow.activeElement ?? doc.activeElement;
    if (event.shiftKey && (focused === first || !focusables.includes(focused as HTMLElement))) {
      event.preventDefault(); last?.focus();
    } else if (!event.shiftKey && (focused === last || !focusables.includes(focused as HTMLElement))) {
      event.preventDefault(); first?.focus();
    }
  }
  function focusin(event: FocusEvent) {
    if (dead) return;
    const target = event.target as Node | null;
    if (target === host || host.contains(target) || target === rescue) return;
    if (phoneLease && doc.getElementById('sttts-panel')?.contains(target)) return;
    shadow.querySelector<HTMLElement>('button:not(:disabled)')?.focus({ preventScroll: true });
  }
  function pagehide() { dispose('角色脚本已关闭，已恢复原生界面。'); }
  function rescueClick() { dispose(); }
  function layoutRescue() {
    // SillyTavern may transform its zero-height html element. A fixed bottom
    // offset then uses that element instead of the visible viewport.
    const inset = hostWindow.innerWidth <= 760 ? 80 : 12;
    const height = Math.ceil(rescue.getBoundingClientRect().height) || 34;
    rescue.style.top = `${Math.max(8, hostWindow.innerHeight - inset - height)}px`;
    rescue.style.bottom = 'auto';
  }

  try {
    app = createApp(App, { model, actions });
    app.config.errorHandler = (error) => { console.error('[UnreadCity]', error); dispose('界面发生错误，已恢复酒馆。'); };
    doc.body.append(host, rescue);
    doc.body.style.setProperty('overflow', 'hidden', 'important');
    appliedOverflowPriority = doc.body.style.getPropertyPriority('overflow');
    doc.addEventListener('keydown', keydown, true);
    doc.addEventListener('focusin', focusin, true);
    ownerWindow.addEventListener('pagehide', pagehide);
    hostWindow.addEventListener('resize', layoutRescue);
    layoutRescue();
    rescue.addEventListener('click', rescueClick);
    stopSession = bridge.onSessionChange(() => dispose('聊天已切换，已恢复原生界面。'));
    const integrity = () => {
      const api = phoneApi();
      model.externalPhoneAvailable = !!api;
      model.phoneSource = phoneRuntime?.source() ?? (api ? 'extension' : 'none');
      if (phoneLease && (mountedPhoneApi !== api || !phoneAnchor?.isConnected)) closePhone();
      if (!host.isConnected || !rescue.isConnected || (ownerFrame && !ownerFrame.isConnected)) {
        dispose('界面或角色脚本已卸载，已恢复酒馆。');
      } else if (bridge.session() !== session) dispose('聊天已切换，已恢复原生界面。');
    };
    observer = new (hostWindow as Window & typeof globalThis).MutationObserver(integrity);
    observer.observe(doc.body, { childList: true, subtree: false });
    timer = hostWindow.setInterval(integrity, 500);
    app.mount(mount);
    if (dead) throw new Error('界面启动失败，已恢复原生界面。');
    if (bridge.kind === 'tavern' && phoneRuntime) {
      storyPhone = createStoryPhoneLink({
        hostWindow, session, ensurePhone: () => phoneRuntime.ensure(),
        isCurrent: () => !dead && bridge.session() === session,
        state: snapshot,
        accept(receipt) {
          const known = new Set(model.state.contacts.map(contact => contact.id));
          model.phoneUnread = receipt.unreadTotal;
          model.phoneContactUnread = receipt.contacts.filter(contact => known.has(contact.npcId)).map(({ npcId, unread }) => ({ npcId, unread }));
          if (model.state.phone.some(item => !item.read && receipt.receipts.includes(item.id))) {
            const acknowledged = model.state.phone.filter(item => receipt.receipts.includes(item.id)).map(item => item.id);
            const next = acknowledgePhoneRead(snapshot(), acknowledged);
            bridge.save(next); model.state = next;
          }
        },
        status(status, error = '') { model.phoneLinkStatus = status; model.phoneLinkError = error; },
      });
      // Materialize a new world's initial messages before the phone sees them.
      // A failed save leaves its outbox untouched and offers an explicit retry.
      actions.retryPhoneSync();
    }
    shadow.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
    return { dispose, model, actions };
  } catch (error) {
    dispose('界面启动失败，已恢复原生界面。');
    throw error;
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : '操作未完成，请退出并重新进入。';
}
