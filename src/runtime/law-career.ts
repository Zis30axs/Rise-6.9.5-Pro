import type { WorldAction, WorldState } from '../frontend/types';
import { PROTAGONISTS, type ProtagonistId } from './dual-protagonists';
import { getLocationStatus } from './location-services';

/** Case results are authoritative game state. LLM prose may explain, never decide or pay them. */
export const LAW_OFFICE_ID = 'legal-office';
export const SHERRY_PERSON_ID = 'majo-sherry';
export const SHERRY_ASSIST_RATE = 0.4;

export interface LawEvidence { id: string; title: string; detail: string }
export interface LawRound { statement: string; evidenceId: string; deduction: string }
export interface LawCase {
  id: string;
  title: string;
  client: string;
  summary: string;
  evidence: readonly LawEvidence[];
  rounds: readonly LawRound[];
  rewardYen: number;
  experience: number;
}
export const lawCases: readonly LawCase[] = Object.freeze([
  {
    id: 'gallery-clock', title: '美术馆的错位时钟', client: '被怀疑擅自带走画作的展厅志愿者',
    summary: '一幅画作突然不见了。证人用录像时间指认志愿者，但展厅记录并不完全吻合。',
    evidence: [
      { id: 'camera-offset', title: '监控校时单', detail: '案发当天维护记录写明：展厅监控时钟比标准时间快二十分钟。' },
      { id: 'entry-ledger', title: '展厅门禁簿', detail: '志愿者的门禁刷卡时间为17:03；证人指认的录像画面显示16:20。' },
      { id: 'restoration-order', title: '修复室交接单', detail: '16:35的交接单有双人签名：原画由保管员依修复指令移往修复室，展厅登记尚未同步。' },
      { id: 'witness-note', title: '证人陈述', detail: '证人坚称监控上的时间绝无误差，并认为画作不可能依正规手续离开展厅。' },
    ],
    rounds: [
      { statement: '证人：录像明明写着16:20，所以事情一定发生在16:20！', evidenceId: 'camera-offset',
        deduction: '监控快了二十分钟，画面时间不能直接当作案发时间；证人的时间推断站不住脚。' },
      { statement: '证人：画作离开展厅，除了偷盗根本没有其他可能！', evidenceId: 'restoration-order',
        deduction: '有签名齐全的修复室交接单，画作是依手续移交；志愿者的盗窃嫌疑被排除，馆方补正登记。' },
    ],
    rewardYen: 8000, experience: 100,
  },
  {
    id: 'station-alibi', title: '消失的配送箱', client: '被误认为私带货物离开的店员',
    summary: '商务楼仓库少了一箱样品，证人声称店员当时就在仓库，却另有一份交通记录。',
    evidence: [
      { id: 'train-entry', title: '车站进站纪录', detail: '实名交通卡和站内镜头共同确认，店员17:58已进入车站，直到18:25才出站。' },
      { id: 'claim-timing', title: '指认笔录', detail: '证人坚持在18:10亲眼看到店员从仓库搬走配送箱。' },
      { id: 'dispatch-note', title: '物流临时转运单', detail: '仓库管理员18:05签发转运单，箱号与报失样品完全相同，货物已送往另一处柜台。' },
      { id: 'stock-sheet', title: '库存登记', detail: '系统直到当日晚间才补录转运，因此短时间显示少了一箱。' },
    ],
    rounds: [
      { statement: '证人：18:10的时候，我就在仓库看见那位店员！', evidenceId: 'train-entry',
        deduction: '同一时间店员在车站通行记录与镜头中有连续的不在场证据；指认时间不可信。' },
      { statement: '证人：少的那箱货没有任何正规去向，就是被人偷走了！', evidenceId: 'dispatch-note',
        deduction: '临时转运单与报失箱号一致，货物并未失窃；店员获澄清，仓库修正了延迟的库存登记。' },
    ],
    rewardYen: 10000, experience: 130,
  },
]);

export type LawCaseAction = Extract<WorldAction, { type: 'law_case' }>;
export interface LawActiveCase {
  caseId: string;
  stage: 'investigation' | 'cross-examination';
  round: number;
  mistakes: number;
  deductions: string[];
}
export interface LawCaseResult {
  caseId: string;
  outcome: 'perfect';
  solvedBy: 'player' | 'sherry';
  experience: number;
  payout: number;
  deductions: string[];
}
export interface LawOwnerProgress {
  experience: number;
  totalPayout: number;
  completedCaseIds: string[];
  active: LawActiveCase | null;
  lastResult: LawCaseResult | null;
}
export interface LawCareerState {
  version: 1;
  owners: Partial<Record<ProtagonistId, LawOwnerProgress>>;
}

