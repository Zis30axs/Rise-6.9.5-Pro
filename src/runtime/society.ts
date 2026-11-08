/**
 * Local social structure layer. Formal bands reuse the livehouse ledger as their
 * sole membership authority; social circles and cross-group coalitions are
 * voluntary records. No speculative NPC consent is inferred here.
 */
import type { BandLeader } from './livehouse';
export type SocialOwner = 'soyo' | 'sakiko' | 'emma' | 'renako';
export const SOCIAL_OWNERS = ['soyo','sakiko','emma','renako'] as const;
export type AdvisorSeat = 'music' | 'social' | 'operations';
export interface SocialCircle {
  id: string;
  title: string;
  founder: SocialOwner;
  memberIds: string[];
  formedAt: number;
}
export interface SocialUnion {
  id: string;
  title: string;
  coordinator: SocialOwner;
  groupIds: string[];
  formedAt: number;
}
export interface SocialInvitation { id: string; circleId: string; from: SocialOwner; personId: string; at: number; status: 'pending' | 'accepted' | 'declined' }
export interface SocialApplication { id: string; unionId: string; groupId: string; from: SocialOwner; at: number }
export interface AdvisorAssignment { bandId: string; seat: AdvisorSeat; personId: string }
export type ContestTargetKind = 'person' | 'opportunity';
export type ContestStatus = 'open' | 'resolved';
export interface SocialContest {
  id: string; title: string; targetId: string; targetKind: ContestTargetKind;
  openedAt: number; closesAt: number; participants: SocialOwner[];
  influence: Partial<Record<SocialOwner, number>>;
  lastContributionAt: Partial<Record<SocialOwner, number>>;
  status: ContestStatus; winner: SocialOwner | null; resolvedAt: number | null;
}
export interface SocietyRecord { id: string; at: number; actor: SocialOwner; kind: string; subject: string }
export interface SocietyState {
  version: 1;
  circles: SocialCircle[];
  unions: SocialUnion[];
  invitations: SocialInvitation[];
  applications: SocialApplication[];
  advisors: AdvisorAssignment[];
  contests: SocialContest[];
  receipts: { id: string; command: string }[];
  history: SocietyRecord[];
}
export interface SocietyContext {
  at: number;
  actor: SocialOwner;
  personId: string;
  knownPersonIds: readonly string[];
  bands: readonly { id: string; founder: BandLeader; members: readonly { personId: string }[] }[];
}
export type SocietyCommand =
  | { type: 'create_circle'; id: string; title: string }
  | { type: 'invite_circle'; circleId: string; personId: string }
  | { type: 'accept_circle'; invitationId: string; accepted: boolean }
  | { type: 'leave_circle'; circleId: string }
  | { type: 'create_union'; id: string; title: string; groupId: string }
  | { type: 'propose_union'; unionId: string; groupId: string }
  | { type: 'approve_union'; applicationId: string; accepted: boolean }
  | { type: 'leave_union'; unionId: string; groupId: string }
  | { type: 'appoint_advisor'; bandId: string; seat: AdvisorSeat; personId: string }
  | { type: 'dismiss_advisor'; bandId: string; seat: AdvisorSeat }
  | { type: 'open_contest'; id: string; title: string; targetId: string; targetKind: ContestTargetKind; durationMinutes: number }
  | { type: 'join_contest'; contestId: string }
  | { type: 'contribute_contest'; contestId: string; effort: 'small' | 'medium' | 'large' }
  | { type: 'withdraw_contest'; contestId: string };

