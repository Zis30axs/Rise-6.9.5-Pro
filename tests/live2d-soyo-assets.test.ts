import { afterEach, expect, it, vi } from 'vitest';
import { createSoyoAssetLease } from '../src/frontend/live2d-soyo-assets';

// Lite's installed asset URLs are shared by all mounted portrait components.
vi.mock('../assets/live2d-soyo/texture-0.png?url&inline', () => ({ default: 'blob:installed-soyo-texture' }));

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('gives concurrent Lite portraits independent textures and preserves the installed asset on release', async () => {
  let serial = 0;
  const revoke = vi.fn();
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => `blob:portrait-${++serial}`), revokeObjectURL: revoke });
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, blob: async () => new Blob(['texture']) })));
  const first = await createSoyoAssetLease(), second = await createSoyoAssetLease();
  try {
    expect(first.resolve('texture-0.png')).not.toBe(second.resolve('texture-0.png'));
    const otherTexture = second.resolve('texture-0.png');
    first.release();
    expect(revoke).not.toHaveBeenCalledWith(otherTexture);
    expect(revoke).not.toHaveBeenCalledWith('blob:installed-soyo-texture');
    expect(() => second.resolve('../foreign.png')).toThrow();
  } finally { first.release(); second.release(); }
});
