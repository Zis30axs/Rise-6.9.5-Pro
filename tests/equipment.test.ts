import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyStoryActions, commitStoryTurn, createInitialState, parseState, reduceState } from '../src/runtime/model';
import { activeProtagonist, enableProtagonists, legacyView, personalState, personState } from '../src/runtime/protagonist-world';
import { CRYCHIC_PHOTO, MYGO_PHOTO, equipmentContext, equipmentQuote } from '../src/runtime/equipment';
import { getAcademicStudyQuote, MAX_ACADEMIC_POINTS } from '../src/runtime/academics';
import { applySocialSkillTurn } from '../src/runtime/social-skills';
import { initializeBackgroundLife } from '../src/runtime/background-life';
import { isGameplayInteraction } from '../src/frontend/interaction-controller';
import type { ProtagonistId } from '../src/runtime/dual-protagonists';
import type { StoryAction, WorldState } from '../src/frontend/types';

const photo = { itemId: CRYCHIC_PHOTO };
const mygoPhoto = { itemId: MYGO_PHOTO };
const equip: StoryAction = { type: 'equip', ...photo };
const unequip: StoryAction = { type: 'unequip', ...photo };
const social = (skillId: 'expression' | 'empathy' = 'expression'): StoryAction => ({ type: 'social_skill', skillId, deviation: 3, reason: '认真表达自己的想法' });
const study = (subjectId = 'music-theory', minutes = 30): StoryAction => ({ type: 'study', subjectId, minutes });
const roundTrip = (s: WorldState) => parseState(JSON.parse(JSON.stringify(s)));
function fresh(owner: ProtagonistId = 'soyo', majorId: string | null = 'music') {
  let s = enableProtagonists(createInitialState());
  if (owner !== 'soyo') s = reduceState(s, { type: 'switch_protagonist', target: owner });
  if (majorId) s = reduceState(s, { type: 'choose_academics', majorId });
  return s;
}
function atBookshop(s: WorldState) {
  s = structuredClone(s);
  s.locationId = 'bookshop'; s.scene = null; s.interior = null;
  return s;
}
const worn = (s: WorldState) => reduceState(s, { type: 'equip_item', ...photo });
const skill = (s: WorldState, owner = activeProtagonist(s)) => s.protagonists!.socialSkills!.people[owner];
afterEach(() => vi.restoreAllMocks());

