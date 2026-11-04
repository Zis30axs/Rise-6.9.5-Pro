import assert from 'node:assert/strict';
import test from 'node:test';
import {
  STRATEGY_OWNERS, FOCUS_CATALOG, createStrategyState, parseStrategyState,
  applyStrategyCommand, settleStrategyState, checkCondition, calculateModifier,
  focusWeight, canStartFocus,
} from '../src/runtime/strategy.ts';

const command = (s, c, id) => applyStrategyCommand(s,c,id);
test('four independent owners and old-save initialization', () => {
  const s=createStrategyState(1200);
  assert.deepEqual(Object.keys(s.people),[...STRATEGY_OWNERS]);
  assert.equal(s.people.soyo.includeInPrompt,false);
  assert.deepEqual(parseStrategyState(s,1200),s);
});
test('registered, nested conditions with objective hidden facts', () => {
  const s=createStrategyState(20);
  const ctx={state:s,owner:'soyo'};
  assert.equal(checkCondition({all:[{always:true},{not:{flag:'sakiko_final_break'}}]},ctx),true);
  assert.equal(checkCondition({stat:'soyo_resolve',gte:0,lte:0},ctx),true);
  assert.equal(checkCondition({completed:'soyo_face_past'},ctx),false);
});
test('AI View weighs the Soyo trait and the secret -10000 without disclosing it', () => {
  let s=createStrategyState(0);
  const f=FOCUS_CATALOG.find(row=>row.id==='soyo_rebuild_crychic');
  assert.equal(focusWeight(s,'soyo',f).value,150);
  s.flags.sakiko_final_break=true;
  assert.equal(focusWeight(s,'soyo',f).value,-9850);
  assert.equal(s.people.soyo.includeInPrompt,false);
  assert.equal(canStartFocus(s,'soyo',f),false); // prerequisite, not secret
});
test('independent automation, progress, completion effect, and time-slice determinism', () => {
  let state=createStrategyState(0);
  state=command(state,{type:'set_control',owner:'soyo',controller:'auto',includeInPrompt:false},'autoon');
  let long=settleStrategyState(state,7000);
  let chunks=settleStrategyState(settleStrategyState(state,1000),7000);
  assert.deepEqual(chunks,long);
  assert.equal(long.flags.soyo_looked_back,true);
  assert.equal(long.flags.soyo_rebuild_plan_ready,true);
  assert.deepEqual(long.people.soyo.completed,['soyo_face_past','soyo_rebuild_crychic']);
  assert.deepEqual(long.people.sakiko.completed,[]);
});
test('negative AI score keeps reassembly route unselected while manual start remains legal',()=>{
  let s=createStrategyState(0);
  s.flags.sakiko_final_break=true;
  s.people.soyo.completed=['soyo_face_past'];
  let auto=command(s,{type:'set_control',owner:'soyo',controller:'auto',includeInPrompt:false},'auto');
  auto=settleStrategyState(auto,200);
  assert.equal(auto.people.soyo.active,null);
  let manual=command(s,{type:'start_focus',owner:'soyo',focusId:'soyo_rebuild_crychic'},'manual');
  assert.equal(manual.people.soyo.active.id,'soyo_rebuild_crychic');
});
test('manual progress, bypass is not completion reward',()=>{
  let s=createStrategyState(0);
  s.people.soyo.completed=['soyo_face_past'];
  s=command(s,{type:'start_focus',owner:'soyo',focusId:'soyo_rebuild_crychic'},'start');
  s.flags.crychic_reunited=true;
  const done=settleStrategyState(s,60);
  assert.equal(done.people.soyo.active,null);
  assert.equal(done.people.soyo.completed.includes('soyo_rebuild_crychic'),true);
  assert.equal(done.flags.soyo_rebuild_plan_ready,undefined);
  assert.equal(done.history.at(-1).kind,'bypass');
});
test('decision cooldown and receipt idempotency',()=>{
  let s=createStrategyState(100);
  s.people.soyo.completed=['soyo_face_past'];
  const c={type:'choose_decision',owner:'soyo',decisionId:'soyo_sort_memories'};
  s=command(s,c,'choose-1');
  assert.equal(s.stats.soyo_resolve,5);
  assert.equal(command(s,c,'choose-1'),s);
  assert.throws(()=>command(s,{type:'cancel_focus',owner:'soyo'},'choose-1'));
  assert.throws(()=>command(s,c,'choose-2'),/冷却/);
});
test('injected unknown values and malformed state are rejected',()=>{
  const s=createStrategyState(10);
  assert.throws(()=>parseStrategyState({...s,unknown:1},10));
  assert.throws(()=>parseStrategyState({...s,flags:{arbitrary:true}},10));
  assert.throws(()=>parseStrategyState({...s,people:{...s.people,soyo:{...s.people.soyo,active:{id:'nope',progress:2,startedAt:0}}}},10));
  assert.throws(()=>parseStrategyState({...s,cursor:12},10));
});
test('modifier details expose trait source, not an invented global bonus',()=>{
  const s=createStrategyState(0);
  const score=calculateModifier({state:s,owner:'soyo'},'focus_ai_weight',100,'soyo_rebuild_crychic');
  assert.equal(score.value,150);
  assert.equal(score.breakdown[0].source,'trait:soyo_crychic_obsession');
});
