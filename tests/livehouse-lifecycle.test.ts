import { describe, it, expect, vi, afterEach } from 'vitest';
vi.mock('../src/frontend/App.vue',()=>({default:{template:'<div>受控界面</div>'}}));
vi.mock('../src/frontend/story-phone',()=>({createStoryPhoneLink:vi.fn()}));
import { mountShell } from '../src/frontend/lifecycle';
import { createTavernBridge } from '../src/runtime/bridge';
import { createInitialState, parseState, reduceState } from '../src/runtime/model';
import { enableProtagonists } from '../src/runtime/protagonist-world';
import { getCampusInterior } from '../src/runtime/campus-interiors';
import type { Bridge, GeneratedStory } from '../src/frontend/types';
function pendingInvitation() {
  let s=enableProtagonists(createInitialState());const room=getCampusInterior('livehouse')!;
  s.locationId='livehouse';s.scene={x:room.entrance.x,z:room.entrance.z,yaw:0,areaId:room.parentLocationId,seed:'test-band-life',encounterId:null};
  s.interior={roomId:'livehouse',x:3.2,z:-1.2,yaw:0,activityId:null,lastRest:null,lastStudy:null};
  s=reduceState(s,{type:'interior_interact',interactionId:'livehouse-create-band',registration:{id:'band-one',name:'夜读',founderRole:'bass'}});
  s.contacts.push({id:'taki',name:'椎名立希',tag:'已认识',summary:'鼓手',affinity:0,status:'好友',portraitId:'deepseek',sourcePersonId:null,isMain:true});
  return reduceState(s,{type:'phone_app',requestId:'invite-one',owner:'soyo',command:{type:'band_invite',bandId:'band-one',contactId:'taki',role:'drums'}});
}
const handles: {dispose(reason?:string):void}[]=[];
afterEach(()=>{for(const h of handles.splice(0))h.dispose();vi.restoreAllMocks();vi.useRealTimers();document.body.innerHTML='';});
describe('manual invitation reply transaction',()=>{
  function shell() {
    Object.defineProperty(document,'hidden',{configurable:true,value:false});vi.useFakeTimers();
    let saved=pendingInvitation(),session='one',fail=false;
    const generate=vi.fn<Bridge['generate']>(async()=>({text:'好，我来打鼓。',phoneMessages:[],bandDecision:'accept'}));
    const save=vi.fn<Bridge['save']>(s=>{if(fail)throw Error('磁盘保存失败');saved=parseState(s);});
    const bridge:Bridge={kind:'demo',label:'受控本地测试',session:()=>session,load:()=>parseState(saved),save,onSessionChange:()=>()=>{},generate,cancel:()=>{},dispose:()=>{}};
    const h=mountShell(window,window,bridge,()=>{});handles.push(h);
    const api=(window as any).__unreadCityWorldPhone;
    return {h,api,save,generate,state:()=>saved,fail:(v:boolean)=>{fail=v;},changeSession:()=>{session='two';}};
  }
  it('uses the dedicated model decision and publishes roster and SMS only after save succeeds',async()=>{
    const x=shell();await x.api.retryReply('npc:invite-one');
    expect(x.generate.mock.calls[0]![2]).toEqual({kind:'band_invitation_reply',messageId:'npc:invite-one'});
    expect(x.h.model.state.livehouse!.bands[0]!.members).toHaveLength(2);expect(x.state().livehouse!.invitations[0]!.status).toBe('accepted');
    const count=x.save.mock.calls.length;await x.api.retryReply('npc:invite-one');expect(x.save.mock.calls).toHaveLength(count);expect(x.generate).toHaveBeenCalledTimes(1);
  });
  it('leaves invitation pending on model failure and on save failure, then allows one clean retry',async()=>{
    const x=shell();x.generate.mockRejectedValueOnce(Error('模型中断'));
    await expect(x.api.retryReply('npc:invite-one')).rejects.toThrow(/模型中断/);expect(x.state().livehouse!.invitations[0]!.status).toBe('pending');
    x.fail(true);await expect(x.api.retryReply('npc:invite-one')).rejects.toThrow(/保存失败/);
    expect(x.h.model.state.livehouse!.bands[0]!.members).toHaveLength(1);expect(x.h.model.state.protagonists!.npcPhone!.messages).toHaveLength(1);
    x.fail(false);await x.api.retryReply('npc:invite-one');expect(x.state().livehouse!.bands[0]!.members).toHaveLength(2);
    expect(x.state().protagonists!.npcPhone!.messages.filter(m=>m.replyTo==='npc:invite-one')).toHaveLength(1);
  });
  it('rejects a generic affirmative without structured acceptance',async()=>{
    const x=shell();x.generate.mockResolvedValueOnce({text:'好！',phoneMessages:[]});
    await expect(x.api.retryReply('npc:invite-one')).rejects.toThrow(/决定/);expect(x.state().livehouse!.bands[0]!.members).toHaveLength(1);
  });
  it('drops a late model acceptance after chat switch',async()=>{
    const x=shell();let resolve!:(reply:GeneratedStory)=>void;
    x.generate.mockReturnValueOnce(new Promise(r=>{resolve=r;}));
    const job=x.api.retryReply('npc:invite-one');x.changeSession();resolve({text:'好。',phoneMessages:[],bandDecision:'accept'});await job;
    expect(x.save).not.toHaveBeenCalled();expect(x.state().livehouse!.bands[0]!.members).toHaveLength(1);
  });
  it('uses strict band_reply parsing in the actual Tavern bridge with isolated character context',async()=>{
    const state=pendingInvitation();let prompt:any;
    const fake={parent:{SillyTavern:{getContext:()=>({characterId:0,characters:[{avatar:'band.png'}],chatId:'one',mainApi:'openai'})}},getVariables:()=>({unread_city:state}),replaceVariables:()=>{},eventOn:()=>{},eventRemoveListener:()=>{},stopGenerationById:()=>{},tavern_events:{CHAT_CHANGED:'chat_changed'},generate:async(input:any)=>{prompt=input;return '<band_reply>{"messageId":"npc:invite-one","decision":"accept","text":"我来打鼓。"}</band_reply>';}};
    const bridge=createTavernBridge(fake as unknown as Window)!;expect(bridge).not.toBeNull();
    const reply=await bridge.generate('回复这条乐队邀请',state,{kind:'band_invitation_reply',messageId:'npc:invite-one'});
    expect(reply.bandDecision).toBe('accept');expect(prompt.user_input).toContain('椎名立希');expect(prompt.user_input).toContain('夜读');expect(prompt.injects[0].content).toContain('band_reply');bridge.dispose();
  });
});
