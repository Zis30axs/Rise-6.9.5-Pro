import { describe, expect, it } from 'vitest';
import { getSakikoArt, getDowntownArtBackground, nearToyokawaEntrance, type DowntownArtId, type DowntownArtPack } from '../src/frontend/downtown-art-runtime';
import { sakikoSpriteIds, downtownBackgroundIds } from '../src/frontend/sakiko-art-policy';

// Selection fixtures, not decoded/approved production artwork.
const makePack = (): DowntownArtPack => ({ ready: true, assets: Object.fromEntries(
  [...sakikoSpriteIds, ...downtownBackgroundIds].map((id, index) => [id, {
    id, src: `data:image/webp;base64,fixture${index}`, width: 512, height: 1024,
    sha256: index.toString(16).padStart(64, '0'), anchor: [256, 1000] as const,
  }]),
) });

describe('reviewed inline artwork selection', () => {
  it('never displays pending images even when assets were supplied', () => {
    const pack = { ...makePack(), ready: false };
    expect(getSakikoArt(pack, { speaker: 'sakiko', expression: 'smile' })).toBeNull();
    expect(getDowntownArtBackground(pack, { locationId: 'downtown', phase: 'day' })).toBeNull();
  });
  it('selects all six expressions in both outfits without changing input', () => {
    const pack = makePack(); const before = JSON.stringify(pack);
    for (const id of sakikoSpriteIds) {
      const [, outfit, expression] = id.split('_');
      expect(getSakikoArt(pack, { speaker: '丰川祥子', expression, outfit })?.id).toBe(id);
    }
    expect(JSON.stringify(pack)).toBe(before);
  });
  it('uses the matching home outfit in the house and casual elsewhere', () => {
    expect(getSakikoArt(makePack(), { speaker: '祥子', expression: '惊讶', locationId: 'toyokawa-house' })?.id).toBe('sakiko_home_surprised');
    expect(getSakikoArt(makePack(), { speaker: '祥子', expression: '惊讶', locationId: 'downtown' })?.id).toBe('sakiko_casual_surprised');
  });
  it('retains an explicit outfit selection across locations', () => {
    expect(getSakikoArt(makePack(), { speaker: 'sakiko', expression: 'sad', locationId: 'toyokawa-house', outfit: 'casual' })?.id).toBe('sakiko_casual_sad');
  });
  it('does not turn Soyo or another character into Sakiko', () => {
    for (const speaker of ['素世', 'soyo', 'lin', 'not-sakiko']) expect(getSakikoArt(makePack(), { speaker, expression: 'smile' })).toBeNull();
  });
  it('falls back only to neutral within the requested outfit', () => {
    const pack = makePack(); const assets = { ...pack.assets };
    delete assets.sakiko_home_sad;
    expect(getSakikoArt({ ...pack, assets }, { speaker: 'sakiko', expression: 'sad', outfit: 'home' })?.id).toBe('sakiko_home_neutral');
    delete assets.sakiko_home_neutral;
    expect(getSakikoArt({ ...pack, assets }, { speaker: 'sakiko', expression: 'sad', outfit: 'home' })).toBeNull();
  });
  it('rejects remote and executable image URLs', () => {
    const pack = makePack(); const id: DowntownArtId = 'sakiko_home_neutral';
    for (const src of ['https://example.org/private.webp', 'javascript:alert(1)', 'data:image/svg+xml,<svg/>']) {
      const assets = { ...pack.assets, [id]: { ...pack.assets[id]!, src } };
      expect(getSakikoArt({ ...pack, assets }, { speaker: 'sakiko', expression: 'neutral', outfit: 'home' })).toBeNull();
    }
  });
  it('selects distinct mansion images using the existing phase', () => {
    for (const phase of ['day', 'dusk', 'night'] as const) {
      expect(getDowntownArtBackground(makePack(), { locationId: 'downtown', phase, atHouseEntrance: true })?.id).toBe(`toyokawa_mansion_${phase}`);
    }
  });
  it('does not mistake the house interior for the outdoor mansion', () => {
    expect(getDowntownArtBackground(makePack(), { locationId: 'toyokawa-house', phase: 'night', atHouseEntrance: true })).toMatchObject({ id: 'toyokawa_living_room', phase: 'night', imagePhase: 'day' });
  });
  it('uses daylight downtown art with a truthful dusk shade', () => {
    expect(getDowntownArtBackground(makePack(), { locationId: 'downtown', phase: 'dusk' })).toMatchObject({ id: 'downtown_day', phase: 'dusk', imagePhase: 'day' });
    expect(getDowntownArtBackground(makePack(), { locationId: 'downtown', phase: 'night' })?.id).toBe('downtown_night');
  });
  it('leaves unrelated locations on their existing artwork', () => {
    expect(getDowntownArtBackground(makePack(), { locationId: 'library', phase: 'day' })).toBeNull();
  });
  it('requires a real nearby scene position for a house-front view', () => {
    const entrance = { x: 100, z: 200 };
    expect(nearToyokawaEntrance({ x: 103, z: 204 }, entrance)).toBe(true);
    expect(nearToyokawaEntrance({ x: 104, z: 204 }, entrance)).toBe(false);
    expect(nearToyokawaEntrance(null, entrance)).toBe(false);
    expect(nearToyokawaEntrance({ x: NaN, z: 200 }, entrance)).toBe(false);
    expect(nearToyokawaEntrance(entrance, entrance, -1)).toBe(false);
  });
});
