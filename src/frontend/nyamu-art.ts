import nyamuNeutral from '../../assets/downtown-art/characters/nyamu/casual/neutral.webp?inline';
import nyamuSmirk from '../../assets/downtown-art/characters/nyamu/casual/smirk.webp?inline';
import nyamuWave from '../../assets/downtown-art/characters/nyamu/casual/wave.webp?inline';
import nyamuThinking from '../../assets/downtown-art/characters/nyamu/casual/thinking.webp?inline';
import nyamuHappy from '../../assets/downtown-art/characters/nyamu/casual/happy.webp?inline';
import type { MajoExpressionPortrait } from './majo-art';
import { resolveNovelNpcEmotion, type NovelNpcEmotion } from './novel-npc-emotions';

export const NYAMU_SPRITE_WIDTH = 768;
export const NYAMU_SPRITE_HEIGHT = 1344;
export const NYAMU_SPRITE_ANCHOR = [384, 1280] as const;

/** She has no other standing set. This casual outfit is the one shown for every line. */
export const nyamuOutfit = 'casual' as const;
export const nyamuPoses = Object.freeze(['neutral', 'smirk', 'wave', 'thinking', 'happy'] as const);
export type NyamuPose = (typeof nyamuPoses)[number];

const poseSrc: Readonly<Record<NyamuPose, string>> = Object.freeze({
  neutral: nyamuNeutral,
  smirk: nyamuSmirk,
  wave: nyamuWave,
  thinking: nyamuThinking,
  happy: nyamuHappy,
});

/**
 * Nine story emotions, five supplied poses.
 * 平静 is the hands-on-hips smile. 开心 is the wink and peace sign.
 * 思考 is the chin tap. 安心 uses the smug crossed arms so that pose appears
 * on a real tag; 严肃 and 生气 fall back to it as the least friendly pose.
 * 惊讶 uses the wave. 害羞 and 难过 fall back to the calm smile.
 */
const poseForEmotion: Readonly<Record<NovelNpcEmotion, NyamuPose>> = Object.freeze({
  neutral: 'neutral',
  happy: 'happy',
  sad: 'neutral',
  angry: 'smirk',
  surprised: 'wave',
  shy: 'neutral',
  thinking: 'thinking',
  serious: 'smirk',
  relieved: 'smirk',
});

const exactEmotions = new Set<NovelNpcEmotion>(['neutral', 'happy', 'thinking', 'relieved']);

/** Words the nine tags do not spell, still tied to a supplied pose. */
const directPoses: Readonly<Record<string, NyamuPose>> = Object.freeze({
  俏皮: 'happy',
  开朗: 'happy',
  playful: 'happy',
  自信: 'smirk',
  坏笑: 'smirk',
  confident: 'smirk',
  打招呼: 'wave',
  兴奋: 'wave',
  招手: 'wave',
  wave: 'wave',
  打量: 'thinking',
  默认: 'neutral',
});

const speakerAliases: Readonly<Record<string, string>> = Object.freeze({
  'bang-nyamu': 'bang-nyamu',
  nyamu: 'bang-nyamu',
  amoris: 'bang-nyamu',
  '祐天寺若麦': 'bang-nyamu',
  '若麦': 'bang-nyamu',
  '喵梦': 'bang-nyamu',
});

export function resolveNyamuSpeaker(speaker: string): string | null {
  const name = speaker.trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(speakerAliases, name) ? speakerAliases[name]! : null;
}

export function isNyamuSpeaker(speaker: string): boolean {
  return resolveNyamuSpeaker(speaker) !== null;
}

export function nyamuPoseFor(emotion: string): { pose: NyamuPose; exact: boolean } {
  const raw = emotion.trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(directPoses, raw)) return { pose: directPoses[raw]!, exact: true };
  const resolved = resolveNovelNpcEmotion(emotion);
  return { pose: poseForEmotion[resolved], exact: exactEmotions.has(resolved) };
}

export function resolveNyamuExpressionPortrait(speaker: string, emotion: string): (MajoExpressionPortrait & { pose: NyamuPose }) | null {
  const personId = resolveNyamuSpeaker(speaker);
  if (!personId) return null;
  const { pose, exact } = nyamuPoseFor(emotion);
  return {
    personId,
    pose,
    src: poseSrc[pose],
    width: NYAMU_SPRITE_WIDTH,
    height: NYAMU_SPRITE_HEIGHT,
    exact,
  };
}
