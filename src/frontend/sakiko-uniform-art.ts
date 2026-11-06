import sakikoNeutral from '../../assets/downtown-art/characters/sakiko/uniform/neutral.webp?inline';
import sakikoWave from '../../assets/downtown-art/characters/sakiko/uniform/wave.webp?inline';
import sakikoShy from '../../assets/downtown-art/characters/sakiko/uniform/shy.webp?inline';
import sakikoAnnoyed from '../../assets/downtown-art/characters/sakiko/uniform/annoyed.webp?inline';
import sakikoConfident from '../../assets/downtown-art/characters/sakiko/uniform/confident.webp?inline';
import sakikoSurprised from '../../assets/downtown-art/characters/sakiko/uniform/surprised.webp?inline';
import sakikoThinking from '../../assets/downtown-art/characters/sakiko/uniform/thinking.webp?inline';
import sakikoCheerful from '../../assets/downtown-art/characters/sakiko/uniform/cheerful.webp?inline';
import sakikoSad from '../../assets/downtown-art/characters/sakiko/uniform/sad.webp?inline';
import type { SakikoExpression } from './sakiko-art-policy';

export const SAKIKO_UNIFORM_WIDTH = 768;
export const SAKIKO_UNIFORM_HEIGHT = 1344;
export const SAKIKO_UNIFORM_ANCHOR = [384, 1280] as const;

/** Haneoka uniform. This replaces the old casual set everywhere except the mansion home outfit. */
export const sakikoUniformOutfit = 'uniform' as const;
export const sakikoUniformPoses = Object.freeze([
  'neutral', 'wave', 'shy', 'annoyed', 'confident', 'surprised', 'thinking', 'cheerful', 'sad',
] as const);
export type SakikoUniformPose = (typeof sakikoUniformPoses)[number];

const poseSrc: Readonly<Record<SakikoUniformPose, string>> = Object.freeze({
  neutral: sakikoNeutral,
  wave: sakikoWave,
  shy: sakikoShy,
  annoyed: sakikoAnnoyed,
  confident: sakikoConfident,
  surprised: sakikoSurprised,
  thinking: sakikoThinking,
  cheerful: sakikoCheerful,
  sad: sakikoSad,
});

/** Raw story words, checked before the six-name collapse so 开心 and 微笑 stay apart. */
const poseForRaw: Readonly<Record<string, SakikoUniformPose>> = Object.freeze({
  neutral: 'neutral', '中性': 'neutral', '平静': 'neutral', '默认': 'neutral',
  happy: 'wave', '开心': 'wave', '打招呼': 'wave', '招手': 'wave',
  cheerful: 'cheerful', '兴奋': 'cheerful', '开朗': 'cheerful',
  smile: 'shy', '浅笑': 'shy', '微笑': 'shy', shy: 'shy', '害羞': 'shy',
  confident: 'confident', '自信': 'confident', '得意': 'confident', relieved: 'confident', '安心': 'confident',
  annoyed: 'annoyed', angry: 'annoyed', serious: 'annoyed', '不满': 'annoyed', '不悦': 'annoyed', '生气': 'annoyed', '严肃': 'annoyed',
  surprised: 'surprised', '惊讶': 'surprised', '慌张': 'surprised',
  thinking: 'thinking', '思考': 'thinking', '迟疑': 'thinking', '打量': 'thinking',
  sad: 'sad', troubled: 'sad', '难过': 'sad', '不安': 'sad', '低落': 'sad', '悲伤': 'sad', '困扰': 'sad',
});

const expressionForPose: Readonly<Record<SakikoUniformPose, SakikoExpression>> = Object.freeze({
  neutral: 'neutral',
  wave: 'smile',
  shy: 'troubled',
  annoyed: 'annoyed',
  confident: 'smile',
  surprised: 'surprised',
  thinking: 'troubled',
  cheerful: 'smile',
  sad: 'sad',
});

export function sakikoUniformPoseFor(emotion: string): { pose: SakikoUniformPose; exact: boolean } {
  const raw = emotion.trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(poseForRaw, raw)) return { pose: poseForRaw[raw]!, exact: true };
  return { pose: 'neutral', exact: false };
}

export function resolveSakikoUniformPortrait(emotion: string): {
  id: `sakiko_uniform_${SakikoUniformPose}`;
  src: string;
  width: number;
  height: number;
  outfit: typeof sakikoUniformOutfit;
  expression: SakikoExpression;
  pose: SakikoUniformPose;
  exact: boolean;
} {
  const { pose, exact } = sakikoUniformPoseFor(emotion);
  return {
    id: `sakiko_uniform_${pose}`,
    src: poseSrc[pose],
    width: SAKIKO_UNIFORM_WIDTH,
    height: SAKIKO_UNIFORM_HEIGHT,
    outfit: sakikoUniformOutfit,
    expression: expressionForPose[pose],
    pose,
    exact,
  };
}
