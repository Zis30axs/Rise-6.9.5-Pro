/** Presentation-only policy. Selecting a pose does not install artwork. */
import { resolveSakikoExpression, type SakikoExpression } from './sakiko-art-policy';

export const tomoriOutfit = 'uniform' as const;
export type TomoriOutfit = typeof tomoriOutfit;
export const tomoriPoses = Object.freeze([
  'neutral', 'smile', 'surprised', 'sad', 'shy',
] as const);
export type TomoriPose = typeof tomoriPoses[number];
export type TomoriSpriteId = `tomori_uniform_${TomoriPose}`;

/**
 * Runtime emotions use the six existing names. The hair-touch pose is
 * surprised and also troubled. The aside arm-hold covers sadness and
 * annoyance. The clasped shy smile stays available and does not replace a mood.
 * The smile pose keeps the stone.
 */
export const tomoriPoseForExpression: Readonly<Record<SakikoExpression, TomoriPose>> = Object.freeze({
  neutral: 'neutral',
  smile: 'smile',
  surprised: 'surprised',
  troubled: 'surprised',
  annoyed: 'sad',
  sad: 'sad',
});

const speakerNames = new Set([
  'tomori', 'takamatsu tomori', 'tomori takamatsu', 'takamatsu-tomori', 'bang-tomori',
  '高松灯', '灯', '燈', '高松燈',
]);
const text = (value: unknown): string => typeof value === 'string' ? value.trim().toLowerCase() : '';

export function isTomoriSpeaker(value: unknown): boolean {
  return speakerNames.has(text(value));
}

export function selectTomoriSprite(options: {
  speaker: unknown; expression: unknown;
}): { id: TomoriSpriteId; outfit: TomoriOutfit; expression: SakikoExpression; pose: TomoriPose } | null {
  if (!isTomoriSpeaker(options.speaker)) return null;
  const expression = resolveSakikoExpression(options.expression);
  const pose = tomoriPoseForExpression[expression];
  return { id: `tomori_uniform_${pose}`, outfit: tomoriOutfit, expression, pose };
}

export const tomoriSpriteIds: readonly TomoriSpriteId[] = Object.freeze(
  tomoriPoses.map(pose => `tomori_uniform_${pose}` as TomoriSpriteId),
);
