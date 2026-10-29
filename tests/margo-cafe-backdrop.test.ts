import { describe, expect, it } from 'vitest';
import dayArt from '../assets/backgrounds/margo-cafe-day.avif?inline';
import nightArt from '../assets/backgrounds/margo-cafe-night.avif?inline';
import { getNovelBackground } from '../src/frontend/novel-backgrounds';

describe('margo cafe day and night backdrops', () => {
  it('uses the day image at 14:00 and the night image at 01:00', () => {
    const day = getNovelBackground('margo-cafe-room', 14);
    const night = getNovelBackground('margo-cafe-room', 1);
    expect(day).toMatchObject({
      id: 'majo-margo-cafe-room', phase: 'day', imagePhase: 'day', source: 'majo-art',
    });
    expect(night).toMatchObject({
      id: 'majo-margo-cafe-room-night', phase: 'night', imagePhase: 'night', source: 'majo-art',
    });
    expect(day.src).toBe(dayArt);
    expect(night.src).toBe(nightArt);
    expect(day.src).toMatch(/^data:image\/avif;base64,/);
    expect(night.src).toMatch(/^data:image\/avif;base64,/);
    expect(day.src).not.toBe(night.src);
  });

  it('uses the night image during dusk', () => {
    const dusk = getNovelBackground('margo-cafe-room', 18);
    expect(dusk).toMatchObject({ phase: 'dusk', imagePhase: 'night' });
    expect(dusk.src).toBe(nightArt);
    expect(dusk.src).toBe(getNovelBackground('margo-cafe-room', 1).src);
  });

  it('keeps single-image rooms on their existing picture', () => {
    const homeDay = getNovelBackground('emma-yuki-home', 14);
    const homeNight = getNovelBackground('emma-yuki-home', 1);
    expect(homeDay).toMatchObject({ id: 'majo-emma-yuki-home', imagePhase: 'day', source: 'majo-art' });
    expect(homeNight).toEqual({ ...homeDay, phase: 'night' });
    expect(homeDay.src).not.toBe(dayArt);
    expect(getNovelBackground('street-cafe', 14).id).toBe('commercial-day');
    expect(getNovelBackground('street-cafe', 1).src).not.toBe(nightArt);
  });
});
