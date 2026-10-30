import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInitialState, reduceState } from '../src/runtime/model';
import { enableProtagonists, personState } from '../src/runtime/protagonist-world';
import { novelInvitationPortraitFocus, resolveNovelInvitationPortraitPair } from '../src/frontend/novel-invitation-portraits';
import type { SocialInvitation } from '../src/runtime/natural-interactions';
import type { WorldScenePerson } from '../src/runtime/world-presence';

const person = (id = 'watanare-mai', name = '王冢真唯', x = -1, z = 15) =>
  ({ id, name, candidateName:name, x, z, color:0x859c6d,
    identity:'常驻居民', description:'在场', tags:['常驻人物'], portraitId:'claude',
    contactId:null, isMain:true }) as WorldScenePerson;

function fixture() {
  const state = reduceState(enableProtagonists(createInitialState()), {type:'switch_protagonist',target:'renako'});
  state.clock = {day:2,hour:19,minute:30};
  state.locationId='promenade';
  state.interior=null;
  state.scene={areaId:'promenade',x:-2,z:15,yaw:0,seed:'paired-scene',encounterId:'watanare-mai'};
  const invite: SocialInvitation={
    id:'meeting-portrait-1',owner:'renako',targetId:'watanare-mai',targetName:'王冢真唯',
    source:'sms',locationId:'promenade',day:2,time:'19:30',
    message:'晚上见。',status:'accepted',createdAt:1440+18*60,
    messageId:'npc:meeting-portrait-1',response:'好。',
    agenda:{
      revision:1,status:'scheduled',rationale:'愿意见面',triggers:[],events:[],
      steps:[
        {kind:'prepare',at:1440+18*60,detail:'准备好',done:true},
        {kind:'depart',at:1440+19*60+10,detail:'出发',done:true},
        {kind:'arrive',at:1440+19*60+45,detail:'到场',done:false},
        {kind:'leave',at:1440+20*60+15,detail:'离开',done:false},
      ],
    },
  };
  state.protagonists!.socialInvitations=[invite];
  return {state,invite};
}

