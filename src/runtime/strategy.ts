/**
 * Deterministic offline focus-system foundation. No LLM calls, timers or UI side effects.
 * Four playable owners are bootstrapped today; other registered characters can be added
 * through a catalog without changing the condition/modifier/state machinery.
 */
import { NPC_CIRCLE_STATS, NPC_FOCUS_CATALOG } from './npc-focuses.ts';

export const MUTSUMI_OWNER_ID = 'bang-mutsumi' as const;
export const MUTSUMI_BOP_MIN = -100;
export const MUTSUMI_BOP_MAX = 100;
export const MUTSUMI_BOP_INITIAL = 15;
export const MUTSUMI_BOP_BASELINE = 10;

export function clampMutsumiBalance(value: number): number {
  return Math.max(MUTSUMI_BOP_MIN, Math.min(MUTSUMI_BOP_MAX, Math.round(value)));
}

export function mutsumiBalanceValue(strategy?: StrategyState | null): number {
  const raw = strategy?.people?.[MUTSUMI_OWNER_ID]?.balance;
  return typeof raw === 'number' && Number.isFinite(raw) ? clampMutsumiBalance(raw) : MUTSUMI_BOP_INITIAL;
}

export type StrategyOwner = 'soyo' | 'sakiko' | 'emma' | 'renako' | (string & {});
const DEFAULT_OWNERS = ['soyo', 'sakiko', 'emma', 'renako'] as const;
export const PLAYABLE_STRATEGY_OWNERS = DEFAULT_OWNERS;
export function isPlayableStrategyOwner(owner: StrategyOwner): owner is (typeof DEFAULT_OWNERS)[number] {
  return (DEFAULT_OWNERS as readonly string[]).includes(owner);
}
export type Condition =
  | { always: boolean }
  | { all: readonly Condition[] }
  | { any: readonly Condition[] }
  | { not: Condition }
  | { flag: string; equals?: boolean }
  | { stat: string; gte?: number; lte?: number }
  | { completed: string }
  | { hasSpirit: string }
  | { hasTrait: string }
  | { balance: { gte?: number; lte?: number } };
export type ModifierTarget =
  | 'focus_ai_weight'
  | 'focus_progress_rate'
  | 'social_xp_rate'
  | 'practice_skill_rate'
  | 'decision_energy_cost'
  | 'decision_stress_relief';
export interface StrategyModifier {
  target: ModifierTarget;
  operation: 'add' | 'multiply';
  amount: number;
  focusId?: string;
  when?: Condition;
}
export interface ExternalStrategyModifierSource {
  source: string;
  modifier: StrategyModifier;
}
export type ExternalStrategyModifiers = Partial<Record<StrategyOwner, readonly ExternalStrategyModifierSource[]>>;
export const MODIFIER_TARGET_LABELS: Readonly<Record<ModifierTarget, string>> = {
  focus_ai_weight: '国策倾向权重',
  focus_progress_rate: '国策推进效率',
  social_xp_rate: '社交经验获取',
  practice_skill_rate: '练琴熟练获取',
  decision_energy_cost: '行动精力消耗',
  decision_stress_relief: '行动减压效果',
};
export function formatStrategyModifier(item: StrategyModifier): string {
  const value = item.operation === 'multiply' ? `× ${item.amount}` : `${item.amount >= 0 ? '+' : ''}${item.amount}`;
  return `${MODIFIER_TARGET_LABELS[item.target]} ${value}`;
}
export interface SpiritDefinition { id: string; title: string; modifiers: readonly StrategyModifier[]; activeWhen?: Condition }
export interface TraitDefinition { id: string; title: string; modifiers: readonly StrategyModifier[] }
export type StrategyEffect =
  | { type: 'set_flag'; key: string; value: boolean }
  | { type: 'add_stat'; key: string; amount: number }
  | { type: 'add_spirit'; id: string; durationMinutes?: number }
  | { type: 'remove_spirit'; id: string }
  | { type: 'shift_balance'; delta: number };
export interface FocusAiModifier { when: Condition; add: number }
export interface FocusDefinition {
  id: string;
  owner: StrategyOwner;
  title: string;
  description?: string;
  durationMinutes: number;
  prerequisites?: Condition;
  available?: Condition;
  cancel?: Condition;
  bypass?: Condition;
  aiWeight: number;
  /** Completion offers a one-shot, non-random Otherside scene if the owner is offscreen. */
  important?: boolean;
  /** Completing any focus in a branch permanently locks the alternatives. */
  branchGroup?: string;
  aiModifiers?: readonly FocusAiModifier[];
  onComplete?: readonly StrategyEffect[];
}
export interface DecisionDefinition {
  category?: string;
  summary?: string;
  energyCost?: number;
  instrumentDelta?: number;
  moraleDelta?: number;
  stressDelta?: number;
  id: string;
  owner: StrategyOwner;
  title: string;
  available: Condition;
  cooldownMinutes?: number;
  effects: readonly StrategyEffect[];
}
export interface FocusRun { id: string; startedAt: number; progress: number }
export interface SpiritInstance { id: string; grantedAt: number; expiresAt: number | null }
export interface StrategyPerson {
  controller: 'manual' | 'auto';
  includeInPrompt: boolean;
  active: FocusRun | null;
  completed: string[];
  traits: string[];
  spirits: SpiritInstance[];
  decisionUsedAt: Record<string, number>;
  /** Mutsumi-exclusive psychological balance [-100 Self .. +100 Mortis]. */
  balance?: number;
}
export interface StrategyHistory {
  id: string;
  at: number;
  owner: StrategyOwner;
  kind: 'start' | 'complete' | 'cancel' | 'bypass' | 'decision' | 'spirit_expired' | 'narrative' | 'major_event' | 'balance';
  subject: string;
  note?: string;
}
export interface StrategyMajor { id: string; owner: StrategyOwner; focusId: string; at: number }
export interface StrategyState {
  version: 1;
  cursor: number;
  flags: Record<string, boolean>;
  stats: Record<string, number>;
  people: Record<StrategyOwner, StrategyPerson>;
  receipts: { id: string; command: string }[];
  history: StrategyHistory[];
  /** Omitted by v1 saves written before focus milestone scenes existed. */
  majorQueue?: StrategyMajor[];
}
export type StrategyCommand =
  | { type: 'set_control'; owner: StrategyOwner; controller: 'manual' | 'auto'; includeInPrompt: boolean }
  | { type: 'start_focus'; owner: StrategyOwner; focusId: string }
  | { type: 'cancel_focus'; owner: StrategyOwner }
  | { type: 'choose_decision'; owner: StrategyOwner; decisionId: string };