const initialOwner = (): LawOwnerProgress => ({
  experience: 0, totalPayout: 0, completedCaseIds: [], active: null, lastResult: null,
});
export const initialLawCareer = (): LawCareerState => ({ version: 1, owners: {} });
export const lawOwner = (state: Pick<WorldState, 'lawCareer' | 'protagonists'>): LawOwnerProgress =>
  state.lawCareer?.owners[state.protagonists?.accounts.active ?? 'soyo'] ?? initialOwner();
export const currentLawCase = (state: Pick<WorldState, 'lawCareer' | 'protagonists'>): LawCase | null =>
  lawCases.find(item => item.id === lawOwner(state).active?.caseId) ?? null;

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const exact = (value: unknown, keys: readonly string[], label: string): Record<string, unknown> => {
  if (!isObject(value) || keys.some(key => !Object.hasOwn(value, key)) ||
    Object.keys(value).some(key => !keys.includes(key))) throw new Error('律师存档无效：' + label);
  return value;
};
const integer = (value: unknown, max: number, label: string): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > max)
    throw new Error('律师存档无效：' + label);
  return value;
};
const caseById = (id: unknown): LawCase => {
  const item = lawCases.find(entry => entry.id === id);
  if (!item) throw new Error('律师存档无效：案件编号');
  return item;
};
const proofPrefix = (entry: LawCase, length: number) => entry.rounds.slice(0, length).map(round => round.deduction);
const sameProof = (value: unknown, expected: readonly string[], label: string): string[] => {
  if (!Array.isArray(value) || value.length !== expected.length || value.some((item, index) => item !== expected[index]))
    throw new Error('律师存档无效：' + label);
  return [...expected];
};

/** Strict parse on every load, including old 1.11 and 1.13 protagonist saves. */
export function parseLawCareerState(value: unknown): LawCareerState {
  const root = exact(value, ['version', 'owners'], '根结构');
  if (root.version !== 1 || !isObject(root.owners)) throw new Error('律师存档无效：版本');
  const owners: LawCareerState['owners'] = {};
  for (const [rawOwner, raw] of Object.entries(root.owners)) {
    if (!PROTAGONISTS.includes(rawOwner as ProtagonistId)) throw new Error('律师存档无效：人物');
    const owner = rawOwner as ProtagonistId;
    const p = exact(raw, ['experience', 'totalPayout', 'completedCaseIds', 'active', 'lastResult'], '个人职业记录');
    if (!Array.isArray(p.completedCaseIds) || p.completedCaseIds.length > lawCases.length ||
      p.completedCaseIds.some(id => !lawCases.some(item => item.id === id)) ||
      new Set(p.completedCaseIds).size !== p.completedCaseIds.length)
      throw new Error('律师存档无效：结案记录');
    const completedCaseIds = p.completedCaseIds as string[];
    const experience = integer(p.experience, 10_000_000, '经验');
    const totalPayout = integer(p.totalPayout, 20_000_000, '报酬');
    let active: LawActiveCase | null = null;
    if (p.active !== null) {
      const a = exact(p.active, ['caseId', 'stage', 'round', 'mistakes', 'deductions'], '正在办理的案件');
      const current = caseById(a.caseId);
      if (completedCaseIds.includes(current.id) ||
        (a.stage !== 'investigation' && a.stage !== 'cross-examination')) throw new Error('律师存档无效：阶段');
      const round = integer(a.round, current.rounds.length - 1, '举证进度');
      if (a.stage === 'investigation' && round !== 0) throw new Error('律师存档无效：调查阶段');
      active = {
        caseId: current.id, stage: a.stage, round,
        mistakes: integer(a.mistakes, 99, '失误次数'),
        deductions: sameProof(a.deductions, proofPrefix(current, round), '证据链'),
      };
    }
    let lastResult: LawCaseResult | null = null;
    if (p.lastResult !== null) {
      const r = exact(p.lastResult, ['caseId', 'outcome', 'solvedBy', 'experience', 'payout', 'deductions'], '结案结果');
      const legalCase = caseById(r.caseId);
      const assisted = r.solvedBy === 'sherry';
      if (!completedCaseIds.includes(legalCase.id) || r.outcome !== 'perfect' ||
        (!assisted && r.solvedBy !== 'player') ||
        r.experience !== Math.round(legalCase.experience * (assisted ? SHERRY_ASSIST_RATE : 1)) ||
        r.payout !== Math.round(legalCase.rewardYen * (assisted ? SHERRY_ASSIST_RATE : 1)))
        throw new Error('律师存档无效：结案收益');
      lastResult = {
        caseId: legalCase.id, outcome: 'perfect', solvedBy: assisted ? 'sherry' : 'player',
        experience: r.experience as number, payout: r.payout as number,
        deductions: sameProof(r.deductions, proofPrefix(legalCase, legalCase.rounds.length), '结案推理'),
      };
    }
    if (lastResult && (experience < lastResult.experience || totalPayout < lastResult.payout))
      throw new Error('律师存档无效：职业累计值');
    owners[owner] = { experience, totalPayout, completedCaseIds: [...completedCaseIds], active, lastResult };
  }
  return { version: 1, owners };
}

