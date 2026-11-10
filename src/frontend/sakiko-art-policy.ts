/** Presentation-only policy. This module does not imply that artwork is installed. */
export const sakikoOutfits = Object.freeze(['casual', 'home'] as const);
export const sakikoExpressions = Object.freeze(['neutral', 'smile', 'troubled', 'surprised', 'annoyed', 'sad'] as const);
export type SakikoOutfit = typeof sakikoOutfits[number];
export type SakikoExpression = typeof sakikoExpressions[number];
export type SakikoOutfitMode = SakikoOutfit | 'auto';
export type SakikoSpriteId = `sakiko_${SakikoOutfit}_${SakikoExpression}`;

const expressions: Readonly<Record<string, SakikoExpression>> = Object.freeze({
  neutral: 'neutral', smile: 'smile', happy: 'smile', relieved: 'smile',
  troubled: 'troubled', shy: 'troubled', thinking: 'troubled',
  surprised: 'surprised', annoyed: 'annoyed', angry: 'annoyed', serious: 'neutral', sad: 'sad',
  '\u4e2d\u6027': 'neutral', '\u5e73\u9759': 'neutral', '\u4e25\u8083': 'neutral',
  '\u6d45\u7b11': 'smile', '\u5fae\u7b11': 'smile', '\u5f00\u5fc3': 'smile', '\u5b89\u5fc3': 'smile',
  '\u56f0\u6270': 'troubled', '\u8fdf\u7591': 'troubled', '\u5bb3\u7f9e': 'troubled', '\u601d\u8003': 'troubled',
  '\u60ca\u8bb6': 'surprised', '\u4e0d\u60a6': 'annoyed', '\u751f\u6c14': 'annoyed',
  '\u4f4e\u843d': 'sad', '\u60b2\u4f24': 'sad', '\u96be\u8fc7': 'sad',
});
const speakerNames = new Set([
  'sakiko', 'toyokawa-sakiko', 'toyokawa sakiko', 'sakiko toyokawa', 'oblivionis',
  '\u4e30\u5ddd\u7965\u5b50', '\u8c4a\u5ddd\u7965\u5b50', '\u7965\u5b50',
]);
const text = (value: unknown): string => typeof value === 'string' ? value.trim().toLowerCase() : '';

export function isSakikoSpeaker(value: unknown): boolean {
  return speakerNames.has(text(value));
}
export function resolveSakikoExpression(value: unknown): SakikoExpression {
  const key = text(value);
  return Object.hasOwn(expressions, key) ? expressions[key] ?? 'neutral' : 'neutral';
}
/** Explicit selection wins. An unknown mode cannot create an arbitrary file path. */
export function resolveSakikoOutfit(mode: unknown, locationId: unknown): SakikoOutfit {
  if (mode === 'casual' || mode === 'home') return mode;
  // Toyokawa interiors and Kiyoaki's house are both home for Sakiko: the mansion is
  // her residence, Kiyoaki's apartment is her second home where she may stay overnight.
  return locationId === 'toyokawa-house' || locationId === 'toyokawa-salon' || locationId === 'kiyoaki-house' ? 'home' : 'casual';
}
export function selectSakikoSprite(options: {
  speaker: unknown; expression: unknown; locationId?: unknown; outfit?: unknown;
}): { id: SakikoSpriteId; outfit: SakikoOutfit; expression: SakikoExpression } | null {
  if (!isSakikoSpeaker(options.speaker)) return null;
  const outfit = resolveSakikoOutfit(options.outfit, options.locationId);
  const expression = resolveSakikoExpression(options.expression);
  return { id: `sakiko_${outfit}_${expression}`, outfit, expression };
}
export const sakikoSpriteIds: readonly SakikoSpriteId[] = Object.freeze(
  sakikoOutfits.flatMap(outfit => sakikoExpressions.map(expression => `sakiko_${outfit}_${expression}` as SakikoSpriteId)),
);
export const downtownBackgroundIds = Object.freeze([
  'toyokawa_mansion_day', 'toyokawa_mansion_dusk', 'toyokawa_mansion_night',
  'toyokawa_living_room', 'downtown_day', 'downtown_night',
] as const);
