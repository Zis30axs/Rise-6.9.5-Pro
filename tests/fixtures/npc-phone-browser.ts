import { createPhoneRuntime } from '../../src/frontend/phone-runtime';
import { createWorldPhoneApi } from '../../src/frontend/world-phone';
import { createTavernBridge } from '../../src/runtime/bridge';
import { applyNpcPhoneReply, npcReplySource } from '../../src/runtime/npc-phone';
import { parseState, reduceState } from '../../src/runtime/model';
import { activeProtagonist } from '../../src/runtime/protagonist-world';
import { proposal } from '../npc-fixture';
import type { WorldState } from '../../src/frontend/types';
import type { StoryPhoneHost, StoryPhoneLease } from '../../src/frontend/story-phone';

// Real phone + production reducers/Bridge. The Tavern host and model are local
// fixtures; every network generation is denied by the Playwright test.
const host = window as Window & typeof globalThis & Record<string, any>;
let state = parseState(JSON.parse(localStorage.getItem('npc-fixture-world') ?? JSON.stringify(host.fixtureInitial)));
let busy = false, story: StoryPhoneLease | undefined;
const session = JSON.stringify(['npc-phone-fixture.png', 'npc-phone-world']);
const events = new Map<string, Set<(...args: unknown[]) => void>>();
const ctx = {
  characterId: 0, groupId: null, chatId: 'npc-phone-world', mainApi: 'openai', name1: '我', name2: 'NPC 手机测试',
  characters: [{ avatar: 'npc-phone-fixture.png', name: 'NPC 手机测试', data: {} }], groups: [], chat: [], chatMetadata: {},
  extensionSettings: {}, getCurrentChatId: () => ctx.chatId,
  eventSource: { on(name: string, fn: (...args: unknown[]) => void) { const set = events.get(name) ?? new Set(); set.add(fn); events.set(name, set); },
    removeListener(name: string, fn: (...args: unknown[]) => void) { events.get(name)?.delete(fn); } },
  eventTypes: Object.fromEntries(['CHAT_CHANGED','MESSAGE_RECEIVED','MESSAGE_SWIPED','MESSAGE_EDITED','MESSAGE_DELETED','CHARACTER_MESSAGE_RENDERED','GENERATION_AFTER_COMMANDS'].map(k => [k,k])),
  setExtensionPrompt() {}, updateMessageBlock() {}, messageFormatting: (text: string) => text, saveSettingsDebounced() {},
  getRequestHeaders: () => ({'Content-Type':'application/json'}), getThumbnailUrl: () => '',
  generateRaw: async () => { host.fixtureUnsafeCalls++; throw Error('测试禁止原手机模型调用'); },
  generateQuietPrompt: async () => { throw Error('测试禁止外部模型调用'); },
};
host.SillyTavern = { getContext: () => ctx };
host.toastr = {info() {},warning() {},error() {},success() {}};
host.tavern_events = { CHAT_CHANGED: 'helper-chat-change' };
host.getVariables = () => ({ unread_city: state, keep_me: 42 });
host.replaceVariables = (variables: {unread_city: WorldState}) => {
  if (host.fixtureFailSave) { host.fixtureFailSave = false; throw Error('测试保存失败'); }
  const next = parseState(variables.unread_city);
  localStorage.setItem('npc-fixture-world', JSON.stringify(next)); state = next;
};
host.eventOn = () => {};
host.eventRemoveListener = () => {};
host.stopGenerationById = () => true;
host.fixturePrompts = [];
host.fixtureUnsafeCalls = 0;
host.generate = async (config: {user_input: string}) => {
  host.fixturePrompts.push(config.user_input);
  const payload = JSON.parse(config.user_input.slice(config.user_input.indexOf('\n') + 1));
  return '<phone_reply>' + JSON.stringify({ messageId: payload.message.id, text: '收到，稍晚一点再聊。' }) + '</phone_reply>';
};
const bridge = createTavernBridge(window)!;
const contacts = () => state.contacts.map(c => ({id:c.id,name:c.name,description:c.summary}));
const sync = async () => { await story?.sync({contacts:contacts(),messages:state.phone}); };
async function requestReply(messageId: string) {
  busy = true;
  try {
    for (let step=0;step<3;step++) {
      const source=npcReplySource(state,messageId);
      if(source.status!=='pending') break;
      const actorId=source.responderId!;
      const reply = await bridge.generate('请回复此条短信。', state, {kind:'npc_phone_reply',messageId});
      const next = applyNpcPhoneReply(state, messageId, reply.phoneDecision === 'silence' ? null : reply.text,actorId);
      bridge.save(next); api.notify(); await sync();
    }
  } finally { busy = false; }
}
const api = createWorldPhoneApi({
  session, current: () => true, busy: () => busy, state: () => state,
  commit(action) { const next = reduceState(state, action); bridge.save(next); api.notify(); void sync(); return state; },
  onOutgoingMessage(id) { void requestReply(id).catch(e => { host.fixtureError = e.message; }); },
  requestReply,
});
host.__unreadCityWorldPhone = api;
host.fixtureState = () => parseState(state);
host.fixtureInvite = () => { bridge.save(proposal(state,'group','browser-invite').state); api.notify(); };
const runtime = createPhoneRuntime(window, window);
await runtime.ensure();
const storyHost = host.STiPhonieStoryHost as StoryPhoneHost;
const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(session + activeProtagonist(state)));
const sessionId = [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2,'0')).join('');
story = await storyHost.bind({ sessionId, chatId:ctx.chatId,label:'NPC 手机验证',contacts:contacts(),
  async onContactSave() { throw Error('本场景只测试已有联系人申请'); } });
await sync();
const slot = document.getElementById('phone-slot')!;
runtime.available()!.mount(slot, {onClose() {}});
host.fixtureOpenNativeContact = () => story!.openContact('majo-emma');
host.fixtureReady = true;
