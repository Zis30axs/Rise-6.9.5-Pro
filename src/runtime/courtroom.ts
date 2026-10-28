import type { WorldAction, WorldState, StoryAction } from '../frontend/types';
import { PROTAGONISTS, type ProtagonistId } from './dual-protagonists';
import { activeProtagonist, protagonistNames, resolveTransferParty } from './protagonist-world';
import { LAW_OFFICE_ID, SHERRY_ASSIST_RATE, lawCases } from './law-career';
import { getLocationStatus } from './location-services';
import { personState } from './protagonist-world';
import {
  initialCourtCareers, parseCourtCareer, parseCourtAgreement, parseCourtSanction,
  parseCourtSanctionDraft, parseCourtSettlementOffer, parseCourtTermDraft,
  newCourtAgreement, payCourtTerm, courtPaymentParty, courtPartyForName, type CourtCareer,
  type CourtAgreement, type CourtSanction, type CourtSettlementOffer,
  type CourtTermDraft, type CourtSanctionDraft,
} from './court-legal-effects';
export const COURT_HEARING_ID = 'court-hearing';
export { courtTermStatus } from './court-legal-effects';

export type CourtCategory = 'civil' | 'administrative' | 'minor-criminal' | 'major-criminal';
export const DAILY_COURT_CATEGORIES: readonly CourtCategory[] = ['civil', 'administrative', 'minor-criminal'];
export const COURT_CATEGORIES: readonly CourtCategory[] = [...DAILY_COURT_CATEGORIES, 'major-criminal'];
export const COURT_CATEGORY_NAMES: Record<CourtCategory, string> = {
  civil: '民事', administrative: '行政', 'minor-criminal': '轻微刑事', 'major-criminal': '重大刑事特殊委托',
};
export type CourtDifficulty = 'easy' | 'normal' | 'hard';
export interface CourtEvidence { title: string; detail: string }
export interface CourtOffer {
  id: string; category: CourtCategory; title: string; client: string; summary: string;
  difficulty: CourtDifficulty; rewardYen: number; experience: number; preset: boolean;
}
export interface CourtFiling {
  claimant: ProtagonistId; defendant: string; reason: string; risk: string; category: CourtCategory;
  lawyer: ProtagonistId | null; sherry: boolean;
  courtFeeYen: number; lawyerFeeYen: number; sherryFeeYen: number;
}
export interface CourtJudgmentOrder {
  respondent: string;
  terms: CourtTermDraft[];
  sanctions: CourtSanctionDraft[];
}
export interface CourtCase {
  id: string; source: 'commission' | 'lawsuit'; owner: ProtagonistId; day: number;
  category: CourtCategory; title: string; client: string; summary: string;
  /** Fixed opponent identity, absent only in legacy and older preset cases. */
  respondent?: string | null;
  white: string; evidence: CourtEvidence[]; truth: string | null; misdirection: string | null;
  rewardYen: number; experience: number; fee: CourtFiling | null;
  /** Previous office position. Old saved hearings may omit this field. */
  returnTo?: { x: number; z: number; yaw: number };
  /** Authoritative trial-phase variable, never derived from dialogue text. */
  assistance: 'none' | 'sherry';
  steps: { key: string; kind: 'testimony' | 'insight' | 'contradiction'; summary: string }[];
}
export interface CourtResult {
  id: string; owner: ProtagonistId; source: CourtCase['source']; title: string;
  defendant: string | null; lawyer: ProtagonistId | null;
  verdict: 'win' | 'loss' | 'settled' | 'withdrawn';
  /** Actual case resolution can differ from the player's failed professional performance. */
  worldVerdict: 'win' | 'loss' | 'settled' | 'withdrawn' | 'undetermined';
  solvedBy: 'player' | 'sherry' | 'forfeit'; payout: number; experience: number;
  summary: string; atDay: number;
}
export interface CourtroomState {
  version: 1;
  categories: CourtCategory[];
  board: { day: number; offers: CourtOffer[] } | null;
  special: { day: number; offer: CourtOffer } | null;
  active: CourtCase | null;
  filing: CourtFiling | null;
  results: CourtResult[];
  pendingRecaps: Partial<Record<ProtagonistId, string>>;
  serial: number;
  /** Optional fields preserve legal records without changing the existing chat-variable root. */
  pendingSettlement?: CourtSettlementOffer | null;
  agreements?: CourtAgreement[];
  sanctions?: CourtSanction[];
  careers?: Record<ProtagonistId, CourtCareer>;
}
export const initialCourtroom = (): CourtroomState => ({
  version: 1, categories: [...DAILY_COURT_CATEGORIES], board: null, special: null, active: null,
  filing: null, results: [], pendingRecaps: {}, serial: 0,
  pendingSettlement:null,agreements:[],sanctions:[],careers:initialCourtCareers(),
});
export const courtState = (state: Pick<WorldState, 'courtroom'>): CourtroomState => state.courtroom ?? initialCourtroom();
const error = (message: string): never => { throw new Error('法庭存档或行动无效：' + message); };
const obj = (value: unknown, keys: readonly string[], label: string): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return error(label);
  const raw = value as Record<string, unknown>;
  if (Object.keys(raw).sort().join('|') !== [...keys].sort().join('|')) return error(label + '字段');
  return raw;
};
const string = (value: unknown, max: number, label: string): string => {
  if (typeof value !== 'string' || !value.trim() || value.length > max ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) return error(label);
  return value.trim();
};
const whole = (value: unknown, max: number, label: string): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > max) return error(label);
  return value;
};
const category = (value: unknown): CourtCategory =>
  COURT_CATEGORIES.includes(value as CourtCategory) ? value as CourtCategory : error('案件分类');
const protagonist = (value: unknown): ProtagonistId =>
  PROTAGONISTS.includes(value as ProtagonistId) ? value as ProtagonistId : error('主角身份');