/** Registered world facts, not arbitrary paths into the save file. */
export const STRATEGY_FLAGS = [
  'sakiko_final_break', 'crychic_reunited', 'soyo_looked_back', 'soyo_rebuild_plan_ready',
  'sakiko_band_plan_ready', 'emma_circle_plan_ready', 'renako_circle_plan_ready', 'soyo_mygo_plan_ready',
] as const;
export const STRATEGY_STATS = [
  'soyo_resolve',
  'sakiko_resolve',
  'emma_trust',
  'renako_confidence',
  ...NPC_CIRCLE_STATS,
] as const;

/** Focuses advance personal plans. Other characters make their own choices. */
export const FOCUS_CATALOG: readonly FocusDefinition[] = [
  { id: 'soyo_face_past', owner: 'soyo', title: '面对过去', durationMinutes: 1440, aiWeight: 60,
    onComplete: [{ type: 'set_flag', key: 'soyo_looked_back', value: true }] },
  { id: 'soyo_rebuild_crychic', owner: 'soyo', title: '延续 CRYCHIC', description: '完成后退出 MyGO!!!!!，尝试延续 CRYCHIC。昔日成员是否愿意重聚，仍需各自决定。', durationMinutes: 4320, important: true, branchGroup: 'soyo_band_future',
    prerequisites: { completed: 'soyo_face_past' }, available: { always: true },
    bypass: { flag: 'crychic_reunited' }, aiWeight: 100,
    aiModifiers: [{ when: { flag: 'sakiko_final_break' }, add: -10000 }],
    onComplete: [{ type: 'set_flag', key: 'soyo_rebuild_plan_ready', value: true }] },
  { id: 'soyo_mygo_future', owner: 'soyo', title: '与 MyGO!!!!! 继续前行', description: '以贝斯手的身份留在 MyGO!!!!!，与爱音和同伴们继续向前。', durationMinutes: 4320, important: true, branchGroup: 'soyo_band_future',
    prerequisites: { completed: 'soyo_face_past' }, aiWeight: 90,
    // The existing membership continues; this does not create another band.
    onComplete: [{ type: 'set_flag', key: 'soyo_mygo_plan_ready', value: true }] },
  { id: 'soyo_crychic_score', owner: 'soyo', title: '翻开旧日乐谱', description: '重读 CRYCHIC 的旧谱，分清哪些乐句值得留到下一次排练。',
    durationMinutes: 1440, aiWeight: 90, prerequisites: { completed: 'soyo_rebuild_crychic' },
    onComplete: [{ type: 'add_stat', key: 'soyo_resolve', amount: 4 }] },
  { id: 'soyo_crychic_invitation', owner: 'soyo', title: '把邀约写在纸上', description: '写好一份排练邀约，给昔日队友留出各自回答的空间。',
    durationMinutes: 2880, aiWeight: 85, important: true, prerequisites: { completed: 'soyo_crychic_score' },
    onComplete: [{ type: 'add_stat', key: 'soyo_resolve', amount: 6 }] },
  { id: 'soyo_mygo_bass', owner: 'soyo', title: '重写贝斯声部', description: '在现有曲目的空拍里试几种新的低音走法，留待与队友合奏时比较。',
    durationMinutes: 1440, aiWeight: 90, prerequisites: { completed: 'soyo_mygo_future' },
    onComplete: [{ type: 'add_stat', key: 'soyo_resolve', amount: 4 }] },
  { id: 'soyo_mygo_rehearsal', owner: 'soyo', title: '写下下一次合奏', description: '为 MyGO!!!!! 准备下一轮排练提案，把想和大家一起试的段落标出来。',
    durationMinutes: 2880, aiWeight: 85, important: true, prerequisites: { completed: 'soyo_mygo_bass' },
    onComplete: [{ type: 'add_stat', key: 'soyo_resolve', amount: 6 }] },
  { id: 'sakiko_redefine_band', owner: 'sakiko', title: '引领 Ave Mujica', description: '作为 Ave Mujica 的 Leader 与键盘手，与现有成员共同确立接下来的方向。', durationMinutes: 2880, aiWeight: 100, important: true,
    onComplete: [{ type: 'set_flag', key: 'sakiko_band_plan_ready', value: true }] },
  { id: 'sakiko_write_overture', owner: 'sakiko', title: '从序曲写起', description: '先定下新曲的主旋律，再把舞台上需要的留白写进编曲。',
    durationMinutes: 1440, aiWeight: 95, branchGroup: 'sakiko_mujica_direction', prerequisites: { completed: 'sakiko_redefine_band' },
    onComplete: [{ type: 'add_stat', key: 'sakiko_resolve', amount: 5 }] },
  { id: 'sakiko_stage_draft', owner: 'sakiko', title: '拟定新章的舞台', description: '把编曲、灯光和转场写成一份可以带去商量的舞台草案。',
    durationMinutes: 2880, aiWeight: 85, important: true, prerequisites: { completed: 'sakiko_write_overture' },
    onComplete: [{ type: 'add_stat', key: 'sakiko_resolve', amount: 6 }] },
  { id: 'sakiko_leave_room', owner: 'sakiko', title: '给队友留出声音', description: '先记下想请队友各自谈谈的问题，把暂时拿不定主意的部分留到排练时讨论。',
    durationMinutes: 1440, aiWeight: 85, branchGroup: 'sakiko_mujica_direction', prerequisites: { completed: 'sakiko_redefine_band' },
    onComplete: [{ type: 'add_stat', key: 'sakiko_resolve', amount: 4 }] },
  { id: 'sakiko_rehearsal_draft', owner: 'sakiko', title: '为合奏留下试音时间', description: '把不同的编曲方向列进排练提案，准备在合奏里逐一比较。',
    durationMinutes: 2880, aiWeight: 85, important: true, prerequisites: { completed: 'sakiko_leave_room' },
    onComplete: [{ type: 'add_stat', key: 'sakiko_resolve', amount: 7 }] },
  { id: 'emma_daily_circle', owner: 'emma', title: '维系大家的日常', durationMinutes: 2880, aiWeight: 100,
    onComplete: [{ type: 'set_flag', key: 'emma_circle_plan_ready', value: true }] },
  { id: 'emma_small_tea_table', owner: 'emma', title: '准备一张茶桌', description: '写下几样好分给大家的茶点，想想谁也许愿意过来坐一会儿。',
    durationMinutes: 1440, aiWeight: 95, branchGroup: 'emma_daily_direction', prerequisites: { completed: 'emma_daily_circle' },
    onComplete: [{ type: 'add_stat', key: 'emma_trust', amount: 5 }] },
  { id: 'emma_tea_invitation', owner: 'emma', title: '留一个空座位', description: '备好一份可以随时婉拒的茶会邀约，让想来的人自己选时间。',
    durationMinutes: 2880, aiWeight: 85, important: true, prerequisites: { completed: 'emma_small_tea_table' },
    onComplete: [{ type: 'add_stat', key: 'emma_trust', amount: 6 }] },
  { id: 'emma_check_in_notes', owner: 'emma', title: '把近况记在本子上', description: '回顾最近亲耳听到的烦恼，记下还有哪些事情该亲自问一声。',
    durationMinutes: 1440, aiWeight: 85, branchGroup: 'emma_daily_direction', prerequisites: { completed: 'emma_daily_circle' },
    onComplete: [{ type: 'add_stat', key: 'emma_trust', amount: 4 }] },
  { id: 'emma_time_to_listen', owner: 'emma', title: '留出倾听的时间', description: '在自己的日程里留些空白，等朋友愿意开口时再好好听完。',
    durationMinutes: 2880, aiWeight: 85, important: true, prerequisites: { completed: 'emma_check_in_notes' },
    onComplete: [{ type: 'add_stat', key: 'emma_trust', amount: 7 }] },
  { id: 'renako_small_circle', owner: 'renako', title: '组建小小的社交圈', durationMinutes: 2880, aiWeight: 100,
    onComplete: [{ type: 'set_flag', key: 'renako_circle_plan_ready', value: true }] },
  { id: 'renako_one_invitation', owner: 'renako', title: '先约一个人', description: '想好一条可以亲口说出的邀约，从两个人都自在的安排开始。',
    durationMinutes: 1440, aiWeight: 95, branchGroup: 'renako_social_direction', prerequisites: { completed: 'renako_small_circle' },
    onComplete: [{ type: 'add_stat', key: 'renako_confidence', amount: 5 }] },
  { id: 'renako_own_pace', owner: 'renako', title: '说出自己的步调', description: '想好怎样告诉朋友什么时候想见面，什么时候需要一个人休息。',
    durationMinutes: 2880, aiWeight: 85, important: true, prerequisites: { completed: 'renako_one_invitation' },
    onComplete: [{ type: 'add_stat', key: 'renako_confidence', amount: 6 }] },
  { id: 'renako_group_idea', owner: 'renako', title: '准备一个共同话题', description: '从大家聊过的话题里挑一个自己也喜欢的，准备在下次相遇时主动提起。',
    durationMinutes: 1440, aiWeight: 85, branchGroup: 'renako_social_direction', prerequisites: { completed: 'renako_small_circle' },
    onComplete: [{ type: 'add_stat', key: 'renako_confidence', amount: 4 }] },
  { id: 'renako_group_plan', owner: 'renako', title: '为小聚写下提案', description: '拟一份几个人都能参与的小聚安排，等大家自己决定是否赴约。',
    durationMinutes: 2880, aiWeight: 85, important: true, prerequisites: { completed: 'renako_group_idea' },
    onComplete: [{ type: 'add_stat', key: 'renako_confidence', amount: 7 }] },
  ...NPC_FOCUS_CATALOG,
];
export const TRAIT_CATALOG: readonly TraitDefinition[] = [
  { id: 'soyo_crychic_obsession', title: 'CRYCHIC 的执念', modifiers: [
    { target: 'focus_ai_weight', operation: 'add', amount: 50, focusId: 'soyo_rebuild_crychic' },
  ] },
];
export const SPIRIT_CATALOG: readonly SpiritDefinition[] = [
  { id: 'fragile_resolve', title: '动摇的决心', modifiers: [
    { target: 'focus_progress_rate', operation: 'multiply', amount: 0.8 },
  ] },
];
export const DECISION_CATALOG: readonly DecisionDefinition[] = [
  { id: 'soyo_practice_bass', owner: 'soyo', title: '练习贝斯', category: '基础训练',
    summary: '在排练间隙独自反复校准贝斯指法与低音律动，让指尖记住每一处切分。',
    energyCost: 25, instrumentDelta: 4, moraleDelta: 2, stressDelta: -3,
    available: { always: true }, cooldownMinutes: 360,
    effects: [{ type: 'add_stat', key: 'soyo_resolve', amount: 3 }] },
  { id: 'soyo_brew_black_tea', owner: 'soyo', title: '冲泡红茶平复心绪', category: '身心调适',
    summary: '温热茶杯与熟悉的大吉岭茶香，把紧绷的呼吸一点点放缓。',
    energyCost: 15, moraleDelta: 6, stressDelta: -8,
    available: { always: true }, cooldownMinutes: 480,
    effects: [{ type: 'add_stat', key: 'soyo_resolve', amount: 2 }, { type: 'remove_spirit', id: 'fragile_resolve' }] },
  { id: 'soyo_check_band_schedule', owner: 'soyo', title: '确认成员日程与联系', category: '乐队统筹',
    summary: '梳理大家最近的空余时间与排练安排，提前留好沟通余地。',
    energyCost: 20, moraleDelta: 3, stressDelta: -2,
    available: { always: true }, cooldownMinutes: 720,
    effects: [{ type: 'add_stat', key: 'soyo_resolve', amount: 4 }] },
  { id: 'sakiko_practice_keyboard', owner: 'sakiko', title: '练习键盘与指法', category: '基础训练',
    summary: '独自在琴键上反复推敲乐句与指法力度，保持绝不妥协的演奏水准。',
    energyCost: 25, instrumentDelta: 4, moraleDelta: 3, stressDelta: -3,
    available: { always: true }, cooldownMinutes: 360,
    effects: [{ type: 'add_stat', key: 'sakiko_resolve', amount: 3 }] },
  { id: 'sakiko_draft_arrangement', owner: 'sakiko', title: '推敲新曲编曲分谱', category: '乐队统筹',
    summary: '在谱纸上细化各声部衔接与舞台戏剧张力，明确下一阶段曲风方向。',
    energyCost: 30, instrumentDelta: 3, moraleDelta: 4, stressDelta: -2,
    available: { always: true }, cooldownMinutes: 720,
    effects: [{ type: 'add_stat', key: 'sakiko_resolve', amount: 5 }] },
  { id: 'sakiko_evening_walk', owner: 'sakiko', title: '晚风独行整理思绪', category: '身心调适',
    summary: '在忙碌的课业与工作间隙独自步行片刻，让紧绷的思绪重新沉淀。',
    energyCost: 15, moraleDelta: 5, stressDelta: -7,
    available: { always: true }, cooldownMinutes: 480,
    effects: [{ type: 'add_stat', key: 'sakiko_resolve', amount: 2 }, { type: 'remove_spirit', id: 'fragile_resolve' }] },
  { id: 'emma_review_case_notes', owner: 'emma', title: '梳理案卷与日常备忘', category: '基础准备',
    summary: '把近期记下的委托细节与朋友们的近况逐条核对清楚。',
    energyCost: 25, moraleDelta: 4, stressDelta: -4,
    available: { always: true }, cooldownMinutes: 360,
    effects: [{ type: 'add_stat', key: 'emma_trust', amount: 4 }] },
  { id: 'emma_bake_tea_snacks', owner: 'emma', title: '准备分给大家的茶点', category: '人际关怀',
    summary: '留出一点精力烤制小点心，为下一次大家的聚会添一份安心感。',
    energyCost: 20, moraleDelta: 6, stressDelta: -6,
    available: { always: true }, cooldownMinutes: 480,
    effects: [{ type: 'add_stat', key: 'emma_trust', amount: 3 }] },
  { id: 'emma_quiet_reading', owner: 'emma', title: '午后静读舒缓心情', category: '身心调适',
    summary: '找一处安静角落读几页书，恢复平稳温和的步调。',
    energyCost: 15, moraleDelta: 5, stressDelta: -7,
    available: { always: true }, cooldownMinutes: 480,
    effects: [{ type: 'add_stat', key: 'emma_trust', amount: 2 }] },
  { id: 'renako_rehearse_chat', owner: 'renako', title: '预演明日聊天话题', category: '基础准备',
    summary: '在心里把可能聊到的话题过一遍，减少临场接话时的慌乱。',
    energyCost: 20, moraleDelta: 4, stressDelta: -5,
    available: { always: true }, cooldownMinutes: 360,
    effects: [{ type: 'add_stat', key: 'renako_confidence', amount: 3 }] },
  { id: 'renako_coordination_practice', owner: 'renako', title: '练习器乐与节拍配合', category: '基础训练',
    summary: '跟着节拍器练习基础指法与节奏稳定性，一点点积累自信。',
    energyCost: 25, instrumentDelta: 3, moraleDelta: 3, stressDelta: -3,
    available: { always: true }, cooldownMinutes: 360,
    effects: [{ type: 'add_stat', key: 'renako_confidence', amount: 4 }] },
  { id: 'renako_solo_breather', owner: 'renako', title: '独处充电平复紧绷', category: '身心调适',
    summary: '留给自己一段不用勉强寒暄的独处时间，让呼吸重新变得轻快。',
    energyCost: 15, moraleDelta: 6, stressDelta: -8,
    available: { always: true }, cooldownMinutes: 480,
    effects: [{ type: 'add_stat', key: 'renako_confidence', amount: 2 }] },
  { id: 'soyo_sort_memories', owner: 'soyo', title: '整理旧日回忆', category: '心境抉择',
    summary: '翻看旧乐谱与过往留下的排练记录，理清自己真正放不下的部分。',
    energyCost: 20, moraleDelta: 3, stressDelta: -4,
    available: { completed: 'soyo_face_past' }, cooldownMinutes: 1440,
    effects: [{ type: 'add_stat', key: 'soyo_resolve', amount: 5 }] },
];
export const STRATEGY_OWNERS: readonly StrategyOwner[] = Object.freeze([...new Set<StrategyOwner>([...DEFAULT_OWNERS, ...FOCUS_CATALOG.map(row => row.owner)])]);
const focusById = new Map(FOCUS_CATALOG.map(row => [row.id, row]));
const decisionById = new Map(DECISION_CATALOG.map(row => [row.id, row]));
const traitById = new Map(TRAIT_CATALOG.map(row => [row.id, row]));
const spiritById = new Map(SPIRIT_CATALOG.map(row => [row.id, row]));
const permittedFlags = new Set<string>(STRATEGY_FLAGS);
const permittedStats = new Set<string>(STRATEGY_STATS);
/** Bounded namespaced facts let story authors invent minor personal developments. */
export const strategyLocalKey = (key: string, owner?: StrategyOwner): boolean =>
  /^focus:(soyo|sakiko|emma|renako):[a-z][a-z0-9_]{0,31}$/.test(key) &&
  (!owner || key.startsWith(`focus:${owner}:`));
