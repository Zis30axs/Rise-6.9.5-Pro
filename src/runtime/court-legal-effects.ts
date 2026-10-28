import type { WorldState } from '../frontend/types';
import { PROTAGONISTS, PROTAGONIST_PERSON_ID_LIST, type ProtagonistId } from './dual-protagonists';
import { applyPartyTransfer, protagonistNames, type TransferParty } from './protagonist-world';
import { allResidentCast } from './npc-cast';

export type CourtSide = 'claimant' | 'defendant';
export type CourtTermKind = 'payment' | 'apology' | 'cease' | 'return';
export interface CourtTermDraft {
  kind: CourtTermKind;
  from: CourtSide;
  description: string;
  amountYen: number;
  dueDay: number;
}
export interface CourtTerm extends CourtTermDraft {
  id: string;
  status: 'pending' | 'fulfilled';
  fulfilledDay: number | null;
}
export interface CourtParty {
  kind: 'protagonist' | 'npc';
  id: string;
  name: string;
}
export interface CourtSettlementOffer {
  summary: string;
  defendantConsented: boolean;
  terms: CourtTermDraft[];
}
export interface CourtAgreement {
  id: string;
  caseId: string;
  kind: 'settlement' | 'judgment';
  claimant: CourtParty;
  defendant: CourtParty;
  summary: string;
  day: number;
  terms: CourtTerm[];
}
export interface CourtSanctionDraft {
  personId: string;
  kind: 'custody' | 'community-service';
  startDay: number;
  endDay: number;
  detail: string;
}
export interface CourtSanction extends CourtSanctionDraft {
  id: string;
  caseId: string;
}
export interface CourtCareer {
  enrolled: boolean;
  qualification: 'unqualified' | 'student' | 'trainee' | 'licensed';
  experience: number;
  earnedYen: number;
  assistedCases: number;
}
export const initialCourtCareers = (): Record<ProtagonistId, CourtCareer> => Object.fromEntries(
  PROTAGONISTS.map(id => [id, {enrolled:false,qualification:'unqualified',experience:0,earnedYen:0,assistedCases:0}]),
) as Record<ProtagonistId,CourtCareer>;

const fail = (message: string): never => {throw new Error('法律执行状态无效：'+message);};
const asRecord = (value: unknown, keys: readonly string[], label: string): Record<string,unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail(label);
  const record = value as Record<string,unknown>;
  if (Object.keys(record).sort().join('|') !== [...keys].sort().join('|')) return fail(label+'字段');
  return record;
};
const text = (value: unknown, max: number): string => {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) return fail('说明');
  return value.trim();
};
const integer = (value: unknown, max: number): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > max) return fail('数额或日期');
  return value;
};
const side = (value: unknown): CourtSide => value === 'claimant' || value === 'defendant' ? value : fail('当事人');
const kind = (value: unknown): CourtTermKind =>
  ['payment','apology','cease','return'].includes(String(value)) ? value as CourtTermKind : fail('义务类别');
const party = (value: unknown): CourtParty => {
  const item=asRecord(value,['kind','id','name'],'诉讼当事人');
  if(item.kind !== 'protagonist' && item.kind !== 'npc') return fail('当事人身份');
  if(item.kind==='protagonist' && !PROTAGONISTS.includes(item.id as ProtagonistId)) return fail('主角身份');
  return {kind:item.kind as CourtParty['kind'],id:text(item.id,100),name:text(item.name,100)};
};

