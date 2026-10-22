/**
 * PR #16 visual handoff, registered as runtime art.
 *
 * Only art with a confirmed person identity is exposed as a character
 * expression set. Unconfirmed source sheets and the JPEG-only reference
 * material stay in assets/majo-cast/ and are deliberately not assigned here.
 */
import emmaNeutral from '../../assets/majo-runtime/emma/neutral.webp?inline';
import emmaHappy from '../../assets/majo-runtime/emma/happy.webp?inline';
import emmaSad from '../../assets/majo-runtime/emma/sad.webp?inline';
import emmaAngry from '../../assets/majo-runtime/emma/angry.webp?inline';
import emmaSurprised from '../../assets/majo-runtime/emma/surprised.webp?inline';
import emmaShy from '../../assets/majo-runtime/emma/shy.webp?inline';
import emmaThinking from '../../assets/majo-runtime/emma/thinking.webp?inline';
import emmaSerious from '../../assets/majo-runtime/emma/serious.webp?inline';
import emmaRelieved from '../../assets/majo-runtime/emma/relieved.webp?inline';
import highrise from '../../assets/majo-runtime/interiors/highrise-river-view-living-room-dusk.webp?inline';
import timber from '../../assets/majo-runtime/interiors/timber-courtyard-house-interior-day.webp?inline';
import olderFamily from '../../assets/majo-runtime/interiors/older-family-house-living-room-day.webp?inline';
import modernOpen from '../../assets/majo-runtime/interiors/modern-apartment-open-plan-day.webp?inline';
import sharedLiving from '../../assets/majo-runtime/interiors/apartment-shared-living-room-day.webp?inline';
import studio from '../../assets/majo-runtime/interiors/apartment-studio-bed-kitchen-day.webp?inline';
import oldTownStreet from '../../assets/majo-runtime/districts/old-town-courtyard-street-day.webp?inline';
import riverfrontStreet from '../../assets/majo-runtime/districts/riverfront-highrise-promenade-dusk.webp?inline';
import olderApartmentStreet from '../../assets/majo-runtime/districts/older-apartment-courtyard-day.webp?inline';
import type { NovelNpcEmotion } from './novel-npc-emotions';

export const majoEmotions: readonly NovelNpcEmotion[] = Object.freeze([
  'neutral', 'happy', 'sad', 'angry', 'surprised', 'shy', 'thinking', 'serious', 'relieved',
]);

export const majoEmmaExpressions: Readonly<Record<NovelNpcEmotion, string>> = Object.freeze({
  neutral: emmaNeutral,
  happy: emmaHappy,
  sad: emmaSad,
  angry: emmaAngry,
  surprised: emmaSurprised,
  shy: emmaShy,
  thinking: emmaThinking,
  serious: emmaSerious,
  relieved: emmaRelieved,
});

export interface MajoExpressionSet {
  readonly personId: string;
  readonly complete: boolean;
  /** Authored expression count; not inferred from the number of files. */
  readonly completedExpressions: number;
  readonly expressions: Readonly<Partial<Record<NovelNpcEmotion, string>>>;
}

/**
 * Registered expression sets. Semi-main residents have no confirmed identity
 * assignment yet, so they keep the existing generic portrait atlas instead of
 * being mapped to one of the five unconfirmed source sheets.
 */
export const majoExpressionSets: Readonly<Record<string, MajoExpressionSet>> = Object.freeze({
  'majo-emma': Object.freeze({
    personId: 'majo-emma', complete: true, completedExpressions: 9,
    expressions: majoEmmaExpressions,
  }),
});

const speakerAliases: Readonly<Record<string, string>> = Object.freeze({
  '樱羽艾玛': 'majo-emma', '桜羽エマ': 'majo-emma', '艾玛': 'majo-emma',
});

export function resolveMajoSpeaker(speaker: string): string | null {
  const name = speaker.trim();
  return Object.prototype.hasOwnProperty.call(speakerAliases, name) ? speakerAliases[name] : null;
}

export function majoExpressionFor(personId: string, emotion: NovelNpcEmotion): string | null {
  return majoExpressionSets[personId]?.expressions[emotion] ?? null;
}

/** Identity-first portrait selection: a person's own art wins over a generic atlas. */
export function resolveMajoExpressionPortrait(speaker: string, emotion: NovelNpcEmotion): { personId: string; src: string } | null {
  const personId = resolveMajoSpeaker(speaker);
  const src = personId ? majoExpressionFor(personId, emotion) : null;
  return personId && src ? { personId, src } : null;
}

