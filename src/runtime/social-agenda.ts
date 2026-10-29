import type { StoryAction, WorldState } from '../frontend/types';
import { PROTAGONISTS, protagonistForPerson, type ProtagonistId } from './dual-protagonists';
import { residentById } from './npc-cast';
import type { SocialInvitation } from './natural-interactions';

export type AgendaStepKind = 'prepare' | 'depart' | 'arrive' | 'leave';
export interface AgendaDraftStep { kind: AgendaStepKind; day: number; time: string; detail: string }
export interface SocialAgendaDraft { rationale: string; steps: AgendaDraftStep[] }
export interface AgendaStep { kind: AgendaStepKind; at: number; detail: string; done: boolean }
export interface AgendaEvent {
  id: string; at: number; kind: AgendaStepKind | 'due' | 'change';
  detail: string; narrated: boolean;
}
export interface SocialAgenda {
  revision: number;
  status: 'scheduled' | 'cancelled' | 'no_show';
  rationale: string;
  triggers: string[];
  steps: AgendaStep[];
  events: AgendaEvent[];
}

const maxMinute = 365000 * 1440 - 1;
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const kinds = new Set<AgendaStepKind>(['prepare', 'depart', 'arrive', 'leave']);
const eventKinds = new Set<AgendaEvent['kind']>([...kinds, 'due', 'change']);
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const fail = (why: string): never => { throw new Error('赴约日程无效：' + why); };
const isInt = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
const fieldText = (value: unknown, max: number) =>
  typeof value === 'string' && !!value.trim() && value.length <= max && !/[\u0000-\u001f]/.test(value) ? value : fail('文字格式');
const validId = (value: unknown) =>
  typeof value === 'string' && /^[A-Za-z0-9][\w.:-]{0,127}$/.test(value) ? value : fail('事件编号');
function fields(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
    Object.keys(value).length !== keys.length || Object.keys(value).some(key => !keys.includes(key))) return fail('字段');
  return value as Record<string, unknown>;
}
export const socialMinute = (state: Pick<WorldState,'clock'>) =>
  (state.clock.day - 1) * 1440 + state.clock.hour * 60 + state.clock.minute;
export const agreedMinute = (row: Pick<SocialInvitation,'day'|'time'>) =>
  (row.day - 1) * 1440 + Number(row.time.slice(0,2)) * 60 + Number(row.time.slice(3));
function stepAt(day: unknown, time: unknown): number {
  if (!isInt(day,1,365000) || typeof time !== 'string' || !timePattern.test(time)) return fail('步骤日期时间');
  const at = (day-1)*1440 + Number(time.slice(0,2))*60 + Number(time.slice(3));
  if (at>maxMinute) return fail('时间超界');
  return at;
}
function clockStep(step: AgendaStep): AgendaDraftStep {
  return { kind:step.kind,day:Math.floor(step.at/1440)+1,
    time:String(Math.floor(step.at%1440/60)).padStart(2,'0')+':'+String(step.at%60).padStart(2,'0'),
    detail:step.detail };
}
function checkSteps(steps: AgendaStep[], invite: Pick<SocialInvitation,'day'|'time'>): void {
  if (steps.length<3 || steps.length>12) return fail('应包括出发、到场、离开且最多十二步');
  if (steps.filter(s=>s.kind==='depart').length!==1 || steps.filter(s=>s.kind==='arrive').length!==1 ||
    steps.filter(s=>s.kind==='leave').length!==1) return fail('出发、到场、离开各一次');
  for(let i=0;i<steps.length;i++){
    if(!kinds.has(steps[i]!.kind) || !isInt(steps[i]!.at,0,maxMinute) ||
      (i>0 && steps[i]!.at<=steps[i-1]!.at)) return fail('步骤必须按游戏时间严格递增');
  }
  const departure=steps.findIndex(s=>s.kind==='depart');
  const arrival=steps.findIndex(s=>s.kind==='arrive');
  const leaving=steps.findIndex(s=>s.kind==='leave');
  if(departure>=arrival || arrival>=leaving ||
    steps.slice(departure+1).some(s=>s.kind==='prepare')) return fail('准备、出发、到场、离开的先后顺序');
  const due=agreedMinute(invite), arrived=steps[arrival]!.at, left=steps[leaving]!.at;
  if(arrived<due-720 || arrived>due+720 || left>due+1440 ||
    arrived-steps[departure]!.at<10) return fail('到场偏差、行程耗时或离开时间不合理');
}

