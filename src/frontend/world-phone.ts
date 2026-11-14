import { livehousePhoneView } from '../runtime/livehouse';
import { npcPhoneView } from '../runtime/npc-phone';
import type { WorldAction, WorldState } from './types';
import { smsReadReceipt } from '../runtime/phone-sms';
import { phoneSceneId, PHONE_SCENE_PREFIX } from '../runtime/phone-scene';
import { activeProtagonist, defaultPhoneAppearance, enableProtagonists, gameMinute, otherProtagonist, otherProtagonists, personState, phoneAccess, protagonistNames, type PhoneCommand } from '../runtime/protagonist-world';
import { locations } from '../runtime/model';
import { gameCalendar, gameDayFromISO, registrationNotice } from '../runtime/game-calendar';
import { resolveWeather, weatherNarrative } from '../runtime/weather';
import { storeCatalog } from '../runtime/convenience-store';
import type { ProtagonistId } from '../runtime/dual-protagonists';
import { allNetworkAccounts, guestAccount, networkLegacyAliases, networkOwnerId, resolveNetworkAccount } from '../runtime/network-identities';
import { pendingWorldChronicle } from '../runtime/world-chronicle';
import { canTradeStocks, stockAccount, STOCK_CALENDAR_LOCATION, stockName } from '../runtime/stock-world';

