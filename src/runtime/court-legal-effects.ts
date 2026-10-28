import type { WorldState } from '../frontend/types';
import { PROTAGONISTS, type ProtagonistId } from './dual-protagonists';
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
export interface CourtSettlementOffer {
  summary: string;
  defendantConsented: boolean;
  terms: CourtTermDraft[];
}
export interface CourtAgreement {
  id: string;
  caseId: string;
  kind: 'settlement' | 'judgment';
  claimant: ProtagonistId;
  defendant: string;
  defendantId: string;
  defendantKind: 'protagonist' | 'npc';
  summary: string;
  day: number;
  terms: CourtTerm[];
}
export interface CourtSanction {
  id: string;
  caseId: string;
  personId: string;
  kind: 'custody' | 'community-service';
  startDay: number;
  endDay: number;
  detail: string;
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
const name = (value: unknown, max: number): string => {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f]/.test(value)) return fail('说明');
  return value.trim();
};
const integer = (value: unknown, max: number): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > max) return fail('数额或日期');
  return value;
};
const party = (value: unknown): CourtSide => value === 'claimant' || value === 'defendant' ? value : fail('当事人');
const kind = (value: unknown): CourtTermKind =>
  ['payment','apology','cease','return'].includes(String(value)) ? value as CourtTermKind : fail('义务类别');

