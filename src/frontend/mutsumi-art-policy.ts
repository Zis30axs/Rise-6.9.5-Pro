/** Presentation-only policy. Selecting a pose does not install artwork. */
import { resolveSakikoExpression, type SakikoExpression } from './sakiko-art-policy';

export const mutsumiOutfit = 'uniform' as const;
export type MutsumiOutfit = typeof mutsumiOutfit;
export const mutsumiPoses = Object.freeze([
  'neutral', 'neutral_aside', 'neutral_aside_2', 'smile', 'shy', 'surprised',
] as const);
export type MutsumiPose = typeof mutsumiPoses[number];
export type MutsumiSpriteId = `mutsumi_uniform_${MutsumiPose}`;

/**
 * Runtime emotions use Sakiko's six names. Poses she was not drawn in reuse the
 * nearest uniform frame: uneasy faces use the cheek-hand pose, a flat look away
 * stands in for annoyance, and the second aside stands in for sadness.
 */
export const mutsumiPoseForExpression: Readonly<Record<SakikoExpression, MutsumiPose>> = Object.freeze({
  neutral: 'neutral',
  smile: 'smile',
  surprised: 'surprised',
  troubled: 'shy',
  annoyed: 'neutral_aside',
  sad: 'neutral_aside_2',
});

const speakerNames = new Set([
  'mutsumi', 'wakaba mutsumi', 'wakaba-mutsumi', 'bang-mutsumi',
  '若叶睦', '睦',
]);
const text = (value: unknown): string => typeof value === 'string' ? value.trim().toLowerCase() : '';

export function isMutsumiSpeaker(value: unknown): boolean {
  return speakerNames.has(text(value));
}

export function selectMutsumiSprite(options: {
  speaker: unknown; expression: unknown;
}): { id: MutsumiSpriteId; outfit: MutsumiOutfit; expression: SakikoExpression; pose: MutsumiPose } | null {
  if (!isMutsumiSpeaker(options.speaker)) return null;
  const expression = resolveSakikoExpression(options.expression);
  const pose = mutsumiPoseForExpression[expression];
  return { id: `mutsumi_uniform_${pose}`, outfit: mutsumiOutfit, expression, pose };
}

export const mutsumiSpriteIds: readonly MutsumiSpriteId[] = Object.freeze(
  mutsumiPoses.map(pose => `mutsumi_uniform_${pose}` as MutsumiSpriteId),
);