const MAX_DYNAMIC_KEYS = 32;
const MAX_MINUTE = 525599999;
const HISTORY_LIMIT = 600;
const RECEIPT_LIMIT = 160;
function fail(message: string): never { throw new Error(`国策状态无效：${message}`); }
const record = (value: unknown, keys: readonly string[], label: string): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail(label);
  const row = value as Record<string, unknown>;
  if (Object.keys(row).some(key => !keys.includes(key)) || keys.some(key => !Object.hasOwn(row, key))) return fail(`${label} 字段`);
  return row;
};
const boundedInt = (value: unknown, min: number, max: number, label: string): number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max ? value : fail(label);
const identifier = (value: unknown, label: string): string =>
  typeof value === 'string' && /^[a-z][a-z0-9_:-]{0,79}$/.test(value) ? value : fail(label);
const unique = (items: string[], label: string) => {
  if (new Set(items).size !== items.length) fail(`${label} 重复`);
  return items;
};
function personDefault(owner: StrategyOwner, controller: 'manual' | 'auto' = 'manual'): StrategyPerson {
  return { controller, includeInPrompt: false, active: null, completed: [],
    traits: owner === 'soyo' ? ['soyo_crychic_obsession'] : [], spirits: [], decisionUsedAt: {} };
}
export function createStrategyState(at: number): StrategyState {
  boundedInt(at, 0, MAX_MINUTE, '初始化时间');
  return { version: 1, cursor: at, flags: {}, stats: {},
    people: Object.fromEntries(STRATEGY_OWNERS.map(owner => [owner, personDefault(owner)])) as Record<StrategyOwner, StrategyPerson>,
    receipts: [], history: [], majorQueue: [] };
}

