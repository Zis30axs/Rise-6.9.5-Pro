/**
 * Watanare runtime character expression art.
 *
 * Registers:
 * - Amori Renako (watanare-renako): main character, 9 expressions (1024x1536)
 * - Ouzuka Mai (watanare-mai): semi-main character, 3 expressions (1024x1536)
 * - Sena Ajisai (watanare-ajisai): semi-main character, 3 expressions (1024x1536)
 * - Koto Satsuki (watanare-satsuki): semi-main character, 3 expressions (1024x1536)
 * - Koyanagi Kaho (watanare-kaho): semi-main character, 3 expressions (512x1024)
 * - Amori Haruna (watanare-haruna): semi-main character, 3 expressions (360x1024)
 */
import renakoNeutral from '../../assets/watanare-runtime/renako/neutral.webp?inline';
import renakoHappy from '../../assets/watanare-runtime/renako/happy.webp?inline';
import renakoSad from '../../assets/watanare-runtime/renako/sad.webp?inline';
import renakoAngry from '../../assets/watanare-runtime/renako/angry.webp?inline';
import renakoSurprised from '../../assets/watanare-runtime/renako/surprised.webp?inline';
import renakoShy from '../../assets/watanare-runtime/renako/shy.webp?inline';
import renakoThinking from '../../assets/watanare-runtime/renako/thinking.webp?inline';
import renakoSerious from '../../assets/watanare-runtime/renako/serious.webp?inline';
import renakoRelieved from '../../assets/watanare-runtime/renako/relieved.webp?inline';

import maiNeutral from '../../assets/watanare-runtime/characters/watanare-mai/neutral.webp?inline';
import maiHappy from '../../assets/watanare-runtime/characters/watanare-mai/happy.webp?inline';
import maiShy from '../../assets/watanare-runtime/characters/watanare-mai/shy.webp?inline';

import ajisaiNeutral from '../../assets/watanare-runtime/characters/watanare-ajisai/neutral.webp?inline';
import ajisaiHappy from '../../assets/watanare-runtime/characters/watanare-ajisai/happy.webp?inline';
import ajisaiShy from '../../assets/watanare-runtime/characters/watanare-ajisai/shy.webp?inline';

import satsukiNeutral from '../../assets/watanare-runtime/characters/watanare-satsuki/neutral.webp?inline';
import satsukiHappy from '../../assets/watanare-runtime/characters/watanare-satsuki/happy.webp?inline';
import satsukiShy from '../../assets/watanare-runtime/characters/watanare-satsuki/shy.webp?inline';

import kahoNeutral from '../../assets/watanare-runtime/characters/watanare-kaho/neutral.webp?inline';
import kahoHappy from '../../assets/watanare-runtime/characters/watanare-kaho/happy.webp?inline';
import kahoThinking from '../../assets/watanare-runtime/characters/watanare-kaho/thinking.webp?inline';

import harunaNeutral from '../../assets/watanare-runtime/characters/watanare-haruna/neutral.webp?inline';
import harunaHappy from '../../assets/watanare-runtime/characters/watanare-haruna/happy.webp?inline';
import harunaShy from '../../assets/watanare-runtime/characters/watanare-haruna/shy.webp?inline';

import type { MajoExpressionPortrait, MajoExpressionSet } from './majo-art';
import type { NovelNpcEmotion } from './novel-npc-emotions';

export const watanareRenakoExpressions: Readonly<Record<NovelNpcEmotion, string>> = Object.freeze({
  neutral: renakoNeutral,
  happy: renakoHappy,
  sad: renakoSad,
  angry: renakoAngry,
  surprised: renakoSurprised,
  shy: renakoShy,
  thinking: renakoThinking,
  serious: renakoSerious,
  relieved: renakoRelieved,
});

const semiMain1024 = (personId: string, neutral: string, happy: string, shy: string): MajoExpressionSet =>
  Object.freeze({
    personId,
    tier: 'semi-main',
    targetExpressions: 3,
    complete: true,
    completedExpressions: 3,
    width: 1024,
    height: 1536,
    expressions: Object.freeze({ neutral, happy, shy }),
  });

