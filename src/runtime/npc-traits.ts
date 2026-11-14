import type { CharacterContact, WorldState } from '../frontend/types';
import { PROTAGONISTS, type ProtagonistId } from './dual-protagonists';
import type { AdvisorSeat } from './society';
import { factionFocusExternalModifiersByOwner } from './faction-focus';
import {
  formatStrategyModifier,
  type ExternalStrategyModifierSource,
  type ExternalStrategyModifiers,
  type ModifierTarget,
  type StrategyModifier,
} from './strategy';

export type NpcTraitCategory = 'music' | 'social' | 'strategy' | 'character' | 'craft';

export const NPC_TRAIT_CATEGORY_LABELS: Readonly<Record<NpcTraitCategory, string>> = Object.freeze({
  music: '排练与舞台',
  social: '交际与照应',
  strategy: '统筹与意志',
  character: '心性与禀赋',
  craft: '专长与日常',
});

export const ADVISOR_SEAT_LABELS: Readonly<Record<AdvisorSeat, string>> = Object.freeze({
  music: '音乐顾问',
  social: '社交顾问',
  operations: '组织顾问',
});

export interface NpcTraitDefinition {
  id: string;
  title: string;
  icon: string;
  category: NpcTraitCategory;
  summary: string;
  recommendedSeat?: AdvisorSeat;
  modifiers: readonly StrategyModifier[];
}

export interface NpcTraitTarget {
  id?: string | null;
  personId?: string | null;
  sourcePersonId?: string | null;
  name?: string | null;
  tag?: string | null;
  summary?: string | null;
  status?: string | null;
  gradeOrTitle?: string | null;
  schoolOrAffiliation?: string | null;
  anchorSpotDetail?: string | null;
  bioParagraphs?: readonly string[] | null;
}

export interface ActiveAdvisorTraitEntry {
  personId: string;
  personName: string;
  bandId: string;
  bandName: string;
  seat: AdvisorSeat;
  trait: NpcTraitDefinition;
}

export interface AdvisorPlacementInfo {
  bandId: string;
  bandName: string;
  seat: AdvisorSeat;
  seatLabel: string;
}

const PLAYABLE_IDENTIFIERS = new Set<string>([
  ...PROTAGONISTS,
  ...PROTAGONISTS.map(id => `protagonist-${id}`),
  'majo-emma',
  'watanare-renako',
  'protagonist',
  '长崎素世',
  '丰川祥子',
  '樱羽艾玛',
  '甘织玲奈子',
  '当前主角',
]);

const trait = (
  id: string,
  title: string,
  icon: string,
  category: NpcTraitCategory,
  summary: string,
  modifiers: readonly StrategyModifier[],
  recommendedSeat?: AdvisorSeat,
): NpcTraitDefinition => Object.freeze({
  id,
  title,
  icon,
  category,
  summary,
  modifiers: Object.freeze(modifiers),
  ...(recommendedSeat ? { recommendedSeat } : {}),
});

/**
 * Handcrafted 1–3 canon-faithful traits for every named resident/worldbook NPC
 * discoverable through「查身份」or band advisor rosters.
 */
