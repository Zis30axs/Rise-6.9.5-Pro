import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';

const source = readFileSync('scripts/live2d_asset_loader.js', 'utf8').split('function __ucLive2dButton')[0];
function fixture(open: () => Promise<unknown>) {
  return runInNewContext(source + '\n__ucLive2dCreateApi()', {
    __UC_LIVE2D_DESCRIPTOR__: { sha: 'fixture' }, __ucLiteDb: open,
    __ucLiteRead: async () => undefined, console: { warn: vi.fn(), error: vi.fn() },
  }) as { status(): { hydrating: boolean; enabled: boolean }; subscribe(fn: () => void): () => void; hydrate(): Promise<void> };
}
it('keeps hydration pending until the existing database has been read and notifies absent-pack fallback once', async () => {
  let complete!: (value: { close: () => void }) => void;
  const close = vi.fn(), api = fixture(() => new Promise(resolve => { complete = resolve; })), notify = vi.fn();
  api.subscribe(notify); expect(api.status().hydrating).toBe(true);
  const pending = api.hydrate(); await vi.waitFor(() => expect(complete).toBeTypeOf('function'));
  expect(api.status().hydrating).toBe(true); expect(notify).not.toHaveBeenCalled();
  complete({ close }); await pending;
  expect(api.status()).toMatchObject({ hydrating: false, enabled: false });
  expect(close).toHaveBeenCalledTimes(1); expect(notify).toHaveBeenCalledTimes(1);
});
it('unblocks the real fallback when storage cannot be opened', async () => {
  const api = fixture(async () => { throw Error('storage denied'); }), notify = vi.fn(); api.subscribe(notify);
  await api.hydrate();
  expect(api.status()).toMatchObject({ hydrating: false, enabled: false }); expect(notify).toHaveBeenCalledTimes(1);
});
