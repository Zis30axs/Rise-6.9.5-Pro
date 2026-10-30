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
import hiroNeutral from '../../assets/majo-runtime/characters/majo-hiro/neutral.webp?inline';
import hiroHappy from '../../assets/majo-runtime/characters/majo-hiro/happy.webp?inline';
import hiroShy from '../../assets/majo-runtime/characters/majo-hiro/shy.webp?inline';
import noaNeutral from '../../assets/majo-runtime/characters/majo-noa/neutral.webp?inline';
import noaHappy from '../../assets/majo-runtime/characters/majo-noa/happy.webp?inline';
import noaShy from '../../assets/majo-runtime/characters/majo-noa/shy.webp?inline';
import miliaNeutral from '../../assets/majo-runtime/characters/majo-milia/neutral.webp?inline';
import miliaHappy from '../../assets/majo-runtime/characters/majo-milia/happy.webp?inline';
import miliaShy from '../../assets/majo-runtime/characters/majo-milia/shy.webp?inline';
import ananNeutral from '../../assets/majo-runtime/characters/majo-anan/neutral.webp?inline';
import ananHappy from '../../assets/majo-runtime/characters/majo-anan/happy.webp?inline';
import ananShy from '../../assets/majo-runtime/characters/majo-anan/shy.webp?inline';
import sherryNeutral from '../../assets/majo-runtime/characters/majo-sherry/neutral.webp?inline';
import sherryHappy from '../../assets/majo-runtime/characters/majo-sherry/happy.webp?inline';
import sherryShy from '../../assets/majo-runtime/characters/majo-sherry/shy.webp?inline';
import hannaNeutral from '../../assets/majo-runtime/characters/majo-hanna/neutral.webp?inline';
import hannaHappy from '../../assets/majo-runtime/characters/majo-hanna/happy.webp?inline';
import hannaShy from '../../assets/majo-runtime/characters/majo-hanna/shy.webp?inline';
import margoNeutral from '../../assets/majo-runtime/characters/majo-margo/neutral.avif?inline';
import margoHappy from '../../assets/majo-runtime/characters/majo-margo/happy.avif?inline';
import margoShy from '../../assets/majo-runtime/characters/majo-margo/shy.avif?inline';
import margoAngry from '../../assets/majo-runtime/characters/majo-margo/extras/angry.avif?inline';
import margoSurprised from '../../assets/majo-runtime/characters/majo-margo/extras/surprised.avif?inline';
import yukiNeutral from '../../assets/majo-runtime/characters/majo-yuki/neutral.png?inline';
import yukiHappy from '../../assets/majo-runtime/characters/majo-yuki/happy.png?inline';
import yukiThinking from '../../assets/majo-runtime/characters/majo-yuki/thinking.png?inline';
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
  readonly tier: 'main' | 'semi-main';
  readonly targetExpressions: number;
  readonly complete: boolean;
  /** Authored expression count; not inferred from the number of files. */
  readonly completedExpressions: number;
  /** Intrinsic size of the transparent sprite assets. */
  readonly width: number;
  readonly height: number;
  readonly expressions: Readonly<Partial<Record<NovelNpcEmotion, string>>>;
}

const semiMainExpressions = (neutral: string, happy: string, shy: string): Readonly<Partial<Record<NovelNpcEmotion, string>>> => Object.freeze({ neutral, happy, shy });

const semiMainSet = (personId: string, expressions: Readonly<Partial<Record<NovelNpcEmotion, string>>>): MajoExpressionSet => Object.freeze({
  personId, tier: 'semi-main', targetExpressions: 3, complete: true, completedExpressions: 3,
  width: 1024, height: 2048, expressions,
});

/**
 * Registered expression sets. Six sheets were assigned by the user on
 * 2026-10-22; their panels were cut out with the anime-seg model and upscaled
 * 2x into transparent sprites. Other residents keep the generic portrait atlas.
 */
