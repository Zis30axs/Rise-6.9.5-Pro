import type { WorldState } from '../frontend/types';
import { PROTAGONISTS, PROTAGONIST_PERSON_IDS, protagonistForPerson, type ProtagonistId } from './dual-protagonists';
import {
  AVE_MUJICA_GROUP_NAME,
  MAJO_GROUP_ID,
  MAJO_GROUP_NAME,
  MYGO_GROUP_NAME,
  WATANARE_GROUP_ID,
  WATANARE_GROUP_NAME,
  residentById,
  residentGroups,
} from './npc-cast';
import type { AdvisorSeat } from './society';
import {
  MUTSUMI_OWNER_ID,
  mutsumiBalanceValue,
  type ExternalStrategyModifiers,
  type StrategyModifier,
  type StrategyOwner,
  type StrategyState,
} from './strategy';

const MAX_MINUTE = 525599999;
const RECEIPT_LIMIT = 128;
const HISTORY_LIMIT = 200;

export type FactionTemplateId =
  | 'mygo'
  | 'ave_mujica'
  | 'majo_circle'
  | 'watanare_quintet'
  | 'generic_faction';

export type FactionKind = 'band' | 'core_circle' | 'circle' | 'union';

export interface FactionSpiritDefinition {
  id: string;
  title: string;
  summary: string;
  modifiers: readonly StrategyModifier[];
}

export type FactionCondition =
  | { always: boolean }
  | { all: readonly FactionCondition[] }
  | { any: readonly FactionCondition[] }
  | { completed: string }
  | { minMembers: number }
  | { hasMember: string }
  | { minAdvisors: number }
  | { hasAdvisorSeat: AdvisorSeat }
  | { strategyFlag: string }
  | { mutsumiBalance: { gte?: number; lte?: number } };

export interface FactionFocusDefinition {
  id: string;
  template: FactionTemplateId;
  tier: number;
  column: number;
  title: string;
  description: string;
  durationMinutes: number;
  aiWeight: number;
  branchGroup?: string;
  important?: boolean;
  prerequisites?: FactionCondition;
  available?: FactionCondition;
  cancel?: FactionCondition;
  bypass?: FactionCondition;
  grantsSpirits?: readonly string[];
  shiftMutsumiBalance?: number;
}

export interface FactionAdvisorSnapshot {
  seat: AdvisorSeat;
  personId: string;
  name: string;
}

export interface FactionProfile {
  id: string;
  template: FactionTemplateId;
  kind: FactionKind;
  title: string;
  subtitle: string;
  memberIds: readonly string[];
  advisors: readonly FactionAdvisorSnapshot[];
  controllableBy: readonly ProtagonistId[];
  defaultController: 'manual' | 'auto';
  bandId?: string;
}

export interface FactionFocusRun {
  id: string;
  startedAt: number;
  progress: number;
}

export interface FactionSpiritInstance {
  id: string;
  grantedAt: number;
}

export interface FactionEntryState {
  id: string;
  template: FactionTemplateId;
  controller: 'manual' | 'auto';
  includeInPrompt: boolean;
  active: FactionFocusRun | null;
  completed: string[];
  spirits: FactionSpiritInstance[];
}

export interface FactionFocusHistoryEntry {
  id: string;
  at: number;
  factionId: string;
  kind: 'start' | 'complete' | 'cancel' | 'bypass';
  subject: string;
  note?: string;
}

export interface FactionFocusWorldState {
  version: 1;
  cursor: number;
  factions: Record<string, FactionEntryState>;
  receipts: { id: string; command: string }[];
  history: FactionFocusHistoryEntry[];
}

export type FactionFocusCommand =
  | { type: 'set_faction_control'; factionId: string; controller: 'manual' | 'auto'; includeInPrompt: boolean }
  | { type: 'start_faction_focus'; factionId: string; focusId: string }
  | { type: 'cancel_faction_focus'; factionId: string };

export interface FactionRuntimeMeta {
  profile: FactionProfile;
  advisorTraitBonus: number;
  strategy?: StrategyState;
}

export interface FactionCompletedEvent {
  factionId: string;
  focusId: string;
  title: string;
  at: number;
  shiftMutsumiBalance?: number;
}

export interface FactionRateBreakdown {
  base: number;
  advisorCount: number;
  seatBonus: number;
  traitBonus: number;
  spiritBonus: number;
  totalRate: number;
}

