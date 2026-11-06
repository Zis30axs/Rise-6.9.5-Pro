/** Presentation-only policy. Selecting a pose does not install artwork. */
import { resolveSakikoExpression, type SakikoExpression } from './sakiko-art-policy';

export const takiOutfit = 'uniform' as const;
export type TakiOutfit = typeof takiOutfit;
export const takiPoses = Object.freeze([
  'neutral', 'crossed', 'drumsticks', 'embarrassed',
] as const);
export type TakiPose = typeof takiPoses[number];
export type TakiSpriteId = `taki_uniform_${TakiPose}`;

/**
 * Runtime emotions use the six existing names. The cool aside is neutral, the
 * drumstick pose is the smile, and crossed arms stand in for annoyance.
 * There is no separate sad or surprised drawing: both use the blushing
 * hands-on-cheeks pose, which also covers troubled.
 */
export const takiPoseForExpression: Readonly<Record<SakikoExpression, TakiPose>> = Object.freeze({
  neutral: 'neutral',
  smile: 'drumsticks',
  surprised: 'embarrassed',
  troubled: 'embarrassed',
  annoyed: 'crossed',
  sad: 'embarrassed',
});

const speakerNames = new Set([
  'taki', 'taki shiina', 'shiina taki', 'shiina-taki', 'bang-taki',
  '椎名立希', '立希', '椿名立希',
]);
const text = (value: unknown): string => typeof value === 'string' ? value.trim().toLowerCase() : '';

export function isTakiSpeaker(value: unknown): boolean {
  return speakerNames.has(text(value));
}

export function selectTakiSprite(options: {
  speaker: unknown; expression: unknown;
}): { id: TakiSpriteId; outfit: TakiOutfit; expression: SakikoExpression; pose: TakiPose } | null {
  if (!isTakiSpeaker(options.speaker)) return null;
  const expression = resolveSakikoExpression(options.expression);
  const pose = takiPoseForExpression[expression];
  return { id: `taki_uniform_${pose}`, outfit: takiOutfit, expression, pose };
}

export const takiSpriteIds: readonly TakiSpriteId[] = Object.freeze(
  takiPoses.map(pose => `taki_uniform_${pose}` as TakiSpriteId),
);
