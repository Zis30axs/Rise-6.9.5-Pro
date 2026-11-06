/** Presentation-only policy. Selecting a pose does not install artwork. */
import { resolveSakikoExpression, type SakikoExpression } from './sakiko-art-policy';

export const nagasakiMotherOutfit = 'suit' as const;
export type NagasakiMotherOutfit = typeof nagasakiMotherOutfit;
export const nagasakiMotherPoses = Object.freeze([
  'neutral', 'smile', 'surprised', 'cheerful',
] as const);
export type NagasakiMotherPose = typeof nagasakiMotherPoses[number];
export type NagasakiMotherSpriteId = `nagasaki_mother_suit_${NagasakiMotherPose}`;

/**
 * Runtime emotions use the six existing names. The hand-on-hip pose is the
 * neutral default and also stands in for annoyance. The closed-mouth
 * cheek-touch is the smile. There is no separate sad or troubled drawing:
 * both reuse the blushing open-mouth pose, which is also surprised. The
 * raised-fist cheerful pose stays available and does not replace a mood.
 */
export const nagasakiMotherPoseForExpression: Readonly<Record<SakikoExpression, NagasakiMotherPose>> = Object.freeze({
  neutral: 'neutral',
  smile: 'smile',
  surprised: 'surprised',
  troubled: 'surprised',
  annoyed: 'neutral',
  sad: 'surprised',
});

const speakerNames = new Set([
  'nagasaki-mother', 'nagasaki mother',
  '长崎夫人', '素世的母亲', '素世妈妈', '长崎妈妈', '长崎母', '素世的妈妈', '素世母亲',
]);
const text = (value: unknown): string => typeof value === 'string' ? value.trim().toLowerCase() : '';

export function isNagasakiMotherSpeaker(value: unknown): boolean {
  return speakerNames.has(text(value));
}

export function selectNagasakiMotherSprite(options: {
  speaker: unknown; expression: unknown;
}): { id: NagasakiMotherSpriteId; outfit: NagasakiMotherOutfit; expression: SakikoExpression; pose: NagasakiMotherPose } | null {
  if (!isNagasakiMotherSpeaker(options.speaker)) return null;
  const expression = resolveSakikoExpression(options.expression);
  const pose = nagasakiMotherPoseForExpression[expression];
  return { id: `nagasaki_mother_suit_${pose}`, outfit: nagasakiMotherOutfit, expression, pose };
}

export const nagasakiMotherSpriteIds: readonly NagasakiMotherSpriteId[] = Object.freeze(
  nagasakiMotherPoses.map(pose => `nagasaki_mother_suit_${pose}` as NagasakiMotherSpriteId),
);