export const FACTION_SPIRIT_CATALOG: readonly FactionSpiritDefinition[] = Object.freeze([
  {
    id: 'mygo_shared_harmony',
    title: '同频五人音色',
    summary: '先让每次合奏听得见彼此呼吸，全队乐器磨合与排解压力更顺畅。',
    modifiers: [
      { target: 'practice_skill_rate', operation: 'multiply', amount: 1.15 },
      { target: 'decision_stress_relief', operation: 'add', amount: 2 },
    ],
  },
  {
    id: 'mygo_bold_spotlight',
    title: '共赴聚光灯',
    summary: '由内阁事务协助接住外务，全员社交积累与计划推进更快一步。',
    modifiers: [
      { target: 'social_xp_rate', operation: 'multiply', amount: 1.2 },
      { target: 'focus_progress_rate', operation: 'add', amount: 0.1 },
    ],
  },
  {
    id: 'mygo_live_vow',
    title: '下个档期之约',
    summary: '五人确认了不半途退场的共同约定，排练熟练度与行动同步率提升。',
    modifiers: [
      { target: 'practice_skill_rate', operation: 'multiply', amount: 1.1 },
      { target: 'focus_progress_rate', operation: 'add', amount: 0.1 },
    ],
  },
  {
    id: 'mujica_iron_curtain',
    title: '绝对舞台假面',
    summary: '铁律排程让演出掌控与执行效率走高，但也让若叶睦收紧防卫心墙。',
    modifiers: [
      { target: 'practice_skill_rate', operation: 'multiply', amount: 1.2 },
      { target: 'decision_energy_cost', operation: 'add', amount: -2 },
      { target: 'focus_progress_rate', operation: 'add', amount: 0.1 },
    ],
  },
  {
    id: 'mujica_warm_harbor',
    title: '彼此托底的余地',
    summary: '队内不再让单人独扛重压，全员减压与诚实沟通更容易奏效。',
    modifiers: [
      { target: 'decision_stress_relief', operation: 'add', amount: 4 },
      { target: 'social_xp_rate', operation: 'multiply', amount: 1.15 },
    ],
  },
  {
    id: 'mujica_premier_edict',
    title: '剧场序幕共识',
    summary: '剧场编排趋于成熟，全体成员排练效率与行动体力统筹明显增强。',
    modifiers: [
      { target: 'practice_skill_rate', operation: 'multiply', amount: 1.1 },
      { target: 'decision_energy_cost', operation: 'add', amount: -1 },
    ],
  },
  {
    id: 'majo_tea_calm',
    title: '长桌余温',
    summary: '玛格咖啡馆那张常留长桌让彼此卸下疲惫，日常休整更有成效。',
    modifiers: [
      { target: 'decision_stress_relief', operation: 'add', amount: 3 },
      { target: 'decision_energy_cost', operation: 'add', amount: -2 },
    ],
  },
  {
    id: 'majo_mutual_aid',
    title: '故人守望网',
    summary: '律所、咖啡馆与直播间互相通气，社交响应与事务进度更加敏锐。',
    modifiers: [
      { target: 'social_xp_rate', operation: 'multiply', amount: 1.2 },
      { target: 'focus_progress_rate', operation: 'add', amount: 0.1 },
    ],
  },
  {
    id: 'majo_reunion_glow',
    title: '暖灯常聚约定',
    summary: '散落在城市各处的故人有了固定交汇时刻，人情纽带更加稳定。',
    modifiers: [
      { target: 'social_xp_rate', operation: 'multiply', amount: 1.1 },
      { target: 'decision_stress_relief', operation: 'add', amount: 2 },
    ],
  },
  {
    id: 'watanare_polished_grace',
    title: '精英沙龙步调',
    summary: '参照高标准相互切磋，社交表达经验与计划推进效率明显提高。',
    modifiers: [
      { target: 'social_xp_rate', operation: 'multiply', amount: 1.2 },
      { target: 'focus_progress_rate', operation: 'add', amount: 0.1 },
    ],
  },
  {
    id: 'watanare_shared_cheer',
    title: '放学后应援阵线',
    summary: '彼此留出喘息空间，轻松并肩的氛围持续缓解人际消耗。',
    modifiers: [
      { target: 'decision_stress_relief', operation: 'add', amount: 3 },
      { target: 'decision_energy_cost', operation: 'add', amount: -2 },
    ],
  },
  {
    id: 'watanare_holiday_bond',
    title: '假日五人纪念',
    summary: '五人的放学约定延续成共同期待，学习沟通与步调更加契合。',
    modifiers: [
      { target: 'social_xp_rate', operation: 'multiply', amount: 1.1 },
      { target: 'focus_progress_rate', operation: 'add', amount: 0.1 },
    ],
  },
  {
    id: 'generic_solidarity',
    title: '内部磨合默契',
    summary: '明确组内配合与心理节奏，日常训练手感与抗压能力同步提升。',
    modifiers: [
      { target: 'practice_skill_rate', operation: 'multiply', amount: 1.12 },
      { target: 'decision_stress_relief', operation: 'add', amount: 2 },
    ],
  },
  {
    id: 'generic_outreach',
    title: '街区外联网络',
    summary: '阵营对外联络日渐活跃，全员社交积累与联动推进速率显著改善。',
    modifiers: [
      { target: 'social_xp_rate', operation: 'multiply', amount: 1.18 },
      { target: 'focus_progress_rate', operation: 'add', amount: 0.08 },
    ],
  },
  {
    id: 'generic_charter_pulse',
    title: '共同行动纲领',
    summary: '成文共识凝聚成阵营底气，计划推演与精力调配愈发从容。',
    modifiers: [
      { target: 'focus_progress_rate', operation: 'add', amount: 0.1 },
      { target: 'decision_energy_cost', operation: 'add', amount: -1 },
    ],
  },
]);