export const majoExpressionSets: Readonly<Record<string, MajoExpressionSet>> = Object.freeze({
  'majo-emma': Object.freeze({
    personId: 'majo-emma', tier: 'main', targetExpressions: 9, complete: true, completedExpressions: 9,
    width: 1024, height: 1536, expressions: majoEmmaExpressions,
  }),
  'majo-hiro': semiMainSet('majo-hiro', semiMainExpressions(hiroNeutral, hiroHappy, hiroShy)),
  'majo-noa': semiMainSet('majo-noa', semiMainExpressions(noaNeutral, noaHappy, noaShy)),
  'majo-milia': semiMainSet('majo-milia', semiMainExpressions(miliaNeutral, miliaHappy, miliaShy)),
  'majo-anan': semiMainSet('majo-anan', semiMainExpressions(ananNeutral, ananHappy, ananShy)),
  'majo-sherry': semiMainSet('majo-sherry', semiMainExpressions(sherryNeutral, sherryHappy, sherryShy)),
  'majo-hanna': semiMainSet('majo-hanna', semiMainExpressions(hannaNeutral, hannaHappy, hannaShy)),
  'majo-yuki': Object.freeze({
    personId: 'majo-yuki', tier: 'semi-main' as const, targetExpressions: 3, complete: true, completedExpressions: 3,
    width: 512, height: 1024,
    expressions: Object.freeze({ neutral: yukiNeutral, happy: yukiHappy, thinking: yukiThinking }),
  }),
  'majo-margo': Object.freeze({
    personId: 'majo-margo', tier: 'semi-main' as const, targetExpressions: 3, complete: true, completedExpressions: 5,
    width: 768, height: 1024,
    expressions: Object.freeze({
      neutral: margoNeutral, happy: margoHappy, shy: margoShy, angry: margoAngry, surprised: margoSurprised,
    }),
  }),
});

const speakerAliases: Readonly<Record<string, string>> = Object.freeze({
  '樱羽艾玛': 'majo-emma', '艾玛': 'majo-emma',
  '二阶堂希罗': 'majo-hiro', '希罗': 'majo-hiro',
  '城崎诺亚': 'majo-noa', '诺亚': 'majo-noa',
  '佐伯米莉亚': 'majo-milia', '米莉亚': 'majo-milia',
  '夏目安安': 'majo-anan', '安安': 'majo-anan',
  '橘雪莉': 'majo-sherry', '橘雪梨': 'majo-sherry', '雪莉': 'majo-sherry', '雪梨': 'majo-sherry',
  '远野汉娜': 'majo-hanna', '汉娜': 'majo-hanna',
  '宝生玛格': 'majo-margo', '玛格': 'majo-margo',
  '黑部奈叶香': 'majo-nanoka', '奈叶香': 'majo-nanoka',
  '黑部穗奈香': 'majo-honoka', '穗奈香': 'majo-honoka', '黑部穗乃香': 'majo-honoka', '穗乃香': 'majo-honoka',
  '月代雪': 'majo-yuki',
});

export function resolveMajoSpeaker(speaker: string): string | null {
  const name = speaker.trim();
  return Object.prototype.hasOwnProperty.call(speakerAliases, name) ? speakerAliases[name] : null;
}

/** Exact emotion first, then the same person's neutral panel; never another identity. */
export function majoExpressionFor(personId: string, emotion: NovelNpcEmotion): string | null {
  const set = majoExpressionSets[personId];
  return set?.expressions[emotion] ?? set?.expressions.neutral ?? null;
}

export interface MajoExpressionPortrait {
  personId: string;
  src: string;
  width: number;
  height: number;
  /** False when the requested emotion is not authored and neutral is used. */
  exact: boolean;
}

/** Identity-first portrait selection: a person's own art wins over a generic atlas. */
export function resolveMajoExpressionPortrait(speaker: string, emotion: NovelNpcEmotion): MajoExpressionPortrait | null {
  const personId = resolveMajoSpeaker(speaker);
  const set = personId ? majoExpressionSets[personId] : undefined;
  const src = personId ? majoExpressionFor(personId, emotion) : null;
  if (!personId || !set || !src) return null;
  return { personId, src, width: set.width, height: set.height, exact: !!set.expressions[emotion] };
}