export const PRESET_NPC_TRAIT_CATALOG: Readonly<Record<string, readonly NpcTraitDefinition[]>> = Object.freeze({
  'bang-tomori': [
    trait(
      'tomori_notebook_stones',
      '碎石与歌词笔记',
      '✎',
      'craft',
      '把创可贴、落叶与零散念头压进笔记本里，慢半拍却能把悬而未决的心事写成歌。',
      [
        { target: 'focus_progress_rate', operation: 'add', amount: 0.15 },
        { target: 'decision_stress_relief', operation: 'add', amount: 1 },
      ],
      'music',
    ),
    trait(
      'tomori_honest_resonance',
      '小心翼翼的同步率',
      '✿',
      'character',
      '不擅长顺滑客套，却会在关键时刻诚实地停在别人真正痛的地方。',
      [{ target: 'social_xp_rate', operation: 'add', amount: 0.15 }],
      'social',
    ),
  ],
  'bang-anon': [
    trait(
      'anon_icebreaker',
      '气氛润滑与话题发起者',
      '✦',
      'social',
      '哪怕刚换新环境也能迅速记下每个人的偏好，把冷场推向可继续谈下去的方向。',
      [{ target: 'social_xp_rate', operation: 'add', amount: 0.25 }],
      'social',
    ),
    trait(
      'anon_stage_branding',
      '体面排面设计痴迷',
      '◈',
      'craft',
      '对宣传照、团服剪影与出场顺序格外上心，总能提前把杂务料理妥当。',
      [
        { target: 'focus_progress_rate', operation: 'add', amount: 0.12 },
        { target: 'decision_energy_cost', operation: 'add', amount: -2 },
      ],
      'operations',
    ),
    trait(
      'anon_stubborn_catchup',
      '半途惊慌与强撑笑脸',
      '⚑',
      'character',
      '基本功曾留过空白，但只要咬住不逃，被逼到台前时也能硬着头皮追上来。',
      [{ target: 'practice_skill_rate', operation: 'add', amount: 0.1 }],
    ),
  ],
  'bang-taki': [
    trait(
      'taki_strict_metronome',
      '严苛至秒的节奏督导',
      '♪',
      'music',
      '听见拍子游离半拍就会立刻叫停重来，对乐句完成度绝不通融。',
      [
        { target: 'practice_skill_rate', operation: 'add', amount: 0.25 },
        { target: 'social_xp_rate', operation: 'add', amount: -0.05 },
      ],
      'music',
    ),
    trait(
      'taki_ring_nightshift',
      'RiNG 后厨夜班统筹',
      '⚑',
      'strategy',
      '从排练室预订到便利店补货都能按表卡死，替乐队扛住不少琐碎消耗。',
      [{ target: 'focus_progress_rate', operation: 'add', amount: 0.18 }],
      'operations',
    ),
    trait(
      'taki_blunt_shield',
      '护短而不饶人的直球',
      '◈',
      'character',
      '嘴上从不肯服软，真有人要掀桌子时却总是第一个挡在前面。',
      [{ target: 'decision_energy_cost', operation: 'add', amount: -3 }],
      'social',
    ),
  ],
  'bang-rana': [
    trait(
      'rana_instinctive_riff',
      '本能驱动的瞬时乐感',
      '♪',
      'music',
      '不照谱背规矩，却能一弦定音把整场排练从僵局里拽活。',
      [
        { target: 'practice_skill_rate', operation: 'add', amount: 0.25 },
        { target: 'focus_progress_rate', operation: 'add', amount: -0.05 },
      ],
      'music',
    ),
    trait(
      'rana_matcha_wanderer',
      '随风出没的抹茶游魂',
      '✿',
      'character',
      '无视多余寒暄，合眼缘就留下来弹两句，心情对了反而把紧绷气场吹散。',
      [{ target: 'decision_stress_relief', operation: 'add', amount: 3 }],
    ),
  ],
  'bang-mutsumi': [
    trait(
      'mutsumi_silent_precision',
      '静音弦上的绝对服从感',
      '♪',
      'music',
      '极少在合奏里争抢声部，却把每段扫弦与闷音压得一丝不苟。',
      [{ target: 'practice_skill_rate', operation: 'add', amount: 0.2 }],
      'music',
    ),
    trait(
      'mutsumi_cucumber_calm',
      '阳台黄瓜与低耗共存',
      '✿',
      'craft',
      '言语极少、习惯照料枝叶，在她身边连空气都会跟着降下几度躁气。',
      [
        { target: 'decision_stress_relief', operation: 'add', amount: 3 },
        { target: 'decision_energy_cost', operation: 'add', amount: -2 },
      ],
      'operations',
    ),
    trait(
      'mutsumi_daily_cucumber',
      '晴日园圃的赠瓜礼',
      '❁',
      'social',
      '好感度高时，每天头一回与你面对面碰见，有一定几率默默递来一根自家栽种的小黄瓜。',
      [],
      'social',
    ),
  ],
  'bang-uika': [
    trait(
      'uika_sumimi_pro',
      'sumimi 现役舞台调度力',
      '✦',
      'music',
      '常年穿梭在打歌舞台与录音棚之间，懂得怎么让一首歌用最少磨合亮出成品光泽。',
      [
        { target: 'practice_skill_rate', operation: 'add', amount: 0.22 },
        { target: 'focus_progress_rate', operation: 'add', amount: 0.12 },
      ],
      'music',
    ),
    trait(
      'uika_seamless_listener',
      '温和到滴水不漏的倾听者',
      '✧',
      'social',
      '永远把微笑留给迎面走来的人，把真正汹涌的心事压在天台夜风后面。',
      [{ target: 'social_xp_rate', operation: 'add', amount: 0.2 }],
      'social',
    ),
    trait(
      'uika_moonlight_devotion',
      '指向月之彼端的执念锚点',
      '◈',
      'strategy',
      '一旦被旧约牵动，便会不计精力地替在意之人铺好整条后路。',
      [{ target: 'decision_energy_cost', operation: 'add', amount: -3 }],
      'operations',
    ),
  ],
  'bang-umiri': [
    trait(
      'umiri_mercenary_accuracy',
      '三十支乐队的雇佣兵准度',
      '♪',
      'music',
      '拿到谱面就能在当晚对齐低音律动，几乎从不把私人情绪带进工作间。',
      [{ target: 'practice_skill_rate', operation: 'add', amount: 0.25 }],
      'music',
    ),
    trait(
      'umiri_multithread_schedule',
      '多线程日程表决算官',
      '⚖',
      'strategy',
      '能同时压平七八份练团与演出排期，绝不让多余奔波白耗体力。',
      [
        { target: 'focus_progress_rate', operation: 'add', amount: 0.2 },
        { target: 'decision_energy_cost', operation: 'add', amount: -4 },
      ],
      'operations',
    ),
    trait(
      'umiri_guarded_distance',
      '刻意保持的安全距离',
      '◈',
      'character',
      '与谁都能礼貌喝一罐豆奶，却极少把任何一支队伍称作最后的归处。',
      [{ target: 'social_xp_rate', operation: 'add', amount: 0.08 }],
      'social',
    ),
  ],
  'bang-nyamu': [
    trait(
      'nyamu_camera_instinct',
      '镜头感与热点直觉',
      '✦',
      'social',
      '知道观众眼睛往哪里看、舆论何时该推一把，对曝光节奏拿捏极准。',
      [{ target: 'social_xp_rate', operation: 'add', amount: 0.22 }],
      'social',
    ),
    trait(
      'nyamu_minute_planner',
      '咬碎牙根的独立企划人',
      '⚑',
      'strategy',
      '从美妆视频到高强度打鼓练习，所有体面背后都是算到分钟的熬夜与加练。',
      [{ target: 'focus_progress_rate', operation: 'add', amount: 0.15 }],
      'operations',
    ),
    trait(
      'nyamu_unmasking_critique',
      '直指面具裂缝的锐评',
      '◈',
      'character',
      '不信空话，但恰恰因为肯撕开粉饰，排练反而少走许多弯路。',
      [
        { target: 'practice_skill_rate', operation: 'add', amount: 0.15 },
        { target: 'decision_stress_relief', operation: 'add', amount: -1 },
      ],
      'music',
    ),
  ],
  'nagasaki-mother': [
    trait(
      'makoto_legal_poise',
      '法务部般的分寸与体面',
      '⚖',
      'social',
      '在公司与家中维持井然秩序，不干涉琐碎私事，却替女儿留着最稳的后方补给。',
      [
        { target: 'focus_progress_rate', operation: 'add', amount: 0.16 },
        { target: 'decision_energy_cost', operation: 'add', amount: -2 },
      ],
      'operations',
    ),
    trait(
      'makoto_late_porch_light',
      '不动声色的晚灯守候',
      '✿',
      'character',
      '习惯深夜归家时看一眼门廊鞋子，言语克制，却永远知道什么时候该留一盏热汤灯。',
      [
        { target: 'decision_stress_relief', operation: 'add', amount: 2 },
        { target: 'social_xp_rate', operation: 'add', amount: 0.12 },
      ],
      'social',
    ),
  ],
  'bang-marina': [
    trait(
      'marina_circle_hub',
      'CiRCLE 全馆统筹中枢',
      '⚑',
      'strategy',
      '从老旧音响维修到新人档期协调，几乎能把整栋 Livehouse 的脉搏稳稳接住。',
      [
        { target: 'focus_progress_rate', operation: 'add', amount: 0.22 },
        { target: 'decision_energy_cost', operation: 'add', amount: -3 },
      ],
      'operations',
    ),
    trait(
      'marina_safe_harbor',
      '乐队姑娘们的安心港湾',
      '☼',
      'social',
      '不摆大人架子，总能用几句恰到好处的笑语把快散架的年轻乐队重新摁回练习室。',
      [
        { target: 'social_xp_rate', operation: 'add', amount: 0.18 },
        { target: 'decision_stress_relief', operation: 'add', amount: 2 },
      ],
      'social',
    ),
  ],
  'toyokawa-kiyoaki': [
    trait(
      'kiyoaki_faded_ruin',
      '失势后的颓唐与旧日残留',
      '◈',
      'character',
      '离开核心圈后沉溺酒气与回避，偶尔泛起的往日体面只衬得当下愈发仓促。',
      [
        { target: 'focus_progress_rate', operation: 'add', amount: -0.08 },
        { target: 'decision_stress_relief', operation: 'add', amount: 2 },
      ],
    ),
    trait(
      'kiyoaki_gilded_observer',
      '名门余晖下的旁观洞察',
      '✧',
      'social',
      '仍看得清东京老牌宅邸里人情冷暖的斤两，只是多数时候不愿再亲自开口。',
      [{ target: 'social_xp_rate', operation: 'add', amount: 0.12 }],
      'social',
    ),
  ],
  'toyokawa-sadaharu': [
    trait(
      'sadaharu_pruning_hand',
      '财团掌舵人的冷峻剪枝术',
      '⚖',
      'strategy',
      '习惯站在集团版图顶端做取舍，凡涉及家名与长远布局之事从无犹豫。',
      [{ target: 'focus_progress_rate', operation: 'add', amount: 0.24 }],
      'operations',
    ),
    trait(
      'sadaharu_patriarch_weight',
      '门庭规训与长辈威压',
      '⚑',
      'social',
      '一句话便能决定宴席坐次与资源流向，令人在获益的同时亦不敢越雷池一步。',
      [
        { target: 'social_xp_rate', operation: 'add', amount: 0.15 },
        { target: 'decision_stress_relief', operation: 'add', amount: -1 },
      ],
      'social',
    ),
    trait(
      'sadaharu_silent_hedge',
      '隔代不言明的庇护算计',
      '◈',
      'character',
      '看似冰冷严厉，暗地仍以家长式的逻辑权衡家族子嗣的去留。',
      [{ target: 'decision_energy_cost', operation: 'add', amount: -3 }],
    ),
  ],
  'toyokawa-mizuho': [
    trait(
      'mizuho_estate_etiquette',
      '老宅日常秩序的维系者',
      '✿',
      'craft',
      '在深宅长廊间将礼数、茶点与往来分寸维持得稳重妥帖，替外孙女挡开许多难堪问询。',
      [
        { target: 'focus_progress_rate', operation: 'add', amount: 0.14 },
        { target: 'decision_energy_cost', operation: 'add', amount: -3 },
      ],
      'operations',
    ),
    trait(
      'mizuho_quiet_grace',
      '未曾明说的外祖母柔肠',
      '☼',
      'social',
      '不在正厅高谈集团事务，却总能在廊下留给晚辈一处喘息余地。',
      [{ target: 'decision_stress_relief', operation: 'add', amount: 3 }],
      'social',
    ),
  ],
  fengjin: [
    trait(
      'fengjin_gentle_triage',
      '街角诊疗所的温和问诊',
      '✚',
      'craft',
      '总先倾听疲惫者的生活作息而非急着训诫，让紧绷了一整天的人走进门就先松下半口气。',
      [
        { target: 'decision_stress_relief', operation: 'add', amount: 4 },
        { target: 'decision_energy_cost', operation: 'add', amount: -2 },
      ],
      'social',
    ),
    trait(
      'fengjin_rhythm_anchor',
      '长线调理与作息锚定',
      '⚑',
      'strategy',
      '擅长把混乱的睡眠、饮食与压力账一笔笔梳理回正轨，避免无谓崩盘。',
      [{ target: 'focus_progress_rate', operation: 'add', amount: 0.15 }],
      'operations',
    ),
    trait(
      'fengjin_clinical_boundary',
      '分寸清明的医者守则',
      '⚖',
      'social',
      '温柔却不越界，恰到好处的专业距离让身边人更容易安心托付实话。',
      [{ target: 'social_xp_rate', operation: 'add', amount: 0.15 }],
      'social',
    ),
  ],
  'majo-hiro': [
    trait(
      'hiro_legal_gatekeeper',
      '法理秩序的冷冽守门人',
      '⚖',
      'strategy',
      '凡事优先追问证据、程序与职责边界，在混乱场面中最快立住行动框架。',
      [{ target: 'focus_progress_rate', operation: 'add', amount: 0.22 }],
      'operations',
    ),
    trait(
      'hiro_iron_self_discipline',
      '高压审慎与自我严律',
      '◈',
      'character',
      '用几近苛刻的纪律约束自己，绝不轻易放过模棱两可的借口。',
      [
        { target: 'decision_energy_cost', operation: 'add', amount: -3 },
        { target: 'decision_stress_relief', operation: 'add', amount: -1 },
      ],
    ),
    trait(
      'hiro_righteous_stand',
      '破冰后难得的正直担待',
      '⚑',
      'social',
      '一旦认定某件约定合法且公正，哪怕前路再险也会不惜名声去护住证人。',
      [{ target: 'social_xp_rate', operation: 'add', amount: 0.12 }],
      'social',
    ),
  ],
  'majo-anan': [
    trait(
      'anan_terse_notes',
      '宅邸深处的手写字条与默察',
      '✎',
      'craft',
      '懒得多费口舌解释，往往直接用精准到字句的短条把关键讯息拍到对方面前。',
      [
        { target: 'focus_progress_rate', operation: 'add', amount: 0.15 },
        { target: 'practice_skill_rate', operation: 'add', amount: 0.12 },
      ],
      'operations',
    ),
    trait(
      'anan_quiet_radius',
      '回避喧嚣的慢热防线',
      '◈',
      'character',
      '厌倦热闹寒暄，但只要站在她习惯的安全半径内，反倒会收到安静可靠的支援。',
      [
        { target: 'decision_stress_relief', operation: 'add', amount: 2 },
        { target: 'social_xp_rate', operation: 'add', amount: -0.05 },
      ],
    ),
  ],
  'majo-noa': [
    trait(
      'noa_absurd_palette',
      '荒诞色块里的街头直觉',
      '✦',
      'craft',
      '不按学院规范出牌，只凭当下一眼击中神经的色彩与韵脚挥笔，偏偏极具感染力。',
      [{ target: 'practice_skill_rate', operation: 'add', amount: 0.2 }],
      'music',
    ),
    trait(
      'noa_offbeat_warmth',
      '无差别亲近与奇妙步调',
      '☼',
      'social',
      '能对任何严肃氛围报以奇思妙想的一句搭话，意外撬开固执己见者的心防。',
      [
        { target: 'social_xp_rate', operation: 'add', amount: 0.18 },
        { target: 'decision_stress_relief', operation: 'add', amount: 2 },
      ],
      'social',
    ),
  ],
  'majo-leia': [
    trait(
      'leia_spotlight_command',
      '剧团首席的聚光灯统御',
      '✧',
      'social',
      '懂得如何用声线、身段与视线停顿牢牢抓住在场每一个人的注意。',
      [{ target: 'social_xp_rate', operation: 'add', amount: 0.24 }],
      'social',
    ),
    trait(
      'leia_show_must_go_on',
      '永不撤场的服务精神',
      '✦',
      'music',
      '即使台下观众各怀鬼胎，她也会稳稳把戏唱到最后一拍。',
      [
        { target: 'practice_skill_rate', operation: 'add', amount: 0.15 },
        { target: 'decision_energy_cost', operation: 'add', amount: -3 },
      ],
      'music',
    ),
    trait(
      'leia_velvet_appraisal',
      '优雅假面下的微凉审视',
      '◈',
      'strategy',
      '笑着捧场时早已把在座各人的利害关系记进心里。',
      [{ target: 'focus_progress_rate', operation: 'add', amount: 0.12 }],
      'operations',
    ),
  ],
  'majo-milia': [
    trait(
      'milia_elder_ease',
      '大姐姐式的柔缓周旋',
      '✿',
      'social',
      '从来不拿锋芒硬顶别人，总能把棘手的试探化进轻松的闲聊与照顾里。',
      [
        { target: 'social_xp_rate', operation: 'add', amount: 0.2 },
        { target: 'decision_stress_relief', operation: 'add', amount: 2 },
      ],
      'social',
    ),
    trait(
      'milia_unspoken_margin',
      '看透却不点破的余裕',
      '◈',
      'character',
      '经历过风暴后的她很懂得替同辈留余地，让队伍少走激烈冲突的消耗。',
      [{ target: 'focus_progress_rate', operation: 'add', amount: 0.12 }],
      'operations',
    ),
  ],
  'majo-margo': [
    trait(
      'margo_leverage_sense',
      '洞察弱点的言辞博弈手',
      '◈',
      'social',
      '两三句温和试探便能摸清对方最不愿被掀开的筹码。',
      [{ target: 'social_xp_rate', operation: 'add', amount: 0.22 }],
      'social',
    ),
    trait(
      'margo_contingency_web',
      '幕后风向预判与筹谋',
      '⚑',
      'strategy',
      '不急着在聚光灯前争抢，往往在他人动手之前已替同盟备好两套退路。',
      [
        { target: 'focus_progress_rate', operation: 'add', amount: 0.18 },
        { target: 'decision_energy_cost', operation: 'add', amount: -2 },
      ],
      'operations',
    ),
    trait(
      'margo_cool_skepticism',
      '玩味试探的距离感',
      '⚖',
      'character',
      '对盲目信任总是多留三分怀疑，靠近她需要拿出真正站得住脚的理由。',
      [{ target: 'decision_stress_relief', operation: 'add', amount: -1 }],
    ),
  ],
  'majo-nanoka': [
    trait(
      'nanoka_sentinel_eye',
      '独来独往的警觉观察者',
      '◈',
      'strategy',
      '总会提前一步记清出口、值守与人物动向，从不肯毫无防备地落进被动。',
      [{ target: 'focus_progress_rate', operation: 'add', amount: 0.18 }],
      'operations',
    ),
    trait(
      'nanoka_sheathed_oath',
      '锋刃藏鞘的姐妹牵挂',
      '⚑',
      'character',
      '表面冷淡戒备，内心却把守诺与护短看得分外沉重。',
      [
        { target: 'practice_skill_rate', operation: 'add', amount: 0.16 },
        { target: 'decision_energy_cost', operation: 'add', amount: -2 },
      ],
      'music',
    ),
  ],
  'majo-honoka': [
    trait(
      'honoka_quiet_lantern',
      '细碎日常里的微光照拂',
      '☼',
      'social',
      '会留意到别人忘记系好的袖扣或放凉的茶，使紧绷的氛围悄然缓和。',
      [
        { target: 'decision_stress_relief', operation: 'add', amount: 3 },
        { target: 'social_xp_rate', operation: 'add', amount: 0.16 },
      ],
      'social',
    ),
    trait(
      'honoka_steady_pacemaker',
      '不张扬的坚韧陪跑感',
      '✿',
      'character',
      '即使自身经历曲折，依旧稳稳站在重要之人触手可及的位置。',
      [{ target: 'decision_energy_cost', operation: 'add', amount: -3 }],
      'operations',
    ),
  ],
  'majo-arisa': [
    trait(
      'arisa_spark_drive',
      '一触即炸的护盾反应',
      '⚑',
      'character',
      '嘴硬心烦时说话像带刺，但那股憋不住的不甘反能逼出最狠的练习冲劲。',
      [
        { target: 'practice_skill_rate', operation: 'add', amount: 0.18 },
        { target: 'decision_stress_relief', operation: 'add', amount: -1 },
      ],
      'music',
    ),
    trait(
      'arisa_reluctant_backup',
      '口是心非的暗中照应',
      '◈',
      'social',
      '一边抱怨麻烦一边仍会把交代的事做到八九分稳妥。',
      [
        { target: 'focus_progress_rate', operation: 'add', amount: 0.12 },
        { target: 'decision_energy_cost', operation: 'add', amount: -2 },
      ],
      'operations',
    ),
  ],
  'majo-sherry': [
    trait(
      'sherry_dossier_deduction',
      '名侦探推演与卷宗拆解',
      '⚖',
      'strategy',
      '哪怕只剩下支离破碎的细节，也能凭条分缕析的推理拼出下一手线索。',
      [{ target: 'focus_progress_rate', operation: 'add', amount: 0.22 }],
      'operations',
    ),
    trait(
      'sherry_spark_partner',
      '奇想连发的活跃搭档',
      '✦',
      'social',
      '兴头上来便精力四溢，能让原本沉闷死寂的调查和排练重新转起来。',
      [{ target: 'social_xp_rate', operation: 'add', amount: 0.2 }],
      'social',
    ),
    trait(
      'sherry_defiant_laugh',
      '越过悲观的执拗笑声',
      '☼',
      'character',
      '不肯轻易被阴影吞没，用看似跳脱的顽强替同伴守住一口元气。',
      [{ target: 'decision_stress_relief', operation: 'add', amount: 2 }],
    ),
  ],
  'majo-hanna': [
    trait(
      'hanna_salon_decorum',
      '大小姐礼仪的完美表象',
      '✧',
      'social',
      '茶会寒暄、长幼尊卑与对外口径都能保持挑不出错处的端庄体面。',
      [
        { target: 'social_xp_rate', operation: 'add', amount: 0.18 },
        { target: 'focus_progress_rate', operation: 'add', amount: 0.1 },
      ],
      'social',
    ),
    trait(
      'hanna_proud_grit',
      '紧绷在骄傲里的倔强',
      '◈',
      'character',
      '一旦被戳中自尊，便会悄无声息地熬夜把体面补回来，绝不让人看轻。',
      [{ target: 'decision_energy_cost', operation: 'add', amount: -2 }],
      'operations',
    ),
  ],
  'majo-koko': [
    trait(
      'koko_stream_pacing',
      '直播视角与情绪渲染力',
      '✦',
      'social',
      '对镜头、节奏起伏和年轻人的喜怒极为敏锐，总能把普通琐事讲出抓人的弧光。',
      [
        { target: 'social_xp_rate', operation: 'add', amount: 0.22 },
        { target: 'practice_skill_rate', operation: 'add', amount: 0.1 },
      ],
      'social',
    ),
    trait(
      'koko_ambitious_climb',
      '不甘落后于众人的自驱心',
      '⚑',
      'strategy',
      '看着身边人闪光时不肯只当背景，总会迫使自己更快站上同一个舞台。',
      [{ target: 'focus_progress_rate', operation: 'add', amount: 0.14 }],
      'operations',
    ),
  ],
  'majo-meruru': [
    trait(
      'meruru_quiet_bandager',
      '轻声细语的伤口包扎师',
      '✚',
      'craft',
      '面对受惊或脱力的人从不大声喧哗，安静端来热饮与纱布就足够让人安定。',
      [{ target: 'decision_stress_relief', operation: 'add', amount: 4 }],
      'social',
    ),
    trait(
      'meruru_devoted_rear_guard',
      '隐入末座的虔诚随行者',
      '✿',
      'character',
      '习惯退在最不起眼的地方承担后勤与善后，很少主动索求赞许。',
      [{ target: 'decision_energy_cost', operation: 'add', amount: -3 }],
      'operations',
    ),
  ],
  'majo-yuki': [
    trait(
      'yuki_ash_archive',
      '超然旁观的灰烬记忆库',
      '◈',
      'strategy',
      '像站在时间风口之外的人，对局势走向、秘密渊源与人心裂隙总有一层沉静的先见。',
      [{ target: 'focus_progress_rate', operation: 'add', amount: 0.2 }],
      'operations',
    ),
    trait(
      'yuki_ember_warmth',
      '微冷却未彻底熄灭的余温',
      '✧',
      'character',
      '并不轻易靠近任何人，可若能穿过她与旧日之间的薄雾，便会看见极深沉的守护欲。',
      [
        { target: 'decision_stress_relief', operation: 'add', amount: 2 },
        { target: 'social_xp_rate', operation: 'add', amount: 0.1 },
      ],
      'social',
    ),
  ],
  'watanare-mai': [
    trait(
      'mai_star_dominion',
      '完美千金的舞台统治力',
      '✧',
      'social',
      '一举手一投足自带高光与资源，谈妥人际、借势和站台似乎轻而易举。',
      [{ target: 'social_xp_rate', operation: 'add', amount: 0.25 }],
      'social',
    ),
    trait(
      'mai_relentless_standard',
      '不宣于口的严苛自我要求',
      '⚑',
      'strategy',
      '身居聚光灯中心却从不在课业与造型上松懈，替团队把标准拉到最高。',
      [{ target: 'focus_progress_rate', operation: 'add', amount: 0.2 }],
      'operations',
    ),
    trait(
      'mai_single_minded_gaze',
      '偏执而炙热的独占视线',
      '◈',
      'character',
      '一旦认定重要之人或重要计划，便会毫不犹豫调动全部精力推向终点。',
      [
        { target: 'practice_skill_rate', operation: 'add', amount: 0.12 },
        { target: 'decision_energy_cost', operation: 'add', amount: -2 },
      ],
      'music',
    ),
  ],
  'watanare-ajisai': [
    trait(
      'ajisai_unguarded_halo',
      '毫无防备的柔和治愈气场',
      '☼',
      'social',
      '她一笑起来，哪怕最紧绷的自厌与戒心也会先融化掉一半。',
      [
        { target: 'decision_stress_relief', operation: 'add', amount: 4 },
        { target: 'social_xp_rate', operation: 'add', amount: 0.18 },
      ],
      'social',
    ),
    trait(
      'ajisai_eldest_patience',
      '长姐习惯的默默担待',
      '✿',
      'craft',
      '照顾两个弟弟练出的耐心让她极善体察疲惫者没说出口的需求。',
      [{ target: 'decision_energy_cost', operation: 'add', amount: -3 }],
      'operations',
    ),
    trait(
      'ajisai_self_effacing',
      '温柔背后偶尔压过头的委屈',
      '◈',
      'character',
      '总习惯把别人的难处摆在自己前面，需要有人替她留意那份过分的好心。',
      [{ target: 'focus_progress_rate', operation: 'add', amount: 0.1 }],
    ),
  ],
  'watanare-satsuki': [
    trait(
      'satsuki_razor_clarity',
      '字字见血的冷静推手',
      '⚖',
      'strategy',
      '对虚情假意从不给面子，却能在最迷茫时用一针见血的话替人剪除无效内耗。',
      [{ target: 'focus_progress_rate', operation: 'add', amount: 0.22 }],
      'operations',
    ),
    trait(
      'satsuki_classical_taste',
      '深藏古典素养的精准节制',
      '✎',
      'craft',
      '做事和读人都有极高审美基准，看重逻辑与真意而非表面热闹。',
      [{ target: 'practice_skill_rate', operation: 'add', amount: 0.18 }],
      'music',
    ),
    trait(
      'satsuki_backdoor_rescue',
      '嘴上毒辣的暗中救场人',
      '◈',
      'character',
      '看似拒绝参与闹剧，真到进退两难时偏偏还是她替关键人物留了一扇后门。',
      [
        { target: 'social_xp_rate', operation: 'add', amount: 0.08 },
        { target: 'decision_energy_cost', operation: 'add', amount: -3 },
      ],
      'social',
    ),
  ],
  'watanare-kaho': [
    trait(
      'kaho_cosplay_ops',
      'Cosplay 企划执行与造型巧思',
      '✦',
      'craft',
      '对服化道具、日程截稿与跨群组联络极为熟练，行动力极强。',
      [
        { target: 'focus_progress_rate', operation: 'add', amount: 0.15 },
        { target: 'decision_energy_cost', operation: 'add', amount: -3 },
      ],
      'operations',
    ),
    trait(
      'kaho_social_persona',
      '校园双面人设切换术',
      '✧',
      'social',
      '能在人来人往的班级小团体间游刃有余地周旋，又把真实热情藏进私下企划里。',
      [{ target: 'social_xp_rate', operation: 'add', amount: 0.2 }],
      'social',
    ),
  ],
  'watanare-haruna': [
    trait(
      'haruna_straight_drive',
      '初中生式的直率干劲',
      '☼',
      'character',
      '不弯弯绕绕地怀疑自己，有想法就立刻出门行动，连带着把周围人的迟疑也拽散几分。',
      [
        { target: 'practice_skill_rate', operation: 'add', amount: 0.14 },
        { target: 'decision_energy_cost', operation: 'add', amount: -3 },
      ],
      'music',
    ),
    trait(
      'haruna_common_sense',
      '替姐姐把关的接地气常识感',
      '✿',
      'social',
      '天生懂得什么时候该开一句玩笑泼冷水、什么时候该把跑偏的心事拉回饭桌旁。',
      [
        { target: 'decision_stress_relief', operation: 'add', amount: 3 },
        { target: 'social_xp_rate', operation: 'add', amount: 0.12 },
      ],
      'social',
    ),
  ],
  'watanare-miyoko': [
    trait(
      'miyoko_hearth_logistics',
      '烟火气息的家常后勤',
      '✿',
      'craft',
      '一顿热饭、及时晾干的校服与不过分追问的体谅，是家里最厚实的体力补给站。',
      [
        { target: 'decision_energy_cost', operation: 'add', amount: -4 },
        { target: 'decision_stress_relief', operation: 'add', amount: 3 },
      ],
      'operations',
    ),
    trait(
      'miyoko_knowing_smile',
      '看穿孩子逞强的大度微笑',
      '☼',
      'social',
      '从不拿虚荣成绩压迫家人，只要女儿肯回家吃饱睡稳就足够安心。',
      [{ target: 'social_xp_rate', operation: 'add', amount: 0.12 }],
      'social',
    ),
  ],
  'watanare-hiroki': [
    trait(
      'hiroki_dependable_neighbor',
      '不惹事也不推责的街坊稳健感',
      '⚑',
      'craft',
      '平常不显山露水，家中有需要跑腿修理或搭把手的事务时永远顶得住。',
      [
        { target: 'focus_progress_rate', operation: 'add', amount: 0.12 },
        { target: 'decision_energy_cost', operation: 'add', amount: -2 },
      ],
      'operations',
    ),
    trait(
      'hiroki_quiet_father',
      '护家却克制的父亲分寸',
      '✿',
      'social',
      '话不多，却会悄悄替忙碌的家人们把外围麻烦收拾干净。',
      [{ target: 'decision_stress_relief', operation: 'add', amount: 2 }],
    ),
  ],
  'watanare-kippei': [
    trait(
      'kippei_errand_ace',
      '小大人似的家里跑腿王',
      '☼',
      'craft',
      '对姐姐的口味和附近便利店折扣门儿清，替家中分担琐碎毫不扭捏。',
      [{ target: 'decision_energy_cost', operation: 'add', amount: -3 }],
      'operations',
    ),
    trait(
      'kippei_candid_kid',
      '无所顾忌的孩童直感',
      '✦',
      'character',
      '一眼说出大人们憋在嘴边的大实话，反倒化解许多别扭气氛。',
      [
        { target: 'decision_stress_relief', operation: 'add', amount: 2 },
        { target: 'social_xp_rate', operation: 'add', amount: 0.1 },
      ],
      'social',
    ),
  ],
  'watanare-koto-mother': [
    trait(
      'koto_mother_solitude',
      '冷肃自持的独门清寂',
      '◈',
      'character',
      '不惯阿谀奉承，独自打理日常的沉稳让人学会用最小情绪消耗办完手头事务。',
      [{ target: 'focus_progress_rate', operation: 'add', amount: 0.14 }],
      'operations',
    ),
    trait(
      'koto_mother_spare_room',
      '不言爱却留有余地的严切',
      '⚖',
      'social',
      '距离虽冷，却从不以虚妄期望绑架后辈的去留。',
      [
        { target: 'social_xp_rate', operation: 'add', amount: 0.1 },
        { target: 'decision_energy_cost', operation: 'add', amount: -2 },
      ],
      'social',
    ),
  ],
  'watanare-hitoe': [
    trait(
      'hitoe_tailor_patience',
      '手艺人指尖的裁剪与耐心',
      '✎',
      'craft',
      '把一寸布料、一根走线反复修正到刚好贴合身形，专注得仿佛能滤掉一切浮躁。',
      [{ target: 'practice_skill_rate', operation: 'add', amount: 0.18 }],
      'music',
    ),
    trait(
      'hitoe_deep_water_calm',
      '静水深流的陪伴哲学',
      '✿',
      'social',
      '说话温吞却极为诚恳，站在工作台旁便能给人从容踏实的节奏。',
      [{ target: 'decision_stress_relief', operation: 'add', amount: 3 }],
      'social',
    ),
  ],
  'watanare-rene': [
    trait(
      'rene_global_runway',
      '国际秀场与品牌视野',
      '✧',
      'social',
      '对高端审美、海外礼仪与公众期待了然于胸，能迅速把局面拔高一个量级。',
      [{ target: 'social_xp_rate', operation: 'add', amount: 0.22 }],
      'social',
    ),
    trait(
      'rene_executive_clarity',
      '名门秩序内的干练决断',
      '⚖',
      'strategy',
      '不溺爱也不畏缩，按明确边界与效率判断一切提案。',
      [{ target: 'focus_progress_rate', operation: 'add', amount: 0.18 }],
      'operations',
    ),
  ],
  'watanare-lucie': [
    trait(
      'lucie_concierge_precision',
      '礼宾台与外事分寸精熟',
      '⚖',
      'social',
      '长年随侍王冢家左右，任何突发状况都能被她整理成妥帖不乱的日程。',
      [
        { target: 'focus_progress_rate', operation: 'add', amount: 0.18 },
        { target: 'decision_energy_cost', operation: 'add', amount: -3 },
      ],
      'operations',
    ),
    trait(
      'lucie_seamless_steward',
      '不动声色的周全守护',
      '✧',
      'craft',
      '笑意始终克制，却总在重要之人开口前先把必需品放到案头。',
      [{ target: 'social_xp_rate', operation: 'add', amount: 0.15 }],
      'social',
    ),
  ],
  'watanare-seira': [
    trait(
      'seira_breezy_backbone',
      '中学同级生的飒爽主心骨',
      '⚑',
      'social',
      '不吃暗地排挤那一套，说话干脆利落，总能让怯场的朋友挺直一点脊背。',
      [{ target: 'social_xp_rate', operation: 'add', amount: 0.18 }],
      'social',
    ),
    trait(
      'seira_track_stamina',
      '运动社练就的耐力与仗义',
      '☼',
      'character',
      '不管跑腿、守门还是陪练都一口答应，不把抱怨挂在脸上。',
      [
        { target: 'decision_energy_cost', operation: 'add', amount: -3 },
        { target: 'practice_skill_rate', operation: 'add', amount: 0.1 },
      ],
      'operations',
    ),
  ],
  'watanare-youko': [
    trait(
      'youko_campus_grapevine',
      '高材生圈层内的信息枢纽',
      '✧',
      'social',
      '对芦之原学院的风向、老师口碑与社团内情几乎无所不知。',
      [{ target: 'social_xp_rate', operation: 'add', amount: 0.2 }],
      'social',
    ),
    trait(
      'youko_honor_poise',
      '克制有度的优等生体面',
      '⚖',
      'strategy',
      '善于在同学与师长两边都维持大方得体的均衡分寸。',
      [{ target: 'focus_progress_rate', operation: 'add', amount: 0.14 }],
      'operations',
    ),
  ],
  'watanare-michiru': [
    trait(
      'michiru_mood_spark',
      '班级气氛带动者',
      '☼',
      'social',
      '从小圈子邀约到课后逛街都能轻松起头，绝不让人独自尴尬。',
      [
        { target: 'social_xp_rate', operation: 'add', amount: 0.16 },
        { target: 'decision_stress_relief', operation: 'add', amount: 2 },
      ],
      'social',
    ),
    trait(
      'michiru_practical_snack',
      '务实贴心的普通人视角',
      '✿',
      'character',
      '不搞虚幻压力，总拿最实在的零食、贴纸和小道消息照顾伙伴心情。',
      [{ target: 'decision_energy_cost', operation: 'add', amount: -2 }],
      'operations',
    ),
  ],
  'watanare-himiko': [
    trait(
      'himiko_whimsical_lens',
      '天马行空的校园观察癖',
      '✎',
      'craft',
      '喜欢从稀奇古怪的切入点解构同学关系，总能给出意料之外的备选方案。',
      [{ target: 'focus_progress_rate', operation: 'add', amount: 0.14 }],
      'operations',
    ),
    trait(
      'himiko_deadpan_cushion',
      '不按常理的幽默缓震器',
      '✦',
      'character',
      '哪怕话题快冷掉，她突然甩出的一本正经歪理也能让现场破功一笑。',
      [{ target: 'decision_stress_relief', operation: 'add', amount: 3 }],
      'social',
    ),
  ],
  'watanare-suzuran': [
    trait(
      'suzuran_gentle_harmony',
      '温和不争的校园同窗缘',
      '✿',
      'social',
      '不挑刺、不拉帮结派，安安静静就能让团队多一分省心的凝聚力。',
      [
        { target: 'social_xp_rate', operation: 'add', amount: 0.15 },
        { target: 'decision_stress_relief', operation: 'add', amount: 2 },
      ],
      'social',
    ),
    trait(
      'suzuran_steady_notes',
      '稳扎稳打的课后协同',
      '✎',
      'craft',
      '轮到自己分内的笔记整理或杂务分派时从不拖延推诿。',
      [{ target: 'focus_progress_rate', operation: 'add', amount: 0.12 }],
      'operations',
    ),
  ],
  'watanare-chizuru': [
    trait(
      'chizuru_brisk_doer',
      '务实爽快的班级实干家',
      '⚑',
      'strategy',
      '不喜欢绕圈子空谈，搬器材、催进度、清点物件三两下就能拍板落定。',
      [
        { target: 'focus_progress_rate', operation: 'add', amount: 0.14 },
        { target: 'decision_energy_cost', operation: 'add', amount: -3 },
      ],
      'operations',
    ),
    trait(
      'chizuru_square_grit',
      '直脾气里的靠谱底色',
      '◈',
      'character',
      '说一不二，对偷懒划水从不买账，却也从不亏待认真做事的搭档。',
      [{ target: 'practice_skill_rate', operation: 'add', amount: 0.12 }],
      'music',
    ),
  ],
  'watanare-miki': [
    trait(
      'miki_roster_keeper',
      '稳重细致的值日与排班手',
      '⚖',
      'craft',
      '擅长盯住细碎节点不遗漏，让整个小团体少走返工冤枉路。',
      [
        { target: 'focus_progress_rate', operation: 'add', amount: 0.15 },
        { target: 'decision_energy_cost', operation: 'add', amount: -2 },
      ],
      'operations',
    ),
    trait(
      'miki_seat_confidant',
      '低调可靠的邻座倾听者',
      '✿',
      'social',
      '不喜欢站在最耀眼处出头，却是需要人托底时最稳的接应者。',
      [
        { target: 'social_xp_rate', operation: 'add', amount: 0.14 },
        { target: 'decision_stress_relief', operation: 'add', amount: 2 },
      ],
      'social',
    ),
  ],
});