export const FACTION_FOCUS_CATALOG: readonly FactionFocusDefinition[] = Object.freeze([
  // 1. MyGO!!!!! (established-mygo)
  {
    id: 'faction_mygo_practice_anchor',
    template: 'mygo',
    tier: 0,
    column: 1,
    title: '定下五人的合练节拍',
    description: '先不急着去想能走多远，把五个人都能站住脚的排练时段与选曲清单对齐。',
    durationMinutes: 2880,
    aiWeight: 90,
  },
  {
    id: 'faction_mygo_cabinet_sync',
    template: 'mygo',
    tier: 1,
    column: 1,
    title: '分工乐队与排练统筹',
    description: '对齐曲目编排、Live House 接洽与日常排练节奏，让五人的配合不再全靠临时喊话。',
    durationMinutes: 2880,
    aiWeight: 95,
    prerequisites: { completed: 'faction_mygo_practice_anchor' },
    available: { minMembers: 3 },
  },
  {
    id: 'faction_mygo_small_stage',
    template: 'mygo',
    tier: 2,
    column: 0,
    branchGroup: 'faction_mygo_direction',
    title: '守住五人的小小舞台',
    description: '把重点放在团内磨合与情绪共鸣，先让每次合奏都听得见彼此的呼吸。',
    durationMinutes: 4320,
    aiWeight: 88,
    prerequisites: { completed: 'faction_mygo_cabinet_sync' },
    available: { minMembers: 4 },
    grantsSpirits: ['mygo_shared_harmony'],
  },
  {
    id: 'faction_mygo_larger_venue',
    template: 'mygo',
    tier: 2,
    column: 2,
    branchGroup: 'faction_mygo_direction',
    title: '带着迷惘走向聚光灯',
    description: '集齐五人编制或事务顾问支撑推进联合演出，把尚未完美的声音带向更大场馆。',
    durationMinutes: 4320,
    aiWeight: 85,
    prerequisites: {
      all: [
        { completed: 'faction_mygo_cabinet_sync' },
        { any: [{ minMembers: 5 }, { hasAdvisorSeat: 'operations' }] },
      ],
    },
    available: { minMembers: 4 },
    grantsSpirits: ['mygo_bold_spotlight'],
  },
  {
    id: 'faction_mygo_live_pledge',
    template: 'mygo',
    tier: 3,
    column: 1,
    title: '向下一场演出共同宣誓',
    description: '五人编制齐整之后，为下一次 RiNG 登台定下不中途逃开的共同约定。',
    durationMinutes: 2880,
    aiWeight: 92,
    important: true,
    prerequisites: {
      all: [
        { any: [{ completed: 'faction_mygo_small_stage' }, { completed: 'faction_mygo_larger_venue' }] },
        { minMembers: 5 },
      ],
    },
    grantsSpirits: ['mygo_live_vow'],
  },

  // 2. Ave Mujica (established-ave-mujica)
  {
    id: 'faction_mujica_stage_protocol',
    template: 'ave_mujica',
    tier: 0,
    column: 1,
    title: '确立假面剧场演出纲领',
    description: '统一世界观、舞台调度与分工边界，把私下杂音关在戏剧幕布之外。',
    durationMinutes: 2880,
    aiWeight: 92,
  },
  {
    id: 'faction_mujica_cabinet_engine',
    template: 'ave_mujica',
    tier: 1,
    column: 1,
    title: '启动事务与宣发内阁',
    description: '任用至少 1 名阵营内阁顾问协助排程与联络，确保高密度演出线稳定推进。',
    durationMinutes: 2880,
    aiWeight: 95,
    prerequisites: { all: [{ completed: 'faction_mujica_stage_protocol' }, { minAdvisors: 1 }] },
    available: { minMembers: 3 },
  },
  {
    id: 'faction_mujica_perfect_mask',
    template: 'ave_mujica',
    tier: 2,
    column: 0,
    branchGroup: 'faction_mujica_doctrine',
    title: '贯彻铁律与绝对假面',
    description: '以毫不松懈的舞台张力要求全员到位；高压秩序下，若叶睦会本能收紧防卫假面。',
    durationMinutes: 4320,
    aiWeight: 86,
    prerequisites: { completed: 'faction_mujica_cabinet_engine' },
    shiftMutsumiBalance: 12,
    grantsSpirits: ['mujica_iron_curtain'],
  },
  {
    id: 'faction_mujica_mutual_shield',
    template: 'ave_mujica',
    tier: 2,
    column: 2,
    branchGroup: 'faction_mujica_doctrine',
    title: '留出彼此托底的余地',
    description: '不再把失误与重压推给个人硬扛，先在队内为若叶睦与队友留住真实的喘息空间。',
    durationMinutes: 4320,
    aiWeight: 88,
    prerequisites: { all: [{ completed: 'faction_mujica_cabinet_engine' }, { hasMember: 'bang-mutsumi' }] },
    shiftMutsumiBalance: -14,
    grantsSpirits: ['mujica_warm_harbor'],
  },
  {
    id: 'faction_mujica_premier_act',
    template: 'ave_mujica',
    tier: 3,
    column: 1,
    title: '筹备完整剧场章程公演',
    description: '五人齐聚一堂并稳住后勤支援，把 Ave Mujica 的下一幕完整推上聚光灯中心。',
    durationMinutes: 2880,
    aiWeight: 94,
    important: true,
    prerequisites: {
      all: [
        { any: [{ completed: 'faction_mujica_perfect_mask' }, { completed: 'faction_mujica_mutual_shield' }] },
        { minMembers: 5 },
      ],
    },
    grantsSpirits: ['mujica_premier_edict'],
  },

  // 3. 大家的日常 (majo-circle)
  {
    id: 'faction_majo_corner_table',
    template: 'majo_circle',
    tier: 0,
    column: 1,
    title: '在玛格咖啡馆留出常聚长桌',
    description: '无论白天各奔哪条街巷，总有一张不需要提前通报也能随时坐下来的熟悉长桌。',
    durationMinutes: 2880,
    aiWeight: 90,
  },
  {
    id: 'faction_majo_quiet_haven',
    template: 'majo_circle',
    tier: 1,
    column: 0,
    branchGroup: 'faction_majo_style',
    title: '守望每个人的平凡作息',
    description: '把安稳与松弛留给身边的女孩们，少一点拘谨试探，多一点放心喘气的日常。',
    durationMinutes: 4320,
    aiWeight: 92,
    prerequisites: { completed: 'faction_majo_corner_table' },
    grantsSpirits: ['majo_tea_calm'],
  },
  {
    id: 'faction_majo_city_network',
    template: 'majo_circle',
    tier: 1,
    column: 2,
    branchGroup: 'faction_majo_style',
    title: '串联街区与校园委托线索',
    description: '让律所、咖啡馆与直播间之间常通近况，哪位故人遇到麻烦都能及时接手帮忙。',
    durationMinutes: 4320,
    aiWeight: 86,
    prerequisites: { all: [{ completed: 'faction_majo_corner_table' }, { minMembers: 4 }] },
    grantsSpirits: ['majo_mutual_aid'],
  },
  {
    id: 'faction_majo_seasonal_gathering',
    template: 'majo_circle',
    tier: 2,
    column: 1,
    title: '筹办街区四季茶话夜',
    description: '把东京各处的故人都约在同一盏暖灯下，让久别重逢慢慢成为不用犹豫的习惯。',
    durationMinutes: 4320,
    aiWeight: 88,
    important: true,
    prerequisites: {
      all: [
        { any: [{ completed: 'faction_majo_quiet_haven' }, { completed: 'faction_majo_city_network' }] },
        { minMembers: 5 },
      ],
    },
    grantsSpirits: ['majo_reunion_glow'],
  },

  // 4. 芦谷五人组 (watanare-quintet)
  {
    id: 'faction_watanare_afterschool_pact',
    template: 'watanare_quintet',
    tier: 0,
    column: 1,
    title: '定下放学后不独留一人的约定',
    description: '不管是天台还是家庭餐厅，只要今天有人想找大家搭话，就一定能凑在一块。',
    durationMinutes: 2880,
    aiWeight: 90,
  },
  {
    id: 'faction_watanare_elite_guidance',
    template: 'watanare_quintet',
    tier: 1,
    column: 0,
    branchGroup: 'faction_watanare_pace',
    title: '跟上高标准步调互相督促',
    description: '在王冢真唯的一丝不苟带动下，五人的谈吐气质、日常统筹与社交熟练一同提速。',
    durationMinutes: 4320,
    aiWeight: 85,
    prerequisites: { all: [{ completed: 'faction_watanare_afterschool_pact' }, { hasMember: 'watanare-mai' }] },
    grantsSpirits: ['watanare_polished_grace'],
  },
  {
    id: 'faction_watanare_open_pace',
    template: 'watanare_quintet',
    tier: 1,
    column: 2,
    branchGroup: 'faction_watanare_pace',
    title: '按自己的步幅并肩打气',
    description: '由紫阳花温柔接住紧张情绪，跟着香穗和纱月慢慢充电，哪怕社恐也不用勉强逞强。',
    durationMinutes: 4320,
    aiWeight: 92,
    prerequisites: { all: [{ completed: 'faction_watanare_afterschool_pact' }, { hasMember: 'watanare-ajisai' }] },
    grantsSpirits: ['watanare_shared_cheer'],
  },
  {
    id: 'faction_watanare_festival_plan',
    template: 'watanare_quintet',
    tier: 2,
    column: 1,
    title: '策划五人的假日联合出行',
    description: '五人全员聚齐之后，把放学后的小小默契变成一次真正写进纪念册的假日同行。',
    durationMinutes: 4320,
    aiWeight: 90,
    important: true,
    prerequisites: {
      all: [
        { any: [{ completed: 'faction_watanare_elite_guidance' }, { completed: 'faction_watanare_open_pace' }] },
        { minMembers: 5 },
      ],
    },
    grantsSpirits: ['watanare_holiday_bond'],
  },

  // 5. 通用阵营国策树 (自建乐队 / 自建社交圈 / 广域联合体)
  {
    id: 'faction_generic_charter',
    template: 'generic_faction',
    tier: 0,
    column: 1,
    title: '写下共同行动的初版章程',
    description: '无论自建乐队、同好小圈还是跨区联合体，先对齐称呼、日常分工与下阶段共识。',
    durationMinutes: 2880,
    aiWeight: 90,
  },
  {
    id: 'faction_generic_internal_drill',
    template: 'generic_faction',
    tier: 1,
    column: 0,
    branchGroup: 'faction_generic_path',
    title: '对内打磨默契与日常分工',
    description: '聚焦现有成员间的配合节奏与精力分配，让小集体先真正拧成一股绳。',
    durationMinutes: 4320,
    aiWeight: 90,
    prerequisites: { completed: 'faction_generic_charter' },
    grantsSpirits: ['generic_solidarity'],
  },
  {
    id: 'faction_generic_external_reach',
    template: 'generic_faction',
    tier: 1,
    column: 2,
    branchGroup: 'faction_generic_path',
    title: '向外拓展联合响应网络',
    description: '在至少 3 名成员或任一内阁顾问支撑下打开外部联动，让阵营声势延伸至街区各地。',
    durationMinutes: 4320,
    aiWeight: 86,
    prerequisites: { all: [{ completed: 'faction_generic_charter' }, { any: [{ minMembers: 3 }, { minAdvisors: 1 }] }] },
    grantsSpirits: ['generic_outreach'],
  },
  {
    id: 'faction_generic_joint_summit',
    template: 'generic_faction',
    tier: 2,
    column: 1,
    title: '举行阶段联合总结会议',
    description: '汇总前一阶段的联动经验，沉淀成所有成员都能借力的共同行动纲领。',
    durationMinutes: 4320,
    aiWeight: 90,
    important: true,
    prerequisites: {
      any: [{ completed: 'faction_generic_internal_drill' }, { completed: 'faction_generic_external_reach' }],
    },
    grantsSpirits: ['generic_charter_pulse'],
  },
]);