/** Capability for the embedded phone only. Never exposes the other person's save wholesale. */
export function createWorldPhoneApi(options: {
  session: string; current(): boolean; busy(): boolean; state(): WorldState;
  presentation?(): 'novel' | 'scene';
  commit(action: Extract<WorldAction, {type:'phone_app'|'wait'}>): WorldState;
  requestReply?(messageId: string): Promise<void>;
  openStory?(id: string, viewpoint: string): void;
}) {
  const view = (s: WorldState, owner = activeProtagonist(s)) => {
    const enabled = enableProtagonists(s), p = enabled.protagonists!, active = activeProtagonist(enabled);
    const person = personState(enabled, owner), d = p.devices[owner];
    const now = gameMinute(enabled);
    const dual = p.conversations ?? [];
    const social = npcPhoneView(enabled, owner);
    const savedScenes = new Set(person.story.filter(row => row.role === 'assistant' && row.id.startsWith(PHONE_SCENE_PREFIX)).map(row => row.id));
    const phoneScenes = [
      ...dual.filter(row => row.to === owner && row.replyTo !== null).map(row => row.id),
      ...social.messages.filter(row => row.direction === 'incoming' && row.replyTo !== null).map(row => row.id),
    ].flatMap(messageId => {
      const storyId = phoneSceneId(messageId);
      return savedScenes.has(storyId) ? [{ messageId, storyId }] : [];
    });
    const readByRecipient = (id: string, recipient: ProtagonistId) =>
      personState(enabled, recipient).phone.some(row => row.id === id && row.read);
    return JSON.parse(JSON.stringify({
      binding: JSON.stringify([options.session, active]), revision: p.revision,
      active, owner, presentation:options.presentation?.()??'novel', name: protagonistNames[owner], now: gameMinute(s), clock: s.clock,
      calendarDate: gameCalendar(s.clock.day), weather: weatherNarrative(resolveWeather(s)), reporting: registrationNotice(s.clock.day),
      deviceId: p.accounts.people[owner].deviceId, appearance: d.appearance ?? defaultPhoneAppearance(owner),
      locationId: person.locationId, theme: p.accounts.people[owner].theme,
      cards: p.accounts.people[owner].cards, ledger: p.accounts.ledger.filter(e=>e.actor===owner).slice(-60),
      calendar: d.calendar, dailyPlans: person.schedule, notifications: d.notifications,
      locked: d.locked, share: d.share,
      music: livehousePhoneView(enabled, owner),
      npcPhone: { ...social, messages: social.messages.map(m => ({ ...m,
        receipt: m.direction === 'outgoing' ? smsReadReceipt(m.at, now, m.status === 'answered') : 'received',
      })) },
      // Only the active protagonist's lived context is visible to the NPC peek LLM.
      peekContext: owner === active ? {
        recentStory: person.story.filter(row => !row.id.startsWith(PHONE_SCENE_PREFIX)).slice(-8).map(row => ({role:row.role,text:row.text.slice(0,450)})),
        recentJournal: person.journal.slice(-12).map(row => ({text:row.text.slice(0,240)})),
      } : null,
      orders: p.orders.filter(o=>o.owner===owner), messages: person.phone, phoneScenes,
      conversation: dual.filter(m=>m.from===owner||m.to===owner).map(m=>({
        ...m, direction: m.from===owner?'outgoing':'incoming',
        answered: m.expectsReply && dual.some(reply=>reply.replyTo===m.id),
        receipt: m.from===owner ? smsReadReceipt(m.at, now,
          dual.some(reply=>reply.replyTo===m.id), readByRecipient(m.id,m.to)) : 'received',
      })),
      audit: p.accounts.phoneAccess.filter(e=>e.owner===owner).slice(-30),
      catalog: storeCatalog.map(({id,name,price,category,purchaseUnit})=>({id,name,price,category,purchaseUnit})),
      destinations: locations.map(({id,name})=>({id,name})),
      other: {id:otherProtagonist(active),name:protagonistNames[otherProtagonist(active)],...phoneAccess(enabled,otherProtagonist(active))},
      others: otherProtagonists(active).map(id => ({id, name: protagonistNames[id], ...phoneAccess(enabled, id)})),
    }));
  };
  const listeners=new Set<() => void>();
  let stockShortcut: { owner: ProtagonistId; code: string } | undefined;
  // An open inspection can refresh without repeatedly writing audit/journal entries.
  // Its capability is local to this phone session; access is checked on every read.
  const inspections = new Set<string>();
  return Object.freeze({
    stock() {
      if (!options.current()) throw Error('剧情手机连接已结束');
      if (options.presentation?.()==='scene') throw Error('请在纯小说模式打开东都证券');
      const s = options.state(), owner = activeProtagonist(s);
      return JSON.parse(JSON.stringify({
        binding: JSON.stringify([options.session, owner]), phoneRevision: s.protagonists?.revision ?? 0,
        owner, state: stockAccount(s,owner), canTrade: canTradeStocks(s,owner),
        cards: s.protagonists?.accounts.people[owner].cards ?? {},
      })) as {
        binding: string; phoneRevision: number; owner: ProtagonistId; state: ReturnType<typeof stockAccount>;
        canTrade: boolean; cards: Partial<Record<import('../runtime/dual-protagonists').FictionalCardId,number>>;
      };
    },
    queueStockShortcut(code: string) {
      if (!options.current() || !stockName(code)) return;
      stockShortcut = { owner: activeProtagonist(options.state()), code };
    },
    clearStockShortcut() { stockShortcut = undefined; },
    takeStockShortcut() {
      const pending=stockShortcut; stockShortcut=undefined;
      return options.current() && pending?.owner===activeProtagonist(options.state()) ? pending.code : null;
    },
    async scheduleStock(raw: {binding:string;requestId:string;code:string;date:string;time:string;duration:number}) {
      if (!options.current() || options.busy()) throw Error('请等待当前行动结束后再操作手机');
      const s=options.state(), owner=activeProtagonist(s), name=stockName(raw?.code);
      if (raw?.binding!==JSON.stringify([options.session,owner]) || !name) throw Error('主角或聊天已切换');
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(raw.time)) throw Error('请选择有效时间');
      const [hour,minute]=raw.time.split(':').map(Number);
      options.commit({type:'phone_app',requestId:raw.requestId,owner,command:{
        type:'calendar_save',id:raw.requestId,title:`回顾${name}行情`,locationId:STOCK_CALENDAR_LOCATION,
        stockCode:raw.code,start:(gameDayFromISO(raw.date)-1)*1440+hour*60+minute,duration:raw.duration,
      }});
      return this.stock();
    },
    networkIdentity(label: string) {
      if (!options.current()) throw Error('剧情手机连接已结束');
      const saved = allNetworkAccounts(options.state().protagonists?.internet);
      const known = resolveNetworkAccount(label) || saved.find(a => a.id === label || a.nickname === label || '@' + a.username === label);
      if (known) return {...known};
      // Historical 'me' had no ownership field. Never attribute it to the current viewpoint.
      if (label === 'me') return {...guestAccount('旧账号'), id:'legacy:me', username:'archived', email:'archived@post.sov'};
      try { return guestAccount(label); } catch { return null; }
    },
    /** Public-network capability: deliberately excludes private story, SMS, schedules and identities' real names from prompts. */
    network() {
      if (!options.current()) throw Error('剧情手机连接已结束');
      const s = options.state(), active = activeProtagonist(s);
      return {
        binding: JSON.stringify([options.session, active]), ownerId: networkOwnerId(active),
        space: 'unread-city:network:' + options.session,
        accounts: allNetworkAccounts(s.protagonists?.internet).map(a => ({...a})),
        legacyAliases: networkLegacyAliases(),
        follows: (s.protagonists?.internet?.follows ?? []).map(pair => [...pair]),
        publicFacts: [
          {id: 'calendar', text: gameCalendar(s.clock.day).iso},
          {id: 'weather', text: weatherNarrative(resolveWeather(s))},
          // Reuse the existing publication gates without consuming the story's receipt.
          ...(pendingWorldChronicle({clock: s.clock})?.events ?? []).map(e => ({id: 'chronicle:' + e.id, text: `${e.availableAtGMT8}：${e.title}。${e.fact}`})),
        ],
      };
    },
    subscribe(callback: () => void) { listeners.add(callback); return () => { listeners.delete(callback); }; },
    notify() { for(const listener of [...listeners]) { try { listener(); } catch { /* A detached phone view cannot stop world state saves. */ } } },
    read() { if(!options.current()) throw Error('剧情手机连接已结束');return view(options.state()); },
    readInspected(raw: {binding:string;owner:ProtagonistId}) {
      if (!options.current()) throw Error('剧情手机连接已结束');
      const s = options.state();
      if (!raw || raw.binding !== JSON.stringify([options.session, activeProtagonist(s)]) ||
          !inspections.has(JSON.stringify([raw.binding,raw.owner]))) throw Error('请重新拿起这台手机');
      const access = phoneAccess(s,raw.owner);
      if (!access.read) throw Error(access.reason);
      return view(s,raw.owner);
    },
    async act(raw: {binding:string;revision:number;requestId:string;owner:ProtagonistId;command:PhoneCommand}) {
      if(!options.current()||options.busy()) throw Error('请等待当前行动结束后再操作手机');
      const s=options.state();
      if(!raw||raw.binding!==JSON.stringify([options.session,activeProtagonist(s)])) throw Error('主角或聊天已经切换，请重新打开应用');
      if(raw.revision!==(s.protagonists?.revision??0)&&!s.protagonists?.operations.some(o=>o.id===raw.requestId)) throw Error('手机状态已更新，请刷新后重试');
      if (raw.command.type === 'inspect') {
        const access = phoneAccess(s,raw.owner);
        if (!access.read) throw Error(access.reason);
      }
      // Saving a bubble never sends an LLM request. The player can type multiple
      // consecutive messages before explicitly choosing to request a reply.
      const next=options.commit({type:'phone_app',requestId:raw.requestId,owner:raw.owner,command:raw.command});
      if (raw.command.type === 'inspect') inspections.add(JSON.stringify([raw.binding,raw.owner]));
      return view(next,raw.owner);
    },
    /** Advance actual game time; the saved clock controls delivery/read projection. */
    async waitForRead(raw: {binding:string;revision:number;now:number;minutes:number}) {
      if (!options.current() || options.busy()) throw Error('请等待当前行动结束后再推进游戏时间');
      const state = options.state();
      if (!raw || raw.binding !== JSON.stringify([options.session,activeProtagonist(state)]))
        throw Error('主角或聊天已经切换，请重新打开应用');
      if (raw.revision !== (state.protagonists?.revision ?? 0) || raw.now !== gameMinute(state))
        throw Error('游戏时间或手机状态已更新，请刷新后重试');
      if (!Number.isInteger(raw.minutes) || raw.minutes < 1 || raw.minutes > 120)
        throw Error('等待时间必须在 1–120 分钟内');
      const next=options.commit({type:'wait',minutes:raw.minutes});
      return view(next);
    },
    returnToStory(raw: {binding: string; storyId: string}) {
      if (!options.current() || options.busy()) throw Error('请等待当前操作完成后再返回正文');
      const state = options.state(), owner = activeProtagonist(state);
      if (!raw || raw.binding !== JSON.stringify([options.session, owner])) throw Error('主角或聊天已经切换，请重新打开应用');
      const saved = new Set(state.story.filter(row => row.role === 'assistant').map(row => row.id));
      const messages = [
        ...(state.protagonists?.conversations ?? []).filter(row => row.to === owner && row.replyTo !== null),
        ...(state.protagonists?.npcPhone?.messages ?? []).filter(row => row.owner === owner && row.direction === 'incoming' && row.replyTo !== null),
      ];
      const reply = typeof raw.storyId === 'string' ? messages.find(row => phoneSceneId(row.id) === raw.storyId) : undefined;
      if (!reply || !saved.has(raw.storyId)) throw Error('这段视角记录已不可查看');
      if (!options.openStory) throw Error('当前界面无法打开视角记录');
      const viewpoint = 'from' in reply ? protagonistNames[reply.from] :
        npcPhoneView(state, owner).messages.find(row => row.id === reply.id)?.speakerName ?? '对方';
      options.openStory(raw.storyId, viewpoint);
    },
    async retryReply(messageId: string) {
      if(!options.current()||options.busy()) throw Error('请等待当前行动结束后重试回复');
      if(!options.requestReply) throw Error('自动短信回复暂不可用');
      await options.requestReply(messageId);
      return view(options.state());
    },
  });
}