export const PRESET_NPC_IDS: readonly string[] = Object.freeze(Object.keys(PRESET_NPC_TRAIT_CATALOG));

const ALIAS_TO_CANONICAL_ID: Readonly<Record<string, string>> = Object.freeze({
  'bang-makoto': 'nagasaki-mother',
  'circle-marina': 'bang-marina',
  'wata-mai': 'watanare-mai',
  'wata-ajisai': 'watanare-ajisai',
  '高松灯': 'bang-tomori',
  '千早爱音': 'bang-anon',
  '椎名立希': 'bang-taki',
  '要乐奈': 'bang-rana',
  '若叶睦': 'bang-mutsumi',
  '三角初华': 'bang-uika',
  '初华': 'bang-uika',
  '八幡海铃': 'bang-umiri',
  '祐天寺若麦': 'bang-nyamu',
  '长崎真琴': 'nagasaki-mother',
  '长崎夫人': 'nagasaki-mother',
  '月岛麻里奈': 'bang-marina',
  '丰川清告': 'toyokawa-kiyoaki',
  '丰川定治': 'toyokawa-sadaharu',
  '丰川瑞穗': 'toyokawa-mizuho',
  '风堇': 'fengjin',
  '二阶堂希罗': 'majo-hiro',
  '夏目安安': 'majo-anan',
  '城崎诺亚': 'majo-noa',
  '莲见蕾雅': 'majo-leia',
  '佐伯米莉亚': 'majo-milia',
  '宝生玛格': 'majo-margo',
  '黑部奈叶香': 'majo-nanoka',
  '黑部穗奈香': 'majo-honoka',
  '紫藤亚里沙': 'majo-arisa',
  '橘雪莉': 'majo-sherry',
  '远野汉娜': 'majo-hanna',
  '泽渡可可': 'majo-koko',
  '冰上梅露露': 'majo-meruru',
  '月代雪': 'majo-yuki',
  '王冢真唯': 'watanare-mai',
  '濑名紫阳花': 'watanare-ajisai',
  '琴纱月': 'watanare-satsuki',
  '小柳香穗': 'watanare-kaho',
  '甘织遥奈': 'watanare-haruna',
  '甘织美代子': 'watanare-miyoko',
  '濑名广树': 'watanare-hiroki',
  '濑名桔平': 'watanare-kippei',
  '琴之母': 'watanare-koto-mother',
  '花取单衣': 'watanare-hitoe',
  '王冢露涅': 'watanare-rene',
  '露西·勒费弗尔': 'watanare-lucie',
  '露西': 'watanare-lucie',
  '鬼瓦星来': 'watanare-seira',
  '照泽耀子': 'watanare-youko',
  '广崎美智留': 'watanare-michiru',
  '高田卑弥呼': 'watanare-himiko',
  '羽贺铃兰': 'watanare-suzuran',
  '龟崎千鹤': 'watanare-chizuru',
  '根本美纪': 'watanare-miki',
});

