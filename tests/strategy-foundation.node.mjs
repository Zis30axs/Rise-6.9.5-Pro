import assert from 'node:assert/strict';
import test from 'node:test';
import {
  STRATEGY_OWNERS, FOCUS_CATALOG, createStrategyState, parseStrategyState,
  applyStrategyCommand, settleStrategyState, checkCondition, calculateModifier,
  focusWeight, canStartFocus, focusBranchLocked,
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
test('secret -10000 redirects AI to MyGO while manual CRYCHIC remains legal',()=>{
  let s=createStrategyState(0);
  s.flags.sakiko_final_break=true;
  s.people.soyo.completed=['soyo_face_past'];
  let auto=command(s,{type:'set_control',owner:'soyo',controller:'auto',includeInPrompt:false},'auto');
  auto=settleStrategyState(auto,200);
  assert.equal(auto.people.soyo.active?.id,'soyo_mygo_future');
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

test('CRYCHIC and MyGO are mutually exclusive Soyo branch focuses',()=>{
  const crychic=FOCUS_CATALOG.find(f=>f.id==='soyo_rebuild_crychic');
  const mygo=FOCUS_CATALOG.find(f=>f.id==='soyo_mygo_future');
  assert.equal(crychic.branchGroup,mygo.branchGroup);
  let s=createStrategyState(0);
  s.people.soyo.completed=['soyo_face_past'];
  assert.equal(canStartFocus(s,'soyo',crychic),true);
  assert.equal(canStartFocus(s,'soyo',mygo),true);
  s=command(s,{type:'start_focus',owner:'soyo',focusId:'soyo_mygo_future'},'mygo-start');
  s=settleStrategyState(s,4320);
  assert.equal(s.flags.soyo_mygo_plan_ready,true);
  assert.equal(s.people.soyo.completed.includes('soyo_mygo_future'),true);
  assert.equal(canStartFocus(s,'soyo',crychic),false);
  assert.equal(s.flags.soyo_rebuild_plan_ready,undefined);
  assert.throws(()=>command(s,{type:'start_focus',owner:'soyo',focusId:'soyo_rebuild_crychic'},'try-crychic'),/未满足/);
  assert.deepEqual(parseStrategyState(JSON.parse(JSON.stringify(s)),4320),s);
  const old=createStrategyState(0);
  old.people.soyo.completed=['soyo_face_past','soyo_rebuild_crychic'];
  assert.equal(canStartFocus(old,'soyo',mygo),false,'old completed route locks newly added branch');
});

const routes = [
  ['soyo', 'soyo_face_past', 'soyo_mygo_future', 'soyo_mygo_bass', 'soyo_mygo_rehearsal', 'soyo_rebuild_crychic', 'soyo_crychic_score', 'soyo_resolve', 10],
  ['sakiko', 'sakiko_redefine_band', 'sakiko_write_overture', 'sakiko_stage_draft', 'sakiko_stage_draft', 'sakiko_leave_room', 'sakiko_rehearsal_draft', 'sakiko_resolve', 11],
  ['emma', 'emma_daily_circle', 'emma_small_tea_table', 'emma_tea_invitation', 'emma_tea_invitation', 'emma_check_in_notes', 'emma_time_to_listen', 'emma_trust', 11],
  ['renako', 'renako_small_circle', 'renako_one_invitation', 'renako_own_pace', 'renako_own_pace', 'renako_group_idea', 'renako_group_plan', 'renako_confidence', 11],
];
const focusById = new Map(FOCUS_CATALOG.map(focus => [focus.id, focus]));

for (const [owner, root, first, next, milestone, alternative, alternativeNext, stat, reward] of routes) {
  test(`${owner} can extend an old save through a complete route and lock its alternative`, () => {
    let state = createStrategyState(0);
    state.people[owner].completed = [root];
    delete state.majorQueue;
    state = parseStrategyState(state, 0);
    assert.equal(canStartFocus(state, owner, focusById.get(first)), true);
    assert.equal(canStartFocus(state, owner, focusById.get(alternative)), true);
    assert.equal(canStartFocus(state, owner, focusById.get(next)), false);
    assert.equal(focusBranchLocked(state, owner, focusById.get(alternativeNext)), false);

    for (const id of new Set([first, next, milestone])) {
      state = command(state, { type: 'start_focus', owner, focusId: id }, `start:${id}`);
      const finishAt = state.cursor + focusById.get(id).durationMinutes;
      state = settleStrategyState(state, finishAt);
      assert.ok(state.people[owner].completed.includes(id));
      assert.equal(canStartFocus(state, owner, focusById.get(alternative)), false);
      assert.equal(focusBranchLocked(state, owner, focusById.get(alternativeNext)), true);
    }
    assert.equal(state.stats[stat], reward);
    assert.equal(state.majorQueue.filter(row => row.focusId === milestone).length, 1);
    assert.deepEqual(parseStrategyState(JSON.parse(JSON.stringify(state)), state.cursor), state);
    for (const other of STRATEGY_OWNERS.filter(id => id !== owner)) {
      assert.deepEqual(state.people[other].completed, []);
    }
  });
}

test('a legacy completed CRYCHIC route unlocks its new follow-up and not the MyGO route', () => {
  const state = createStrategyState(0);
  state.people.soyo.completed = ['soyo_face_past', 'soyo_rebuild_crychic'];
  const saved = parseStrategyState(state, 0);
  assert.equal(canStartFocus(saved, 'soyo', focusById.get('soyo_crychic_score')), true);
  assert.equal(focusBranchLocked(saved, 'soyo', focusById.get('soyo_mygo_rehearsal')), true);
});