const evidence = (value: unknown): CourtEvidence[] => {
  if (!Array.isArray(value) || value.length < 2 || value.length > 8) return error('证据数量');
  return value.map(raw => {
    const item = obj(raw, ['title', 'detail'], '证据');
    return { title: string(item.title, 80, '证据标题'), detail: string(item.detail, 500, '证据说明') };
  });
};
const offer = (raw: unknown): CourtOffer => {
  const item = obj(raw, ['id','category','title','client','summary','difficulty','rewardYen','experience','preset'], '委托');
  if (!['easy','normal','hard'].includes(String(item.difficulty)) || typeof item.preset !== 'boolean') return error('委托难度');
  const id = string(item.id, 60, '委托编号');
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,59}$/.test(id)) return error('委托编号格式');
  return {
    id, category: category(item.category),
    title: string(item.title, 100, '委托标题'), client: string(item.client, 80, '委托人'),
    summary: string(item.summary, 450, '委托简介'), difficulty: item.difficulty as CourtDifficulty,
    rewardYen: whole(item.rewardYen, 100000, '委托报酬'), experience: whole(item.experience, 2000, '委托经验'),
    preset: item.preset,
  };
};
/** Normalize familiar short names before recording a playable defendant. */
const courtDefendantName = (raw: string): string => {
  const normalized = (value: string) => value.toLowerCase().replace(/[\s·•._-]/g,'');
  const aliases: Record<ProtagonistId, string[]> = {
    soyo:['素世','长崎素世','soyo','protagonist-soyo'],
    sakiko:['祥子','丰川祥子','豐川祥子','sakiko','protagonist-sakiko'],
    emma:['艾玛','艾瑪','樱羽艾玛','櫻羽艾瑪','emma','majo-emma','protagonist-emma'],
    renako:['玲奈子','甘织玲奈子','甘織玲奈子','renako','watanare-renako','protagonist-renako'],
  };
  for (const id of PROTAGONISTS)
    if (aliases[id].some(alias=>normalized(alias)===normalized(raw))) return protagonistNames[id];
  return raw;
};
const filing = (raw: unknown): CourtFiling => {
  const item = obj(raw, ['claimant','defendant','reason','risk','category','lawyer','sherry','courtFeeYen','lawyerFeeYen','sherryFeeYen'], '诉状');
  const claimant = protagonist(item.claimant);
  const lawyer = item.lawyer === null ? null : protagonist(item.lawyer);
  if (lawyer === claimant || typeof item.sherry !== 'boolean') return error('律师身份');
  const result: CourtFiling = {
    claimant, defendant: courtDefendantName(string(item.defendant, 100, '被告姓名')),
    reason: string(item.reason, 1000, '起诉事由'), risk: string(item.risk, 1200, '诉前风险'), category: category(item.category),
    lawyer, sherry: item.sherry,
    courtFeeYen: whole(item.courtFeeYen, 100000, '起诉费'),
    lawyerFeeYen: whole(item.lawyerFeeYen, 100000, '律师费'),
    sherryFeeYen: whole(item.sherryFeeYen, 100000, '雪莉费用'),
  };
  if ((!lawyer && result.lawyerFeeYen) || (!result.sherry && result.sherryFeeYen) ||
    result.defendant === protagonistNames[claimant] ||
    (lawyer !== null && result.defendant === protagonistNames[lawyer]) ||
    (result.sherry && result.defendant === '橘雪莉')) return error('诉状费用或代理利益冲突');
  return result;
};
const courtCase = (raw: unknown): CourtCase => {
  const hasReturn = !!raw && typeof raw === 'object' && Object.hasOwn(raw,'returnTo');
  const hasRespondent = !!raw && typeof raw === 'object' && Object.hasOwn(raw,'respondent');
  const item = obj(raw, ['id','source','owner','day','category','title','client','summary','white','evidence','truth','misdirection','rewardYen','experience','fee','assistance','steps',
    ...(hasReturn?['returnTo']:[]),...(hasRespondent?['respondent']:[])], '在审案件');
  if (item.source !== 'commission' && item.source !== 'lawsuit') return error('案件来源');
  if ((item.source === 'commission' && item.fee !== null) ||
    (item.source === 'lawsuit' && (item.truth !== null || item.misdirection !== null))) return error('案件来源及兼容字段');
  if (item.assistance !== 'none' && item.assistance !== 'sherry') return error('救场状态变量');
  if (item.assistance === 'sherry' && (item.source !== 'commission' || item.owner !== 'emma')) return error('雪莉不能接手此类案件');
  if (!Array.isArray(item.steps) || item.steps.length > 30) return error('庭审进展');
  const seen = new Set<string>();
  const steps = item.steps.map(rawStep => {
    const step = obj(rawStep, ['key','kind','summary'], '庭审进度');
    const key = string(step.key, 50, '进度键');
    if (!['testimony','insight','contradiction'].includes(String(step.kind)) || seen.has(key)) return error('重复推理进度');
    seen.add(key);
    return { key, kind: step.kind as CourtCase['steps'][number]['kind'], summary: string(step.summary, 240, '进度说明') };
  });
  const parsed = {
    id: string(item.id, 90, '案件编号'), source: item.source, owner: protagonist(item.owner),
    day: whole(item.day, 365000, '开庭日'), category: category(item.category),
    ...(hasRespondent ? {respondent:item.respondent===null?null:string(item.respondent,100,'被告身份')} : {}),
    title: string(item.title, 100, '案件标题'), client: string(item.client, 100, '委托人'),
    summary: string(item.summary, 700, '案件简介'), white: string(item.white, 2500, '白剧本'),
    evidence: evidence(item.evidence), truth: item.truth === null ? null : string(item.truth, 2500, '黑剧本'),
    misdirection: item.misdirection === null ? null : string(item.misdirection, 1200, '隐藏误导点'),
    rewardYen: whole(item.rewardYen, 100000, '职业报酬'),
    experience: whole(item.experience, 2000, '职业经验'),
    fee: item.fee === null ? null : filing(item.fee), assistance:item.assistance, steps,
    ...(hasReturn ? {returnTo:parseCourtReturn(item.returnTo)} : {}),
  } as CourtCase;
  if (parsed.source === 'lawsuit' && (parsed.rewardYen !== 0 || parsed.experience !== 0 ||
    parsed.fee?.claimant !== parsed.owner)) return error('主动起诉不发放职业报酬');
  return parsed;
};
const result = (raw: unknown): CourtResult => {
  const item = obj(raw, ['id','owner','source','title','defendant','lawyer','verdict','worldVerdict','solvedBy','payout','experience','summary','atDay'], '结案记录');
  if (!['win','loss','settled','withdrawn'].includes(String(item.verdict)) ||
    !['win','loss','settled','withdrawn','undetermined'].includes(String(item.worldVerdict)) ||
    !['player','sherry','forfeit'].includes(String(item.solvedBy)) ||
    !['commission','lawsuit'].includes(String(item.source))) return error('判决类型');
  return { id: string(item.id,90,'结案编号'), owner: protagonist(item.owner),
    source: item.source as CourtCase['source'], title: string(item.title,100,'结案标题'),
    defendant:item.defendant===null ? null : string(item.defendant,100,'被告'),
    lawyer:item.lawyer===null ? null : protagonist(item.lawyer),
    verdict: item.verdict as CourtResult['verdict'], worldVerdict:item.worldVerdict as CourtResult['worldVerdict'],
    solvedBy: item.solvedBy as CourtResult['solvedBy'],
    payout: whole(item.payout,100000,'结案收入'), experience: whole(item.experience,2000,'结案经验'),
    summary: string(item.summary,1200,'判决内容'), atDay: whole(item.atDay,365000,'结案日期') };
};
const parseCourtReturn = (raw: unknown): {x:number;z:number;yaw:number} => {
  const data=obj(raw,['x','z','yaw'],'法庭返回位置');
  for(const key of ['x','z','yaw'] as const)
    if(typeof data[key]!=='number' || !Number.isFinite(data[key]) || Math.abs(data[key] as number)>360)
      return error('法庭返回坐标');
  return {x:data.x as number,z:data.z as number,yaw:data.yaw as number};
};
export function parseCourtroom(value: unknown): CourtroomState {
  const extra = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string,unknown> : {};
  const extras = ['pendingSettlement','agreements','sanctions','careers'].filter(key=>Object.hasOwn(extra,key));
  const root = obj(value, ['version','categories','board','special','active','filing','results','pendingRecaps','serial',...extras], '根结构');
  if (root.version !== 1 || !Array.isArray(root.categories) || !root.categories.length || root.categories.length > 4) return error('版本或筛选');
  const categories = root.categories.map(category);
  if (new Set(categories).size !== categories.length || categories.some(kind => !DAILY_COURT_CATEGORIES.includes(kind))) return error('重复或不受支持的日常筛选');
  let board: CourtroomState['board'] = null;
  if (root.board !== null) {
    const raw = obj(root.board, ['day','offers'], '公告栏');
    if (!Array.isArray(raw.offers) || raw.offers.length !== 3) return error('必须有三份委托');
    const offers = raw.offers.map(offer);
    if (new Set(offers.map(item => item.id)).size !== 3) return error('委托编号重复');
    board = { day: whole(raw.day,365000,'公告日期'), offers };
  }
  let special: CourtroomState['special'] = null;
  if (root.special !== null) {
    const raw = obj(root.special, ['day','offer'], '特殊委托');
    const selected = offer(raw.offer);
    if (selected.category !== 'major-criminal' || selected.preset) return error('特殊委托范围');
    special = { day:whole(raw.day,365000,'特殊委托日期'), offer:selected };
  }
  const active = root.active === null ? null : courtCase(root.active);
  const pending = root.filing === null ? null : filing(root.filing);
  if (!Array.isArray(root.results) || root.results.length > 300) return error('结案历史过长');
  const results = root.results.map(result);
  if (new Set(results.map(item => item.id)).size !== results.length || (active && results.some(item => item.id === active.id))) return error('案件重复结算');
  if (!root.pendingRecaps || typeof root.pendingRecaps !== 'object' || Array.isArray(root.pendingRecaps)) return error('补叙');
  const pendingRecaps: CourtroomState['pendingRecaps'] = {};
  for (const [person, narration] of Object.entries(root.pendingRecaps)) {
    pendingRecaps[protagonist(person)] = string(narration, 1800, '补叙正文');
  }
  const pendingSettlement = Object.hasOwn(root,'pendingSettlement')
    ? root.pendingSettlement===null ? null : parseCourtSettlementOffer(root.pendingSettlement)
    : null;
  if(pendingSettlement && (!active || active.source!=='lawsuit')) return error('没有诉讼不能提出和解');
  const agreements = Object.hasOwn(root,'agreements')
    ? Array.isArray(root.agreements) && root.agreements.length<=300 ? root.agreements.map(parseCourtAgreement) : error('协议列表')
    : [];
  const sanctions = Object.hasOwn(root,'sanctions')
    ? Array.isArray(root.sanctions) && root.sanctions.length<=100 ? root.sanctions.map(parseCourtSanction) : error('刑罚列表')
    : [];
  if(new Set(agreements.map(row=>row.id)).size!==agreements.length ||
    new Set(sanctions.map(row=>row.id)).size!==sanctions.length) return error('重复法律记录');
  const defaults=initialCourtCareers();
  const careers=Object.hasOwn(root,'careers') ? obj(root.careers,[...PROTAGONISTS],'主角律师职业') : defaults;
  const parsedCareers=Object.fromEntries(PROTAGONISTS.map(id=>[id,parseCourtCareer(careers[id])])) as Record<ProtagonistId,CourtCareer>;
  return { version: 1, categories, board, special, active, filing: pending, results, pendingRecaps,
    serial: whole(root.serial,1000000,'序列号'), pendingSettlement,agreements,sanctions,careers:parsedCareers };
}
const authored: ReadonlyArray<Omit<CourtOffer, 'id' | 'preset'> & { white: string; evidence: CourtEvidence[]; respondent: string }> = [
  { category: 'civil', title: '没有归还的定金', client: '租房的大学生', respondent:'房东', summary: '房东以房间整修为由没收定金，双方对书面约定有争议。', difficulty:'easy', rewardYen:8000, experience:100,
    white:'学生在签订租房预约后取消入住。房东拒绝返还定金。^合同条款^、^取消日期^与^收据^是主要争点。',
    evidence:[{title:'预约合同',detail:'第六条要求提前十四日通知；合同附页注明整修期可免费取消。'},{title:'付款收据',detail:'学生已支付两万日元定金。'},{title:'整修通知',detail:'房东承认入住日前十日才告知房间停水整修。'}],
  },
  { category: 'administrative', title: '咖啡馆的停业通知', client: '街角咖啡馆经营者', respondent:'作出停业决定的行政机关', summary: '经营者收到停业处分，但申辩记录可能在送达时遗漏。', difficulty:'normal', rewardYen:15000, experience:150,
    white:'咖啡馆收到^停业处分^，业主认为此前的^申辩机会^与^送达手续^存在问题。',
    evidence:[{title:'停业通知书',detail:'载明处分原因和日期。'},{title:'送达回执',detail:'回执上的签收人并非业主本人。'},{title:'提交记录',detail:'咖啡馆曾提交申辩材料，但处分书未提及该材料。'}],
  },
  { category:'minor-criminal',title:'错位的展厅时钟',client:'被怀疑盗画的志愿者',respondent:'被怀疑盗画的志愿者',summary:'监控录像与画作交接记录显示出互相冲突的时间。',difficulty:'hard',rewardYen:22000,experience:180,
    white:'展厅画作暂时失踪，志愿者受到怀疑。^监控时间^与^修复室交接单^存在明显矛盾。',
    evidence:[{title:'监控校时单',detail:'案发当天监控时钟快了二十分钟。'},{title:'门禁簿',detail:'志愿者17:03刷卡离开。'},{title:'修复室交接单',detail:'16:35有两人签字确认画作被正常送往修复室。'}],
  },
];
const preset = (day: number, categories: CourtCategory[]): CourtOffer => {
  const preferred = authored.filter(item => categories.includes(item.category));
  if (!preferred.length) return error('没有匹配的预设委托');
  const source = preferred[(day - 1) % preferred.length] ?? authored[0]!;
  return { id: 'preset-' + day, category: source.category, title: source.title, client: source.client,
    summary: source.summary, difficulty: source.difficulty, rewardYen: source.rewardYen,
    experience: source.experience, preset: true };
};
const courtOfficePosition = (state: WorldState) => {
  const room = state.interior;
  if(!room || state.locationId !== LAW_OFFICE_ID || room.roomId !== LAW_OFFICE_ID)
    return error('请在事务所受理案件');
  return {x:room.x,z:room.z,yaw:room.yaw};
};
/** Formal trial uses a real interior; the office position is restored on conclusion. */
const enterHearing = (state: WorldState): void => {
  const active=courtState(state).active;
  if(!active) return error('没有案件可开庭');
  active.returnTo = courtOfficePosition(state);
  state.locationId=COURT_HEARING_ID;
  state.interior={roomId:COURT_HEARING_ID,x:0,z:3.5,yaw:0,
    activityId:null,lastRest:null,lastStudy:null};
};
const leaveHearing = (state: WorldState, active: CourtCase): void => {
  if(state.locationId !== COURT_HEARING_ID) return;
  const pos=active.returnTo ?? {x:0,z:2,yaw:0};
  state.locationId=LAW_OFFICE_ID;
  state.interior={roomId:LAW_OFFICE_ID,...pos,activityId:null,lastRest:null,lastStudy:null};
};
const enrollCareer = (state: WorldState, careers: Record<ProtagonistId,CourtCareer>, id:ProtagonistId): void => {
  const row=careers[id];
  row.enrolled=true;
  if(row.qualification==='unqualified' && personState(state,id).academics?.majorId==='law')
    row.qualification='student';
};
const canOffice = (state: WorldState): void => {
  if (state.locationId !== LAW_OFFICE_ID || state.interior?.roomId !== LAW_OFFICE_ID)
    error('请先进入枫庭律师事务所');
  if (!getLocationStatus(LAW_OFFICE_ID,state.clock)?.isOpen)
    error('律师事务所当前不受理新案件');
};
const eligible = (state: WorldState): void => {
  if (courtState(state).active) error('当前庭审尚未结案');
  if (Object.values(state.lawCareer?.owners ?? {}).some(owner => owner?.active))
    error('尚有历史委托未完成，请先将旧案件接入自由庭审');
  canOffice(state);
};
export function validateCourtDocketOffers(raw: unknown, state: WorldState): CourtOffer[] {
  eligible(state);
  const court = courtState(state);
  if (court.board && court.board.day === state.clock.day) return error('今日公告栏已经确定');
  if (!Array.isArray(raw) || raw.length !== 2) return error('需要两份随机委托');
  const parsed = raw.map(offer);
  if (parsed.some(item => item.preset || !court.categories.includes(item.category) || item.id.startsWith('preset-') ||
    court.results.some(result => result.id === item.id) || item.id === preset(state.clock.day,court.categories).id) ||
    new Set(parsed.map(item => item.id)).size !== 2 ||
    new Set([...parsed.map(item => item.title), preset(state.clock.day,court.categories).title]).size !== 3)
    return error('随机委托不符合筛选或标题重复');
  // When all three everyday categories are enabled, one of each must appear.
  // For two categories the board must likewise represent both.
  const featured = preset(state.clock.day, court.categories);
  const covered = new Set([featured.category, ...parsed.map(item => item.category)]);
  if (court.categories.some(kind => !covered.has(kind)))
    return error('今日三份委托应涵盖全部已选类别');
  return parsed;
}
export function validateCourtSpecial(raw: unknown, state: WorldState): Extract<StoryAction,{type:'court_special'}> {
  eligible(state);
  const court = courtState(state);
  if (court.special?.day === state.clock.day) return error('今天已领取特殊委托');
  const item = obj(raw,['type','offer'],'特殊委托');
  const selected = offer(item.offer);
  if (selected.category !== 'major-criminal' || selected.preset || selected.rewardYen < 30000 ||
    court.results.some(row => row.id === selected.id)) return error('特殊委托内容');
  return {type:'court_special',offer:selected};
}
export function validateCourtOpen(raw: unknown, state: WorldState): Extract<StoryAction,{type:'court_open'}> {
  eligible(state);
  const court = courtState(state);
  const item = obj(raw, ['type','offerId','respondent','white','evidence'], '随机卷宗');
  const chosen = (court.board?.day === state.clock.day ? court.board.offers.find(row => row.id === item.offerId) : undefined)
    ?? (court.special?.day === state.clock.day && court.special.offer.id === item.offerId ? court.special.offer : undefined);
  if (!chosen || chosen.preset || court.results.some(result => result.id === String(item.offerId)))
    return error('请从今日尚未受理的随机委托中选择');
  const respondent=courtDefendantName(string(item.respondent,100,'被告身份'));
  if(PROTAGONISTS.some(id=>protagonistNames[id]===respondent)) return error('日常委托不得安排可操作主角为被告');
  return { type:'court_open', offerId: chosen.id, respondent, white:string(item.white,2500,'案情'),
    evidence:evidence(item.evidence) };
}
export function validateCourtFeeQuote(raw: unknown, state: WorldState): Extract<StoryAction,{type:'court_quote'}> {
  eligible(state);
  const item = obj(raw, ['type','defendant','reason','risk','category','lawyer','sherry','courtFeeYen','lawyerFeeYen','sherryFeeYen'], '诉讼报价');
  const { type: _type, ...attributes } = item;
  const parsed = filing({ ...attributes, claimant: activeProtagonist(state) });
  if(parsed.category!=='civil' && parsed.category!=='administrative') return error('主动起诉仅限民事与行政诉讼，刑事公诉由检察机关提出');
  // A protagonist may help with preparation, but formal legal agency requires
  // a qualification. Until certified, the chosen protagonist is co-counsel only.
  const { claimant: _claimant, ...quoted } = parsed;
  return { type:'court_quote', ...quoted };
}
export function validateCourtStep(raw: unknown, state: WorldState): Extract<StoryAction,{type:'court_step'}> {
  const c = courtState(state).active;
  if (!c || c.owner !== activeProtagonist(state)) return error('当前没有进行中的庭审');
  const item = obj(raw,['type','key','kind','summary'],'庭审节点');
  if (state.clock.day !== c.day) return error('庭审必须在开庭当天结束');
  const key = string(item.key,50,'节点标记');
  if (!['testimony','insight','contradiction'].includes(String(item.kind)) || c.steps.some(step => step.key === key))
    return error('重复或未知的庭审进展');
  return { type:'court_step', key, kind:item.kind as CourtCase['steps'][number]['kind'], summary:string(item.summary,240,'庭审进展') };
}
export function validateCourtAssist(raw: unknown, state: WorldState): Extract<StoryAction,{type:'court_assist'}> {
  const c = courtState(state).active;
  if (!c || c.owner !== 'emma' || activeProtagonist(state) !== 'emma' ||
    c.source !== 'commission' || c.assistance !== 'none' || c.day !== state.clock.day)
    return error('当前案件无法再次请求雪莉接手');
  const item = obj(raw,['type','who'],'雪莉接手');
  if (item.type !== 'court_assist' || item.who !== 'sherry') return error('法律协助者');
  return {type:'court_assist',who:'sherry'};
}
export function validateCourtSettlement(raw: unknown, state: WorldState): Extract<StoryAction,{type:'court_settlement'}> {
  const c=courtState(state).active;
  if(!c || c.owner!==activeProtagonist(state) || c.source!=='lawsuit' || c.day!==state.clock.day)
    return error('没有可以和解的主动诉讼');
  const item=obj(raw,['type','summary','defendantConsented','terms'],'庭外和解提案');
  const parsed=parseCourtSettlementOffer({summary:item.summary,defendantConsented:item.defendantConsented,terms:item.terms});
  if(parsed.terms.some(term=>term.dueDay<state.clock.day)) return error('和解不得设置过去的履行日期');
  return {type:'court_settlement',...parsed};
}
export function validateCourtFulfillment(raw: unknown, state: WorldState): Extract<StoryAction,{type:'court_fulfill'}> {
  const item=obj(raw,['type','termId','description'],'法律义务履行');
  const termId=string(item.termId,90,'履行条款编号');
  const agreement=courtState(state).agreements?.find(row=>row.terms.some(term=>term.id===termId));
  const term=agreement?.terms.find(row=>row.id===termId);
  if(!agreement || !term || term.status!=='pending' || term.kind==='payment') return error('不存在需要履行的非金钱义务');
  const debtor=term.from==='claimant'?agreement.claimant:agreement.defendant;
  if(debtor.kind==='protagonist' && debtor.id!==activeProtagonist(state))
    return error('不能替另一个主角履行其个人承诺');
  return {type:'court_fulfill',termId,description:string(item.description,500,'履行依据')};
}
export function validateCourtFinish(raw: unknown, state: WorldState): Extract<StoryAction,{type:'court_finish'}> {
  const c = courtState(state).active;
  if (!c || c.owner !== activeProtagonist(state)) return error('当前没有进行中的庭审');
  const hasOrder=!!raw && typeof raw==='object' && Object.hasOwn(raw,'order');
  const item = obj(raw,['type','verdict','summary',...(hasOrder?['order']:[])],'庭审结论');
  if (state.clock.day !== c.day) return error('庭审必须在开庭当天结束');
  if (!['win','loss','settled','withdrawn'].includes(String(item.verdict))) return error('结案方式');
  if (item.verdict==='settled' || item.verdict==='withdrawn')
    return error('和解须经玩家确认，撤诉须从庭审菜单提出');
  let order: CourtJudgmentOrder | undefined;
  if(hasOrder){
    const proposal=obj(item.order,['respondent','terms','sanctions'],'判决执行内容');
    if(!Array.isArray(proposal.terms) || proposal.terms.length>8 ||
      !Array.isArray(proposal.sanctions) || proposal.sanctions.length>3) return error('判决条款数量');
    order={respondent:string(proposal.respondent,100,'诉讼对方'),
      terms:proposal.terms.map(parseCourtTermDraft),
      sanctions:proposal.sanctions.map(parseCourtSanctionDraft)};
    if(order.terms.some(term=>term.dueDay<state.clock.day) ||
      order.sanctions.some(row=>row.startDay<state.clock.day)) return error('判决执行日期不能早于今天');
    const fixedRespondent = c.fee?.defendant ?? c.respondent;
    if(!fixedRespondent || order.respondent!==fixedRespondent) return error('被告与已锁定的卷宗身份不一致');
    if(order.sanctions.some(row=>row.personId !== courtPartyForName(state,order!.respondent,c.id,'defendant').id))
      return error('只能对经认定的涉案被告执行刑罚');
    if(order.sanctions.length && (!['minor-criminal','major-criminal'].includes(c.category) ||
      !['win','loss'].includes(String(item.verdict)))) return error('民事诉讼不得直接执行刑罚');
    if(order.terms.some(term=>term.kind==='payment' && term.amountYen>1000000)) return error('赔偿过高');
  }
  // Evidence adequacy is checked at settlement, after earlier court_step actions in this turn.
  return {type:'court_finish',verdict:item.verdict as CourtResult['verdict'],
    summary:string(item.summary,1200,'判决说明'),...(order?{order}:{})};
}
export function courtAction(state: WorldState, action: Extract<WorldAction,{type:'courtroom'}>): WorldState {
  const next: WorldState = structuredClone(state);
  const current = parseCourtroom(next.courtroom ?? initialCourtroom());
  const owner = activeProtagonist(state);
  if (action.phase === 'migrate-legacy') {
    if (current.active) return error('当前已有进行中的庭审');
    canOffice(state);
    const oldOwner = next.lawCareer?.owners[owner];
    if (!oldOwner?.active) return error('当前人物没有待继续的历史委托');
    const old = oldOwner.active;
    const source = lawCases.find(item => item.id === old.caseId);
    if (!source) return error('历史委托卷宗不存在');
    current.active = {
      id: 'legacy-' + owner + '-' + source.id, source:'commission', owner, day:state.clock.day,
      category:'minor-criminal', title:source.title, client:source.client, summary:source.summary,respondent:null,
      white:source.summary + '请依据已经取得的证据自由质证。', evidence:source.evidence.map(item=>({title:item.title,detail:item.detail})),
      truth:null, misdirection:null,
      rewardYen:source.rewardYen,experience:source.experience,fee:null,assistance:'none',
      returnTo:courtOfficePosition(next),
      steps:old.deductions.map((summary,index)=>({key:'old-proof-'+index,kind:'contradiction' as const,summary:summary.slice(0,240)})),
    };
    oldOwner.active = null;
    enrollCareer(next,current.careers!,owner);
    next.courtroom=current;
    enterHearing(next);
  } else if (action.phase === 'filter') {
    eligible(state);
    if (current.board?.day === state.clock.day) return error('今天的公告栏已经公布，明日可以重新筛选');
    const categories = action.categories;
    if (!categories || !categories.length || new Set(categories).size !== categories.length ||
      categories.some(category => !DAILY_COURT_CATEGORIES.includes(category))) return error('日常委托筛选无效');
    current.categories = categories.map(category);
  } else if (action.phase === 'accept-preset') {
    eligible(state);
    const offer = current.board?.day === state.clock.day ? current.board.offers.find(row => row.id === action.offerId) : undefined;
    if (!offer || !offer.preset || current.results.some(item => item.id === offer.id)) return error('不能受理这份卷宗');
    const scripted = authored.find(item => item.title === offer.title);
    if (!scripted) return error('预设卷宗不存在');
    current.active = { id:offer.id, source:'commission', owner, day:state.clock.day,
      category:offer.category, title:offer.title, client:offer.client, summary:offer.summary,respondent:scripted.respondent,
      white:scripted.white, evidence:structuredClone(scripted.evidence), truth:null,
      misdirection:null, rewardYen:offer.rewardYen, experience:offer.experience,
      fee:null, assistance:'none', returnTo:courtOfficePosition(next), steps:[] };
    enrollCareer(next,current.careers!,owner);
    next.courtroom=current;
    enterHearing(next);
  } else if (action.phase === 'sherry') {
    const active = current.active;
    if (!active || active.owner !== 'emma' || owner !== 'emma' || active.source !== 'commission' || active.day !== state.clock.day) return error('只有艾玛当前的职业委托可以由雪莉救场');
    active.assistance = 'sherry';
    const payout = Math.round(active.rewardYen * (active.assistance === 'sherry' ? SHERRY_ASSIST_RATE : 1));
    next.player.balance += payout;
    current.results.push({id:active.id,owner,source:'commission',title:active.title,defendant:null,lawyer:null,verdict:'win',worldVerdict:'win',solvedBy:'sherry',
      payout,experience:Math.round(active.experience * SHERRY_ASSIST_RATE),summary:'橘雪莉依据现有证据完成关键论证，案件得到妥善解决。',atDay:state.clock.day});
    if (current.results.length > 300) current.results.shift();
    leaveHearing(next,active);
    current.active = null;
    enrollCareer(next,current.careers!,owner);
    current.careers![owner].experience = Math.min(10000000,current.careers![owner].experience+Math.round(active.experience*SHERRY_ASSIST_RATE));
    current.careers![owner].earnedYen = Math.min(20000000,current.careers![owner].earnedYen+payout);
  } else if (action.phase === 'confirm-filing') {
    eligible(state);
    const filing = current.filing;
    if (!filing || filing.claimant !== owner) return error('请先完成诉前咨询');
    if(filing.category!=='civil' && filing.category!=='administrative') return error('不能以私人名义提起刑事公诉');
    if (filing.lawyer && filing.lawyer === owner) return error('不能聘请自己');
    const cost = filing.courtFeeYen + filing.lawyerFeeYen + filing.sherryFeeYen;
    if (next.player.balance < cost) return error('账户余额不足');
    next.player.balance -= filing.courtFeeYen; // Other fees use the shared transfer ledger after this reducer.
    current.serial++;
    current.active = { id:'filing-' + state.clock.day + '-' + current.serial, source:'lawsuit', owner, day:state.clock.day,
      category:filing.category, title:protagonistNames[owner] + '诉' + filing.defendant,
      client:protagonistNames[owner], summary:filing.reason, respondent:filing.defendant, white:filing.reason,
      evidence:[{title:'诉状',detail:filing.reason},{title:'现有事实',detail:'以既有剧情和双方实际知情范围为准。'}],
      truth:null, misdirection:null, rewardYen:0, experience:0, fee:filing, assistance:'none',
      returnTo:courtOfficePosition(next), steps:[] };
    enrollCareer(next,current.careers!,owner);
    if(filing.lawyer){
      enrollCareer(next,current.careers!,filing.lawyer);
      const colleague=current.careers![filing.lawyer];
      colleague.earnedYen=Math.min(20000000,colleague.earnedYen+filing.lawyerFeeYen);
      colleague.experience=Math.min(10000000,colleague.experience+40);
      colleague.assistedCases++;
    }
    next.courtroom=current;
    enterHearing(next);
    current.filing = null;
  } else if(action.phase==='accept-settlement'){
    const trial=current.active;
    const offer=current.pendingSettlement;
    if(!trial || trial.source!=='lawsuit' || trial.owner!==owner ||
      !offer || !offer.defendantConsented) return error('双方尚未同意和解条款');
    if(offer.terms.some(term=>term.dueDay<state.clock.day)) return error('协议履行日期已过期，请重新协商');
    current.agreements!.push(newCourtAgreement(next,trial.id,protagonistNames[owner],
      trial.fee!.defendant,offer.summary,'settlement',offer.terms));
    current.results.push({id:trial.id,owner:trial.owner,source:trial.source,title:trial.title,
      defendant:trial.fee!.defendant,lawyer:trial.fee?.lawyer??null,verdict:'settled',worldVerdict:'settled',
      solvedBy:'player',payout:0,experience:0,summary:offer.summary,atDay:state.clock.day});
    if(current.results.length>300) current.results.shift();
    if(current.agreements!.length>300) current.agreements!.shift();
    leaveHearing(next,trial);
    current.active=null;current.pendingSettlement=null;
  } else if(action.phase==='reject-settlement'){
    if(!current.active || current.active.owner!==owner) return error('当前没有可以拒绝的和解');
    current.pendingSettlement=null;
  } else if(action.phase==='withdraw'){
    const trial=current.active;
    if(!trial || trial.owner!==owner || trial.source!=='lawsuit') return error('只有主动起诉人可以撤诉');
    current.results.push({id:trial.id,owner,source:trial.source,title:trial.title,
      defendant:trial.fee!.defendant,lawyer:trial.fee!.lawyer,verdict:'withdrawn',worldVerdict:'withdrawn',
      solvedBy:'player',payout:0,experience:0,summary:'原告自行撤回诉讼请求，已发生费用不自动退还。',atDay:state.clock.day});
    if(current.results.length>300) current.results.shift();
    leaveHearing(next,trial);
    current.active=null;current.pendingSettlement=null;
  } else if(action.phase==='fulfill-term'){
    if(current.active) return error('正在开庭时不能登记结案后的履行');
    const entry=current.agreements?.find(row=>row.terms.some(term=>term.id===action.termId));
    const term=entry?.terms.find(row=>row.id===action.termId);
    if(!entry || !term || term.status!=='pending' || term.kind==='payment') return error('没有待履行的非金钱义务');
    const from=term.from==='claimant'?entry.claimant:entry.defendant;
    if(from.kind!=='protagonist' || from.id!==owner) return error('不能替其他人物自行承认履行');
    term.status='fulfilled';
    term.fulfilledDay=state.clock.day;
  } else if(action.phase==='pay-term' || action.phase==='collect-term'){
    if(current.active) return error('正在开庭时不能办理结案后付款');
    const entry=current.agreements?.find(row=>row.terms.some(term=>term.id===action.termId));
    const term=entry?.terms.find(row=>row.id===action.termId);
    if(!entry || !term || term.status!=='pending' || term.kind!=='payment') return error('没有这笔待付金额');
    const from=term.from==='claimant'?entry.claimant:entry.defendant;
    const to=term.from==='claimant'?entry.defendant:entry.claimant;
    if(action.phase==='pay-term' && (from.kind!=='protagonist' || from.id!==owner)) return error('只能支付本主角的债务');
    if(action.phase==='collect-term' && (from.kind!=='npc' || to.kind!=='protagonist' || to.id!==owner))
      return error('只能向欠款 NPC 领取已判给本主角的款项');
    next.courtroom=current;
    payCourtTerm(next,entry,term);
    if(next.protagonists) next.protagonists.revision++;
  } else if (action.phase==='enroll-law') {
    if(current.active) return error('庭审期间不能办理职业登记');
    canOffice(next);
    enrollCareer(next,current.careers!,owner);
  } else if (action.phase==='return-office') {
    if(current.active || next.locationId!==COURT_HEARING_ID) return error('当前无法离开法庭');
    leaveHearing(next,{returnTo:{x:0,z:2,yaw:0}} as CourtCase);
  } else return error('未知的诉讼操作');
  next.courtroom = parseCourtroom(current);
  return next;
}
export function courtStoryAction(state: WorldState, action: Extract<StoryAction,{type:'court_docket'|'court_special'|'court_open'|'court_quote'|'court_step'|'court_assist'|'court_settlement'|'court_fulfill'|'court_finish'}>): { state: WorldState; minutes: number; reward: number } {
  const next: WorldState = structuredClone(state);
  const court = parseCourtroom(next.courtroom ?? initialCourtroom());
  let minutes = 0, reward = 0;
  if (action.type === 'court_docket') {
    const random = validateCourtDocketOffers(action.offers, next);
    court.board = { day: state.clock.day, offers: [preset(state.clock.day,court.categories), ...random] };
  } else if (action.type === 'court_special') {
    const parsed = validateCourtSpecial(action,next);
    court.special = {day:state.clock.day,offer:parsed.offer};
  } else if (action.type === 'court_open') {
    const parsed = validateCourtOpen(action, next);
    const chosen = court.board?.day === state.clock.day ? court.board.offers.find(item => item.id === parsed.offerId) : undefined;
    const offered = chosen ?? court.special?.offer;
    if (!offered || offered.id !== parsed.offerId) return error('待受理卷宗无效');
    court.active = { id:offered.id, source:'commission', owner:activeProtagonist(state), day:state.clock.day,
      category:offered.category, title:offered.title, client:offered.client, summary:offered.summary,respondent:parsed.respondent,
      white:parsed.white, evidence:parsed.evidence, truth:null, misdirection:null,
      rewardYen:offered.rewardYen, experience:offered.experience, fee:null, assistance:'none',
      returnTo:courtOfficePosition(next),steps:[] };
    enrollCareer(next,court.careers!,activeProtagonist(state));
    next.courtroom=court;
    enterHearing(next);
    minutes = 10;
  } else if (action.type === 'court_quote') {
    const parsed = validateCourtFeeQuote(action,next);
    court.filing = { claimant:activeProtagonist(state), defendant:parsed.defendant, reason:parsed.reason, risk:parsed.risk,
      category:parsed.category, lawyer:parsed.lawyer, sherry:parsed.sherry,
      courtFeeYen:parsed.courtFeeYen, lawyerFeeYen:parsed.lawyerFeeYen, sherryFeeYen:parsed.sherryFeeYen };
  } else if (action.type === 'court_step') {
    const parsed = validateCourtStep(action,next);
    const active = court.active!;
    active.steps.push({ key:parsed.key, kind:parsed.kind, summary:parsed.summary });
    minutes = { testimony:5, insight:10, contradiction:15 }[parsed.kind];
  } else if (action.type === 'court_assist') {
    validateCourtAssist(action,next);
    court.active!.assistance = 'sherry';
  } else if(action.type==='court_settlement'){
    const offer=validateCourtSettlement(action,next);
    court.pendingSettlement={summary:offer.summary,defendantConsented:offer.defendantConsented,terms:offer.terms};
  } else if(action.type==='court_fulfill'){
    const fulfilled=validateCourtFulfillment(action,next);
    const agreement=court.agreements?.find(row=>row.terms.some(term=>term.id===fulfilled.termId));
    const term=agreement?.terms.find(row=>row.id===fulfilled.termId);
    if(!term || term.kind==='payment' || term.status!=='pending') return error('承诺已履行或不存在');
    term.status='fulfilled';term.fulfilledDay=state.clock.day;
    minutes=5;
  } else if (action.type === 'court_finish') {
    const parsed = validateCourtFinish(action,next);
    const active = court.active!;
    if (active.source === 'commission' && parsed.verdict === 'win' && active.steps.length < 1 && active.assistance !== 'sherry')
      return error('尚无有效推理');
    const sherry = active.source === 'commission' && active.owner === 'emma' && parsed.verdict === 'loss';
    const assisted = sherry || active.assistance === 'sherry';
    const verdict = sherry ? 'win' : parsed.verdict;
    const finalSummary = sherry ? '原有论证一度陷入困境，橘雪莉根据已在庭审中确认的证据与证言完成关键澄清，案件妥善结案。' : parsed.summary;
    const multiplier = assisted ? SHERRY_ASSIST_RATE : verdict === 'win' && active.source === 'commission' ? 1 : 0;
    reward = Math.round(active.rewardYen * multiplier);
    const experience = Math.round(active.experience * multiplier);
    if(parsed.order && sherry) return error('雪莉救场后的最终判决不能沿用此前败诉内容的执行命令');
    if(parsed.order){
      const plaintiff=active.source==='lawsuit' ? protagonistNames[active.owner] : active.client;
      if(parsed.order.terms.length){
        if((court.agreements??[]).some(row=>row.caseId===active.id)) return error('此案已经保存履行协议');
        court.agreements!.push(newCourtAgreement(next,active.id,plaintiff,parsed.order.respondent,
          parsed.summary,'judgment',parsed.order.terms));
        if(court.agreements!.length>300) court.agreements!.shift();
      }
      for(const [index,sanction] of parsed.order.sanctions.entries()){
        if(court.sanctions!.some(row=>row.caseId===active.id && row.personId===sanction.personId))
          return error('同案重复处罚');
        court.sanctions!.push({...sanction,id:'court-sanction-'+active.id+'-'+index,caseId:active.id});
      }
      if(court.sanctions!.length>100) court.sanctions!.splice(0,court.sanctions!.length-100);
    }
    court.results.push({ id:active.id, owner:active.owner, source:active.source, title:active.title,
      defendant:active.fee?.defendant ?? null,lawyer:active.fee?.lawyer ?? null,
      verdict, worldVerdict:verdict, solvedBy:assisted?'sherry':'player', payout:reward, experience,
      summary:finalSummary, atDay:state.clock.day });
    if (court.results.length > 300) court.results.shift();
    enrollCareer(next,court.careers!,active.owner);
    const professional=court.careers![active.owner];
    professional.earnedYen=Math.min(20000000,professional.earnedYen+reward);
    professional.experience=Math.min(10000000,professional.experience+experience);
    leaveHearing(next,active);
    court.active = null;
    court.pendingSettlement=null;
    minutes = 10;
  }
  next.courtroom = parseCourtroom(court);
  return { state:next, minutes:Math.min(minutes,1439-state.clock.hour*60-state.clock.minute), reward };
}
export function abandonTrialOnSwitch(state: WorldState): WorldState {
  const active = courtState(state).active;
  if (!active || active.owner !== activeProtagonist(state)) return state;
  const next: WorldState = structuredClone(state);
  const court = parseCourtroom(next.courtroom ?? initialCourtroom());
  const trial = court.active!;
  const sherryCanResolve = trial.source === 'commission' && trial.owner === 'emma';
  court.results.push({id:trial.id,owner:trial.owner,source:trial.source,title:trial.title,
    defendant:trial.fee?.defendant ?? null,lawyer:trial.fee?.lawyer ?? null,
    verdict:'loss',worldVerdict:sherryCanResolve?'win':'undetermined',solvedBy:'forfeit',payout:0,experience:0,
    summary:sherryCanResolve?'原有辩论未能继续，橘雪莉依据已确认的证据完成必要善后。':'原告中止了本次庭审的继续参与，最终争议仍待依法处理。',atDay:state.clock.day});
  if (court.results.length > 300) court.results.shift();
  court.pendingRecaps[trial.owner] = ('关于「' + trial.title + '」的庭审，' + protagonistNames[trial.owner] +
    '的庭审参与已中止。' +
    (sherryCanResolve
      ? '橘雪莉依据当庭已经确认的材料完成了善后，案件得到妥善处理。'
      : '法庭仍需依法处理遗留争议，此处不推定任何一方胜诉或接受和解。') +
    '本次职业报酬为零。').slice(0,1800);
  leaveHearing(next,trial);
  court.active = null;
  court.pendingSettlement = null;
  next.courtroom = parseCourtroom(court);
  return next;
}
/** Show a saved post-trial scene once, when the original viewpoint is next entered. */
export function deliverCourtRecap(state: WorldState): WorldState {
  const owner = activeProtagonist(state);
  const recap = courtState(state).pendingRecaps[owner];
  if (!recap) return state;
  const next = structuredClone(state);
  const court = parseCourtroom(next.courtroom ?? initialCourtroom());
  delete court.pendingRecaps[owner];
  court.serial++;
  next.story.push({ id: 'court-recap-' + next.clock.day + '-' + court.serial, role: 'assistant', text: recap });
  next.story = next.story.slice(-100);
  next.courtroom = court;
  return next;
}
/**
 * Recognize an ordinary, already-settled shared transfer as performance of
 * exactly one recorded judgment term. A narrative phrase without a matching
 * transfer cannot change obligation status.
 */