const MAX_AT = 525599999;
const ID=/^[A-Za-z0-9][A-Za-z0-9_:.\-]{0,79}$/;
function fail(problem:string):never {throw new Error(`社交组织无效：${problem}`);}
function validId(raw:unknown, label:string):string {return typeof raw==='string' && ID.test(raw)?raw:fail(label);}
function int(raw:unknown,min:number,max:number,label:string):number {return typeof raw==='number' && Number.isSafeInteger(raw) && raw>=min && raw<=max?raw:fail(label);}
function title(raw:unknown):string {return typeof raw==='string' && !!raw.trim() && raw.length<=60 && !/[\u0000-\u001f]/.test(raw)?raw.trim():fail('名称');}
function owner(raw:unknown):SocialOwner {return SOCIAL_OWNERS.includes(raw as SocialOwner)?raw as SocialOwner:fail('人物');}
function seat(raw:unknown):AdvisorSeat {return ['music','social','operations'].includes(raw as string)?raw as AdvisorSeat:fail('顾问席位');}
function object(raw:unknown,keys:readonly string[],label:string):Record<string,unknown> {
  if (!raw || typeof raw!=='object'||Array.isArray(raw))fail(label);
  const v=raw as Record<string,unknown>;
  if(Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k)))fail(`${label}字段`);
  return v;
}
function items<T>(raw:unknown,max:number,fn:(raw:unknown)=>T,key:(v:T)=>string,label:string):T[]{
  if(!Array.isArray(raw)||raw.length>max)fail(`${label}数量`);
  const rows=raw.map(fn);
  if(new Set(rows.map(key)).size!==rows.length)fail(`${label}重复`);
  return rows;
}
export function createSocietyState():SocietyState {return {version:1,circles:[],unions:[],invitations:[],applications:[],advisors:[],contests:[],receipts:[],history:[]};}
export function parseSocietyState(raw:unknown,now:number):SocietyState {
  int(now,0,MAX_AT,'时钟');
  const hasContests=!!raw&&typeof raw==='object'&&!Array.isArray(raw)&&Object.hasOwn(raw,'contests');
  const s=object(raw,['version','circles','unions','invitations','applications','advisors',...(hasContests?['contests']:[]),'receipts','history'],'根');
  if(s.version!==1)fail('版本');
  const circles=items(s.circles,40,x=>{
    const c=object(x,['id','title','founder','memberIds','formedAt'],'社交圈');
    const memberIds=items(c.memberIds,40,x=>validId(x,'成员'),x=>x,'成员');
    if(!memberIds.length)fail('社交圈不能为空');
    return {id:validId(c.id,'社交圈ID'),title:title(c.title),founder:owner(c.founder),memberIds,formedAt:int(c.formedAt,0,now,'创建时间')};
  },x=>x.id,'社交圈');
  const unions=items(s.unions,30,x=>{
    const u=object(x,['id','title','coordinator','groupIds','formedAt'],'联合体');
    const groupIds=items(u.groupIds,40,x=>validId(x,'组织引用'),x=>x,'组织引用');
    if(!groupIds.length||groupIds.some(g=>!g.startsWith('band:')&&!g.startsWith('circle:')))fail('联合体成员');
    return {id:validId(u.id,'联合体ID'),title:title(u.title),coordinator:owner(u.coordinator),groupIds,formedAt:int(u.formedAt,0,now,'联合体时间')};
  },x=>x.id,'联合体');
  const invitations=items(s.invitations,120,x=>{
    const i=object(x,['id','circleId','from','personId','at','status'],'邀请');
    if(!['pending','accepted','declined'].includes(String(i.status)))fail('邀请状态');
    return {id:validId(i.id,'邀请ID'),circleId:validId(i.circleId,'圈子ID'),from:owner(i.from),personId:validId(i.personId,'邀请人'),at:int(i.at,0,now,'邀请时间'),status:i.status as SocialInvitation['status']};
  },x=>x.id,'邀请');
  const applications=items(s.applications,80,x=>{
    const a=object(x,['id','unionId','groupId','from','at'],'加入申请');
    return {id:validId(a.id,'申请ID'),unionId:validId(a.unionId,'联合体ID'),groupId:validId(a.groupId,'组织ID'),from:owner(a.from),at:int(a.at,0,now,'申请时间')};
  },x=>x.id,'加入申请');
  const advisors=items(s.advisors,90,x=>{
    const a=object(x,['bandId','seat','personId'],'顾问');
    return {bandId:validId(a.bandId,'乐队ID'),seat:seat(a.seat),personId:validId(a.personId,'顾问人物')};
  },x=>`${x.bandId}:${x.seat}`,'顾问');
  const contests:SocialContest[]=hasContests?items(s.contests,40,x=>{
    const c=object(x,['id','title','targetId','targetKind','openedAt','closesAt','participants','influence','lastContributionAt','status','winner','resolvedAt'],'竞争决议');
    const id=validId(c.id,'竞争决议ID'), targetId=validId(c.targetId,'竞争目标');
    if(c.targetKind!=='person'&&c.targetKind!=='opportunity')fail('竞争目标类型');
    const openedAt=int(c.openedAt,0,now,'竞争开始时间'), closesAt=int(c.closesAt,openedAt+30,MAX_AT,'竞争截止时间');
    if(closesAt>openedAt+43200)fail('竞争决议最长30天');
    const participants=items(c.participants,4,x=>owner(x),x=>x,'参与者');
    if(!participants.length)fail('竞争决议至少需要一名参与者');
    const parseScores=(raw:unknown,label:string)=>{
      if(!raw||typeof raw!=='object'||Array.isArray(raw))fail(label);
      const entries=Object.entries(raw as Record<string,unknown>);
      if(entries.length>4)fail(label);
      const result:Partial<Record<SocialOwner,number>>={};
      for(const [key,value] of entries){const who=owner(key);if(!participants.includes(who))fail(label+'参与者');result[who]=int(value,0,10000,label+'数值');}
      return result;
    };
    const influence=parseScores(c.influence,'影响力'),lastContributionAt=parseScores(c.lastContributionAt,'贡献时间');
    for(const [key,value] of Object.entries(lastContributionAt))lastContributionAt[key as SocialOwner]=int(value,0,now,'上次贡献时间');
    if(c.status!=='open'&&c.status!=='resolved')fail('竞争状态');
    const winner=c.winner===null?null:owner(c.winner),resolvedAt=c.resolvedAt===null?null:int(c.resolvedAt,closesAt,now,'结算时间');
    if(c.status==='open'&&(winner!==null||resolvedAt!==null))fail('未结算竞争不能有胜者');
    if(c.status==='resolved'&&resolvedAt===null)fail('已结算竞争缺少结算时间');
    if(winner!==null&&!participants.includes(winner))fail('胜者不属于参与者');
    return {id,title:title(c.title),targetId,targetKind:c.targetKind as ContestTargetKind,openedAt,closesAt,participants,influence,lastContributionAt,status:c.status as ContestStatus,winner,resolvedAt};
  },x=>x.id,'竞争决议'):[];
  const receipts=items(s.receipts,200,x=>{
    const r=object(x,['id','command'],'回执');
    if(typeof r.command!=='string'||r.command.length>400)fail('回执内容');
    return {id:validId(r.id,'回执ID'),command:r.command};
  },x=>x.id,'回执');
  const history=items(s.history,300,x=>{
    const h=object(x,['id','at','actor','kind','subject'],'组织历史');
    return {id:validId(h.id,'历史ID'),at:int(h.at,0,now,'历史时间'),actor:owner(h.actor),kind:validId(h.kind,'历史类型'),subject:validId(h.subject,'历史对象')};
  },x=>x.id,'历史');
  for(const invite of invitations)if(!circles.some(c=>c.id===invite.circleId))fail('邀请引用不存在的圈子');
  for(const application of applications)if(!unions.some(u=>u.id===application.unionId))fail('申请引用不存在的联合体');
  return {version:1,circles,unions,invitations,applications,advisors,contests,receipts,history};
}
const groupLeader=(s:SocietyState,context:SocietyContext,groupId:string):BandLeader|null=>
  groupId.startsWith('circle:')?s.circles.find(c=>`circle:${c.id}`===groupId)?.founder??null:
  groupId.startsWith('band:')?context.bands.find(b=>`band:${b.id}`===groupId)?.founder??null:null;

