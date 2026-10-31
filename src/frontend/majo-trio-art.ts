/** Presentation policy for the 2026-10-30 casual standing art. */
import { resolveSakikoExpression, type SakikoExpression } from './sakiko-art-policy';

export const majoTrioIds = Object.freeze(['majo-nanoka', 'majo-arisa', 'majo-milia'] as const);
export type MajoTrioId = typeof majoTrioIds[number];
export const majoTrioOutfit = 'casual' as const;
export const majoTrioPoses = Object.freeze(['neutral', 'smile', 'thinking'] as const);
export type MajoTrioPose = typeof majoTrioPoses[number];
export type MajoTrioSpriteId = `${'nanoka' | 'arisa' | 'milia'}_casual_${MajoTrioPose}`;

/**
 * Each person has three drawings. The six game expressions reuse the nearest one:
 * an open-eyed calm pose stands in for surprise and sadness, the laughing or
 * eyes-closed pose is the smile, and the chin / mask / lips pose covers both
 * troubled and annoyed.
 */
export const majoTrioPoseForExpression: Readonly<Record<SakikoExpression, MajoTrioPose>> = Object.freeze({
  neutral: 'neutral',
  smile: 'smile',
  surprised: 'neutral',
  sad: 'neutral',
  troubled: 'thinking',
  annoyed: 'thinking',
});

const shortId: Readonly<Record<MajoTrioId, 'nanoka' | 'arisa' | 'milia'>> = Object.freeze({
  'majo-nanoka': 'nanoka',
  'majo-arisa': 'arisa',
  'majo-milia': 'milia',
});

const speakerNames: Readonly<Record<string, MajoTrioId>> = Object.freeze({
  '黑部奈叶香': 'majo-nanoka', '奈叶香': 'majo-nanoka', 'nanoka': 'majo-nanoka', 'majo-nanoka': 'majo-nanoka',
  '紫藤亚里沙': 'majo-arisa', '亚里沙': 'majo-arisa', 'arisa': 'majo-arisa', 'majo-arisa': 'majo-arisa',
  '佐伯米莉亚': 'majo-milia', '米莉亚': 'majo-milia', 'milia': 'majo-milia', 'majo-milia': 'majo-milia',
});

const text = (value: unknown): string => typeof value === 'string' ? value.trim().toLowerCase() : '';

export function isMajoTrioPerson(personId: string): personId is MajoTrioId {
  return (majoTrioIds as readonly string[]).includes(personId);
}

export function resolveMajoTrioSpeaker(value: unknown): MajoTrioId | null {
  const name = text(value);
  return Object.prototype.hasOwnProperty.call(speakerNames, name) ? speakerNames[name] : null;
}

export function majoTrioPoseFor(expression: unknown): MajoTrioPose {
  return majoTrioPoseForExpression[resolveSakikoExpression(expression)];
}

export function selectMajoTrioSprite(options: {
  speaker: unknown; expression: unknown;
}): { id: MajoTrioSpriteId; personId: MajoTrioId; outfit: typeof majoTrioOutfit; expression: SakikoExpression; pose: MajoTrioPose } | null {
  const personId = resolveMajoTrioSpeaker(options.speaker);
  if (!personId) return null;
  const expression = resolveSakikoExpression(options.expression);
  const pose = majoTrioPoseForExpression[expression];
  return { id: `${shortId[personId]}_casual_${pose}`, personId, outfit: majoTrioOutfit, expression, pose };
}

/** 冰上梅露露 has five drawings. The six scene expressions each keep their own face, except calm and smile, which share the closed-eye smile because no calm face was supplied. */
export const majoMeruruId = 'majo-meruru' as const;
export const majoMeruruOutfit = 'nun' as const;
export const majoMeruruPoses = Object.freeze(['neutral', 'smile', 'troubled', 'surprised', 'annoyed', 'sad'] as const);
export type MajoMeruruPose = typeof majoMeruruPoses[number];
export type MajoMeruruSpriteId = `meruru_${typeof majoMeruruOutfit}_${MajoMeruruPose}`;

export const majoMeruruPoseForExpression: Readonly<Record<SakikoExpression, MajoMeruruPose>> = Object.freeze({
  neutral: 'neutral',
  smile: 'smile',
  troubled: 'troubled',
  surprised: 'surprised',
  annoyed: 'annoyed',
  sad: 'sad',
});

const meruruNames: Readonly<Record<string, true>> = Object.freeze({
  '冰上梅露露': true,
  '梅露露': true,
  'meruru': true,
  'majo-meruru': true,
  '\u6c37\u4e0a\u30e1\u30eb\u30eb': true,
  '\u30e1\u30eb\u30eb': true,
});

export function resolveMajoMeruruSpeaker(value: unknown): boolean {
  const name = text(value);
  return Object.prototype.hasOwnProperty.call(meruruNames, name);
}

export function majoMeruruPoseFor(expression: unknown): MajoMeruruPose {
  return majoMeruruPoseForExpression[resolveSakikoExpression(expression)];
}

export function selectMajoMeruruSprite(options: {
  speaker: unknown; expression: unknown;
}): { id: MajoMeruruSpriteId; personId: typeof majoMeruruId; outfit: typeof majoMeruruOutfit; expression: SakikoExpression; pose: MajoMeruruPose } | null {
  if (!resolveMajoMeruruSpeaker(options.speaker)) return null;
  const expression = resolveSakikoExpression(options.expression);
  const pose = majoMeruruPoseForExpression[expression];
  return { id: `meruru_${majoMeruruOutfit}_${pose}`, personId: majoMeruruId, outfit: majoMeruruOutfit, expression, pose };
}
