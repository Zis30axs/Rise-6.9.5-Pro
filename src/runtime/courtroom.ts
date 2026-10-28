import type { WorldAction, WorldState, StoryAction } from '../frontend/types';
import { PROTAGONISTS, type ProtagonistId } from './dual-protagonists';
import { activeProtagonist, protagonistNames } from './protagonist-world';
import { LAW_OFFICE_ID, SHERRY_ASSIST_RATE, lawCases } from './law-career';
import { getLocationStatus } from './location-services';

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
export interface CourtCase {
  id: string; source: 'commission' | 'lawsuit'; owner: ProtagonistId; day: number;
  category: CourtCategory; title: string; client: string; summary: string;
  white: string; evidence: CourtEvidence[]; truth: string | null; misdirection: string | null;
  rewardYen: number; experience: number; fee: CourtFiling | null;
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
}
export const initialCourtroom = (): CourtroomState => ({
  version: 1, categories: [...DAILY_COURT_CATEGORIES], board: null, special: null, active: null,
  filing: null, results: [], pendingRecaps: {}, serial: 0,
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
  const aliases: Record<ProtagonistId, string[]> = {
    soyo:['素世','长崎素世'], sakiko:['祥子','丰川祥子'],
    emma:['艾玛','樱羽艾玛'], renako:['玲奈子','甘织玲奈子'],
  };
  for (const id of PROTAGONISTS) if (raw === id || aliases[id].includes(raw)) return protagonistNames[id];
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
  const item = obj(raw, ['id','source','owner','day','category','title','client','summary','white','evidence','truth','misdirection','rewardYen','experience','fee','steps'], '在审案件');
  if (item.source !== 'commission' && item.source !== 'lawsuit') return error('案件来源');
  if ((item.source === 'commission' && (item.truth === null || item.fee !== null)) ||
    (item.source === 'lawsuit' && (item.truth !== null || item.misdirection !== null))) return error('案件真相');
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
    title: string(item.title, 100, '案件标题'), client: string(item.client, 100, '委托人'),
    summary: string(item.summary, 700, '案件简介'), white: string(item.white, 2500, '白剧本'),
    evidence: evidence(item.evidence), truth: item.truth === null ? null : string(item.truth, 2500, '黑剧本'),
    misdirection: item.misdirection === null ? null : string(item.misdirection, 1200, '隐藏误导点'),
    rewardYen: whole(item.rewardYen, 100000, '职业报酬'),
    experience: whole(item.experience, 2000, '职业经验'),
    fee: item.fee === null ? null : filing(item.fee), steps,
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
export function parseCourtroom(value: unknown): CourtroomState {
  const root = obj(value, ['version','categories','board','special','active','filing','results','pendingRecaps','serial'], '根结构');
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
  return { version: 1, categories, board, special, active, filing: pending, results, pendingRecaps,
    serial: whole(root.serial,1000000,'序列号') };
}
const authored: ReadonlyArray<Omit<CourtOffer, 'id' | 'preset'> & { white: string; evidence: CourtEvidence[]; truth: string; misdirection: string }> = [
  { category: 'civil', title: '没有归还的定金', client: '租房的大学生', summary: '房东以房间整修为由没收定金，双方对书面约定有争议。', difficulty:'easy', rewardYen:8000, experience:100,
    white:'学生在签订租房预约后取消入住。房东拒绝返还定金。^合同条款^、^取消日期^与^收据^是主要争点。',
    evidence:[{title:'预约合同',detail:'第六条要求提前十四日通知；合同附页注明整修期可免费取消。'},{title:'付款收据',detail:'学生已支付两万日元定金。'},{title:'整修通知',detail:'房东承认入住日前十日才告知房间停水整修。'}],
    truth:'房东晚于约定告知整修，学生在通知后当天取消；合同附页适用，定金应退还。',
    misdirection:'房东坚持只引用合同主文第六条而不提附页。' },
  { category: 'administrative', title: '咖啡馆的停业通知', client: '街角咖啡馆经营者', summary: '经营者收到停业处分，但申辩记录可能在送达时遗漏。', difficulty:'normal', rewardYen:15000, experience:150,
    white:'咖啡馆收到^停业处分^，业主认为此前的^申辩机会^与^送达手续^存在问题。',
    evidence:[{title:'停业通知书',detail:'载明处分原因和日期。'},{title:'送达回执',detail:'回执上的签收人并非业主本人。'},{title:'提交记录',detail:'咖啡馆曾提交申辩材料，但处分书未提及该材料。'}],
    truth:'行政机关未充分处理依法提出的申辩，程序存在瑕疵；应重新审查而不是当然免除所有管理责任。',
    misdirection:'经营者认为程序出错就能使此前的全部违规记录消失。' },
  { category:'minor-criminal',title:'错位的展厅时钟',client:'被怀疑盗画的志愿者',summary:'监控录像与画作交接记录显示出互相冲突的时间。',difficulty:'hard',rewardYen:22000,experience:180,
    white:'展厅画作暂时失踪，志愿者受到怀疑。^监控时间^与^修复室交接单^存在明显矛盾。',
    evidence:[{title:'监控校时单',detail:'案发当天监控时钟快了二十分钟。'},{title:'门禁簿',detail:'志愿者17:03刷卡离开。'},{title:'修复室交接单',detail:'16:35有两人签字确认画作被正常送往修复室。'}],
    truth:'画作由保管员依合法修复手续转移，志愿者未盗窃；监控时钟误差制造了错误指控。',
    misdirection:'证人把不准确的监控时间当作绝对可信的时间。' },
];
const preset = (day: number, categories: CourtCategory[]): CourtOffer => {
  const preferred = authored.filter(item => categories.includes(item.category));
  if (!preferred.length) return error('没有匹配的预设委托');
  const source = preferred[(day - 1) % preferred.length] ?? authored[0]!;
  return { id: 'preset-' + day, category: source.category, title: source.title, client: source.client,
    summary: source.summary, difficulty: source.difficulty, rewardYen: source.rewardYen,
    experience: source.experience, preset: true };
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
  const item = obj(raw, ['type','offerId','white','evidence','truth','misdirection'], '随机卷宗');
  const chosen = (court.board?.day === state.clock.day ? court.board.offers.find(row => row.id === item.offerId) : undefined)
    ?? (court.special?.day === state.clock.day && court.special.offer.id === item.offerId ? court.special.offer : undefined);
  if (!chosen || chosen.preset || court.results.some(result => result.id === String(item.offerId)))
    return error('请从今日尚未受理的随机委托中选择');
  return { type:'court_open', offerId: chosen.id, white:string(item.white,2500,'白剧本'),
    evidence:evidence(item.evidence), truth:string(item.truth,2500,'隐藏真相'),
    misdirection:string(item.misdirection,1200,'隐藏误导') };
}
export function validateCourtFeeQuote(raw: unknown, state: WorldState): Extract<StoryAction,{type:'court_quote'}> {
  eligible(state);
  const item = obj(raw, ['type','defendant','reason','risk','category','lawyer','sherry','courtFeeYen','lawyerFeeYen','sherryFeeYen'], '诉讼报价');
  const { type: _type, ...attributes } = item;
  const parsed = filing({ ...attributes, claimant: activeProtagonist(state) });
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
export function validateCourtFinish(raw: unknown, state: WorldState): Extract<StoryAction,{type:'court_finish'}> {
  const c = courtState(state).active;
  if (!c || c.owner !== activeProtagonist(state)) return error('当前没有进行中的庭审');
  const assistedProvided = !!raw && typeof raw === 'object' && !Array.isArray(raw) && Object.hasOwn(raw,'assisted');
  const item = obj(raw,assistedProvided ? ['type','verdict','summary','assisted'] : ['type','verdict','summary'],'庭审结论');
  if (assistedProvided && typeof item.assisted !== 'boolean') return error('雪莉协助标记');
  if (item.assisted === true && (c.source !== 'commission' || c.owner !== 'emma' || item.verdict !== 'win'))
    return error('雪莉接手只适用于艾玛已完成的职业委托');
  if (state.clock.day !== c.day) return error('庭审必须在开庭当天结束');
  if (!['win','loss','settled','withdrawn'].includes(String(item.verdict))) return error('结案方式');
  if (c.source === 'commission' && ['settled','withdrawn'].includes(String(item.verdict))) return error('职业委托尚未完成查明事实');
  // Evidence adequacy is checked at settlement, after earlier court_step actions in this turn.
  return { type:'court_finish', verdict:item.verdict as CourtResult['verdict'], summary:string(item.summary,1200,'判决说明'),
    ...(item.assisted === true ? { assisted:true } : {}) };
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
      category:'minor-criminal', title:source.title, client:source.client, summary:source.summary,
      white:source.summary + '请依据已经取得的证据自由质证。', evidence:source.evidence.map(item=>({title:item.title,detail:item.detail})),
      truth:source.rounds.map(item=>item.deduction).join(' '),
      misdirection:source.rounds.map(item=>item.statement).join(' '),
      rewardYen:source.rewardYen,experience:source.experience,fee:null,
      steps:old.deductions.map((summary,index)=>({key:'old-proof-'+index,kind:'contradiction' as const,summary:summary.slice(0,240)})),
    };
    oldOwner.active = null;
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
      category:offer.category, title:offer.title, client:offer.client, summary:offer.summary,
      white:scripted.white, evidence:structuredClone(scripted.evidence), truth:scripted.truth,
      misdirection:scripted.misdirection, rewardYen:offer.rewardYen, experience:offer.experience,
      fee:null, steps:[] };
  } else if (action.phase === 'sherry') {
    const active = current.active;
    if (!active || active.owner !== 'emma' || owner !== 'emma' || active.source !== 'commission') return error('只有艾玛的职业委托可以由雪莉救场');
    const payout = Math.round(active.rewardYen * SHERRY_ASSIST_RATE);
    next.player.balance += payout;
    current.results.push({id:active.id,owner,source:'commission',title:active.title,defendant:null,lawyer:null,verdict:'win',worldVerdict:'win',solvedBy:'sherry',
      payout,experience:Math.round(active.experience * SHERRY_ASSIST_RATE),summary:'橘雪莉依据现有证据完成关键论证，案件得到妥善解决。',atDay:state.clock.day});
    if (current.results.length > 300) current.results.shift();
    current.active = null;
  } else if (action.phase === 'confirm-filing') {
    eligible(state);
    const filing = current.filing;
    if (!filing || filing.claimant !== owner) return error('请先完成诉前咨询');
    if (filing.lawyer && filing.lawyer === owner) return error('不能聘请自己');
    const cost = filing.courtFeeYen + filing.lawyerFeeYen + filing.sherryFeeYen;
    if (next.player.balance < cost) return error('账户余额不足');
    next.player.balance -= filing.courtFeeYen; // Other fees use the shared transfer ledger after this reducer.
    current.serial++;
    current.active = { id:'filing-' + state.clock.day + '-' + current.serial, source:'lawsuit', owner, day:state.clock.day,
      category:filing.category, title:protagonistNames[owner] + (filing.category === 'minor-criminal' ? '告发' : '诉') + filing.defendant,
      client:protagonistNames[owner], summary:filing.reason, white:filing.reason,
      evidence:[{title:'诉状',detail:filing.reason},{title:'现有事实',detail:'以既有剧情和双方实际知情范围为准。'}],
      truth:null, misdirection:null, rewardYen:0, experience:0, fee:filing, steps:[] };
    current.filing = null;
  } else return error('未知的诉讼操作');
  next.courtroom = parseCourtroom(current);
  return next;
}
export function courtStoryAction(state: WorldState, action: Extract<StoryAction,{type:'court_docket'|'court_special'|'court_open'|'court_quote'|'court_step'|'court_finish'}>): { state: WorldState; minutes: number; reward: number } {
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
      category:offered.category, title:offered.title, client:offered.client, summary:offered.summary,
      white:parsed.white, evidence:parsed.evidence, truth:parsed.truth, misdirection:parsed.misdirection,
      rewardYen:offered.rewardYen, experience:offered.experience, fee:null, steps:[] };
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
  } else if (action.type === 'court_finish') {
    const parsed = validateCourtFinish(action,next);
    const active = court.active!;
    if (active.source === 'commission' && parsed.verdict === 'win' && active.steps.length < 1 && parsed.assisted !== true)
      return error('尚无有效推理');
    const sherry = active.source === 'commission' && active.owner === 'emma' && parsed.verdict === 'loss';
    const assisted = sherry || parsed.assisted === true;
    const verdict = sherry ? 'win' : parsed.verdict;
    const finalSummary = sherry ? '原有论证一度陷入困境，橘雪莉根据已在庭审中确认的证据与证言完成关键澄清，案件妥善结案。' : parsed.summary;
    const multiplier = assisted ? SHERRY_ASSIST_RATE : verdict === 'win' && active.source === 'commission' ? 1 : 0;
    reward = Math.round(active.rewardYen * multiplier);
    const experience = Math.round(active.experience * multiplier);
    court.results.push({ id:active.id, owner:active.owner, source:active.source, title:active.title,
      defendant:active.fee?.defendant ?? null,lawyer:active.fee?.lawyer ?? null,
      verdict, worldVerdict:verdict, solvedBy:assisted?'sherry':'player', payout:reward, experience,
      summary:finalSummary, atDay:state.clock.day });
    if (court.results.length > 300) court.results.shift();
    court.active = null;
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
  court.results.push({id:trial.id,owner:trial.owner,source:trial.source,title:trial.title,
    defendant:trial.fee?.defendant ?? null,lawyer:trial.fee?.lawyer ?? null,
    verdict:'loss',worldVerdict:trial.source==='commission'?'win':'undetermined',solvedBy:'forfeit',payout:0,experience:0,
    summary:'庭审论证表现不佳，橘雪莉随后澄清了关键争议并完成善后。',atDay:state.clock.day});
  if (court.results.length > 300) court.results.shift();
  court.pendingRecaps[trial.owner] = ('关于「' + trial.title + '」的庭审，' + protagonistNames[trial.owner] +
    '先前的庭审表现未能说服法庭。橘雪莉重新梳理了已知证据和证词，完成必要的善后与澄清。' +
    (trial.truth ? '案情最终得到澄清：' + trial.truth : '双方就争议作出了相应处理。') +
    '这次庭审没有带来职业报酬。').slice(0,1800);
  court.active = null;
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
    active:activePublic ? { ...activePublic,
      // This hidden truth is only in the model context; it is never in the player UI.
      hiddenBlackScript: active?.source === 'commission' ? { truth:active.truth, misdirection:active.misdirection } : null } : null,
    pendingFiling:court.filing?.claimant === owner ? court.filing : null,
    recentResults:court.results.filter(item => item.owner === owner || item.lawyer === owner || item.defendant === protagonistNames[owner]).slice(-6),
    rule:'职业委托白剧本给玩家、黑剧本仅供主持法庭；不得将黑剧本、误导点直接念给角色。主动诉讼没有黑剧本，以既有世界事实决定争点；轻微刑事仅可告发，由检察官决定是否提起公诉，不能把私人写成公诉人。自由文本质询，不要求固定答案。普通对白不推进时间，只有真实的新证言/突破/矛盾触发court_step。重要事件不能离开；无须玩家点击证据。艾玛遭遇不利判决时雪莉必须依据已知证据自动善后，按40%职业收益，强制切换则0%；此时 verdict=loss 仅记录玩家的职业表现，worldVerdict 则记录雪莉善后后的世界案件结果。和解必须双方同意，撤诉必须玩家主动表达。每日三份委托次日刷新。',
  };
}
