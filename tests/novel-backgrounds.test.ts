import { describe, expect, it } from 'vitest';
import { getNovelBackground, novelBackgroundLocations, novelBackgroundPhase } from '../src/frontend/novel-backgrounds';
import { locations } from '../src/runtime/model';

describe('bundled novel backgrounds', () => {
  it('covers every existing destination and keeps indoor choices separate from their outdoor parent', () => {
    for (const location of locations) expect(Object.hasOwn(novelBackgroundLocations, location.id), location.id).toBe(true);
    expect(getNovelBackground('dorm-room', 12).id).toBe('bedroom-day');
    expect(getNovelBackground('dorm', 12).id).toBe('street-day');
    expect(getNovelBackground('classroom', 12).id).toBe('classroom-day');
    expect(getNovelBackground('teaching', 12).id).toBe('park-day');
    expect(getNovelBackground('bus-stop', 12).id).toBe('street-day');
  });

  it('selects the supplied daylight, sunset and night variants from the saved world hour', () => {
    expect([0, 5.99, 6, 16.99, 17, 18.99, 19, 23.99].map(novelBackgroundPhase)).toEqual(['night', 'night', 'day', 'day', 'dusk', 'dusk', 'night', 'night']);
    const day = getNovelBackground('commercial', 10), dusk = getNovelBackground('commercial', 17), night = getNovelBackground('commercial', 21);
    expect([day.id, dusk.id, night.id]).toEqual(['commercial-day', 'commercial-dusk', 'commercial-night']);
    expect(new Set([day.src, dusk.src, night.src]).size).toBe(3);
    expect(getNovelBackground('commercial', 21)).toEqual(night);
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