export type DynamicTraitBucket = 'music' | 'study' | 'commerce' | 'care' | 'active' | 'general';

export interface DynamicTraitPoolEntry {
  bucket: DynamicTraitBucket;
  trait: NpcTraitDefinition;
}

export const DYNAMIC_NPC_TRAIT_POOL: readonly DynamicTraitPoolEntry[] = Object.freeze([
  {
    bucket: 'music',
    trait: trait(
      'dyn_live_rhythm',
      '现场律动校准',
      '♪',
      'music',
      '对声部衔接与舞台收放分外敏感，一进排练室就能迅速对齐拍点。',
      [{ target: 'practice_skill_rate', operation: 'add', amount: 0.16 }],
      'music',
    ),
  },
  {
    bucket: 'music',
    trait: trait(
      'dyn_backstage_savvy',
      '后台设备通晓',
      '✦',
      'craft',
      '熟悉效果器连线、调音台借用与换场时间差，替排练省下反复试错的工夫。',
      [
        { target: 'focus_progress_rate', operation: 'add', amount: 0.12 },
        { target: 'decision_energy_cost', operation: 'add', amount: -2 },
      ],
      'operations',
    ),
  },
  {
    bucket: 'study',
    trait: trait(
      'dyn_notebook_order',
      '手账整理癖',
      '✎',
      'craft',
      '习惯把零碎行程、借书期限与笔记目录分成三色标好，减少无头绪内耗。',
      [{ target: 'focus_progress_rate', operation: 'add', amount: 0.14 }],
      'operations',
    ),
  },
  {
    bucket: 'study',
    trait: trait(
      'dyn_quiet_reading',
      '静室伏案耐性',
      '⚖',
      'character',
      '能在安静环境里连续专注许久，也容易带动同桌沉下心推进长线计划。',
      [
        { target: 'practice_skill_rate', operation: 'add', amount: 0.12 },
        { target: 'decision_stress_relief', operation: 'add', amount: 1 },
      ],
      'music',
    ),
  },
  {
    bucket: 'commerce',
    trait: trait(
      'dyn_rush_composure',
      '高峰时段抗压',
      '⚑',
      'strategy',
      '见惯忙乱柜台与突发缺货，哪怕日程挤作一团也能冷静拆清先后次序。',
      [
        { target: 'focus_progress_rate', operation: 'add', amount: 0.14 },
        { target: 'decision_energy_cost', operation: 'add', amount: -2 },
      ],
      'operations',
    ),
  },
  {
    bucket: 'commerce',
    trait: trait(
      'dyn_regulars_memory',
      '熟客偏好记忆',
      '✧',
      'social',
      '擅长从三言两语里记住对方的习惯与忌口，让往来交涉自然顺滑几分。',
      [{ target: 'social_xp_rate', operation: 'add', amount: 0.18 }],
      'social',
    ),
  },
  {
    bucket: 'care',
    trait: trait(
      'dyn_gentle_soothing',
      '轻声安抚专长',
      '✚',
      'social',
      '敏锐察觉旁人强撑出的礼貌，总能递出一杯热茶把话头放轻。',
      [
        { target: 'decision_stress_relief', operation: 'add', amount: 3 },
        { target: 'social_xp_rate', operation: 'add', amount: 0.12 },
      ],
      'social',
    ),
  },
  {
    bucket: 'care',
    trait: trait(
      'dyn_steady_provisions',
      '日常补给周全',
      '✿',
      'craft',
      '常备创可贴、纸巾与应急小零嘴，关键时刻总能减少额外的体力折损。',
      [{ target: 'decision_energy_cost', operation: 'add', amount: -3 }],
      'operations',
    ),
  },
  {
    bucket: 'active',
    trait: trait(
      'dyn_mobile_stamina',
      '长距离机动耐力',
      '☼',
      'character',
      '奔波两三个街区也不会叫苦，习惯用双脚和行动力把事一件件办落停。',
      [
        { target: 'decision_energy_cost', operation: 'add', amount: -3 },
        { target: 'practice_skill_rate', operation: 'add', amount: 0.1 },
      ],
      'operations',
    ),
  },
  {
    bucket: 'active',
    trait: trait(
      'dyn_quick_response',
      '快节奏响应力',
      '✦',
      'social',
      '遇到临时改期或场外呼应总能第一时间接话补位，很擅长稳住场面节奏。',
      [{ target: 'social_xp_rate', operation: 'add', amount: 0.16 }],
      'social',
    ),
  },
  {
    bucket: 'general',
    trait: trait(
      'dyn_pocket_memo',
      '随身备忘习惯',
      '✎',
      'craft',
      '总能记得顺手记下约定时间与小事细节，使日常安排少出岔子。',
      [{ target: 'focus_progress_rate', operation: 'add', amount: 0.12 }],
      'operations',
    ),
  },
  {
    bucket: 'general',
    trait: trait(
      'dyn_measured_tact',
      '稳健人情分寸',
      '⚖',
      'social',
      '说话懂得留三分余地，既不唐突探私，也能把必要意思传到位。',
      [{ target: 'social_xp_rate', operation: 'add', amount: 0.15 }],
      'social',
    ),
  },
  {
    bucket: 'general',
    trait: trait(
      'dyn_calm_bystander',
      '不慌不忙的倾听者',
      '✿',
      'character',
      '能在喧闹街区旁边保持平缓呼吸，让同席之人慢慢松下紧绷。',
      [{ target: 'decision_stress_relief', operation: 'add', amount: 2 }],
      'social',
    ),
  },
  {
    bucket: 'general',
    trait: trait(
      'dyn_improv_tempo',
      '合拍即兴搭档',
      '♪',
      'music',
      '习惯留意同伴的节拍与情绪起伏，哪怕临时配合也能尽快找准落点。',
      [{ target: 'practice_skill_rate', operation: 'add', amount: 0.14 }],
      'music',
    ),
  },
  {
    bucket: 'general',
    trait: trait(
      'dyn_errand_reliability',
      '琐事托底手',
      '◈',
      'strategy',
      '并不抢风头，但交到手边的联络与采购多半都能稳妥收尾。',
      [{ target: 'decision_energy_cost', operation: 'add', amount: -2 }],
      'operations',
    ),
  },
]);

