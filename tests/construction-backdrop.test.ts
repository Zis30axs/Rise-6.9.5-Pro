import { describe, expect, it } from 'vitest';
import { getNovelBackground } from '../src/frontend/novel-backgrounds';

describe('construction site backdrop', () => {
  it('uses the provided local picture without network requests', () => {
    const day = getNovelBackground('construction-site', 9);
    expect(day.id).toBe('construction-site-day');
    expect(day.source).toBe('user-art');
    expect(day.src).toMatch(/^data:image\/avif;base64,/);
    expect(day.imagePhase).toBe('day');
    expect(day.phase).toBe('day');
    expect(getNovelBackground('construction-site', 19)).toEqual({ ...day, phase: 'night' });
  });

  it('does not change other existing backgrounds', () => {
    expect(getNovelBackground('bookshop', 12).id).not.toBe('construction-site-day');
    expect(getNovelBackground('mlm-office', 12).id).not.toBe('construction-site-day');
  });
});
