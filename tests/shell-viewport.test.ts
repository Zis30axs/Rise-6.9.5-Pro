import { describe, expect, it } from 'vitest';
import { readVisibleViewport } from '../src/frontend/shell-viewport';

const view = (width = 390, height = 844, visualViewport: unknown = null) => ({
  innerWidth: width, innerHeight: height, visualViewport,
  document: { documentElement: { clientWidth: width, clientHeight: height } },
}) as unknown as Window;

describe('actual Shell viewport, independent of CSS dvh', () => {
  it('keeps desktop bounds when VisualViewport is unavailable', () => {
    expect(readVisibleViewport(view(1440, 900))).toEqual({ left: 0, top: 0, width: 1440, height: 900 });
  });
  it('uses the smaller visible height instead of an oversized layout viewport', () => {
    expect(readVisibleViewport(view(390, 844, { width: 390, height: 780, offsetTop: 0, offsetLeft: 0 })).height).toBe(780);
  });
  it('supports keyboard shrink and visual viewport pan together', () => {
    expect(readVisibleViewport(view(390, 844, { width: 390, height: 390, offsetTop: 180, offsetLeft: 0 })))
      .toEqual({ left: 0, top: 180, width: 390, height: 390 });
  });
  it('does not trust invalid or transient zero-sized viewport readings', () => {
    expect(readVisibleViewport(view(320, 568, { width: NaN, height: 0, offsetTop: -10, offsetLeft: -20 })))
      .toEqual({ left: 0, top: 0, width: 320, height: 568 });
  });
  it('never expands beyond innerHeight or rounds up into a clipped pixel', () => {
    expect(readVisibleViewport(view(390, 780, { width: 389.8, height: 844, offsetTop: 0, offsetLeft: 0 })))
      .toEqual({ left: 0, top: 0, width: 389, height: 780 });
  });
});
