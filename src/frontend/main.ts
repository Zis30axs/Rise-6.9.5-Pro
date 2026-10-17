import { mountShell, type ShellHandle } from './lifecycle';
import { createTavernBridge } from '../runtime/bridge';
import { createDemoHost } from './demo';
import { createPhoneRuntime } from './phone-runtime';

const ENTRY = '进入未读之城';
const RESTORE = '恢复原生界面';
type HostWindow = Window & { __unreadCityShell?: { open(): void; dispose(): void } };
type HelperWindow = Window & {
  eventOn?: (event: string, callback: () => void) => unknown;
  eventRemoveListener?: (event: string, callback: () => void) => void;
  getButtonEvent?: (name: string) => string;
};

function bootstrap() {
  const owner = window as HelperWindow;
  let host: HostWindow;
  try { host = window.parent as HostWindow; void host.document.body; }
  catch { console.error('[UnreadCity] 无法访问同源酒馆宿主，保留原生界面。'); return; }
  const demo = owner === host && host.document.documentElement.hasAttribute('data-unread-city-demo')
    ? createDemoHost() : null;
  let shell: ShellHandle | undefined;
  let shutDown = false;
  let launchSequence = 0;
  const ownerFrame = owner === host ? null : owner.frameElement;
  let feedbackNode: HTMLElement | undefined;
  let feedbackTimer: number | undefined;
  host.__unreadCityShell?.dispose();
  const phoneRuntime = demo ? undefined : createPhoneRuntime(host, owner);

  function clearFeedback() {
    feedbackNode?.remove(); feedbackNode = undefined;
    if (feedbackTimer !== undefined) host.clearTimeout(feedbackTimer);
    feedbackTimer = undefined;
  }

  function feedback(text: string) {
    clearFeedback();
    if (demo) {
      const target = host.document.getElementById('unread-city-feedback');
      if (target) target.textContent = text;
    } else if (text) {
      // A short native notification; no card text or model output is interpreted as HTML.
      const note = host.document.createElement('div');
      note.setAttribute('role', 'status');
      note.textContent = text;
      note.style.cssText = 'position:fixed;right:16px;bottom:24px;z-index:2147483646;max-width:360px;padding:14px;border:1px solid #b7b6a5;background:#fff8e6;color:#263c39;font:14px system-ui;white-space:pre-wrap;';
      host.document.body.append(note);
      feedbackNode = note;
      feedbackTimer = host.setTimeout(clearFeedback, 7000);
    }
  }

  function open() {
    if (shutDown || shell) return;
    clearFeedback();
    const sequence = ++launchSequence;
    let bridge;
    try {
      bridge = demo ? demo.createBridge() : createTavernBridge(owner);
      if (!bridge) { feedback('未检测到兼容的 Tavern-Helper 或单人聊天。请先安装助手并打开角色聊天；原生界面保持可用。'); return; }
      let exitedDuringMount = false;
      const mounted = mountShell(host, owner, bridge, reason => {
        exitedDuringMount = true;
        // Invalidate any reference immediately even on synchronous Vue mount failure.
        if (sequence === launchSequence) shell = undefined;
        if (ownerFrame && !ownerFrame.isConnected) shutdown();
        else if (!shutDown) feedback(reason);
      }, phoneRuntime);
      if (!exitedDuringMount) shell = mounted;
    } catch (error) {
      bridge?.dispose();
      shell = undefined;
      feedback(error instanceof Error ? error.message : '启动失败，已恢复原生界面。');
    }
  }
  const restore = () => { shell?.dispose(); shell = undefined; };
  const removers: (() => void)[] = [];
  if (!demo && owner.eventOn && owner.getButtonEvent && owner.eventRemoveListener) {
    for (const [name, callback] of [[ENTRY, open], [RESTORE, restore]] as const) {
      const event = owner.getButtonEvent(name);
      owner.eventOn(event, callback);
      removers.push(() => owner.eventRemoveListener?.(event, callback));
    }
  }
  function shutdown() {
    if (shutDown) return;
    shutDown = true;
    restore();
    void phoneRuntime?.dispose().catch(error => console.error('[UnreadCity] phone disposal', error));
    clearFeedback();
    for (const remove of removers) remove();
    owner.removeEventListener('pagehide', shutdown);
    if (host.__unreadCityShell?.dispose === shutdown) delete host.__unreadCityShell;
  }
  host.__unreadCityShell = { open, dispose: shutdown };
  owner.addEventListener('pagehide', shutdown);

  if (demo) {
    const doc = host.document;
    const enter = doc.getElementById('enter-city');
    enter?.addEventListener('click', open);
    removers.push(() => enter?.removeEventListener('click', open));
    const select = doc.getElementById('demo-chat') as HTMLSelectElement;
    const switchChat = () => {
      demo.switchChat(select.value);
      const label = doc.getElementById('demo-session');
      if (label) label.textContent = `当前：演示聊天 ${select.value === 'demo-a' ? 'A' : 'B'}`;
    };
    select.addEventListener('change', switchChat);
    removers.push(() => select.removeEventListener('change', switchChat));
    const toggle = () => { select.value = demo.current() === 'demo-a' ? 'demo-b' : 'demo-a'; switchChat(); };
    const switchButton = doc.getElementById('demo-switch');
    switchButton?.addEventListener('click', toggle);
    removers.push(() => switchButton?.removeEventListener('click', toggle));
    const fail = () => { demo.failNext(); feedback('下一次行动将模拟失败，进度保持不变。'); };
    const failButton = doc.getElementById('demo-failure');
    failButton?.addEventListener('click', fail);
    removers.push(() => failButton?.removeEventListener('click', fail));
  }
  // User enables a character script first; then it may mount only after validation.
  open();
}

bootstrap();
