import { describe, expect, it } from 'vitest';
import { getNovelBackground } from '../src/frontend/novel-backgrounds';

describe('Shinjuku district court hearing backdrop', () => {
  it('uses the provided local courtroom picture without network requests', () => {
    const day = getNovelBackground('court-hearing', 10);
    expect(day).toMatchObject({ id: 'court-hearing-day', phase: 'day', imagePhase: 'day', source: 'user-art' });
    expect(day.src).toMatch(/^data:image\/avif;base64,/);
    expect(day.src).not.toMatch(/^https?:/i);
    expect(getNovelBackground('court-hearing', 18)).toEqual({ ...day, phase: 'dusk' });
    expect(getNovelBackground('court-hearing', 21)).toEqual({ ...day, phase: 'night' });
    expect(getNovelBackground('court-hearing', 5)).toEqual({ ...day, phase: 'night' });
  });

  it('replaces the street fallback only for the hearing room', () => {
    expect(getNovelBackground('court-hearing', 12).id).not.toBe('street-day');
    expect(getNovelBackground('legal-office', 12).id).toBe('legal-office-day');
    expect(getNovelBackground('grand-commercial', 12).id).not.toBe('court-hearing-day');
    expect(getNovelBackground('mlm-office', 12).id).not.toBe('court-hearing-day');
  });
});
