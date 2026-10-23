import { describe, expect, it } from 'vitest';
import { fitSoyoPortrait } from '../src/frontend/live2d-soyo-fit';

describe('Soyo Live2D complete bottom-aligned layout', () => {
  const stages = [
    { name: '1440x900 desktop', width: 1330, height: 500 },
    { name: '1280x800 desktop', width: 1170, height: 400 },
    { name: '390x844 mobile', width: 390, height: 409 },
    { name: '320x568 short mobile', width: 166, height: 206 },
  ];

  for (const { name, width, height } of stages) {
    it(`contains both wide and tall models on ${name}, aligned to the bottom`, () => {
      for (const { modelWidth, modelHeight } of [
        { modelWidth: 550, modelHeight: 900 },
        { modelWidth: 900, modelHeight: 550 },
      ]) {
        const fit = fitSoyoPortrait(width, height, modelWidth, modelHeight)!;
        expect(fit.x).toBe(width / 2);
        expect(fit.y).toBe(height);
        expect(fit.scale).toBeCloseTo(Math.min(width / modelWidth, height / modelHeight));
        expect(fit.x - fit.scale * modelWidth / 2).toBeGreaterThanOrEqual(-0.001);
        expect(fit.x + fit.scale * modelWidth / 2).toBeLessThanOrEqual(width + 0.001);
        expect(fit.y - fit.scale * modelHeight).toBeGreaterThanOrEqual(-0.001);
        expect(fit.y).toBeLessThanOrEqual(height);
      }
    });
  }

  it('does not send invalid model or canvas dimensions to Pixi', () => {
    expect(fitSoyoPortrait(0, 500, 550, 900)).toBeNull();
    expect(fitSoyoPortrait(390, 0, 550, 900)).toBeNull();
    expect(fitSoyoPortrait(390, 409, 0, 900)).toBeNull();
    expect(fitSoyoPortrait(390, 409, 550, NaN)).toBeNull();
    expect(fitSoyoPortrait(Infinity, 409, 550, 900)).toBeNull();
  });
});