describe('面对面邀约双立绘（真实场景，不调整日程）', () => {
  it('约好19:30但计划19:45才到场，等待时不展示未到的人', () => {
    const {state,invite}=fixture();
    expect(resolveNovelInvitationPortraitPair(state,[person()])).toBeNull();
    expect(invite.agenda!.steps.find(s=>s.kind==='arrive')!.done).toBe(false);
    // The display resolver must never execute an NPC step.
    expect(invite.agenda!.events).toEqual([]);
  });
  it('双方实际同场且已经到场，左主角右对象，使用真唯本人素材名', () => {
    const {state,invite}=fixture();
    state.clock.minute=50;
    invite.agenda!.steps.find(s=>s.kind==='arrive')!.done=true;
    const pair=resolveNovelInvitationPortraitPair(state,[person()]);
    expect(pair?.invitationId).toBe(invite.id);
    expect(pair?.left.speaker).toBe('甘织玲奈子');
    expect(pair?.right.speaker).toBe('王冢真唯');
    expect(pair?.right.aliases).toContain('真唯');
    expect(pair?.left.live2d).toBe(false);
    expect(pair?.right.portraitId).toBe('claude');
  });
  it('对方未在场、在另一地点、离开或故意爽约，一律回退单立绘', () => {
    const {state,invite}=fixture();
    state.clock.minute=50;
    invite.agenda!.steps.find(s=>s.kind==='arrive')!.done=true;
    expect(resolveNovelInvitationPortraitPair(state,[])).toBeNull();
    expect(resolveNovelInvitationPortraitPair(state,[person('watanare-mai','王冢真唯',90,90)])).toBeNull();
    state.locationId='other-location';
    expect(resolveNovelInvitationPortraitPair(state,[person()])).toBeNull();
    state.locationId='promenade';
    invite.agenda!.steps.find(s=>s.kind==='leave')!.done=true;
    expect(resolveNovelInvitationPortraitPair(state,[person()])).toBeNull();
    invite.agenda!.steps.find(s=>s.kind==='leave')!.done=false;
    invite.agenda!.status='no_show';
    expect(resolveNovelInvitationPortraitPair(state,[person()])).toBeNull();
  });
  it('当面提出邀约刚发生也可以双立绘，短信未同意不能伪造会面', () => {
    const {state,invite}=fixture();
    delete invite.agenda;
    state.clock={day:2,hour:18,minute:30};
    invite.createdAt=1440+18*60+20;
    invite.day=3;invite.time='19:30';
    invite.status='pending';
    expect(resolveNovelInvitationPortraitPair(state,[person()])).toBeNull();
    invite.source='meeting';
    expect(resolveNovelInvitationPortraitPair(state,[person()])).not.toBeNull();
    state.clock.hour=19;
    expect(resolveNovelInvitationPortraitPair(state,[person()])).toBeNull();
  });
  it('可以展示已在同一地点的其他主角，素世沿用Live2D', () => {
    const {state,invite}=fixture();
    invite.targetId='protagonist-soyo';
    invite.targetName='长崎素世';
    invite.source='meeting';
    invite.createdAt=1440+19*60+25;
    const other=personState(state,'soyo');
    other.locationId='promenade';
    other.interior=null;
    other.scene={areaId:'promenade',x:-1,z:15,yaw:0,seed:'paired-scene',encounterId:null};
    const guest={...person('protagonist-soyo','长崎素世'),protagonistId:'soyo' as const};
    const pair=resolveNovelInvitationPortraitPair(state,[guest]);
    expect(pair?.left.id).toBe('watanare-renako');
    expect(pair?.right.live2d).toBe(true);
    expect(pair?.right.speaker).toBe('长崎素世');
  });
  it('拒绝仅凭相同世界坐标把另一城区的主角画到同一场景', () => {
    const {state,invite}=fixture();
    invite.targetId='protagonist-soyo';
    invite.source='meeting';
    invite.createdAt=1440+19*60+25;
    const guest={...person('protagonist-soyo','长崎素世'),protagonistId:'soyo' as const};
    const other=personState(state,'soyo');
    other.locationId='some-other-district';
    other.interior=null;
    other.scene={areaId:'promenade',x:-1,z:15,yaw:0,seed:'other-city',encounterId:null};
    expect(resolveNovelInvitationPortraitPair(state,[guest])).toBeNull();
    other.locationId='promenade';
    other.scene={...other.scene!,areaId:'campus'};
    expect(resolveNovelInvitationPortraitPair(state,[guest])).toBeNull();
  });
  it('阅读游标分别保留两人已说的表情，旁白两侧暗化，倒放无未来表情', () => {
    const {state,invite}=fixture();
    state.clock.minute=50;
    invite.agenda!.steps.find(s=>s.kind==='arrive')!.done=true;
    const pair=resolveNovelInvitationPortraitPair(state,[person()])!;
    const rows=[
      {entryId:'a',viewpoint:'甘织玲奈子',speaker:'真唯',emotion:'开心'},
      {entryId:'a',viewpoint:'甘织玲奈子',speaker:'玲奈子',emotion:'生气'},
      {entryId:'a',viewpoint:'甘织玲奈子',speaker:'旁白',emotion:'平静'},
      {entryId:'a',viewpoint:'甘织玲奈子',speaker:'真唯',emotion:'害羞'},
      {entryId:'a',viewpoint:'甘织玲奈子',speaker:'服务生',emotion:'平静'},
      {entryId:'b',viewpoint:'甘织玲奈子',speaker:'旁白',emotion:'平静'},
    ];
    expect(novelInvitationPortraitFocus(rows,0,pair)).toMatchObject({
      speaking:'right',rightEmotion:'开心',leftEmotion:'平静',unrelatedSpeaker:false,
    });
    expect(novelInvitationPortraitFocus(rows,1,pair)).toMatchObject({
      speaking:'left',leftEmotion:'生气',rightEmotion:'开心',
    });
    expect(novelInvitationPortraitFocus(rows,2,pair)).toMatchObject({
      speaking:null,leftEmotion:'生气',rightEmotion:'开心',unrelatedSpeaker:false,
    });
    expect(novelInvitationPortraitFocus(rows,3,pair)).toMatchObject({
      speaking:'right',leftEmotion:'生气',rightEmotion:'害羞',
    });
    expect(novelInvitationPortraitFocus(rows,4,pair).unrelatedSpeaker).toBe(true);
    expect(novelInvitationPortraitFocus(rows,5,pair)).toMatchObject({
      speaking:null,leftEmotion:'平静',rightEmotion:'平静',entryId:'b',
    });
  });
  it('双人使用独立的舞台布局，原立绘保留单人回退', () => {
    const app=readFileSync(resolve(process.cwd(),'src/frontend/App.vue'),'utf8');
    const dialogue=readFileSync(resolve(process.cwd(),'src/frontend/NovelDialogue.vue'),'utf8');
    const layout=readFileSync(resolve(process.cwd(),'src/frontend/shell-layout.ts'),'utf8');
    const css=readFileSync(resolve(process.cwd(),'src/frontend/novel-invitation-portraits.css'),'utf8');
    expect(app).toContain('<NovelInvitationPortraits v-if="visibleInvitationStage');
    expect(app).toContain('!visibleInvitationStage');
    // The original novel/3D conditional chain must not turn on 3D behind a double portrait.
    expect(app).toContain('<SoyoLive2D v-if="novelMode"');
    expect(app).toContain('v-else-if="model.state.interior"');
    expect(dialogue).toContain('novelInvitationPortraitFocus');
    expect(layout).toContain("return 'invitation-portraits'");
    expect(css).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))');
  });
});