describe('CRYCHIC photo equipment', () => {
  it('grants each original owner their unequipped keepsakes when loading an old world under any viewpoint', () => {
    let s = fresh('renako');
    for (const id of ['soyo','sakiko','emma','renako'] as const) personState(s,id).inventory = [];
    const old = structuredClone(s);
    s = roundTrip(s);
    expect(old.inventory).toEqual([]);
    expect(personState(s,'soyo').inventory).toEqual([{ ...photo, quantity: 1 }, { ...mygoPhoto, quantity: 1 }]);
    expect(personState(s,'sakiko').inventory).toEqual([{ ...photo, quantity: 1 }]);
    for (const id of ['emma','renako'] as const) expect(personState(s,id).inventory).toEqual([]);
    expect(roundTrip(s)).toEqual(s);
  });
  it('does not change time, body, quantity, or cause random events when equipping; repeats are idempotent', () => {
    const s = fresh(), result = worn(s);
    expect(result.clock).toEqual(s.clock); expect(result.player).toEqual(s.player);
    expect(result.inventory).toEqual([{ ...photo, quantity: 1, equipped: true }, { ...mygoPhoto, quantity: 1 }]);
    expect(worn(result)).toEqual(result);
    expect(isGameplayInteraction({type:'equip_item',...photo})).toBe(false);
    expect(isGameplayInteraction({type:'unequip_item',...photo})).toBe(false);
  });
  it.each([
    ['soyo','music','music-theory',45,.25],
    ['sakiko','music','music-theory',45,.5],
    ['soyo','computer-science','cs-programming',15,.5],
    ['sakiko','computer-science','cs-programming',45,1],
  ] as const)('%s / %s gets the authored major and social gains', (owner,major,subject,points,socialMultiplier) => {
    const s = atBookshop(worn(fresh(owner,major)));
    const result = applyStoryActions(s,[study(subject)],'major-gain');
    expect(result.academics!.lastGain!.points).toBe(points);
    expect(equipmentQuote(result,owner,CRYCHIC_PHOTO).profile?.social).toBe(socialMultiplier);
    const trained=applyStoryActions(result,[social()],'skill-gain');
    expect(skill(trained).xp.expression-skill(result).xp.expression).toBe(Math.floor(6*socialMultiplier));
    expect(roundTrip(trained)).toEqual(trained);
  });
  it.each(['soyo','sakiko'] as const)('retains cross-major outcome/cost and changes only music XP for %s', owner => {
    const s = atBookshop(fresh(owner,'computer-science'));
    const bare = applyStoryActions(s,[study('music-theory',15)],'cross');
    const result = applyStoryActions(worn(s),[study('music-theory',15)],'cross');
    expect(result.academics!.lastGain!.points).toBe(bare.academics!.lastGain!.points*(owner==='soyo'?1.5:.5));
    expect(result.academics!.lastGain!.outcome).toBe(bare.academics!.lastGain!.outcome);
    expect(result.player).toEqual(bare.player); expect(result.clock).toEqual(bare.clock);
    const other=applyStoryActions(worn(s),[study('math-calculus')],'unrelated');
    const otherBare=applyStoryActions(s,[study('math-calculus')],'unrelated');
    expect(other.academics).toEqual(otherBare.academics);
  });
  it('preserves quarter points for a 15-minute cross-major confusion result through UI and reload', () => {
    const s = atBookshop(worn(fresh('soyo','computer-science')));
    vi.spyOn(Math,'random').mockReturnValueOnce(0).mockReturnValueOnce(.3);
    const result=reduceState(s,{type:'read_subject',subjectId:'music-theory',optionId:'study-short'});
    expect(result.academics!.lastGain).toMatchObject({minutes:15,outcome:'confusion',points:11.25,equipmentProfile:'soyo-other-v1'});
    expect(roundTrip(result)).toEqual(result);
  });
  it('unequipping restores the formula immediately and does not invalidate the last boosted record', () => {
    let s=applyStoryActions(atBookshop(worn(fresh())),[study()],'boost');
    s=reduceState(s,{type:'unequip_item',...photo});
    expect(roundTrip(s).academics!.lastGain!.points).toBe(45);
    s=applyStoryActions(s,[study()],'plain');
    expect(s.academics!.lastGain!.points).toBe(30);
    expect(s.academics!.lastGain!.equipmentProfile).toBeUndefined();
  });
  it('uses the equipment at each action, including social actions before/after unequipping', () => {
    const s=atBookshop(fresh());
    const a=applyStoryActions(s,[equip,study(),social(),unequip,study()],'ordered');
    expect(a.academics!.subjects[0]!.points).toBe(75);
    expect(skill(a).latest?.earned).toBe(1);
    const b=applyStoryActions(worn(s),[unequip,social(),equip],'ordered-other');
    expect(skill(b).latest?.earned).toBe(6);
  });
  it('keeps social fractions per person and skill through reloads, switches and unequips', () => {
    const original=atBookshop(worn(fresh()));
    let s=applyStoryActions(original,[social()],'fraction-1');
    expect(skill(s).xpRemainders?.expression).toBe(2);
    s=roundTrip(s);
    s=reduceState(s,{type:'unequip_item',...photo});
    s=applyStoryActions(s,[social()],'fraction-unworn');
    expect(skill(s).latest?.earned).toBe(6);
    expect(skill(s).xpRemainders?.expression).toBe(2);
    s=worn(s);
    s=applyStoryActions(s,[social('empathy')],'fraction-empathy');
    expect(skill(s).xpRemainders).toEqual({expression:2,empathy:2});
    s=reduceState(s,{type:'switch_protagonist',target:'sakiko'});
    expect(skill(s).xpRemainders).toBeUndefined();
    expect(s.inventory[0]?.equipped).toBeUndefined();
    s=reduceState(s,{type:'switch_protagonist',target:'soyo'});
    s=applyStoryActions(roundTrip(s),[social()],'fraction-2');
    expect(skill(s).latest?.earned).toBe(2);
    expect(skill(s).xpRemainders).toEqual({empathy:2});
    expect(skill(s).xp.expression-skill(original).xp.expression).toBe(9);
  });
  it('retains original social costs, relationship rules, daily cap and replay protection', () => {
    const s=fresh();
    const bare=applyStoryActions(s,[social()],'bare-social');
    const result=applyStoryActions(worn(s),[social()],'boost-social');
    expect(result.player).toEqual(bare.player);
    expect(applySocialSkillTurn(result,[social()],'boost-social')).toEqual(result);
    let near=worn(fresh()); skill(near).daily={day:near.clock.day,earned:23};
    skill(near).xpRemainders={expression:3};
    near=applyStoryActions(near,[social()],'at-cap');
    expect(skill(near).daily.earned).toBe(24);
    expect(skill(near).xpRemainders?.expression).toBeUndefined();
    near=applyStoryActions(near,[social()],'over-cap');
    expect(skill(near).latest?.earned).toBe(0);
    expect(skill(near).xpRemainders?.expression).toBeUndefined();
  });
  it('does not affect unassigned majors; correct_academics immediately selects the new profile', () => {
    let s=worn(fresh('sakiko',null));
    expect(equipmentContext(s)[0]!.effects).toBeNull();
    s=reduceState(s,{type:'choose_academics',majorId:'music'});
    expect(equipmentQuote(s,'sakiko',CRYCHIC_PHOTO).profile?.social).toBe(.5);
    s=reduceState(s,{type:'correct_academics',majorId:'law',keepProgress:true});
    expect(equipmentQuote(s,'sakiko',CRYCHIC_PHOTO).profile?.social).toBe(1);
  });
  it('background personal views carry their actual owner, including quarter-point history', () => {
    const world=atBookshop(worn(fresh('sakiko','computer-science')));
    const view={...legacyView(world),...personalState(personState(world,'sakiko'))};
    const result=applyStoryActions(view,[study('cs-programming')],'background-sakiko','sakiko');
    expect(result.academics!.lastGain).toMatchObject({points:45,equipmentProfile:'sakiko-other-v1'});
    const next=reduceState(reduceState(world,{type:'wait',minutes:30}),{type:'switch_protagonist',target:'soyo'});
    personState(next,'sakiko').academics=result.academics;
    expect(roundTrip(next).protagonists).toEqual(next.protagonists);
  });
  it.each(['soyo','sakiko'] as const)('settles the actual inactive classroom schedule for %s', owner => {
    let s=reduceState(worn(fresh(owner)),{type:'novel_travel',locationId:'classroom'});
    s.clock={day:12,hour:8,minute:30};
    s.protagonists!.backgroundLife=initializeBackgroundLife(s);
    s=reduceState(s,{type:'switch_protagonist',target:owner==='soyo'?'sakiko':'soyo'});
    s=reduceState(s,{type:'wait',minutes:90});
    const academic=personState(s,owner).academics!;
    expect(academic.lastGain?.equipmentProfile).toBe(`${owner}-music-v1`);
    expect(academic.lastGain!.points).toBe(academic.lastGain!.minutes*1.5);
    expect(roundTrip(s)).toEqual(s);
  });
  it('preserves a non-active owner on travel and does not grant other protagonists a photo', () => {
    let s=applyStoryActions(atBookshop(worn(fresh('sakiko','computer-science'))),[study('cs-programming')],'before-travel');
    const view=legacyView(s);
    const traveled=reduceState(view,{type:'novel_travel',locationId:'classroom'},'sakiko');
    expect(traveled.academics!.lastGain!.equipmentProfile).toBe('sakiko-other-v1');
    expect(traveled.locationId).toBe('classroom');
    const emma=reduceState(legacyView(fresh('emma')),{type:'wait',minutes:15},'emma');
    expect(emma.inventory).toEqual([]);
  });
  it('rejects forged fractions and wrong-owner historical profile IDs', () => {
    const s=applyStoryActions(atBookshop(worn(fresh())),[study()],'receipt-owner');
    s.academics!.lastGain!.equipmentProfile='sakiko-music-v1';
    expect(()=>roundTrip(s)).toThrow('不属于当前人物');
    const bad=fresh();skill(bad).xpRemainders={expression:4};
    expect(()=>roundTrip(bad)).toThrow();
  });
  it('includes the equipment factor in preflight progress caps without drawing randomness', () => {
    const s=atBookshop(worn(fresh()));
    s.academics!.subjects[0]!.points=MAX_ACADEMIC_POINTS-40;
    const random=vi.spyOn(Math,'random');
    expect(getAcademicStudyQuote(s,{subjectId:'music-theory',optionId:'study-short'}).blockedReason).toContain('上限');
    expect(random).not.toHaveBeenCalled();
  });
  it('rejects unknown, consumed, gifted, duplicate and wrong-owner equipment or receipts atomically', () => {
    const s=fresh(); const snapshot=structuredClone(s);
    expect(()=>reduceState(s,{type:'use_item',...photo})).toThrow();
    expect(()=>applyStoryActions(s,[{type:'gift',...photo,quantity:1,npcId:s.contacts[0]!.id,affinityDelta:1,reason:'送出'}],'gift')).toThrow();
    expect(()=>applyStoryActions(s,[equip,{type:'equip',itemId:'missing'}],'invalid')).toThrow();
    expect(()=>reduceState(fresh('emma'),{type:'equip_item',...photo})).toThrow();
    expect(()=>parseState({...s,inventory:[...s.inventory,...s.inventory]})).toThrow();
    const bad=fresh('renako'); bad.inventory=[{...photo,quantity:1,equipped:true}];
    expect(()=>parseState(bad)).toThrow();
    expect(s).toEqual(snapshot);
    const boosted=applyStoryActions(atBookshop(worn(s)),[study()],'history');
    boosted.academics!.lastGain!.points=44;
    expect(()=>parseState(boosted)).toThrow();
  });
  it('commits and replays a narrated mixed equipment turn only once', () => {
    const s=atBookshop(fresh());
    const result={text:'素世看了一眼合照，收起后翻开课本。',phoneMessages:[],worldActions:[equip,study(),social(),unequip]};
    const ids={userId:'equipment-user',assistantId:'equipment-assistant'};
    const committed=commitStoryTurn(s,'随身带着合照学习，然后收起来。',result,ids);
    expect(commitStoryTurn(committed,'随身带着合照学习，然后收起来。',result,ids)).toEqual(committed);
    expect(roundTrip(committed)).toEqual(committed);
  });
});
