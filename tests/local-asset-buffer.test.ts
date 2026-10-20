import { describe, expect, it, vi } from 'vitest';
import { readLocalAssetBytes } from '../src/frontend/local-asset-buffer';

describe('local verified asset bytes for Lite and full cards', () => {
  it('preserves embedded Base64 decoder behavior and denies remote URL', async () => {
    expect([...await readLocalAssetBytes('data:application/octet-stream;base64,QUJD', 40, 'invalid')]).toEqual([65, 66, 67]);
    await expect(readLocalAssetBytes('https://example.org/a.glb', 40, 'invalid')).rejects.toThrow('invalid');
    await expect(readLocalAssetBytes('data:application/octet-stream;base64,QUJD', 2, 'too large')).rejects.toThrow('too large');
  });
  it('accepts only local Blob URL resources subject to original size bound', async () => {
    const fetcher = vi.fn(async () => ({ ok: true, blob: async () => ({ size: 4, arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer }) }));
    vi.stubGlobal('fetch', fetcher);
    try {
      expect([...await readLocalAssetBytes('blob:tauri://localhost/test', 16, 'invalid')]).toEqual([1, 2, 3, 4]);
      expect(fetcher).toHaveBeenCalledTimes(1);
      await expect(readLocalAssetBytes('blob:tauri://localhost/test', 2, 'invalid')).rejects.toThrow('invalid');
    } finally { vi.unstubAllGlobals(); }
  });
});
