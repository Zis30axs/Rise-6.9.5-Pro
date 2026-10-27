import { describe, expect, it } from 'vitest';
import { createInitialState, parseState, reduceState } from '../src/runtime/model';
import { enableProtagonists } from '../src/runtime/protagonist-world';
import { npcPhoneView } from '../src/runtime/npc-phone';
import { createWorldPhoneApi } from '../src/frontend/world-phone';
import { storySmsContext } from '../src/runtime/phone-sms';

const emma = () => reduceState(enableProtagonists(createInitialState()), {type:'switch_protagonist', target:'emma'});

describe('NPC phone peek: canonical dual-speaker SMS', () => {
  it('commits real paired messages through the game phone once, with valid save, inbox and context', async () => {
    let state=emma();
    const api=createWorldPhoneApi({
      session:'peek-scene',current:()=>true,busy:()=>false,state:()=>state,
      commit:action => {state=reduceState(state,action);return state;},
    });
    const first=api.read();
    const contact=first.npcPhone.contacts.find((c:{id:string})=>c.id==='majo-yuki');
    expect(contact).toBeTruthy();
    const command={type:'peek_chat_append' as const,npcId:contact.id,lines:[
      {speaker:'protagonist' as const,text:'你还在音乐教室吗？'},
      {speaker:'npc' as const,text:'在的，你要过来吗？'},
      {speaker:'protagonist' as const,text:'我还有五分钟到。'},
      {speaker:'npc' as const,text:'那我等你。'},
    ]};
    const request={binding:first.binding,revision:first.revision,owner:'emma' as const,requestId:'peek-pair-1',command};
    const after=await api.act(request);
    expect(after.npcPhone.messages.map((m:{text:string})=>m.text))
      .toEqual(command.lines.map(m=>m.text));
    expect(after.npcPhone.messages.map((m:{direction:string})=>m.direction))
      .toEqual(['outgoing','incoming','outgoing','incoming']);
    expect(state.phone.slice(-2).map(m=>m.text)).toEqual(['在的，你要过来吗？','那我等你。']);
    expect(storySmsContext(state).filter(m=>m.channel==='npc').map(m=>m.text))
      .toEqual(command.lines.map(m=>m.text));
    expect(parseState(state)).toEqual(state);
    const again=await api.act(request);
    expect(again.npcPhone.messages).toHaveLength(4);
    expect(state.protagonists?.npcPhone?.messages).toHaveLength(4);
  });

  it('does not overwrite existing SMS and isolates owner/thread on protagonist switch', () => {
    let state=emma();
    state=reduceState(state,{type:'phone_app',owner:'emma',requestId:'prior-peek-sms',
      command:{type:'send_npc_message',npcId:'majo-yuki',text:'最早发出的真实短信'}});
    state=reduceState(state,{type:'phone_app',owner:'emma',requestId:'model-peek-sms',
      command:{type:'peek_chat_append',npcId:'majo-yuki',lines:[
        {speaker:'protagonist',text:'之后的对话'},
        {speaker:'npc',text:'之后的回复'},
      ]}});
    const entries=npcPhoneView(state,'emma').messages;
    expect(entries.map(m=>m.text)).toEqual(['最早发出的真实短信','之后的对话','之后的回复']);
    expect(entries[0].status).toBe('silent'); // a generated completed turn supersedes pending segments.
    state=reduceState(state,{type:'switch_protagonist',target:'soyo'});
    expect(storySmsContext(state).map(m=>m.text)).not.toContain('之后的对话');
    expect(npcPhoneView(state,'soyo').messages.map(m=>m.text)).not.toContain('之后的回复');
    state=reduceState(state,{type:'switch_protagonist',target:'emma'});
    expect(npcPhoneView(state,'emma').messages.map(m=>m.text)).toContain('之后的回复');
    expect(parseState(state)).toEqual(state);
  });

  it('rejects impersonation, invalid alternation and non-contacts without partial writes', () => {
    let state=emma();
    const start=state.protagonists!.revision;
    const run=(requestId:string,owner:'emma'|'soyo',npcId:string,lines:{speaker:'protagonist'|'npc';text:string}[])=>
      reduceState(state,{type:'phone_app',requestId,owner,command:{type:'peek_chat_append',npcId,lines}});
    expect(()=>run('wrong-owner','soyo','majo-yuki',[
      {speaker:'protagonist',text:'不应该出现'},{speaker:'npc',text:'不应该出现'},
    ])).toThrow('当前主角');
    expect(()=>run('wrong-order','emma','majo-yuki',[
      {speaker:'npc',text:'顺序错误'},{speaker:'protagonist',text:'顺序错误'},
    ])).toThrow('轮流');
    expect(()=>run('unknown-contact','emma','unknown-id',[
      {speaker:'protagonist',text:'你好'},{speaker:'npc',text:'你好'},
    ])).toThrow('联系方式');
    expect(state.protagonists!.revision).toBe(start);
    expect(npcPhoneView(state,'emma').messages).toHaveLength(0);
  });
});
