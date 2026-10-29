import { describe, expect, it } from 'vitest';
import { getNovelBackground } from '../src/frontend/novel-backgrounds';

describe('court hearing backdrop', () => {
  it('uses the supplied indoor photograph at every game hour', () => {
    const noon = getNovelBackground('court-hearing', 12);
    const dusk = getNovelBackground('court-hearing', 18);
    const night = getNovelBackground('court-hearing', 21);
    expect(noon).toMatchObject({ id: 'court-hearing-day', phase: 'day', imagePhase: 'day', source: 'user-art' });
    expect(noon.src).toMatch(/^data:image\/avif;base64,/);
    expect(dusk).toEqual({ ...noon, phase: 'dusk' });
    expect(night).toEqual({ ...noon, phase: 'night' });
  });

  it('does not replace the law office or the generic street plate', () => {
    expect(getNovelBackground('legal-office', 12).id).toBe('legal-office-day');
    expect(getNovelBackground('grand-commercial', 12).id).not.toBe('court-hearing-day');
    expect(getNovelBackground('court-hearing', 12).src).not.toBe(getNovelBackground('legal-office', 12).src);
  });
});
