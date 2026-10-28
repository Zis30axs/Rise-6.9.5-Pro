import type { AcademicGain, AcademicState, WorldState } from '../frontend/types';
import { getCampusInterior, getStudyEnergyCost, INTERIOR_INTERACTION_RANGE, isStudyInteraction, studyDurationOptions } from './campus-interiors';
import { getLocationStatus } from './location-services';

export interface AcademicSubject {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly stageTargets: readonly [number, number, number];
  readonly stageGoals: readonly [string, string, string];
}
export interface AcademicMajor {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly subjects: readonly AcademicSubject[];
}

const targets = Object.freeze([120, 360, 720] as const);
function subject(id: string, name: string, description: string, goals: [string, string, string]): AcademicSubject {
  return Object.freeze({ id, name, description, stageTargets: targets, stageGoals: Object.freeze(goals) });
}
function major(id: string, name: string, description: string, subjects: AcademicSubject[]): AcademicMajor {
  return Object.freeze({ id, name, description, subjects: Object.freeze(subjects) });
}

/** Authored prototype curriculum. Progress describes practice, not a degree or qualification. */
export const academicMajors: readonly AcademicMajor[] = Object.freeze([
  major('computer-science', '计算机', '共同学习程序、算法与网络三门专业课程。', [
    subject('cs-programming', '程序设计', '练习用程序表达问题与组织解法。', ['理解变量、条件与循环', '组合函数与常用数据结构', '独立拆解并调试小型程序']),
    subject('cs-algorithms', '数据结构与算法', '学习数据的组织方式与算法分析。', ['理解数组、链表与栈队列', '练习查找、排序与树的遍历', '分析复杂度并比较不同解法']),
    subject('cs-networks', '计算机网络', '理解设备之间如何传递信息。', ['认识分层模型与网络地址', '理解传输协议与请求响应', '分析常见网络通信过程']),
  ]),
  major('chinese-literature', '汉语言', '从文学阅读与语言分析中建立三门专业课程。', [
    subject('literature-modern', '现当代文学', '通过作品细读理解叙述与时代语境。', ['认识主要文学体裁与阅读方法', '比较作品的叙述视角与人物塑造', '结合文本写出有依据的文学分析']),
    subject('literature-classical', '古代文学', '阅读古典作品并理解其表达方式。', ['熟悉诗词文赋的基本形式', '辨析意象、用典与篇章结构', '结合语境完成古典作品赏析']),
    subject('linguistics', '语言学基础', '观察语音、词汇与语法的规律。', ['区分语音、词汇与语法层次', '分析构词、句法与语义关系', '用语言材料比较并解释表达现象']),
  ]),
  major('mathematics', '数学', '从分析、代数与概率中建立三门专业课程。', [
    subject('math-calculus', '微积分', '理解变化与积累的数学表达。', ['理解极限与连续的含义', '练习导数、积分及基本计算', '用微积分分析简单变化问题']),
    subject('math-linear-algebra', '线性代数', '学习向量、矩阵与线性关系。', ['掌握向量与矩阵的基本运算', '求解线性方程组并理解线性空间', '联系特征值与线性变换分析问题']),
    subject('math-probability', '概率论', '练习用概率描述不确定性。', ['理解事件、条件概率与独立性', '认识随机变量与常见分布', '分析期望、方差及简单随机模型']),
  ]),
  major('economics', '经济', '从个体决策、宏观运行与数据分析中建立三门专业课程。', [
    subject('econ-micro', '微观经济学', '学习个体与市场的基本分析方法。', ['理解供需、价格与机会成本', '分析消费者和厂商的选择', '比较市场结构与激励机制']),
    subject('econ-macro', '宏观经济学', '理解经济总量与宏观运行框架。', ['认识产出、通胀与就业指标', '理解总需求、总供给与经济波动', '比较不同政策情境下的传导关系']),
    subject('econ-statistics', '经济统计', '练习整理、描述与解释经济数据。', ['整理数据并读懂描述统计', '理解抽样、估计与变量关系', '解释统计结果并辨识结论局限']),
  ]),
  major('design', '设计', '从视觉、交互与色彩中建立三门专业课程。', [
    subject('design-visual', '视觉传达', '练习清楚地组织和传达视觉信息。', ['认识版式、字体与视觉层级', '组合图文完成主题信息编排', '比较并修改设计方案的表达效果']),
    subject('design-interaction', '交互设计', '围绕使用过程组织界面与反馈。', ['识别用户任务与操作路径', '绘制信息结构和基础交互流程', '依据使用反馈改进交互方案']),
    subject('design-color', '色彩构成', '学习颜色关系与画面组织。', ['辨识色相、明度与纯度', '练习配色、对比与色彩节奏', '围绕主题形成一致的色彩方案']),
  ]),
  major('music', '音乐', '从乐理、音乐史与写作中建立三门专业课程。', [
    subject('music-theory', '基础乐理', '理解记谱、节奏与音高关系。', ['读懂音符、节拍与音程', '辨识调式、和弦与基本进行', '分析短乐句的节奏和音高组织']),
    subject('music-history', '音乐史', '通过作品认识音乐风格的变化。', ['建立主要时期与体裁的框架', '比较不同作品的风格特征', '联系历史背景分析作品表达']),
    subject('music-composition', '作曲基础', '练习组织旋律与简单音乐结构。', ['构思短动机与旋律线条', '发展乐句并配置基础和声', '完成并修改一段结构清晰的小作品']),
  ]),
  major('law', '法学', '学习法律基础、证据分析和庭审论证；学习进度不等于律师执业资格。', [
    subject('law-foundations', '法律基础', '理解法律规范、权利义务和程序正义。', ['认识法律规范的适用条件', '辨析权利义务与诉讼程序', '在具体情境中说明法律依据']),
    subject('law-evidence', '证据法与事实认定', '理解证据真实性、关联性与证明力。', ['区分证言与客观记录', '检查时间线、来源和交叉印证', '建立经得起反驳的证据链']),
    subject('law-advocacy', '法庭论证', '练习从证据出发提出清晰、审慎的论证。', ['识别证言中的关键主张', '针对矛盾选择适合的证据', '完整陈述结论与合理限度']),
  ]),
  major('psychology', '心理', '从一般心理、发展与社会情境中建立三门专业课程。', [
    subject('psych-general', '普通心理学', '理解心理过程与基本研究方法。', ['区分感觉、知觉、记忆与注意', '联系学习、动机和情绪概念', '用研究证据比较心理现象的解释']),
    subject('psych-development', '发展心理学', '学习个体发展与环境的相互作用。', ['认识发展阶段与研究方法', '比较认知、情绪与社会性发展', '分析发展差异并区分观察与推断']),
    subject('psych-social', '社会心理学', '理解社会情境中的认知与行为。', ['认识态度、归因与社会认知', '比较群体影响与人际互动机制', '结合研究分析社会行为及其条件']),
  ]),
  major('biology', '生物', '从细胞、遗传与生态中建立三门专业课程。', [
    subject('bio-cell', '细胞生物学', '理解细胞结构与生命活动。', ['认识细胞结构与主要组分', '理解物质运输、代谢与细胞周期', '联系结构和功能解释细胞过程']),
    subject('bio-genetics', '遗传学', '学习遗传信息的传递与表达。', ['理解基因、染色体与遗传规律', '分析遗传信息复制与表达过程', '比较遗传变异及其可能影响']),
    subject('bio-ecology', '生态学', '学习生物与环境的相互联系。', ['区分个体、种群、群落与生态系统', '理解能量流动与物质循环', '分析环境变化对生态关系的影响']),
  ]),
]);

