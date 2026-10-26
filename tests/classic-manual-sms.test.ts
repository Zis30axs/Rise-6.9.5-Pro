import { describe, expect, it, vi } from 'vitest';
import { createInitialState, parseState, reduceState } from '../src/runtime/model';
import { createWorldPhoneApi } from '../src/frontend/world-phone';
import { enableProtagonists } from '../src/runtime/protagonist-world';
import { smsReadReceipt, storySmsContext } from '../src/runtime/phone-sms';
import { phoneReplyContext } from '../src/runtime/phone-reply';
import { npcPhoneReplyContext } from '../src/runtime/npc-phone';

describe('classic manual game SMS', () => {
  it('does not use wall time: delivered turns to simulated read after five game minutes', () => {
    const source = 1440 + 17 * 60;
    expect(smsReadReceipt(source, source)).toBe('delivered');
    expect(smsReadReceipt(source, source + 4)).toBe('delivered');
    expect(smsReadReceipt(source, source + 5)).toBe('read');
    expect(smsReadReceipt(source, source + 1, true)).toBe('read');
    expect(smsReadReceipt(source, source, false, true)).toBe('read');
    expect(smsReadReceipt(source, source - 20)).toBe('delivered');
    expect(smsReadReceipt(NaN, source)).toBe('delivered');
  });

  it('saves several messages in one conversation without automatically invoking the model', async () => {
    let state = enableProtagonists(createInitialState());
    const reply = vi.fn(async () => {});
    const api = createWorldPhoneApi({
      session: 'story-one', current: () => true, busy: () => false,
      state: () => state,
      commit: action => { state = reduceState(state, action); return state; },
      requestReply: reply,
    });
    const send = async (requestId: string, text: string) => {
      const view = api.read();
      return api.act({ binding: view.binding, revision: view.revision, requestId, owner: 'soyo',
        command: { type: 'send_message', to: 'sakiko', text } });
    };
    await send('split-1', '祥子，你在吗？');
    const second = await send('split-2', '我想问你一件事情。');
    expect(second.conversation).toHaveLength(2);
    expect(second.conversation.map((row: {text:string}) => row.text)).toEqual(['祥子，你在吗？','我想问你一件事情。']);
    expect(second.conversation.map((row: {receipt:string}) => row.receipt)).toEqual(['delivered','delivered']);
    expect(reply).not.toHaveBeenCalled();
    expect(parseState(state).protagonists?.conversations).toHaveLength(2);

    const waited = await api.waitForRead({
      binding: second.binding, revision: second.revision, now: second.now, minutes: 5,
    });
    expect(waited.now).toBe(second.now + 5);
    expect(waited.conversation.map((row: {receipt:string})=>row.receipt)).toEqual(['read','read']);
    expect(reply).not.toHaveBeenCalled();
    await api.retryReply('dual:split-2');
    expect(reply).toHaveBeenCalledTimes(1);
    expect(reply).toHaveBeenCalledWith('dual:split-2');
  });

  it('rejects stale time, changed sessions and invalid wait durations', async () => {
    let state = enableProtagonists(createInitialState());
    const api = createWorldPhoneApi({
      session: 'story-two', current: () => true, busy: () => false,
      state: () => state,
      commit: action => { state = reduceState(state, action); return state; },
    });
    const snap = api.read();
    await expect(api.waitForRead({...snap, minutes: 0})).rejects.toThrow('1–120');
    await expect(api.waitForRead({...snap, minutes: 121})).rejects.toThrow('1–120');
    await expect(api.waitForRead({...snap, binding:'another-chat',minutes:5})).rejects.toThrow('切换');
    await api.waitForRead({...snap, minutes: 5});
    await expect(api.waitForRead({...snap, minutes: 5})).rejects.toThrow('更新');
  });

  it('supplies all split segments to a single manual protagonist reply prompt', () => {
    let state = enableProtagonists(createInitialState());
    for (const [requestId,text] of [['segments-1','祥子，我刚到校门。'],['segments-2','我们什么时候见面？']] as const)
      state = reduceState(state,{type:'phone_app',requestId,owner:'soyo',command:{type:'send_message',to:'sakiko',text}});
    const context = phoneReplyContext(state,'dual:segments-2');
    expect(context.messages.map(m=>m.text)).toEqual(['祥子，我刚到校门。','我们什么时候见面？']);
    expect(context.message.id).toBe('dual:segments-2');
  });

  it('provides current protagonist SMS to narrative, but never a different protagonist private DM', () => {
    let state = enableProtagonists(createInitialState());
    state = reduceState(state,{type:'phone_app',requestId:'private-sms',owner:'soyo',command:{type:'send_message',to:'sakiko',text:'素世私人的短信暗号'}});
    expect(storySmsContext(state).map(row=>row.text)).toContain('素世私人的短信暗号');
    state = reduceState(state,{type:'switch_protagonist',target:'emma'});
    expect(storySmsContext(state).map(row=>row.text)).not.toContain('素世私人的短信暗号');
  });

  it('keeps NPC split messages in its own thread and model context without automatic generation', () => {
    let state = reduceState(enableProtagonists(createInitialState()),{type:'switch_protagonist',target:'emma'});
    state = reduceState(state,{type:'phone_app',requestId:'npc-split1',owner:'emma',command:{type:'send_npc_message',npcId:'majo-yuki',text:'雪，今晚几点回？'}});
    state = reduceState(state,{type:'phone_app',requestId:'npc-split2',owner:'emma',command:{type:'send_npc_message',npcId:'majo-yuki',text:'我可以顺路买牛奶。'}});
    const context = npcPhoneReplyContext(state,'npc:npc-split2');
    expect(context.messages.map(row=>row.text)).toContain('雪，今晚几点回？');
    expect(context.messages.map(row=>row.text)).toContain('我可以顺路买牛奶。');
    expect(storySmsContext(state).filter(row=>row.channel==='npc').map(row=>row.text))
      .toEqual(['雪，今晚几点回？','我可以顺路买牛奶。']);
    expect(parseState(state).protagonists?.npcPhone?.messages).toHaveLength(2);
  });
});
