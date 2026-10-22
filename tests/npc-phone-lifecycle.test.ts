import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Bridge, GeneratedStory, WorldState } from '../src/frontend/types';
import { accept, proposal, groupMember } from './npc-fixture';
import { parseState } from '../src/runtime/model';
import { createTavernBridge } from '../src/runtime/bridge';

vi.mock('../src/frontend/App.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return { default: defineComponent({setup:() => () => h('div','NPC 短信生命周期测试')}) };
});
// These tests exercise identity, transaction and generation behavior, not art.
vi.mock('../src/frontend/novel-npc-atlases', () => ({ novelNpcAtlases: {} }));
import { mountShell, type ShellHandle } from '../src/frontend/lifecycle';

let shell: ShellHandle | undefined;
afterEach(() => {
  shell?.dispose(); shell = undefined; document.body.innerHTML=''; document.body.style.cssText='';
  localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});
function fixture(group=false) {
  vi.spyOn(document,'hidden','get').mockReturnValue(false);
  let stored = group?groupMember():accept(proposal().state), failSave=false, current='npc-session-A';
  let done: ((reply:GeneratedStory)=>void)|undefined, change:(()=>void)|undefined;
  const bridge: Bridge = {
    kind:'tavern',label:'NPC fixture',session:()=>current,load:()=>parseState(stored),
    save:vi.fn(s=>{if(failSave){failSave=false;throw Error('存档写入失败');}stored=parseState(s);}),
    onSessionChange(callback){change=callback;return vi.fn();},
    generate:vi.fn(()=>new Promise<GeneratedStory>(resolve=>{done=resolve;})),
    cancel:vi.fn(),dispose:vi.fn(),
  };
  shell=mountShell(window,window,bridge,vi.fn());
  const api=(window as unknown as Window & {__unreadCityWorldPhone:any}).__unreadCityWorldPhone;
  const send=()=>{const view=api.read();return api.act({binding:view.binding,revision:view.revision,owner:'soyo',requestId:'life-sms',
    command:group?{type:'send_group_message',groupId:'majo-circle',text:'在忙吗？'}:{type:'send_npc_message',npcId:'majo-emma',text:'在忙吗？'}});};
  return {bridge,api,send,stored:()=>stored,fail:()=>{failSave=true;},finish:(reply:GeneratedStory={text:'现在有一点忙。',phoneMessages:[]})=>done?.(reply),
    switchSession(){current='npc-session-B';change?.();}};
}