export const MAX_ACADEMIC_POINTS = 600_000_000;
export function getAcademicMajor(majorId: string): AcademicMajor | null {
  return academicMajors.find(item => item.id === majorId) ?? null;
}
export function getAcademicSubject(majorId: string, subjectId: string): AcademicSubject | null {
  return getAcademicMajor(majorId)?.subjects.find(item => item.id === subjectId) ?? null;
}
export function getAcademicSubjectById(subjectId: string): AcademicSubject | null {
  return academicMajors.flatMap(item => item.subjects).find(item => item.id === subjectId) ?? null;
}
export function getAcademicProgress(academics: AcademicState | null, subjectId: string) {
  if (!academics) return null;
  const major = academicMajors.find(item => item.subjects.some(subject => subject.id === subjectId));
  const subject = getAcademicSubjectById(subjectId);
  if (!major || !subject || !getAcademicMajor(academics.majorId)) return null;
  const points = academics.subjects.find(item => item.subjectId === subjectId)?.points ?? 0;
  const pending = subject.stageTargets.findIndex(target => points < target);
  const stageIndex = pending < 0 ? 3 : pending;
  const previousTarget = stageIndex > 0 ? subject.stageTargets[stageIndex - 1] : 0;
  const nextTarget = pending < 0 ? null : subject.stageTargets[pending];
  return {
    major, subject, points, isMajorSubject: major.id === academics.majorId, stageIndex,
    stageLabel: ['入门', '基础', '进阶', '阶段完成'][stageIndex],
    nextTarget, remaining: nextTarget === null ? 0 : nextTarget - points,
    percent: nextTarget === null ? 100 : Number(((points - previousTarget) / (nextTarget - previousTarget) * 100).toFixed(1)),
    goal: pending < 0 ? `继续巩固${subject.name}` : subject.stageGoals[pending],
    lastGain: academics.lastGain?.subjectId === subjectId ? { ...academics.lastGain } : null,
  };
}
export function getAcademicOverview(academics: AcademicState | null) {
  if (!academics) return null;
  const major = getAcademicMajor(academics.majorId);
  if (!major) return null;
  const subjects = academics.subjects.map(item => getAcademicProgress(academics, item.subjectId)!).filter(Boolean);
  return { major, subjects, totalPoints: subjects.reduce((sum, item) => sum + item.points * 2, 0) / 2,
    lastGain: academics.lastGain ? { ...academics.lastGain } : null };
}

