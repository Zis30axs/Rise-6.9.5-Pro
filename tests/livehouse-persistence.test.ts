import { describe, it, expect } from 'vitest';
import { createInitialState, parseState, reduceState } from '../src/runtime/model';
import { enableProtagonists, activeProtagonist, personState, applyPhoneReply } from '../src/runtime/protagonist-world';
import { applyNpcPhoneReply } from '../src/runtime/npc-phone';
import { getCampusInterior } from '../src/runtime/campus-interiors';
import { applyBandReply, bandReplyContext, livehousePhoneView, musicPersonId, parseBandReply } from '../src/runtime/livehouse';
import { createWorldPhoneApi } from '../src/frontend/world-phone';
import type { WorldState, WorldAction } from '../src/frontend/types';
import type { ProtagonistId } from '../src/runtime/dual-protagonists';

function atDesk(state: WorldState, kind: 'register' | 'book' = 'register') {
  const room = getCampusInterior('livehouse')!;
  state.locationId = room.id;
  state.scene = { x:room.entrance.x,z:room.entrance.z,yaw:room.entrance.yaw,areaId:room.parentLocationId,seed:'livehouse-test',encounterId:null };
  state.interior = { roomId:room.id,x:kind === 'register'?3.2:-3.2,z:-1.2,yaw:0,activityId:null,lastRest:null,lastStudy:null };
  return parseState(state);
}
function initial() { return atDesk(enableProtagonists(createInitialState())); }
const register = (id='band-one',name='未读乐队'): Extract<WorldAction,{type:'interior_interact'}> => ({type:'interior_interact',interactionId:'livehouse-create-band',registration:{id,name,founderRole:'bass'}});
const booking = (id='show-one',start=2*1440+18*60): Extract<WorldAction,{type:'interior_interact'}> => ({type:'interior_interact',interactionId:'livehouse-booking',booking:{id,bandId:'band-one',title:'第一次演出',start,duration:60}});
function contact(s: WorldState,id='taki-contact',name='椎名立希',sourcePersonId: string | null=null) {
  s.contacts.push({id,name,tag:'已认识',summary:'已经互加手机联系人。',affinity:10,status:'手机联系',portraitId:'deepseek',sourcePersonId,isMain:true});
  return parseState(s);
}
function invite(s: WorldState,requestId='invite-one',contactId='taki-contact') {
  return reduceState(s,{type:'phone_app',requestId,owner:activeProtagonist(s),command:{type:'band_invite',bandId:'band-one',contactId,role:'drums'}});
}
function withBand() { return reduceState(initial(),register()); }

