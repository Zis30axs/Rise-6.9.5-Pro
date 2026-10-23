import { describe, expect, it } from 'vitest';
import { getNovelBackground, novelBackgroundLocations, novelBackgroundPhase } from '../src/frontend/novel-backgrounds';
import { majoDistrictArt, majoInteriorArt } from '../src/frontend/majo-art';
import { locations } from '../src/runtime/model';

describe('bundled novel backgrounds', () => {
  it('covers every existing destination and keeps indoor choices separate from their outdoor parent', () => {
    for (const location of locations) {
      expect(Object.hasOwn(novelBackgroundLocations, location.id) || getNovelBackground(location.id, 12).source === 'majo-art', location.id).toBe(true);
    }
    expect(getNovelBackground('dorm-room', 12).id).toBe('bedroom-day');
    expect(getNovelBackground('dorm', 12).id).toBe('street-day');
    expect(getNovelBackground('classroom', 12).id).toBe('classroom-day');
    expect(getNovelBackground('teaching', 12).id).toBe('park-day');
    expect(getNovelBackground('bus-stop', 12).id).toBe('street-day');
    expect(getNovelBackground('margo-cafe-room', 12)).toMatchObject({ src: majoInteriorArt['emma-yuki-home'], source: 'majo-art' });
    expect(getNovelBackground('margo-cafe-room', 12).src).not.toBe(getNovelBackground('street-cafe', 12).src);
  });

  it('selects the supplied daylight, sunset and night variants from the saved world hour', () => {
    expect([0, 5.99, 6, 16.99, 17, 18.99, 19, 23.99].map(novelBackgroundPhase)).toEqual(['night', 'night', 'day', 'day', 'dusk', 'dusk', 'night', 'night']);
    const day = getNovelBackground('gate', 10), dusk = getNovelBackground('gate', 17), night = getNovelBackground('gate', 21);
    expect([day.id, dusk.id, night.id]).toEqual(['street-day', 'street-dusk', 'street-night']);
    expect(new Set([day.src, dusk.src, night.src]).size).toBe(3);
    expect(getNovelBackground('gate', 21)).toEqual(night);
  });

  it('uses recovered PR #16 art for the registered interiors and three residential districts', () => {
    expect(getNovelBackground('nikaido-house', 10)).toMatchObject({
      id: 'majo-nikaido-house', src: majoInteriorArt['nikaido-house'], source: 'majo-art', imagePhase: 'day',
    });
    for (const interior of Object.keys(majoInteriorArt)) {
      const background = getNovelBackground(interior, 12);
      expect(background.source, interior).toBe('majo-art');
      expect(background.src, interior).toBe(majoInteriorArt[interior]);
    }
    expect(getNovelBackground('home', 12)).toMatchObject({ id: 'majo-home', src: majoDistrictArt['old-town-lowrise'] });
    expect(getNovelBackground('commercial', 17)).toMatchObject({ id: 'majo-commercial', src: majoDistrictArt['riverfront-highrise'], imagePhase: 'dusk' });
    expect(getNovelBackground('neighborhood', 12)).toMatchObject({ id: 'majo-neighborhood', src: majoDistrictArt['older-apartment-courtyard'] });
    // No dedicated PR #16 art was recovered for these two districts; they keep the authored legacy image.
    expect(getNovelBackground('downtown', 12).source).not.toBe('majo-art');
    expect(getNovelBackground('city-park', 12).source).not.toBe('majo-art');
  });

  it('keeps a missing bedroom night variant stable while exposing night only as a visual shade', () => {
    const day = getNovelBackground('dorm-room', 12), night = getNovelBackground('dorm-room', 23);
    expect(night).toEqual({ ...day, phase: 'night' });
    expect(night.imagePhase).toBe('day');
  });

  it('uses local default backgrounds for unknown locations and malformed hours', () => {
    for (const location of ['', 'unknown', '__proto__', 'constructor', 'https://example.test/image.webp']) {
      expect(getNovelBackground(location, 12)).toEqual(getNovelBackground('gate', 12));
    }
    for (const hour of [NaN, Infinity, -1, 24]) expect(novelBackgroundPhase(hour)).toBe('day');
  });
});
