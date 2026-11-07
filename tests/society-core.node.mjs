import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSocietyState,parseSocietyState,applySocietyCommand,currentBandAdvisors,settleSocietyState} from '../src/runtime/society.ts';
const bands=[{id:'new-band',founder:'soyo',members:[{personId:'protagonist-soyo'},{personId:'protagonist-sakiko'}]},{id:'other-band',founder:'sakiko',members:[{personId:'protagonist-sakiko'}]}];
const ctx=(actor='soyo')=>({at:999,actor,personId:`protagonist-${actor}`,knownPersonIds:['protagonist-soyo','protagonist-sakiko','protagonist-emma'],bands});
const apply=(s,cmd,id,actor='soyo')=>applySocietyCommand(s,cmd,id,ctx(actor));
test('old-save initialization and strict roundtrip',()=>{
 const s=createSocietyState();assert.deepEqual(parseSocietyState(JSON.parse(JSON.stringify(s)),999),s);
 assert.throws(()=>parseSocietyState({...s, injected:'foo'},999),/字段/);
});
test('circle invitations require real known contacts and self acceptance',()=>{
 let s=apply(createSocietyState(),{type:'create_circle',id:'little-circle',title:'小小的社交圈'},'c1');
 assert.deepEqual(s.circles[0].memberIds,['protagonist-soyo']);
 assert.throws(()=>apply(s,{type:'invite_circle',circleId:'little-circle',personId:'unknown'},'bad'),/真实认识/);
 s=apply(s,{type:'invite_circle',circleId:'little-circle',personId:'protagonist-sakiko'},'i1');
 assert.throws(()=>apply(s,{type:'accept_circle',invitationId:'i1',accepted:true},'bad2','soyo'),/本人/);
 s=apply(s,{type:'accept_circle',invitationId:'i1',accepted:true},'a1','sakiko');
 assert.deepEqual(s.circles[0].memberIds,['protagonist-soyo','protagonist-sakiko']);
 assert.deepEqual(apply(s,{type:'accept_circle',invitationId:'i1',accepted:true},'a1','sakiko'),s);
 assert.throws(()=>apply(s,{type:'accept_circle',invitationId:'i1',accepted:false},'a1','sakiko'),/重复/);
 s=apply(s,{type:'leave_circle',circleId:'little-circle'},'l1','sakiko');
 assert.deepEqual(s.circles[0].memberIds,['protagonist-soyo']);
 assert.throws(()=>apply(s,{type:'leave_circle',circleId:'little-circle'},'l2','soyo'),/创建者/);
});
test('coalitions accept independent organizations through approved requests, overlapping possible',()=>{
 let s=apply(createSocietyState(),{type:'create_circle',id:'cozy',title:'安静茶会'},'c1');
 s=apply(s,{type:'create_union',id:'tokyo-community',title:'东京协作网络',groupId:'circle:cozy'},'u1');
 s=apply(s,{type:'propose_union',unionId:'tokyo-community',groupId:'band:other-band'},'p1','sakiko');
 assert.throws(()=>apply(s,{type:'approve_union',applicationId:'p1',accepted:true},'bad','sakiko'),/协调者/);
 s=apply(s,{type:'approve_union',applicationId:'p1',accepted:true},'ok','soyo');
 assert.deepEqual(s.unions[0].groupIds,['circle:cozy','band:other-band']);
 s=apply(s,{type:'create_union',id:'another-union',title:'另一联合体',groupId:'band:other-band'},'u2','sakiko');
 assert.deepEqual(s.unions[1].groupIds,['band:other-band']);
 s=apply(s,{type:'leave_union',unionId:'tokyo-community',groupId:'band:other-band'},'leave','sakiko');
 assert.deepEqual(s.unions[0].groupIds,['circle:cozy']);
});
test('formal adviser is restricted to founder and canonical livehouse roster',()=>{
 let s=createSocietyState();
 assert.throws(()=>apply(s,{type:'appoint_advisor',bandId:'new-band',seat:'music',personId:'fake-member'},'bad'),/真实成员/);
 assert.throws(()=>apply(s,{type:'appoint_advisor',bandId:'new-band',seat:'music',personId:'protagonist-sakiko'},'bad2','sakiko'),/自己乐队/);
 s=apply(s,{type:'appoint_advisor',bandId:'new-band',seat:'music',personId:'protagonist-sakiko'},'appoint');
 assert.equal(currentBandAdvisors(s,ctx(),'new-band').length,1);
 const detached={...ctx(),bands:[{...bands[0],members:[{personId:'protagonist-soyo'}]}]};
 assert.equal(currentBandAdvisors(s,detached,'new-band').length,0);
 assert.equal(s.advisors.length,1);
 s=apply(s,{type:'dismiss_advisor',bandId:'new-band',seat:'music'},'dismiss');
 assert.equal(s.advisors.length,0);
});

test('shared contest expires once, resolves on the new snapshot, and leaves the old save unchanged',()=>{
 let s=apply(createSocietyState(),{type:'open_contest',id:'stage-slot',title:'舞台机会',targetId:'opportunity:stage',targetKind:'opportunity',durationMinutes:120},'open');
 s=apply(s,{type:'join_contest',contestId:'stage-slot'},'join','sakiko');
 s=apply(s,{type:'contribute_contest',contestId:'stage-slot',effort:'large'},'vote','soyo');
 const original=JSON.stringify(s);
 const settled=settleSocietyState(s,1120);
 assert.equal(JSON.stringify(s),original,'input cannot be mutated');
 assert.equal(settled.contests[0].status,'resolved');
 assert.equal(settled.contests[0].winner,'soyo');
 assert.equal(settled.contests[0].resolvedAt,1119);
 assert.equal(settleSocietyState(settled,1220),settled,'second settlement is a no-op');
 assert.equal(settled.history.filter(x=>x.kind==='contest_resolved').length,1);
});
