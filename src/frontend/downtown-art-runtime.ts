import { selectAnonSprite, type AnonOutfit, type AnonPose, type AnonSpriteId } from './anon-art-policy';
import { selectMutsumiSprite, type MutsumiOutfit, type MutsumiPose, type MutsumiSpriteId } from './mutsumi-art-policy';
import { selectRaanaSprite, type RaanaOutfit, type RaanaPose, type RaanaSpriteId } from './raana-art-policy';
import { selectSakikoSprite, type SakikoSpriteId, type SakikoOutfit, type SakikoExpression } from './sakiko-art-policy';

export type ArtPhase = 'day' | 'dusk' | 'night';
export type DowntownBackgroundId = 'toyokawa_mansion_day' | 'toyokawa_mansion_dusk' | 'toyokawa_mansion_night' | 'toyokawa_living_room' | 'downtown_day' | 'downtown_night';
export type DowntownArtId = SakikoSpriteId | MutsumiSpriteId | AnonSpriteId | RaanaSpriteId | DowntownBackgroundId;
export interface DowntownArtAsset {
  readonly id: DowntownArtId;
  readonly src: string;
  readonly width: number;
  readonly height: number;
  readonly sha256: string;
  readonly anchor?: readonly [number, number];
}
export interface DowntownArtPack {
  readonly ready: boolean;
  readonly reason?: string;
  readonly assets: Readonly<Partial<Record<DowntownArtId, DowntownArtAsset>>>;
}

/** Accept inlined approved PNG/WebP and local Blob URLs restored from the SHA-verified Lite ZIP. */
function asset(pack: DowntownArtPack, id: DowntownArtId): DowntownArtAsset | null {
  if (!pack.ready || !Object.hasOwn(pack.assets, id)) return null;
  const image = pack.assets[id];
  if (!image || image.id !== id || typeof image.src !== 'string'
      || (!image.src.startsWith('data:image/webp;base64,') && !image.src.startsWith('data:image/png;base64,') && !image.src.startsWith('blob:'))
      || !Number.isInteger(image.width) || !Number.isInteger(image.height)
      || image.width <= 0 || image.height <= 0 || !/^[a-f0-9]{64}$/.test(image.sha256)) return null;
  return image;
}

export function getSakikoArt(pack: DowntownArtPack, options: {
  speaker: unknown; expression: unknown; locationId?: unknown; outfit?: unknown;
}): (DowntownArtAsset & { outfit: SakikoOutfit; expression: SakikoExpression }) | null {
  const selection = selectSakikoSprite(options);
  if (!selection) return null;
  const exact = asset(pack, selection.id);
  if (exact) return { ...exact, outfit: selection.outfit, expression: selection.expression };
  // A missing emotion may use the SAME outfit's neutral frame, never a different dress.
  const neutral = asset(pack, `sakiko_${selection.outfit}_neutral`);
  return neutral ? { ...neutral, outfit: selection.outfit, expression: 'neutral' } : null;
}

export function getMutsumiArt(pack: DowntownArtPack, options: {
  speaker: unknown; expression: unknown;
}): (DowntownArtAsset & { outfit: MutsumiOutfit; expression: SakikoExpression; pose: MutsumiPose }) | null {
  const selection = selectMutsumiSprite(options);
  if (!selection) return null;
  const exact = asset(pack, selection.id);
  if (exact) return { ...exact, outfit: selection.outfit, expression: selection.expression, pose: selection.pose };
  const neutral = asset(pack, 'mutsumi_uniform_neutral');
  return neutral ? { ...neutral, outfit: 'uniform', expression: 'neutral', pose: 'neutral' } : null;
}

export function getAnonArt(pack: DowntownArtPack, options: {
  speaker: unknown; expression: unknown;
}): (DowntownArtAsset & { outfit: AnonOutfit; expression: SakikoExpression; pose: AnonPose }) | null {
  const selection = selectAnonSprite(options);
  if (!selection) return null;
  const exact = asset(pack, selection.id);
  if (exact) return { ...exact, outfit: selection.outfit, expression: selection.expression, pose: selection.pose };
  const calm = asset(pack, 'anon_uniform_smile');
  return calm ? { ...calm, outfit: 'uniform', expression: 'neutral', pose: 'smile' } : null;
}

export function getRaanaArt(pack: DowntownArtPack, options: {
  speaker: unknown; expression: unknown;
}): (DowntownArtAsset & { outfit: RaanaOutfit; expression: SakikoExpression; pose: RaanaPose }) | null {
  const selection = selectRaanaSprite(options);
  if (!selection) return null;
  const exact = asset(pack, selection.id);
  if (exact) return { ...exact, outfit: selection.outfit, expression: selection.expression, pose: selection.pose };
  const neutral = asset(pack, 'raana_uniform_neutral');
  return neutral ? { ...neutral, outfit: 'uniform', expression: 'neutral', pose: 'neutral' } : null;
}

export function nearToyokawaEntrance(
  scene: { x: number; z: number } | null | undefined,
  entrance: { x: number; z: number } | null | undefined,
  radius = 5,
): boolean {
  if (!scene || !entrance || ![scene.x, scene.z, entrance.x, entrance.z, radius].every(Number.isFinite) || radius <= 0) return false;
  return Math.hypot(scene.x - entrance.x, scene.z - entrance.z) <= radius;
}

/** Pure image selection. No second clock, model request, state write or location change. */
export function getDowntownArtBackground(pack: DowntownArtPack, options: {
  locationId: string; phase: ArtPhase; atHouseEntrance?: boolean;
}): { id: DowntownBackgroundId; src: string; phase: ArtPhase; imagePhase: ArtPhase } | null {
  let id: DowntownBackgroundId;
  let imagePhase: ArtPhase = options.phase;
  if (options.locationId === 'toyokawa-house' || options.locationId === 'toyokawa-salon') {
    id = 'toyokawa_living_room'; imagePhase = 'day';
  } else if (options.locationId === 'toyokawa-estate' || options.locationId === 'toyokawa-gate'
      || (options.locationId === 'downtown' && options.atHouseEntrance)) {
    id = `toyokawa_mansion_${options.phase}`;
  } else if (options.locationId === 'downtown') {
    imagePhase = options.phase === 'night' ? 'night' : 'day';
    id = `downtown_${imagePhase}`;
  } else return null;
  const found = asset(pack, id);
  return found ? { id, src: found.src, phase: options.phase, imagePhase } : null;
}
