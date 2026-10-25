import { describe, expect, it } from 'vitest';
import { resolveProtagonistPhonePose } from '../src/frontend/protagonist-phone-art';

describe('resolveProtagonistPhonePose', () => {
  it('shows each protagonist their own phone pose', () => {
    expect(resolveProtagonistPhonePose('soyo')?.protagonist).toBe('soyo');
    expect(resolveProtagonistPhonePose('emma')?.protagonist).toBe('emma');
    expect(resolveProtagonistPhonePose('sakiko')?.protagonist).toBe('sakiko');
  });

  it('gives Soyo and Emma the fixed pose regardless of location', () => {
    for (const protagonist of ['soyo', 'emma'] as const) {
      const pose = resolveProtagonistPhonePose(protagonist, { locationId: 'toyokawa-house' });
      expect(pose?.outfit).toBeNull();
      const elsewhere = resolveProtagonistPhonePose(protagonist, { locationId: 'library' });
      expect(elsewhere?.src).toBe(pose?.src);
      expect(pose?.width).toBeGreaterThan(0);
      expect(pose?.height).toBeGreaterThan(0);
    }
  });

  it('follows the standing Sakiko outfit policy', () => {
    const home = resolveProtagonistPhonePose('sakiko', { locationId: 'toyokawa-house' });
    expect(home?.outfit).toBe('home');
    const casual = resolveProtagonistPhonePose('sakiko', { locationId: 'library' });
    expect(casual?.outfit).toBe('casual');
    expect(casual?.src).not.toBe(home?.src);
    const explicit = resolveProtagonistPhonePose('sakiko', { locationId: 'toyokawa-house', outfit: 'casual' });
    expect(explicit?.outfit).toBe('casual');
    expect(explicit?.src).toBe(casual?.src);
  });

  it('returns inline data URLs only for the requested identity', () => {
    const soyo = resolveProtagonistPhonePose('soyo')!;
    const sakiko = resolveProtagonistPhonePose('sakiko', { locationId: 'toyokawa-salon' })!;
    expect(soyo.src.startsWith('data:image/webp;base64,')).toBe(true);
    expect(sakiko.src.startsWith('data:image/webp;base64,')).toBe(true);
    expect(soyo.src).not.toBe(sakiko.src);
  });
});
