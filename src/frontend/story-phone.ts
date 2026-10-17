import type { WorldState } from './types';

export interface StoryPhoneContact { id: string; name: string; description: string }
export interface StoryPhoneSnapshot {
  sessionId: string;
  unreadTotal: number;
  contacts: { npcId: string; threadId: string; name: string; unread: number }[];
  receipts: string[];
}
export interface StoryPhoneLease {
  sync(data: { contacts: StoryPhoneContact[]; messages: WorldState['phone'] }): Promise<StoryPhoneSnapshot>;
  snapshot(): Promise<StoryPhoneSnapshot>;
  subscribe(listener: (snapshot: StoryPhoneSnapshot) => void): () => void;
  openContact(npcId: string): Promise<void>;
  release(): void;
}
export interface StoryPhoneHost {
  bind(data: { sessionId: string; chatId: string; label: string; contacts: StoryPhoneContact[] }): Promise<StoryPhoneLease>;
}
export interface StoryPhoneLink {
  sync(): Promise<void>;
  openContact(npcId: string, visible?: () => boolean): Promise<void>;
  dispose(): void;
}

const contactsOf = (state: WorldState): StoryPhoneContact[] => state.contacts.map(contact => ({
  id: contact.id, name: contact.name, description: `${contact.tag}\n${contact.summary}\n${contact.status}`,
}));

/** A serial outbox, scoped to one saved Tavern chat. The phone owns contacts,
 * history and read receipts; this adapter never touches its storage directly. */
export function createStoryPhoneLink(options: {
  hostWindow: Window;
  session: string;
  ensurePhone(): Promise<unknown>;
  isCurrent(): boolean;
  state(): WorldState;
  accept(snapshot: StoryPhoneSnapshot): void;
  status(status: 'loading' | 'ready' | 'error', error?: string): void;
}): StoryPhoneLink {
  let dead = false;
  let lease: StoryPhoneLease | undefined;
  let unsubscribe: (() => void) | undefined;
  let sessionId = '';
  let queued = false;
  let running: Promise<void> | undefined;
  const current = () => !dead && options.isCurrent();
  const assertCurrent = () => { if (!current()) throw new Error('聊天已切换，手机同步已停止。'); };
  const accept = (snapshot: StoryPhoneSnapshot) => {
    if (!current() || snapshot.sessionId !== sessionId) return;
    if (!Number.isSafeInteger(snapshot.unreadTotal) || snapshot.unreadTotal < 0 ||
        !Array.isArray(snapshot.receipts) || !snapshot.receipts.every(id => typeof id === 'string') ||
        !Array.isArray(snapshot.contacts)) throw new Error('手机返回的联动状态无效。');
    options.accept(snapshot);
  };
  async function connect() {
    if (lease) return lease;
    await options.ensurePhone(); assertCurrent();
    const api = (options.hostWindow as Window & { STiPhonieStoryHost?: StoryPhoneHost }).STiPhonieStoryHost;
    if (typeof api?.bind !== 'function') throw new Error('当前手机尚不支持剧情联动。请停用旧的独立手机插件，再刷新并进入本卡；已有手机数据会保留。');
    const tuple: unknown = JSON.parse(options.session);
    if (!Array.isArray(tuple) || tuple.length !== 2 || tuple.some(value => typeof value !== 'string' || !value)) throw new Error('无法识别当前剧情存档。');
    const bytes = new TextEncoder().encode(options.session);
    if (!options.hostWindow.crypto?.subtle) throw new Error('当前环境缺少安全摘要能力，无法绑定剧情手机空间。');
    sessionId = [...new Uint8Array(await options.hostWindow.crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join('');
    assertCurrent();
    const acquired = await api.bind({ sessionId, chatId: tuple[1] as string, label: '未读之城', contacts: contactsOf(options.state()) });
    if (!current()) { acquired.release(); assertCurrent(); }
    lease = acquired;
    unsubscribe = acquired.subscribe(snapshot => {
      try { accept(snapshot); }
      catch (error) { if (current()) options.status('error', error instanceof Error ? error.message : '已读状态暂未保存，请重试同步。'); }
    });
    return acquired;
  }
  function sync(): Promise<void> {
    if (!current()) return Promise.resolve();
    queued = true;
    if (!running) {
      running = (async () => {
        options.status('loading');
        try {
          while (queued && current()) {
            queued = false;
            const active = await connect(); assertCurrent();
            const state = options.state();
            const result = await active.sync({ contacts: contactsOf(state), messages: state.phone });
            assertCurrent(); accept(result);
          }
          if (current()) options.status('ready');
        } catch (error) {
          if (current()) options.status('error', error instanceof Error ? error.message : '剧情消息暂未同步，请重试。');
          throw error;
        } finally { running = undefined; }
      })();
    }
    return running;
  }
  return {
    sync,
    async openContact(npcId, visible = () => true) {
      await sync(); assertCurrent();
      if (!visible()) return;
      if (!options.state().contacts.some(contact => contact.id === npcId)) throw new Error('找不到这个联系人。');
      await lease!.openContact(npcId); assertCurrent();
    },
    dispose() {
      dead = true; queued = false;
      try { unsubscribe?.(); } finally { unsubscribe = undefined; lease?.release(); lease = undefined; }
    },
  };
}