/** Game runtime initializer: protagonists start under manual control, preset NPCs advance autonomously. */
export function createGameStrategyState(at: number): StrategyState {
  const base = createStrategyState(at);
  for (const owner of STRATEGY_OWNERS) {
    if (!isPlayableStrategyOwner(owner)) base.people[owner].controller = 'auto';
  }
  base.people[MUTSUMI_OWNER_ID].balance = MUTSUMI_BOP_INITIAL;
  return base;
}

/** Reject malformed or forged fields before they enter the authoritative save. */
export function parseStrategyState(raw: unknown, at: number): StrategyState {
  const withQueue = !!raw && typeof raw === 'object' && Object.hasOwn(raw, 'majorQueue');
  const s = record(raw, ['version','cursor','flags','stats','people','receipts','history', ...(withQueue ? ['majorQueue'] : [])], '根');
  if (s.version !== 1) fail('版本');
  const cursor = boundedInt(s.cursor, 0, at, '时钟');
  const flagsRaw = s.flags && typeof s.flags === 'object' && !Array.isArray(s.flags) ? s.flags as Record<string, unknown> : fail('标志');
  if (Object.keys(flagsRaw).length > STRATEGY_FLAGS.length + MAX_DYNAMIC_KEYS) fail('标志数量');
  if (Object.keys(flagsRaw).filter(key=>strategyLocalKey(key)).length > MAX_DYNAMIC_KEYS) fail('动态标志数量');
  const flags: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(flagsRaw)) {
    if (!(permittedFlags.has(key) || strategyLocalKey(key)) || typeof value !== 'boolean') fail('标志字段');
    flags[key] = value;
  }
  const statsRaw = s.stats && typeof s.stats === 'object' && !Array.isArray(s.stats) ? s.stats as Record<string, unknown> : fail('变量');
  if (Object.keys(statsRaw).length > STRATEGY_STATS.length + MAX_DYNAMIC_KEYS) fail('变量数量');
  if (Object.keys(statsRaw).filter(key=>strategyLocalKey(key)).length > MAX_DYNAMIC_KEYS) fail('动态变量数量');
  const stats: Record<string, number> = {};
  for (const [key, value] of Object.entries(statsRaw)) {
    if (!(permittedStats.has(key) || strategyLocalKey(key))) fail('变量名');
    stats[key] = boundedInt(value, -10000, 10000, `变量 ${key}`);
  }
  const rawPeopleObj = s.people && typeof s.people === 'object' && !Array.isArray(s.people)
    ? s.people as Record<string, unknown> : fail('人物');
  if (Object.keys(rawPeopleObj).some(key => !STRATEGY_OWNERS.includes(key))
    || DEFAULT_OWNERS.some(key => !Object.hasOwn(rawPeopleObj, key))) fail('人物 字段');
  const people = {} as Record<StrategyOwner, StrategyPerson>;
  for (const owner of STRATEGY_OWNERS) {
    if (!Object.hasOwn(rawPeopleObj, owner)) {
      people[owner] = personDefault(owner, 'auto');
      if (owner === MUTSUMI_OWNER_ID) people[owner].balance = MUTSUMI_BOP_INITIAL;
      continue;
    }
    const rawPerson = rawPeopleObj[owner];
    const hasBalance = owner === MUTSUMI_OWNER_ID && !!rawPerson && typeof rawPerson === 'object' && Object.hasOwn(rawPerson, 'balance');
    const p = record(rawPerson, ['controller','includeInPrompt','active','completed','traits','spirits','decisionUsedAt', ...(hasBalance ? ['balance'] : [])], `人物 ${owner}`);
    if (p.controller !== 'manual' && p.controller !== 'auto') fail('托管模式');
    if (typeof p.includeInPrompt !== 'boolean') fail('模型开关');
    const completed = Array.isArray(p.completed) && p.completed.length <= 100
      ? unique(p.completed.map(id => { const v=identifier(id,'已完成国策'); if (focusById.get(v)?.owner!==owner) fail('已完成国策归属'); return v; }), '国策') : fail('已完成国策');
    const traits = Array.isArray(p.traits) && p.traits.length <= 32
      ? unique(p.traits.map(id => { const v=identifier(id,'特质'); if (!traitById.has(v)) fail('未知特质'); return v; }), '特质') : fail('人物特质');
    if (!Array.isArray(p.spirits) || p.spirits.length > 32) fail('精神');
    const spirits = p.spirits.map(rawSpirit => {
      const spirit = record(rawSpirit, ['id','grantedAt','expiresAt'], '精神条目');
      const id = identifier(spirit.id, '精神 ID'); if (!spiritById.has(id)) fail('精神不存在');
      const grantedAt = boundedInt(spirit.grantedAt, 0, cursor, '获得时间');
      const expiresAt = spirit.expiresAt === null ? null : boundedInt(spirit.expiresAt, grantedAt + 1, MAX_MINUTE, '失效时间');
      return { id, grantedAt, expiresAt };
    });
    unique(spirits.map(row => row.id), '民族精神');
    const decisionUsedRaw = p.decisionUsedAt && typeof p.decisionUsedAt === 'object' && !Array.isArray(p.decisionUsedAt)
      ? p.decisionUsedAt as Record<string, unknown> : fail('决议记录');
    if (Object.keys(decisionUsedRaw).length > 100) fail('决议数量');
    const decisionUsedAt: Record<string, number> = {};
    for (const [id,value] of Object.entries(decisionUsedRaw)) {
      if (decisionById.get(id)?.owner !== owner) fail('决议归属');
      decisionUsedAt[id] = boundedInt(value, 0, cursor, '决议时间');
    }
    let active: FocusRun | null = null;
    if (p.active !== null) {
      const focus = record(p.active, ['id','startedAt','progress'], '进行中的国策');
      const id = identifier(focus.id,'进行中的国策 ID'), definition=focusById.get(id);
      if (!definition || definition.owner !== owner || completed.includes(id)) fail('进行中国策归属');
      const startedAt = boundedInt(focus.startedAt, 0, cursor, '国策启动时间');
      const progress = focus.progress;
      if (typeof progress !== 'number' || !Number.isFinite(progress) || progress < 0 || progress >= definition.durationMinutes || Math.abs(Math.round(progress*100) - progress*100) > 1e-7) fail('国策进度');
      active = { id, startedAt, progress };
    }
    const balance = hasBalance ? boundedInt(p.balance, MUTSUMI_BOP_MIN, MUTSUMI_BOP_MAX, '心境天平') : undefined;
    people[owner] = { controller: p.controller, includeInPrompt: p.includeInPrompt, active, completed, traits, spirits, decisionUsedAt,
      ...(balance !== undefined ? { balance } : {}) };
  }
  if (!Array.isArray(s.receipts) || s.receipts.length > RECEIPT_LIMIT) fail('操作记录');
  const receipts = s.receipts.map(rawReceipt => {
    const receipt = record(rawReceipt, ['id','command'], '操作回执');
    const id = identifier(receipt.id,'请求 ID');
    if (typeof receipt.command !== 'string' || receipt.command.length > 500) fail('请求内容');
    return { id, command: receipt.command };
  });
  unique(receipts.map(row => row.id), '请求回执');
  if (!Array.isArray(s.history) || s.history.length > HISTORY_LIMIT) fail('历史');
  const kinds = new Set(['start','complete','cancel','bypass','decision','spirit_expired','narrative','major_event','balance']);
  const history: StrategyHistory[] = s.history.map(rawHistory => {
    const hasNote = !!rawHistory && typeof rawHistory === 'object' && Object.hasOwn(rawHistory,'note');
    const row = record(rawHistory,['id','at','owner','kind','subject',...(hasNote?['note']:[])],'历史条目');
    const id=identifier(row.id,'历史 ID'), subject=identifier(row.subject,'历史对象');
    const owner = row.owner;
    if (!STRATEGY_OWNERS.some(value=>value===owner) || !kinds.has(String(row.kind))) fail('历史身份');
    if (hasNote && (typeof row.note !== 'string' || !row.note.trim() || row.note.length > 180)) fail('历史注记');
    return { id, at: boundedInt(row.at,0,cursor,'历史时间'), owner: owner as StrategyOwner, kind: row.kind as StrategyHistory['kind'], subject, ...(hasNote?{ note: row.note as string }: {}) };
  });
  unique(history.map(row => row.id), '历史事件');
  const majorQueue: StrategyMajor[] = withQueue && Array.isArray(s.majorQueue) && s.majorQueue.length <= 16
    ? s.majorQueue.map(rawItem => {
      const row = record(rawItem,['id','owner','focusId','at'],'重大事件排队');
      const owner = identifier(row.owner,'重大事件归属'), focusId=identifier(row.focusId,'重大事件国策');
      if (!STRATEGY_OWNERS.includes(owner) || !focusById.get(focusId)?.important || focusById.get(focusId)?.owner!==owner
        || !people[owner]?.completed.includes(focusId)) fail('重大事件需要已经完成的重要国策');
      return {id:identifier(row.id,'重大事件 ID'),owner,focusId,at:boundedInt(row.at,0,cursor,'重大事件时间')};
    }) : withQueue ? fail('重大事件队列') : [];
  unique(majorQueue.map(row=>row.id),'重大事件队列');
  return { version:1, cursor, flags, stats, people, receipts, history, majorQueue }; 
}

