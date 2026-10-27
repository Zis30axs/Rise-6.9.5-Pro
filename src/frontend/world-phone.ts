import { livehousePhoneView } from '../runtime/livehouse';
import { npcPhoneView } from '../runtime/npc-phone';
import type { WorldAction, WorldState } from './types';
import { smsReadReceipt } from '../runtime/phone-sms';
import { activeProtagonist, defaultPhoneAppearance, enableProtagonists, gameMinute, otherProtagonist, otherProtagonists, personState, phoneAccess, protagonistNames, type PhoneCommand } from '../runtime/protagonist-world';
import { locations } from '../runtime/model';
import { gameCalendar, registrationNotice } from '../runtime/game-calendar';
import { storeCatalog } from '../runtime/convenience-store';
import type { ProtagonistId } from '../runtime/dual-protagonists';

/** Capability for the embedded phone only. Never exposes the other person's save wholesale. */
export function createWorldPhoneApi(options: {
  session: string; current(): boolean; busy(): boolean; state(): WorldState;
  commit(action: Extract<WorldAction, {type:'phone_app'|'wait'}>): WorldState;
  requestReply?(messageId: string): Promise<void>;
}) {
  const view = (s: WorldState, owner = activeProtagonist(s)) => {
    const enabled = enableProtagonists(s), p = enabled.protagonists!, active = activeProtagonist(enabled);
    const person = personState(enabled, owner), d = p.devices[owner];
    const now = gameMinute(enabled);
    const dual = p.conversations ?? [];
    const social = npcPhoneView(enabled, owner);
    const readByRecipient = (id: string, recipient: ProtagonistId) =>
      personState(enabled, recipient).phone.some(row => row.id === id && row.read);
    return JSON.parse(JSON.stringify({
      binding: JSON.stringify([options.session, active]), revision: p.revision,
      active, owner, name: protagonistNames[owner], now: gameMinute(s), clock: s.clock,
      calendarDate: gameCalendar(s.clock.day), reporting: registrationNotice(s.clock.day),
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
        recentStory: person.story.slice(-8).map(row => ({role:row.role,text:row.text.slice(0,450)})),
        recentJournal: person.journal.slice(-12).map(row => ({text:row.text.slice(0,240)})),
      } : null,
      orders: p.orders.filter(o=>o.owner===owner), messages: person.phone,
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
  return Object.freeze({
    subscribe(callback: () => void) { listeners.add(callback); return () => { listeners.delete(callback); }; },
    notify() { for(const listener of [...listeners]) { try { listener(); } catch { /* A detached phone view cannot stop world state saves. */ } } },
    read() { if(!options.current()) throw Error('剧情手机连接已结束');return view(options.state()); },
    async act(raw: {binding:string;revision:number;requestId:string;owner:ProtagonistId;command:PhoneCommand}) {
      if(!options.current()||options.busy()) throw Error('请等待当前行动结束后再操作手机');
      const s=options.state();
      if(!raw||raw.binding!==JSON.stringify([options.session,activeProtagonist(s)])) throw Error('主角或聊天已经切换，请重新打开应用');
      if(raw.revision!==(s.protagonists?.revision??0)&&!s.protagonists?.operations.some(o=>o.id===raw.requestId)) throw Error('手机状态已更新，请刷新后重试');
      // Saving a bubble never sends an LLM request. The player can type multiple
      // consecutive messages before explicitly choosing to request a reply.
      const next=options.commit({type:'phone_app',requestId:raw.requestId,owner:raw.owner,command:raw.command});
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
    async retryReply(messageId: string) {
      if(!options.current()||options.busy()) throw Error('请等待当前行动结束后重试回复');
      if(!options.requestReply) throw Error('自动短信回复暂不可用');
      await options.requestReply(messageId);
      return view(options.state());
    },
  });
}



