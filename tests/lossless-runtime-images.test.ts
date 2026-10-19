import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { novelNpcAtlases } from '../src/frontend/novel-npc-atlases';
import { getStoreProductImage } from '../src/frontend/store-product-images';
import type { NovelNpcPortraitId } from '../src/frontend/novel-npc-portraits';

const products = ['meal-basic', 'meal-standard', 'meal-premium', 'snack-basic', 'snack-standard', 'snack-premium', 'drink-basic', 'drink-standard', 'drink-premium', 'cigarette-basic', 'cigarette-standard', 'cigarette-premium'];
const portraits: NovelNpcPortraitId[] = ['deepseek', 'xiaoyang', 'claude'];
const source = (path: string) => readFileSync(resolve(path));
const json = (path: string) => JSON.parse(source(path).toString('utf8'));
const hash = (value: Buffer) => createHash('sha256').update(value).digest('hex');
const expectRuntimeImage = (reference: string | null, path: string) => {
  if (reference?.startsWith('data:')) {
    expect(reference).toBe(`data:image/webp;base64,${source(path).toString('base64')}`);
  } else {
    expect(reference).toBe(`/${path}?inline`);
  }
};

describe('exact-pixel runtime image derivatives', () => {
  it.each([
    { directory: 'assets/store-products', key: 'images', ids: products },
    { directory: 'assets/npc-portraits/expression-atlases-v3', key: 'portraits', ids: portraits },
  ])('retains original source hashes and smaller lossless images in $directory', ({ directory, key, ids }) => {
    const provenance = json(`${directory}/manifest.json`);
    const derived = json(`${directory}/lossless/manifest.json`);
    expect(derived.encoding).toEqual({ format: 'WEBP', lossless: true, quality: 100, method: 6, exact: true });
    expect(derived.sourcePngsPreserved).toBe(true);
    expect(derived.images.map((row: { id: string }) => row.id)).toEqual(ids);
    let originalBytes = 0, derivedBytes = 0;
    for (const id of ids) {
      const original = provenance[key].find((row: { id: string }) => row.id === id);
      const row = derived.images.find((image: { id: string }) => image.id === id);
      const png = source(`${directory}/${id}.png`), webp = source(`${directory}/lossless/${id}.webp`);
      expect(hash(png)).toBe(original.sha256);
      expect(row).toMatchObject({
        source: `${directory}/${id}.png`, file: `${id}.webp`,
        sourceSha256: hash(png), sha256: hash(webp), sourceBytes: png.length, bytes: webp.length,
        width: original.width, height: original.height, mode: 'RGBA', allRgbaBytesEqual: true,
      });
      expect(row.rgbaSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(webp.subarray(0, 4).toString()).toBe('RIFF');
      expect(webp.subarray(8, 16).toString()).toBe('WEBPVP8L');
      expect(webp.length).toBeLessThan(png.length);
      originalBytes += png.length; derivedBytes += webp.length;
    }
    expect(derived.sourceBytes).toBe(originalBytes);
    expect(derived.bytes).toBe(derivedBytes);
  });

  it('uses the exact derivative of every fixed product without accepting arbitrary image paths', () => {
    for (const id of products) {
      expectRuntimeImage(getStoreProductImage(id), `assets/store-products/lossless/${id}.webp`);
    }
    expect(new Set(products.map(getStoreProductImage)).size).toBe(12);
    for (const id of ['__proto__', 'constructor', '../meal-basic', 'meal-basic.png', 'https://example.invalid/a.webp', '']) {
      expect(getStoreProductImage(id)).toBeNull();
    }
  });

  it('keeps all 27 portrait frames and dimensions unchanged while switching only the image source', () => {
    const directory = 'assets/npc-portraits/expression-atlases-v3';
    const originals = json(`${directory}/manifest.json`).portraits;
    for (const id of portraits) {
      const original = originals.find((row: { id: string }) => row.id === id);
      expectRuntimeImage(novelNpcAtlases[id].source, `${directory}/lossless/${id}.webp`);
      expect(novelNpcAtlases[id]).toMatchObject({ width: original.width, height: original.height, frames: original.frames });
      expect(Object.keys(novelNpcAtlases[id].frames)).toHaveLength(9);
    }
  });
});
