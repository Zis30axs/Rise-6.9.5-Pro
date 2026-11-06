import marinaNeutral from '../../assets/downtown-art/characters/marina/casual/neutral.webp?inline';
import marinaSmile from '../../assets/downtown-art/characters/marina/casual/smile.webp?inline';
import marinaSurprised from '../../assets/downtown-art/characters/marina/casual/surprised.webp?inline';
import marinaCheerful from '../../assets/downtown-art/characters/marina/casual/cheerful.webp?inline';
import type { MajoExpressionPortrait } from './majo-art';
import type { NovelNpcEmotion } from './novel-npc-emotions';

export const MARINA_SPRITE_WIDTH = 768;
export const MARINA_SPRITE_HEIGHT = 1344;
export const MARINA_SPRITE_ANCHOR = [384, 1280] as const;

/** Four supplied poses. The other moods fall back to the nearest one. */
export const marinaExpressions: Readonly<Record<NovelNpcEmotion, string>> = Object.freeze({
  neutral: marinaNeutral,
  happy: marinaSmile,
  relieved: marinaCheerful,
  surprised: marinaSurprised,
  shy: marinaSurprised,
  thinking: marinaSurprised,
  sad: marinaSurprised,
  serious: marinaNeutral,
  angry: marinaNeutral,
});

const speakerAliases: Readonly<Record<string, string>> = Object.freeze({
  'bang-marina': 'bang-marina',
  marina: 'bang-marina',
  'tsukishima marina': 'bang-marina',
  '月岛麻里奈': 'bang-marina',
  '麻里奈': 'bang-marina',
});

export function resolveMarinaSpeaker(speaker: string): string | null {
  const name = speaker.trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(speakerAliases, name) ? speakerAliases[name]! : null;
}

export function isMarinaSpeaker(speaker: string): boolean {
  return resolveMarinaSpeaker(speaker) !== null;
}

export function marinaExpressionFor(emotion: NovelNpcEmotion): string {
  return marinaExpressions[emotion] ?? marinaNeutral;
}

export function resolveMarinaExpressionPortrait(speaker: string, emotion: NovelNpcEmotion): MajoExpressionPortrait | null {
  const personId = resolveMarinaSpeaker(speaker);
  if (!personId) return null;
  const exact = emotion === 'neutral' || emotion === 'happy' || emotion === 'surprised' || emotion === 'relieved';
  return {
    personId,
    src: marinaExpressionFor(emotion),
    width: MARINA_SPRITE_WIDTH,
    height: MARINA_SPRITE_HEIGHT,
    exact,
  };
}