export interface AcademicStudyOutcome {
  readonly id: Exclude<AcademicGain['outcome'], null>;
  readonly label: string;
  readonly probability: number;
  readonly pointsMultiplier: number;
  readonly extraEnergy: number;
  readonly morale: number;
  readonly stress: number;
}
export const crossMajorOutcomes: readonly AcademicStudyOutcome[] = Object.freeze([
  Object.freeze({ id: 'inspiration', label: '灵感', probability: .25, pointsMultiplier: 1.5, extraEnergy: 0, morale: 3, stress: -2 }),
  Object.freeze({ id: 'confusion', label: '困惑', probability: .25, pointsMultiplier: .5, extraEnergy: 3, morale: -4, stress: 5 }),
  Object.freeze({ id: 'normal', label: '普通', probability: .5, pointsMultiplier: 1, extraEnergy: 0, morale: 0, stress: 0 }),
]);
const normalOutcomes: readonly AcademicStudyOutcome[] = Object.freeze([
  Object.freeze({ id: 'normal', label: '正常学习', probability: 1, pointsMultiplier: 1, extraEnergy: 0, morale: 0, stress: 0 }),
]);
export interface AcademicStudyRequest { subjectId: string; optionId: string; interactionId?: string }
/** Read-only eligibility and worst-case cost; random draws belong only to committed actions. */
export function getAcademicStudyQuote(state: WorldState, request: AcademicStudyRequest) {
  const subject = getAcademicSubjectById(request.subjectId);
  const option = studyDurationOptions.find(item => item.id === request.optionId) ?? null;
  const isCrossMajor = !!(subject && state.academics && !getAcademicSubject(state.academics.majorId, subject.id));
  const outcomes = isCrossMajor ? crossMajorOutcomes : normalOutcomes;
  const maxEnergyCost = option ? getStudyEnergyCost(option.maxMinutes) + (isCrossMajor ? 3 : 0) : 0;
  let blockedReason: string | null = null;
  if (request.interactionId !== undefined) {
    const room = getCampusInterior(state.interior?.roomId);
    const interaction = room?.interactions.find(item => item.id === request.interactionId && isStudyInteraction(item.id));
    if (!state.interior || !room) blockedReason = '请先进入教室或图书馆自习室。';
    else if (!interaction) blockedReason = '这项学习不属于当前房间。';
    else if (!option) blockedReason = '请选择有效的学习时长。';
    else if (Math.hypot(state.interior.x - interaction.x, state.interior.z - interaction.z) > INTERIOR_INTERACTION_RANGE) blockedReason = '请先走到学习设施附近再学习。';
    else if (room.id === 'classroom' && isCrossMajor) blockedReason = '教室仅学习本专业课程；跨专业阅读请去图书馆或书店。';
  } else if (state.locationId !== 'bookshop' || state.interior) blockedReason = '请先到书店再选择阅读。';
  if (!blockedReason && request.interactionId === undefined) {
    const venue = getLocationStatus('bookshop', state.clock)!;
    if (!venue.isOpen) blockedReason = `${venue.label}已打烊，营业时间 ${venue.hoursLabel}。`;
    else if (option && venue.minutesUntilClose !== null && option.maxMinutes > venue.minutesUntilClose) {
      blockedReason = `距离书店关门还有 ${venue.minutesUntilClose} 分钟，无法完成此档最长 ${option.maxMinutes} 分钟的阅读，请选择更短时长。`;
    }
  }
  if (!blockedReason && !state.academics) blockedReason = '请先选择专业，再开始学习。';
  if (!blockedReason && !subject) blockedReason = '请选择有效的学科。';
  if (!blockedReason && !option) blockedReason = '请选择有效的学习时长。';
  if (!blockedReason && state.player.energy < maxEnergyCost) blockedReason = `精力不足，此档学习至少需要 ${maxEnergyCost} 点精力，请先休息。`;
  if (!blockedReason && option && state.clock.day * 1440 + state.clock.hour * 60 + state.clock.minute + option.maxMinutes > 365000 * 1440 + 1439) blockedReason = '已到达最大天数，此档学习无法完整结算。';
  const ownedPoints = state.academics?.subjects.find(item => item.subjectId === request.subjectId)?.points ?? 0;
  if (!blockedReason && option && (ownedPoints * 2 + option.maxMinutes * (isCrossMajor ? 3 : 2)) > MAX_ACADEMIC_POINTS * 2) blockedReason = '学习进度已到达存档上限，本次学习未结算。';
  return { subject, option, isCrossMajor, minMinutes: option?.minMinutes ?? 0,
    maxMinutes: option?.maxMinutes ?? 0, maxEnergyCost, outcomes, blockedReason };
}

