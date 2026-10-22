import type { ProtagonistId } from '../runtime/dual-protagonists';
import type { CharacterPortraitId } from './types';
import { downtownArtPack } from './generated/downtown-art';
import { getSakikoArt } from './downtown-art-runtime';
import { majoExpressionFor } from './majo-art';
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
  // Soyo's existing Cubism textures are UV atlases, not a flat portrait.
  if (person.protagonistId === 'soyo') return null;

  if (person.personId?.startsWith('majo-')) {
    const src = majoExpressionFor(person.personId, 'neutral');
    return src ? { kind: 'sprite', src } : null;
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
