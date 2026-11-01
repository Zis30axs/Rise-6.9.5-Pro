import soyoHeadshot from '../../assets/map-avatars/soyo.webp?inline';
import type { ProtagonistId } from '../runtime/dual-protagonists';
import type { CharacterPortraitId } from './types';
import { downtownArtPack } from './generated/downtown-art';
import { getAnonArt, getMutsumiArt, getNagasakiMotherArt, getRaanaArt, getSakikoArt, getTakiArt, getTomoriArt } from './downtown-art-runtime';
import { isAnonSpeaker } from './anon-art-policy';
import { isMutsumiSpeaker } from './mutsumi-art-policy';
import { isRaanaSpeaker } from './raana-art-policy';
import { isTakiSpeaker } from './taki-art-policy';
import { isTomoriSpeaker } from './tomori-art-policy';
import { isNagasakiMotherSpeaker } from './nagasaki-mother-art-policy';
import { majoExpressionFor, resolveMajoSpeaker } from './majo-art';
import { watanareExpressionFor } from './watanare-art';
import { novelNpcAtlases } from './novel-npc-atlases';


// Only generated map crops are considered headshots. Other existing full-body art
// remains an independent, unchanged source and is used when no crop is installed.
const croppedHeadshots = import.meta.glob<string>(
  '../../assets/map-avatars/*.svg',
  { eager: true, query: '?offline-map-headshot', import: 'default' },
);
const generatedHeadshots = Object.fromEntries(
  Object.entries(croppedHeadshots).map(([path, src]) =>
    [path.slice(path.lastIndexOf('/') + 1).replace(/\.svg$/, ''), src]),
) as Record<string, string>;
const personAvatarIds: Readonly<Record<string, string>> = {
  '高松灯': 'tomori', '高松燈': 'tomori', '丰川祥子': 'sakiko', '千早爱音': 'anon', '椎名立希': 'taki',
  '要乐奈': 'rana', '若叶睦': 'mutsumi',
  '樱羽艾玛': 'majo-emma', '二阶堂希罗': 'majo-hiro', '夏目安安': 'majo-anan',
  '城崎诺亚': 'majo-noa', '佐伯米莉亚': 'majo-milia', '宝生玛格': 'majo-margo',
  '黑部奈叶香': 'majo-nanoka', '紫藤亚里沙': 'majo-arisa', '冰上梅露露': 'majo-meruru', '梅露露': 'majo-meruru',
  '橘雪莉': 'majo-sherry', '远野汉娜': 'majo-hanna', '月代雪': 'majo-yuki',
  '甘织玲奈子': 'wata-renako', '王冢真唯': 'wata-mai', '濑名紫阳花': 'wata-ajisai',
  '琴纱月': 'wata-satsuki', '小柳香穗': 'wata-kaho', '甘织遥奈': 'wata-haruna',
};
// Match this registered resident's stable world ID even when a saved contact is renamed.
const personIdHeadshotAliases: Readonly<Record<string, string>> = {
  'bang-tomori': 'tomori',
};
const protagonistAvatarIds: Readonly<Record<string, string>> = {
  sakiko: 'sakiko', emma: 'majo-emma', renako: 'wata-renako',
};
/** Full-body sheets without a headshot crop. Percentages skip each sheet's empty top; no extra scale. */
const spriteObjectPosition: Readonly<Record<string, string>> = {
  sakiko: 'center 4%', tomori: 'center 4%', anon: 'center 4%', taki: 'center 4%',
  rana: 'center 4%', mutsumi: 'center 4%',
  'majo-anan': 'center 5%', 'majo-noa': 'center 3%', 'majo-hanna': 'center 12%',
  'majo-meruru': 'center top', 'majo-emma': 'center top', 'majo-hiro': 'center top',
  'majo-margo': 'center top', 'majo-milia': 'center top', 'majo-nanoka': 'center top',
  'majo-arisa': 'center top', 'majo-sherry': 'center top', 'majo-yuki': 'center top',
  'wata-renako': 'center top', 'wata-mai': 'center top', 'wata-ajisai': 'center top',
  'wata-satsuki': 'center top', 'wata-kaho': 'center top', 'wata-haruna': 'center top',
  'nagasaki-mother': 'center 4%',
};
export function mapSpriteObjectPosition(person: MapAvatarIdentity): string {
  if (isNagasakiMotherSpeaker(person.personId) || isNagasakiMotherSpeaker(person.name)) return spriteObjectPosition['nagasaki-mother']!;
  const candidates = [
    person.personId ? personIdHeadshotAliases[person.personId] : undefined,
    person.personId?.replace(/^watanare-/, 'wata-'),
    person.protagonistId ? protagonistAvatarIds[person.protagonistId] : undefined,
    personAvatarIds[person.name],
    person.personId ?? undefined,
  ];
  for (const id of candidates) {
    if (id && spriteObjectPosition[id]) return spriteObjectPosition[id];
  }
  return 'center top';
}
function headshotFor(person: MapAvatarIdentity): MapAvatarAsset | null {
  const candidates = [
    person.personId ? personIdHeadshotAliases[person.personId] : undefined,
    person.personId?.replace(/^watanare-/, 'wata-'),
    person.protagonistId ? protagonistAvatarIds[person.protagonistId] : undefined,
    personAvatarIds[person.name],
  ];
  for (const id of candidates) {
    if (id && generatedHeadshots[id]) return { kind: 'headshot', src: generatedHeadshots[id] };
  }
  return null;
}

