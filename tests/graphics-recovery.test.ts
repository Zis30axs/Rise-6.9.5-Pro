import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, reactive, type App } from 'vue';
import * as THREE from 'three';
import CitySandboxScene from '../src/frontend/CitySandboxScene.vue';
import SoyoLive2D from '../src/frontend/SoyoLive2D.vue';
import { createSoyoPortrait } from '../src/frontend/live2d-soyo-runtime';
import { createTokyoSandboxVfx } from '../src/frontend/tokyo-sandbox-vfx';

const fake = vi.hoisted(() => ({ renderers: [] as any[], portraits: [] as any[], fail: false }));
vi.mock('three', async importOriginal => {
  const real = await importOriginal<typeof import('three')>();
  return { ...real, WebGLRenderer: class {
    dispose = vi.fn(); forceContextLoss = vi.fn(); render = vi.fn(); setPixelRatio = vi.fn(); setSize = vi.fn();
    constructor() { if (fake.fail) throw Error('WebGL unavailable'); fake.renderers.push(this); }
  }};
});
vi.mock('../src/frontend/live2d-soyo-runtime', () => ({
  createSoyoPortrait: vi.fn(async () => {
    const portrait = { destroy: vi.fn(), resize: vi.fn(), setActive: vi.fn(), setEmotion: vi.fn(async () => true) };
    fake.portraits.push(portrait); return portrait;
  }),
}));
const mounted: App[] = [];
beforeEach(() => { vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} }); });
function mount(component: any, props: Record<string, unknown>) {
  const el = document.createElement('div'); document.body.append(el);
  const app = createApp({ render: () => h(component, props) }); mounted.push(app); app.mount(el); return el;
}
afterEach(() => {
  mounted.splice(0).forEach(app => app.unmount()); document.body.replaceChildren();
  fake.renderers = []; fake.portraits = []; fake.fail = false; vi.restoreAllMocks(); vi.unstubAllGlobals();
});
const mapProps = () => reactive({active:true, previewOnly:true, scope:'city', width:390, height:350,
  bearing:0, viewScale:1, selectedId:'campus', locationId:'south-gate', busy:false, refreshToken:0});