export function parseCourtTermDraft(raw: unknown): CourtTermDraft {
  const item = asRecord(raw,['kind','from','description','amountYen','dueDay'],'条款');
  const parsed: CourtTermDraft = {kind:kind(item.kind),from:side(item.from),
    description:text(item.description,400),amountYen:integer(item.amountYen,1000000),dueDay:integer(item.dueDay,365000)};
  if ((parsed.kind === 'payment' && !parsed.amountYen) || (parsed.kind !== 'payment' && parsed.amountYen))
    return fail('付款金额与履行义务不一致');
  return parsed;
}
export function parseCourtSettlementOffer(raw: unknown): CourtSettlementOffer {
  const item=asRecord(raw,['summary','defendantConsented','terms'],'待确认和解');
  if(typeof item.defendantConsented !== 'boolean' || !Array.isArray(item.terms) ||
    item.terms.length < 1 || item.terms.length > 8) return fail('和解条件');
  return {summary:text(item.summary,900),defendantConsented:item.defendantConsented,
    terms:item.terms.map(parseCourtTermDraft)};
}
export function parseCourtAgreement(raw: unknown): CourtAgreement {
  const item=asRecord(raw,['id','caseId','kind','claimant','defendant','summary','day','terms'],'协议');
  if(!['settlement','judgment'].includes(String(item.kind)) ||
    !Array.isArray(item.terms) || item.terms.length < 1 || item.terms.length > 8) return fail('协议基本信息');
  const terms=item.terms.map(rawTerm => {
    const term=asRecord(rawTerm,['id','kind','from','description','amountYen','dueDay','status','fulfilledDay'],'履行记录');
    const parsed=parseCourtTermDraft({kind:term.kind,from:term.from,description:term.description,amountYen:term.amountYen,dueDay:term.dueDay});
    if(term.status !== 'pending' && term.status !== 'fulfilled') return fail('履行状态');
    if((term.status==='fulfilled' && term.fulfilledDay === null) ||
      (term.status==='pending' && term.fulfilledDay!==null)) return fail('履行日期');
    return {...parsed,id:text(term.id,90),status:term.status as CourtTerm['status'],
      fulfilledDay:term.fulfilledDay===null?null:integer(term.fulfilledDay,365000)};
  });
  if(new Set(terms.map(t=>t.id)).size!==terms.length) return fail('重复义务编号');
  return {id:text(item.id,90),caseId:text(item.caseId,90),kind:item.kind as CourtAgreement['kind'],
    claimant:party(item.claimant),defendant:party(item.defendant),
    summary:text(item.summary,900),day:integer(item.day,365000),terms};
}
export function parseCourtSanctionDraft(raw: unknown): CourtSanctionDraft {
  const item=asRecord(raw,['personId','kind','startDay','endDay','detail'],'刑罚');
  if(item.kind!=='custody' && item.kind!=='community-service') return fail('刑罚类型');
  const startDay=integer(item.startDay,365000),endDay=integer(item.endDay,365000);
  if(endDay<startDay || endDay-startDay>365) return fail('刑期');
  const personId=text(item.personId,90);
  if(!allResidentCast.some(row=>row.id===personId) || PROTAGONIST_PERSON_ID_LIST.includes(personId as typeof PROTAGONIST_PERSON_ID_LIST[number]))
    return fail('刑罚对象必须是已知常驻 NPC');
  return {personId,kind:item.kind as CourtSanctionDraft['kind'],startDay,endDay,detail:text(item.detail,500)};
}
export function parseCourtSanction(raw: unknown): CourtSanction {
  const item=asRecord(raw,['id','caseId','personId','kind','startDay','endDay','detail'],'刑罚记录');
  return {...parseCourtSanctionDraft({personId:item.personId,kind:item.kind,
    startDay:item.startDay,endDay:item.endDay,detail:item.detail}),
    id:text(item.id,90),caseId:text(item.caseId,90)};
}
export function parseCourtCareer(raw: unknown): CourtCareer {
  const item=asRecord(raw,['enrolled','qualification','experience','earnedYen','assistedCases'],'律师职业');
  if(typeof item.enrolled!=='boolean' || !['unqualified','student','trainee','licensed'].includes(String(item.qualification)))
    return fail('律师职业身份');
  return {enrolled:item.enrolled,qualification:item.qualification as CourtCareer['qualification'],
    experience:integer(item.experience,10000000),earnedYen:integer(item.earnedYen,20000000),
    assistedCases:integer(item.assistedCases,100000)};
}
export function courtPartyForName(state: WorldState, display: string, caseId: string, role: CourtSide): CourtParty {
  for(const id of PROTAGONISTS) if(display===protagonistNames[id] || display===id)
    return {kind:'protagonist',id,name:protagonistNames[id]};
  const known=allResidentCast.find(row=>row.name===display || row.id===display);
  if(known) return {kind:'npc',id:known.id,name:known.name};
  const contact=state.contacts.find(row=>row.name===display || row.id===display || row.sourcePersonId===display);
  if(contact) return {kind:'npc',id:contact.sourcePersonId ?? contact.id,name:contact.name};
  return {kind:'npc',id:'court-'+caseId.slice(0,50)+':'+role,name:display};
}
export function newCourtAgreement(state: WorldState, caseId: string, claimant: string,
  defendant: string, summary: string, kind: CourtAgreement['kind'], terms: CourtTermDraft[]): CourtAgreement {
  return {id:'agreement-'+caseId,caseId,kind,
    claimant:courtPartyForName(state,claimant,caseId,'claimant'),
    defendant:courtPartyForName(state,defendant,caseId,'defendant'),
    summary,day:state.clock.day,
    terms:terms.map((term,index)=>({...term,id:'term-'+caseId+'-'+index,status:'pending' as const,fulfilledDay:null}))};
}
export function courtPaymentParty(agreement: CourtAgreement, payer: CourtSide): TransferParty {
  const row=payer==='claimant'?agreement.claimant:agreement.defendant;
  return row.kind==='protagonist' ? {kind:'protagonist',id:row.id as ProtagonistId,name:row.name}
    : {kind:'npc',id:row.id,name:row.name};
}
export function payCourtTerm(state: WorldState, agreement: CourtAgreement, term: CourtTerm): void {
  if(term.kind!=='payment' || term.status!=='pending') return fail('当前不需要付款');
  const from=courtPaymentParty(agreement,term.from);
  const to=courtPaymentParty(agreement,term.from==='claimant'?'defendant':'claimant');
  if(from.id===to.id) return fail('义务双方不能相同');
  applyPartyTransfer(state,'court-payment:'+term.id,from,to,term.amountYen*100,
    agreement.kind==='settlement'?'履行和解协议':'履行法院判决');
  term.status='fulfilled';
  term.fulfilledDay=state.clock.day;
}
export function courtTermStatus(term: CourtTerm, day: number): CourtTerm['status'] | 'overdue' {
  return term.status==='pending' && day>term.dueDay?'overdue':term.status;
}
export function isNpcUnderCourtRestriction(state: Pick<WorldState,'courtroom'>, personId: string,
  day: number, hour: number): boolean {
  return !!state.courtroom?.sanctions?.some(s=>s.personId===personId && day>=s.startDay && day<=s.endDay &&
    (s.kind==='custody' || (hour>=9 && hour<17)));
}
