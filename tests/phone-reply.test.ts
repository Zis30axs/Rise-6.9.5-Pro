import { describe, expect, it } from 'vitest';
import { createInitialState, parseState, reduceState, getRouteOutlook } from '../src/runtime/model';
import { activeProtagonist, applyPhoneReply, enableProtagonists, gameMinute, personState } from '../src/runtime/protagonist-world';
import { parsePhoneReply, phoneReplyContext } from '../src/runtime/phone-reply';
import { createWorldPhoneApi } from '../src/frontend/world-phone';

const start = () => enableProtagonists(createInitialState());
const send = (s = start(), requestId = 'question-01') => reduceState(s, {
  type: 'phone_app', requestId, owner: activeProtagonist(s),
  command: { type: 'send_message', text: '祥子，今晚方便谈谈吗？' },
});
const reload = (s: ReturnType<typeof start>) => parseState(JSON.parse(JSON.stringify(s)));

describe('text-only LLM phone responses, with real character knowledge', () => {
  it('sends from only the current owner, makes the receiver aware and persists both sides', () => {
    const s=send();
    expect(activeProtagonist(s)).toBe('soyo');
    expect(s.protagonists!.conversations).toEqual([expect.objectContaining({
      id:'dual:question-01',from:'soyo',to:'sakiko',expectsReply:true,replyTo:null,
    })]);
    expect(personState(s,'sakiko').phone).toEqual(expect.arrayContaining([
      expect.objectContaining({id:'dual:question-01',text:'祥子，今晚方便谈谈吗？',read:false}),
    ]));
    expect(personState(s,'soyo').phone.find(row=>row.id==='dual:question-01')).toBeUndefined();
    expect(reload(s).protagonists!.conversations).toEqual(s.protagonists!.conversations);
  });

  it('builds recipient-scoped worldbook, schedule, private story and full recent thread without switching', () => {
    const s=send();
    personState(s,'sakiko').journal.push({id:'private-sakiko',text:'祥子自己知道的私事',at:'第 1 天 17:20'});
    personState(s,'soyo').journal.push({id:'private-soyo',text:'素世自己的私事',at:'第 1 天 17:20'});
    const context=phoneReplyContext(s,'dual:question-01');
    expect(context.actor.id).toBe('sakiko');
    expect(context.sender.id).toBe('soyo');
    expect(context.worldbook.some(row=>row.name.includes('丰川祥子'))).toBe(true);
    expect(context.messages.at(-1)?.id).toBe('dual:question-01');
    expect(context.ownJournal.some(row=>row.text.includes('祥子自己知道'))).toBe(true);
    expect(JSON.stringify(context)).not.toContain('素世自己的私事');
    expect(gameMinute(s)).toBe(context.time.minute);
  });

  it('validates text-tag responses and refuses unsafe or mismatched messages', () => {
    expect(parsePhoneReply('<phone_reply>{"messageId":"dual:question-01","text":"晚上可以，几点？"}</phone_reply>', 'dual:question-01')).toBe('晚上可以，几点？');
    expect(()=>parsePhoneReply('<phone_reply>{"messageId":"wrong","text":"好"}</phone_reply>','dual:question-01')).toThrow();
    expect(()=>parsePhoneReply('<phone_reply>{"messageId":"dual:question-01","text":"好","amount":999}</phone_reply>','dual:question-01')).toThrow();
    expect(()=>parsePhoneReply('<world_actions>[]</world_actions>','dual:question-01')).toThrow();
  });

  it('commits one reply, no protagonist switch, no clock or finance change, and no recursive autopings', () => {
    const sent=send();
    const before=structuredClone(sent);
    const completed=applyPhoneReply(sent,'dual:question-01','晚上有空，先在手机上说吧。');
    expect(completed.protagonists!.conversations).toHaveLength(2);
    expect(completed.protagonists!.conversations![1]).toEqual(expect.objectContaining({
      id:'dual:question-01:reply',from:'sakiko',to:'soyo',replyTo:'dual:question-01',expectsReply:false,
    }));
    expect(personState(completed,'soyo').phone).toEqual(expect.arrayContaining([
      expect.objectContaining({id:'dual:question-01:reply',read:false}),
    ]));
    expect(activeProtagonist(completed)).toBe('soyo');
    expect(completed.clock).toEqual(before.clock);
    expect(completed.protagonists!.accounts).toEqual(before.protagonists!.accounts);
    expect(completed.protagonists!.orders).toEqual(before.protagonists!.orders);
    expect(applyPhoneReply(completed,'dual:question-01','晚上有空，先在手机上说吧。')).toEqual(completed);
    expect(()=>applyPhoneReply(completed,'dual:question-01','另一条不一致回复')).toThrow();
    expect(reload(completed).protagonists!.conversations).toEqual(completed.protagonists!.conversations);
  });

  it('supports Sakiko as player and rejects a stale reply after switching protagonists', () => {
    const sakiko=reduceState(start(),{type:'switch_protagonist',target:'sakiko'});
    const sent=send(sakiko,'sakiko-question');
    const context=phoneReplyContext(sent,'dual:sakiko-question');
    expect(context.actor.id).toBe('soyo');
    const switched=reduceState(sent,{type:'switch_protagonist',target:'soyo'});
    expect(()=>applyPhoneReply(switched,'dual:sakiko-question','答复')).toThrow();
  });

  it('exposes the same canonical conversation to either device without duplicating a model call', async () => {
    let state=send();
    let onOutgoing=0;
    const api=createWorldPhoneApi({
      session:'test',current:()=>true,busy:()=>false,state:()=>state,
      commit:action=>(state=reduceState(state,action)),
      onOutgoingMessage:()=>{onOutgoing++;},
    });
    expect(api.read().conversation).toHaveLength(1);
    expect(onOutgoing).toBe(0);
    state=applyPhoneReply(state,'dual:question-01','可以。');
    expect(api.read().conversation).toHaveLength(2);
    state=reduceState(state,{type:'switch_protagonist',target:'sakiko'});
    expect(api.read().conversation).toHaveLength(2);
    expect(onOutgoing).toBe(0);
  });

  it('keeps existing deterministic map outlooks and route-event calculations as separate game subsystems', () => {
    const s=start();
    const a=getRouteOutlook(s,'commercial');
    const b=getRouteOutlook(s,'commercial');
    expect(a).toEqual(b);
    const answered=applyPhoneReply(send(s),'dual:question-01','晚点说。');
    expect(answered.scene).toEqual(s.scene);
    expect(answered.locationId).toBe(s.locationId);
    expect(answered.clock).toEqual(s.clock);
  });
});