const SPIRIT_BY_ID = new Map(FACTION_SPIRIT_CATALOG.map(s => [s.id, s] as const));
const FOCUS_BY_ID = new Map(FACTION_FOCUS_CATALOG.map(f => [f.id, f] as const));

export function factionSpiritById(id: string): FactionSpiritDefinition | null {
  return SPIRIT_BY_ID.get(id) ?? null;
}

export function factionFocusById(id: string): FactionFocusDefinition | null {
  return FOCUS_BY_ID.get(id) ?? null;
}

export function factionFocusCatalogForTemplate(template: FactionTemplateId): readonly FactionFocusDefinition[] {
  return FACTION_FOCUS_CATALOG.filter(f => f.template === template);
}

/** Map live world person IDs cleanly onto StrategyOwner IDs used by modifiers. */
export function strategyOwnerForPersonId(personId: string): StrategyOwner {
  if (personId === 'protagonist-soyo') return 'soyo';
  if (personId === 'protagonist-sakiko') return 'sakiko';
  const mapped = protagonistForPerson(personId);
  return mapped ?? personId;
}

export const factionPersonId = (id: ProtagonistId): string =>
  PROTAGONIST_PERSON_IDS[id] ?? `protagonist-${id}`;

function advisorName(personId: string): string {
  return residentById(personId)?.name ?? personId;
}

function dedupe(items: readonly string[]): string[] {
  return [...new Set(items.filter(Boolean))];
}

const VALID_TEMPLATES: readonly FactionTemplateId[] = ['mygo', 'ave_mujica', 'majo_circle', 'watanare_quintet', 'generic_faction'];
const TEMPLATE_DEFAULT_CONTROLLERS: Readonly<Record<FactionTemplateId, 'manual' | 'auto'>> = {
  mygo: 'auto',
  ave_mujica: 'auto',
  majo_circle: 'auto',
  watanare_quintet: 'auto',
  generic_faction: 'manual',
};

function canonicalTemplateForBand(established?: 'mygo' | 'ave-mujica'): FactionTemplateId {
  if (established === 'mygo') return 'mygo';
  if (established === 'ave-mujica') return 'ave_mujica';
  return 'generic_faction';
}

function bandControllers(band: {
  established?: 'mygo' | 'ave-mujica';
  founder: string;
  registeredBy?: ProtagonistId;
  members: readonly { personId: string }[];
}): ProtagonistId[] {
  const owners = new Set<ProtagonistId>();
  if ((PROTAGONISTS as readonly string[]).includes(band.founder)) owners.add(band.founder as ProtagonistId);
  if (band.registeredBy) owners.add(band.registeredBy);
  if (band.established === 'mygo' && band.members.some(m => m.personId === 'protagonist-soyo')) owners.add('soyo');
  if (band.established === 'ave-mujica' && band.members.some(m => m.personId === 'protagonist-sakiko')) owners.add('sakiko');
  return [...owners];
}

