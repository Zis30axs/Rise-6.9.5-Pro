import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, onBeforeUnmount, reactive, ref, type App } from 'vue';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import CitySandboxScene, { createSandboxCache, sandboxCacheKey } from '../src/frontend/CitySandboxScene.vue';
import { readLocalAssetBytes } from '../src/frontend/local-asset-buffer';

const fake = vi.hoisted(() => ({ renderers: [] as { dispose: ReturnType<typeof vi.fn>; forceContextLoss: ReturnType<typeof vi.fn> }[] }));
vi.mock('three', async original => {
  const real = await original<typeof import('three')>();
  return { ...real, WebGLRenderer: class {
    dispose = vi.fn(); forceContextLoss = vi.fn(); render = vi.fn(); setPixelRatio = vi.fn(); setSize = vi.fn();
    constructor() { fake.renderers.push(this); }
  } };
});
vi.mock('../src/frontend/local-asset-buffer', () => ({ readLocalAssetBytes: vi.fn() }));
const apps: App[] = [];
beforeEach(() => {
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  vi.stubGlobal('crypto', webcrypto);
  // jsdom cannot decode PNGs or create a GPU context. Keep the actual GLTF
  // parser, geometry, material graph and component/cache lifecycle under test.
  vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation((_url, onLoad) => {
    const image = document.createElement('img'); image.width = image.height = 1;
    const texture = new THREE.Texture(image);
    queueMicrotask(() => onLoad?.(texture)); return texture;
  });
  fake.renderers = [];
  const bytes = new Uint8Array(readFileSync('assets/models/unread-city-tokyo-sandbox.glb'));
  vi.mocked(readLocalAssetBytes).mockReset().mockResolvedValue(bytes);
});
afterEach(() => { apps.splice(0).forEach(app => app.unmount()); document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function mount() {
  const cache = createSandboxCache(), shown = ref(true), second = ref(false);
  const props = reactive({ active: true, scope: 'city' as const, width: 390, height: 350, bearing: 0,
    viewScale: 1, selectedId: 'campus', locationId: 'south-gate', busy: false, clockMinutes: 780 });
  const root = document.createElement('div'); document.body.append(root);
  const app = createApp({ setup() {
    onBeforeUnmount(() => cache.close());
    return () => h('div', [shown.value ? h(CitySandboxScene, { ...props, key: 'map' }) : null,
      second.value ? h(CitySandboxScene, { ...props, key: 'switch' }) : null]);
  } });
  app.provide(sandboxCacheKey, cache); apps.push(app); app.mount(root);
  return { root, shown, second, props, cache, app };
}
const ready = (root: HTMLElement, count = 1) => vi.waitFor(() => expect(root.querySelectorAll('[data-tokyo-sandbox-status="ready"]')).toHaveLength(count), { timeout: 10_000 });

it.each([[1440, 900], [390, 844], [320, 568]])('reopens the actual GLB five times at %ix%i with one decode and one renderer', async (width, height) => {
  const parse = vi.spyOn(GLTFLoader.prototype, 'parseAsync');
  const { root, shown, props } = mount(); props.width = width; props.height = height;
  const coldStart = performance.now(); await ready(root); const coldMs = performance.now() - coldStart;
  const canvas = root.querySelector('canvas'), warmMs: number[] = [];
  expect(root.querySelector('[data-tokyo-sandbox-model="glb"]')).not.toBeNull();
  for (let i = 0; i < 5; i++) {
    shown.value = false; await nextTick();
    expect(root.querySelector('canvas')).toBeNull();
    props.clockMinutes += 5; props.bearing += 5;
    const start = performance.now(); shown.value = true; await nextTick(); await ready(root);
    warmMs.push(performance.now() - start);
    expect(root.querySelector('canvas')).toBe(canvas);
  }
  expect(parse).toHaveBeenCalledTimes(1);
  expect(readLocalAssetBytes).toHaveBeenCalledTimes(1);
  expect(fake.renderers).toHaveLength(1);
  expect(fake.renderers[0].dispose).not.toHaveBeenCalled();
  console.info(JSON.stringify({ viewport: [width, height], coldMs, warmMs, modelParses: parse.mock.calls.length, renderers: fake.renderers.length, gpu: 'stubbed', imageDecode: 'stubbed' }));
});

it('never lends the same live runtime to two simultaneous views and retains at most one idle renderer', async () => {
  const { root, shown, second } = mount(); await ready(root);
  second.value = true; await ready(root, 2);
  const canvases = [...root.querySelectorAll('canvas')]; expect(canvases[0]).not.toBe(canvases[1]);
  expect(fake.renderers).toHaveLength(2);
  shown.value = false; await nextTick(); second.value = false; await nextTick();
  expect(fake.renderers[0].dispose).toHaveBeenCalledTimes(1);
  expect(fake.renderers[1].dispose).not.toHaveBeenCalled();
  shown.value = true; await ready(root);
  expect(root.querySelector('canvas')).toBe(canvases[1]); expect(fake.renderers).toHaveLength(2);
});

it('drops a lost parked context and rebuilds it on the next open', async () => {
  const { root, shown } = mount(); await ready(root);
  const canvas = root.querySelector('canvas')!;
  shown.value = false; await nextTick(); canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
  expect(fake.renderers[0].dispose).toHaveBeenCalledTimes(1);
  shown.value = true; await ready(root);
  expect(root.querySelector('canvas')).not.toBe(canvas); expect(fake.renderers).toHaveLength(2);
});

it('frees cached GPU resources when the page is hidden', async () => {
  const { root, shown } = mount(); await ready(root);
  shown.value = false; await nextTick();
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(true); document.dispatchEvent(new Event('visibilitychange'));
  expect(fake.renderers[0].dispose).toHaveBeenCalledTimes(1);
  expect(fake.renderers[0].forceContextLoss).toHaveBeenCalledTimes(1);
});

it.each([true, false])('ends the Shell session with an active=%s sandbox without leaving a cached renderer', async active => {
  const { root, shown, app } = mount(); await ready(root);
  if (!active) { shown.value = false; await nextTick(); }
  app.unmount(); apps.splice(apps.indexOf(app), 1);
  expect(fake.renderers[0].dispose).toHaveBeenCalledTimes(1);
  expect(fake.renderers[0].forceContextLoss).toHaveBeenCalledTimes(1);
});
