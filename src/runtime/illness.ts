import type { PlayerState } from '../frontend/types';

export type IllnessType = 'cold' | 'gastro' | 'anxiety' | 'exhaustion';
export type IllnessSeverity = 'mild' | 'severe';

export interface IllnessDefinition {
  readonly id: IllnessType;
  readonly name: string;
  readonly shortName: string;
  readonly category: 'physical' | 'mental';
  readonly description: string;
  readonly severeDescription: string;
  readonly symptoms: readonly string[];
  readonly advice: string;
}

export const ILLNESS_DEFINITIONS: Readonly<Record<IllnessType, IllnessDefinition>> = Object.freeze({
  cold: {
    id: 'cold',
    name: '风寒感冒',
    shortName: '感冒',
    category: 'physical',
    description: '受凉或过度透支导致的上呼吸道感染，伴有畏寒发热与咽喉不适。',
    severeDescription: '重度发热感冒，头昏眼花、周身关节酸痛，体能严重受限。',
    symptoms: ['额头发烫', '畏寒轻咳', '体虚乏力'],
    advice: '建议长休睡眠、饮用热茶或服用感冒退热颗粒，避免吹风与剧烈劳作。',
  },
  gastro: {
    id: 'gastro',
    name: '胃痛与虚脱',
    shortName: '胃病',
    category: 'physical',
    description: '长期空腹或暴饮暴食诱发的急性胃肠不适与低血糖虚脱。',
    severeDescription: '急性肠胃痉挛与重度低血糖，伴随冷汗眩晕，胃部阵阵抽痛。',
    symptoms: ['胃部隐痛', '反酸恶心', '低血糖头晕'],
    advice: '尽快补充温热清淡食物、服用健胃整肠片，避免空腹吸烟或剧烈运动。',
  },
  anxiety: {
    id: 'anxiety',
    name: '神经衰弱',
    shortName: '衰弱',
    category: 'mental',
    description: '长期精神高压与心力交瘁引起的神经衰弱综合征，常伴失眠焦虑。',
    severeDescription: '重度焦虑过载与精神虚脱，情绪处于崩溃边缘，失眠多梦早醒。',
    symptoms: ['胸闷心悸', '失眠多梦', '精神紧绷焦虑'],
    advice: '前往公园或河岸散步、在咖啡馆小坐放松、服用安神滴剂，或找朋友倾听倾诉。',
  },
  exhaustion: {
    id: 'exhaustion',
    name: '重度疲劳综合征',
    shortName: '虚脱',
    category: 'physical',
    description: '精力彻底枯竭且健康偏低，身体机能进入强行休眠保护状态。',
    severeDescription: '极度躯体虚脱，四肢沉重如铅，站立困难，免疫力跌至谷底。',
    symptoms: ['四肢沉重', '视线模糊', '动作迟缓'],
    advice: '立即卧床长休，补充复合滋养饮或营养便当，严禁再接高强度班次。',
  },
});

export interface ActiveIllness {
  readonly id: IllnessType;
  readonly name: string;
  readonly category: 'physical' | 'mental';
  readonly severity: IllnessSeverity;
  readonly severityLabel: string;
  readonly description: string;
  readonly symptoms: readonly string[];
  readonly advice: string;
  readonly remedyHint: string;
}

/**
 * Deterministic illness diagnosis based directly on the player's core status variables.
 * Health, energy, satiety, foodEnergy, stress, and morale all directly govern onset and recovery.
 */
export function diagnosePlayerIllnesses(player: Pick<PlayerState, 'health' | 'stress' | 'energy' | 'satiety' | 'foodEnergy' | 'morale'>): readonly ActiveIllness[] {
  const result: ActiveIllness[] = [];

  // 1. 风寒感冒: 免疫力与健康低下（< 40）
  if (player.health < 40) {
    const severe = player.health < 25 || player.energy < 20;
    const def = ILLNESS_DEFINITIONS.cold;
    result.push({
      id: 'cold',
      name: def.name,
      category: def.category,
      severity: severe ? 'severe' : 'mild',
      severityLabel: severe ? '急性重症' : '轻度受寒',
      description: severe ? def.severeDescription : def.description,
      symptoms: def.symptoms,
      advice: def.advice,
      remedyHint: def.advice,
    });
  }

  // 2. 胃痛与虚脱: 严重饥饿（饱腹 <= 15 且食物能量 <= 150）
  if (player.satiety <= 15 && player.foodEnergy <= 150) {
    const severe = player.satiety <= 5 && player.foodEnergy <= 50;
    const def = ILLNESS_DEFINITIONS.gastro;
    result.push({
      id: 'gastro',
      name: def.name,
      category: def.category,
      severity: severe ? 'severe' : 'mild',
      severityLabel: severe ? '急性发作' : '轻度隐痛',
      description: severe ? def.severeDescription : def.description,
      symptoms: def.symptoms,
      advice: def.advice,
      remedyHint: def.advice,
    });
  }

  // 3. 神经衰弱: 长期高压（>= 75）且精神崩溃（<= 35）
  if (player.stress >= 75 && player.morale <= 35) {
    const severe = player.stress >= 90 || player.morale <= 15;
    const def = ILLNESS_DEFINITIONS.anxiety;
    result.push({
      id: 'anxiety',
      name: def.name,
      category: def.category,
      severity: severe ? 'severe' : 'mild',
      severityLabel: severe ? '急性过载' : '持续紧绷',
      description: severe ? def.severeDescription : def.description,
      symptoms: def.symptoms,
      advice: def.advice,
      remedyHint: def.advice,
    });
  }

  // 4. 重度疲劳综合征: 精力极度枯竭（<= 5）且健康受损（< 35）
  if (player.energy <= 5 && player.health < 35) {
    const severe = player.energy === 0 && player.health < 25;
    const def = ILLNESS_DEFINITIONS.exhaustion;
    result.push({
      id: 'exhaustion',
      name: def.name,
      category: def.category,
      severity: severe ? 'severe' : 'mild',
      severityLabel: severe ? '严重透支' : '深度疲惫',
      description: severe ? def.severeDescription : def.description,
      symptoms: def.symptoms,
      advice: def.advice,
      remedyHint: def.advice,
    });
  }

  return Object.freeze(result);
}

