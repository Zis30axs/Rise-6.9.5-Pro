import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, reactive, ref, type App } from 'vue';
import * as THREE from 'three';
import CitySandboxScene from '../src/frontend/CitySandboxScene.vue';
import { createTokyoSandboxCinematic } from '../src/frontend/tokyo-sandbox-cinematic';
import { resolveTokyoAtmosphere } from '../src/frontend/tokyo-sandbox-vfx';

const fake = vi.hoisted(() => ({
  gpuFails: true, canvasFails: false,
  gpuCanvases: [] as HTMLCanvasElement[], renderers: [] as any[], canvases: [] as any[],
  resolveRead: undefined as ((bytes: Uint8Array<ArrayBuffer>) => void) | undefined,
}));
vi.mock('three', async importOriginal => {
  const real = await importOriginal<typeof import('three')>();
  return { ...real, WebGLRenderer: class {
    dispose = vi.fn(); forceContextLoss = vi.fn(); render = vi.fn();
    setPixelRatio = vi.fn(); setSize = vi.fn();
    constructor(options: { canvas: HTMLCanvasElement }) {
      fake.gpuCanvases.push(options.canvas);
      if (fake.gpuFails) throw new Error('WebGL unavailable');
      fake.renderers.push(this);
    }
  } };
});
vi.mock('../src/frontend/tokyo-sandbox-canvas', () => ({
  createTokyoCanvasRenderer(canvas: HTMLCanvasElement) {
    if (fake.canvasFails) throw new Error('Canvas unavailable');
    const renderer = { canvas, render: vi.fn(), triggerFlares: vi.fn(), dispose: vi.fn() };
    fake.canvases.push(renderer);
    return renderer;
  },
}));
vi.mock('../src/frontend/MapCharacterAvatar.vue', () => ({ default: { template: '<span />' } }));
vi.mock('../src/frontend/local-asset-buffer', () => ({
  readLocalAssetBytes: () => new Promise<Uint8Array<ArrayBuffer>>(resolve => { fake.resolveRead = resolve; }),
}));

const mounted: App[] = [];
beforeEach(() => {
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
});
afterEach(() => {
  mounted.splice(0).forEach(app => app.unmount());
  document.body.replaceChildren();
  fake.gpuFails = true; fake.canvasFails = false;
  fake.gpuCanvases = []; fake.renderers = []; fake.canvases = [];
  fake.resolveRead = undefined;
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});
function mount(props: ReturnType<typeof mapProps>) {
  const el = document.createElement('div'); document.body.appendChild(el);
  const exposed = ref<{ triggerFlares(): void }>();
  const app = createApp({ render: () => h(CitySandboxScene, { ...props, ref: exposed }) });
  mounted.push(app); app.mount(el);
  return { el, exposed };
}
const mapProps = () => reactive({
  active: true, previewOnly: true, scope: 'city' as 'city' | 'campus', width: 390, height: 350,
  bearing: 0, viewScale: 1, selectedId: 'campus', locationId: 'south-gate',
  busy: false, refreshToken: 0, position: { x: 0, z: 0 },
  onSelect: vi.fn(), onTravel: vi.fn(), onScale: vi.fn(),
});
const ready = (el: HTMLElement) => vi.waitFor(() => {
  expect(el.querySelector('[data-tokyo-sandbox-status]')?.getAttribute('data-tokyo-sandbox-status')).toBe('ready');
});

