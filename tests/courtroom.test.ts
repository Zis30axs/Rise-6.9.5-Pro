import { describe, expect, it } from 'vitest';
import { applyStoryActions, createInitialState, parseState, reduceState } from '../src/runtime/model';
import { activeProtagonist, enableProtagonists, personState } from '../src/runtime/protagonist-world';
import { getCampusInterior } from '../src/runtime/campus-interiors';
import { courtState, DAILY_COURT_CATEGORIES, parseCourtroom } from '../src/runtime/courtroom';
import { appiePayBalance } from '../src/runtime/dual-protagonists';
import { npcProfession } from '../src/runtime/npc-professions';

function inOffice(owner: 'soyo' | 'emma' = 'emma') {
  let state = enableProtagonists(createInitialState());
  if (owner !== 'soyo') state = reduceState(state, { type: 'switch_protagonist', target: owner });
  const room = getCampusInterior('legal-office')!;
  state.clock = { day: 2, hour: 9, minute: 0 };
  state.locationId = room.id;
  state.scene = {
    x: room.entrance.x, z: room.entrance.z, yaw: room.entrance.y,
    areaId: room.parentLocationId, seed: 'court-test', encounterId: null,
  };
  state.interior = { roomId: room.id, x: 0, z: 2, yaw: 0,
    activityId: null, lastRest: null, lastStudy: null };
  state.player.energy = 95;
  if (state.protagonists?.backgroundLife) {
    const cursor = (state.clock.day - 1) * 1440 + state.clock.hour * 60 + state.clock.minute;
    state.protagonists.backgroundLife.cursor = cursor;
    for (const person of Object.values(state.protagonists.backgroundLife.people))
      person.nextDecisionAt = Math.max(person.nextDecisionAt, cursor);
  }
  return parseState(state);
}

const offers = [
  { id:'trial-2-a',category:'civil' as const,title:'失踪的手表',client:'咖啡馆顾客',
    summary:'顾客与店员对手表丢失的责任存在争议。',difficulty:'easy' as const,rewardYen:8000,experience:100,preset:false },
  { id:'trial-2-b',category:'administrative' as const,title:'误寄的停业通知',client:'小店经营者',
    summary:'经营者认为停业告知程序不合法。',difficulty:'normal' as const,rewardYen:12000,experience:130,preset:false },
];
const boardAction = {type:'court_docket' as const, offers};
function withBoard(owner:'soyo'|'emma'='emma') {
  return applyStoryActions(inOffice(owner),[boardAction],'court-docket-2');
}
function openPreset() {
  const state = withBoard();
  const id = courtState(state).board!.offers.find(offer=>offer.preset)!.id;
  return reduceState(state,{type:'courtroom',phase:'accept-preset',offerId:id});
}