export function isPlayerIll(player: Pick<PlayerState, 'health' | 'stress' | 'energy' | 'satiety' | 'foodEnergy' | 'morale'>): boolean {
  return diagnosePlayerIllnesses(player).length > 0;
}

export interface IllnessDebuff {
  readonly travelEnergyMultiplier: number;
  readonly bedRestEnergyMultiplier: number;
  readonly prohibitHeavyLabor: boolean;
  readonly preventHeavyLabor: boolean;
  readonly heavyLaborReason?: string;
  readonly sicknessSummary: string;
}

/**
 * Compute active gameplay debuffs and restrictions induced by current illnesses.
 */
export function getIllnessDebuffs(player: Pick<PlayerState, 'health' | 'stress' | 'energy' | 'satiety' | 'foodEnergy' | 'morale'>): IllnessDebuff {
  const illnesses = diagnosePlayerIllnesses(player);
  if (!illnesses.length) {
    return {
      travelEnergyMultiplier: 1.0,
      bedRestEnergyMultiplier: 1.0,
      prohibitHeavyLabor: false,
      preventHeavyLabor: false,
      sicknessSummary: '健康无异常',
    };
  }

  let travelMultiplier = 1.0;
  let bedRestMultiplier = 1.0;
  let prohibitHeavyLabor = false;
  let heavyLaborReason: string | undefined;

  for (const ill of illnesses) {
    if (ill.id === 'cold') {
      travelMultiplier += ill.severity === 'severe' ? 0.35 : 0.2;
      prohibitHeavyLabor = true;
      heavyLaborReason = `患有${ill.name}（${ill.severityLabel}），畏寒高热，无法承担重体力劳动。`;
    }
    if (ill.id === 'gastro') {
      travelMultiplier += ill.severity === 'severe' ? 0.25 : 0.15;
    }
    if (ill.id === 'anxiety') {
      bedRestMultiplier *= ill.severity === 'severe' ? 0.5 : 0.75;
    }
    if (ill.id === 'exhaustion') {
      travelMultiplier += 0.5;
      prohibitHeavyLabor = true;
      heavyLaborReason = `处于${ill.name}状态，精力彻底枯竭，必须先休息调理。`;
    }
  }

  const names = illnesses.map(i => `${i.name}（${i.severityLabel}）`).join('、');
  return {
    travelEnergyMultiplier: Math.round(travelMultiplier * 100) / 100,
    bedRestEnergyMultiplier: Math.round(bedRestMultiplier * 100) / 100,
    prohibitHeavyLabor,
    preventHeavyLabor: prohibitHeavyLabor,
    heavyLaborReason,
    sicknessSummary: `身体异常：${names}`,
  };
}

/**
 * Detect changes in illness condition between two player states and generate natural in-world notes.
 */
export function detectIllnessTransition(beforePlayer: PlayerState, afterPlayer: PlayerState): {
  newIllnesses: readonly ActiveIllness[];
  curedIllnesses: readonly IllnessType[];
  transitionNote?: string;
} {
  const beforeIll = diagnosePlayerIllnesses(beforePlayer);
  const afterIll = diagnosePlayerIllnesses(afterPlayer);

  const beforeIds = new Set(beforeIll.map(i => i.id));
  const afterIds = new Set(afterIll.map(i => i.id));

  const newIllnesses = afterIll.filter(i => !beforeIds.has(i.id));
  const curedIllnesses = [...beforeIds].filter(id => !afterIds.has(id));

  const notes: string[] = [];
  if (newIllnesses.length) {
    notes.push(`身体异常：${newIllnesses.map(i => `${i.name}（${i.severityLabel}，${i.symptoms[0]}）`).join('；')}。`);
  }
  if (curedIllnesses.length) {
    const curedNames = curedIllnesses.map(id => ILLNESS_DEFINITIONS[id].name).join('、');
    notes.push(`身体好转：${curedNames}的症状已完全消退。`);
  }

  return {
    newIllnesses,
    curedIllnesses,
    transitionNote: notes.length ? notes.join(' ') : undefined,
  };
}

/**
 * Provide a natural physical/mental status summary for novel dialogue / LLM narrative prompt.
 */
export function formatIllnessStoryContext(player: Pick<PlayerState, 'health' | 'stress' | 'energy' | 'satiety' | 'foodEnergy' | 'morale'>): string | null {
  const illnesses = diagnosePlayerIllnesses(player);
  if (!illnesses.length) return null;
  const descriptions = illnesses.map(i => `${i.name}（${i.symptoms.slice(0, 2).join('、')}）`).join('、');
  return `【当前身体状态：染有${descriptions}，行动与反应略显迟钝，面带倦容病态】`;
}
