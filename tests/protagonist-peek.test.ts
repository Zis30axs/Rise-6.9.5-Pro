import { describe, expect, it } from 'vitest';
import { createInitialState, parseState, reduceState } from '../src/runtime/model';
import { enableProtagonists, personState } from '../src/runtime/protagonist-world';
import { createWorldPhoneApi } from '../src/frontend/world-phone';
import { visiblePeekSnapshot, protagonistPeekSnapshot } from '../integration/dual-protagonists/phone-peek.js';

function fixture() {
  let state=enableProtagonists(createInitialState());
  const commit=(action:any)=>state=reduceState(state,action);
  commit({type:'novel_travel',locationId:'sports'});
  commit({type:'phone_app',owner:'soyo',requestId:'soyo-sms',command:{type:'send_message',to:'sakiko',text:'今天一起去排练吗？'}});
  commit({type:'switch_protagonist',target:'sakiko'});
  commit({type:'novel_travel',locationId:'sports'});
  commit({type:'phone_app',owner:'sakiko',requestId:'sakiko-sms',command:{type:'send_message',to:'soyo',text:'好的，带上乐谱。'}});
  commit({type:'phone_app',owner:'sakiko',requestId:'sakiko-share',command:{type:'device',locked:true,share:'read'}});
  commit({type:'switch_protagonist',target:'soyo'});
  let current=true;
  const api=createWorldPhoneApi({session:'peek-sync',current:()=>current,busy:()=>false,state:()=>state,commit});
  return {api,commit,state:()=>state,reload:()=>{state=parseState(JSON.parse(JSON.stringify(state)));},end:()=>{current=false;}};
}

describe('ordinary phone peek for playable characters', () => {
  it('never displays a separately generated Sakiko phone from Soyo’s viewpoint', () => {
    let state = enableProtagonists(createInitialState());
    const api = createWorldPhoneApi({ session:'peek-sync', current:()=>true, busy:()=>false,
      state:()=>state, commit:action => (state=reduceState(state,action)) });
    const cached = { name:'丰川祥子', at:123, chats:[
      {with:'朋友', lines:[{from:'丰川祥子', text:'只存在素世缓存里的假消息'}]},
    ], photos:[], notes:[], searches:[], cart:[] };
    expect(visiblePeekSnapshot(cached, api.read(), '丰川祥子')).toBeNull();
    expect(state.protagonists!.conversations).toHaveLength(0);
  });
  it('reads the same paired messages from ordinary inspection, save reload and Sakiko’s own phone', async () => {
    const f=fixture(),first=f.api.read();
    const request={binding:first.binding,revision:first.revision,owner:'sakiko' as const,requestId:'ordinary-peek',command:{type:'inspect' as const,section:'messages' as const}};
    const before=structuredClone(f.state().protagonists!.conversations);
    const shown=protagonistPeekSnapshot(await f.api.act(request));
    expect(shown.chats).toHaveLength(1);
    expect(shown.chats[0].with).toBe('长崎素世');
    expect(shown.chats[0].lines.map((m:any)=>m.text)).toEqual(['今天一起去排练吗？','好的，带上乐谱。']);
    expect(f.state().protagonists!.conversations).toEqual(before);
    const revision=f.api.read().revision;
    expect(protagonistPeekSnapshot(f.api.readInspected(request)).chats).toEqual(shown.chats);
    expect(f.api.read().revision).toBe(revision);
    expect(f.state().protagonists!.accounts.phoneAccess).toHaveLength(1);
    f.reload();
    expect(protagonistPeekSnapshot(f.api.readInspected(request)).chats).toEqual(shown.chats);
    f.commit({type:'phone_app',owner:'soyo',requestId:'soyo-new',command:{type:'send_message',to:'sakiko',text:'我已经出门了。'}});
    expect(protagonistPeekSnapshot(f.api.readInspected(request)).chats[0].lines.at(-1)?.text).toBe('我已经出门了。');
    const refreshed=protagonistPeekSnapshot(f.api.readInspected(request));
    f.commit({type:'switch_protagonist',target:'sakiko'});
    expect(protagonistPeekSnapshot(f.api.read()).chats).toEqual(refreshed.chats);
    expect(()=>f.api.readInspected(request)).toThrow('重新拿起');
  });
  it('checks permissions for initial inspection, refresh and replay without exposing a locked or distant phone', async () => {
    const f=fixture(),first=f.api.read();
    const request={binding:first.binding,revision:first.revision,owner:'sakiko' as const,requestId:'permission-peek',command:{type:'inspect' as const,section:'messages' as const}};
    expect(()=>f.api.readInspected(request)).toThrow('重新拿起');
    await f.api.act(request);
    f.state().protagonists!.devices.sakiko.share='none';
    expect(()=>f.api.readInspected(request)).toThrow('锁定');
    await expect(f.api.act(request)).rejects.toThrow('锁定');
    f.state().protagonists!.devices.sakiko.share='read';
    personState(f.state(),'sakiko').scene!.x+=8;
    expect(()=>f.api.readInspected(request)).toThrow('走到对方身边');
    f.end();
    expect(()=>f.api.readInspected(request)).toThrow('连接已结束');
  });
});