/** Verified interior art used by novel-mode backdrops. */
export const majoInteriorArt: Readonly<Record<string, string>> = Object.freeze({
  'majo-highrise-home': highrise,
  'nikaido-house': timber,
  'koko-old-house': olderFamily,
  'emma-yuki-home': modernOpen,
  'anan-noa-milia-home': sharedLiving,
  'majo-studio': studio,
});

/** District art for the six residential prototypes; only three have recovered art. */
export const majoDistrictArt: Readonly<Record<string, string>> = Object.freeze({
  'old-town-lowrise': oldTownStreet,
  'riverfront-highrise': riverfrontStreet,
  'older-apartment-courtyard': olderApartmentStreet,
});

export interface MajoArtStatus {
  readonly personId: string;
  readonly tier: 'main' | 'semi-main';
  readonly targetExpressions: number;
  readonly outfit: string;
  readonly expressions: number;
  readonly complete: boolean;
  readonly note: string;
}

/** User-confirmed expression tiers: main 9, semi-main 3. Art is still missing for most residents. */
export const majoExpressionPolicy = Object.freeze({ main: 9, semiMain: 3 } as const);

/**
 * Honest runtime inventory for the status/docs surface. Absent expression art
 * stays absent; the generic atlas fallback is not counted as an expression diff.
 */
export const majoArtStatus: readonly MajoArtStatus[] = Object.freeze([
  { personId: 'majo-emma', tier: 'main', targetExpressions: 9, outfit: '便服（浅粉针织开衫）', expressions: 9, complete: true, note: '已接入九种表情。' },
  { personId: 'majo-hiro', tier: 'semi-main', targetExpressions: 3, outfit: '和服', expressions: 0, complete: false, note: '常服设定为和服；和服立绘与三/九表情差分待补交，黑红和服参考图身份未确认，未接入。' },
  { personId: 'majo-anan', tier: 'semi-main', targetExpressions: 3, outfit: '待确认', expressions: 0, complete: false, note: '表情差分待补交，沿用通用立绘。' },
  { personId: 'majo-noa', tier: 'semi-main', targetExpressions: 3, outfit: '待确认', expressions: 0, complete: false, note: '表情差分待补交，沿用通用立绘。' },
  { personId: 'majo-milia', tier: 'semi-main', targetExpressions: 3, outfit: '待确认', expressions: 0, complete: false, note: '表情差分待补交，沿用通用立绘。' },
  { personId: 'majo-margo', tier: 'semi-main', targetExpressions: 3, outfit: '待确认', expressions: 0, complete: false, note: '表情差分待补交，沿用通用立绘。' },
  { personId: 'majo-nanoka', tier: 'semi-main', targetExpressions: 3, outfit: '待确认', expressions: 0, complete: false, note: '表情差分待补交，沿用通用立绘。' },
  { personId: 'majo-arisa', tier: 'semi-main', targetExpressions: 3, outfit: '待确认', expressions: 0, complete: false, note: '表情差分待补交，沿用通用立绘。' },
  { personId: 'majo-sherry', tier: 'semi-main', targetExpressions: 3, outfit: '待确认', expressions: 0, complete: false, note: '表情差分待补交，沿用通用立绘。' },
  { personId: 'majo-hanna', tier: 'semi-main', targetExpressions: 3, outfit: '待确认', expressions: 0, complete: false, note: '表情差分待补交，沿用通用立绘。' },
  { personId: 'majo-koko', tier: 'semi-main', targetExpressions: 3, outfit: '待确认', expressions: 0, complete: false, note: '表情差分待补交，沿用通用立绘。' },
  { personId: 'majo-meruru', tier: 'semi-main', targetExpressions: 3, outfit: '待确认', expressions: 0, complete: false, note: '表情差分待补交，沿用通用立绘。' },
  { personId: 'majo-leia', tier: 'semi-main', targetExpressions: 3, outfit: '待确认', expressions: 0, complete: false, note: '表情差分待补交，沿用通用立绘。' },
  { personId: 'majo-yuki', tier: 'semi-main', targetExpressions: 3, outfit: '待确认', expressions: 0, complete: false, note: '表情差分待补交，沿用通用立绘。' },
]);