describe('NPC phone save/generate lifecycle',()=>{
  it('commits group replies in sequence and retries only unfinished members after a partial save failure',async()=>{
    const f=fixture(true);await f.send();
    const plan=f.stored().protagonists!.npcPhone!.messages[0]!.responsePlan!;
    expect(plan.length).toBeGreaterThan(1);
    f.finish({text:'第一位群成员的意见。',phoneMessages:[]});
    await vi.waitFor(()=>expect(f.bridge.generate).toHaveBeenCalledTimes(2));
    expect(f.stored().protagonists!.npcPhone!.messages).toHaveLength(2);
    const savedFirst=f.stored().protagonists!.npcPhone!.messages[1]!;
    f.fail();f.finish();
    await vi.waitFor(()=>expect(shell!.model.busy).toBe(false));
    expect(f.stored().protagonists!.npcPhone!.messages[0]!.responsePlan![0]!.status).toBe('answered');
    expect(f.stored().protagonists!.npcPhone!.messages[0]!.responsePlan![1]!.status).toBe('pending');
    const retry=f.api.retryReply('npc:life-sms');
    for(let i=1;i<plan.length;i++) {
      await vi.waitFor(()=>expect(f.bridge.generate).toHaveBeenCalledTimes(2+i));
      f.finish({text:'后续群成员的意见'+i,phoneMessages:[]});
    }
    await retry;
    expect(f.stored().protagonists!.npcPhone!.messages).toHaveLength(1+plan.length);
    expect(f.stored().protagonists!.npcPhone!.messages[1]).toEqual(savedFirst);
    expect(f.stored().protagonists!.npcPhone!.messages[0]!.status).toBe('answered');
  });
  it('saves the question before generating, and commits one reply to the latest state',async()=>{
    const f=fixture();
    await f.send();
    expect(f.stored().protagonists!.npcPhone!.messages[0]!.status).toBe('pending');
    expect(f.bridge.generate).toHaveBeenCalledTimes(1);
    expect(vi.mocked(f.bridge.generate).mock.calls[0]![2]).toEqual({kind:'npc_phone_reply',messageId:'npc:life-sms'});
    f.finish();
    await vi.waitFor(()=>expect(shell!.model.busy).toBe(false));
    expect(f.stored().protagonists!.npcPhone!.messages).toHaveLength(2);
    expect(shell!.model.state).toEqual(f.stored());
  });
  it('never generates or publishes a question after a failed save',async()=>{
    const f=fixture(),before=structuredClone(f.stored());f.fail();
    await expect(f.send()).rejects.toThrow(/写入失败/);
    expect(f.bridge.generate).not.toHaveBeenCalled();
    expect(f.stored()).toEqual(before);expect(shell!.model.state).toEqual(before);
    await f.send();f.finish();
    await vi.waitFor(()=>expect(shell!.model.busy).toBe(false));
    expect(f.stored().protagonists!.npcPhone!.messages).toHaveLength(2);
  });
  it('keeps a saved question pending when reply persistence fails, and exposes an explicit retry',async()=>{
    const f=fixture();await f.send();f.fail();f.finish();
    await vi.waitFor(()=>expect(shell!.model.busy).toBe(false));
    expect(f.stored().protagonists!.npcPhone!.messages).toHaveLength(1);
    expect(shell!.model.notice).toContain('原短信已保存');
    const retried=f.api.retryReply('npc:life-sms');f.finish();await retried;
    expect(f.stored().protagonists!.npcPhone!.messages).toHaveLength(2);
    expect(f.bridge.generate).toHaveBeenCalledTimes(2);
  });
  it.each(['player','session','hidden','exit'] as const)('rejects a late response after %s changes',async kind=>{
    const f=fixture();await f.send();const writes=vi.mocked(f.bridge.save).mock.calls.length;
    if(kind==='player')shell!.actions.dispatch({type:'switch_protagonist',target:'sakiko'});
    if(kind==='session')f.switchSession();
    if(kind==='hidden'){vi.spyOn(document,'hidden','get').mockReturnValue(true);document.dispatchEvent(new Event('visibilitychange'));}
    if(kind==='exit')shell!.dispose();
    const after=structuredClone(f.stored());f.finish();
    await new Promise(resolve=>setTimeout(resolve,5));
    expect(f.stored()).toEqual(after);
    expect(f.stored().protagonists!.npcPhone!.messages).toHaveLength(1);
    expect(vi.mocked(f.bridge.save).mock.calls.length).toBe(writes+(kind==='player'?1:0));
    expect(f.bridge.cancel).toHaveBeenCalled();
  });
  it('rejects relationship/actions in a supposedly text-only reply',async()=>{
    const f=fixture();await f.send();
    f.finish({text:'我替你决定了。',phoneMessages:[],worldActions:[{type:'rest',kind:'rest',minutes:60}]});
    await vi.waitFor(()=>expect(shell!.model.busy).toBe(false));
    expect(f.stored().protagonists!.npcPhone!.messages).toHaveLength(1);
    expect(shell!.model.notice).toContain('额外行动');
  });
  it('uses the actual Bridge projection and strict tag parser without publishing narrative',async()=>{
    const ctx={characterId:0,groupId:null,chatId:'npc-A',mainApi:'openai',characters:[{avatar:'npc.png'}]};
    const api={parent:{SillyTavern:{getContext:()=>ctx}},tavern_events:{CHAT_CHANGED:'changed'},getVariables:vi.fn(()=>({})),replaceVariables:vi.fn(),
      eventOn:vi.fn(),eventRemoveListener:vi.fn(),stopGenerationById:vi.fn(),generate:vi.fn(async(_config:Record<string,unknown>)=>'<phone_reply>{"messageId":"npc:life-sms","text":null}</phone_reply>')};
    const bridge=createTavernBridge(api as unknown as Window)!;
    const f=fixture();await f.send();const s=parseState(f.stored());
    s.journal.push({id:'private',text:'MY_PRIVATE_DIARY',at:'第 1 天 17:20'});
    s.protagonists!.inactive.story.push({id:'other-private',role:'assistant',text:'OTHER_PRIVATE_STORY'});
    try {
      const reply=await bridge.generate('回复此条短信。',s,{kind:'npc_phone_reply',messageId:'npc:life-sms'});
      expect(reply).toEqual({text:'',phoneMessages:[],phoneDecision:'silence'});
      const config=api.generate.mock.calls[0]![0],prompt=String(config.user_input);
      expect(prompt).not.toContain('MY_PRIVATE_DIARY');expect(prompt).not.toContain('OTHER_PRIVATE_STORY');
      expect(config.max_chat_history).toBe(0);expect(api.replaceVariables).not.toHaveBeenCalled();
    }finally{bridge.dispose();}
  });
});
