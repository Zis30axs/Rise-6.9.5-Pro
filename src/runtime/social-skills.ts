import type { StoryAction, WorldState } from '../frontend/types';
import { adjustEnergy } from './energy';
import { PROTAGONISTS, type ProtagonistId } from './dual-protagonists';

export const SOCIAL_SKILL_IDS = ['perception', 'empathy', 'expression', 'persuasion', 'organizing', 'mediation'] as const;
export type SocialSkillId = typeof SOCIAL_SKILL_IDS[number];
export type SocialDeviation = 0 | 1 | 2 | 3;

export const SOCIAL_SKILLS: readonly { id: SocialSkillId; label: string; description: string }[] = [
  { id: 'perception', label: '察言观色', description: '留意对方的语气、神情与言外之意。' },
  { id: 'empathy', label: '共情倾听', description: '耐心倾听，理解对方正在经历的感受。' },
  { id: 'expression', label: '坦诚表达', description: '说清自己的真实想法与情绪。' },
  { id: 'persuasion', label: '说服交涉', description: '在分歧中找到能够被接受的说法。' },
  { id: 'organizing', label: '活动组织', description: '协调邀约、时间和多人相处。' },
  { id: 'mediation', label: '冲突调解', description: '在争执与误会中寻找沟通的余地。' },
];

export const SKILL_STAGE_TITLES = ['初试啼声', '略显青涩', '游刃有余', '熟稔洞察', '炉火纯青'] as const;

export const SOCIAL_SKILL_DETAILS: Record<SocialSkillId, {
  tagline: string;
  themeColor: string;
  application: string;
  personalityTraits: Record<ProtagonistId, string>;
}> = {
  perception: {
    tagline: '捕捉言外之意与情绪微妙流转',
    themeColor: '#38bdf8',
    application: '在初次结识或微妙交谈中识别对方的情绪走向与真实意图，减少试探成本。',
    personalityTraits: {
      soyo: '【本能习惯】从小敏锐捕捉家庭与周遭氛围变化，习惯率先顾及他人情绪。',
      sakiko: '【审视洞察】快速评判他人的动机与价值，更注重目标效率而非情绪起伏。',
      emma: '【直觉敏锐】能深刻感知他人内心的痛苦与善意，但容易因外界紧张而内耗。',
      renako: '【雷达全开】作为常年紧绷的假现充，对周遭气氛与他人的眼神过于敏感。',
    },
  },
  empathy: {
    tagline: '倾听心事，给予真诚宽慰与陪伴',
    themeColor: '#a78bfa',
    application: '让倾诉者放下防线，在沉重心事或情绪低落时带来温暖，稳固深度羁绊。',
    personalityTraits: {
      soyo: '【体贴包容】善于作为温柔倾听者，但常因过度代入他人难过而暗自压抑。',
      sakiko: '【克制疏离】习惯收起共情，理智压倒感性，较少向他人展示温柔与脆弱。',
      emma: '【灵魂共鸣】拥有极为纯粹深沉的共情能力，能无条件接纳受伤的灵魂。',
      renako: '【感同身受】能深切理解落寞者与边缘人的心境，愿意真诚陪伴他人。',
    },
  },
  expression: {
    tagline: '跨越心防，清晰传递真实心声',
    themeColor: '#f43f5e',
    application: '说清内心的真实诉求与情感边界，打破猜忌与算计，建立真正坦率的关系。',
    personalityTraits: {
      soyo: '【沉重阻碍】不愿露出脆弱与算计，吐露真实心声对她而言是极大的心理考验。',
      sakiko: '【强硬直率】表达指令清晰坚定，但对自身的贫困与家庭伤痛筑有高高的心墙。',
      emma: '【真诚渴望】努力将心中的善意与坚持传达给同伴，但在高压场合略显拘谨。',
      renako: '【步步维艰】在现充面具与死宅本心间拉扯，每一次说真话都心跳加速。',
    },
  },
  persuasion: {
    tagline: '求同存异，在分歧中赢得认可',
    themeColor: '#f59e0b',
    application: '在观点分歧与诉求冲突中找到共赢方案，在商定安排与重要决策中获得支持。',
    personalityTraits: {
      soyo: '【委婉迂回】擅长用体贴周全的提议引导对方，面对强硬冲突时倾向退让。',
      sakiko: '【极具气场】拥有强大的号召力与雄辩能力，能清晰勾勒宏大愿景并打动同伴。',
      emma: '【以心换心】不擅长利益算计，倾向用真挚情感与共同信念去感召他人。',
      renako: '【勉力支撑】容易在强势对象面前妥协退缩，需要极大勇气才能坚持己见。',
    },
  },
  organizing: {
    tagline: '统筹多方，张罗行程与相聚时光',
    themeColor: '#10b981',
    application: '协调邀约时间、会面地点与多边关系，在聚会活动与日常相约中发挥枢纽作用。',
    personalityTraits: {
      soyo: '【从容自得】协调场地、准备茶歇与安排排练游刃有余，乐于成为凝聚大家的纽带。',
      sakiko: '【统帅全局】天生的组织核心，严密把控排练日程、人员分工与运作节奏。',
      emma: '【不擅繁琐】更喜欢安静专注的单独交流，面对复杂多边聚会容易耗尽精力。',
      renako: '【电量告急】张罗聚会对内向社恐是巨大消耗，事后需要长时间独处回血。',
    },
  },
  mediation: {
    tagline: '平息争端，化解误会与针锋相对',
    themeColor: '#6366f1',
    application: '化解剑拔弩张的紧张局面与误会隔阂，平息争吵，寻找彼此退让与理解的契机。',
    personalityTraits: {
      soyo: '【心力交瘁】极度害怕关系破裂，在尖锐对立面前容易感到无助与窒息。',
      sakiko: '【决断主导】习惯以效率和平息事态为先，不擅长安抚细腻微妙的情绪创伤。',
      emma: '【至关重要】在人际与纷争中坚守公允与谅解，拼尽全力化解隔阂。',
      renako: '【慌乱劝架】害怕气氛冰冷，会手忙脚乱地当和事佬，尽力维护大家的关系。',
    },
  },
};

