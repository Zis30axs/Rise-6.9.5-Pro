import sakikoNeutral from '../../assets/downtown-art/characters/sakiko/indoor/neutral.webp?inline';
import sakikoWave from '../../assets/downtown-art/characters/sakiko/indoor/wave.webp?inline';
import sakikoConfident from '../../assets/downtown-art/characters/sakiko/indoor/confident.webp?inline';
import sakikoThinking from '../../assets/downtown-art/characters/sakiko/indoor/thinking.webp?inline';
import sakikoShy from '../../assets/downtown-art/characters/sakiko/indoor/shy.webp?inline';
import type { SakikoExpression } from './sakiko-art-policy';

export const SAKIKO_INDOOR_WIDTH = 768;
export const SAKIKO_INDOOR_HEIGHT = 1344;
export const SAKIKO_INDOOR_ANCHOR = [384, 1280] as const;

/** Indoor private clothes. Replaces the old home sprites at the Toyokawa house and salon. */
export const sakikoIndoorOutfit = 'home' as const;
export const sakikoIndoorPoses = Object.freeze(['neutral', 'wave', 'confident', 'thinking', 'shy'] as const);
export type SakikoIndoorPose = (typeof sakikoIndoorPoses)[number];

const poseSrc: Readonly<Record<SakikoIndoorPose, string>> = Object.freeze({
  neutral: sakikoNeutral,
  wave: sakikoWave,
  confident: sakikoConfident,
  thinking: sakikoThinking,
  shy: sakikoShy,
});

const poseForRaw: Readonly<Record<string, { pose: SakikoIndoorPose; exact: boolean }>> = Object.freeze({
  neutral: { pose: 'neutral', exact: true }, '中性': { pose: 'neutral', exact: true },
  '平静': { pose: 'neutral', exact: true }, '默认': { pose: 'neutral', exact: true }, '浅笑': { pose: 'neutral', exact: true },
  happy: { pose: 'wave', exact: true }, '开心': { pose: 'wave', exact: true },
  '打招呼': { pose: 'wave', exact: true }, '招手': { pose: 'wave', exact: true },
  '兴奋': { pose: 'wave', exact: true }, '开朗': { pose: 'wave', exact: true },
  confident: { pose: 'confident', exact: true }, '自信': { pose: 'confident', exact: true },
  '得意': { pose: 'confident', exact: true }, relieved: { pose: 'confident', exact: true }, '安心': { pose: 'confident', exact: true },
  thinking: { pose: 'thinking', exact: true }, '思考': { pose: 'thinking', exact: true },
  '打量': { pose: 'thinking', exact: true }, '微笑': { pose: 'thinking', exact: true }, '迟疑': { pose: 'thinking', exact: false },
  shy: { pose: 'shy', exact: true }, '害羞': { pose: 'shy', exact: true }, '不安': { pose: 'shy', exact: true },
  '困扰': { pose: 'shy', exact: false }, troubled: { pose: 'shy', exact: false },
  sad: { pose: 'shy', exact: false }, '难过': { pose: 'shy', exact: false }, '低落': { pose: 'shy', exact: false }, '悲伤': { pose: 'shy', exact: false },
  angry: { pose: 'shy', exact: false }, annoyed: { pose: 'shy', exact: false }, serious: { pose: 'shy', exact: false },
  '生气': { pose: 'shy', exact: false }, '不满': { pose: 'shy', exact: false }, '不悦': { pose: 'shy', exact: false }, '严肃': { pose: 'shy', exact: false },
  surprised: { pose: 'wave', exact: false }, '惊讶': { pose: 'wave', exact: false }, '慌张': { pose: 'wave', exact: false },
  smile: { pose: 'neutral', exact: true },
});

const expressionForPose: Readonly<Record<SakikoIndoorPose, SakikoExpression>> = Object.freeze({
  neutral: 'neutral',
  wave: 'smile',
  confident: 'smile',
  thinking: 'troubled',
  shy: 'troubled',
});

export function sakikoIndoorPoseFor(emotion: string): { pose: SakikoIndoorPose; exact: boolean } {
  const raw = emotion.trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(poseForRaw, raw)) return poseForRaw[raw]!;
  return { pose: 'neutral', exact: false };
}

export function resolveSakikoIndoorPortrait(emotion: string): {
  id: `sakiko_indoor_${SakikoIndoorPose}`;
  src: string;
  width: number;
  height: number;
  outfit: typeof sakikoIndoorOutfit;
  expression: SakikoExpression;
  pose: SakikoIndoorPose;
  exact: boolean;
} {
  const { pose, exact } = sakikoIndoorPoseFor(emotion);
  return {
    id: `sakiko_indoor_${pose}`,
    src: poseSrc[pose],
    width: SAKIKO_INDOOR_WIDTH,
    height: SAKIKO_INDOOR_HEIGHT,
    outfit: sakikoIndoorOutfit,
    expression: expressionForPose[pose],
    pose,
    exact,
  };
}