export interface LawQuote {
  blockedReason: string | null;
  minutes: number;
  energyCost: number;
  stressGain: number;
  moraleGain: number;
  payout: number;
  experience: number;
  correct: boolean | null;
  feedback: string;
}
export function quoteLawCase(state: WorldState, action: LawCaseAction): LawQuote {
  const owner = state.protagonists?.accounts.active ?? 'soyo';
  const progress = lawOwner(state);
  const active = progress.active;
  const current = active ? caseById(active.caseId) : null;
  const selected = lawCases.find(item => item.id === action.caseId) ?? null;
  let blockedReason: string | null = null;
  let minutes = 0, energyCost = 0, stressGain = 0, moraleGain = 0;
  let payout = 0, experience = 0, correct: boolean | null = null, feedback = '';
  if (action.phase === 'accept') {
    minutes = 15; energyCost = 3;
    if (!selected) blockedReason = '请选择委托卷宗。';
    else if (active) blockedReason = '请先完成当前委托。';
    else if (progress.completedCaseIds.includes(selected.id)) blockedReason = '这份案件已经结案。';
    else feedback = '受理' + selected.title + '，橘雪莉会参与艾玛的调查与质证。';
  } else if (action.phase === 'investigate') {
    minutes = 45; energyCost = 8; stressGain = 3;
    if (!active || !current) blockedReason = '请先受理一份案件。';
    else if (active.stage !== 'investigation') blockedReason = '证据已经整理完毕。';
    else feedback = '完成现场资料核对，证据已加入卷宗，可以开始质证。';
  } else if (action.phase === 'present') {
    minutes = 20; energyCost = 5; stressGain = 2;
    if (!active || !current || active.stage !== 'cross-examination') blockedReason = '请先完成调查。';
    else if (!current.evidence.some(item => item.id === action.evidenceId)) blockedReason = '这份证据不在当前卷宗中。';
    else {
      const expected = current.rounds[active.round]!;
      correct = expected.evidenceId === action.evidenceId;
      if (correct) {
        feedback = expected.deduction;
        moraleGain = 3;
        if (active.round === current.rounds.length - 1) {
          payout = current.rewardYen; experience = current.experience;
        }
      } else {
        minutes = 10; energyCost = 2; stressGain = 4;
        feedback = '这项证据还不足以反驳证词。艾玛可以重新审视案卷，也可以请雪莉帮忙。';
      }
    }
  } else if (action.phase === 'sherry') {
    minutes = active?.stage === 'investigation' ? 60 : 35;
    energyCost = active?.stage === 'investigation' ? 10 : 6; stressGain = 1; moraleGain = 4;
    if (owner !== 'emma') blockedReason = '雪莉只在与艾玛共同承办的案件中接手推理。';
    else if (!active || !current) blockedReason = '当前没有需要雪莉接手的委托。';
    else {
      payout = Math.round(current.rewardYen * SHERRY_ASSIST_RATE);
      experience = Math.round(current.experience * SHERRY_ASSIST_RATE);
      feedback = '橘雪莉接手后根据已保存的证据逐一澄清矛盾，案件达到完美结局；艾玛取得40%的职业收获。';
    }
  } else {
    blockedReason = '未知的案件行动。';
  }
  if (!blockedReason && (state.locationId !== LAW_OFFICE_ID || state.interior?.roomId !== LAW_OFFICE_ID))
    blockedReason = '请先进入律师事务所办理案件。';
  const hours = getLocationStatus(LAW_OFFICE_ID, state.clock);
  if (!blockedReason && (!hours?.isOpen || (hours.minutesUntilClose !== null && minutes > hours.minutesUntilClose)))
    blockedReason = '律师事务所已停止接案或无法在下班前完成，办公时间 09:00–18:00。';
  if (!blockedReason && state.player.energy < energyCost) blockedReason = '精力不足，需要 ' + energyCost + ' 点精力。';
  if (!blockedReason && state.player.balance + payout > 20_000_000) blockedReason = '账户余额已到达上限。';
  if (!blockedReason && state.clock.day * 1440 + state.clock.hour * 60 + state.clock.minute + minutes > 365000 * 1440 + 1439)
    blockedReason = '已到达最大游戏日期。';
  return { blockedReason, minutes, energyCost, stressGain, moraleGain, payout, experience, correct, feedback };
}