/** Verified interior art used by novel-mode backdrops. */
export const majoInteriorArt: Readonly<Record<string, string>> = Object.freeze({
  'majo-highrise-home': highrise,
  'nikaido-house': timber,
  'koko-old-house': olderFamily,
  'emma-yuki-home': modernOpen,
  'anan-noa-milia-home': sharedLiving,
  'nanoka-honoka-home': sharedLiving,
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
  { personId: 'majo-hiro', tier: 'semi-main', targetExpressions: 3, outfit: '和服', expressions: 3, complete: true, note: '用户确认身份；已用 anime-seg 抠图并 2× 放大（平静/开心/害羞），第三姿态为初版映射。' },
  { personId: 'majo-anan', tier: 'semi-main', targetExpressions: 3, outfit: '银蓝发哥特长裙', expressions: 3, complete: true, note: '用户确认身份；已用 anime-seg 抠图并 2× 放大（平静/开心/害羞），第三姿态为初版映射。' },
  { personId: 'majo-noa', tier: 'semi-main', targetExpressions: 3, outfit: '彩发双马尾波点外套', expressions: 3, complete: true, note: '用户确认身份；已用 anime-seg 抠图并 2× 放大（平静/开心/害羞），第三姿态为初版映射。' },
  { personId: 'majo-milia', tier: 'semi-main', targetExpressions: 3, outfit: '金发黑色蕾丝开衫', expressions: 3, complete: true, note: '用户确认身份；已用 anime-seg 抠图并 2× 放大（平静/开心/害羞），第三姿态为初版映射。' },
  { personId: 'majo-sherry', tier: 'semi-main', targetExpressions: 3, outfit: '蓝发贝雷帽格裙', expressions: 3, complete: true, note: '用户确认身份（消息写作“橘雪梨”，稳定 ID 仍为 majo-sherry）；已抠图并 2× 放大。' },
  { personId: 'majo-hanna', tier: 'semi-main', targetExpressions: 3, outfit: '金发绿裙', expressions: 3, complete: true, note: '用户确认身份；已用 anime-seg 抠图并 2× 放大（平静/开心/害羞），第三姿态为初版映射。' },
  { personId: 'majo-margo', tier: 'semi-main', targetExpressions: 3, outfit: '紫黑哥特和风', expressions: 5, complete: true, note: '已接入五张透明立绘：平静、开心、害羞、生气、惊讶。难过、思考、严肃、安心使用本人平静立绘。' },
  { personId: 'majo-nanoka', tier: 'semi-main', targetExpressions: 3, outfit: '待确认', expressions: 0, complete: false, note: '表情差分待补交，沿用通用立绘。' },
  { personId: 'majo-honoka', tier: 'semi-main', targetExpressions: 3, outfit: '待确认', expressions: 0, complete: false, note: '大学毕业、与奈叶香同居的常驻NPC；专属透明立绘未提交，沿用通用立绘。' },
  { personId: 'majo-arisa', tier: 'semi-main', targetExpressions: 3, outfit: '待确认', expressions: 0, complete: false, note: '表情差分待补交，沿用通用立绘。' },
  { personId: 'majo-koko', tier: 'semi-main', targetExpressions: 3, outfit: '待确认', expressions: 0, complete: false, note: '表情差分待补交，沿用通用立绘。' },
  { personId: 'majo-meruru', tier: 'semi-main', targetExpressions: 3, outfit: '待确认', expressions: 0, complete: false, note: '表情差分待补交，沿用通用立绘。' },
  { personId: 'majo-leia', tier: 'semi-main', targetExpressions: 3, outfit: '待确认', expressions: 0, complete: false, note: '表情差分待补交，沿用通用立绘。' },
  { personId: 'majo-yuki', tier: 'semi-main', targetExpressions: 3, outfit: '浅蓝开衫、深蓝长裙、花饰帽', expressions: 3, complete: true, note: '已接入三姿态透明立绘（平静/开心/思考），缺失情绪回退同一人物的平静立绘。' },
]);