export interface ConditionContext {
  state: StrategyState;
  owner: StrategyOwner;
  at?: number;
  externalModifiers?: readonly ExternalStrategyModifierSource[];
}
export function checkCondition(condition: Condition, context: ConditionContext, depth=0): boolean {
  if (depth > 16) return false;
  if ('always' in condition) return condition.always;
  if ('all' in condition) return condition.all.every(c => checkCondition(c,context,depth+1));
  if ('any' in condition) return condition.any.some(c => checkCondition(c,context,depth+1));
  if ('not' in condition) return !checkCondition(condition.not,context,depth+1);
  if ('flag' in condition) return (context.state.flags[condition.flag] ?? false) === (condition.equals ?? true);
  if ('stat' in condition) {
    const value=context.state.stats[condition.stat] ?? 0;
    return (condition.gte===undefined || value>=condition.gte) && (condition.lte===undefined || value<=condition.lte);
  }
  if ('completed' in condition) return context.state.people[context.owner].completed.includes(condition.completed);
  if ('hasSpirit' in condition) return context.state.people[context.owner].spirits.some(x=>x.id===condition.hasSpirit && (x.expiresAt===null || x.expiresAt>(context.at??context.state.cursor)));
  if ('hasTrait' in condition) return context.state.people[context.owner].traits.includes(condition.hasTrait);
  const balance = mutsumiBalanceValue(context.state);
  return (condition.balance.gte === undefined || balance >= condition.balance.gte)
    && (condition.balance.lte === undefined || balance <= condition.balance.lte);
}
export interface ModifierBreakdown { source: string; operation: 'add'|'multiply'; amount: number }
export function calculateModifier(context: ConditionContext, target: ModifierTarget, initial: number, focusId?: string): { value: number; breakdown: ModifierBreakdown[] } {
  const person=context.state.people[context.owner];
  const sources = [
    ...person.traits.flatMap(id => traitById.get(id)?.modifiers.map(modifier=>({source:`trait:${id}`,modifier}))??[]),
    ...person.spirits.flatMap(item => {
      const spirit=spiritById.get(item.id);
      if (!spirit || (item.expiresAt!==null && item.expiresAt<=(context.at??context.state.cursor)) ||
          (spirit.activeWhen && !checkCondition(spirit.activeWhen,context))) return [];
      return spirit.modifiers.map(modifier=>({source:`spirit:${item.id}`,modifier}));
    }),
    ...(context.externalModifiers ?? []),
  ];
  let adds=0, multiplier=1; const breakdown: ModifierBreakdown[]=[];
  for (const {source,modifier} of sources) {
    if (modifier.target!==target || (modifier.focusId && modifier.focusId!==focusId) ||
      (modifier.when && !checkCondition(modifier.when,context))) continue;
    breakdown.push({source,operation:modifier.operation,amount:modifier.amount});
    if (modifier.operation==='add') adds+=modifier.amount; else multiplier*=modifier.amount;
  }
  return { value: Math.max(0,Math.round((initial+adds)*multiplier*100)/100), breakdown };
}
export function focusWeight(
  state: StrategyState,
  owner: StrategyOwner,
  focus: FocusDefinition,
  externalModifiers?: readonly ExternalStrategyModifierSource[],
): { value: number; breakdown: ModifierBreakdown[] } {
  const context = { state, owner, at: state.cursor, ...(externalModifiers?.length ? { externalModifiers } : {}) };
  const score = calculateModifier(context, 'focus_ai_weight', focus.aiWeight, focus.id);
  let value = score.value;
  for (const modifier of focus.aiModifiers ?? []) if (checkCondition(modifier.when, context)) {
    value += modifier.add; score.breakdown.push({ source: `focus:${focus.id}`, operation: 'add', amount: modifier.add });
  }
  return { value: Math.round(value * 100) / 100, breakdown: score.breakdown };
}
/** A completed alternative locks its sibling and the sibling's dependent route. */
export function focusBranchLocked(state: StrategyState,owner: StrategyOwner, focus: FocusDefinition): boolean {
  const completed = state.people[owner].completed;
  const seen = new Set<string>();
  let current: FocusDefinition | undefined = focus;
  while (current?.owner === owner && !completed.includes(current.id) && !seen.has(current.id)) {
    seen.add(current.id);
    const { id, branchGroup, prerequisites }: FocusDefinition = current;
    if (branchGroup && FOCUS_CATALOG.some(other => other.owner === owner && other.id !== id &&
      other.branchGroup === branchGroup && completed.includes(other.id))) return true;
    current = prerequisites && 'completed' in prerequisites ? focusById.get(prerequisites.completed) : undefined;
  }
  return false;
}
export function canStartFocus(state: StrategyState,owner: StrategyOwner, focus: FocusDefinition): boolean {
  const p=state.people[owner],ctx={state,owner};
  return focus.owner===owner && !p.completed.includes(focus.id) && !focusBranchLocked(state,owner,focus) &&
    (!focus.prerequisites || checkCondition(focus.prerequisites,ctx)) &&
    (!focus.available || checkCondition(focus.available,ctx)) &&
    (!focus.cancel || !checkCondition(focus.cancel,ctx)) &&
    (!focus.bypass || !checkCondition(focus.bypass,ctx));
}
function pushHistory(state: StrategyState, owner: StrategyOwner, kind: StrategyHistory['kind'],subject:string,at=state.cursor) {
  const id=`focus:${owner}:${at}:${kind}:${subject}`;
  if (state.history.some(e=>e.id===id)) return;
  state.history.push({id,at,owner,kind,subject});
  state.history=state.history.slice(-HISTORY_LIMIT);
}
function applyEffects(state: StrategyState,owner:StrategyOwner,effects:readonly StrategyEffect[],at:number) {
  const p=state.people[owner];
  for (const effect of effects) {
    if (effect.type==='set_flag') {
      if (!permittedFlags.has(effect.key)) fail(`未注册的标志 ${effect.key}`);
      state.flags[effect.key]=effect.value;
    } else if (effect.type==='add_stat') {
      if (!permittedStats.has(effect.key) || !Number.isSafeInteger(effect.amount) || Math.abs(effect.amount)>1000) fail('变量更改无效');
      state.stats[effect.key]=Math.max(-10000,Math.min(10000,(state.stats[effect.key]??0)+effect.amount));
    } else if (effect.type==='add_spirit') {
      if (!spiritById.has(effect.id)) fail('民族精神未注册');
      if (effect.durationMinutes!==undefined && (!Number.isSafeInteger(effect.durationMinutes)||effect.durationMinutes<1||at+effect.durationMinutes>MAX_MINUTE)) fail('民族精神时限');
      const instance:SpiritInstance={id:effect.id,grantedAt:at,expiresAt:effect.durationMinutes?at+effect.durationMinutes:null};
      p.spirits=[...p.spirits.filter(s=>s.id!==effect.id),instance];
    } else if (effect.type==='remove_spirit') p.spirits=p.spirits.filter(s=>s.id!==effect.id);
    else if (effect.type==='shift_balance') {
      if (owner!==MUTSUMI_OWNER_ID || !Number.isSafeInteger(effect.delta) || Math.abs(effect.delta)>100) fail('心境天平变化无效');
      p.balance=clampMutsumiBalance((p.balance??MUTSUMI_BOP_INITIAL)+effect.delta);
    }
  }
}
function finishFocus(state:StrategyState,owner:StrategyOwner,kind:'complete'|'bypass',at:number) {
  const p=state.people[owner],focus=p.active;
  if (!focus) return;
  const definition=focusById.get(focus.id)!;
  p.active=null;
  p.completed.push(focus.id);
  if (kind==='complete') {
    applyEffects(state,owner,definition.onComplete??[],at);
    if (definition.important) {
      const queue = state.majorQueue ??= [];
      const id = `major:${owner}:${at}:${focus.id}`;
      if (!queue.some(row=>row.id===id)) queue.push({id,owner,focusId:focus.id,at});
      if (queue.length > 16) queue.shift();
    }
  }
  pushHistory(state,owner,kind,focus.id,at);
}
export function applyStrategyCommand(state: StrategyState,command:StrategyCommand,requestId:string):StrategyState {
  const id=identifier(requestId,'请求 ID'), encoded=JSON.stringify(command);
  if (encoded.length>500 || !STRATEGY_OWNERS.includes(command.owner) || !isPlayableStrategyOwner(command.owner)) fail('命令参数');
  const schema: Record<StrategyCommand['type'], string[]> = {
    set_control: ['type','owner','controller','includeInPrompt'],
    start_focus: ['type','owner','focusId'],
    cancel_focus: ['type','owner'],
    choose_decision: ['type','owner','decisionId'],
  };
  if (!Object.hasOwn(schema, command.type)) fail('命令类型');
  record(command, schema[command.type], '命令');
  const old=state.receipts.find(row=>row.id===id);
  if (old) { if (old.command!==encoded) fail('重复请求内容不一致'); return state; }
  const next:StrategyState=structuredClone(state),p=next.people[command.owner],at=next.cursor;
  if (command.type==='set_control') {
    if (!['manual','auto'].includes(command.controller) || typeof command.includeInPrompt!=='boolean') fail('托管配置');
    p.controller=command.controller; p.includeInPrompt=command.includeInPrompt;
  } else if (command.type==='start_focus') {
    if (p.controller!=='manual' || p.active) fail('当前不能手动启动国策');
    const focus=focusById.get(command.focusId);
    if (!focus || !canStartFocus(next,command.owner,focus)) fail('国策条件未满足');
    p.active={id:focus.id,startedAt:at,progress:0};
    pushHistory(next,command.owner,'start',focus.id);
  } else if (command.type==='cancel_focus') {
    if (!p.active || p.controller!=='manual') fail('没有可取消的手动国策');
    const oldFocus=p.active.id; p.active=null;
    pushHistory(next,command.owner,'cancel',oldFocus);
  } else if (command.type==='choose_decision') {
    if (p.controller!=='manual') fail('当前由 AI 托管');
    const decision=decisionById.get(command.decisionId);
    if (!decision || decision.owner!==command.owner || !checkCondition(decision.available,{state:next,owner:command.owner})) fail('决议条件未满足');
    const last=p.decisionUsedAt[decision.id];
    if (last!==undefined && (!decision.cooldownMinutes || at-last<decision.cooldownMinutes)) fail('决议尚在冷却');
    applyEffects(next,command.owner,decision.effects,at);
    p.decisionUsedAt[decision.id]=at;
    pushHistory(next,command.owner,'decision',decision.id);
  } else fail('未知命令');
  next.receipts.push({id,command:encoded});next.receipts=next.receipts.slice(-RECEIPT_LIMIT);
  return next;
}