export const watanareExpressionSets: Readonly<Record<string, MajoExpressionSet>> = Object.freeze({
  'watanare-renako': Object.freeze({
    personId: 'watanare-renako',
    tier: 'main',
    targetExpressions: 9,
    complete: true,
    completedExpressions: 9,
    width: 1024,
    height: 1536,
    expressions: watanareRenakoExpressions,
  }),
  'watanare-mai': semiMain1024('watanare-mai', maiNeutral, maiHappy, maiShy),
  'watanare-ajisai': semiMain1024('watanare-ajisai', ajisaiNeutral, ajisaiHappy, ajisaiShy),
  'watanare-satsuki': semiMain1024('watanare-satsuki', satsukiNeutral, satsukiHappy, satsukiShy),
  'watanare-kaho': Object.freeze({
    personId: 'watanare-kaho',
    tier: 'semi-main' as const,
    targetExpressions: 3,
    complete: true,
    completedExpressions: 3,
    width: 512,
    height: 1024,
    expressions: Object.freeze({ neutral: kahoNeutral, happy: kahoHappy, thinking: kahoThinking }),
  }),
  'watanare-haruna': Object.freeze({
    personId: 'watanare-haruna',
    tier: 'semi-main' as const,
    targetExpressions: 3,
    complete: true,
    completedExpressions: 3,
    width: 360,
    height: 1024,
    expressions: Object.freeze({ neutral: harunaNeutral, happy: harunaHappy, shy: harunaShy, angry: harunaShy }),
  }),
});

const watanareSpeakerAliases: Readonly<Record<string, string>> = Object.freeze({
  'watanare-renako': 'watanare-renako',
  '甘织玲奈子': 'watanare-renako',
  '甘織れな子': 'watanare-renako',
  '玲奈子': 'watanare-renako',
  'れな子': 'watanare-renako',
  '玲奈酱': 'watanare-renako',
  '玲奈蹦': 'watanare-renako',
  'renako': 'watanare-renako',

  'watanare-mai': 'watanare-mai',
  '王冢真唯': 'watanare-mai',
  '王塚真唯': 'watanare-mai',
  '真唯': 'watanare-mai',

  'watanare-ajisai': 'watanare-ajisai',
  '濑名紫阳花': 'watanare-ajisai',
  '瀬名紫陽花': 'watanare-ajisai',
  '紫阳花': 'watanare-ajisai',

  'watanare-satsuki': 'watanare-satsuki',
  '琴纱月': 'watanare-satsuki',
  '琴紗月': 'watanare-satsuki',
  '纱月': 'watanare-satsuki',

  'watanare-kaho': 'watanare-kaho',
  '小柳香穗': 'watanare-kaho',
  '小柳香穂': 'watanare-kaho',
  '皆口香穗': 'watanare-kaho',
  '香穗': 'watanare-kaho',
  '香穗酱': 'watanare-kaho',

  'watanare-haruna': 'watanare-haruna',
  '甘织遥奈': 'watanare-haruna',
  '甘織遥奈': 'watanare-haruna',
  '遥奈': 'watanare-haruna',
});

export function resolveWatanareSpeaker(speaker: string): string | null {
  const name = speaker.trim();
  return Object.prototype.hasOwnProperty.call(watanareSpeakerAliases, name) ? watanareSpeakerAliases[name]! : null;
}

export function watanareExpressionFor(personId: string, emotion: NovelNpcEmotion): string | null {
  const set = watanareExpressionSets[personId];
  return set?.expressions[emotion] ?? set?.expressions.neutral ?? null;
}

export function resolveWatanareExpressionPortrait(speaker: string, emotion: NovelNpcEmotion): MajoExpressionPortrait | null {
  const personId = resolveWatanareSpeaker(speaker);
  const set = personId ? watanareExpressionSets[personId] : undefined;
  const src = personId ? watanareExpressionFor(personId, emotion) : null;
  if (!personId || !set || !src) return null;
  return { personId, src, width: set.width, height: set.height, exact: !!set.expressions[emotion] };
}
