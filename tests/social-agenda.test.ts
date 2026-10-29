import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { applyStoryActions, commitStoryTurn, createInitialState, parseState } from '../src/runtime/model';
import { enableProtagonists } from '../src/runtime/protagonist-world';
import { applySocialAgendaActions, parseAgendaDraft, residentSocialAgendaPresence, socialMinute, startSocialAgenda, type SocialAgendaDraft } from '../src/runtime/social-agenda';
import type { SocialInvitation } from '../src/runtime/natural-interactions';

const plan: SocialAgendaDraft = {
  rationale: '与朋友见面，自己决定稍微晚到。',
  steps: [
    {kind:'prepare',day:2,time:'18:05',detail:'换一套舒服的衣服'},
    {kind:'depart',day:2,time:'19:10',detail:'准备出发'},
    {kind:'arrive',day:2,time:'19:45',detail:'抵达约好的咖啡馆'},
    {kind:'leave',day:2,time:'20:15',detail:'离开咖啡馆'},
  ],
};
const start = (sms = false) => {
  const seed=createInitialState();
  seed.clock={day:2,hour:18,minute:0};
  const state=parseState(enableProtagonists(seed));
  const invitation:SocialInvitation={
    id:'test-invite-1',owner:'soyo',targetId:'watanare-mai',targetName:'真唯',
    source:sms?'sms':'meeting',locationId:'cafe',day:2,time:'19:30',
    message:'一起喝茶吗？',status:'accepted',createdAt:socialMinute(state),
    messageId:sms?'npc:test-invite-1':null,response:'当然可以。',
  };
  state.protagonists!.socialInvitations=[invitation];
  startSocialAgenda(state,invitation,plan);
  return parseState(state);
};
const elapsed=(state: ReturnType<typeof start>,minutes:number) =>
  applyStoryActions(state,[{type:'rest',kind:'wait',minutes}], 'agenda-wait-'+socialMinute(state));

describe('NPC 自主赴约日程（不启动模型）',()=>{
  it('约定时间与 LLM 计划到场不同，行程按游戏时钟静默执行',()=>{
    let state=start();
    expect(state.protagonists!.socialInvitations![0]!.time).toBe('19:30');
    expect(state.protagonists!.socialInvitations![0]!.agenda?.steps.find(s=>s.kind==='arrive')?.at)
      .toBe((2-1)*1440+19*60+45);
    state=elapsed(state,95);
    expect(residentSocialAgendaPresence(state,'watanare-mai')?.phase).toBe('travel');
    expect(state.protagonists!.socialInvitations![0]!.agenda!.events.some(e=>e.kind==='due')).toBe(true);
    state=elapsed(state,10);
    expect(residentSocialAgendaPresence(state,'watanare-mai')?.phase).toBe('present');
    state=elapsed(state,35);
    expect(residentSocialAgendaPresence(state,'watanare-mai')?.phase).toBe('travel');
    state=elapsed(state,30);
    expect(residentSocialAgendaPresence(state,'watanare-mai')).toBeNull();
    expect(parseState(state)).toEqual(state);
  });
  it('短信约定沿用手机通知中心，不会伪造 NPC 发送的短信',()=>{
    const state=elapsed(start(true),90);
    expect(state.protagonists!.devices.soyo.notifications.some(n=>
      n.id.startsWith('social:')&&n.text.includes('19:30'))).toBe(true);
    expect(state.protagonists!.npcPhone?.messages.filter(m=>m.direction==='incoming')??[]).toHaveLength(0);
  });
  it('没有 LLM 请求时不销毁待叙述事件，正常请求后才确认已承接',()=>{
    const before=elapsed(start(),95);
    expect(before.protagonists!.socialInvitations![0]!.agenda!.events.some(e=>!e.narrated)).toBe(true);
    const after=commitStoryTurn(before,'看了眼时间。',{text:'已经过了约好的时间，她决定继续等待。',phoneMessages:[]},
      {userId:'agenda-followup-user',assistantId:'agenda-followup-assistant'});
    expect(after.protagonists!.socialInvitations![0]!.agenda!.events.every(e=>e.narrated)).toBe(true);
  });
  it('拒绝重写过去或产生时间倒序的私人计划',()=>{
    const state=start();
    const original=state.protagonists!.socialInvitations![0]!;
    expect(()=>parseAgendaDraft({rationale:'逆向移动',steps:[...plan.steps].reverse()},original,socialMinute(state))).toThrow();
    expect(()=>parseAgendaDraft({...plan,steps:plan.steps.map(s=>({...s,day:1}))},original,socialMinute(state))).toThrow();
  });
  it('同一个居民不能同时准备两场会冲突的邀约，连往返行程也会占时间',()=>{
    const state=start();
    const first=state.protagonists!.socialInvitations![0]!;
    const second:SocialInvitation={...first,id:'test-invite-2',time:'20:10',agenda:undefined};
    state.protagonists!.socialInvitations!.push(second);
    expect(()=>startSocialAgenda(state,second,plan)).toThrow(/同时有两项赴约/);
  });
  it('模型不能用随意编造的旧事件重规划，已保存承诺保持不变',()=>{
    const state=start(),id=state.protagonists!.socialInvitations![0]!.id;
    expect(()=>applySocialAgendaActions(state,[{type:'social_agenda',invitationId:id,decision:'no_show',
      triggerId:'unsaved-and-unrelated',reason:'随便改个决定'}],'attempt')).toThrow(/新事件依据/);
    expect(state.protagonists!.socialInvitations![0]!.agenda!.status).toBe('scheduled');
  });
    it('正文快捷前往与消息通知都复用现有前端',()=>{
    const app=readFileSync(resolve(process.cwd(),'src/frontend/App.vue'),'utf8');
    const messenger=readFileSync(resolve(process.cwd(),'integration/dual-protagonists/phone-messenger.js'),'utf8');
    expect(app).toContain('data-meeting-invite');
    expect(app).toContain('前往约定地点');
    expect(messenger).toContain('role="status" aria-label="见面提醒"');
  });
});