describe('freeform courtroom and legal services', () => {
  it('defaults to three everyday categories and migrates missing optional saves without clearing old career data', () => {
    const original=inOffice();
    expect(courtState(original).categories).toEqual(DAILY_COURT_CATEGORIES);
    expect(courtState(original).active).toBeNull();
    const legacy=structuredClone(original);
    delete legacy.courtroom;
    const restored=parseState(legacy);
    expect(courtState(restored).board).toBeNull();
    expect(restored.lawCareer).toEqual(original.lawCareer);
    expect(()=>parseCourtroom({...courtState(original),categories:['civil','civil']})).toThrow();
  });

  it('publishes three persistent offers, disallows same-day reroll, and locks the courtroom location',()=>{
    let state=withBoard();
    expect(activeProtagonist(state)).toBe('emma');
    expect(courtState(state).board?.offers).toHaveLength(3);
    expect(courtState(state).board?.day).toBe(2);
    expect(courtState(state).board?.offers.filter(item=>item.preset)).toHaveLength(1);
    expect(()=>applyStoryActions(state,[boardAction],'court-docket-repeat')).toThrow();
    const presetId=courtState(state).board!.offers[0]!.id;
    state=reduceState(state,{type:'courtroom',phase:'accept-preset',offerId:presetId});
    expect(courtState(state).active).toMatchObject({owner:'emma',source:'commission',steps:[]});
    expect(courtState(state).active?.truth).toBeTruthy();
    expect(courtState(state).active?.white).toContain('^');
    expect(()=>reduceState(state,{type:'novel_travel',locationId:'gate'})).toThrow(/庭审/);
    expect(()=>applyStoryActions(state,[{type:'rest',kind:'rest',minutes:10}],'court-rest')).toThrow(/庭审/);
    expect(parseState(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });

  it('records only genuine distinct court progress, advances game time, settles player reward once',()=>{
    let state=openPreset();
    const money=state.player.balance;
    const minute=state.clock.hour*60+state.clock.minute;
    state=applyStoryActions(state,[{type:'court_step',kind:'insight',key:'contract-terms',summary:'合同附页与主文矛盾'}],'court-insight');
    expect(state.clock.hour*60+state.clock.minute).toBe(minute+10);
    expect(courtState(state).active?.steps).toHaveLength(1);
    expect(()=>applyStoryActions(state,[{type:'court_step',kind:'insight',key:'contract-terms',summary:'重复陈述'}],'court-duplicate')).toThrow();
    const reward=courtState(state).active!.rewardYen;
    state=applyStoryActions(state,[{type:'court_finish',verdict:'win',summary:'法院依合同附页支持合理的返还请求。'}],'court-verdict');
    expect(courtState(state).active).toBeNull();
    expect(courtState(state).results.at(-1)).toMatchObject({owner:'emma',verdict:'win',solvedBy:'player',payout:reward});
    expect(state.player.balance-money).toBe(reward);
    expect(()=>applyStoryActions(state,[{type:'court_finish',verdict:'win',summary:'重复结案'}],'court-repeat-finish')).toThrow();
  });

  it('keeps opt-in serious criminal cases outside the ordinary three offers',()=>{
    let state=withBoard();
    const boardIds=courtState(state).board!.offers.map(item=>item.id);
    state=applyStoryActions(state,[{type:'court_special',offer:{
      id:'special-2',category:'major-criminal',title:'严重刑事特殊委托',client:'临时委托人',
      summary:'仅在玩家主动选择时开放的案件。',difficulty:'hard',rewardYen:40000,experience:300,preset:false,
    }}],'court-special-2');
    expect(courtState(state).board!.offers.map(item=>item.id)).toEqual(boardIds);
    expect(courtState(state).special?.offer.category).toBe('major-criminal');
    expect(()=>applyStoryActions(state,[boardAction],'court-special-board-repeat')).toThrow();
  });

  it('lets an LLM quote legal risks before any charges and uses the existing two-sided transfer ledger',()=>{
    let state=inOffice();
    const before=state.player.balance;
    const recipientBalance=appiePayBalance(state.protagonists!.accounts,'sakiko');
    const quote={type:'court_quote' as const,defendant:'长崎素世',
      reason:'原告声称对方不当招揽乐队成员。',
      risk:'邀请加入其他乐队通常不足以当然构成不正当竞争，存在败诉风险。',
      category:'civil' as const,lawyer:'sakiko' as const,sherry:true,
      courtFeeYen:800,lawyerFeeYen:1500,sherryFeeYen:300};
    state=applyStoryActions(state,[quote],'court-quote-2');
    expect(state.player.balance).toBe(before);
    expect(courtState(state).filing?.risk).toContain('败诉');
    expect(courtState(state).filing?.claimant).toBe('emma');
    state=reduceState(state,{type:'courtroom',phase:'confirm-filing'});
    expect(courtState(state).active).toMatchObject({source:'lawsuit',owner:'emma',truth:null,rewardYen:0});
    expect(state.player.balance).toBe(before-2600);
    expect(appiePayBalance(state.protagonists!.accounts,'sakiko')-recipientBalance).toBe(150000);
    expect(state.protagonists?.npcWallets?.['majo-sherry']).toBe(30000);
    expect(()=>reduceState(state,{type:'courtroom',phase:'confirm-filing'})).toThrow();
    state=applyStoryActions(state,[{type:'court_finish',verdict:'loss',summary:'原告无法证明违法，诉讼请求未获支持。'}],'court-lawsuit-loss');
    expect(courtState(state).results.at(-1)).toMatchObject({source:'lawsuit',verdict:'loss',payout:0});
    expect(courtState(state).active).toBeNull();
  });

  it('Sherry rescue still produces a successful professional conclusion at 40 percent',()=>{
    let state=openPreset();
    const reward=courtState(state).active!.rewardYen;
    const original=state.player.balance;
    state=applyStoryActions(state,[{type:'court_finish',verdict:'loss',summary:'艾玛对证据提出的主张未能成立。'}],'court-rescue');
    expect(courtState(state).results.at(-1)).toMatchObject({
      verdict:'win',solvedBy:'sherry',payout:Math.round(reward*.4),
    });
    expect(state.player.balance-original).toBe(Math.round(reward*.4));
    expect(npcProfession(state,'majo-sherry')!.careerExperience).toBeGreaterThan(0);
    const other=openPreset();
    const rescued=reduceState(other,{type:'courtroom',phase:'sherry'});
    expect(courtState(rescued).active).toBeNull();
    expect(courtState(rescued).results.at(-1)).toMatchObject({solvedBy:'sherry',payout:Math.round(reward*.4)});
  });

  it('switching protagonists forfeits the current trial with zero payout and a single respectful return recap',()=>{
    let state=openPreset();
    const money=state.player.balance;
    state=reduceState(state,{type:'switch_protagonist',target:'soyo'});
    expect(activeProtagonist(state)).toBe('soyo');
    expect(courtState(state).active).toBeNull();
    expect(courtState(state).results.at(-1)).toMatchObject({solvedBy:'forfeit',verdict:'loss',payout:0,experience:0});
    expect(personState(state,'emma').player.balance).toBe(money);
    expect(courtState(state).pendingRecaps.emma).toContain('表现');
    state=reduceState(state,{type:'switch_protagonist',target:'emma'});
    expect(courtState(state).pendingRecaps.emma).toBeUndefined();
    expect(state.story.at(-1)?.text).toContain('橘雪莉');
    expect(state.story.at(-1)?.text).not.toMatch(/逃跑|临阵脱逃|不告而别/);
    const length=state.story.length;
    state=reduceState(state,{type:'switch_protagonist',target:'soyo'});
    state=reduceState(state,{type:'switch_protagonist',target:'emma'});
    expect(state.story).toHaveLength(length);
  });
});
