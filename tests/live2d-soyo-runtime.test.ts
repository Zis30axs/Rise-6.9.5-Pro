import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createSoyoPortrait } from '../src/frontend/live2d-soyo-runtime';

const fake = vi.hoisted(() => ({
  release: vi.fn(), failApplication: false, applicationDestroy: vi.fn(),
  loadModel: vi.fn(),
}));
vi.mock('../vendor/live2d/cubism2-runtime.js', () => ({}));
vi.mock('../src/frontend/live2d-soyo-assets', () => ({
  createSoyoAssetLease: async () => ({ release: fake.release, resolve: (file: string) => `blob:${file}` }),
  getSoyoDefinition: () => ({}),
}));
vi.mock('pixi.js', () => ({ Application: class {
  stop = vi.fn(); destroy = fake.applicationDestroy;
  constructor() { if (fake.failApplication) throw new Error('No graphics context'); }
} }));
vi.mock('pixi-live2d-display/cubism2', () => ({
  config: {}, Cubism2ModelSettings: class {},
  Live2DModel: { from: fake.loadModel }, MotionPreloadStrategy: { NONE: 0 }, MotionPriority: {},
}));
beforeEach(() => { fake.failApplication = false; vi.clearAllMocks(); });
afterEach(() => vi.restoreAllMocks());

it('releases the asset lease when renderer construction fails', async () => {
  fake.failApplication = true;
  await expect(createSoyoPortrait(document.createElement('canvas'))).rejects.toThrow('No graphics context');
  expect(fake.release).toHaveBeenCalledTimes(1);
});

it('cleans a late model after abort, keeping its URLs alive until decoding settles', async () => {
  let complete!: (value: { destroy: ReturnType<typeof vi.fn> }) => void;
  fake.loadModel.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
  const controller = new AbortController();
  const loading = createSoyoPortrait(document.createElement('canvas'), controller.signal);
  const closed = expect(loading).rejects.toThrow('立绘已关闭');
  await vi.waitFor(() => expect(complete).toBeTypeOf('function'));
  controller.abort();
  expect(fake.applicationDestroy).toHaveBeenCalledTimes(1);
  expect(fake.release).not.toHaveBeenCalled();
  const model = { destroy: vi.fn() }; complete(model);
  await closed;
  expect(model.destroy).toHaveBeenCalledTimes(1);
  expect(fake.release).toHaveBeenCalledTimes(1);
});