/** Event-boundary scheduler: all owners share one chronological clock. No model calls. */
export function settleStrategyState(input: StrategyState, end: number, externalModifiers?: ExternalStrategyModifiers): StrategyState {
  boundedInt(end, input.cursor, MAX_MINUTE, '结算时间');
  const state: StrategyState = structuredClone(input);
  const mutsumi = state.people[MUTSUMI_OWNER_ID];
  const maxDays = Math.ceil((end - input.cursor) / 1440) + 2;
  let at = state.cursor, iterations = 0;
  const limit = 16 + FOCUS_CATALOG.length * 4 + SPIRIT_CATALOG.length * STRATEGY_OWNERS.length + maxDays;
  while (at <= end) {
    if (++iterations > limit) fail('事件结算超过安全上限');
    state.cursor = at;
    // Expiry happens at the exact game minute, not after a long overnight step.
    for (const owner of STRATEGY_OWNERS) {
      const p = state.people[owner];
      for (const spirit of [...p.spirits]) if (spirit.expiresAt !== null && spirit.expiresAt <= at) {
        p.spirits = p.spirits.filter(x => x.id !== spirit.id);
        pushHistory(state, owner, 'spirit_expired', spirit.id, at);
      }
    }
    // Mutsumi's Balance of Power settles deterministically at each midnight boundary.
    if (typeof mutsumi?.balance === 'number' && at > input.cursor && at % 1440 === 0) {
      const current = mutsumi.balance;
      const activeId = mutsumi.active?.id;
      let shift = 0;
      if (state.flags.crychic_reunited && activeId !== 'mutsumi_mortis_rehearsal') {
        shift = -2;
      } else if (state.flags.sakiko_final_break || activeId === 'mutsumi_mortis_rehearsal') {
        shift = 2;
      } else if (activeId === 'mutsumi_say_one_honest_word') {
        shift = -1;
      } else if (current > MUTSUMI_BOP_BASELINE) {
        shift = -1;
      } else if (current < MUTSUMI_BOP_BASELINE) {
        shift = 1;
      }
      if (shift !== 0) mutsumi.balance = clampMutsumiBalance(current + shift);
    }
    // Resolve same-minute completion/cancellation dependencies before time advances.
    for (let attempt = 0; attempt < FOCUS_CATALOG.length + 2; attempt++) {
      let changed = false;
      for (const owner of STRATEGY_OWNERS) {
        const p = state.people[owner], context = { state, owner, at };
        if (p.active) {
          const def = focusById.get(p.active.id)!;
          if (def.cancel && checkCondition(def.cancel, context)) {
            const old = p.active.id; p.active = null;
            pushHistory(state, owner, 'cancel', old, at); changed = true;
          } else if (def.bypass && checkCondition(def.bypass, context)) {
            finishFocus(state, owner, 'bypass', at); changed = true;
          }
        }
        if (!p.active && p.controller === 'auto') {
          const chosen = FOCUS_CATALOG.filter(f => canStartFocus(state, owner, f))
            .map(f => ({ f, score: focusWeight(state, owner, f, externalModifiers?.[owner]).value }))
            .filter(x => x.score > 0).sort((a, b) => b.score - a.score || a.f.id.localeCompare(b.f.id))[0]?.f;
          if (chosen) {
            p.active = { id: chosen.id, startedAt: at, progress: 0 };
            pushHistory(state, owner, 'start', chosen.id, at); changed = true;
          }
        }
      }
      if (!changed) break;
    }
    if (at === end) break;
    let nextAt = end;
    if (typeof mutsumi?.balance === 'number') nextAt = Math.min(nextAt, Math.floor(at / 1440) * 1440 + 1440);
    const rates = new Map<StrategyOwner, number>();
    for (const owner of STRATEGY_OWNERS) {
      const p = state.people[owner];
      for (const spirit of p.spirits) if (spirit.expiresAt !== null && spirit.expiresAt > at)
        nextAt = Math.min(nextAt, spirit.expiresAt);
      if (!p.active) continue;
      const def = focusById.get(p.active.id)!;
      if (def.available && !checkCondition(def.available, { state, owner, at })) continue;
      const rate = calculateModifier(
        { state, owner, at, externalModifiers: externalModifiers?.[owner] },
        'focus_progress_rate',
        1,
        def.id,
      ).value;
      if (rate <= 0) continue;
      rates.set(owner, rate);
      nextAt = Math.min(nextAt, at + Math.max(1, Math.ceil((def.durationMinutes - p.active.progress - 1e-9) / rate)));
    }
    if (nextAt <= at) fail('事件时间没有推进');
    const delta = nextAt - at;
    for (const [owner, rate] of rates) {
      const focus = state.people[owner].active!;
      focus.progress = Math.round((focus.progress + delta * rate) * 100) / 100;
    }
    at = nextAt;
    state.cursor = at;
    for (const owner of STRATEGY_OWNERS) {
      const focus = state.people[owner].active;
      if (focus && focus.progress >= focusById.get(focus.id)!.durationMinutes)
        finishFocus(state, owner, 'complete', at);
    }
  }
  state.cursor = end;
  return state;
}

