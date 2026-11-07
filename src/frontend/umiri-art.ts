import umiriNeutral from '../../assets/downtown-art/characters/umiri/casual/neutral.webp?inline';
import umiriAside from '../../assets/downtown-art/characters/umiri/casual/aside.webp?inline';
import umiriSmile from '../../assets/downtown-art/characters/umiri/casual/smile.webp?inline';
import umiriSerious from '../../assets/downtown-art/characters/umiri/casual/serious.webp?inline';
import umiriHappy from '../../assets/downtown-art/characters/umiri/casual/happy.webp?inline';
import type { MajoExpressionPortrait } from './majo-art';
import { resolveNovelNpcEmotion, type NovelNpcEmotion } from './novel-npc-emotions';

export const UMIRI_SPRITE_WIDTH = 768;
export const UMIRI_SPRITE_HEIGHT = 1344;
export const UMIRI_SPRITE_ANCHOR = [384, 1280] as const;

/** She has no other standing set. This casual outfit is the one shown for every line. */
export const umiriOutfit = 'casual' as const;
export const umiriPoses = Object.freeze(['neutral', 'aside', 'smile', 'serious', 'happy'] as const);
export type UmiriPose = (typeof umiriPoses)[number];

const poseSrc: Readonly<Record<UmiriPose, string>> = Object.freeze({
  neutral: umiriNeutral,
  aside: umiriAside,
  smile: umiriSmile,
  serious: umiriSerious,
  happy: umiriHappy,
});

/**
 * Nine story emotions, five supplied poses.
 * 平静 is the flat stance. 开心 is the peace sign. 思考 is the pocketed glance.
 * 安心 is the hand-at-chin smile. 严肃 and 生气 share the crossed arms.
 * 害羞 falls back to the smile, 惊讶 to the flat stance, 难过 to the crossed arms.
 */
const poseForEmotion: Readonly<Record<NovelNpcEmotion, UmiriPose>> = Object.freeze({
  neutral: 'neutral',
  happy: 'happy',
  sad: 'serious',
  angry: 'serious',
  surprised: 'neutral',
  shy: 'smile',
  thinking: 'aside',
  serious: 'serious',
  relieved: 'smile',
});

const exactEmotions = new Set<NovelNpcEmotion>(['neutral', 'happy', 'thinking', 'serious', 'angry', 'relieved']);

/** Words the nine tags do not spell, still tied to a supplied pose. */
const directPoses: Readonly<Record<string, UmiriPose>> = Object.freeze({
  开朗: 'happy',
  cheerful: 'happy',
  冷静: 'aside',
  移开视线: 'aside',
  微笑: 'smile',
  smile: 'smile',
  不满: 'serious',
  默认: 'neutral',
});

const speakerAliases: Readonly<Record<string, string>> = Object.freeze({
  'bang-umiri': 'bang-umiri',
  umiri: 'bang-umiri',
  'yahata umiri': 'bang-umiri',
  timoris: 'bang-umiri',
  '八幡海铃': 'bang-umiri',
  '海铃': 'bang-umiri',
});

export function resolveUmiriSpeaker(speaker: string): string | null {
  const name = speaker.trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(speakerAliases, name) ? speakerAliases[name]! : null;
}

export function isUmiriSpeaker(speaker: string): boolean {
  return resolveUmiriSpeaker(speaker) !== null;
}

export function umiriPoseFor(emotion: string): { pose: UmiriPose; exact: boolean } {
  const raw = emotion.trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(directPoses, raw)) return { pose: directPoses[raw]!, exact: true };
  const resolved = resolveNovelNpcEmotion(emotion);
  return { pose: poseForEmotion[resolved], exact: exactEmotions.has(resolved) };
}

export function resolveUmiriExpressionPortrait(speaker: string, emotion: string): (MajoExpressionPortrait & { pose: UmiriPose }) | null {
  const personId = resolveUmiriSpeaker(speaker);
  if (!personId) return null;
  const { pose, exact } = umiriPoseFor(emotion);
  return {
    personId,
    pose,
    src: poseSrc[pose],
    width: UMIRI_SPRITE_WIDTH,
    height: UMIRI_SPRITE_HEIGHT,
    exact,
  };
}
