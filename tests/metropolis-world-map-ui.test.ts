// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick, reactive, type App } from 'vue';
import { createInitialState, getNovelTravelQuote, reduceState } from '../src/runtime/model';
import { formatGameNumber } from '../src/frontend/format-game-number';
import type { ShellActions, ShellModel, WorldAction } from '../src/frontend/types';

// Keep WorldMap, the game panel, its adapter and the interaction path real.
// Rendering fixtures avoid a GPU, image decoding and a perpetual animation loop.
vi.mock('../src/frontend/metropolis/renderer', () => ({
  createCityRenderer: () => ({
    resize: vi.fn(), render: vi.fn(), dispose: vi.fn(),
    project: () => ({ x: 160, y: 120, visible: true }),
  }),
}));
vi.mock('../src/frontend/MapCharacterAvatar.vue', () => ({ default: {
  props: ['name'], template: '<span class="map-avatar-fixture" :aria-label="name" />',
} }));
vi.mock('../src/frontend/CitySandboxScene.vue', () => ({ default: {
  template: '<div class="legacy-sandbox-fixture" />',
} }));
vi.mock('../src/frontend/AtlasMapScene.vue', () => ({ default: {
  template: '<div class="atlas-scene-fixture" />',
  methods: {
    resetView: vi.fn(), pickAt: () => undefined, isHomeRegion: () => true,
    setZoomAnchor: vi.fn(), getZoomView: () => ({ depth: 1, zoom: 1 }),
  },
} }));
import WorldMap from '../src/frontend/WorldMap.vue';

