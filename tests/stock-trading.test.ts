import { describe, expect, it } from 'vitest';
import { createWorldPhoneApi } from '../src/frontend/world-phone';
import type { WorldState } from '../src/frontend/types';
import { appiePayBalance } from '../src/runtime/dual-protagonists';
import { createInitialState, parseState, reduceState } from '../src/runtime/model';
import { enableProtagonists, gameMinute, type PhoneCommand } from '../src/runtime/protagonist-world';
import { stockAccount } from '../src/runtime/stock-world';

const savedTime = () => enableProtagonists({
  ...createInitialState(), clock:{day:2,hour:9,minute:0},
});
const wait = (state:WorldState,minutes:number): WorldState => {
  while (minutes>0) {
    const step=Math.min(minutes,120);
    state=reduceState(state,{type:'wait',minutes:step});
    minutes-=step;
  }
  return state;
};
const phoneAction=(state:WorldState,requestId:string,command:PhoneCommand,owner:'soyo'|'sakiko'='soyo') =>
  reduceState(state,{type:'phone_app',owner,requestId,command});
const funds=(state:WorldState, direction:'deposit'|'withdraw', yen:number): PhoneCommand => ({
  type:'stock_funds',direction,card:'gpt',yen,minute:gameMinute(state),revision:stockAccount(state,'soyo').revision,
});
const buy=(state:WorldState, kind:'market'|'limit'='market', limit:number|null=null): PhoneCommand => ({
  type:'stock_trade',minute:gameMinute(state),revision:stockAccount(state,'soyo').revision,
  trade:{type:'submit',code:'2874',side:'buy',kind,quantity:1,limit},
});
const setControl=(state:WorldState, controller:'auto'|'manual') =>
  reduceState(state,{type:'strategy',requestId:'test-control-'+controller,command:{type:'set_control',owner:'soyo',controller,includeInPrompt:false}});

