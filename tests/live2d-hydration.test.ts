import { Blob } from 'node:buffer';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import type { Live2dPackApi } from '../src/runtime/live2d-pack';
import { expect, it, vi } from 'vitest';

const source = readFileSync('scripts/live2d_asset_loader.js', 'utf8').split('function __ucLive2dButton')[0];
const sha256 = (bytes: Uint8Array | ArrayBuffer) =>
  createHash('sha256').update(new Uint8Array(bytes)).digest('hex');
const portrait = new TextEncoder().encode('portrait');
const portraitSha = sha256(portrait);
const manifest = new TextEncoder().encode(JSON.stringify({
  schema: 'unread-city-live2d-v1',
  assets: [{ sha256: portraitSha, bytes: portrait.byteLength }],
  models: [{ id: 'portrait' }],
}));
const descriptor = { sha: sha256(manifest), manifestBytes: manifest.byteLength, entries: 1 };
function fixture(open: () => Promise<unknown>, read: (db: unknown, store: string, key: string) => Promise<unknown> = async () => undefined) {
  return runInNewContext(source + '\n__ucLive2dCreateApi()', {
    __UC_LIVE2D_DESCRIPTOR__: descriptor, __ucLiteDb: open, __ucLiteRead: read,
    __ucLiteSha256: sha256, Blob, TextDecoder, console: { warn: vi.fn(), error: vi.fn() },
  }) as Live2dPackApi & Required<Pick<Live2dPackApi, 'restore'>>;
}
it('keeps hydration pending until the existing database has been read and notifies absent-pack fallback once', async () => {
  let complete!: (value: { close: () => void }) => void;
  const close = vi.fn(), api = fixture(() => new Promise(resolve => { complete = resolve; })), notify = vi.fn();
  api.subscribe(notify); expect(api.status().hydrating).toBe(true);
  const pending = api.restore(); expect(api.restore()).toBe(pending);
  await vi.waitFor(() => expect(complete).toBeTypeOf('function'));
  expect(api.status().hydrating).toBe(true); expect(notify).not.toHaveBeenCalled();
  complete({ close }); await pending;
  expect(api.status()).toMatchObject({ hydrating: false, enabled: false });
  expect(close).toHaveBeenCalledTimes(1); expect(notify).toHaveBeenCalledTimes(1);
});
it('unblocks the real fallback when storage cannot be opened', async () => {
  const api = fixture(async () => { throw Error('storage denied'); }), notify = vi.fn(); api.subscribe(notify);
  await api.restore();
  expect(api.status()).toMatchObject({ hydrating: false, enabled: false }); expect(notify).toHaveBeenCalledTimes(1);
});
it('restores the installed index once and verifies blobs only when requested', async () => {
  const db = { close: vi.fn() };
  const open = vi.fn(async () => db);
  const blob = new Blob([portrait]);
  const read = vi.fn(async (_db: unknown, store: string, _key: string) => store === 'meta'
    ? { sha: descriptor.sha, bytes: manifest, enabled: true } : blob);
  const api = fixture(open, read);

  expect(open).not.toHaveBeenCalled();
  await Promise.all([api.restore(), api.restore()]);
  await api.restore();
  expect(api.status()).toMatchObject({ installed: true, enabled: true, hydrating: false, models: [{ id: 'portrait' }] });
  expect(open).toHaveBeenCalledTimes(1);
  expect(read.mock.calls).toEqual([[db, 'meta', 'ready']]);

  await expect(api.getAsset(portraitSha)).resolves.toBe(blob);
  expect(read).toHaveBeenLastCalledWith(db, 'assets', portraitSha);
  read.mockResolvedValueOnce(new Blob(['x'.repeat(portrait.byteLength)]));
  await expect(api.getAsset(portraitSha)).rejects.toThrow('Live2D 素材缺失或损坏');
});