export interface MapAvatarIdentity {
  name: string;
  personId?: string | null;
  portraitId?: CharacterPortraitId | null;
  protagonistId?: ProtagonistId | null;
}

export type MapAvatarAsset =
  | { kind: 'sprite'; src: string }
  | { kind: 'headshot'; src: string }
  | { kind: 'atlas'; src: string; x: number; y: number; width: number; height: number; atlasWidth: number; atlasHeight: number };

/** Only an identity-confirmed sprite (or that pedestrian's saved generic appearance) may appear as a map avatar. */
export function resolveMapCharacterAvatar(person: MapAvatarIdentity, ignoreNewHeadshot = false): MapAvatarAsset | null {
  // Preserve Soyo's already authored and approved headshot exactly.
  if (person.protagonistId === 'soyo' || person.personId === 'soyo' || person.name === '长崎素世') {
    return { kind: 'headshot', src: soyoHeadshot };
  }
  if (!ignoreNewHeadshot) {
    const crop = headshotFor(person);
    if (crop) return crop;
  }
  if (person.protagonistId === 'sakiko') {
    const art = getSakikoArt(downtownArtPack, { speaker: '丰川祥子', expression: 'neutral' });
    return art ? { kind: 'sprite', src: art.src } : null;
  }
  if (person.protagonistId === 'emma') {
    const src = majoExpressionFor('majo-emma', 'neutral');
    return src ? { kind: 'sprite', src } : null;
  }
  if (person.protagonistId === 'renako') {
    const src = watanareExpressionFor('watanare-renako', 'neutral');
    return src ? { kind: 'sprite', src } : null;
  }

  if (person.personId?.startsWith('majo-')) {
    const src = majoExpressionFor(person.personId, 'neutral');
    return src ? { kind: 'sprite', src } : null;
  }
  if (!person.protagonistId) {
    const byName = resolveMajoSpeaker(person.name);
    if (byName) {
      const src = majoExpressionFor(byName, 'neutral');
      if (src) return { kind: 'sprite', src };
    }
  }
  if (person.personId?.startsWith('watanare-')) {
    const src = watanareExpressionFor(person.personId, 'neutral');
    return src ? { kind: 'sprite', src } : null;
  }
  if (!person.protagonistId && (isMutsumiSpeaker(person.name) || isMutsumiSpeaker(person.personId ?? ''))) {
    const art = getMutsumiArt(downtownArtPack, { speaker: person.name || person.personId, expression: 'neutral' });
    return art ? { kind: 'sprite', src: art.src } : null;
  }
  if (!person.protagonistId && (isAnonSpeaker(person.name) || isAnonSpeaker(person.personId ?? ''))) {
    const art = getAnonArt(downtownArtPack, { speaker: person.name || person.personId, expression: 'neutral' });
    return art ? { kind: 'sprite', src: art.src } : null;
  }
  if (!person.protagonistId && (isRaanaSpeaker(person.name) || isRaanaSpeaker(person.personId ?? ''))) {
    const art = getRaanaArt(downtownArtPack, { speaker: person.name || person.personId, expression: 'neutral' });
    return art ? { kind: 'sprite', src: art.src } : null;
  }
  if (!person.protagonistId && (isTakiSpeaker(person.name) || isTakiSpeaker(person.personId ?? ''))) {
    const art = getTakiArt(downtownArtPack, { speaker: person.name || person.personId, expression: 'neutral' });
    return art ? { kind: 'sprite', src: art.src } : null;
  }
  if (!person.protagonistId && (isTomoriSpeaker(person.name) || isTomoriSpeaker(person.personId ?? ''))) {
    const tomoriSpeaker = isTomoriSpeaker(person.personId ?? '') ? person.personId : person.name;
    const art = getTomoriArt(downtownArtPack, { speaker: tomoriSpeaker, expression: 'neutral' });
    return art ? { kind: 'sprite', src: art.src } : null;
  }
  if (!person.protagonistId && (isNagasakiMotherSpeaker(person.name) || isNagasakiMotherSpeaker(person.personId ?? ''))) {
    const motherSpeaker = isNagasakiMotherSpeaker(person.personId ?? '') ? person.personId : person.name;
    const art = getNagasakiMotherArt(downtownArtPack, { speaker: motherSpeaker, expression: 'neutral' });
    return art ? { kind: 'sprite', src: art.src } : null;
  }
  const atlas = person.portraitId && Object.hasOwn(novelNpcAtlases, person.portraitId)
    ? novelNpcAtlases[person.portraitId] : null;
  if (!atlas) return null;
  const frame = atlas.frames.neutral;
  return { kind: 'atlas', src: atlas.source, x: frame.x, y: frame.y,
    width: frame.width, height: frame.height, atlasWidth: atlas.width, atlasHeight: atlas.height };
}

export function mapAvatarInitials(name: string): string {
  const characters = Array.from(name.trim()).filter(character => !/\s/.test(character));
  return characters.slice(-2).join('') || '?';
}
