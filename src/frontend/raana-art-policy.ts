/** Presentation-only policy. Selecting a pose does not install artwork. */
import { resolveSakikoExpression, type SakikoExpression } from './sakiko-art-policy';

export const raanaOutfit = 'uniform' as const;
export type RaanaOutfit = typeof raanaOutfit;
export const raanaPoses = Object.freeze([
  'neutral', 'smile', 'crossed', 'wave', 'hips',
] as const);
export type RaanaPose = typeof raanaPoses[number];
export type RaanaSpriteId = `raana_uniform_${RaanaPose}`;

/**
 * Runtime emotions use the six existing names. She has no separate surprised
 * or sad drawing: a startled line reuses the slightly open standing pose,
 * troubled and sad reuse the crossed-arms pout, and annoyed uses the
 * hands-on-hips pout. The wave stays available and does not replace a mood.
 */
export const raanaPoseForExpression: Readonly<Record<SakikoExpression, RaanaPose>> = Object.freeze({
  neutral: 'neutral',
  smile: 'smile',
  surprised: 'neutral',
  troubled: 'crossed',
  annoyed: 'hips',
  sad: 'crossed',
});

const speakerNames = new Set([
  'raana', 'rana', 'kaname raana', 'kaname rana', 'kaname-raana', 'kaname-rana',
  '要乐奈', '乐奈', '楽奈', '要楽奈', '樂奈',
]);
const text = (value: unknown): string => typeof value === 'string' ? value.trim().toLowerCase() : '';

export function isRaanaSpeaker(value: unknown): boolean {
  return speakerNames.has(text(value));
}

export function selectRaanaSprite(options: {
  speaker: unknown; expression: unknown;
}): { id: RaanaSpriteId; outfit: RaanaOutfit; expression: SakikoExpression; pose: RaanaPose } | null {
  if (!isRaanaSpeaker(options.speaker)) return null;
  const expression = resolveSakikoExpression(options.expression);
  const pose = raanaPoseForExpression[expression];
  return { id: `raana_uniform_${pose}`, outfit: raanaOutfit, expression, pose };
}

export const raanaSpriteIds: readonly RaanaSpriteId[] = Object.freeze(
  raanaPoses.map(pose => `raana_uniform_${pose}` as RaanaSpriteId),
);
