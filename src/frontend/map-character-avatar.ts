import soyoHeadshot from '../../assets/map-avatars/soyo.webp?inline';
import type { ProtagonistId } from '../runtime/dual-protagonists';
import type { CharacterPortraitId } from './types';
import { downtownArtPack } from './generated/downtown-art';
import { getAnonArt, getMutsumiArt, getSakikoArt } from './downtown-art-runtime';
import { isAnonSpeaker } from './anon-art-policy';
import { isMutsumiSpeaker } from './mutsumi-art-policy';
import { majoExpressionFor, resolveMajoSpeaker } from './majo-art';
import { watanareExpressionFor } from './watanare-art';
import { novelNpcAtlases } from './novel-npc-atlases';

export interface MapAvatarIdentity {
  name: string;
  personId?: string | null;
  portraitId?: CharacterPortraitId | null;
  protagonistId?: ProtagonistId | null;
}

export type MapAvatarAsset =
  | { kind: 'sprite'; src: string }
  | { kind: 'atlas'; src: string; x: number; y: number; width: number; height: number; atlasWidth: number; atlasHeight: number };

/** Only an identity-confirmed sprite (or that pedestrian's saved generic appearance) may appear as a map avatar. */
export function resolveMapCharacterAvatar(person: MapAvatarIdentity): MapAvatarAsset | null {
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
  if (person.protagonistId === 'soyo') return { kind: 'sprite', src: soyoHeadshot };

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
