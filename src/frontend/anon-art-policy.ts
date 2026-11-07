/** Presentation-only policy. Selecting a pose does not install artwork. */
import { resolveSakikoExpression, type SakikoExpression } from './sakiko-art-policy';

export const anonOutfit = 'uniform' as const;
export type AnonOutfit = typeof anonOutfit;
export const anonPoses = Object.freeze([
  'shy', 'smile', 'confident', 'wave', 'surprised', 'cheerful',
] as const);
export type AnonPose = typeof anonPoses[number];
export type AnonSpriteId = `anon_uniform_${AnonPose}`;

/**
 * Runtime emotions use the six existing names. She has no blank or sad face:
 * a calm line uses the gentle smile, an open smile uses the cheerful pose,
 * and both troubled and sad reuse the blushing clasped-hands pose.
 */
export const anonPoseForExpression: Readonly<Record<SakikoExpression, AnonPose>> = Object.freeze({
  neutral: 'smile',
  smile: 'cheerful',
  surprised: 'surprised',
  troubled: 'shy',
  annoyed: 'confident',
  sad: 'shy',
});

const speakerNames = new Set([
  'anon', 'chihaya anon', 'chihaya-anon', 'bang-anon',
  '千早爱音', '爱音', '愛音',
]);
const text = (value: unknown): string => typeof value === 'string' ? value.trim().toLowerCase() : '';

export function isAnonSpeaker(value: unknown): boolean {
  return speakerNames.has(text(value));
}

export function selectAnonSprite(options: {
  speaker: unknown; expression: unknown;
}): { id: AnonSpriteId; outfit: AnonOutfit; expression: SakikoExpression; pose: AnonPose } | null {
  if (!isAnonSpeaker(options.speaker)) return null;
  const expression = resolveSakikoExpression(options.expression);
  const pose = anonPoseForExpression[expression];
  return { id: `anon_uniform_${pose}`, outfit: anonOutfit, expression, pose };
}

export const anonSpriteIds: readonly AnonSpriteId[] = Object.freeze(
  anonPoses.map(pose => `anon_uniform_${pose}` as AnonSpriteId),
);