export function acknowledgeCourtTransfers(state: WorldState, actions: readonly StoryAction[], turnId: string): WorldState {
  const transfers=actions.filter((action): action is Extract<StoryAction,{type:'transfer'}>=>action.type==='transfer');
  for(const [index,transfer] of transfers.entries()){
    if(!transfer.reason.startsWith('court-obligation:')) continue;
    const termId=transfer.reason.slice('court-obligation:'.length);
    const agreement=state.courtroom?.agreements?.find(row=>row.terms.some(term=>term.id===termId));
    const term=agreement?.terms.find(row=>row.id===termId);
    if(!agreement || !term || term.kind!=='payment')
      return error('转账未对应有效的法律付款条款');
    const who=activeProtagonist(state);
    const actualFrom=resolveTransferParty(state,who,transfer.from);
    const actualTo=resolveTransferParty(state,who,transfer.to);
    const expectedFrom=courtPaymentParty(agreement,term.from);
    const expectedTo=courtPaymentParty(agreement,term.from==='claimant'?'defendant':'claimant');
    if(transfer.cents!==term.amountYen*100 ||
       actualFrom.kind!==expectedFrom.kind || actualFrom.id!==expectedFrom.id ||
       actualTo.kind!==expectedTo.kind || actualTo.id!==expectedTo.id)
      return error('协议转账双方或金额与待履行条款不符');
    if(term.status==='fulfilled'){
      // The transfer leg writes this turn's receipt before acknowledgement, so a
      // brand-new turn id is not proof of a replay. A second journal line for the
      // same clause is a duplicate payment and must be rejected.
      const key='wa:'+turnId+':t'+index;
      const sameTurn=state.protagonists?.accounts.ledger.some(row=>
        row.id.startsWith(key+':out') || row.id===key+':in') ||
        state.journal.some(row=>row.id===key+':journal');
      const earlier=state.journal.some(row=>row.id!==key+':journal' && row.text.includes('court-obligation:'+termId));
      if(!sameTurn || earlier) return error('同一笔法律付款不可重复履行');
      continue;
    }
    term.status='fulfilled';
    term.fulfilledDay=state.clock.day;
  }
  return state;
}
export function isCourtInSession(state: WorldState): boolean {
  const trial = courtState(state).active;
  return !!trial && trial.owner === activeProtagonist(state);
}
export function courtStoryContext(state: WorldState) {
  const court = courtState(state);
  const owner = activeProtagonist(state);
  const active = court.active?.owner === owner ? court.active : null;
  const activePublic = active ? (({ truth: _truth, misdirection: _misdirection, ...details }) => details)(active) : null;
  return {
    categories:court.categories, board:court.board?.day === state.clock.day ? court.board : null,
    dailyPreset: court.board?.day === state.clock.day ? null : preset(state.clock.day, court.categories),
    suggestedRandomIds: [`docket-${state.clock.day}-a`,`docket-${state.clock.day}-b`],
    suggestedSpecialId: `special-${state.clock.day}`,
    special:court.special?.day === state.clock.day ? court.special.offer : null,
    offerToPrepare: court.board?.day === state.clock.day ? court.board.offers.filter(item => !court.results.some(row => row.id === item.id)) : [],
    venue:active ? {id:COURT_HEARING_ID,label:'法庭',returnTo:LAW_OFFICE_ID} : null,
    careers:court.careers,
    agreements:court.agreements?.filter(a=>a.claimant.id===owner || a.defendant.id===owner ||
      court.results.some(r=>r.id===a.caseId && (r.owner===owner || r.lawyer===owner))).slice(-12),
    sanctions:court.sanctions?.filter(row=>state.clock.day>=row.startDay && state.clock.day<=row.endDay),
    pendingSettlement:active?.source==='lawsuit'?court.pendingSettlement:null,
    active: activePublic,
    pendingFiling:court.filing?.claimant === owner ? court.filing : null,
    recentResults:court.results.filter(item => item.owner === owner || item.lawyer === owner || item.defendant === protagonistNames[owner]).slice(-6),
    rule:'庭审进程以持久化 court.active.assistance 和 court.results 等脚本变量为准，不以文字或临时结案词判断。雪莉正式接手必须先由 court_assist 将 assistance=sherry；普通建议不修改变量。所有委托仅保存公开案情和证据，不生成或注入预设黑剧本；依据现有世界事实、证据与人物知情边界自由推理，不得临时篡改已确认的历史；轻微刑事仅可告发，检察官决定公诉。自由文本质询，只有新的证言/推理/矛盾推动 court_step。庭审不能离开。艾玛独立胜诉100%，正式雪莉救场40%，切换主角0%；切换后的世界案件结果与玩家职业判负分开。和解须双方同意，撤诉必须玩家主动表达。每日委托次日刷新。',
  };
}
