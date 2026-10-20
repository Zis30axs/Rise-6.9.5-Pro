import type { WorldState } from './types';
import { activeProtagonist, enableProtagonists, gameMinute, otherProtagonist, personState, phoneAccess, protagonistNames, type PhoneCommand } from '../runtime/protagonist-world';
import { locations } from '../runtime/model';
import { storeCatalog } from '../runtime/convenience-store';
import type { ProtagonistId } from '../runtime/dual-protagonists';

/** Capability for the embedded phone only. Never exposes the other person's save wholesale. */
export function createWorldPhoneApi(options: {
  session: string; current(): boolean; busy(): boolean; state(): WorldState;
  commit(action: {type:'phone_app';requestId:string;owner:ProtagonistId;command:PhoneCommand}): WorldState;
}) {
  const view = (s: WorldState, owner = activeProtagonist(s)) => {
    const enabled = enableProtagonists(s), p = enabled.protagonists!, active = activeProtagonist(enabled);
    const person = personState(enabled, owner), d = p.devices[owner];
    return JSON.parse(JSON.stringify({
      binding: JSON.stringify([options.session, active]), revision: p.revision,
      active, owner, name: protagonistNames[owner], now: gameMinute(s), clock: s.clock,
      locationId: person.locationId, theme: p.accounts.people[owner].theme,
      cards: p.accounts.people[owner].cards, ledger: p.accounts.ledger.filter(e=>e.actor===owner).slice(-60),
      calendar: d.calendar, dailyPlans: person.schedule, notifications: d.notifications,
      locked: d.locked, share: d.share,
      orders: p.orders.filter(o=>o.owner===owner), messages: person.phone,
      audit: p.accounts.phoneAccess.filter(e=>e.owner===owner).slice(-30),
      catalog: storeCatalog.map(({id,name,price,category,purchaseUnit})=>({id,name,price,category,purchaseUnit})),
      destinations: locations.map(({id,name})=>({id,name})),
      other: {id:otherProtagonist(active),name:protagonistNames[otherProtagonist(active)],...phoneAccess(enabled,otherProtagonist(active))},
    }));
  };
  return Object.freeze({
    read() { if(!options.current()) throw Error('剧情手机连接已结束');return view(options.state()); },
    async act(raw: {binding:string;revision:number;requestId:string;owner:ProtagonistId;command:PhoneCommand}) {
      if(!options.current()||options.busy()) throw Error('请等待当前行动结束后再操作手机');
      const s=options.state();
      if(!raw||raw.binding!==JSON.stringify([options.session,activeProtagonist(s)])) throw Error('主角或聊天已经切换，请重新打开应用');
      if(raw.revision!==(s.protagonists?.revision??0)&&!s.protagonists?.operations.some(o=>o.id===raw.requestId)) throw Error('手机状态已更新，请刷新后重试');
      const next=options.commit({type:'phone_app',requestId:raw.requestId,owner:raw.owner,command:raw.command});
      return view(next,raw.owner);
    },
  });
}