describe('Live House confirmed registry',()=>{
  it('uses the phone owner\'s own major for band visibility, including inactive protagonists',()=>{
    let s=reduceState(enableProtagonists(createInitialState()),{type:'choose_academics',majorId:'music'});
    expect(livehousePhoneView(s,'emma').canManage).toBe(false);
    expect(livehousePhoneView(s,'renako').canManage).toBe(false);
    s=reduceState(s,{type:'switch_protagonist',target:'emma'});
    s=reduceState(s,{type:'choose_academics',majorId:'music'});
    s=reduceState(s,{type:'switch_protagonist',target:'renako'});
    s=reduceState(s,{type:'choose_academics',majorId:'computer-science'});
    expect(livehousePhoneView(s,'emma').canManage).toBe(true);
    expect(livehousePhoneView(s,'renako').canManage).toBe(false);
    expect(livehousePhoneView(createInitialState(),'soyo').canManage).toBe(true);
    expect(livehousePhoneView(createInitialState(),'renako').canManage).toBe(false);
  });
  it('loads older saves without fabricating registrations from legacy success logs or activity IDs',()=>{
    const old=initial();old.interior!.activityId='livehouse-create-band';old.journal.push({id:'old-success',text:'已经登记成功',at:'第 1 天 17:50'});
    const next=parseState(JSON.parse(JSON.stringify(old)));expect(next.livehouse).toBeUndefined();
  });
  it('creates phone calendars lazily even when the old save has not enabled protagonist features',()=>{
    let s=atDesk(createInitialState());s=reduceState(s,register());s=atDesk(s,'book');s=reduceState(s,booking());
    expect(s.protagonists!.devices.soyo.calendar.some(e=>e.id==='live:show-one')).toBe(true);
  });
  it('requires explicit details before charging time or energy',()=>{
    for(const interactionId of ['livehouse-create-band','livehouse-booking']) {
      const s=atDesk(initial(),interactionId==='livehouse-booking'?'book':'register'),saved=JSON.stringify(s);
      expect(()=>reduceState(s,{type:'interior_interact',interactionId})).toThrow();expect(JSON.stringify(s)).toBe(saved);
    }
    expect(()=>reduceState(initial(),{...register(),registration:{...register().registration!,name:' '}})).toThrow();
  });
  it('records only the confirmed founder; retries and ordinary activities preserve the record',()=>{
    const before=initial(),next=reduceState(before,register());
    expect(next.player.energy).toBe(before.player.energy-3);
    expect(next.livehouse!.bands[0]!.members.map(m=>m.personId)).toEqual(['protagonist-soyo']);
    expect(next.livehouse!.profiles[0]!.skills.bass).toBe(90);
    const repeated=reduceState(next,register());expect(repeated).toEqual(next);
    expect(()=>reduceState(next,register('another-id'))).toThrow(/名称已经/);
    expect(()=>reduceState(next,register('band-one','改名重放'))).toThrow(/重复/);
    next.interior!.x=0;next.interior!.z=-1.5;
    const after=reduceState(next,{type:'interior_interact',interactionId:'livehouse-rehearsal'});
    expect(after.interior!.activityId).toBe('livehouse-rehearsal');expect(after.livehouse).toEqual(next.livehouse);
    expect(parseState(JSON.parse(JSON.stringify(after))).livehouse).toEqual(next.livehouse);
  });
  it.each<ProtagonistId>(['soyo','sakiko','emma','renako'])('preserves management eligibility and switching for %s',owner=>{
    let s=reduceState(initial(),{type:'switch_protagonist',target:owner});s=atDesk(s);
    if(owner==='emma'||owner==='renako') {
      expect(()=>reduceState(s,register())).toThrow(/音乐专业/);
      s=reduceState(s,{type:'choose_academics',majorId:'music'});
    }
    s=reduceState(s,register());s=atDesk(s,'book');s=reduceState(s,booking());
    expect(s.livehouse!.bands[0]!.founder).toBe(owner);expect(s.livehouse!.bookings).toHaveLength(1);
    expect(s.protagonists!.devices[owner].calendar[0]?.start).toBe(booking().booking!.start);
    const registry=JSON.stringify(s.livehouse);
    for(const target of ['renako','emma','sakiko','soyo'] as const) s=reduceState(s,{type:'switch_protagonist',target});
    expect(JSON.stringify(parseState(s).livehouse)).toBe(registry);
  });
  it('books player-specified future times, writes calendar and rejects past/overlapping/full-calendar bookings atomically',()=>{
    let s=atDesk(withBand(),'book');const before=s.player.energy;
    s=reduceState(s,booking());expect(s.player.energy).toBe(before-5);
    expect(s.livehouse!.bookings[0]!.memberIds).toEqual(['protagonist-soyo']);
    expect(s.protagonists!.devices.soyo.calendar.filter(e=>e.id==='live:show-one')).toHaveLength(1);
    expect(reduceState(s,booking())).toEqual(s);
    for(const action of [booking('show-two'),booking('past',1),{...booking('missing'),booking:{...booking().booking!,id:'missing',bandId:'nonexistent'}}]) {
      const saved=JSON.stringify(s);expect(()=>reduceState(s,action)).toThrow();expect(JSON.stringify(s)).toBe(saved);
    }
    s.protagonists!.devices.soyo.calendar.push({id:'unrelated',title:'私人日程',locationId:'home',start:6000,duration:60,reminded:false});
    expect(()=>reduceState(s,booking('overlap-calendar',6000))).toThrow(/日历/);
    expect(parseState(JSON.parse(JSON.stringify(s))).livehouse).toEqual(s.livehouse);
  });
  it('rejects a calendar ID collision without confirming a different slot or changing the existing calendar',()=>{
    const s=atDesk(withBand(),'book');
    s.protagonists!.devices.soyo.calendar.push({id:'live:show-one',title:'玩家原有日程',locationId:'home',start:6000,duration:30,reminded:false});
    const saved=JSON.stringify(s);
    expect(()=>reduceState(s,booking())).toThrow(/日历.*ID|已占用/);
    expect(JSON.stringify(s)).toBe(saved);
  });
  it('keeps confirmed performance times authoritative when editing or deleting the calendar display',()=>{
    let s=reduceState(atDesk(withBand(),'book'),booking());
    const schedule=(id:string,start:number,title='私人日程') => ({type:'phone_app' as const,requestId:'edit-'+id,owner:'soyo' as const,command:{type:'calendar_save' as const,id,title,locationId:'livehouse',start,duration:60}});
    const saved=JSON.stringify(s);
    expect(()=>reduceState(s,schedule('live:show-one',6000))).toThrow(/已确认演出/);expect(JSON.stringify(s)).toBe(saved);
    s=reduceState(s,{type:'phone_app',requestId:'hide-event',owner:'soyo',command:{type:'calendar_delete',id:'live:show-one'}});
    expect(s.livehouse!.bookings).toHaveLength(1);
    expect(()=>reduceState(s,schedule('overlap-hidden-show',booking().booking!.start))).toThrow(/已确认演出/);
    const restored=reduceState(s,booking());
    expect(restored.protagonists!.devices.soyo.calendar.filter(e=>e.id==='live:show-one')).toHaveLength(1);
    expect(restored.player.energy).toBe(s.player.energy);expect(restored.clock).toEqual(s.clock);
  });
  it('cannot overflow a full calendar when replaying a missing performance projection',()=>{
    const s=reduceState(atDesk(withBand(),'book'),booking());
    s.protagonists!.devices.soyo.calendar=Array.from({length:100},(_,n)=>({id:'event-'+n,title:'既有安排',locationId:'home',start:7000+n*10,duration:5,reminded:false}));
    const saved=JSON.stringify(s);expect(()=>reduceState(s,booking())).toThrow(/日历已满/);expect(JSON.stringify(s)).toBe(saved);
  });
  it('rejects invalid saved references, duplicate members, malformed skills, unexpected fields and future creation dates',()=>{
    const s=withBand();
    for(const corrupt of [
      (s:WorldState)=>s.livehouse!.bands[0]!.members.push(s.livehouse!.bands[0]!.members[0]!),
      (s:WorldState)=>s.livehouse!.profiles[0]!.skills.bass=101,
      (s:WorldState)=>s.livehouse!.bands[0]!.createdAt=9999999,
      (s:WorldState)=>(s.livehouse as any).extra=true,
    ]) {const bad=JSON.parse(JSON.stringify(s));corrupt(bad);expect(()=>parseState(bad)).toThrow();}
  });
});