/** LLM may propose bounded progress, never mark a focus completed by writing save fields. */
export function adjustStrategyProgress(state: StrategyState, owner: StrategyOwner, focusId: string, delta: number): void {
  const run = state.people[owner]?.active;
  // Time advancement may have completed this focus before the response was committed.
  if (!run || run.id !== focusId) return;
  const def = focusById.get(focusId)!;
  run.progress = Math.max(0, Math.round((run.progress + delta) * 100) / 100);
  if (run.progress >= def.durationMinutes) finishFocus(state,owner,'complete',state.cursor);
}

/** Private all-knowing audit: this note must not appear in the active character's journal. */
export function appendStrategyNarrativeAudit(state: StrategyState, id: string, owner: StrategyOwner, subject: string, note: string, major=false): void {
  if (state.history.some(row => row.id===id)) return;
  state.history.push({id,at:state.cursor,owner,kind:major?'major_event':'narrative',subject,note});
  state.history=state.history.slice(-HISTORY_LIMIT);
}

/** Record a validated Mutsumi Balance of Power transition in the omniscient ledger. */
export function appendStrategyBalanceAudit(state: StrategyState, id: string, note: string): void {
  if (state.history.some(row => row.id === id)) return;
  state.history.push({ id, at: state.cursor, owner: MUTSUMI_OWNER_ID, kind: 'balance', subject: 'mutsumi_balance', note });
  state.history = state.history.slice(-HISTORY_LIMIT);
}

export function consumeStrategyMajor(state: StrategyState, id: string, owner: StrategyOwner): StrategyMajor {
  const queue = state.majorQueue ?? [];
  const event = queue.find(row=>row.id===id && row.owner===owner);
  if (!event) return fail('重大事件未被预先授权');
  state.majorQueue = queue.filter(row=>row!==event);
  return event;
}