/** Discover all canonical & player-founded factions from live world state without duplicating rosters. */
export function discoverAvailableFactions(world: WorldState): FactionProfile[] {
  const out: FactionProfile[] = [];
  const advisors = world.protagonists?.society?.advisors ?? [];
  const circles = world.protagonists?.society?.circles ?? [];
  const unions = world.protagonists?.society?.unions ?? [];
  const bands = world.livehouse?.bands ?? [];

  for (const band of bands) {
    const template = canonicalTemplateForBand(band.established);
    const id = `band:${band.id}`;
    const bandAdvisors = advisors
      .filter(a => a.bandId === band.id && band.members.some(m => m.personId === a.personId))
      .map(a => ({ seat: a.seat, personId: a.personId, name: advisorName(a.personId) }));
    out.push({
      id,
      template,
      kind: 'band',
      title: band.name,
      subtitle: band.established ? '核心乐队阵营' : '自建乐队阵营',
      memberIds: dedupe(band.members.map(m => m.personId)),
      advisors: bandAdvisors,
      controllableBy: bandControllers(band),
      defaultController: band.established ? 'auto' : 'manual',
      bandId: band.id,
    });
  }

  // Always expose canonical MyGO!!!!! & Ave Mujica presets if not yet seeded on legacy saves
  if (!out.some(f => f.template === 'mygo')) {
    out.push({
      id: 'band:established-mygo',
      template: 'mygo',
      kind: 'band',
      title: MYGO_GROUP_NAME,
      subtitle: '核心乐队阵营',
      memberIds: ['protagonist-soyo', 'bang-anon', 'bang-tomori', 'bang-taki', 'bang-rana'],
      advisors: [],
      controllableBy: ['soyo'],
      defaultController: 'auto',
      bandId: 'established-mygo',
    });
  }
  if (!out.some(f => f.template === 'ave_mujica')) {
    out.push({
      id: 'band:established-ave-mujica',
      template: 'ave_mujica',
      kind: 'band',
      title: AVE_MUJICA_GROUP_NAME,
      subtitle: '核心乐队阵营',
      memberIds: ['protagonist-sakiko', 'bang-mutsumi', 'bang-uika', 'bang-umiri', 'bang-nyamu'],
      advisors: [],
      controllableBy: ['sakiko'],
      defaultController: 'auto',
      bandId: 'established-ave-mujica',
    });
  }

  // Canonical resident circles
  const majoMembers = residentGroups[MAJO_GROUP_ID]?.memberIds ?? ['majo-emma'];
  out.push({
    id: `circle:${MAJO_GROUP_ID}`,
    template: 'majo_circle',
    kind: 'core_circle',
    title: MAJO_GROUP_NAME,
    subtitle: '故人日常圈阵营',
    memberIds: dedupe(majoMembers),
    advisors: [],
    controllableBy: ['emma'],
    defaultController: 'auto',
  });

  const watanareMembers = residentGroups[WATANARE_GROUP_ID]?.memberIds ?? ['watanare-renako'];
  out.push({
    id: `circle:${WATANARE_GROUP_ID}`,
    template: 'watanare_quintet',
    kind: 'core_circle',
    title: WATANARE_GROUP_NAME,
    subtitle: '五人同行圈阵营',
    memberIds: dedupe(watanareMembers),
    advisors: [],
    controllableBy: ['renako'],
    defaultController: 'auto',
  });

  // Player-founded circles
  for (const circle of circles) {
    const id = `circle:${circle.id}`;
    if (out.some(row => row.id === id)) continue;
    out.push({
      id,
      template: 'generic_faction',
      kind: 'circle',
      title: circle.title,
      subtitle: '自建社交圈阵营',
      memberIds: dedupe([factionPersonId(circle.founder), ...circle.memberIds]),
      advisors: [],
      controllableBy: [circle.founder],
      defaultController: 'manual',
    });
  }

  // Player-founded wide-area coalitions / unions
  for (const union of unions) {
    const circleMembers = circles
      .filter(c => union.groupIds.includes(`circle:${c.id}`))
      .flatMap(c => [factionPersonId(c.founder), ...c.memberIds]);
    const bandMembers = bands
      .filter(b => union.groupIds.includes(`band:${b.id}`))
      .flatMap(b => b.members.map(m => m.personId));
    const unionAdvisors = bands
      .filter(b => union.groupIds.includes(`band:${b.id}`))
      .flatMap(b =>
        advisors
          .filter(a => a.bandId === b.id && b.members.some(m => m.personId === a.personId))
          .map(a => ({ seat: a.seat, personId: a.personId, name: advisorName(a.personId) })),
      );
    out.push({
      id: `union:${union.id}`,
      template: 'generic_faction',
      kind: 'union',
      title: union.title,
      subtitle: '广域联合体阵营',
      memberIds: dedupe([factionPersonId(union.coordinator), ...circleMembers, ...bandMembers]),
      advisors: unionAdvisors,
      controllableBy: [union.coordinator],
      defaultController: 'manual',
    });
  }

  return out;
}

export function defaultFactionEntryState(id: string, template: FactionTemplateId, controller?: 'manual' | 'auto'): FactionEntryState {
  return {
    id,
    template,
    controller: controller ?? TEMPLATE_DEFAULT_CONTROLLERS[template],
    includeInPrompt: false,
    active: null,
    completed: [],
    spirits: [],
  };
}

export function createFactionFocusState(at: number): FactionFocusWorldState {
  boundedInt(at, 0, MAX_MINUTE, '阵营国策起始时间');
  return {
    version: 1,
    cursor: at,
    factions: {
      'band:established-mygo': defaultFactionEntryState('band:established-mygo', 'mygo', 'auto'),
      'band:established-ave-mujica': defaultFactionEntryState('band:established-ave-mujica', 'ave_mujica', 'auto'),
      [`circle:${MAJO_GROUP_ID}`]: defaultFactionEntryState(`circle:${MAJO_GROUP_ID}`, 'majo_circle', 'auto'),
      [`circle:${WATANARE_GROUP_ID}`]: defaultFactionEntryState(`circle:${WATANARE_GROUP_ID}`, 'watanare_quintet', 'auto'),
    },
    receipts: [],
    history: [],
  };
}

function fail(message: string): never {
  throw new Error(`阵营国策：${message}`);
}

function boundedInt(value: unknown, min: number, max: number, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
    fail(`${label}无效`);
  }
  return value;
}

function finiteNumber(value: unknown, min: number, max: number, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    fail(`${label}无效`);
  }
  return value;
}

function identifier(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][\w:.-]{0,95}$/.test(value)) {
    fail(`${label}无效`);
  }
  return value;
}

function text(value: unknown, max: number, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f]/.test(value)) {
    fail(`${label}无效`);
  }
  return value.trim();
}

