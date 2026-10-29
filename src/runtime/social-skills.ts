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
      if (latest.day < daily.day) throw new Error('社交能力最近记录日期无效');
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
    return { ...skill, xp, level, remaining: target === null ? 0 : target - xp,
      percent: target === null ? 100 : Math.round(100 * (xp - start) / (target - start)) };
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