describe('graphics failure and recovery', () => {
  it('resumes a briefly covered sandbox without rebuilding its renderer or canvas', async () => {
    const props=mapProps(); const el=mount(CitySandboxScene,props);
    await vi.waitFor(()=>expect(fake.renderers).toHaveLength(1));
    const canvas=el.querySelector('canvas'),renderer=fake.renderers[0];
    props.active=false; await nextTick();
    props.active=true; await nextTick();
    await vi.waitFor(()=>expect(el.querySelector('[data-tokyo-sandbox-status]')?.getAttribute('data-tokyo-sandbox-status')).toBe('ready'));
    expect(fake.renderers).toHaveLength(1);
    expect(renderer.dispose).not.toHaveBeenCalled();
    expect(el.querySelector('canvas')).toBe(canvas);
  });
  it('retries failed map initialization with a fresh canvas and stops/cleans the old renderer', async () => {
    fake.fail = true; const props=mapProps(); const el=mount(CitySandboxScene, props);
    await vi.waitFor(() => expect(el.querySelector('[data-tokyo-sandbox-status]')?.getAttribute('data-tokyo-sandbox-status')).toBe('fallback'));
    const before=el.querySelector('canvas'); fake.fail=false; props.refreshToken++;
    await vi.waitFor(() => expect(el.querySelector('[data-tokyo-sandbox-status]')?.getAttribute('data-tokyo-sandbox-status')).toBe('ready'));
    expect(el.querySelector('canvas')).not.toBe(before);
    const renderer=fake.renderers[0]; props.refreshToken++; await nextTick();
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
    expect(renderer.forceContextLoss).toHaveBeenCalledTimes(1);
  });
  it('detects a lost map context and rebuilds only after the refresh token changes', async () => {
    const props=mapProps(); const el=mount(CitySandboxScene,props);
    await vi.waitFor(()=>expect(fake.renderers).toHaveLength(1));
    const before=el.querySelector('canvas')!;
    before.dispatchEvent(new Event('webglcontextlost',{cancelable:true}));
    await nextTick();
    expect(el.querySelector('[data-tokyo-sandbox-status]')?.getAttribute('data-tokyo-sandbox-status')).toBe('fallback');
    expect(fake.renderers[0].dispose).toHaveBeenCalledTimes(1);
    props.refreshToken++; await vi.waitFor(()=>expect(fake.renderers).toHaveLength(2));
    expect(el.querySelector('canvas')).not.toBe(before);
  });
  it('does not initialize an invisible Live2D, and allows recovery after context loss', async () => {
    const props=reactive({active:false,speaker:'素世',emotion:'平静',refreshToken:0});
    const el=mount(SoyoLive2D,props); await new Promise(resolve=>setTimeout(resolve,30));
    expect(fake.portraits).toHaveLength(0);
    props.active=true; await vi.waitFor(()=>expect(fake.portraits).toHaveLength(1));
    const before=el.querySelector('canvas')!;
    before.dispatchEvent(new Event('webglcontextlost',{cancelable:true})); await nextTick();
    expect(el.querySelector('[data-live2d-status]')?.getAttribute('data-live2d-status')).toBe('error');
    expect(fake.portraits[0].destroy).toHaveBeenCalledTimes(1);
    props.refreshToken++; await vi.waitFor(()=>expect(fake.portraits).toHaveLength(2));
    expect(el.querySelector('canvas')).not.toBe(before);
  });
  it('disposes the aircraft effects as well as the main effects tree exactly once', () => {
    const scene=new THREE.Scene(),model=new THREE.Group(),aircraft=new THREE.Group(); model.add(aircraft);scene.add(model);
    const renderer={toneMappingExposure:1} as THREE.WebGLRenderer;
    const vfx=createTokyoSandboxVfx(scene,renderer,model,new THREE.HemisphereLight(),new THREE.DirectionalLight());
    vfx.update(.02,1000,aircraft,undefined,undefined);
    const local=aircraft.getObjectByName('su30-local-vfx')!;
    const resources=new Set<THREE.BufferGeometry | THREE.Material>();
    local.traverse(obj=>{if(obj instanceof THREE.Mesh){resources.add(obj.geometry);for(const m of Array.isArray(obj.material)?obj.material:[obj.material])resources.add(m);}});
    const disposed=[...resources].map(r=>vi.spyOn(r,'dispose'));
    expect(disposed.length).toBeGreaterThan(0);
    vfx.dispose();vfx.dispose();
    for(const spy of disposed)expect(spy).toHaveBeenCalledTimes(1);
    expect(aircraft.getObjectByName('su30-local-vfx')).toBeUndefined();
  });
  it('discards a late Live2D load after the view was covered', async () => {
    let complete!: (value: Awaited<ReturnType<typeof createSoyoPortrait>>) => void;
    const late = { destroy: vi.fn(), resize: vi.fn(), setActive: vi.fn(), setEmotion: vi.fn(async () => true) };
    vi.mocked(createSoyoPortrait).mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
    const props = reactive({active: true, speaker: '素世', emotion: '平静'});
    const el = mount(SoyoLive2D, props);
    await vi.waitFor(() => expect(complete).toBeTypeOf('function'));
    props.active = false; await nextTick();
    complete(late);
    await vi.waitFor(() => expect(late.destroy).toHaveBeenCalledTimes(1));
    expect(late.resize).not.toHaveBeenCalled();
    expect(el.querySelector('[data-live2d-status]')?.getAttribute('data-live2d-status')).toBe('idle');
  });
  it('releases both graphics views while hidden and reconstructs them on return', async () => {
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    const map = mount(CitySandboxScene, mapProps());
    const portrait = mount(SoyoLive2D, {active: true, speaker: '素世', emotion: '平静'});
    await vi.waitFor(() => { expect(fake.renderers).toHaveLength(1); expect(fake.portraits).toHaveLength(1); });
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange')); await nextTick();
    expect(fake.renderers[0].dispose).toHaveBeenCalledTimes(1);
    expect(fake.portraits[0].destroy).toHaveBeenCalledTimes(1);
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.waitFor(() => {
      expect(map.querySelector('[data-tokyo-sandbox-status]')?.getAttribute('data-tokyo-sandbox-status')).toBe('ready');
      expect(portrait.querySelector('[data-live2d-status]')?.getAttribute('data-live2d-status')).toBe('ready');
    });
    expect(fake.renderers).toHaveLength(2); expect(fake.portraits).toHaveLength(2);
  });
});
