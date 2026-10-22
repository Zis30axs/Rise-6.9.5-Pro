import { activeProtagonist, protagonistNames } from '../runtime/protagonist-world';
import { createWorldPhoneApi } from './world-phone';
import { applyPhoneReply } from '../runtime/protagonist-world';
import { createApp, reactive, toRaw, type App as VueApp } from 'vue';
import App from './App.vue';
import css from './shell.css?inline';
import { acknowledgePhoneRead, commitStoryTurn, parseState, reduceState } from '../runtime/model';
import type { Bridge, ShellActions, ShellModel, WorldAction, WorldState } from './types';
import type { PhoneLease, PhonePanelHost, PhoneRuntime } from './phone-runtime';
import { createStoryPhoneLink, type StoryPhoneLink } from './story-phone';
import { validateContactProfileDraft } from '../runtime/characters';
import { hasInteractionEffect, interactionLabel, INTERACTION_DURATION_MS, INTERACTION_EVENT_PROBABILITY, isGameplayInteraction, mergeInteractionReceipts } from './interaction-controller';

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


  const phoneApi = () => {
    if (phoneRuntime) return phoneRuntime.available();
    const api = (hostWindow as PhoneWindow).STiPhoniePanelHost;
    return typeof api?.mount === 'function' ? api : null;
  };
  const model = reactive<ShellModel>({ mode: bridge.kind, state, busy: false, interaction: null, notice: '', connection: bridge.label, externalPhoneAvailable: !!phoneApi(), externalPhoneOpen: false, phoneStatus: phoneApi() ? 'ready' : 'idle', phoneError: '', phoneSource: phoneRuntime?.source() ?? (phoneApi() ? 'extension' : 'none'), phoneLinkStatus: 'idle', phoneLinkError: '', phoneUnread: 0, phoneContactUnread: [] });
  let app: VueApp | undefined;
  let dead = false;
  let epoch = 0;
  let stopSession: (() => void) | undefined;
  let timer: number | undefined;
  let airTrafficTimer: number | undefined;
  let observer: MutationObserver | undefined;
  let appliedOverflowPriority: string | undefined;
  let phoneLease: PhoneLease | undefined;
  let phoneAnchor: HTMLElement | undefined;
  let loadingPhoneAnchor: HTMLElement | undefined;
  let mountedPhoneApi: PhonePanelHost | undefined;
  let phoneSequence = 0;
  let dismissOverlay: (() => boolean) | undefined;
  let storyPhone: StoryPhoneLink | undefined;
  let profileRequest: number | undefined;
  const storyIdPrefix = `story-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  let storySequence = 0;
  const storyId = () => globalThis.crypto?.randomUUID?.() ?? `${storyIdPrefix}-${++storySequence}`;
  interface PendingInteraction {
    request: number;
    action: WorldAction;
    label: string;
    original: WorldState;
    prepared: WorldState;
    eventState?: WorldState;
    eventIds?: { userId: string; assistantId: string };
    timer?: number;
    working: boolean;
    resolve(result: boolean): void;
  }
  let pendingInteraction: PendingInteraction | undefined;

  function dispose(reason = '已恢复原生界面。') {
    if (dead) return;
    dead = true; epoch++;
    const cleanups = [
      () => cancelInteraction(),
      () => closePhone(),
      () => storyPhone?.dispose(),
      () => { if (phoneGlobal.__unreadCityWorldPhone === worldPhone) delete phoneGlobal.__unreadCityWorldPhone; },
      () => { dismissOverlay = undefined; },
      () => stopSession?.(),
      () => bridge.cancel(),
      () => bridge.dispose(),
      () => app?.unmount(),
      () => observer?.disconnect(),
      () => timer !== undefined && hostWindow.clearInterval(timer),
      () => airTrafficTimer !== undefined && hostWindow.clearInterval(airTrafficTimer),
      () => doc.removeEventListener('keydown', keydown, true),
      () => doc.removeEventListener('focusin', focusin, true),
      () => doc.removeEventListener('visibilitychange', visibilitychange),
      () => ownerWindow.removeEventListener('pagehide', pagehide),
      () => host.remove(),
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
  const currentInteraction = (pending: PendingInteraction) => pendingInteraction === pending && stillCurrent(pending.request) && !doc.hidden;
  function clearInteractionTimer(pending: PendingInteraction) {
    if (pending.timer !== undefined) hostWindow.clearInterval(pending.timer);
    pending.timer = undefined;
  }
  function cancelInteraction() {
    const pending = pendingInteraction;
    if (!pending) return;
    pendingInteraction = undefined;
    clearInteractionTimer(pending);
    epoch++;
    if (model.interaction?.phase === 'generating') {
      try { bridge.cancel(); } catch { /* Recovery must not depend on generation cancellation. */ }
    }
    model.interaction = null; model.busy = false;
    pending.resolve(false);
  }
  function interactionFailure(pending: PendingInteraction, error: unknown) {
    if (!currentInteraction(pending)) return;
    clearInteractionTimer(pending);
    pending.working = false;
    const errorText = message(error);
    model.interaction = { phase: 'error', label: pending.label, progress: 75, error: errorText };
    model.notice = errorText;
  }
  function publishInteraction(pending: PendingInteraction, next: WorldState) {
    if (!currentInteraction(pending)) return;
    bridge.save(next);
    model.state = next;
    clearInteractionTimer(pending);
    pendingInteraction = undefined;
    model.interaction = null; model.busy = false; model.notice = '';
    pending.resolve(true);
    if (storyPhone) void storyPhone.sync().catch(() => {});
  }
  async function resolveInteraction(accept: boolean) {
    const pending = pendingInteraction;
    if (!pending || pending.working || !currentInteraction(pending)) return;
    pending.working = true; model.notice = '';
    try {
      if (!accept) {
        const next = mergeInteractionReceipts(pending.prepared, pending.original, snapshot());
        publishInteraction(pending, next);
        return;
      }
      model.interaction = { phase: 'generating', label: pending.label, progress: 80 };
      pending.timer = hostWindow.setInterval(() => {
        if (!currentInteraction(pending)) { cancelInteraction(); return; }
        if (model.interaction?.phase === 'generating') model.interaction.progress = Math.min(95, model.interaction.progress + .7);
      }, 100);
      if (!pending.eventState) {
        const eventInput = `在“${pending.label}”的过程中，我决定继续查看那件不寻常的事。请生成这次突发事件及其实际影响。`;
        const prepared = mergeInteractionReceipts(pending.prepared, pending.original, snapshot());
        const reply = await bridge.generate(eventInput, prepared, { kind: 'interaction_event', interaction: { label: pending.label, action: pending.action } });
        if (!currentInteraction(pending)) return;
        if (!reply.worldActions?.length) throw new Error('突发事件尚未产生实际影响，请重试或正常完成原互动。');
        const currentPrepared = mergeInteractionReceipts(pending.prepared, pending.original, snapshot());
        pending.eventIds ??= { userId: storyId(), assistantId: storyId() };
        const candidate = commitStoryTurn(currentPrepared, eventInput, reply, pending.eventIds);
        if (!hasInteractionEffect(currentPrepared, candidate)) throw new Error('突发事件尚未产生实际影响，请重试或正常完成原互动。');
        // Keep a valid result through save retries so random event actions and
        // paid generation are not performed again after a failed write.
        pending.eventState = candidate;
      }
      const next = mergeInteractionReceipts(pending.eventState, pending.original, snapshot());
      publishInteraction(pending, next);
    } catch (error) { interactionFailure(pending, error); }
  }
  async function interact(action: WorldAction): Promise<boolean> {
    if (dead || model.busy || doc.hidden || bridge.session() !== session) return false;
    if (!isGameplayInteraction(action)) return false;
    let original: WorldState; let prepared: WorldState;
    try {
      original = snapshot();
      // All duration and study rolls happen once, before any visible progress.
      prepared = reduceState(original, action);
    } catch (error) { model.notice = message(error); return false; }
    const hasEvent = Math.random() < INTERACTION_EVENT_PROBABILITY;
    model.busy = true; model.notice = '';
    const label = interactionLabel(action);
    model.interaction = { phase: 'progress', label, progress: 0 };
    return new Promise<boolean>(resolve => {
      const pending: PendingInteraction = { request: ++epoch, action: { ...action }, label, original, prepared, working: true, resolve };
      pendingInteraction = pending;
      const startedAt = Date.now();
      pending.timer = hostWindow.setInterval(() => {
        if (!currentInteraction(pending)) { cancelInteraction(); return; }
        const elapsed = Math.min(1, (Date.now() - startedAt) / INTERACTION_DURATION_MS);
        if (model.interaction) model.interaction.progress = Math.round(elapsed * (hasEvent ? 75 : 100));
        if (elapsed < 1) return;
        clearInteractionTimer(pending);
        pending.working = false;
        if (hasEvent) model.interaction = { phase: 'choice', label, progress: 75 };
        else void resolveInteraction(false);
      }, 40);
    });
  }
  function visibilitychange() {
    if (!doc.hidden) return;
    cancelInteraction();
    if (activePhoneReply) {
      // Phone work never keeps generating in a hidden or retired session.
      epoch++;
      try { bridge.cancel(); } catch { /* Preserve the saved question for retry. */ }
      activePhoneReply = null;
      model.busy = false;
      model.notice = '短信已保存，隐藏页面时停止了自动回复；重新打开短信后可重试。';
    }
  }
  function tickAirTraffic() {
    if (dead || model.busy || doc.hidden || !host.isConnected || bridge.session() !== session) return;
    try {
      const previous = snapshot();
      const next = reduceState(previous, { type: 'air_traffic_tick', now: Date.now() });
      if (JSON.stringify(next.airTraffic) === JSON.stringify(previous.airTraffic)) return;
      // An aircraft becomes visible only after its world event has been saved.
      bridge.save(next);
      model.state = next;
    } catch (error) { model.notice = message(error); }
  }
  function closePhone() {
    if (profileRequest !== undefined) {
      profileRequest = undefined; epoch++; model.busy = false;
      try { bridge.cancel(); } catch { /* Closing the form discards a late introduction. */ }
    }
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
  function bindStoryPhone() {
    storyPhone?.dispose(); storyPhone = undefined;
    model.phoneUnread = 0; model.phoneContactUnread = [];
    if (bridge.kind === 'tavern' && phoneRuntime) {
      const deviceOwner = activeProtagonist(model.state);
      storyPhone = createStoryPhoneLink({
        hostWindow, session: session!, ensurePhone: () => phoneRuntime.ensure(),
        isCurrent: () => !dead && bridge.session() === session && activeProtagonist(model.state) === deviceOwner,
        state: snapshot,
        async saveContact(raw) {
          if (dead || bridge.session() !== session || model.busy || doc.hidden || !model.externalPhoneOpen) throw new Error('请在手机人物编辑页中保存，或等当前行动结束后重试。');
          const draft = validateContactProfileDraft(raw);
          const id = draft.id ?? draft.sourcePersonId ?? `person-${storyId()}`;
          const next = reduceState(snapshot(), { ...draft, id, type: 'save_contact' });
          bridge.save(next); model.state = next; model.notice = '';
          const contact = next.contacts.find(contact => contact.id === id)!;
          return { id: contact.id, name: contact.name, description: `${contact.tag}\n${contact.summary}\n${contact.status}`,
            summary: contact.summary, portraitId: contact.portraitId, sourcePersonId: contact.sourcePersonId, isMain: contact.isMain };
        },
        async generateIntroduction(raw) {
          if (dead || bridge.session() !== session || model.busy || doc.hidden || !model.externalPhoneOpen) throw new Error('请在手机人物编辑页中确认生成简介，或等当前行动结束后重试。');
          const draft = validateContactProfileDraft(raw);
          const request = ++epoch;
          const sequence = phoneSequence;
          profileRequest = request; model.busy = true; model.notice = '';
          try {
            const reply = await bridge.generate('请根据此人的既有出场记录生成简短人物介绍。', snapshot(), { kind: 'contact_introduction',
              contact: { ...draft, sourcePersonId: draft.sourcePersonId ?? null } });
            if (!stillCurrent(request) || sequence !== phoneSequence || !model.externalPhoneOpen) throw new Error('人物编辑已关闭，简介未写入。');
            if (reply.text.length > 500 || reply.phoneMessages.length || reply.worldActions?.length || reply.worldEvents?.length) throw new Error('人物简介包含无效内容，请重试。');
            return reply.text;
          } finally {
            if (profileRequest === request) profileRequest = undefined;
            if (stillCurrent(request)) model.busy = false;
          }
        },
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
  }

  /** A single one-shot model call; never a permanently running NPC agent. */
  let activePhoneReply: string | null = null;
  async function requestPhoneReply(messageId: string): Promise<void> {
    if (dead || doc.hidden || bridge.session() !== session) throw new Error('请在当前游戏聊天中重试短信回复');
    if (model.busy || activePhoneReply) throw new Error('上一项剧情或短信回复仍在处理');
    const saved = snapshot();
    const source = saved.protagonists?.conversations?.find(row=>row.id===messageId);
    if (!source || !source.expectsReply || source.from !== activeProtagonist(saved)) throw new Error('短信回复来源与当前主角不一致');
    if (saved.protagonists?.conversations?.some(row=>row.replyTo===messageId)) return;
    const request=++epoch;
    activePhoneReply=messageId; model.busy=true; model.notice='';
    try {
      const reply=await bridge.generate('请根据收到的短信和当前人物资料回复对方。',saved,{kind:'phone_reply',messageId});
      if (!stillCurrent(request)) return;
      // Always validate and apply to the latest chat snapshot: only a canonical
      // reply is added. All read receipts, player moves and world facts survive.
      const next=applyPhoneReply(snapshot(),messageId,reply.text);
      bridge.save(next);
      model.state=next;
      worldPhone.notify();
      if (storyPhone) void storyPhone.sync().catch(()=>{});
    } catch(error) {
      if(stillCurrent(request)) model.notice=`自动短信回复失败，原短信已保存；可在手机中重试：${message(error)}`;
      throw error;
    } finally {
      if(activePhoneReply===messageId) activePhoneReply=null;
      if(stillCurrent(request)) model.busy=false;
    }
  }

  const worldPhone = createWorldPhoneApi({
    session, current: () => !dead && bridge.session() === session,
    busy: () => model.busy || doc.hidden, state: snapshot,
    onOutgoingMessage(messageId) { void requestPhoneReply(messageId).catch(()=>{}); },
    requestReply: requestPhoneReply,
    commit(action) {
      const next = reduceState(snapshot(), action); bridge.save(next); model.state = next;
      worldPhone.notify();
      if (storyPhone) void storyPhone.sync().catch(() => {});
      return next;
    },
  });
  const phoneGlobal = hostWindow as Window & { __unreadCityWorldPhone?: typeof worldPhone };
  phoneGlobal.__unreadCityWorldPhone = worldPhone;

  const actions: ShellActions = {
    interact,
    resolveInteraction,
    cancelInteraction,
    dispatch(action) {
      if (dead || (model.busy && action.type !== 'switch_protagonist') || doc.hidden) return;
      try {
        const next = reduceState(snapshot(), action);
        bridge.save(next);
        if (action.type === 'switch_protagonist') {
          epoch++; bridge.cancel(); cancelInteraction(); closePhone(); storyPhone?.dispose();
          model.busy = false;
        }
        model.state = next;
        worldPhone.notify();
        model.notice = action.type === 'switch_protagonist'
          ? `已切换到${protagonistNames[activeProtagonist(next)]}，可在状态页回顾这段时间的日常。` : '';
        if (action.type === 'switch_protagonist') bindStoryPhone();
        if (storyPhone && action.type !== 'walk' && action.type !== 'interior_walk' && action.type !== 'encounter') void storyPhone.sync().catch(() => {});
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
    async openPhoneContactEditor(sourcePersonId) {
      if (!storyPhone || dead || model.busy) return;
      const sequence = phoneSequence;
      try {
        const existing = sourcePersonId ? model.state.contacts.find(contact => contact.id === sourcePersonId || contact.sourcePersonId === sourcePersonId) : undefined;
        await storyPhone.openContactEditor(existing ? { npcId: existing.id } : sourcePersonId ? { sourcePersonId } : {},
          () => !dead && sequence === phoneSequence && model.externalPhoneOpen);
      } catch (error) { if (!dead && sequence === phoneSequence) model.notice = message(error); }
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
      else if (pendingInteraction) cancelInteraction();
      else if (!dismissOverlay?.()) dispose();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusables = [...shadow.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]')].filter(el => el.getClientRects().length);
    if (phoneLease) {
      const frame = doc.querySelector<HTMLIFrameElement>('#sttts-panel iframe');
      if (frame) focusables.push(frame);
    }
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
    if (target === host || host.contains(target)) return;
    if (phoneLease && doc.getElementById('sttts-panel')?.contains(target)) return;
    shadow.querySelector<HTMLElement>('button:not(:disabled)')?.focus({ preventScroll: true });
  }
  function pagehide() { dispose('角色脚本已关闭，已恢复原生界面。'); }

  try {
    app = createApp(App, { model, actions });
    app.config.errorHandler = (error) => { console.error('[UnreadCity]', error); dispose('界面发生错误，已恢复酒馆。'); };
    doc.body.append(host);
    doc.body.style.setProperty('overflow', 'hidden', 'important');
    appliedOverflowPriority = doc.body.style.getPropertyPriority('overflow');
    doc.addEventListener('keydown', keydown, true);
    doc.addEventListener('focusin', focusin, true);
    doc.addEventListener('visibilitychange', visibilitychange);
    ownerWindow.addEventListener('pagehide', pagehide);
    stopSession = bridge.onSessionChange(() => dispose('聊天已切换，已恢复原生界面。'));
    const integrity = () => {
      const api = phoneApi();
      model.externalPhoneAvailable = !!api;
      model.phoneSource = phoneRuntime?.source() ?? (api ? 'extension' : 'none');
      if (phoneLease && (mountedPhoneApi !== api || !phoneAnchor?.isConnected)) closePhone();
      if (!host.isConnected || (ownerFrame && !ownerFrame.isConnected)) {
        dispose('界面或角色脚本已卸载，已恢复酒馆。');
      } else if (bridge.session() !== session) dispose('聊天已切换，已恢复原生界面。');
    };
    observer = new (hostWindow as Window & typeof globalThis).MutationObserver(integrity);
    observer.observe(doc.body, { childList: true, subtree: false });
    timer = hostWindow.setInterval(integrity, 500);
    airTrafficTimer = hostWindow.setInterval(tickAirTraffic, 5000);
    app.mount(mount);
    if (dead) throw new Error('界面启动失败，已恢复原生界面。');
    bindStoryPhone();
    // A failed/aborted one-shot reply stays pending in the save and is resumed
    // on the next deliberate entry; never polls or spawns a background agent.
    const pendingReply = model.state.protagonists?.conversations?.find(row=>
      row.expectsReply && row.from===activeProtagonist(model.state) &&
      !model.state.protagonists!.conversations!.some(reply=>reply.replyTo===row.id));
    if (pendingReply && !doc.hidden) void requestPhoneReply(pendingReply.id).catch(()=>{});
    shadow.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
    return { dispose, model, actions };
  } catch (error) {
    dispose('界面启动失败，已恢复原生界面。');
    throw error;
  }
}

function message(error: unknown): string {
  // Helper functions run in the host page, so their errors cross an iframe realm.
  // Read only a bounded message; never serialize a provider response or stack.
  try {
    const value = typeof error === 'string' ? error
      : error && typeof error === 'object' && 'message' in error ? error.message : '';
    if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 600);
  } catch { /* A rejected value may expose a throwing message getter. */ }
  return '操作未完成，请退出并重新进入。';
}