export const SOCIAL_PERSONALITY: Readonly<Record<ProtagonistId, string>> = {
  soyo: 'ISFJ', sakiko: 'ENTJ', emma: 'INFP', renako: 'INFP',
};

// These are game design baselines, not personality diagnoses or permanent limits.
const LEVEL_XP = [0, 40, 110, 210, 350] as const;
const XP_CAP = 550;
const DAILY_XP_CAP = 24;
const INITIAL_LEVELS: Readonly<Record<ProtagonistId, readonly number[]>> = {
  soyo: [3, 3, 2, 2, 3, 2],
  sakiko: [2, 1, 2, 3, 4, 2],
  emma: [3, 4, 2, 2, 1, 3],
  renako: [2, 2, 1, 1, 1, 2],
};

export interface SocialSkillPerson {
  xp: Record<SocialSkillId, number>;
  daily: { day: number; earned: number };
  latest: { skillId: SocialSkillId; earned: number; energyCost: number; stressGain: number; day: number } | null;
}
export interface SocialSkillState {
  version: 1;
  people: Record<ProtagonistId, SocialSkillPerson>;
  /** Bounded assistant-turn receipts prevent replaying skill awards. */
  receipts: string[];
}

export function createSocialSkills(): SocialSkillState {
  const people = {} as Record<ProtagonistId, SocialSkillPerson>;
  for (const owner of PROTAGONISTS) {
    const xp = {} as Record<SocialSkillId, number>;
    SOCIAL_SKILL_IDS.forEach((skill, index) => { xp[skill] = LEVEL_XP[INITIAL_LEVELS[owner][index]! - 1]!; });
    people[owner] = { xp, daily: { day: 0, earned: 0 }, latest: null };
  }
  return { version: 1, people, receipts: [] };
}

function record(raw: unknown, keys: readonly string[], path: string): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) ||
    Object.keys(raw).length !== keys.length || Object.keys(raw).some(key => !keys.includes(key))) {
    throw new Error('社交能力存档无效：' + path);
  }
  return raw as Record<string, unknown>;
}
function integer(raw: unknown, min: number, max: number, path: string): number {
  if (!Number.isSafeInteger(raw) || (raw as number) < min || (raw as number) > max) throw new Error('社交能力存档无效：' + path);
  return raw as number;
}
export function parseSocialSkills(raw: unknown): SocialSkillState {
  const root = record(raw, ['version', 'people', 'receipts'], '根结构');
  if (root.version !== 1) throw new Error('社交能力存档版本无效');
  const peopleRaw = record(root.people, PROTAGONISTS, '主角列表');
  const people = {} as Record<ProtagonistId, SocialSkillPerson>;
  for (const owner of PROTAGONISTS) {
    const row = record(peopleRaw[owner], ['xp', 'daily', 'latest'], owner);
    const xpRaw = record(row.xp, SOCIAL_SKILL_IDS, owner + '.xp');
    const xp = {} as Record<SocialSkillId, number>;
    for (const id of SOCIAL_SKILL_IDS) xp[id] = integer(xpRaw[id], 0, XP_CAP, owner + '.' + id);
    const dailyRaw = record(row.daily, ['day', 'earned'], owner + '.daily');
    const daily = {
      day: integer(dailyRaw.day, 0, 365000, owner + '.day'),
      earned: integer(dailyRaw.earned, 0, DAILY_XP_CAP, owner + '.earned'),
    };
    let latest: SocialSkillPerson['latest'] = null;
    if (row.latest !== null) {
      const event = record(row.latest, ['skillId', 'earned', 'energyCost', 'stressGain', 'day'], owner + '.latest');
      if (!isSocialSkillId(event.skillId)) throw new Error('社交能力最近记录无效');
      latest = {
        skillId: event.skillId, earned: integer(event.earned, 0, 8, owner + '.latest.earned'),
        energyCost: integer(event.energyCost, 0, 5, owner + '.latest.energyCost'),
        stressGain: integer(event.stressGain, 0, 7, owner + '.latest.stressGain'),
        day: integer(event.day, 1, 365000, owner + '.latest.day'),
      };
      if (latest.day > daily.day) throw new Error('社交能力最近记录日期无效');
    }
    people[owner] = { xp, daily, latest };
  }
  if (!Array.isArray(root.receipts) || root.receipts.length > 96 ||
    root.receipts.some(id => typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(id)) ||
    new Set(root.receipts).size !== root.receipts.length) {
    throw new Error('社交能力结算回执无效');
  }
  return { version: 1, people, receipts: [...root.receipts] as string[] };
}

