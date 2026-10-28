import fengjinNeutral from '../../assets/characters/fengjin/neutral.webp?inline';
import fengjinHappy from '../../assets/characters/fengjin/happy.webp?inline';
import fengjinSerious from '../../assets/characters/fengjin/serious.webp?inline';
import type { MajoExpressionPortrait, MajoExpressionSet } from './majo-art';
import type { NovelNpcEmotion } from './novel-npc-emotions';

export const fengjinExpressions: Readonly<Record<NovelNpcEmotion, string>> = Object.freeze({
  neutral: fengjinNeutral,
  happy: fengjinHappy,
  serious: fengjinSerious,
  relieved: fengjinHappy,
  thinking: fengjinSerious,
  angry: fengjinSerious,
  sad: fengjinSerious,
  surprised: fengjinNeutral,
  shy: fengjinHappy,
});

export const fengjinExpressionSet: MajoExpressionSet = Object.freeze({
  personId: 'fengjin',
  tier: 'semi-main',
  targetExpressions: 3,
  complete: true,
  completedExpressions: 3,
  width: 1024,
  height: 1536,
  expressions: Object.freeze({
    neutral: fengjinNeutral,
    happy: fengjinHappy,
    serious: fengjinSerious,
  }),
});

const speakerAliases: Readonly<Record<string, string>> = Object.freeze({
  fengjin: 'fengjin',
  Fengjin: 'fengjin',
  风堇: 'fengjin',
  风堇医生: 'fengjin',
  风堇医师: 'fengjin',
  雅辛忒丝: 'fengjin',
  摇光的医师: 'fengjin',
  摇光: 'fengjin',
  Hyacinthia: 'fengjin',
  hyacinthia: 'fengjin',
});

export function resolveFengjinSpeaker(speaker: string): string | null {
  const name = speaker.trim();
  return Object.prototype.hasOwnProperty.call(speakerAliases, name) ? speakerAliases[name] : null;
}

export function fengjinExpressionFor(emotion: NovelNpcEmotion): string {
  return fengjinExpressions[emotion] ?? fengjinNeutral;
}

export function resolveFengjinExpressionPortrait(speaker: string, emotion: NovelNpcEmotion): MajoExpressionPortrait | null {
  const personId = resolveFengjinSpeaker(speaker);
  if (!personId) return null;
  const isAuthored = emotion === 'neutral' || emotion === 'happy' || emotion === 'serious';
  return {
    personId,
    src: fengjinExpressionFor(emotion),
    width: 1024,
    height: 1536,
    exact: isAuthored,
  };
}