/** Strict model-facing plan; the planned arrival may deliberately differ from the agreed time. */
export function parseAgendaDraft(raw: unknown, invite: Pick<SocialInvitation,'day'|'time'>, now: number,
  earlier: AgendaStep[]=[]): SocialAgendaDraft {
  const obj=fields(raw,['rationale','steps']);
  if(!Array.isArray(obj.steps)) return fail('步骤列表');
  const steps: AgendaStep[]=obj.steps.map(item=>{
    const s=fields(item,['kind','day','time','detail']);
    if(!kinds.has(s.kind as AgendaStepKind)) return fail('步骤种类');
    return {kind:s.kind as AgendaStepKind,at:stepAt(s.day,s.time),detail:fieldText(s.detail,160),done:false};
  });
  checkSteps(steps,invite);
  if(steps.some((step,index)=>index<earlier.length
    ? step.kind!==earlier[index]!.kind || step.at!==earlier[index]!.at || step.detail!==earlier[index]!.detail
    : step.at<=now)) return fail('不允许修改已执行的步骤，未来步骤必须晚于现在');
  return {rationale:fieldText(obj.rationale,240),steps:steps.map(clockStep)};
}
export function createAgenda(raw: SocialAgendaDraft, invite: SocialInvitation, now: number): SocialAgenda {
  const draft=parseAgendaDraft(raw,invite,now);
  return {revision:1,status:'scheduled',rationale:draft.rationale,triggers:[],
    steps:draft.steps.map(s=>({kind:s.kind,at:stepAt(s.day,s.time),detail:s.detail,done:false})),events:[]};
}
export function parseSocialAgenda(raw: unknown, invite: SocialInvitation, now: number): SocialAgenda {
  const value=fields(raw,['revision','status','rationale','triggers','steps','events']);
  if(!isInt(value.revision,1,100) || !['scheduled','cancelled','no_show'].includes(String(value.status)))
    return fail('计划版本或状态');
  if(!Array.isArray(value.triggers) || value.triggers.length>24) return fail('变更历史');
  const triggers=value.triggers.map(validId);
  if(new Set(triggers).size!==triggers.length) return fail('重复变更来源');
  if(!Array.isArray(value.steps)) return fail('步骤');
  const steps:AgendaStep[]=value.steps.map(item=>{
    const row=fields(item,['kind','at','detail','done']);
    if(!kinds.has(row.kind as AgendaStepKind) || !isInt(row.at,0,maxMinute) || typeof row.done!=='boolean')
      return fail('步骤状态');
    return {kind:row.kind as AgendaStepKind,at:row.at,detail:fieldText(row.detail,160),done:row.done};
  });
  checkSteps(steps,invite);
  if(steps.some(s=>s.done&&s.at>now)) return fail('未来步骤被提前执行');
  if(!Array.isArray(value.events) || value.events.length>48) return fail('事件上限');
  const events:AgendaEvent[]=value.events.map(item=>{
    const row=fields(item,['id','at','kind','detail','narrated']);
    if(!eventKinds.has(row.kind as AgendaEvent['kind']) || !isInt(row.at,0,now) || typeof row.narrated!=='boolean')
      return fail('事件状态');
    return {id:validId(row.id),at:row.at,kind:row.kind as AgendaEvent['kind'],
      detail:fieldText(row.detail,240),narrated:row.narrated};
  });
  if(new Set(events.map(e=>e.id)).size!==events.length) return fail('重复事件');
  return {revision:value.revision as number,status:value.status as SocialAgenda['status'],
    rationale:fieldText(value.rationale,240),triggers,steps,events};
}
function targetPerson(state:WorldState,invitation:SocialInvitation):string {
  const p=state.protagonists;
  const active=p?.accounts.active;
  const others=active?PROTAGONISTS.filter(id=>id!==active):[];
  const slot=others.indexOf(invitation.owner);
  const person=invitation.owner===active?state:slot===0?p!.inactive:slot===1?p!.third:slot===2?p!.fourth:state;
  const contact=person.contacts.find(row=>row.id===invitation.targetId||row.sourcePersonId===invitation.targetId);
  return contact?.sourcePersonId ?? invitation.targetId;
}
export function agendaTargetProtagonist(state:WorldState,row:SocialInvitation):ProtagonistId|null {
  const person=targetPerson(state,row);
  return PROTAGONISTS.find(id=>person===id||person==='protagonist-'+id) ?? protagonistForPerson(person) ?? null;
}
export function agendaTargetResident(state:WorldState,row:SocialInvitation):string|null {
  const person=targetPerson(state,row);
  return !agendaTargetProtagonist(state,row)&&residentById(person)?person:null;
}
function checkConflict(state:WorldState,invite:SocialInvitation,steps:AgendaStep[]) {
  const arrive=steps.find(s=>s.kind==='arrive')!.at;
  const leave=steps.find(s=>s.kind==='leave')!.at;
  const protagonist=agendaTargetProtagonist(state,invite),resident=agendaTargetResident(state,invite);
  if(!protagonist&&!resident) return fail('赴约人物不属于现有居民');
  for(const other of state.protagonists?.socialInvitations ?? []){
    if(other.id===invite.id||other.status!=='accepted'||other.agenda?.status!=='scheduled') continue;
    if(protagonist?agendaTargetProtagonist(state,other)!==protagonist:agendaTargetResident(state,other)!==resident)continue;
    const a=other.agenda.steps.find(s=>s.kind==='arrive')!.at;
    const b=other.agenda.steps.find(s=>s.kind==='leave')!.at;
    if(arrive<b&&a<leave) return fail('同一人物同时有两项赴约');
  }
  if(protagonist && state.protagonists?.devices[protagonist].calendar.some(c=>arrive<c.start+c.duration&&c.start<leave))
    return fail('赴约和对方手机日历冲突');
}
function event(plan:SocialAgenda,invitationId:string,at:number,kind:AgendaEvent['kind'],detail:string){
  const id=invitationId+':agenda:'+plan.revision+':'+kind+':'+at;
  if(!plan.events.some(e=>e.id===id)) plan.events.push({id,at,kind,detail:detail.slice(0,240),narrated:false});
  plan.events=plan.events.slice(-48);
}
export function startSocialAgenda(state:WorldState,invite:SocialInvitation,raw:SocialAgendaDraft):void {
  if(invite.status!=='accepted'||invite.agenda) return fail('计划必须属于新接受的邀约');
  const plan=createAgenda(raw,invite,socialMinute(state));
  checkConflict(state,invite,plan.steps);
  invite.agenda=plan;
}
function hasEvidence(state:WorldState,invitation:SocialInvitation,source:string):boolean {
  if(state.story.some(row=>row.id===source&&row.role==='assistant')) return true;
  if(state.journal.some(row=>row.id===source)) return true;
  if(state.protagonists?.conversations?.some(row=>row.id===source)) return true;
  if(state.protagonists?.npcPhone?.messages.some(row=>row.id===source)) return true;
  return !!invitation.agenda?.events.some(row=>row.id===source&&row.at<=socialMinute(state));
}
export function applySocialAgendaActions(state:WorldState,actions:readonly StoryAction[]):WorldState {
  if(!actions.some(action=>action.type==='social_agenda')) return state;
  const next=copy(state),now=socialMinute(next);
  for(const action of actions){
    if(action.type!=='social_agenda') continue;
    const invite=next.protagonists?.socialInvitations?.find(row=>row.id===action.invitationId);
    if(!invite||invite.status!=='accepted'||invite.owner!==next.protagonists?.accounts.active)
      return fail('必须由邀约发起方在已确认的邀约上调整计划');
    if(action.decision==='plan'){
      if(invite.agenda||action.triggerId!==invite.id||!action.agenda)return fail('初次计划的来源');
      startSocialAgenda(next,invite,action.agenda);
      continue;
    }
    const plan=invite.agenda;
    if(!plan||plan.status!=='scheduled'||plan.triggers.includes(action.triggerId)||!hasEvidence(next,invite,action.triggerId))
      return fail('变更必须具有已保存的新事件依据');
    if(plan.triggers.length>=24||plan.revision>=100)return fail('重规划次数已满');
    if(action.decision==='revise'){
      if(!action.agenda)return fail('调整计划时必须提供完整步骤');
      const earlier=plan.steps.filter(s=>s.done);
      const draft=parseAgendaDraft(action.agenda,invite,now,earlier);
      const steps=draft.steps.map(s=>({kind:s.kind,at:stepAt(s.day,s.time),detail:s.detail,done:false}));
      for(let i=0;i<earlier.length;i++)steps[i]!.done=true;
      checkConflict(next,invite,steps);
      plan.steps=steps; plan.rationale=fieldText(action.reason,240);
    }else if(action.decision==='cancel'||action.decision==='no_show'){
      if(plan.steps.some(s=>s.kind==='arrive'&&s.done))return fail('已经赴约的人不能再被标为没有到场');
      plan.status=action.decision==='cancel'?'cancelled':'no_show';
      plan.rationale=fieldText(action.reason,240);
    }else return fail('不支持的决定');
    plan.revision++;
    plan.triggers.push(validId(action.triggerId));
    event(plan,invite.id,now,'change','赴约者对原定计划作出了新的决定');
  }
  next.protagonists!.revision++;
  return next;
}
function notify(state:WorldState,owner:ProtagonistId,invitation:SocialInvitation,at:number){
  const list=state.protagonists!.devices[owner].notifications;
  const id='social:'+invitation.id+':due';
  if(list.some(item=>item.id===id))return;
  if(list.length>=200){
    const firstRead=list.findIndex(item=>item.read);
    if(firstRead<0)return;
    list.splice(firstRead,1);
  }
  list.push({id,text:'和'+invitation.targetName+'约好的 '+invitation.time+' 见面时间到了。',at,read:false});
  list.sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id));
}
/** Game-clock settlement only: no calls to a model and no model-chosen changes. */
export function settleSocialAgendas(before:WorldState,state:WorldState):void {
  if(!state.protagonists)return;
  const start=socialMinute(before),end=socialMinute(state);
  if(end<=start)return;
  for(const invitation of state.protagonists.socialInvitations ?? []){
    const plan=invitation.agenda;
    if(invitation.status!=='accepted'||!plan)continue;
    const due=agreedMinute(invitation);
    if(plan.status==='scheduled'){
      for(const step of plan.steps){
        if(step.done||step.at<=start||step.at>end)continue;
        step.done=true;
        event(plan,invitation.id,step.at,step.kind,step.detail);
      }
    }
    if(start<due&&due<=end){
      event(plan,invitation.id,due,'due','双方约定的见面时间已到，应以实际位置和已执行行程判断是否到场');
      if(invitation.source==='sms')notify(state,invitation.owner,invitation,due);
    }
  }
}
/** Saved plans override only the resident's ordinary authored schedule, never the user's position. */
export function residentSocialAgendaPresence(state:WorldState,residentId:string){
  const now=socialMinute(state);
  const invites=(state.protagonists?.socialInvitations ?? []).filter(row=>row.status==='accepted'&&row.agenda&&
    agendaTargetResident(state,row)===residentId);
  for(const invitation of invites.reverse()){
    const agenda=invitation.agenda!;
    const depart=agenda.steps.find(s=>s.kind==='depart')!,arrival=agenda.steps.find(s=>s.kind==='arrive')!;
    const leaving=agenda.steps.find(s=>s.kind==='leave')!;
    if(!depart.done||now<depart.at)continue;
    if(agenda.status!=='scheduled'){
      if(now<arrival.at)return {phase:'travel' as const,locationId:invitation.locationId,detail:'行程已有变动'};
      continue;
    }
    if(leaving.done||now>=leaving.at)continue;
    if(arrival.done&&now>=arrival.at)return {phase:'present' as const,locationId:invitation.locationId,detail:'按约定来到这里'};
    if(now<arrival.at)return {phase:'travel' as const,locationId:invitation.locationId,detail:'正在赴约途中'};
  }
  return null;
}
/** A normal narrative call sees all related plans and the complete unreported event queue. */
export function socialAgendaContext(state:WorldState){
  const now=socialMinute(state);
  return (state.protagonists?.socialInvitations ?? []).filter(row=>
    row.status==='accepted' && (agreedMinute(row)>=now-2*1440||row.agenda?.events.some(e=>!e.narrated))
  ).slice(-24).map(row=>({
    id:row.id,owner:row.owner,targetId:row.targetId,targetName:row.targetName,
    source:row.source,locationId:row.locationId,agreedDay:row.day,agreedTime:row.time,
    status:row.status,
    agenda:row.agenda ? {status:row.agenda.status,revision:row.agenda.revision,
      rationale:row.agenda.rationale,steps:row.agenda.steps,events:row.agenda.events,
      unreported:row.agenda.events.filter(e=>!e.narrated).map(e=>e.id)}:null
  }));
}
/** Only events known to the request snapshot get acknowledged; later actions remain for the next turn. */
export function acknowledgeAgendaNarration(snapshot:WorldState,saved:WorldState):void {
  if(!snapshot.protagonists||!saved.protagonists)return;
  const owner=snapshot.protagonists.accounts.active;
  const known=new Map((snapshot.protagonists.socialInvitations??[])
    .filter(i=>i.owner===owner).map(i=>[i.id,new Set(i.agenda?.events.filter(e=>!e.narrated).map(e=>e.id)??[])]));
  for(const invite of saved.protagonists.socialInvitations ?? []){
    for(const entry of invite.agenda?.events??[]){
      if(known.get(invite.id)?.has(entry.id))entry.narrated=true;
    }
  }
}