let app: App | undefined;
beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});
afterEach(() => {
  app?.unmount(); app = undefined;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

function mount(handle?: (action: WorldAction) => Promise<boolean>) {
  const model = reactive({ state: createInitialState(), busy: false, notice: '' } as ShellModel);
  const interact = vi.fn(handle ?? (async (action: WorldAction) => {
    model.state = reduceState(model.state, action);
    return true;
  }));
  const actions = { interact, dispatch: vi.fn() } as unknown as ShellActions;
  const travelled = vi.fn();
  const root = document.createElement('div'); document.body.append(root);
  app = createApp(WorldMap, { model, actions, novelMode: true, onTravelled: travelled }); app.mount(root);
  return { root, model, interact, travelled };
}
async function settle() { await nextTick(); await nextTick(); }
async function click(root: HTMLElement, selector: string) {
  const button = root.querySelector<HTMLButtonElement>(selector);
  expect(button, `Missing control: ${selector}`).not.toBeNull();
  button!.click(); await settle();
}
async function light(root: HTMLElement, label: string) {
  const button = Array.from(root.querySelectorAll<HTMLButtonElement>('.light-modes button')).find(item => item.textContent?.includes(label));
  expect(button, `Missing light mode: ${label}`).toBeDefined();
  button!.click(); await settle();
}

describe('metropolis as the character-card map', () => {
  it('opens the new city, exposes real locations and clock, and keeps browsing cosmetic', async () => {
    const { root, model, interact } = mount();
    const before = JSON.stringify(model.state);
    expect(root.querySelector('[data-map-view]')?.getAttribute('data-map-view')).toBe('panorama');
    expect(root.querySelector('.city-canvas')).not.toBeNull();
    expect(root.querySelector('.game-live-clock')?.textContent).toContain('17:20');
    expect(root.querySelector('[data-game-current]')?.textContent).toContain('校园南门');
    expect(root.querySelectorAll('[data-game-destination]')).toHaveLength(54);
    expect(root.querySelectorAll('[data-game-district]')).toHaveLength(9);
    await light(root, '万家灯火');
    expect(root.querySelector('.metropolis')?.classList.contains('mode-night')).toBe(true);
    await click(root, '[data-game-district="downtown"]');
    await click(root, '[aria-label="放大沙盘"]');
    expect(root.querySelector('.game-live-clock')?.textContent).toContain('17:20');
    expect(JSON.stringify(model.state)).toBe(before);
    expect(interact).not.toHaveBeenCalled();
  });

  it('shows the runtime quote and settles confirmed travel through the existing interaction path', async () => {
    const { root, model, interact, travelled } = mount();
    const quote = getNovelTravelQuote(model.state, 'library');
    const expected = reduceState(model.state, { type: 'novel_travel', locationId: 'library' });
    await click(root, '[data-game-destination="library"]');
    expect(root.querySelector('[data-game-selection]')?.textContent).toContain(`${quote.minutes} 分钟`);
    expect(root.querySelector('[data-game-selection]')?.textContent).toContain(`精力 −${formatGameNumber(quote.energyCost)}`);
    await click(root, '[data-game-travel="library"]');
    expect(interact).toHaveBeenCalledExactlyOnceWith({ type: 'novel_travel', locationId: 'library' });
    expect(model.state).toEqual(expected);
    expect(model.state.locationId).toBe('library');
    expect(model.state.clock).toMatchObject({ hour: 17, minute: 35 });
    expect(model.state.player.energy).toBe(76.64);
    expect(model.state.player.balance).toBe(6560);
    expect(travelled).toHaveBeenCalledTimes(1);
    expect(root.querySelector('[data-game-current]')?.textContent).toContain('图书馆');
  });

  it('blocks busy or duplicate travel, retains failures, and shows blocked fare reasons', async () => {
    let finish!: (saved: boolean) => void;
    const { root, model, interact, travelled } = mount(() => new Promise(resolve => { finish = resolve; }));
    const before = JSON.stringify(model.state);
    await click(root, '[data-game-destination="library"]');
    model.busy = true; await settle();
    expect(root.querySelector<HTMLButtonElement>('[data-game-travel="library"]')!.disabled).toBe(true);
    await click(root, '[data-game-travel="library"]');
    expect(interact).not.toHaveBeenCalled();
    model.busy = false; await settle();
    const button = root.querySelector<HTMLButtonElement>('[data-game-travel="library"]')!;
    expect(button.disabled).toBe(false);
    button.click(); button.click(); await settle();
    expect(interact).toHaveBeenCalledTimes(1);
    expect(button.disabled).toBe(true);
    expect(travelled).not.toHaveBeenCalled();
    model.notice = '这次行程未能保存。'; finish(false); await settle();
    expect(root.querySelector('[role="alert"]')?.textContent).toContain(model.notice);
    expect(travelled).not.toHaveBeenCalled();
    expect(JSON.stringify(model.state)).toBe(before);
    model.state.player.balance = 0; await settle();
    await click(root, '[data-game-district="home"]');
    await click(root, '[data-game-destination="home"]');
    const reason = getNovelTravelQuote(model.state, 'home').blockedReason;
    expect(reason).toBeTruthy();
    expect(root.querySelector('[data-game-selection]')?.textContent).toContain(reason!);
    expect(root.querySelector<HTMLButtonElement>('[data-game-travel="home"]')!.disabled).toBe(true);
    expect(interact).toHaveBeenCalledTimes(1);
  });

  it('opens the geographic atlas, preserves deep zoom, and returns to the new city without mounting the old sandbox', async () => {
    const { root, model, interact } = mount();
    const before = JSON.stringify(model.state);
    await click(root, '[data-metropolis-journey]');
    expect(root.querySelector('.world-map')?.getAttribute('data-map-layer')).toBe('world');
    expect(root.querySelector('.city-canvas')).toBeNull();
    expect(root.querySelector('.legacy-sandbox-fixture')).toBeNull();
    await click(root, '.wm-home-region');
    await click(root, '[aria-label="放大地图"]');
    expect(root.querySelector('.world-map')?.getAttribute('data-map-layer')).toBe('province');
    expect(root.querySelector('[data-world-map-viewport]')?.getAttribute('data-map-depth')).toBe('3.000');
    expect(root.querySelector('.atlas-scene-fixture')).not.toBeNull();
    expect(root.querySelector('.legacy-sandbox-fixture')).toBeNull();
    await click(root, '.wm-layers button:first-child');
    expect(root.querySelector('[data-map-view]')?.getAttribute('data-map-view')).toBe('panorama');
    expect(root.querySelector('.city-canvas')).not.toBeNull();
    expect(root.querySelector('.world-map')).toBeNull();
    expect(model.state).toEqual(JSON.parse(before));
    expect(interact).not.toHaveBeenCalled();
  });
});