export function parseCourtTermDraft(raw: unknown): CourtTermDraft {
  const item = asRecord(raw,['kind','from','description','amountYen','dueDay'],'条款');
  const parsed: CourtTermDraft = {kind:kind(item.kind),from:party(item.from),
    description:name(item.description,400),amountYen:integer(item.amountYen,1000000),dueDay:integer(item.dueDay,365000)};
  if ((parsed.kind === 'payment' && !parsed.amountYen) || (parsed.kind !== 'payment' && parsed.amountYen))
    return fail('付款金额与履行义务不一致');
  return parsed;
}
export function parseCourtSettlementOffer(raw: unknown): CourtSettlementOffer {
  const item=asRecord(raw,['summary','defendantConsented','terms'],'待确认和解');
  if(typeof item.defendantConsented !== 'boolean' || !Array.isArray(item.terms) ||
    item.terms.length < 1 || item.terms.length > 8) return fail('和解条件');
  return {summary:name(item.summary,900),defendantConsented:item.defendantConsented,
    terms:item.terms.map(parseCourtTermDraft)};
}
export function parseCourtAgreement(raw: unknown): CourtAgreement {
  const item=asRecord(raw,['id','caseId','kind','claimant','defendant','defendantId','defendantKind','summary','day','terms'],'协议');
  if(!PROTAGONISTS.includes(item.claimant as ProtagonistId) ||
    !['settlement','judgment'].includes(String(item.kind)) ||
    !['protagonist','npc'].includes(String(item.defendantKind)) ||
    !Array.isArray(item.terms) || item.terms.length < 1 || item.terms.length > 8) return fail('协议基本信息');
  const terms=item.terms.map(rawTerm => {
    const term=asRecord(rawTerm,['id','kind','from','description','amountYen','dueDay','status','fulfilledDay'],'履行记录');
    const parsed=parseCourtTermDraft({kind:term.kind,from:term.from,description:term.description,amountYen:term.amountYen,dueDay:term.dueDay});
    if(term.status !== 'pending' && term.status !== 'fulfilled') return fail('履行状态');
    if(term.status==='fulfilled' && term.fulfilledDay === null || term.status==='pending' && term.fulfilledDay!==null) return fail('履行日期');
    return {...parsed,id:name(term.id,90),status:term.status as CourtTerm['status'],
      fulfilledDay:term.fulfilledDay===null?null:integer(term.fulfilledDay,365000)};
  });
  if(new Set(terms.map(t=>t.id)).size!==terms.length) return fail('重复义务编号');
  return {id:name(item.id,90),caseId:name(item.caseId,90),kind:item.kind as CourtAgreement['kind'],
    claimant:item.claimant as ProtagonistId,defendant:name(item.defendant,100),
    defendantId:name(item.defendantId,100),defendantKind:item.defendantKind as CourtAgreement['defendantKind'],
    summary:name(item.summary,900),day:integer(item.day,365000),terms};
}
export function parseCourtSanction(raw: unknown): CourtSanction {
  const item=asRecord(raw,['id','caseId','personId','kind','startDay','endDay','detail'],'刑罚记录');
  if(item.kind!=='custody' && item.kind!=='community-service') return fail('刑罚类型');
  const startDay=integer(item.startDay,365000),endDay=integer(item.endDay,365000);
  if(endDay<startDay || endDay-startDay>365) return fail('刑期');
  const personId=name(item.personId,90);
  if(!allResidentCast.some(row=>row.id===personId) || PROTAGONISTS.includes(personId as ProtagonistId))
    return fail('刑罚对象必须是已知常驻 NPC');
  return {id:name(item.id,90),caseId:name(item.caseId,90),personId,kind:item.kind as CourtSanction['kind'],
    startDay,endDay,detail:name(item.detail,500)};
}
export function parseCourtCareer(raw: unknown): CourtCareer {
  const item=asRecord(raw,['enrolled','qualification','experience','earnedYen','assistedCases'],'律师职业');
  if(typeof item.enrolled!=='boolean' || !['unqualified','student','trainee','licensed'].includes(String(item.qualification)))
    return fail('律师职业身份');
  return {enrolled:item.enrolled,qualification:item.qualification as CourtCareer['qualification'],
    experience:integer(item.experience,10000000),earnedYen:integer(item.earnedYen,20000000),
    assistedCases:integer(item.assistedCases,100000)};
}
export function defendantTransferParty(state: WorldState, defendant: string, caseId: string): TransferParty {
  for(const id of PROTAGONISTS) if(defendant===protagonistNames[id])
    return {kind:'protagonist',id,name:protagonistNames[id]};
  const known=allResidentCast.find(row=>row.name===defendant || row.id===defendant);
  if(known) return {kind:'npc',id:known.id,name:known.name};
  const contact=state.contacts.find(row=>row.name===defendant || row.id===defendant || row.sourcePersonId===defendant);
  if(contact) return {kind:'npc',id:contact.sourcePersonId ?? contact.id,name:contact.name};
  return {kind:'npc',id:'court-'+caseId+':defendant',name:defendant};
}
export function newCourtAgreement(state: WorldState, caseId: string, claimant: ProtagonistId,
  defendant: string, summary: string, kind: CourtAgreement['kind'], terms: CourtTermDraft[]): CourtAgreement {
  const resolved=defendantTransferParty(state,defendant,caseId);
  return {id:'agreement-'+caseId,caseId,kind,claimant,defendant,
    defendantId:resolved.id,defendantKind:resolved.kind,summary,day:state.clock.day,
    terms:terms.map((term,index)=>({...term,id:'term-'+caseId+'-'+index,status:'pending' as const,fulfilledDay:null}))};
}
export function courtPaymentParty(agreement: CourtAgreement, side: CourtSide): TransferParty {
  return side==='claimant' ? {kind:'protagonist',id:agreement.claimant,name:protagonistNames[agreement.claimant]} :
    agreement.defendantKind==='protagonist'
      ? {kind:'protagonist',id:agreement.defendantId as ProtagonistId,name:agreement.defendant}
      : {kind:'npc',id:agreement.defendantId,name:agreement.defendant};
}
/** Real debit and credit. When a debtor cannot pay, leave the obligation pending. */
export function payCourtTerm(state: WorldState, agreement: CourtAgreement, term: CourtTerm): void {
  if(term.kind!=='payment' || term.status!=='pending') return fail('当前不需要付款');
  const from=courtPaymentParty(agreement,term.from);
  const to=courtPaymentParty(agreement,term.from==='claimant'?'defendant':'claimant');
  applyPartyTransfer(state,'court-payment:'+term.id,from,to,term.amountYen*100,'履行'+agreement.kind==='settlement'?'和解协议':'法院判决');
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
