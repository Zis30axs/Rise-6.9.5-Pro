import { describe, expect, it } from 'vitest';
import { getNovelBackground } from '../src/frontend/novel-backgrounds';

describe('legal office day and night backdrops', () => {
  it('uses two distinct inline AVIF backgrounds at the correct game hours', () => {
    const day = getNovelBackground('legal-office', 12);
    const dusk = getNovelBackground('legal-office', 18);
    const night = getNovelBackground('legal-office', 19);
    expect(day).toMatchObject({ id: 'legal-office-day', phase: 'day', imagePhase: 'day', source: 'user-art' });
    expect(night).toMatchObject({ id: 'legal-office-night', phase: 'night', imagePhase: 'night', source: 'user-art' });
    expect(day.src).toMatch(/^data:image\/avif;base64,/);
    expect(night.src).toMatch(/^data:image\/avif;base64,/);
    expect(day.src).not.toBe(night.src);
    expect(dusk).toEqual({ ...day, phase: 'dusk' });
  });

  it('changes at 06:00 and 19:00, using game time rather than system time', () => {
    expect(getNovelBackground('legal-office', 5).id).toBe('legal-office-night');
    expect(getNovelBackground('legal-office', 6).id).toBe('legal-office-day');
    expect(getNovelBackground('legal-office', 16).id).toBe('legal-office-day');
    expect(getNovelBackground('legal-office', 17)).toMatchObject({ phase: 'dusk', imagePhase: 'day' });
    expect(getNovelBackground('legal-office', 19).id).toBe('legal-office-night');
    expect(getNovelBackground('legal-office', 23).id).toBe('legal-office-night');
  });

  it('does not replace other workplace or classroom illustrations', () => {
    for (const location of ['mlm-office', 'classroom', 'study-room', 'construction-site']) {
      expect(getNovelBackground(location, 12).id).not.toBe('legal-office-day');
      expect(getNovelBackground(location, 22).id).not.toBe('legal-office-night');
    }
  });
});
