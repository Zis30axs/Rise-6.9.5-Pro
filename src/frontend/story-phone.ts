import { activeProtagonist, protagonistNames } from '../runtime/protagonist-world';
import type { CharacterPortraitId, ContactProfileDraft, WorldState } from './types';
import { validateContactProfileDraft } from '../runtime/characters';
import { getScenePeople, SCENE_ENCOUNTER_DISTANCE } from '../runtime/scene-context';
import { characterForPerson } from './character-appearance';
import { novelNpcAtlases } from './novel-npc-atlases';

export interface StoryPhoneContact { id: string; name: string; description: string; portraitId?: CharacterPortraitId; summary?: string; sourcePersonId?: string | null; isMain?: boolean }
export interface StoryPhonePortrait { id: CharacterPortraitId; label: string; thumbnail?: string }
export interface StoryPhoneEditorRequest { sourcePersonId?: string; npcId?: string }
export interface StoryPhoneSnapshot {
  sessionId: string;
  unreadTotal: number;
  contacts: { npcId: string; threadId: string; name: string; unread: number }[];
  receipts: string[];
}
export interface StoryPhoneLease {
  sync(data: { contacts: StoryPhoneContact[]; messages: WorldState['phone']; candidates?: StoryPhoneContact[]; portraits?: StoryPhonePortrait[] }): Promise<StoryPhoneSnapshot>;
  snapshot(): Promise<StoryPhoneSnapshot>;
  subscribe(listener: (snapshot: StoryPhoneSnapshot) => void): () => void;
  openContact(npcId: string): Promise<void>;
  openContactEditor?(request: StoryPhoneEditorRequest): Promise<void>;
  release(): void;
}
export interface StoryPhoneHost {
  bind(data: { sessionId: string; chatId: string; label: string; contacts: StoryPhoneContact[]; candidates?: StoryPhoneContact[]; portraits?: StoryPhonePortrait[];
    onContactSave?(draft: ContactProfileDraft): Promise<StoryPhoneContact>;
    onGenerateIntroduction?(draft: ContactProfileDraft): Promise<string> }): Promise<StoryPhoneLease>;
}
export interface StoryPhoneLink {
  sync(): Promise<void>;
  openContact(npcId: string, visible?: () => boolean): Promise<void>;
  openContactEditor(request?: StoryPhoneEditorRequest, visible?: () => boolean): Promise<void>;
  dispose(): void;
}

const contactsOf = (state: WorldState): StoryPhoneContact[] => state.contacts.map(contact => ({
  id: contact.id, name: contact.name, description: `${contact.tag}\n${contact.summary}\n${contact.status}`,
  ...(contact.id.startsWith('protagonist-') ? {} : { portraitId: contact.portraitId }), summary: contact.summary.slice(0, 500), sourcePersonId: contact.sourcePersonId, isMain: contact.isMain,
}));

function candidatesOf(state: WorldState): StoryPhoneContact[] {
  if (!state.scene || state.interior) return [];
  const scene = state.scene;
  const met = new Set(state.story.flatMap(entry => entry.participantIds ?? []));
  return getScenePeople(scene, state.contacts).filter(person => !state.contacts.some(contact => contact.id === person.id || contact.sourcePersonId === person.id)
    && (person.id === scene.encounterId || met.has(person.id) || Math.hypot(person.x - scene.x, person.z - scene.z) <= SCENE_ENCOUNTER_DISTANCE))
    .map(person => ({ id: person.id, sourcePersonId: person.id, name: person.name, description: person.description,
      summary: '', portraitId: characterForPerson(person.id), isMain: false }));
}

/** Tiny previews are derived in memory from trusted embedded frames, never added to prompts. */
async function portraitChoices(host: Window): Promise<StoryPhonePortrait[]> {
  const ids: CharacterPortraitId[] = ['deepseek', 'xiaoyang', 'claude'];
  return Promise.all(ids.map(async (id, index) => {
    const choice: StoryPhonePortrait = { id, label: `形象${['一', '二', '三'][index]}` };
    const img = host.document.createElement('img');
    if (typeof img.decode !== 'function') return choice;
    try {
      img.src = novelNpcAtlases[id].source;
      await img.decode();
      const canvas = host.document.createElement('canvas'); canvas.width = 96; canvas.height = 176;
      const context = canvas.getContext('2d'); if (!context) return choice;
      const frame = novelNpcAtlases[id].frames.neutral;
      const ratio = Math.min(96 / frame.width, 176 / frame.height);
      const width = frame.width * ratio, height = frame.height * ratio;
      context.drawImage(img, frame.x, frame.y, frame.width, frame.height, (96 - width) / 2, 176 - height, width, height);
      choice.thumbnail = canvas.toDataURL('image/png');
    } catch { /* Text choices remain available if this browser cannot decode previews. */ }
    return choice;
  }));
}

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
  saveContact?(draft: ContactProfileDraft): Promise<StoryPhoneContact>;
  generateIntroduction?(draft: ContactProfileDraft): Promise<string>;
}): StoryPhoneLink {
  let dead = false;
  let lease: StoryPhoneLease | undefined;
  let unsubscribe: (() => void) | undefined;
  let sessionId = '';
  let queued = false;
  let running: Promise<void> | undefined;
  let portraits: StoryPhonePortrait[] = [];
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
    const deviceOwner = activeProtagonist(options.state());
    const bytes = new TextEncoder().encode(deviceOwner === 'soyo' ? options.session : JSON.stringify([...tuple, deviceOwner]));
    if (!options.hostWindow.crypto?.subtle) throw new Error('当前环境缺少安全摘要能力，无法绑定剧情手机空间。');
    sessionId = [...new Uint8Array(await options.hostWindow.crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join('');
    assertCurrent();
    portraits = await portraitChoices(options.hostWindow); assertCurrent();
    const acquired = await api.bind({ sessionId, chatId: tuple[1] as string, label: `未读之城 · ${protagonistNames[deviceOwner]}`, contacts: contactsOf(options.state()), candidates: candidatesOf(options.state()), portraits,
      ...(options.saveContact ? { onContactSave: async (raw: ContactProfileDraft) => {
        assertCurrent(); const draft = validateContactProfileDraft(raw);
        const result = await options.saveContact!(draft); assertCurrent(); return result;
      } } : {}),
      ...(options.generateIntroduction ? { onGenerateIntroduction: async (raw: ContactProfileDraft) => {
        assertCurrent(); const draft = validateContactProfileDraft(raw);
        const result = await options.generateIntroduction!(draft); assertCurrent(); return result;
      } } : {}),
    });
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
            const result = await active.sync({ contacts: contactsOf(state), messages: state.phone, candidates: candidatesOf(state), portraits });
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
    async openContactEditor(request = {}, visible = () => true) {
      await sync(); assertCurrent();
      if (!visible()) return;
      if (!lease?.openContactEditor) throw new Error('当前手机版本尚不支持人物建档，请使用新版内置手机后重试。');
      await lease.openContactEditor(request); assertCurrent();
    },
    dispose() {
      dead = true; queued = false;
      try { unsubscribe?.(); } finally { unsubscribe = undefined; lease?.release(); lease = undefined; }
    },
  };
}
