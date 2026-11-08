import { describe, expect, it } from 'vitest';
import { getNovelBackground } from '../src/frontend/novel-backgrounds';

describe('Haneda airport supplied backgrounds', () => {
  it('uses three distinct bundled pictures with their actual time of day', () => {
    const variants = [getNovelBackground('haneda-airport', 12),
      getNovelBackground('haneda-airport', 18), getNovelBackground('haneda-airport', 22)];
    for (const [index, phase] of ['day', 'dusk', 'night'].entries()) {
      expect(variants[index]).toMatchObject({
        id: `haneda-airport-${phase}`, phase, imagePhase: phase, source: 'user-art',
      });
      expect(variants[index]!.src).toMatch(/^data:image\/webp;base64,/);
    }
    expect(new Set(variants.map(background => background.src)).size).toBe(3);
  });

  it('switches at the existing game-clock boundaries and defaults invalid hours to day', () => {
    for (const [hour, phase] of [[0, 'night'], [5.99, 'night'], [6, 'day'], [16.99, 'day'],
      [17, 'dusk'], [18.99, 'dusk'], [19, 'night'], [23.99, 'night'],
      [NaN, 'day'], [Infinity, 'day'], [-1, 'day'], [24, 'day']] as const) {
      expect(getNovelBackground('haneda-airport', hour).id).toBe(`haneda-airport-${phase}`);
    }
  });

  it('keeps overseas airports and nearby city locations on their existing art', () => {
    for (const hour of [12, 18, 22]) {
      expect(getNovelBackground('sfo-airport', hour)).toMatchObject({ source: 'legacy' });
      for (const location of ['sfo-airport', 'bus-stop', 'commercial', 'downtown', 'gate']) {
        expect(getNovelBackground(location, hour).id).not.toMatch(/^haneda-airport-/);
      }
    }
  });
});
