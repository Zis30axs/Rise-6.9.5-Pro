import { bandInvitationForMessage, applyBandReply } from '../runtime/livehouse';
import { activeProtagonist, gameMinute, protagonistNames } from '../runtime/protagonist-world';
import { createProtagonistSwitchController } from './protagonist-switch';
import { createWorldPhoneApi } from './world-phone';
import { applyNpcPhoneReply, npcReplySource } from '../runtime/npc-phone';
import { applyPhoneReply } from '../runtime/protagonist-world';
import { applySocialInvitationReply } from '../runtime/natural-interactions';
import { appendPhoneReplyScene } from '../runtime/phone-scene';
import { createApp, reactive, toRaw, type App as VueApp } from 'vue';
import App from './App.vue';
import css from './shell.css?inline';
import { acknowledgePhoneRead, commitStoryTurn, parseState, reduceState } from '../runtime/model';
import { editStoryEntry as editSavedStoryEntry } from '../runtime/story-editor';
import type { Bridge, ShellActions, ShellModel, WorldAction, WorldState } from './types';
import type { PhoneLease, PhonePanelHost, PhoneRuntime } from './phone-runtime';
import { spatialPhoneLease } from './phone-spatial';
import { createStoryPhoneLink, type StoryPhoneLink } from './story-phone';
import { validateContactProfileDraft } from '../runtime/characters';
import { hasInteractionEffect, interactionLabel, INTERACTION_DURATION_MS, INTERACTION_EVENT_PROBABILITY, isGameplayInteraction, mergeInteractionReceipts } from './interaction-controller';
import { canCheckInteractionEvent, recordInteractionEventCheck } from '../runtime/interaction-event-rate';
import { stageAutonomousSms, applyAutonomousSms } from '../runtime/autonomous-sms';
import { affinityContactLine } from '../runtime/affinity-tiers';
import { dismissMargoCafeOffer, getMargoCafeOffer, stageMargoCafeOffer, type MargoCafeOffer } from '../runtime/margo-cafe';

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
  const model = reactive<ShellModel>({ mode: bridge.kind, memoryScope: session, state, busy: false, interaction: null, notice: '', connection: bridge.label, externalPhoneAvailable: !!phoneApi(), externalPhoneOpen: false, phoneStatus: phoneApi() ? 'ready' : 'idle', phoneError: '', phoneSource: phoneRuntime?.source() ?? (phoneApi() ? 'extension' : 'none'), phoneLinkStatus: 'idle', phoneLinkError: '', phoneUnread: 0, phoneContactUnread: [] });
  let app: VueApp | undefined;
  let dead = false;
  let epoch = 0;
  let stopSession: (() => void) | undefined;
  let timer: number | undefined;
  let airTrafficTimer: number | undefined;
  let smsTimer: number | undefined;
  let smsWorking = false;
  // A completed model decision is retained through failed writes. Retrying local
  // persistence must not repeatedly spend a model call or change the proposed SMS.
  let smsResult: { id: string; text: string | null } | undefined;
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
    cafeOffer?: MargoCafeOffer;
    timer?: number;
    working: boolean;
    resolve(result: boolean): void;
  }
  let pendingInteraction: PendingInteraction | undefined;

  function dispose(reason = '已恢复原生界面。') {
    if (dead) return;
    dead = true; epoch++;
    const cleanups = [
      () => protagonistSwitch.release(),
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
      () => smsTimer !== undefined && hostWindow.clearInterval(smsTimer),
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
  function saveWithSms(next: WorldState): WorldState {
    const prepared = stageAutonomousSms(snapshot(), next);
    bridge.save(prepared);
    model.state = prepared;
    return prepared;
  }
  /** Never compete with the main generation. A persisted reservation survives busy turns. */
  async function tickAutonomousSms() {
    if (smsWorking || dead || doc.hidden || model.busy || model.switchingProtagonist || pendingInteraction || bridge.session() !== session) return;
    const initial = snapshot();
    const task = initial.autonomousSms?.pending;
    if (!task) { smsResult = undefined; return; }
    if (task.at !== gameMinute(initial) || task.owner !== activeProtagonist(initial)) {
      smsResult = undefined;
      try {
        const retired = stageAutonomousSms(initial, initial);
        bridge.save(retired); model.state = retired;
      } catch { /* Retry only local retirement, never generate from stale context. */ }
      return;
    }
    if (smsResult?.id !== task.id) smsResult = undefined;
    smsWorking = true;
    const request = ++epoch;
    // Keep the main UI responsive. A player generation preempts this request.
    // If a completed decision cannot be saved, later ticks only retry the write.
    try {
      if (!smsResult) {
        try {
          const reply = await bridge.generate('', snapshot(), { kind: 'autonomous_sms', ticketId: task.id });
          if (!stillCurrent(request) || doc.hidden) return;
          if (reply.text || reply.phoneMessages.length || reply.worldActions?.length || reply.worldEvents?.length || reply.contactRequests?.length || reply.weeklySummary || reply.bandDecision || reply.phoneDecision ||
              reply.autonomousSmsText !== null && typeof reply.autonomousSmsText !== 'string') throw new Error('主动短信子任务包含了额外内容');
          smsResult = { id: task.id, text: reply.autonomousSmsText };
        } catch {
          // A failed background call is silent. Persist its completed decision so
          // a broken provider cannot trap the player in automatic model retries.
          if (!stillCurrent(request) || doc.hidden) return;
          smsResult = { id: task.id, text: null };
        }
      }
      if (!stillCurrent(request) || doc.hidden) return;
      const current = snapshot();
      // Game-time advancement and protagonist switches can retire the ticket
      // while the low-priority request is in flight. Never apply it to a new one.
      if (current.autonomousSms?.pending?.id !== task.id) { smsResult = undefined; return; }
      const next = applyAutonomousSms(current, task.id, smsResult.text);
      bridge.save(next);
      model.state = next;
      smsResult = undefined;
      worldPhone.notify();
      if (storyPhone) void storyPhone.sync().catch(() => {});
    } catch {
      // No inbox, notification or canonical thread is published before the write.
      // Keep the decision cached until a later tick can save it successfully.
    } finally {
      smsWorking = false;
    }
  }
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
    model.interaction = { phase: 'error', label: pending.label, progress: 75, error: errorText, detail: pending.cafeOffer?.preview };
    model.notice = errorText;
  }
  function publishInteraction(pending: PendingInteraction, next: WorldState) {
    if (!currentInteraction(pending)) return;
    saveWithSms(next);
    clearInteractionTimer(pending);
    pendingInteraction = undefined;
    model.interaction = null; model.busy = false; model.notice = '';
    pending.resolve(true);
    worldPhone.notify();
    if (storyPhone) void storyPhone.sync().catch(() => {});
  }
  async function resolveInteraction(accept: boolean) {
    const pending = pendingInteraction;
    if (!pending || pending.working || !currentInteraction(pending)) return;
    pending.working = true; model.notice = '';
    try {
      if (!accept) {
        const next = dismissMargoCafeOffer(mergeInteractionReceipts(pending.prepared, pending.original, snapshot()));
        publishInteraction(pending, next);
        return;
      }
      if (pending.cafeOffer) {
        pending.eventState ??= reduceState(mergeInteractionReceipts(pending.prepared, pending.original, snapshot()), { type: 'receive_cafe_gift', offerId: pending.cafeOffer.id });
        publishInteraction(pending, mergeInteractionReceipts(pending.eventState, pending.original, snapshot()));
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
    if (dead || model.busy || model.switchingProtagonist || doc.hidden || bridge.session() !== session) return false;
    if (!isGameplayInteraction(action)) return false;
    let original: WorldState; let prepared: WorldState;
    let hasEvent = false;
    let cafeOffer: MargoCafeOffer | undefined;
    try {
      original = snapshot();
      // All duration and study rolls happen once, before any visible progress.
      prepared = reduceState(original, action);
      if (canCheckInteractionEvent(prepared, action)) {
        hasEvent = Math.random() < INTERACTION_EVENT_PROBABILITY;
        prepared = recordInteractionEventCheck(prepared, action, hasEvent);
        if (hasEvent) {
          cafeOffer = getMargoCafeOffer(prepared, action) ?? undefined;
          if (cafeOffer) prepared = stageMargoCafeOffer(prepared, cafeOffer);
        }
      }
    } catch (error) { model.notice = message(error); return false; }
    model.busy = true; model.notice = '';
    const label = interactionLabel(action);
    model.interaction = { phase: 'progress', label, progress: 0 };
    return new Promise<boolean>(resolve => {
      const pending: PendingInteraction = { request: ++epoch, action: { ...action }, label, original, prepared, cafeOffer, working: true, resolve };
      pendingInteraction = pending;
      const startedAt = Date.now();
      pending.timer = hostWindow.setInterval(() => {
        if (!currentInteraction(pending)) { cancelInteraction(); return; }
        const elapsed = Math.min(1, (Date.now() - startedAt) / INTERACTION_DURATION_MS);
        if (model.interaction) model.interaction.progress = Math.round(elapsed * (hasEvent ? 75 : 100));
        if (elapsed < 1) return;
        clearInteractionTimer(pending);
        pending.working = false;
        if (hasEvent) model.interaction = { phase: 'choice', label, progress: 75, detail: cafeOffer?.preview };
        else void resolveInteraction(false);
      }, 40);
    });
  }
  function visibilitychange() {
    if (!doc.hidden) return;
    // A foreground request may have preempted the SMS before its promise
    // settled. Never cancel or reset an unrelated player generation.
    if (smsWorking && !model.busy) {
      epoch++;
      try { bridge.cancel(); } catch { /* Keep the saved reservation for later. */ }
    }
    protagonistSwitch.release();
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
    if (dead || model.busy || model.switchingProtagonist || doc.hidden || !host.isConnected || bridge.session() !== session) return;
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
      acquired = spatialPhoneLease(acquired, hostWindow, anchor, activeProtagonist(model.state));
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
  function bindStoryPhone(alreadySaved = false) {
    storyPhone?.dispose(); storyPhone = undefined;
    model.phoneUnread = 0; model.phoneContactUnread = [];
    if (bridge.kind === 'tavern' && phoneRuntime) {
      const deviceOwner = activeProtagonist(model.state);
      storyPhone = createStoryPhoneLink({
        hostWindow, session: session!, ensurePhone: () => phoneRuntime.ensure(),
        isCurrent: () => !dead && bridge.session() === session && activeProtagonist(model.state) === deviceOwner,
        state: snapshot,
        async saveContact(raw) {
          if (dead || bridge.session() !== session || model.busy || model.switchingProtagonist || doc.hidden || !model.externalPhoneOpen) throw new Error('请在手机人物编辑页中保存，或等当前行动结束后重试。');
          const draft = validateContactProfileDraft(raw);
          const id = draft.id ?? draft.sourcePersonId ?? `person-${storyId()}`;
          const next = reduceState(snapshot(), { ...draft, id, type: 'save_contact' });
          bridge.save(next); model.state = next; model.notice = '';
          const contact = next.contacts.find(contact => contact.id === id)!;
          return { id: contact.id, name: contact.name, description: `${contact.tag}\n${contact.summary}\n${contact.status}\n${affinityContactLine(contact.affinity, contact.relationNote)}`,
            summary: contact.summary, portraitId: contact.portraitId, sourcePersonId: contact.sourcePersonId, isMain: contact.isMain };
        },
        async generateIntroduction(raw) {
          if (dead || bridge.session() !== session || model.busy || model.switchingProtagonist || doc.hidden || !model.externalPhoneOpen) throw new Error('请在手机人物编辑页中确认生成简介，或等当前行动结束后重试。');
          const draft = validateContactProfileDraft(raw);
          const request = ++epoch;
          const sequence = phoneSequence;
          profileRequest = request; model.busy = true; model.notice = '';
          try {
            const reply = await bridge.generate('请根据此人的既有出场记录生成简短人物介绍。', snapshot(), { kind: 'contact_introduction',
              contact: { ...draft, sourcePersonId: draft.sourcePersonId ?? null } });
            if (!stillCurrent(request) || sequence !== phoneSequence || !model.externalPhoneOpen) throw new Error('人物编辑已关闭，简介未写入。');
            if (reply.text.length > 500 || reply.phoneMessages.length || reply.worldActions?.length || reply.worldEvents?.length || reply.contactRequests?.length) throw new Error('人物简介包含无效内容，请重试。');
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
      if (alreadySaved) void storyPhone.sync().catch(() => {});
      else actions.retryPhoneSync();
    }
  }

  /** A bounded turn: one DM reply or at most three saved group decisions. */
  let activePhoneReply: string | null = null;
  let phoneSceneJumpToken = 0;
  async function requestPhoneReply(messageId: string): Promise<void> {
    if (dead || doc.hidden || bridge.session() !== session) throw new Error('请在当前游戏聊天中重试短信回复');
    if (model.busy || model.switchingProtagonist || activePhoneReply) throw new Error('上一项剧情、短信回复或角色切换仍在处理');
    const saved = snapshot();
    const npc = messageId.startsWith('npc:');
    const invitation = bandInvitationForMessage(saved, messageId);
    if (invitation && invitation.status !== 'pending') return;
    if (npc) {
      if (npcReplySource(saved, messageId).status !== 'pending') return;
    } else {
      const source = saved.protagonists?.conversations?.find(row=>row.id===messageId);
      if (!source || !source.expectsReply || source.from !== activeProtagonist(saved)) throw new Error('短信回复来源与当前主角不一致');
      if (saved.protagonists?.conversations?.some(row=>row.replyTo===messageId)) return;
    }
    const request=++epoch;
    activePhoneReply=messageId; model.busy=true; model.notice='';
    try {
      for (let step=0;step<(npc?3:1);step++) {
        if (!stillCurrent(request)) return;
        const current=snapshot(), source=npc?npcReplySource(current,messageId):null;
        if(source && source.status!=='pending') break;
        const actorId=source?.responderId ?? undefined;
        const reply=await bridge.generate('请根据收到的短信和当前人物资料回复对方。',current,{kind:invitation?'band_invitation_reply':npc?'npc_phone_reply':'phone_reply',messageId});
        if (!stillCurrent(request)) return;
        // Commit every decision before asking the next group member, so a
        // partial failure resumes without replaying any completed messages.
        if (reply.phoneMessages.length || reply.worldActions?.length || reply.worldEvents?.length || reply.contactRequests?.length) throw new Error('短信回复包含了额外行动');
        const replied=invitation ? applyBandReply(snapshot(),messageId,reply.text,reply.bandDecision!) : npc ? applyNpcPhoneReply(snapshot(),messageId,reply.phoneDecision === 'silence' ? null : reply.text,actorId) : applyPhoneReply(snapshot(),messageId,reply.text);
        const answered=applySocialInvitationReply(replied,messageId,reply.inviteDecision,reply.phoneDecision === 'silence' ? null : reply.text,reply.inviteAgenda);
        // The SMS and its optional off-screen novel share a single persisted
        // snapshot. A failed scene validation never publishes a partial reply.
        const savedReplyId = npc
          ? answered.protagonists?.npcPhone?.messages.find(row => row.replyTo === messageId && row.speakerId === actorId)?.id
          : answered.protagonists?.conversations?.find(row => row.replyTo === messageId)?.id;
        if (reply.phoneSceneText && (!savedReplyId || invitation || reply.phoneDecision === 'silence'))
          throw new Error('短信后的小说必须对应一条真实回复。');
        const next=reply.phoneSceneText ? appendPhoneReplyScene(answered, savedReplyId!, reply.phoneSceneText) : answered;
        bridge.save(next);
        model.state=next;
        worldPhone.notify();
        if (storyPhone) void storyPhone.sync().catch(()=>{});
      }
    } catch(error) {
      if(stillCurrent(request)) model.notice=`短信回复请求失败，原短信已保存；可在手机中手动重试：${message(error)}`;
      throw error;
    } finally {
      if(activePhoneReply===messageId) activePhoneReply=null;
      if(stillCurrent(request)) model.busy=false;
    }
  }

  const worldPhone = createWorldPhoneApi({
    session, current: () => !dead && bridge.session() === session,
    busy: () => model.busy || !!model.switchingProtagonist || doc.hidden, state: snapshot,
    requestReply: requestPhoneReply,
    openStory(id, viewpoint) { model.phoneSceneJump = { id, viewpoint, token: ++phoneSceneJumpToken }; },
    commit(action) {
      if (model.switchingProtagonist) throw new Error('正在切换主角，请稍候。');
      const next = saveWithSms(reduceState(snapshot(), action));
      worldPhone.notify();
      if (storyPhone) void storyPhone.sync().catch(() => {});
      return next;
    },
  });
  const phoneGlobal = hostWindow as Window & { __unreadCityWorldPhone?: typeof worldPhone };
  phoneGlobal.__unreadCityWorldPhone = worldPhone;

  const protagonistSwitch = createProtagonistSwitchController({
    state: snapshot,
    current: () => !dead && !doc.hidden && bridge.session() === session,
    blocked: () => !!pendingInteraction,
    pending(value) { model.switchingProtagonist = value; },
    cancelWork() {
      epoch++;
      try { bridge.cancel(); } catch { /* Late work is already invalidated. */ }
      activePhoneReply = null;
      closePhone();
      model.busy = false;
      model.notice = '';
    },
    commit(target) {
      let next: WorldState;
      try {
        next = reduceState(snapshot(), { type: 'switch_protagonist', target });
        next = saveWithSms(next);
      } catch (error) { model.notice = message(error); return false; }
      model.notice = `已切换到${protagonistNames[target]}，可在状态页回顾这段时间的日常。`;
      try { worldPhone.notify(); bindStoryPhone(true); }
      catch (error) { model.phoneLinkStatus = 'error'; model.phoneLinkError = message(error); }
      return true;
    },
  });

  const actions: ShellActions = {
    beginProtagonistSwitch(target) {
      try { return protagonistSwitch.begin(target); }
      catch (error) { model.notice = message(error); return null; }
    },
    interact,
    resolveInteraction,
    cancelInteraction,
    dispatch(action) {
      if (dead || doc.hidden || model.switchingProtagonist) return;
      if (action.type === 'switch_protagonist') {
        const lease = actions.beginProtagonistSwitch?.(action.target);
        if (lease) { try { lease.commit(); } finally { lease.release(); } }
        return;
      }
      if (model.busy) return;
      try {
        const next = reduceState(snapshot(), action);
        saveWithSms(next);
        worldPhone.notify();
        model.notice = '';
        if (storyPhone && action.type !== 'walk' && action.type !== 'interior_walk' && action.type !== 'encounter') void storyPhone.sync().catch(() => {});
      } catch (error) { model.notice = message(error); }
    },
    async send(text, mode = 'story') {
      const trimmed = text.trim();
      if (dead || model.busy || model.switchingProtagonist || !trimmed) return;
      if (trimmed.length > 2000) { model.notice = '行动请控制在 2000 字以内。'; return; }
      const request = ++epoch;
      model.busy = true; model.notice = '';
      try {
        const reply = await bridge.generate(trimmed, snapshot());
        if (!stillCurrent(request)) return;
        // Read receipts may have arrived while generation was in flight. Merge
        // the validated turn into the latest state, then save before delivery.
        // The courtroom result was already settled by law_case. Its optional
        // character scene may narrate the evidence but never re-book money,
        // time, contact actions, off-screen events, SMS or any other side effect.
        const safeReply = mode === 'law_narration'
          ? { text: reply.text, phoneMessages: [], worldChronicleReceipt: reply.worldChronicleReceipt }
          : reply;
        const next = commitStoryTurn(snapshot(), trimmed, safeReply, { userId: storyId(), assistantId: storyId() });
        saveWithSms(next);
        worldPhone.notify();
        if (storyPhone) void storyPhone.sync().catch(() => {});
      } catch (error) {
        if (stillCurrent(request)) model.notice = message(error);
      } finally {
        if (stillCurrent(request)) model.busy = false;
      }
    },
    editStoryEntry(entryId, expectedText, revisedText) {
      if (dead || doc.hidden || model.busy || model.switchingProtagonist ||
        pendingInteraction || smsWorking || activePhoneReply || bridge.session() !== session) {
        model.notice = '当前有未完成的剧情或后台操作，暂时不能编辑，请稍后重试。';
        return false;
      }
      try {
        const current = snapshot();
        const edited = editSavedStoryEntry(current, entryId, expectedText, revisedText);
        if (edited !== current) {
          // Save the edited transcript directly. Do not stage SMS, advance time,
          // rerun narrative actions or regenerate the original assistant reply.
          const validated = parseState(edited);
          bridge.save(validated);
          model.state = validated;
        }
        model.notice = '消息已修改。以前发生的行动和其他记录保持不变。';
        return true;
      } catch (error) {
        model.notice = message(error);
        return false;
      }
    },
    exit: () => dispose(),
    switchChat: () => dispose('已退出沉浸模式，请在酒馆原生界面选择聊天，再点“进入未读之城”。'),
    openPhone(anchor) {
      if (dead || model.switchingProtagonist) return;
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
      if (!storyPhone || dead || model.switchingProtagonist) return;
      const sequence = phoneSequence;
      try { await storyPhone.openContact(npcId, () => !dead && sequence === phoneSequence && model.externalPhoneOpen); }
      catch (error) { if (!dead && sequence === phoneSequence) model.notice = message(error); }
    },
    async openPhoneContactEditor(sourcePersonId) {
      if (!storyPhone || dead || model.busy || model.switchingProtagonist) return;
      const sequence = phoneSequence;
      try {
        const existing = sourcePersonId ? model.state.contacts.find(contact => contact.id === sourcePersonId || contact.sourcePersonId === sourcePersonId) : undefined;
        await storyPhone.openContactEditor(existing ? { npcId: existing.id } : sourcePersonId ? { sourcePersonId } : {},
          () => !dead && sequence === phoneSequence && model.externalPhoneOpen);
      } catch (error) { if (!dead && sequence === phoneSequence) model.notice = message(error); }
    },
    retryPhoneSync() {
      if (dead || !storyPhone || model.switchingProtagonist) return;
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
    const focusables = [...shadow.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]')].filter(el => el.getClientRects().length && !el.closest('[inert]'));
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
    smsTimer = hostWindow.setInterval(() => { void tickAutonomousSms(); }, 1200);
    app.mount(mount);
    if (dead) throw new Error('界面启动失败，已恢复原生界面。');
    bindStoryPhone();
    // Pending SMS remain stored until the player explicitly requests a reply.
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