export function isSocialSkillId(raw: unknown): raw is SocialSkillId {
  return typeof raw === 'string' && (SOCIAL_SKILL_IDS as readonly string[]).includes(raw);
}
export function socialSkillLevel(xp: number): number {
  return LEVEL_XP.reduce((level, threshold, i) => xp >= threshold ? i + 1 : level, 1);
}
export function socialSkillOverview(state: WorldState, owner: ProtagonistId) {
  const person = (state.protagonists?.socialSkills ?? createSocialSkills()).people[owner];
  return SOCIAL_SKILLS.map(skill => {
    const xp = person.xp[skill.id];
    const level = socialSkillLevel(xp);
    const start = LEVEL_XP[level - 1]!;
    const target = level === 5 ? null : LEVEL_XP[level]!;
    const details = SOCIAL_SKILL_DETAILS[skill.id];
    const mitigation = Math.floor((level - 1) / 2);
    const nextMitigation = level < 5 ? Math.floor(level / 2) : mitigation;
    return {
      ...skill,
      xp,
      level,
      remaining: target === null ? 0 : target - xp,
      percent: target === null ? 100 : Math.round(100 * (xp - start) / (target - start)),
      stageTitle: SKILL_STAGE_TITLES[level - 1],
      tagline: details?.tagline ?? skill.description,
      themeColor: details?.themeColor ?? '#9c79a8',
      application: details?.application ?? '',
      trait: details?.personalityTraits[owner] ?? '',
      mitigation,
      nextMitigation,
    };
  });
}
export function socialSkillQuote(state: WorldState, owner: ProtagonistId, skillId: SocialSkillId, deviation: SocialDeviation) {
  const person = (state.protagonists?.socialSkills ?? createSocialSkills()).people[owner];
  const level = socialSkillLevel(person.xp[skillId]);
  const energyBase = [0, 1, 3, 5][deviation]!;
  const stressBase = [0, 1, 4, 7][deviation]!;
  const mitigation = Math.floor((level - 1) / 2);
  return {
    energyCost: Math.max(0, energyBase - mitigation),
    stressGain: Math.max(0, stressBase - mitigation),
    possibleXp: 4 + Math.min(2, deviation),
    positiveMultiplier: [1, 0.9, 0.75, 0.6][deviation]!,
  };
}

export function applySocialSkillTurn(state: WorldState, actions: readonly StoryAction[], turnId: string): WorldState {
  const awards = actions.filter((action): action is Extract<StoryAction, { type: 'social_skill' }> => action.type === 'social_skill');
  if (!awards.length) return state;
  if (awards.length !== 1 || !state.protagonists) throw new Error('社交能力结算需要一位当前主角和一项实际交流');
  const current = state.protagonists.socialSkills ?? createSocialSkills();
  if (current.receipts.includes(turnId)) return state;
  const next: WorldState = JSON.parse(JSON.stringify(state));
  const owner = next.protagonists!.accounts.active;
  const skillState = parseSocialSkills(current);
  const award = awards[0]!;
  const quote = socialSkillQuote(state, owner, award.skillId, award.deviation);
  const person = skillState.people[owner];
  const earnedToday = person.daily.day === next.clock.day ? person.daily.earned : 0;
  const gained = Math.max(0, Math.min(quote.possibleXp, DAILY_XP_CAP - earnedToday, XP_CAP - person.xp[award.skillId]));
  person.xp[award.skillId] += gained;
  person.daily = { day: next.clock.day, earned: earnedToday + gained };
  next.player.energy = adjustEnergy(next.player.energy, -quote.energyCost);
  next.player.stress = Math.min(100, next.player.stress + quote.stressGain);
  person.latest = { skillId: award.skillId, earned: gained, energyCost: quote.energyCost,
    stressGain: quote.stressGain, day: next.clock.day };
  skillState.receipts.push(turnId);
  skillState.receipts = skillState.receipts.slice(-96);
  next.protagonists!.socialSkills = skillState;
  return next;
}