describe('东都证券接入角色卡',()=>{
  it('通过现有电话桥划转和交易，按角色存档且不重复扣款',async()=>{
    let state=savedTime();
    const baseline=appiePayBalance(state.protagonists!.accounts,'soyo');
    const bridge=createWorldPhoneApi({session:'chat-stock',current:()=>true,busy:()=>false,state:()=>state,
      commit: action=>state=reduceState(state,action)});
    const initial=bridge.stock();
    expect(initial.state.cash).toBe(0);
    expect(state.protagonists?.stockAccounts).toBeUndefined();
    const request={binding:initial.binding,revision:initial.phoneRevision,requestId:'fund-deposit',owner:'soyo' as const,command:funds(state,'deposit',3000)};
    await bridge.act(request);
    await bridge.act(request);
    expect(stockAccount(state,'soyo').cash).toBe(3000);
    expect(appiePayBalance(state.protagonists!.accounts,'soyo')).toBe(baseline-300000);
    const market=buy(state);
    state=phoneAction(state,'trade-one',market);
    expect(stockAccount(state,'soyo').positions['2874'].quantity).toBe(1);
    state=phoneAction(state,'withdraw-small',funds(state,'withdraw',100));
    expect(appiePayBalance(state.protagonists!.accounts,'soyo')).toBe(baseline-290000);
    expect(parseState(JSON.parse(JSON.stringify(state))).protagonists?.stockAccounts).toEqual(state.protagonists?.stockAccounts);
    const switched=reduceState(state,{type:'switch_protagonist',target:'sakiko'});
    expect(stockAccount(switched,'sakiko').cash).toBe(0);
    expect(()=>phoneAction(switched,'other-owner',buy(state))).toThrow();
  });

  it('托管和非当前主角无法买卖或划转，过期盘口也无法提交',()=>{
    const original=savedTime();
    const deposited=phoneAction(original,'fund-deposit',funds(original,'deposit',3000));
    const pending=phoneAction(deposited,'rest-order',buy(deposited,'limit',1));
    const delegated=setControl(pending,'auto');
    expect(()=>phoneAction(delegated,'trade-auto',buy(delegated))).toThrow(/先接管/);
    expect(()=>phoneAction(delegated,'fund-auto',funds(delegated,'withdraw',1))).toThrow(/先接管/);
    expect(()=>phoneAction(delegated,'cancel-auto',{type:'stock_trade',minute:gameMinute(delegated),revision:stockAccount(delegated,'soyo').revision,
      trade:{type:'cancel',orderId:stockAccount(delegated,'soyo').orders[0]!.id}})).toThrow(/先接管/);
    expect(()=>phoneAction(deposited,'trade-foreign',buy(deposited),'sakiko')).toThrow();
    const advanced=reduceState(deposited,{type:'wait',minutes:5});
    expect(()=>phoneAction(advanced,'stale-quote',buy(deposited))).toThrow(/已更新/);
    const resumed=setControl(delegated,'manual');
    expect(stockAccount(phoneAction(resumed,'trade-resume',buy(resumed)),'soyo').fills).toHaveLength(1);
  });

  it('切走主角后照常完成该主角的行情回顾，日程保存在本人手机',()=>{
    const initial=savedTime();
    const scheduled=phoneAction(initial,'owner-review',{type:'calendar_save',id:'owner-review',stockCode:'6418',
      title:'回顾神田电机行情',locationId:'phone',start:gameMinute(initial)+5,duration:5});
    const switched=reduceState(scheduled,{type:'switch_protagonist',target:'sakiko'});
    const moved=reduceState(switched,{type:'wait',minutes:5});
    expect(moved.protagonists?.devices.soyo.calendar[0]?.reviewed).toBe(true);
    expect(moved.protagonists?.devices.sakiko.calendar).toEqual([]);
    expect(moved.protagonists?.stockAccounts).toBeUndefined();
  });

  it('托管期间只记录行情日程，挂单到期释放资金，不产生证券成交',async()=>{
    let state=savedTime();
    state=phoneAction(state,'fund-deposit',funds(state,'deposit',3000));
    state=phoneAction(state,'pending-limit',buy(state,'limit',652));
    expect(stockAccount(reduceState(state,{type:'wait',minutes:5}),'soyo').fills).toHaveLength(1);
    state=setControl(state,'auto');
    const bridge=createWorldPhoneApi({session:'chat-stock',current:()=>true,busy:()=>false,state:()=>state,
      commit: action=>state=reduceState(state,action)});
    const binding=bridge.stock().binding;
    const form={binding,requestId:'review-one',code:'6418',date:'2025-08-29',time:'09:15',duration:5};
    await expect(bridge.scheduleStock({...form,time:'11:30'})).rejects.toThrow(/交易时段/);
    await expect(bridge.scheduleStock({...form,date:'2025-08-30'})).rejects.toThrow(/交易时段/);
    await bridge.scheduleStock(form);
    expect(state.protagonists?.devices.soyo.calendar[0]?.reviewed).toBe(false);
    const brokerCash=stockAccount(state,'soyo').cash;
    const wallet=appiePayBalance(state.protagonists!.accounts,'soyo');
    state=reduceState(state,{type:'wait',minutes:20});
    expect(state.protagonists?.devices.soyo.calendar[0]?.reviewed).toBe(true);
    expect(state.journal.filter(row=>row.id.startsWith('stock-review:'))).toHaveLength(1);
    expect(appiePayBalance(state.protagonists!.accounts,'soyo')).toBe(wallet);
    expect(stockAccount(state,'soyo').cash).toBe(brokerCash);
    state=wait(state,370);
    expect(stockAccount(state,'soyo').orders[0]?.status).toBe('expired');
    expect(stockAccount(state,'soyo').fills).toHaveLength(0);
    expect(state.journal.filter(row=>row.id.startsWith('stock-review:'))).toHaveLength(1);
  });
});