/** Returns a new, bounded state; payment and clock are committed by the ordinary world reducer. */
export function settleLawCase(state: WorldState, action: LawCaseAction): { career: LawCareerState; quote: LawQuote } {
  const quote = quoteLawCase(state, action);
  if (quote.blockedReason) throw new Error(quote.blockedReason);
  const career = parseLawCareerState(JSON.parse(JSON.stringify(state.lawCareer ?? initialLawCareer())));
  const owner = state.protagonists?.accounts.active ?? 'soyo';
  const progress = career.owners[owner] ?? initialOwner();
  career.owners[owner] = progress;
  if (action.phase === 'accept') {
    progress.active = { caseId: action.caseId!, stage: 'investigation', round: 0, mistakes: 0, deductions: [] };
  } else if (action.phase === 'investigate') {
    progress.active!.stage = 'cross-examination';
  } else if (action.phase === 'present') {
    const active = progress.active!;
    const legalCase = caseById(active.caseId);
    if (quote.correct) {
      active.deductions.push(legalCase.rounds[active.round]!.deduction);
      active.round++;
      if (active.round === legalCase.rounds.length)
        finishCase(progress, legalCase, 'player', quote);
    } else {
      active.mistakes = Math.min(99, active.mistakes + 1);
    }
  } else if (action.phase === 'sherry') {
    const active = progress.active!;
    const legalCase = caseById(active.caseId);
    active.deductions.push(...proofPrefix(legalCase, legalCase.rounds.length).slice(active.round));
    finishCase(progress, legalCase, 'sherry', quote);
  }
  return { career: parseLawCareerState(career), quote };
}

function finishCase(progress: LawOwnerProgress, legalCase: LawCase, solvedBy: LawCaseResult['solvedBy'], quote: LawQuote) {
  const deductions = progress.active!.deductions;
  progress.completedCaseIds.push(legalCase.id);
  progress.experience += quote.experience;
  progress.totalPayout += quote.payout;
  progress.lastResult = {
    caseId: legalCase.id, outcome: 'perfect', solvedBy,
    experience: quote.experience, payout: quote.payout, deductions: [...deductions],
  };
  progress.active = null;
}

/** Story generation receives recorded facts, not permission to rewrite the verdict or awards. */
export function lawCareerStoryContext(state: WorldState) {
  const owner = state.protagonists?.accounts.active ?? 'soyo';
  const progress = lawOwner(state);
  const current = currentLawCase(state);
  return {
    occupation: '律师职业路线',
    office: LAW_OFFICE_ID,
    protagonist: owner,
    sherry: { personId: SHERRY_PERSON_ID, majorId: 'law', careerId: 'lawyer', qualification: 'trainee', guaranteedPartner: owner === 'emma' },
    experience: progress.experience,
    totalPayout: progress.totalPayout,
    active: current && progress.active ? {
      caseId: current.id, title: current.title, summary: current.summary,
      stage: progress.active.stage, round: progress.active.round, mistakes: progress.active.mistakes,
      evidence: progress.active.stage === 'cross-examination' ? current.evidence : [],
      statements: current.rounds.map(round => round.statement),
      deductions: progress.active.deductions,
    } : null,
    lastResult: progress.lastResult ? { ...progress.lastResult, title: caseById(progress.lastResult.caseId).title,
      evidence: caseById(progress.lastResult.caseId).evidence,
      statements: caseById(progress.lastResult.caseId).rounds.map(round => round.statement) } : null,
    rule: '案件真相、证据及收益来自程序。雪莉可完整推理并确保完美结局；玩家请她接手时只得40%的经验与报酬，禁止重复结算。',
  };
}