function fnv1a(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function cleanKey(raw: string | null | undefined): string {
  return typeof raw === 'string' ? raw.trim() : '';
}

function ownerMusicPersonId(owner: ProtagonistId): string {
  return owner === 'emma' ? 'majo-emma' : owner === 'renako' ? 'watanare-renako' : `protagonist-${owner}`;
}

export function isPlayableProtagonistTarget(target: NpcTraitTarget): boolean {
  const candidates = [
    cleanKey(target.personId),
    cleanKey(target.sourcePersonId),
    cleanKey(target.id),
    cleanKey(target.name),
  ].filter(Boolean);
  return candidates.some(value => PLAYABLE_IDENTIFIERS.has(value));
}

export function canonicalNpcTraitPersonId(target: NpcTraitTarget): string | null {
  if (isPlayableProtagonistTarget(target)) return null;
  const candidates = [
    cleanKey(target.personId),
    cleanKey(target.sourcePersonId),
    cleanKey(target.id),
    cleanKey(target.name),
  ].filter(Boolean);
  for (const key of candidates) {
    if (Object.hasOwn(PRESET_NPC_TRAIT_CATALOG, key)) return key;
    if (Object.hasOwn(ALIAS_TO_CANONICAL_ID, key)) return ALIAS_TO_CANONICAL_ID[key]!;
  }
  return null;
}

export function isPresetNpcTarget(target: NpcTraitTarget): boolean {
  return canonicalNpcTraitPersonId(target) !== null;
}

const BUCKET_KEYWORDS: readonly { bucket: Exclude<DynamicTraitBucket, 'general'>; pattern: RegExp }[] = [
  { bucket: 'music', pattern: /乐队|吉他|贝斯|鼓手|键盘|主唱|作曲|编曲|合奏|演出|Live|LIVE|CiRCLE|RiNG|唱/i },
  { bucket: 'study', pattern: /学校|学院|大学|高中|初中|学生|同班|同学|文库|图书|读书|社团|月之森|羽丘|芦之原|花咲川|吹奏|美术/i },
  { bucket: 'commerce', pattern: /店长|店员|咖啡|蛋糕|烘焙|便利|商店|餐厅|前台|公司|社长|兼职|打工|经理/i },
  { bucket: 'care', pattern: /医|诊所|护士|药|保健|家人|母亲|父亲|邻居|茶道|心理|照顾/i },
  { bucket: 'active', pattern: /田径|运动|剑道|篮|足|网球|快递|跑|体育|巡逻|骑行/i },
];

/**
 * Resolve 1–3 canon-faithful traits for any named preset NPC, or deterministically
 * derive 2–3 fitting traits for dynamically introduced / custom NPCs.
 */
export function resolveNpcTraits(target: NpcTraitTarget): readonly NpcTraitDefinition[] {
  if (isPlayableProtagonistTarget(target)) return [];

  const canonical = canonicalNpcTraitPersonId(target);
  if (canonical && Object.hasOwn(PRESET_NPC_TRAIT_CATALOG, canonical)) {
    return PRESET_NPC_TRAIT_CATALOG[canonical]!;
  }

  const profileText = [
    target.tag,
    target.summary,
    target.status,
    target.gradeOrTitle,
    target.schoolOrAffiliation,
    target.anchorSpotDetail,
    ...(target.bioParagraphs ?? []),
  ].filter(Boolean).join(' ');

  const seedKey = cleanKey(target.sourcePersonId) || cleanKey(target.personId) || cleanKey(target.id) || cleanKey(target.name) || 'resident-npc';
  const hash = fnv1a(seedKey);
  const desiredCount = (hash % 3 === 0 ? 3 : 2);

  const matchedBuckets = BUCKET_KEYWORDS
    .filter(rule => rule.pattern.test(profileText))
    .map(rule => rule.bucket);

  const chosen: NpcTraitDefinition[] = [];
  const usedIds = new Set<string>();
  const pushFromPool = (pool: readonly DynamicTraitPoolEntry[], seedOffset: number) => {
    if (!pool.length || chosen.length >= desiredCount) return;
    const start = (hash + seedOffset) % pool.length;
    for (let i = 0; i < pool.length && chosen.length < desiredCount; i++) {
      const candidate = pool[(start + i) % pool.length]!.trait;
      if (!usedIds.has(candidate.id)) {
        usedIds.add(candidate.id);
        chosen.push(candidate);
        break;
      }
    }
  };

  for (let i = 0; i < matchedBuckets.length && chosen.length < 2; i++) {
    const bucketPool = DYNAMIC_NPC_TRAIT_POOL.filter(entry => entry.bucket === matchedBuckets[i]);
    pushFromPool(bucketPool, i * 31 + 7);
  }

  const fallbackPool = DYNAMIC_NPC_TRAIT_POOL.filter(entry => entry.bucket === 'general');
  let guard = 0;
  while (chosen.length < desiredCount && guard < 12) {
    pushFromPool(guard === 0 ? fallbackPool : DYNAMIC_NPC_TRAIT_POOL, guard * 17 + 13);
    guard++;
  }

  return Object.freeze(chosen.slice(0, 3));
}

function resolveContactForPerson(state: WorldState, personId: string): CharacterContact | undefined {
  return state.contacts?.find(row => row.sourcePersonId === personId || row.id === personId);
}

/**
 * Collect active advisor traits effective for `owner`:
 * valid only when `owner` belongs to the band AND the advisor `personId`
 * is still a member of that band. Deduplicated per advisor + trait across bands.
 */
export function activeBandAdvisorTraits(state: WorldState, owner: ProtagonistId): readonly ActiveAdvisorTraitEntry[] {
  const advisors = state.protagonists?.society?.advisors ?? [];
  const bands = state.livehouse?.bands ?? [];
  if (!advisors.length || !bands.length) return [];

  const ownerBandPerson = ownerMusicPersonId(owner);
  const bandById = new Map(bands.map(band => [band.id, band] as const));
  const seen = new Set<string>();
  const result: ActiveAdvisorTraitEntry[] = [];

  for (const advisor of advisors) {
    const band = bandById.get(advisor.bandId);
    if (!band) continue;
    const ownerInBand = band.members.some(member => member.personId === ownerBandPerson || member.personId === owner);
    if (!ownerInBand) continue;
    const member = band.members.find(item => item.personId === advisor.personId);
    if (!member) continue;
    const contact = resolveContactForPerson(state, advisor.personId);
    const target: NpcTraitTarget = {
      id: contact?.id ?? advisor.personId,
      personId: advisor.personId,
      sourcePersonId: contact?.sourcePersonId ?? advisor.personId,
      name: contact?.name ?? member.name,
      tag: contact?.tag,
      summary: contact?.summary,
      status: contact?.status,
    };
    const traits = resolveNpcTraits(target);
    for (const item of traits) {
      const dedupeKey = `${advisor.personId}:${item.id}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      result.push({
        personId: advisor.personId,
        personName: target.name ?? advisor.personId,
        bandId: band.id,
        bandName: band.name,
        seat: advisor.seat,
        trait: item,
      });
    }
  }

  return result;
}

export function advisorExternalModifiersByOwner(state: WorldState): ExternalStrategyModifiers {
  const out: Partial<Record<ProtagonistId, ExternalStrategyModifierSource[]>> = {};
  for (const owner of PROTAGONISTS) {
    const entries = activeBandAdvisorTraits(state, owner);
    if (!entries.length) continue;
    out[owner] = entries.flatMap(entry =>
      entry.trait.modifiers.map(modifier => ({
        source: `advisor:${entry.personId}:${entry.trait.id}`,
        modifier,
      })),
    );
  }
  return out;
}

export function npcSelfExternalModifiers(personId: string): ExternalStrategyModifierSource[] {
  const traits = PRESET_NPC_TRAIT_CATALOG[personId];
  if (!traits?.length) return [];
  return traits.flatMap(item =>
    item.modifiers.map(modifier => ({
      source: `trait:${item.id}`,
      modifier,
    })),
  );
}

export function strategyExternalModifiersByOwner(state: WorldState): ExternalStrategyModifiers {
  const out: ExternalStrategyModifiers = { ...advisorExternalModifiersByOwner(state) };
  for (const personId of PRESET_NPC_IDS) {
    const mods = npcSelfExternalModifiers(personId);
    if (mods.length) out[personId] = mods;
  }
  const factionMods = factionFocusExternalModifiersByOwner(state);
  for (const [owner, entries] of Object.entries(factionMods)) {
    if (!entries?.length) continue;
    out[owner] = [...(out[owner] ?? []), ...entries];
  }
  return out;
}

function applyModifierList(modifiers: readonly StrategyModifier[], target: ModifierTarget, initial: number): number {
  let adds = 0;
  let multiplier = 1;
  for (const modifier of modifiers) {
    if (modifier.target !== target) continue;
    if (modifier.operation === 'add') adds += modifier.amount;
    else multiplier *= modifier.amount;
  }
  return Math.max(0, Math.round((initial + adds) * multiplier * 100) / 100);
}

export function advisorModifierMultiplier(
  state: WorldState,
  owner: ProtagonistId,
  target: Exclude<ModifierTarget, 'focus_ai_weight' | 'decision_energy_cost' | 'decision_stress_relief'>,
  initial = 1,
): number {
  const entries = activeBandAdvisorTraits(state, owner);
  if (!entries.length) return initial;
  const modifiers = entries.flatMap(entry => entry.trait.modifiers);
  return applyModifierList(modifiers, target, initial);
}

export function advisorDecisionAdjustments(
  state: WorldState,
  owner: ProtagonistId,
  decision: { energyCost?: number; stressDelta?: number; instrumentDelta?: number },
): {
  energyCost: number;
  stressDelta: number;
  instrumentDelta: number;
  appliedAdvisorNames: string[];
} {
  const baseEnergy = decision.energyCost ?? 0;
  const baseStress = decision.stressDelta ?? 0;
  const baseInstrument = decision.instrumentDelta ?? 0;
  const entries = activeBandAdvisorTraits(state, owner);
  if (!entries.length) {
    return {
      energyCost: baseEnergy,
      stressDelta: baseStress,
      instrumentDelta: baseInstrument,
      appliedAdvisorNames: [],
    };
  }

  const modifiers = entries.flatMap(entry => entry.trait.modifiers);
  const energyCost = baseEnergy > 0
    ? Math.max(1, Math.round(applyModifierList(modifiers, 'decision_energy_cost', baseEnergy)))
    : 0;

  let stressDelta = baseStress;
  if (baseStress < 0) {
    const extraRelief = Math.min(10, Math.round(applyModifierList(modifiers, 'decision_stress_relief', 0)));
    stressDelta = baseStress - extraRelief;
  }

  const practiceRate = applyModifierList(modifiers, 'practice_skill_rate', 1);
  const instrumentDelta = baseInstrument > 0
    ? Math.max(1, Math.round(baseInstrument * practiceRate))
    : 0;

  const affectedTargets = new Set<ModifierTarget>();
  if (energyCost !== baseEnergy) affectedTargets.add('decision_energy_cost');
  if (stressDelta !== baseStress) affectedTargets.add('decision_stress_relief');
  if (instrumentDelta !== baseInstrument) affectedTargets.add('practice_skill_rate');

  const appliedAdvisorNames = [...new Set(
    entries
      .filter(entry => entry.trait.modifiers.some(mod => affectedTargets.has(mod.target)))
      .map(entry => entry.personName),
  )];

  return { energyCost, stressDelta, instrumentDelta, appliedAdvisorNames };
}

export function activeAdvisorPlacementsForPerson(
  state: WorldState,
  keys: readonly string[],
): readonly AdvisorPlacementInfo[] {
  const advisors = state.protagonists?.society?.advisors ?? [];
  const bands = state.livehouse?.bands ?? [];
  if (!advisors.length || !bands.length) return [];

  const canonicalSet = new Set<string>(keys.map(k => cleanKey(k)).filter(Boolean));
  for (const key of keys) {
    const canonical = canonicalNpcTraitPersonId({ id: key, personId: key, name: key });
    if (canonical) canonicalSet.add(canonical);
  }

  const bandById = new Map(bands.map(band => [band.id, band] as const));
  const out: AdvisorPlacementInfo[] = [];
  for (const advisor of advisors) {
    const advisorCanonical = canonicalNpcTraitPersonId({ id: advisor.personId, personId: advisor.personId });
    if (!canonicalSet.has(advisor.personId) && (!advisorCanonical || !canonicalSet.has(advisorCanonical))) continue;
    const band = bandById.get(advisor.bandId);
    if (!band || !band.members.some(member => member.personId === advisor.personId)) continue;
    out.push({
      bandId: band.id,
      bandName: band.name,
      seat: advisor.seat,
      seatLabel: ADVISOR_SEAT_LABELS[advisor.seat],
    });
  }
  return out;
}

export function formatNpcTraitModifiers(traitDef: NpcTraitDefinition): readonly string[] {
  return traitDef.modifiers.map(formatStrategyModifier);
}