function exact(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label}无效`);
  const obj = value as Record<string, unknown>;
  const actual = Object.keys(obj);
  if (actual.length !== keys.length || keys.some(k => !Object.hasOwn(obj, k))) {
    fail(`${label}字段无效`);
  }
  return obj;
}

export function parseFactionFocusState(raw: unknown, maxCursor = MAX_MINUTE): FactionFocusWorldState {
  const s = exact(raw, ['version', 'cursor', 'factions', 'receipts', 'history'], '阵营国策存档');
  if (s.version !== 1) fail('阵营国策版本不支持');
  const cursor = boundedInt(s.cursor, 0, maxCursor, '阵营国策时钟');

  if (!s.factions || typeof s.factions !== 'object' || Array.isArray(s.factions)) fail('阵营列表无效');
  const entries = Object.entries(s.factions as Record<string, unknown>);
  if (entries.length > 64) fail('阵营国策条目超出上限');

  const factions: Record<string, FactionEntryState> = {};
  for (const [key, item] of entries) {
    const factionId = identifier(key, '阵营 ID');
    const row = exact(item, ['id', 'template', 'controller', 'includeInPrompt', 'active', 'completed', 'spirits'], '阵营记录');
    if (row.id !== factionId) fail('阵营 ID 不一致');
    if (!VALID_TEMPLATES.includes(row.template as FactionTemplateId)) fail('阵营国策模板无效');
    if (row.controller !== 'manual' && row.controller !== 'auto') fail('阵营控制模式无效');
    if (typeof row.includeInPrompt !== 'boolean') fail('阵营联动开关无效');

    let active: FactionFocusRun | null = null;
    if (row.active !== null) {
      const a = exact(row.active, ['id', 'startedAt', 'progress'], '当前阵营国策');
      const focusId = identifier(a.id, '阵营国策 ID');
      const def = FOCUS_BY_ID.get(focusId);
      if (!def || def.template !== row.template) fail('阵营国策不存在或不匹配');
      active = {
        id: focusId,
        startedAt: boundedInt(a.startedAt, 0, cursor, '启动时间'),
        progress: finiteNumber(a.progress, 0, def.durationMinutes * 4 + 1000, '进度'),
      };
    }

    if (!Array.isArray(row.completed) || row.completed.length > 64) fail('已完成国策列表无效');
    const completed = row.completed.map(id => {
      const fId = identifier(id, '已完成国策 ID');
      const def = FOCUS_BY_ID.get(fId);
      if (!def || def.template !== row.template) fail('已完成国策与阵营模板不匹配');
      return fId;
    });
    if (new Set(completed).size !== completed.length) fail('已完成国策重复');

    if (!Array.isArray(row.spirits) || row.spirits.length > 32) fail('阵营精神列表无效');
    const spirits = row.spirits.map(sp => {
      const spObj = exact(sp, ['id', 'grantedAt'], '阵营精神');
      const spId = identifier(spObj.id, '阵营精神 ID');
      if (!SPIRIT_BY_ID.has(spId)) fail('未知阵营精神');
      return {
        id: spId,
        grantedAt: boundedInt(spObj.grantedAt, 0, cursor, '阵营精神生效时间'),
      };
    });

    factions[factionId] = {
      id: factionId,
      template: row.template as FactionTemplateId,
      controller: row.controller,
      includeInPrompt: row.includeInPrompt,
      active,
      completed,
      spirits,
    };
  }

  if (!Array.isArray(s.receipts) || s.receipts.length > RECEIPT_LIMIT) fail('阵营请求回执无效');
  const receipts = s.receipts.map(item => {
    const r = exact(item, ['id', 'command'], '阵营回执');
    return { id: identifier(r.id, '回执 ID'), command: text(r.command, 500, '回执载荷') };
  });

  if (!Array.isArray(s.history) || s.history.length > HISTORY_LIMIT) fail('阵营历史无效');
  const history = s.history.map(item => {
    const h = item as Record<string, unknown>;
    const hasNote = Object.hasOwn(h, 'note');
    exact(h, hasNote ? ['id', 'at', 'factionId', 'kind', 'subject', 'note'] : ['id', 'at', 'factionId', 'kind', 'subject'], '阵营历史记录');
    if (!['start', 'complete', 'cancel', 'bypass'].includes(h.kind as string)) fail('阵营历史类型无效');
    return {
      id: identifier(h.id, '历史 ID'),
      at: boundedInt(h.at, 0, cursor, '历史时间'),
      factionId: identifier(h.factionId, '阵营 ID'),
      kind: h.kind as FactionFocusHistoryEntry['kind'],
      subject: identifier(h.subject, '历史主题'),
      ...(hasNote ? { note: text(h.note, 240, '历史备注') } : {}),
    };
  });

  return { version: 1, cursor, factions, receipts, history };
}

function matchesMember(memberIds: readonly string[], targetId: string): boolean {
  if (memberIds.includes(targetId)) return true;
  if (targetId === 'soyo' && memberIds.includes('protagonist-soyo')) return true;
  if (targetId === 'sakiko' && memberIds.includes('protagonist-sakiko')) return true;
  if (targetId === 'emma' && memberIds.includes('majo-emma')) return true;
  if (targetId === 'renako' && memberIds.includes('watanare-renako')) return true;
  return false;
}

export function checkFactionCondition(
  cond: FactionCondition,
  entry: FactionEntryState,
  meta: FactionRuntimeMeta,
): boolean {
  if ('always' in cond) return cond.always;
  if ('all' in cond) return cond.all.every(item => checkFactionCondition(item, entry, meta));
  if ('any' in cond) return cond.any.some(item => checkFactionCondition(item, entry, meta));
  if ('completed' in cond) return entry.completed.includes(cond.completed);
  if ('minMembers' in cond) return meta.profile.memberIds.length >= cond.minMembers;
  if ('hasMember' in cond) return matchesMember(meta.profile.memberIds, cond.hasMember);
  if ('minAdvisors' in cond) return meta.profile.advisors.length >= cond.minAdvisors;
  if ('hasAdvisorSeat' in cond) return meta.profile.advisors.some(a => a.seat === cond.hasAdvisorSeat);
  if ('strategyFlag' in cond) return meta.strategy?.flags[cond.strategyFlag] === true;
  if ('mutsumiBalance' in cond) {
    const val = mutsumiBalanceValue(meta.strategy);
    if (cond.mutsumiBalance.gte !== undefined && val < cond.mutsumiBalance.gte) return false;
    if (cond.mutsumiBalance.lte !== undefined && val > cond.mutsumiBalance.lte) return false;
    return true;
  }
  return false;
}

const SEAT_LABELS: Record<AdvisorSeat, string> = {
  music: '音乐与编曲内阁席位',
  social: '社交与宣发内阁席位',
  operations: '事务与日常内阁席位',
};

const PERSON_LABELS: Record<string, string> = {
  'bang-mutsumi': '若叶睦',
  'watanare-mai': '王冢真唯',
  'watanare-ajisai': '濑名紫阳花',
  'protagonist-soyo': '长崎素世',
  'protagonist-sakiko': '丰川祥子',
};

export function describeFactionCondition(cond: FactionCondition): string {
  if ('always' in cond) return cond.always ? '无特殊限制' : '暂不可用';
  if ('all' in cond) return cond.all.map(describeFactionCondition).join(' 且 ');
  if ('any' in cond) return `满足其一（${cond.any.map(describeFactionCondition).join(' / ')}）`;
  if ('completed' in cond) return `完成「${FOCUS_BY_ID.get(cond.completed)?.title ?? cond.completed}」`;
  if ('minMembers' in cond) return `阵营正式成员不少于 ${cond.minMembers} 人`;
  if ('hasMember' in cond) return `${PERSON_LABELS[cond.hasMember] ?? residentById(cond.hasMember)?.name ?? cond.hasMember} 在阵营编制内`;
  if ('minAdvisors' in cond) return `至少任命 ${cond.minAdvisors} 位阵营内阁顾问`;
  if ('hasAdvisorSeat' in cond) return `已任命「${SEAT_LABELS[cond.hasAdvisorSeat]}」`;
  if ('strategyFlag' in cond) return `达成关键局势前提（${cond.strategyFlag}）`;
  if ('mutsumiBalance' in cond) {
    const parts: string[] = [];
    if (cond.mutsumiBalance.gte !== undefined) parts.push(`>= ${cond.mutsumiBalance.gte}`);
    if (cond.mutsumiBalance.lte !== undefined) parts.push(`<= ${cond.mutsumiBalance.lte}`);
    return `若叶睦心理天平 ${parts.join(' 且 ')}`;
  }
  return '';
}

export function isFactionFocusBranchLocked(entry: FactionEntryState, def: FactionFocusDefinition): boolean {
  if (!def.branchGroup) return false;
  return FACTION_FOCUS_CATALOG.some(
    other => other.id !== def.id && other.branchGroup === def.branchGroup && other.template === def.template && entry.completed.includes(other.id),
  );
}

export function canStartFactionFocus(entry: FactionEntryState, def: FactionFocusDefinition, meta: FactionRuntimeMeta): boolean {
  if (def.template !== entry.template) return false;
  if (entry.active) return false;
  if (entry.completed.includes(def.id)) return false;
  if (isFactionFocusBranchLocked(entry, def)) return false;
  if (def.prerequisites && !checkFactionCondition(def.prerequisites, entry, meta)) return false;
  if (def.available && !checkFactionCondition(def.available, entry, meta)) return false;
  return true;
}

/**
 * Compute faction focus speed multiplier combining cabinet seats (+0.15 per seat),
 * advisor trait synergy (+0.10 per matched advisor), and active Faction Spirit bonuses.
 */
export function factionFocusRateBreakdown(entry: FactionEntryState, meta: FactionRuntimeMeta): FactionRateBreakdown {
  const advisorCount = meta.profile.advisors.length;
  const seatBonus = Math.round(advisorCount * 0.15 * 100) / 100;
  const traitBonus = Math.round(Math.max(0, meta.advisorTraitBonus) * 100) / 100;

  let spiritBonus = 0;
  let spiritMultiply = 1;
  for (const inst of entry.spirits) {
    const def = SPIRIT_BY_ID.get(inst.id);
    if (!def) continue;
    for (const mod of def.modifiers) {
      if (mod.target !== 'focus_progress_rate') continue;
      if (mod.operation === 'add') spiritBonus += mod.amount;
      else if (mod.operation === 'multiply') spiritMultiply *= mod.amount;
    }
  }
  const raw = (1 + seatBonus + traitBonus + spiritBonus) * spiritMultiply;
  const totalRate = Math.max(0.25, Math.round(raw * 100) / 100);
  return {
    base: 1,
    advisorCount,
    seatBonus,
    traitBonus,
    spiritBonus: Math.round(spiritBonus * 100) / 100,
    totalRate,
  };
}

function ensureEntry(state: FactionFocusWorldState, meta: FactionRuntimeMeta): FactionEntryState {
  const existing = state.factions[meta.profile.id];
  if (existing && existing.template === meta.profile.template) return existing;
  const created = defaultFactionEntryState(meta.profile.id, meta.profile.template, meta.profile.defaultController);
  state.factions[meta.profile.id] = created;
  return created;
}

function pushHistory(
  state: FactionFocusWorldState,
  factionId: string,
  kind: FactionFocusHistoryEntry['kind'],
  subject: string,
  at: number,
  note?: string,
): void {
  const id = `ff:${factionId}:${kind}:${subject}:${at}`;
  if (state.history.some(row => row.id === id)) return;
  state.history.push({ id, at, factionId, kind, subject, ...(note ? { note } : {}) });
  if (state.history.length > HISTORY_LIMIT) {
    state.history = state.history.slice(-HISTORY_LIMIT);
  }
}

function completeFactionFocus(
  state: FactionFocusWorldState,
  entry: FactionEntryState,
  kind: 'complete' | 'bypass',
  at: number,
  completedEvents: FactionCompletedEvent[],
): void {
  const active = entry.active;
  if (!active) return;
  const def = FOCUS_BY_ID.get(active.id);
  entry.active = null;
  if (!def) return;
  if (!entry.completed.includes(def.id)) entry.completed.push(def.id);
  if (kind === 'complete') {
    for (const spiritId of def.grantsSpirits ?? []) {
      if (!SPIRIT_BY_ID.has(spiritId)) continue;
      if (!entry.spirits.some(s => s.id === spiritId)) {
        entry.spirits.push({ id: spiritId, grantedAt: at });
      }
    }
    completedEvents.push({
      factionId: entry.id,
      focusId: def.id,
      title: def.title,
      at,
      ...(def.shiftMutsumiBalance ? { shiftMutsumiBalance: def.shiftMutsumiBalance } : {}),
    });
  }
  pushHistory(state, entry.id, kind, def.id, at);
}

export function applyFactionFocusCommand(
  input: FactionFocusWorldState,
  command: FactionFocusCommand,
  requestId: string,
  metaMap: ReadonlyMap<string, FactionRuntimeMeta>,
): FactionFocusWorldState {
  const id = identifier(requestId, '请求 ID');
  const encoded = JSON.stringify(command);
  if (encoded.length > 500) fail('命令过长');

  const schema: Record<FactionFocusCommand['type'], readonly string[]> = {
    set_faction_control: ['type', 'factionId', 'controller', 'includeInPrompt'],
    start_faction_focus: ['type', 'factionId', 'focusId'],
    cancel_faction_focus: ['type', 'factionId'],
  };
  if (!command || typeof command !== 'object' || !Object.hasOwn(schema, command.type)) fail('阵营国策命令无效');
  exact(command, schema[command.type], '阵营国策命令');
  identifier(command.factionId, '阵营 ID');

  const old = input.receipts.find(r => r.id === id);
  if (old) {
    if (old.command !== encoded) fail('重复阵营国策请求内容不一致');
    return input;
  }

  const meta = metaMap.get(command.factionId);
  if (!meta) fail('找不到指定阵营');

  const next: FactionFocusWorldState = structuredClone(input);
  const entry = ensureEntry(next, meta);
  const at = next.cursor;

  if (command.type === 'set_faction_control') {
    if ((command.controller !== 'manual' && command.controller !== 'auto') || typeof command.includeInPrompt !== 'boolean') {
      fail('阵营国策控制参数无效');
    }
    entry.controller = command.controller;
    entry.includeInPrompt = command.includeInPrompt;
  } else if (command.type === 'start_faction_focus') {
    if (entry.controller !== 'manual' || entry.active) fail('当前不能手动启动阵营国策');
    const def = FOCUS_BY_ID.get(command.focusId);
    if (!def || !canStartFactionFocus(entry, def, meta)) fail('阵营国策前置或成员/内阁条件未满足');
    entry.active = { id: def.id, startedAt: at, progress: 0 };
    pushHistory(next, entry.id, 'start', def.id, at);
  } else if (command.type === 'cancel_faction_focus') {
    if (!entry.active || entry.controller !== 'manual') fail('当前没有可取消的手动阵营国策');
    const cancelledId = entry.active.id;
    entry.active = null;
    pushHistory(next, entry.id, 'cancel', cancelledId, at);
  }

  next.receipts.push({ id, command: encoded });
  if (next.receipts.length > RECEIPT_LIMIT) next.receipts = next.receipts.slice(-RECEIPT_LIMIT);
  return next;
}

/**
 * Event-boundary deterministic settlement matching StrategyState chunk invariance:
 * dividing a duration into small chunks produces identical state to settling in one jump.
 */
export function settleFactionFocusState(
  input: FactionFocusWorldState,
  end: number,
  metas: readonly FactionRuntimeMeta[],
): { state: FactionFocusWorldState; completed: FactionCompletedEvent[] } {
  boundedInt(end, input.cursor, MAX_MINUTE, '阵营国策结算时间');
  const state: FactionFocusWorldState = structuredClone(input);
  const completedEvents: FactionCompletedEvent[] = [];

  for (const meta of metas) {
    ensureEntry(state, meta);
  }

  const maxIterations = 32 + FACTION_FOCUS_CATALOG.length * Math.max(4, metas.length * 2) + Math.ceil((end - input.cursor) / 1440);
  let at = state.cursor;
  let iterations = 0;

  while (at <= end) {
    if (++iterations > maxIterations) fail('阵营国策结算超过安全上限');
    state.cursor = at;

    // Resolve same-minute completions, cancellations, bypasses, and AI auto-picks
    for (let pass = 0; pass < FACTION_FOCUS_CATALOG.length + 2; pass++) {
      let changed = false;
      for (const meta of metas) {
        const entry = state.factions[meta.profile.id];
        if (!entry) continue;
        if (entry.active) {
          const def = FOCUS_BY_ID.get(entry.active.id);
          if (!def) {
            entry.active = null;
            changed = true;
          } else if (def.cancel && checkFactionCondition(def.cancel, entry, meta)) {
            const old = entry.active.id;
            entry.active = null;
            pushHistory(state, entry.id, 'cancel', old, at);
            changed = true;
          } else if (def.bypass && checkFactionCondition(def.bypass, entry, meta)) {
            completeFactionFocus(state, entry, 'bypass', at, completedEvents);
            changed = true;
          }
        }
        if (!entry.active && entry.controller === 'auto') {
          const candidates = factionFocusCatalogForTemplate(entry.template)
            .filter(def => canStartFactionFocus(entry, def, meta))
            .sort((a, b) => b.aiWeight - a.aiWeight || a.id.localeCompare(b.id));
          const chosen = candidates[0];
          if (chosen) {
            entry.active = { id: chosen.id, startedAt: at, progress: 0 };
            pushHistory(state, entry.id, 'start', chosen.id, at);
            changed = true;
          }
        }
      }
      if (!changed) break;
    }

    if (at === end) break;

    let nextAt = end;
    const rates = new Map<string, number>();
    for (const meta of metas) {
      const entry = state.factions[meta.profile.id];
      if (!entry?.active) continue;
      const def = FOCUS_BY_ID.get(entry.active.id);
      if (!def) continue;
      if (def.available && !checkFactionCondition(def.available, entry, meta)) continue;
      const rate = factionFocusRateBreakdown(entry, meta).totalRate;
      if (rate <= 0) continue;
      rates.set(entry.id, rate);
      const stepNeed = Math.max(1, Math.ceil((def.durationMinutes - entry.active.progress - 1e-9) / rate));
      nextAt = Math.min(nextAt, at + stepNeed);
    }

    if (nextAt <= at) fail('阵营国策时间未向前推进');
    const delta = nextAt - at;
    for (const [factionId, rate] of rates) {
      const active = state.factions[factionId]?.active;
      if (!active) continue;
      active.progress = Math.round((active.progress + delta * rate) * 100) / 100;
    }
    at = nextAt;
    state.cursor = at;

    for (const meta of metas) {
      const entry = state.factions[meta.profile.id];
      if (!entry?.active) continue;
      const def = FOCUS_BY_ID.get(entry.active.id);
      if (def && entry.active.progress + 1e-9 >= def.durationMinutes) {
        completeFactionFocus(state, entry, 'complete', at, completedEvents);
      }
    }
  }

  state.cursor = end;
  return { state, completed: completedEvents };
}

/**
 * Project active Shared Faction Spirits onto every current member (protagonists & NPCs)
 * so strategy modifiers apply across personal focuses, social XP, practice skill, and stress relief.
 */
export function factionFocusExternalModifiersByOwner(world: WorldState): ExternalStrategyModifiers {
  const factionState = world.protagonists?.factionFocuses;
  if (!factionState) return {};
  const profiles = discoverAvailableFactions(world);
  const result: Record<string, { source: string; modifier: StrategyModifier }[]> = {};

  for (const profile of profiles) {
    const entry = factionState.factions[profile.id];
    if (!entry || entry.spirits.length === 0) continue;
    const ownerTargets = [...new Set(profile.memberIds.map(strategyOwnerForPersonId))];
    for (const sp of entry.spirits) {
      const def = SPIRIT_BY_ID.get(sp.id);
      if (!def) continue;
      const sourceLabel = `阵营精神「${def.title}」(${profile.title})`;
      for (const owner of ownerTargets) {
        const list = result[owner] ?? (result[owner] = []);
        for (const modifier of def.modifiers) {
          list.push({ source: sourceLabel, modifier });
        }
      }
    }
  }

  return result;
}
