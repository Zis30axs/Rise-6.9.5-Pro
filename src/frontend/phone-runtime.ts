import { embeddedPhoneRuntimeSource } from './generated/embedded-phone';

export interface PhoneLease {
  release(): void;
  sync(): void;
  focus(): void;
}
export interface PhonePanelHost {
  mount(anchor: HTMLElement, options: { onClose(): void }): PhoneLease;
}
export type PhoneSource = 'none' | 'extension' | 'embedded';
export interface PhoneRuntime {
  available(): PhonePanelHost | null;
  ensure(): Promise<PhonePanelHost>;
  source(): PhoneSource;
  dispose(): Promise<void>;
}
interface EmbeddedRuntime {
  ready: Promise<PhonePanelHost>;
  dispose(): Promise<void>;
}
interface Installation {
  users: Set<symbol>;
  script: HTMLScriptElement;
  runtime?: EmbeddedRuntime;
  ready: Promise<PhonePanelHost>;
  api?: PhonePanelHost;
  disposal?: Promise<void>;
}
type PhoneWindow = Window & {
  STiPhoniePanelHost?: PhonePanelHost;
  __stIphoniePanelBridge?: { connect?: unknown };
  __unreadCityEmbeddedPhoneRuntime?: EmbeddedRuntime;
  __unreadCityPhoneInstallation?: Installation;
};
const usable = (api: unknown): api is PhonePanelHost => !!api && typeof (api as PhonePanelHost).mount === 'function';

/** Install only the trusted, build-time phone bundle, in the Tavern's own realm.
 * Existing extensions keep ownership. No settings, messages or credentials are
 * read into the bundle; the original phone owns its storage at runtime.
 */
export function createPhoneRuntime(hostWindow: Window, ownerWindow: Window): PhoneRuntime {
  const host = hostWindow as PhoneWindow;
  const token = Symbol('unread-city-phone-owner');
  let dead = false;
  let held: Installation | undefined;
  let pending: Promise<PhonePanelHost> | undefined;
  const stale = () => { if (dead) throw new Error('手机加载已取消。'); };

  function source(): PhoneSource {
    const record = host.__unreadCityPhoneInstallation;
    if (record?.api && record.api === host.STiPhoniePanelHost && !record.disposal) return 'embedded';
    return usable(host.STiPhoniePanelHost) && !record?.disposal ? 'extension' : 'none';
  }
  function available(): PhonePanelHost | null {
    if (dead || host.__unreadCityPhoneInstallation?.disposal) return null;
    const record = host.__unreadCityPhoneInstallation;
    // A bundled phone may publish its host just before all startup work settles.
    if (record && !record.api) return null;
    return usable(host.STiPhoniePanelHost) ? host.STiPhoniePanelHost : null;
  }
  function release(record: Installation): Promise<void> {
    record.users.delete(token);
    if (held === record) held = undefined;
    if (record.users.size) return Promise.resolve();
    if (record.disposal) return record.disposal;
    record.disposal = (async () => {
      try { await record.runtime?.dispose(); }
      finally {
        record.script.remove();
        if (host.__unreadCityEmbeddedPhoneRuntime === record.runtime) delete host.__unreadCityEmbeddedPhoneRuntime;
        if (host.__unreadCityPhoneInstallation === record) delete host.__unreadCityPhoneInstallation;
      }
    })();
    return record.disposal;
  }
  async function load(): Promise<PhonePanelHost> {
    stale();
    let record = host.__unreadCityPhoneInstallation;
    while (record?.disposal) {
      await record.disposal;
      stale();
      // Another owner may already have installed the next generation while we
      // were waiting. Join its owner set instead of creating a second record.
      record = host.__unreadCityPhoneInstallation;
    }
    if (!record && usable(host.STiPhoniePanelHost)) return host.STiPhoniePanelHost;
    if (!record) {
      if (typeof host.__stIphoniePanelBridge?.connect === 'function') {
        throw new Error('另一份独立手机正在运行。请先在扩展设置停用它，再重新打开内置手机；已有手机数据会保留。');
      }
      const script = host.document.createElement('script');
      script.setAttribute('data-unread-city-embedded-phone', '');
      // Static local build output only. Never concatenate runtime/user text here.
      script.textContent = embeddedPhoneRuntimeSource;
      let resolve!: (api: PhonePanelHost) => void;
      let reject!: (error: unknown) => void;
      record = { users: new Set(), script, ready: new Promise((yes, no) => { resolve = yes; reject = no; }) };
      host.__unreadCityPhoneInstallation = record;
      try {
        host.document.head.append(script);
        const runtime = host.__unreadCityEmbeddedPhoneRuntime;
        if (!runtime || typeof runtime.dispose !== 'function' || !runtime.ready?.then) {
          throw new Error('内置手机脚本未能执行，请检查酒馆助手脚本权限后重试。');
        }
        record.runtime = runtime;
        const current = record;
        Promise.resolve(runtime.ready).then(api => {
          if (!usable(api)) throw new Error('内置手机未完成启动，请重试。');
          current.api = api; resolve(api);
        }).catch(reject);
      } catch (error) { reject(error); }
    }
    record.users.add(token); held = record;
    try { const api = await record.ready; stale(); return api; }
    catch (error) { await release(record); throw error; }
  }
  const ensure = () => {
    if (!pending) pending = load().finally(() => { pending = undefined; });
    return pending;
  };
  async function dispose() {
    dead = true;
    ownerWindow.removeEventListener('pagehide', pagehide);
    if (held) await release(held);
  }
  const pagehide = () => { void dispose().catch(error => console.error('[UnreadCity] phone disposal', error)); };
  ownerWindow.addEventListener('pagehide', pagehide);
  return { available, ensure, source, dispose };
}