describe('phone band invitations and ability roster',()=>{
  it('saves a real link message, deduplicates requests, and adds a known musician only after model acceptance',()=>{
    const s=contact(withBand());const sent=invite(s);
    expect(sent.livehouse!.bands[0]!.members).toHaveLength(1);
    expect(sent.protagonists!.npcPhone!.messages.at(-1)!.text).toContain('unread-city://band/band-one');
    expect(reduceState(sent,{type:'phone_app',requestId:'invite-one',owner:'soyo',command:{type:'band_invite',bandId:'band-one',contactId:'taki-contact',role:'drums'}})).toEqual(sent);
    expect(()=>invite(sent,'duplicate-invite')).toThrow(/已发送邀请/);
    const accepted=applyBandReply(parseState(JSON.parse(JSON.stringify(sent))),'npc:invite-one','好，一起练。','accept');
    expect(accepted.livehouse!.bands[0]!.members).toHaveLength(2);
    expect(accepted.livehouse!.profiles.find(p=>p.personId==='taki-contact')!.skills.drums).toBe(94);
    expect(accepted.livehouse!.profiles.find(p=>p.personId==='taki-contact')!.source).toBe('fixed');
    expect(parseState(JSON.parse(JSON.stringify(accepted))).livehouse).toEqual(accepted.livehouse);
    expect(applyBandReply(accepted,'npc:invite-one','好，一起练。','accept')).toEqual(accepted);
    expect(()=>invite(accepted,'already-member')).toThrow(/已经是/);
    expect(sent.livehouse!.bands[0]!.members).toHaveLength(1);
    accepted.contacts.find(c=>c.id==='taki-contact')!.name='改名后的联系人';
    expect(parseState(accepted).livehouse!.profiles.find(p=>p.personId==='taki-contact')!.skills.drums).toBe(94);
  });
  it.each(['decline','later'] as const)('does not enroll on %s or malformed model replies',decision=>{
    const s=invite(contact(withBand()));const next=applyBandReply(s,'npc:invite-one','现在暂时不行。',decision);
    expect(next.livehouse!.bands[0]!.members).toHaveLength(1);expect(next.livehouse!.profiles).toHaveLength(1);
    for(const raw of ['同意','<band_reply>{"messageId":"wrong","decision":"accept","text":"好"}</band_reply>','<band_reply>{"messageId":"npc:invite-one","decision":"accept","text":"好","members":["fake"]}</band_reply>']) expect(()=>parseBandReply(raw,'npc:invite-one')).toThrow();
    expect(()=>applyBandReply(s,'npc:invite-one','好',undefined as any)).toThrow();
  });
  it.each(['npc','protagonist'] as const)('preserves a multiline acceptance and its saved receipt for %s',channel=>{
    let s=withBand(),messageId='npc:invite-one';
    if(channel==='npc') s=invite(contact(s));
    else {
      s=reduceState(s,{type:'switch_protagonist',target:'sakiko'});
      s=reduceState(s,{type:'choose_academics',majorId:'music'});
      s=reduceState(s,{type:'switch_protagonist',target:'soyo'});
      s=invite(s,'invite-one','protagonist-sakiko');messageId='dual:invite-one';
    }
    const content='好，我愿意加入。\n周末一起练习吧。';
    const parsed=parseBandReply('<band_reply>'+JSON.stringify({messageId,decision:'accept',text:content})+'</band_reply>',messageId);
    const accepted=applyBandReply(s,messageId,parsed.text,parsed.bandDecision);
    expect(parseState(JSON.parse(JSON.stringify(accepted))).livehouse!.invitations[0]!.reply).toBe(content);
    expect(accepted.livehouse!.bands[0]!.members).toHaveLength(2);
  });
  it('randomizes a stranger whose stable ID also happens to be a JavaScript object property name',()=>{
    const s=invite(contact(withBand(),'constructor','普通陌生人'),'stranger-constructor','constructor');
    const next=applyBandReply(s,'npc:stranger-constructor','可以。','accept');
    expect(next.livehouse!.profiles.find(p=>p.personId==='constructor')!.source).toBe('random');
  });
  it('rolls strangers once per stable person and retains the same ability on reload and joining another band',()=>{
    let s=invite(contact(withBand(),'stranger','普通陌生人'), 'stranger-invite','stranger');
    s=applyBandReply(s,'npc:stranger-invite','愿意试试。','accept');const profile=s.livehouse!.profiles.find(p=>p.personId==='stranger')!;
    expect(profile.source).toBe('random');
    s=atDesk(s);s=reduceState(s,register('band-two','另一个乐队'));
    s=reduceState(s,{type:'phone_app',requestId:'invite-two',owner:'soyo',command:{type:'band_invite',bandId:'band-two',contactId:'stranger',role:'guitar'}});
    s=applyBandReply(s,'npc:invite-two','好。','accept');
    expect(parseState(s).livehouse!.profiles.filter(p=>p.personId==='stranger')).toEqual([profile]);
  });
  it('allows only music-major protagonists as invitees, preserves their own major and includes booked members in calendars',()=>{
    let s=withBand();expect(()=>invite(s,'invite-sakiko','protagonist-sakiko')).toThrow(/音乐专业/);
    s=reduceState(s,{type:'switch_protagonist',target:'sakiko'});
    s=reduceState(s,{type:'choose_academics',majorId:'music'});
    s=reduceState(s,{type:'switch_protagonist',target:'soyo'});
    s=invite(s,'invite-sakiko','protagonist-sakiko');
    expect(s.protagonists!.conversations!.at(-1)!.text).toContain('邀请');
    expect(bandReplyContext(s,'dual:invite-sakiko').invitation.bandName).toBe('未读乐队');
    s=applyBandReply(s,'dual:invite-sakiko','可以。','accept');s=atDesk(s,'book');s=reduceState(s,booking());
    expect(s.livehouse!.bookings[0]!.memberIds).toContain(musicPersonId('sakiko'));
    expect(s.protagonists!.devices.sakiko.calendar.some(e=>e.id==='live:show-one')).toBe(true);
    s=reduceState(s,{type:'switch_protagonist',target:'sakiko'});
    expect(livehousePhoneView(s,'sakiko').bands).toHaveLength(1);
    expect(()=>applyBandReply(s,'dual:invite-sakiko','可以。','accept')).toThrow(/来源/);
  });
  it('rejects missing invitation messages or members without an acceptance receipt on reload',()=>{
    const s=invite(contact(withBand()));
    const missing=JSON.parse(JSON.stringify(s));missing.protagonists.npcPhone.messages=[];expect(()=>parseState(missing)).toThrow(/短信/);
    const accepted=applyBandReply(s,'npc:invite-one','好。','accept');accepted.livehouse!.invitations=[];expect(()=>parseState(accepted)).toThrow(/邀请/);
  });
  it('does not lose a pending invitation when later ordinary messages receive replies',()=>{
    let s=invite(contact(withBand()));
    s=reduceState(s,{type:'phone_app',requestId:'normal',owner:'soyo',command:{type:'send_npc_message',npcId:'taki-contact',text:'明天有空吗？'}});
    s=applyNpcPhoneReply(s,'npc:normal','我看看。','taki-contact');
    expect(()=>bandReplyContext(s,'npc:invite-one')).not.toThrow();
    expect(applyBandReply(s,'npc:invite-one','好，一起。','accept').livehouse!.bands[0]!.members).toHaveLength(2);
  });
  it('rejects unlisted contacts and borrowed devices; failed saves can retry without leaving half an invitation',async()=>{
    let saved=contact(withBand()),failSave=true;
    const api=createWorldPhoneApi({session:'test-chat',current:()=>true,busy:()=>false,state:()=>saved,commit(action){const next=reduceState(saved,action);if(failSave)throw Error('保存失败');saved=next;return next;}});
    const view=api.read(),raw={binding:view.binding,revision:view.revision,requestId:'save-retry',owner:'soyo' as const,command:{type:'band_invite' as const,bandId:'band-one',contactId:'taki-contact',role:'drums' as const}};
    await expect(api.act(raw)).rejects.toThrow(/保存失败/);expect(saved.livehouse!.invitations).toHaveLength(0);
    failSave=false;await api.act(raw);await api.act(raw);
    expect(saved.livehouse!.invitations).toHaveLength(1);expect(saved.protagonists!.npcPhone!.messages).toHaveLength(1);
    expect(()=>invite(saved,'unknown','absent')).toThrow(/联系人/);
    expect(()=>reduceState(saved,{type:'phone_app',requestId:'borrow',owner:'sakiko',command:raw.command})).toThrow(/自己/);
  });
});
