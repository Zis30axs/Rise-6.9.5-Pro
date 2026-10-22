import { npcPhoneView } from '../runtime/npc-phone';
import type { WorldState } from './types';
import { activeProtagonist, defaultPhoneAppearance, enableProtagonists, gameMinute, otherProtagonist, personState, phoneAccess, protagonistNames, type PhoneCommand } from '../runtime/protagonist-world';
import { locations } from '../runtime/model';
import { gameCalendar, registrationNotice } from '../runtime/game-calendar';
import { storeCatalog } from '../runtime/convenience-store';
import type { ProtagonistId } from '../runtime/dual-protagonists';

/** Capability for the embedded phone only. Never exposes the other person's save wholesale. */
export function createWorldPhoneApi(options: {
  session: string; current(): boolean; busy(): boolean; state(): WorldState;
  commit(action: {type:'phone_app';requestId:string;owner:ProtagonistId;command:PhoneCommand}): WorldState;
  onOutgoingMessage?(messageId: string): void;
  requestReply?(messageId: string): Promise<void>;
}) {
  const view = (s: WorldState, owner = activeProtagonist(s)) => {
    const enabled = enableProtagonists(s), p = enabled.protagonists!, active = activeProtagonist(enabled);
    const person = personState(enabled, owner), d = p.devices[owner];
    return JSON.parse(JSON.stringify({
      binding: JSON.stringify([options.session, active]), revision: p.revision,
      active, owner, name: protagonistNames[owner], now: gameMinute(s), clock: s.clock,
      calendarDate: gameCalendar(s.clock.day), reporting: registrationNotice(s.clock.day),
      deviceId: p.accounts.people[owner].deviceId, appearance: d.appearance ?? defaultPhoneAppearance(owner),
      locationId: person.locationId, theme: p.accounts.people[owner].theme,
      cards: p.accounts.people[owner].cards, ledger: p.accounts.ledger.filter(e=>e.actor===owner).slice(-60),
      calendar: d.calendar, dailyPlans: person.schedule, notifications: d.notifications,
      locked: d.locked, share: d.share,
      npcPhone: npcPhoneView(enabled, owner),
      orders: p.orders.filter(o=>o.owner===owner), messages: person.phone,
      conversation: (p.conversations ?? []).filter(m=>m.from===owner||m.to===owner).map(m=>({
        ...m, direction: m.from===owner?'outgoing':'incoming',
        answered: m.expectsReply && (p.conversations??[]).some(reply=>reply.replyTo===m.id),
      })),
      audit: p.accounts.phoneAccess.filter(e=>e.owner===owner).slice(-30),
      catalog: storeCatalog.map(({id,name,price,category,purchaseUnit})=>({id,name,price,category,purchaseUnit})),
      destinations: locations.map(({id,name})=>({id,name})),
      other: {id:otherProtagonist(active),name:protagonistNames[otherProtagonist(active)],...phoneAccess(enabled,otherProtagonist(active))},
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
      const firstSubmission = !s.protagonists?.operations.some(o => o.id === raw.requestId);
      const next=options.commit({type:'phone_app',requestId:raw.requestId,owner:raw.owner,command:raw.command});
      const response=view(next,raw.owner);
      if (firstSubmission && raw.owner === activeProtagonist(next)) {
        const outgoingId = raw.command.type === 'send_message' ? `dual:${raw.requestId}` : ['send_npc_message','send_group_message'].includes(raw.command.type) ? `npc:${raw.requestId}` : null;
        if (outgoingId && (outgoingId.startsWith('dual:') || next.protagonists?.npcPhone?.messages.some(m => m.id === outgoingId && m.status === 'pending'))) options.onOutgoingMessage?.(outgoingId);
      }
      return response;
    },
    async retryReply(messageId: string) {
      if(!options.current()||options.busy()) throw Error('请等待当前行动结束后重试回复');
      if(!options.requestReply) throw Error('自动短信回复暂不可用');
      await options.requestReply(messageId);
      return view(options.state());
    },
  });
}


