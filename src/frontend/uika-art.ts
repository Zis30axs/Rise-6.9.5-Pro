import uikaNeutral from '../../assets/downtown-art/characters/uika/casual/neutral.webp?inline';
import uikaReserved from '../../assets/downtown-art/characters/uika/casual/reserved.webp?inline';
import uikaConfident from '../../assets/downtown-art/characters/uika/casual/confident.webp?inline';
import uikaShy from '../../assets/downtown-art/characters/uika/casual/shy.webp?inline';
import uikaHappy from '../../assets/downtown-art/characters/uika/casual/happy.webp?inline';
import type { MajoExpressionPortrait } from './majo-art';
import { resolveNovelNpcEmotion, type NovelNpcEmotion } from './novel-npc-emotions';

export const UIKA_SPRITE_WIDTH = 768;
export const UIKA_SPRITE_HEIGHT = 1344;
export const UIKA_SPRITE_ANCHOR = [384, 1280] as const;

/** She has no other standing set. This casual outfit is the one shown for every line. */
export const uikaOutfit = 'casual' as const;
export const uikaPoses = Object.freeze(['neutral', 'reserved', 'confident', 'shy', 'happy'] as const);
export type UikaPose = (typeof uikaPoses)[number];

const poseSrc: Readonly<Record<UikaPose, string>> = Object.freeze({
  neutral: uikaNeutral,
  reserved: uikaReserved,
  confident: uikaConfident,
  shy: uikaShy,
  happy: uikaHappy,
});

/**
 * Nine story emotions, five supplied poses.
 * 平静 is the cap-and-pocket smile. 思考 is the reserved hold, and 安心 is the
 * at-ease hand-on-hip smile so that pose still appears on a real emotion tag.
 * 害羞 is the blush, 开心 is the open laugh. The rest fall back to the nearest.
 */
const poseForEmotion: Readonly<Record<NovelNpcEmotion, UikaPose>> = Object.freeze({
  neutral: 'neutral',
  serious: 'neutral',
  angry: 'neutral',
  thinking: 'reserved',
  relieved: 'confident',
  shy: 'shy',
  sad: 'shy',
  happy: 'happy',
  surprised: 'happy',
});

const exactEmotions = new Set<NovelNpcEmotion>(['neutral', 'thinking', 'relieved', 'shy', 'happy']);

/** Words the nine tags do not spell, still tied to a supplied pose. */
const directPoses: Readonly<Record<string, UikaPose>> = Object.freeze({
  温和: 'reserved',
  温和微笑: 'reserved',
  拘谨: 'reserved',
  自信: 'confident',
  开朗: 'confident',
  confident: 'confident',
  cheerful: 'confident',
});

const speakerAliases: Readonly<Record<string, string>> = Object.freeze({
  'bang-uika': 'bang-uika',
  uika: 'bang-uika',
  'misumi uika': 'bang-uika',
  doloris: 'bang-uika',
  '三角初华': 'bang-uika',
  '三角初華': 'bang-uika',
  '初华': 'bang-uika',
  '三角初音': 'bang-uika',
});

export function resolveUikaSpeaker(speaker: string): string | null {
  const name = speaker.trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(speakerAliases, name) ? speakerAliases[name]! : null;
}

export function isUikaSpeaker(speaker: string): boolean {
  return resolveUikaSpeaker(speaker) !== null;
}

export function uikaPoseFor(emotion: string): { pose: UikaPose; exact: boolean } {
  const raw = emotion.trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(directPoses, raw)) return { pose: directPoses[raw]!, exact: true };
  const resolved = resolveNovelNpcEmotion(emotion);
  return { pose: poseForEmotion[resolved], exact: exactEmotions.has(resolved) };
}

export function resolveUikaExpressionPortrait(speaker: string, emotion: string): (MajoExpressionPortrait & { pose: UikaPose }) | null {
  const personId = resolveUikaSpeaker(speaker);
  if (!personId) return null;
  const { pose, exact } = uikaPoseFor(emotion);
  return {
    personId,
    pose,
    src: poseSrc[pose],
    width: UIKA_SPRITE_WIDTH,
    height: UIKA_SPRITE_HEIGHT,
    exact,
  };
}
