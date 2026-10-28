import { describe, expect, it } from 'vitest';
import { applyStoryActions, createInitialState, parseState, reduceState } from '../src/runtime/model';
import { activeProtagonist, enableProtagonists, personState } from '../src/runtime/protagonist-world';
import { getCampusInterior } from '../src/runtime/campus-interiors';
import { courtState, courtStoryContext, DAILY_COURT_CATEGORIES, parseCourtroom } from '../src/runtime/courtroom';
import { appiePayBalance } from '../src/runtime/dual-protagonists';
import { npcProfession } from '../src/runtime/npc-professions';
import { worldScenePeople } from '../src/runtime/world-presence';

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
  { id:'trial-2-b',category:'minor-criminal' as const,title:'配送箱的误会',client:'被误认为盗窃货物的店员',
    summary:'临时转运与库存登记之间存在时间差。',difficulty:'normal' as const,rewardYen:12000,experience:130,preset:false },
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
    expect(new Set(courtState(state).board!.offers.map(row => row.category))).toEqual(new Set(DAILY_COURT_CATEGORIES));
    expect(()=>applyStoryActions(state,[boardAction],'court-docket-repeat')).toThrow();
    const presetId=courtState(state).board!.offers[0]!.id;
    state=reduceState(state,{type:'courtroom',phase:'accept-preset',offerId:presetId});
    expect(courtState(state).active).toMatchObject({owner:'emma',source:'commission',assistance:'none',steps:[]});
    expect(courtState(state).active?.truth).toBeNull();
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

  it('accepts a new reasoning milestone and verdict in the same model response without double paying',()=>{
    const original=openPreset();
    const amount=original.courtroom!.active!.rewardYen;
    const balance=original.player.balance;
    const closed=applyStoryActions(original,[
      {type:'court_step',kind:'contradiction',key:'final-contradiction',summary:'证据已证实核心证言矛盾'},
      {type:'court_finish',verdict:'win',summary:'法庭认可关键矛盾，支持当事人的请求。'},
    ],'court-final-same-turn');
    expect(closed.courtroom?.active).toBeNull();
    expect(closed.courtroom?.results.at(-1)).toMatchObject({verdict:'win',payout:amount});
    expect(closed.player.balance-balance).toBe(amount);
    expect(()=>applyStoryActions(closed,[{type:'court_finish',verdict:'win',summary:'重复'}],'court-final-again')).toThrow();
  });

  it('starts model-generated cases with a persisted non-assisted state',()=>{
    const board=withBoard();
    const chosen=board.courtroom!.board!.offers.find(item=>!item.preset)!;
    const opened=applyStoryActions(board,[{
      type:'court_open',offerId:chosen.id,respondent:'临时货运店员',
      white:'店员受到怀疑，证据与证词之间存在矛盾。',
      evidence:[{title:'门禁记录',detail:'登记时间有误差'},{title:'交接单',detail:'另有签收者'}],

    }],'generated-court-open');
    expect(opened.courtroom?.active?.assistance).toBe('none');
    expect(opened.courtroom?.active?.owner).toBe('emma');
    expect(parseState(JSON.parse(JSON.stringify(opened))).courtroom?.active?.truth).toBeNull();
    expect(courtStoryContext(opened).active).not.toHaveProperty('hiddenBlackScript');
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

  it('forbids a new lawsuit against any of the four playable protagonists',()=>{
    for(const defendant of ['soyo','素世','长崎 素世','長崎そよ','sakiko','祥子','豐川祥子',
      'emma','艾玛','majo-emma','樱羽艾玛','renako','玲奈子','watanare-renako','甘织玲奈子']){
      expect(()=>applyStoryActions(inOffice(),[{type:'court_quote',defendant,
        reason:'单纯想针对一名主角',risk:'缺乏法律依据',category:'civil',
        lawyer:null,sherry:false,courtFeeYen:0,lawyerFeeYen:0,sherryFeeYen:0,
      }],'reject-playable-defendant')).toThrow(/主角/);
    }
  });

  it('lets an LLM quote legal risks before any charges and uses the existing two-sided transfer ledger',()=>{
    let state=inOffice();
    const before=state.player.balance;
    const recipientBalance=appiePayBalance(state.protagonists!.accounts,'sakiko');
    const quote={type:'court_quote' as const,defendant:'月代雪',
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
    expect(courtState(state).results.at(-1)?.defendant).toBe('月代雪');
    const defendantView=reduceState(state,{type:'switch_protagonist',target:'soyo'});
    expect(courtStoryContext(defendantView).recentResults.some(row=>row.defendant==='月代雪')).toBe(false);
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

  it('does not reduce independent rewards just because Sherry was mentioned in the verdict',()=>{
    let alone=openPreset();
    const full=alone.courtroom!.active!.rewardYen;
    alone=applyStoryActions(alone,[
      {type:'court_step',kind:'insight',key:'player-solved',summary:'艾玛独立完成了关键证明'},
      {type:'court_finish',verdict:'win',summary:'雪莉给出一般建议，艾玛自行完成全部论证。'},
    ],'independent-with-advice');
    expect(alone.courtroom?.results.at(-1)?.payout).toBe(full);
    expect(alone.courtroom?.results.at(-1)?.solvedBy).toBe('player');
    let assisted=openPreset();
    assisted=applyStoryActions(assisted,[
      {type:'court_assist',who:'sherry'},
    ],'explicit-sherry-state');
    expect(assisted.courtroom?.active?.assistance).toBe('sherry');
    expect(parseState(JSON.parse(JSON.stringify(assisted))).courtroom?.active?.assistance).toBe('sherry');
    assisted=applyStoryActions(assisted,[{
      type:'court_finish',verdict:'win',summary:'艾玛请求雪莉接手，雪莉依据已保存的证据完成论证。',
    }],'explicit-sherry-takeover');
    expect(assisted.courtroom?.results.at(-1)?.payout).toBe(Math.round(full*.4));
    expect(assisted.courtroom?.results.at(-1)?.solvedBy).toBe('sherry');
    expect(()=>applyStoryActions(openPreset(),[{type:'court_finish',verdict:'win',summary:'仅靠文本写了雪莉接手'}],'no-assist-text')).toThrow(/推理/);
    const atomic = applyStoryActions(openPreset(),[
      {type:'court_assist',who:'sherry'},
      {type:'court_finish',verdict:'win',summary:'雪莉完成了关键论证。'},
    ],'sherry-same-turn');
    expect(atomic.courtroom?.results.at(-1)?.payout).toBe(Math.round(full*.4));
    expect(atomic.courtroom?.results.at(-1)?.solvedBy).toBe('sherry');
  });

  it('resumes an unfinished legacy investigation as a freeform courtroom case without losing the old save',()=>{
    let state=inOffice();
    state=reduceState(state,{type:'law_case',phase:'accept',caseId:'gallery-clock'});
    expect(state.lawCareer?.owners.emma?.active?.stage).toBe('investigation');
    expect(()=>applyStoryActions(state,[boardAction],'legacy-conflict')).toThrow(/历史委托/);
    const migrated=reduceState(state,{type:'courtroom',phase:'migrate-legacy'});
    expect(migrated.lawCareer?.owners.emma?.active).toBeNull();
    expect(courtState(migrated).active).toMatchObject({owner:'emma',source:'commission'});
    expect(courtState(migrated).active?.truth).toBeNull();
    expect(()=>reduceState(migrated,{type:'leave_interior'})).toThrow(/庭审/);
    expect(parseState(JSON.parse(JSON.stringify(migrated)))).toEqual(migrated);
  });

  it('moves a hearing into the authored court and returns to the office after verdict',()=>{
    let state=openPreset();
    expect(getCampusInterior('court-hearing')?.label).toContain('法庭');
    expect(state.locationId).toBe('court-hearing');
    expect(state.interior?.roomId).toBe('court-hearing');
    expect(state.courtroom?.active?.returnTo).toEqual({x:0,z:2,yaw:0});
    state=applyStoryActions(state,[{type:'court_finish',verdict:'loss',summary:'当事人关键证据未获采纳，雪莉进行了合理的善后。'}],'court-return-verdict');
    expect(state.locationId).toBe('legal-office');
    expect(state.interior?.roomId).toBe('legal-office');
    expect(state.courtroom?.active).toBeNull();
  });

  it('shows summoned defendants and other playable counsel in the courtroom without changing their personal saves',()=>{
    let state=inOffice();
    const soyoLocation=personState(state,'soyo').locationId;
    const sakikoLocation=personState(state,'sakiko').locationId;
    state=applyStoryActions(state,[{type:'court_quote',defendant:'月代雪',reason:'请求解决合同争议',
      risk:'可能缺乏支持请求的关键证据',category:'civil',lawyer:'sakiko',sherry:false,
      courtFeeYen:0,lawyerFeeYen:400,sherryFeeYen:0}],'court-attendees-quote');
    state=reduceState(state,{type:'courtroom',phase:'confirm-filing'});
    const people=worldScenePeople(state);
    expect(people.some(person=>person.protagonistId==='soyo' && person.identity==='被告当事人')).toBe(true);
    expect(people.some(person=>person.protagonistId==='sakiko' && person.identity==='法律协助人员')).toBe(true);
    expect(people.some(person=>person.id==='court-judge')).toBe(true);
    expect(personState(state,'soyo').locationId).toBe(soyoLocation);
    expect(personState(state,'sakiko').locationId).toBe(sakikoLocation);
  });

  it('cannot visit the formal court without an actual hearing',()=>{
    const state=inOffice();
    expect(()=>reduceState(state,{type:'novel_travel',locationId:'court-hearing'})).toThrow();
    expect(()=>reduceState(state,{type:'enter_interior',roomId:'court-hearing'})).toThrow();
  });

  it('a proposed settlement does not close a suit or charge money before explicit player confirmation',()=>{
    let state=inOffice();
    const money=state.player.balance;
    state=applyStoryActions(state,[{
      type:'court_quote',defendant:'月代雪',reason:'请求澄清相互误解',
      risk:'只有口角时诉讼请求难以获支持',category:'civil',lawyer:null,sherry:false,
      courtFeeYen:900,lawyerFeeYen:0,sherryFeeYen:0,
    }],'court-settle-quote');
    state=reduceState(state,{type:'courtroom',phase:'confirm-filing'});
    expect(state.locationId).toBe('court-hearing');
    expect(state.player.balance).toBe(money-900);
    const caseId=state.courtroom!.active!.id;
    state=applyStoryActions(state,[{type:'court_settlement',
      summary:'双方同意双方不再反复施压、澄清误解',
      defendantConsented:true,terms:[
        {kind:'cease',from:'claimant',description:'不再反复要求对方放弃自己的乐队',amountYen:0,dueDay:2},
        {kind:'payment',from:'defendant',description:'归还此前借款',amountYen:3000,dueDay:4},
      ],
    }],'court-settle-offer');
    expect(state.courtroom?.active?.id).toBe(caseId);
    expect(state.courtroom?.pendingSettlement?.terms).toHaveLength(2);
    expect(state.courtroom?.agreements).toHaveLength(0);
    expect(state.player.balance).toBe(money-900);
    const rejected=reduceState(state,{type:'courtroom',phase:'reject-settlement'});
    expect(rejected.courtroom?.active?.id).toBe(caseId);
    expect(rejected.courtroom?.pendingSettlement).toBeNull();
    state=applyStoryActions(rejected,[{type:'court_settlement',
      summary:'双方自愿达成协议',defendantConsented:true,terms:[
        {kind:'cease',from:'claimant',description:'不再反复施压',amountYen:0,dueDay:2},
        {kind:'payment',from:'defendant',description:'归还借款',amountYen:3000,dueDay:4},
      ],
    }],'court-settle-reoffer');
    state=reduceState(state,{type:'courtroom',phase:'accept-settlement'});
    expect(state.courtroom?.active).toBeNull();
    expect(state.courtroom?.pendingSettlement).toBeNull();
    expect(state.courtroom?.results.at(-1)?.verdict).toBe('settled');
    expect(state.courtroom?.agreements?.at(-1)).toMatchObject({caseId,kind:'settlement'});
    expect(state.courtroom?.agreements?.at(-1)?.terms[1]?.status).toBe('pending');
    expect(state.locationId).toBe('legal-office');
    expect(state.player.balance).toBe(money-900);
    expect(()=>reduceState(state,{type:'courtroom',phase:'accept-settlement'})).toThrow();
  });

  it('switching viewpoints with an offered settlement clears the offer instead of corrupting the save',()=>{
    let state=inOffice();
    state=applyStoryActions(state,[{type:'court_quote',defendant:'月代雪',reason:'双方的财物归属争议',
      risk:'争议证据尚不充分',category:'civil',lawyer:null,sherry:false,
      courtFeeYen:0,lawyerFeeYen:0,sherryFeeYen:0}],'switch-offer-quote');
    state=reduceState(state,{type:'courtroom',phase:'confirm-filing'});
    state=applyStoryActions(state,[{type:'court_settlement',summary:'就争议签署道歉条款',
      defendantConsented:true,terms:[{kind:'apology',from:'defendant',description:'道歉',
        amountYen:0,dueDay:3}]}],'switch-offer-proposal');
    state=reduceState(state,{type:'switch_protagonist',target:'soyo'});
    expect(state.courtroom?.active).toBeNull();
    expect(state.courtroom?.pendingSettlement).toBeNull();
    expect(state.courtroom?.results.at(-1)?.worldVerdict).toBe('undetermined');
    expect(parseState(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });

  it('withdrawal is initiated by the protagonist and never refunds already paid filing fees',()=>{
    let state=inOffice();
    const original=state.player.balance;
    state=applyStoryActions(state,[{
      type:'court_quote',defendant:'月代雪',reason:'请法院澄清合同争议',risk:'法院可能认为请求没有法律依据',
      category:'civil',lawyer:null,sherry:false,courtFeeYen:1200,lawyerFeeYen:0,sherryFeeYen:0,
    }],'withdraw-quote');
    state=reduceState(state,{type:'courtroom',phase:'confirm-filing'});
    expect(state.player.balance).toBe(original-1200);
    state=reduceState(state,{type:'courtroom',phase:'withdraw'});
    expect(state.courtroom?.results.at(-1)?.verdict).toBe('withdrawn');
    expect(state.locationId).toBe('legal-office');
    expect(state.courtroom?.active).toBeNull();
    expect(state.player.balance).toBe(original-1200);
  });

  it('persists judgment obligations and transfers a funded NPC debtor payment exactly once',()=>{
    let state=inOffice();
    state.protagonists!.npcWallets={...(state.protagonists?.npcWallets ?? {}),'majo-yuki':90000};
    state=parseState(state);
    state=applyStoryActions(state,[{
      type:'court_quote',defendant:'月代雪',reason:'请求返还借款',risk:'须提交证据证明借贷关系',
      category:'civil',lawyer:null,sherry:false,courtFeeYen:0,lawyerFeeYen:0,sherryFeeYen:0,
    }],'judgment-quote');
    state=reduceState(state,{type:'courtroom',phase:'confirm-filing'});
    state=applyStoryActions(state,[{
      type:'court_finish',verdict:'win',summary:'法院根据转账凭证判令返还借款。',
      order:{respondent:'月代雪',terms:[
        {kind:'payment',from:'defendant',description:'向原告偿还借款',amountYen:500,dueDay:3},
      ],sanctions:[]},
    }],'judgment-finish');
    const term=state.courtroom!.agreements![0]!.terms[0]!;
    expect(term.status).toBe('pending');
    expect(state.locationId).toBe('legal-office');
    const beforeEmma=appiePayBalance(state.protagonists!.accounts,'emma');
    const beforeYuki=state.protagonists!.npcWallets!['majo-yuki'];
    state=reduceState(state,{type:'courtroom',phase:'collect-term',termId:term.id});
    expect(state.courtroom?.agreements?.[0]?.terms[0]?.status).toBe('fulfilled');
    expect(appiePayBalance(state.protagonists!.accounts,'emma')-beforeEmma).toBe(50000);
    expect(beforeYuki-state.protagonists!.npcWallets!['majo-yuki']).toBe(50000);
    expect(()=>reduceState(state,{type:'courtroom',phase:'collect-term',termId:term.id})).toThrow();
  });

  it('recognizes a normal Appie Pay transfer as a paid judgment only when parties and cents match',()=>{
    let state=inOffice();
    const contact=state.contacts.find(row=>row.sourcePersonId==='majo-yuki') ?? {
      id:'court-contact-yuki',name:'月代雪',tag:'友人',summary:'已经加入通讯录的当事人',
      affinity:40,status:'可联系',portraitId:'deepseek' as const,sourcePersonId:'majo-yuki',isMain:false,
    };
    if(!state.contacts.some(row=>row.sourcePersonId==='majo-yuki')) state.contacts.push(contact);
    state=parseState(state);
    state=applyStoryActions(state,[{type:'court_quote',defendant:'月代雪',reason:'请求返还借款',
      risk:'必须证明存在有效债权',category:'civil',lawyer:null,sherry:false,
      courtFeeYen:0,lawyerFeeYen:0,sherryFeeYen:0}],'ledger-order-quote');
    state=reduceState(state,{type:'courtroom',phase:'confirm-filing'});
    state=applyStoryActions(state,[{type:'court_finish',verdict:'loss',
      summary:'因原告未能证明债权，法院裁定负担相关费用。',order:{respondent:'月代雪',
      terms:[{kind:'payment',from:'claimant',amountYen:600,dueDay:3,description:'承担本案诉讼费用'}],sanctions:[]},
    }],'ledger-order-finish');
    const term=state.courtroom!.agreements![0]!.terms[0]!;
    const money=appiePayBalance(state.protagonists!.accounts,'emma');
    const beforeYuki=state.protagonists!.npcWallets?.['majo-yuki'] ?? 0;
    expect(()=>applyStoryActions(state,[{type:'transfer',from:'emma',to:contact.id,cents:50000,
      reason:'court-obligation:'+term.id}],'court-wrong-amount')).toThrow(/金额/);
    expect(appiePayBalance(state.protagonists!.accounts,'emma')).toBe(money);
    state=applyStoryActions(state,[{type:'transfer',from:'emma',to:contact.id,cents:60000,
      reason:'court-obligation:'+term.id}],'court-right-amount');
    expect(state.courtroom?.agreements?.[0]?.terms[0]?.status).toBe('fulfilled');
    expect(appiePayBalance(state.protagonists!.accounts,'emma')).toBe(money-60000);
    expect((state.protagonists!.npcWallets?.['majo-yuki'] ?? 0)-beforeYuki).toBe(60000);
    const replay=applyStoryActions(state,[{type:'transfer',from:'emma',to:contact.id,cents:60000,
      reason:'court-obligation:'+term.id}],'court-right-amount');
    expect(appiePayBalance(replay.protagonists!.accounts,'emma')).toBe(appiePayBalance(state.protagonists!.accounts,'emma'));
    expect(replay.courtroom?.agreements?.[0]?.terms[0]?.status).toBe('fulfilled');
    expect(()=>applyStoryActions(state,[{type:'transfer',from:'emma',to:contact.id,cents:60000,
      reason:'court-obligation:'+term.id}],'court-duplicate-payment')).toThrow();
  });

  it('records non-monetary fulfillment as a state transition without creating money',()=>{
    let state=inOffice();
    state=applyStoryActions(state,[{type:'court_quote',defendant:'月代雪',
      reason:'请求停止骚扰',risk:'取证不足可能败诉',category:'civil',lawyer:null,sherry:false,
      courtFeeYen:0,lawyerFeeYen:0,sherryFeeYen:0}],'promise-quote');
    state=reduceState(state,{type:'courtroom',phase:'confirm-filing'});
    state=applyStoryActions(state,[{type:'court_settlement',summary:'双方约定不再相互施压',
      defendantConsented:true,terms:[{kind:'cease',from:'claimant',description:'停止持续纠缠',
      amountYen:0,dueDay:4}]}],'promise-proposal');
    state=reduceState(state,{type:'courtroom',phase:'accept-settlement'});
    const balance=state.player.balance;
    const term=state.courtroom!.agreements![0]!.terms[0]!;
    state=reduceState(state,{type:'courtroom',phase:'fulfill-term',termId:term.id});
    expect(state.courtroom?.agreements?.[0]?.terms[0]?.status).toBe('fulfilled');
    expect(state.player.balance).toBe(balance);
    expect(()=>reduceState(state,{type:'courtroom',phase:'fulfill-term',termId:term.id})).toThrow();
  });

  it('records a sentenced NPC restriction without imposing sentences on playable characters',()=>{
    // Use a non-Emma professional view: Emma's loss would trigger Sherry rescue,
    // and a rescued verdict cannot reuse punitive orders from the failed case.
    let state=withBoard('soyo');
    const selected=state.courtroom!.board!.offers.find(row=>row.category==='minor-criminal')!;
    state=applyStoryActions(state,[{type:'court_open',offerId:selected.id,respondent:'橘雪莉',
      white:'检方呈交证据，法庭继续核实有关事实。',
      evidence:[{title:'证人记录',detail:'部分时间待核对'},{title:'相关单据',detail:'存在第二条时间记录'}],
 }],'court-open-sanction');
    state=applyStoryActions(state,[{
      type:'court_finish',verdict:'loss',summary:'法庭查明案件后完成裁判。',
      order:{respondent:'橘雪莉',terms:[],sanctions:[{
        personId:'majo-sherry',kind:'community-service',startDay:2,endDay:4,detail:'工作日定时履行公益服务',
      }]},
    }],'npc-sanction');
    expect(state.courtroom?.sanctions?.[0]).toMatchObject({personId:'majo-sherry',kind:'community-service'});
    expect(state.courtroom?.sanctions?.[0]?.endDay).toBe(4);
    expect(parseState(JSON.parse(JSON.stringify(state))).courtroom?.sanctions).toHaveLength(1);
  });

  it('refuses legal execution against a different person from the frozen case respondent',()=>{
    let state=withBoard('soyo');
    const offer=state.courtroom!.board!.offers.find(row=>row.category==='minor-criminal')!;
    state=applyStoryActions(state,[{type:'court_open',offerId:offer.id,respondent:'临时委托嫌疑人',
      white:'法庭正在讨论一份存在争议的取证记录。',
      evidence:[{title:'案件材料',detail:'证人记录可能存在错误'},{title:'登记表',detail:'确认了时间顺序'}]}],
      'frozen-defendant-open');
    expect(()=>applyStoryActions(state,[{type:'court_finish',verdict:'loss',summary:'法庭准备处理执行事项。',
      order:{respondent:'橘雪莉',terms:[],sanctions:[{
        personId:'majo-sherry',kind:'custody',startDay:2,endDay:3,detail:'无关第三人被误写成被告',
      }]}}],'frozen-defendant-bad')).toThrow(/被告|卷宗/);
    expect(state.courtroom?.sanctions).toHaveLength(0);
  });

  it('legal career fees and assistance experience are credited to the hired playable character',()=>{
    let state=inOffice();
    state=applyStoryActions(state,[{
      type:'court_quote',defendant:'月代雪',reason:'争议赔偿',
      risk:'证据不足时请求可能被驳回',category:'civil',lawyer:'sakiko',sherry:false,
      courtFeeYen:0,lawyerFeeYen:500,sherryFeeYen:0,
    }],'career-quote');
    state=reduceState(state,{type:'courtroom',phase:'confirm-filing'});
    expect(state.courtroom?.careers?.sakiko).toMatchObject({enrolled:true,assistedCases:1,earnedYen:500});
    expect(state.courtroom?.careers?.sakiko?.experience).toBeGreaterThan(0);
    expect(state.courtroom?.careers?.sakiko?.qualification).not.toBe('licensed');
  });

  it('switching protagonists forfeits the current trial with zero payout and a single respectful return recap',()=>{
    let state=openPreset();
    const money=state.player.balance;
    state=reduceState(state,{type:'switch_protagonist',target:'soyo'});
    expect(activeProtagonist(state)).toBe('soyo');
    expect(courtState(state).active).toBeNull();
    expect(courtState(state).results.at(-1)).toMatchObject({solvedBy:'forfeit',verdict:'loss',payout:0,experience:0});
    expect(personState(state,'emma').player.balance).toBe(money);
    expect(courtState(state).pendingRecaps.emma).toContain('参与已中止');
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