describe('Tokyo software display recovery preserves map contracts', () => {
  it('uses a fresh canvas, the same camera for gestures and pins, and existing disabled travel rules', async () => {
    const props = mapProps(); const { el, exposed } = mount(props);
    await ready(el);
    expect(el.querySelector('[data-tokyo-sandbox-model]')?.getAttribute('data-tokyo-sandbox-model')).toBe('canvas');
    const canvas = fake.canvases[0];
    expect(canvas.canvas).not.toBe(fake.gpuCanvases[0]);
    const camera = canvas.render.mock.calls[0][0] as THREE.PerspectiveCamera;
    const before = camera.position.clone();
    props.bearing = 60; await nextTick();
    expect(canvas.render.mock.calls.at(-1)[0]).toBe(camera);
    expect(camera.position.distanceTo(before)).toBeGreaterThan(10);
    expect(props.onScale.mock.calls.at(-1)?.[0].metersPerPixel).toBeGreaterThan(0);
    const district = el.querySelector<HTMLButtonElement>('[data-map-target="city:campus"]')!;
    expect(district).not.toBeNull(); district.click();
    expect(props.onSelect).toHaveBeenCalledWith('campus');

    props.scope = 'campus'; props.busy = true; await nextTick();
    const disabled = [...el.querySelectorAll<HTMLButtonElement>('[data-map-location]')];
    expect(disabled.length).toBeGreaterThan(0);
    expect(disabled.every(button => button.disabled)).toBe(true);
    disabled[0].click(); expect(props.onTravel).not.toHaveBeenCalled();
    props.busy = false; await nextTick();
    const destination = el.querySelector<HTMLButtonElement>('[data-map-location]:not(:disabled)')!;
    expect(destination).not.toBeNull(); destination.click();
    expect(props.onTravel).toHaveBeenCalledWith(destination.dataset.mapLocation);
    expect(props.position).toEqual({ x: 0, z: 0 });
    exposed.value?.triggerFlares(); expect(canvas.triggerFlares).toHaveBeenCalledTimes(1);

    props.active = false; await nextTick();
    expect(canvas.dispose).toHaveBeenCalledTimes(1);
    props.active = true; await ready(el);
    expect(fake.gpuCanvases).toHaveLength(1);
    expect(fake.canvases).toHaveLength(2);
  });

  it('continues after context loss and retries GPU only when explicitly refreshed', async () => {
    fake.gpuFails = false;
    const props = mapProps(); const { el } = mount(props);
    await ready(el);
    const original = el.querySelector('canvas')!;
    original.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    await vi.waitFor(() => expect(fake.canvases).toHaveLength(1)); await ready(el);
    expect(el.querySelector('canvas')).not.toBe(original);
    expect(fake.renderers[0].dispose).toHaveBeenCalledTimes(1);
    expect(fake.renderers[0].forceContextLoss).toHaveBeenCalledTimes(1);
    expect(el.querySelector('[data-tokyo-sandbox-model]')?.getAttribute('data-tokyo-sandbox-model')).toBe('canvas');
    props.refreshToken++; await vi.waitFor(() => expect(fake.renderers).toHaveLength(2)); await ready(el);
    expect(fake.canvases[0].dispose).toHaveBeenCalledTimes(1);
    expect(el.querySelector('[data-tokyo-sandbox-model]')?.getAttribute('data-tokyo-sandbox-model')).toBe('procedural');
  });

  it('keeps the final recovery message when both graphics APIs fail, then recovers on retry', async () => {
    fake.canvasFails = true;
    const props = mapProps(); const { el } = mount(props);
    await vi.waitFor(() => expect(el.querySelector('[data-tokyo-sandbox-status]')?.getAttribute('data-tokyo-sandbox-status')).toBe('fallback'));
    expect(el.textContent).toContain('从地点列表选择目的地');
    fake.canvasFails = false; props.refreshToken++; await ready(el);
    expect(fake.canvases).toHaveLength(1);
  });

  it('ignores a late GLB read after context loss has already opened the software display', async () => {
    fake.gpuFails = false;
    const digest = vi.fn(async () => new Uint8Array(32).buffer);
    vi.stubGlobal('crypto', { subtle: { digest } });
    const props = mapProps(); props.previewOnly = false;
    const { el } = mount(props);
    await vi.waitFor(() => expect(fake.resolveRead).toBeTypeOf('function'));
    el.querySelector('canvas')!.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    await ready(el);
    fake.resolveRead!(new Uint8Array(24));
    await vi.waitFor(() => expect(digest).toHaveBeenCalled()); await nextTick();
    expect(el.querySelector('[data-tokyo-sandbox-model]')?.getAttribute('data-tokyo-sandbox-model')).toBe('canvas');
    expect(fake.canvases).toHaveLength(1);
    expect(fake.canvases[0].dispose).not.toHaveBeenCalled();
    expect(fake.renderers[0].dispose).toHaveBeenCalledTimes(1);
  });
});

describe('Tokyo cinematic scenery resource ownership', () => {
  it.each([false, true])('preserves authored geometry and restores only the hidden backdrop (procedural=%s)', procedural => {
    const scene = new THREE.Scene(), model = new THREE.Group(); scene.add(model);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(procedural ? 490 : 1500, procedural ? .3 : 2, procedural ? 490 : 1500));
    floor.position.y = procedural ? -2.2 : -1.05;
    if (procedural) floor.userData.tokyoBackdrop = true;
    const building = new THREE.Mesh(new THREE.BoxGeometry(12, 28, 18), new THREE.MeshStandardMaterial());
    building.position.set(80, 14, -65); model.add(floor, building);
    const originalPosition = building.position.clone(), originalGeometry = building.geometry;
    const authoredDispose = vi.spyOn(building.material, 'dispose');
    const originalTop = new THREE.Box3().setFromObject(floor).max.y;
    const controller = createTokyoSandboxCinematic(scene, model);
    const display = scene.getObjectByName('tokyo-cinematic-plinth')!;
    expect(floor.visible).toBe(false);
    expect(building.position.equals(originalPosition)).toBe(true);
    expect(building.geometry).toBe(originalGeometry);
    // The new tabletop stays below the old ground, including lower preview roads.
    expect(display.position.y - .12).toBeCloseTo(originalTop - .03, 5);

    const resources = new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture>();
    display.traverse(object => {
      if (!(object instanceof THREE.Mesh || object instanceof THREE.Line)) return;
      resources.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        resources.add(material);
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) resources.add(value);
      }
    });
    const disposal = [...resources].map(resource => vi.spyOn(resource, 'dispose'));
    controller.setAtmosphere(resolveTokyoAtmosphere('night'));
    controller.update(2300); controller.update(2300, true);
    controller.dispose(); controller.dispose();
    expect(floor.visible).toBe(true);
    expect(scene.getObjectByName('tokyo-cinematic-plinth')).toBeUndefined();
    expect(authoredDispose).not.toHaveBeenCalled();
    disposal.forEach(spy => expect(spy).toHaveBeenCalledTimes(1));
    originalGeometry.dispose(); building.material.dispose(); floor.geometry.dispose();
  });
});
