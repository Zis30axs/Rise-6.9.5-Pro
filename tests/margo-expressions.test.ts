import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { majoArtStatus, majoEmotions, majoExpressionFor, majoExpressionSets, resolveMajoExpressionPortrait } from '../src/frontend/majo-art';
import { resolveMapCharacterAvatar } from '../src/frontend/map-character-avatar';
import type { NovelNpcEmotion } from '../src/frontend/novel-npc-emotions';

const root = process.cwd();
const authored: Readonly<Record<'neutral' | 'happy' | 'shy' | 'angry' | 'surprised', string>> = {
  neutral: 'characters/majo-margo/neutral.avif',
  happy: 'characters/majo-margo/happy.avif',
  shy: 'characters/majo-margo/shy.avif',
  angry: 'characters/majo-margo/extras/angry.avif',
  surprised: 'characters/majo-margo/extras/surprised.avif',
};
const fallbacks: readonly NovelNpcEmotion[] = ['sad', 'thinking', 'serious', 'relieved'];

describe('Margo dialogue portraits', () => {
  it('uses her own art for angry and surprised and her neutral sprite for the other missing emotions', () => {
    const set = majoExpressionSets['majo-margo']!;
    expect(majoEmotions).toEqual(['neutral', 'happy', 'sad', 'angry', 'surprised', 'shy', 'thinking', 'serious', 'relieved']);
    expect(set).toMatchObject({
      personId: 'majo-margo', tier: 'semi-main', targetExpressions: 3, completedExpressions: 5, complete: true, width: 768, height: 1024,
    });
    expect(Object.keys(set.expressions).sort()).toEqual(['angry', 'happy', 'neutral', 'shy', 'surprised']);
    expect(new Set(Object.values(set.expressions)).size).toBe(5);

    for (const emotion of ['neutral', 'happy', 'shy', 'angry', 'surprised'] as const) {
      const portrait = resolveMajoExpressionPortrait('宝生玛格', emotion);
      expect(portrait, emotion).toMatchObject({
        personId: 'majo-margo', src: set.expressions[emotion], width: 768, height: 1024, exact: true,
      });
      expect(portrait?.src.startsWith('data:image/avif'), emotion).toBe(true);
      expect(majoExpressionFor('majo-margo', emotion)).toBe(set.expressions[emotion]);
    }
    const neutral = set.expressions.neutral;
    for (const emotion of fallbacks) {
      expect(resolveMajoExpressionPortrait('玛格', emotion), emotion).toMatchObject({
        personId: 'majo-margo', src: neutral, exact: false,
      });
    }
    expect(resolveMajoExpressionPortrait('宝生玛格', 'angry')?.src).not.toBe(neutral);
    expect(resolveMajoExpressionPortrait('宝生玛格', 'surprised')?.src).not.toBe(neutral);
    expect(resolveMajoExpressionPortrait('宝生玛格', 'angry')?.src).not.toBe(resolveMajoExpressionPortrait('宝生玛格', 'surprised')?.src);
  });

  it('keeps the map avatar on her neutral sprite', () => {
    const neutral = majoExpressionSets['majo-margo']!.expressions.neutral;
    expect(resolveMapCharacterAvatar({ name: '宝生玛格', personId: 'majo-margo' })).toEqual({ kind: 'sprite', src: neutral });
  });

  it('records five authored expressions and leaves every other resident unchanged', () => {
    expect(majoArtStatus.find(row => row.personId === 'majo-margo')).toMatchObject({
      tier: 'semi-main', targetExpressions: 3, expressions: 5, complete: true, outfit: '紫黑哥特和风',
    });
    expect(majoExpressionSets['majo-hiro'] && Object.keys(majoExpressionSets['majo-hiro'].expressions).sort()).toEqual(['happy', 'neutral', 'shy']);
    expect(majoExpressionSets['majo-emma'] && Object.keys(majoExpressionSets['majo-emma'].expressions)).toHaveLength(9);
    expect(majoArtStatus.filter(row => row.personId !== 'majo-margo' && row.complete && row.tier === 'semi-main').every(row => row.expressions === 3)).toBe(true);
  });

  it('lists the five committed AVIF files in the runtime manifest', () => {
    const manifest = JSON.parse(readFileSync(join(root, 'assets/majo-runtime/manifest.json'), 'utf8')) as {
      assets: Array<{ personId?: string; emotion?: string; file: string; bytes: number; sha256: string; width: number; height: number; mime: string; alpha: boolean }>;
    };
    const rows = manifest.assets.filter(row => row.personId === 'majo-margo');
    expect(rows.map(row => row.emotion)).toEqual(['neutral', 'happy', 'shy', 'angry', 'surprised']);
    for (const row of rows) {
      const relative = authored[row.emotion as keyof typeof authored];
      expect(row.file).toBe(relative);
      const bytes = readFileSync(join(root, 'assets/majo-runtime', row.file));
      expect(bytes.length).toBe(row.bytes);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(row.sha256);
      expect(bytes.subarray(4, 12).toString('ascii')).toBe('ftypavif');
      expect(row).toMatchObject({ mime: 'image/avif', width: 768, height: 1024, alpha: true });
    }
  });
});