/** Advisors belong to the formal band, not to a person's status screen. */
export function currentBandAdvisors(s:SocietyState,ctx:SocietyContext,bandId:string):AdvisorAssignment[]{
  const band=ctx.bands.find(b=>b.id===bandId);
  return band?s.advisors.filter(a=>a.bandId===bandId&&band.members.some(m=>m.personId===a.personId)):[];
}

/** All operations are local; invitations are not automatic consent. */
export function applySocietyCommand(input:SocietyState,raw:SocietyCommand,requestId:string,ctx:SocietyContext):SocietyState {
  int(ctx.at,0,MAX_AT,'时钟');
  validId(ctx.personId,'当前人物身份');owner(ctx.actor);
  const id=validId(requestId,'请求ID'), signature=JSON.stringify(raw);
  if(signature.length>400)fail('请求过长');
  const fields:Record<SocietyCommand['type'],string[]>= {
    create_circle:['type','id','title'],invite_circle:['type','circleId','personId'],accept_circle:['type','invitationId','accepted'],
    leave_circle:['type','circleId'],create_union:['type','id','title','groupId'],propose_union:['type','unionId','groupId'],
    approve_union:['type','applicationId','accepted'],leave_union:['type','unionId','groupId'],
    appoint_advisor:['type','bandId','seat','personId'],dismiss_advisor:['type','bandId','seat'],
    open_contest:['type','id','title','targetId','targetKind','durationMinutes'],join_contest:['type','contestId'],
    contribute_contest:['type','contestId','effort'],withdraw_contest:['type','contestId'],
  };
  if(!Object.hasOwn(fields,(raw as SocietyCommand)?.type))fail('命令类型');
  const cmd=object(raw,fields[raw.type],'命令') as unknown as SocietyCommand;
  const old=input.receipts.find(r=>r.id===id);
  if(old){if(old.command!==signature)fail('重复请求内容不一致');return input;}
  const s:SocietyState=structuredClone(input),actor=ctx.actor,person=ctx.personId;
  let kind=cmd.type,subject='';
  if(cmd.type==='create_circle'){
    const circleId=validId(cmd.id,'圈子ID');
    if(s.circles.some(c=>c.id===circleId))fail('圈子重复');
    s.circles.push({id:circleId,title:title(cmd.title),founder:actor,memberIds:[person],formedAt:ctx.at});
    subject=circleId;
  }else if(cmd.type==='invite_circle'){
    const c=s.circles.find(c=>c.id===cmd.circleId);
    if(!c?.memberIds.includes(person))fail('只有圈子成员可以邀请');
    const target=validId(cmd.personId,'被邀请人');
    if(!ctx.knownPersonIds.includes(target)||target===person||c.memberIds.includes(target))fail('只能邀请真实认识且未加入的人物');
    if(s.invitations.some(i=>i.circleId===c.id&&i.personId===target&&i.status==='pending'))fail('邀请尚未处理');
    s.invitations.push({id,from:actor,circleId:c.id,personId:target,at:ctx.at,status:'pending'});
    subject=c.id;
  }else if(cmd.type==='accept_circle'){
    const i=s.invitations.find(i=>i.id===cmd.invitationId&&i.personId===person&&i.status==='pending');
    if(!i||typeof cmd.accepted!=='boolean')fail('只能由被邀请的本人决定');
    i.status=cmd.accepted?'accepted':'declined';
    const c=s.circles.find(c=>c.id===i.circleId)!;
    if(cmd.accepted&&!c.memberIds.includes(person))c.memberIds.push(person);
    subject=c.id;
  }else if(cmd.type==='leave_circle'){
    const c=s.circles.find(c=>c.id===cmd.circleId);
    if(!c?.memberIds.includes(person)||c.founder===actor)fail('创建者不能直接退出自己的圈子');
    c.memberIds=c.memberIds.filter(id=>id!==person);subject=c.id;
  }else if(cmd.type==='create_union'){
    const unionId=validId(cmd.id,'联合体ID'),groupId=validId(cmd.groupId,'组织引用');
    if(s.unions.some(u=>u.id===unionId)||groupLeader(s,ctx,groupId)!==actor)fail('只有组织负责人可以发起联合体');
    s.unions.push({id:unionId,title:title(cmd.title),coordinator:actor,groupIds:[groupId],formedAt:ctx.at});subject=unionId;
  }else if(cmd.type==='propose_union'){
    const u=s.unions.find(u=>u.id===cmd.unionId),g=validId(cmd.groupId,'组织引用');
    if(!u||groupLeader(s,ctx,g)!==actor||u.groupIds.includes(g))fail('无法申请加入联合体');
    if(s.applications.some(a=>a.unionId===u.id&&a.groupId===g))fail('申请尚未处理');
    s.applications.push({id,from:actor,unionId:u.id,groupId:g,at:ctx.at});subject=u.id;
  }else if(cmd.type==='approve_union'){
    const a=s.applications.find(a=>a.id===cmd.applicationId),u=s.unions.find(u=>u.id===a?.unionId);
    if(!a||!u||u.coordinator!==actor||typeof cmd.accepted!=='boolean')fail('只有联合体协调者可以审核');
    if(cmd.accepted){
      if(groupLeader(s,ctx,a.groupId)!==a.from)fail('原组织负责人已经变更');
      if(!u.groupIds.includes(a.groupId))u.groupIds.push(a.groupId);
    }
    s.applications=s.applications.filter(x=>x.id!==a.id);subject=u.id;
  }else if(cmd.type==='leave_union'){
    const u=s.unions.find(u=>u.id===cmd.unionId),g=validId(cmd.groupId,'组织引用');
    if(!u?.groupIds.includes(g)||groupLeader(s,ctx,g)!==actor)fail('不能代表其他组织退出');
    if(u.groupIds.length===1)fail('仅剩一个组织时应先完成联合体解散流程');
    u.groupIds=u.groupIds.filter(x=>x!==g);subject=u.id;
  }else if(cmd.type==='appoint_advisor'){
    const b=ctx.bands.find(b=>b.id===cmd.bandId),personId=validId(cmd.personId,'顾问');
    if(!b||b.founder!==actor||!b.members.some(m=>m.personId===personId))fail('只能从自己乐队的真实成员中任命顾问');
    const advisorSeat=seat(cmd.seat);
    s.advisors=s.advisors.filter(a=>!(a.bandId===b.id&&a.seat===advisorSeat));
    s.advisors.push({bandId:b.id,seat:advisorSeat,personId});subject=b.id;
  }else if(cmd.type==='dismiss_advisor'){
    const b=ctx.bands.find(b=>b.id===cmd.bandId),advisorSeat=seat(cmd.seat);
    if(!b||b.founder!==actor||!s.advisors.some(a=>a.bandId===b.id&&a.seat===advisorSeat))fail('顾问不存在或无管理权限');
    s.advisors=s.advisors.filter(a=>!(a.bandId===b.id&&a.seat===advisorSeat));subject=b.id;
  }else if(cmd.type==='open_contest'){
    const contestId=validId(cmd.id,'竞争决议ID'),targetId=validId(cmd.targetId,'竞争目标');
    if(s.contests.some(c=>c.id===contestId)||s.contests.filter(c=>c.status==='open').length>=20)fail('竞争决议重复或数量已满');
    if(cmd.targetKind!=='person'&&cmd.targetKind!=='opportunity')fail('竞争目标类型');
    if(cmd.targetKind==='person'&&(!ctx.knownPersonIds.includes(targetId)||targetId===person))fail('只能争取真实认识的其他人物');
    if(cmd.targetKind==='opportunity'&&!targetId.startsWith('opportunity:'))fail('机会目标必须使用 opportunity: 前缀');
    const duration=int(cmd.durationMinutes,30,43200,'竞争时长');
    s.contests.push({id:contestId,title:title(cmd.title),targetId,targetKind:cmd.targetKind,openedAt:ctx.at,closesAt:ctx.at+duration,
      participants:[actor],influence:{[actor]:0},lastContributionAt:{},status:'open',winner:null,resolvedAt:null});subject=contestId;
  }else if(cmd.type==='join_contest'){
    const contest=s.contests.find(c=>c.id===cmd.contestId&&c.status==='open');
    if(!contest||ctx.at>=contest.closesAt||contest.participants.includes(actor)||contest.participants.length>=4)fail('无法加入该竞争决议');
    if(contest.targetKind==='person'&&contest.targetId===person)fail('不能争取自己');
    contest.participants.push(actor);contest.influence[actor]=0;subject=contest.id;
  }else if(cmd.type==='contribute_contest'){
    const contest=s.contests.find(c=>c.id===cmd.contestId&&c.status==='open');
    if(!contest||ctx.at>=contest.closesAt||!contest.participants.includes(actor))fail('当前不能参与该竞争');
    const last=contest.lastContributionAt[actor];if(last!==undefined&&ctx.at-last<60)fail('每位参与者每小时只能贡献一次');
    const gain=cmd.effort==='small'?1:cmd.effort==='medium'?3:cmd.effort==='large'?5:0;
    if(!gain)fail('贡献档位无效');
    contest.influence[actor]=Math.min(10000,(contest.influence[actor]??0)+gain);contest.lastContributionAt[actor]=ctx.at;subject=contest.id;
  }else if(cmd.type==='withdraw_contest'){
    const contest=s.contests.find(c=>c.id===cmd.contestId&&c.status==='open');
    if(!contest||!contest.participants.includes(actor))fail('当前不能退出该竞争');
    contest.participants=contest.participants.filter(x=>x!==actor);delete contest.influence[actor];delete contest.lastContributionAt[actor];subject=contest.id;
    if(!contest.participants.length){contest.status='resolved';contest.winner=null;contest.resolvedAt=ctx.at;}
  }
  s.receipts.push({id,command:signature});s.receipts=s.receipts.slice(-200);
  s.history.push({id:`soc:${id}`,at:ctx.at,actor,kind,subject});s.history=s.history.slice(-300);
  return parseSocietyState(s,ctx.at);
}

/** The highest influence wins only when it leads outright and reaches a meaningful threshold. */
export function settleSocietyState(input:SocietyState,now:number):SocietyState {
  int(now,0,MAX_AT,'时钟');
  const due=input.contests.filter(c=>c.status==='open'&&c.closesAt<=now);
  if(!due.length)return input;
  const next:SocietyState=structuredClone(input);
  for(const dueContest of due){
    // Only mutate the candidate save. Never alter the caller's input.
    const contest=next.contests.find(item=>item.id===dueContest.id)!;
    const ranked=contest.participants.map(person=>({person,score:contest.influence[person]??0}))
      .sort((a,b)=>b.score-a.score||a.person.localeCompare(b.person));
    const first=ranked[0],second=ranked[1];
    contest.winner=first&&first.score>=3&&(!second||first.score>second.score)?first.person:null;
    contest.status='resolved';contest.resolvedAt=contest.closesAt;
    next.history.push({id:`contest:${contest.id}:resolved`,at:contest.closesAt,actor:contest.winner??contest.participants[0]!,kind:'contest_resolved',subject:contest.id});
  }
  next.history=next.history.slice(-300);
  return parseSocietyState(next,now);
}