/** A derived repeating week; it never changes the player's one-off schedule. Day 1 is Monday. */
export function getAcademicTimetable(academics: AcademicState | string | null) {
  const major = academics && getAcademicMajor(typeof academics === 'string' ? academics : academics.majorId);
  if (!major) return [];
  const slots = [
    { weekday: 1, start: '08:30', end: '10:00', subject: 0, locationId: 'classroom' },
    { weekday: 2, start: '10:30', end: '12:00', subject: 1, locationId: 'classroom' },
    { weekday: 3, start: '14:00', end: '15:30', subject: 2, locationId: 'classroom' },
    { weekday: 4, start: '08:30', end: '10:00', subject: 0, locationId: 'study-room' },
    { weekday: 5, start: '10:30', end: '12:00', subject: 1, locationId: 'study-room' },
    { weekday: 5, start: '14:00', end: '15:30', subject: 2, locationId: 'study-room' },
  ];
  return slots.map((slot, index) => ({ id: `${major.id}-weekly-${index + 1}`, weekday: slot.weekday,
    weekdayLabel: ['周一', '周二', '周三', '周四', '周五'][slot.weekday - 1], start: slot.start, end: slot.end,
    subjectId: major.subjects[slot.subject].id, subjectName: major.subjects[slot.subject].name,
    locationId: slot.locationId, locationName: getCampusInterior(slot.locationId)!.label }));
}
