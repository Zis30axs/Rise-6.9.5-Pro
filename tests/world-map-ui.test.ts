// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick, reactive, type App } from 'vue';
import { createInitialState, getNovelTravelQuote } from '../src/runtime/model';
import { mapDistricts } from '../src/frontend/map-districts';
import { formatGameNumber } from '../src/frontend/format-game-number';
import type { ShellActions, ShellModel } from '../src/frontend/types';

// Exercise the real map interface without requiring a GPU or loading its assets.
vi.mock('../src/frontend/CitySandboxScene.vue', () => ({ default: {
  props: ['scope', 'people', 'atmosphereMode'],
  template: '<div class="map-scene-fixture" :data-scope="scope" :data-atmosphere="atmosphereMode"><span v-for="person in people" :key="person.personId">{{ person.name }}</span></div>',
  methods: { refresh: vi.fn(), triggerFlares: vi.fn(), pickAt: () => false },
} }));
vi.mock('../src/frontend/AtlasMapScene.vue', () => ({ default: {
  template: '<div class="atlas-scene-fixture" />',
  methods: { resetView: vi.fn(), pickAt: () => undefined, isHomeRegion: () => true },
} }));
import WorldMap from '../src/frontend/WorldMapJourney.vue';

let app: App | undefined;
beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
});
afterEach(() => { app?.unmount(); app = undefined; document.body.replaceChildren(); vi.unstubAllGlobals(); });
function mount() {
  const model = reactive({ state: createInitialState(), busy: false, notice: '' } as ShellModel);
  const interact = vi.fn(async () => true);
  const actions = { interact, dispatch: vi.fn() } as unknown as ShellActions;
  const travelled = vi.fn();
  const root = document.createElement('div'); document.body.append(root);
  app = createApp(WorldMap, { model, actions, novelMode: true, onTravelled: travelled }); app.mount(root);
  return { root, model, actions, interact, travelled };
}
async function click(root: HTMLElement, selector: string) {
  const button = root.querySelector<HTMLButtonElement>(selector);
  expect(button, `Missing control: ${selector}`).not.toBeNull();
  button!.click(); await nextTick(); await nextTick();
}
function playerCopy(root: HTMLElement) {
  return [root.textContent, ...Array.from(root.querySelectorAll('[aria-label], [title]')).map(node => `${node.getAttribute('aria-label') ?? ''} ${node.getAttribute('title') ?? ''}`)].join(' ');
}
const forbiddenCopy = /演示|场景存档|GLB|WebGL|LLM|工程|验证|模型|状态同步|模拟数据|不调用模型|不触发正文/;

describe('city atlas player interface', () => {
  it('presents real districts and labelled map controls without technical or invented-presence copy', () => {
    const { root, model } = mount();
    expect(root.querySelector('.world-map')?.getAttribute('data-map-layer')).toBe('city');
    expect(Array.from(root.querySelectorAll('.wm-layers button')).map(button => button.textContent)).toEqual(['城市', '所在区域', '世界']);
    expect(root.querySelectorAll('.wm-district-list button')).toHaveLength(mapDistricts.length);
    expect(root.querySelector('.wm-header-clock')?.textContent).toContain(`${String(model.state.clock.hour).padStart(2, '0')}:${String(model.state.clock.minute).padStart(2, '0')}`);
    for (const name of ['放大地图', '缩小地图', '复位地图视图', '切换单指操作模式', '切换俯仰视角', '向左旋转地图', '向右旋转地图', '切换沙盘天色与气象']) {
      const button = root.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`);
      expect(button, name).not.toBeNull();
      expect(button!.disabled, name).toBe(false);
      expect(button!.closest('[inert], [aria-hidden="true"]'), name).toBeNull();
    }
    expect(root.querySelector('[data-world-map-viewport]')?.getAttribute('tabindex')).toBe('0');
    expect(root.querySelector('.wm-demo-toggle')).toBeNull();
    expect(playerCopy(root)).not.toMatch(forbiddenCopy);
  });

  it('browses each district and restores the city camera without spending time or travelling', async () => {
    const { root, model, interact } = mount();
    const clock = { ...model.state.clock };
    await click(root, '[aria-label="放大地图"]');
    await click(root, '[aria-label="向右旋转地图"]');
    const viewport = root.querySelector('[data-world-map-viewport]')!;
    const scale = viewport.getAttribute('data-map-scale');
    for (let index = 0; index < mapDistricts.length; index++) {
      await click(root, `.wm-district-list button:nth-child(${index + 1})`);
      expect(root.querySelector('.world-map')?.getAttribute('data-map-district')).toBe(mapDistricts[index].id);
      expect(root.querySelector('.wm-details')?.getAttribute('aria-label')).toBe('片区地点与出行');
      expect(root.querySelector('[data-map-back]')?.getAttribute('aria-label')).toBe('返回城市总览');
      expect(root.querySelectorAll('[data-destination]').length).toBeGreaterThan(0);
      expect(playerCopy(root)).not.toMatch(forbiddenCopy);
      await click(root, '[data-map-back]');
      expect(viewport.getAttribute('data-map-scale')).toBe(scale);
      expect(viewport.getAttribute('data-map-bearing')).toBe('30.000');
    }
    expect(model.state.clock).toEqual(clock);
    expect(interact).not.toHaveBeenCalled();
  });

  it('keeps fare and energy quotes, routes travel through the existing action, and blocks busy travel', async () => {
    const { root, model, interact, travelled } = mount();
    await click(root, '.wm-district-list button:first-child');
    const quote = getNovelTravelQuote(model.state, 'library');
    const destination = root.querySelector<HTMLButtonElement>('[data-destination="library"]')!;
    expect(quote).toBeTruthy();
    expect(destination.textContent).toContain(`${quote!.minutes} 分钟`);
    const energyNote = destination.querySelector('[data-novel-energy-quote]')?.textContent;
    expect(energyNote).toContain(`${formatGameNumber(quote!.energyCost)} 点精力`);
    expect(energyNote).not.toMatch(/[×≈]|状态倍率/);
    expect(root.querySelector('.wm-travel-guidance summary')?.textContent).toBe('出行与精力');
    expect(root.querySelector('[data-novel-energy-rule]')?.textContent).toContain('以出发时状态计算');
    model.busy = true; await nextTick();
    expect(destination.disabled).toBe(true); destination.click();
    expect(interact).not.toHaveBeenCalled();
    model.busy = false; await nextTick();
    await click(root, '[data-destination="library"]');
    expect(interact).toHaveBeenCalledExactlyOnceWith({ type: 'novel_travel', locationId: 'library' });
    expect(travelled).toHaveBeenCalledTimes(1);
  });

  it('shows a blocked travel reason without an energy formula or zero-cost claim', async () => {
    const { root, model, interact } = mount();
    model.state.player.balance = 0;
    await nextTick();
    await click(root, '.wm-district-list button:nth-child(2)');
    const quote = getNovelTravelQuote(model.state, 'home');
    expect(quote.blockedReason).toBeTruthy();
    const destination = root.querySelector<HTMLButtonElement>('[data-destination="home"]')!;
    expect(destination.disabled).toBe(true);
    expect(destination.textContent).toContain(quote.blockedReason!);
    expect(destination.querySelector('[data-novel-energy-quote]')).toBeNull();
    expect(destination.textContent).not.toMatch(/[×≈]|消耗 0 点精力/);
    destination.click();
    expect(interact).not.toHaveBeenCalled();
  });

  it('keeps atmosphere cosmetic and makes world search and intentions accessible without travel', async () => {
    const { root, model, interact } = mount();
    const before = JSON.stringify(model.state);
    await click(root, '[aria-label="切换沙盘天色与气象"]');
    expect(root.querySelector('.map-scene-fixture')?.getAttribute('data-atmosphere')).toBe('day');
    await click(root, '.wm-layers button:last-child');
    expect(root.querySelector('.world-map')?.getAttribute('data-map-layer')).toBe('world');
    const search = root.querySelector<HTMLInputElement>('input[aria-label="查找国家或地区"]')!;
    expect(search).not.toBeNull();
    search.value = '不存在的地点'; search.dispatchEvent(new Event('input', { bubbles: true })); await nextTick();
    expect(root.querySelector('.wm-region-list')?.textContent).toContain('未找到对应名称');
    await click(root, '.wm-journey-actions button:first-child');
    expect(root.querySelector('[role="status"]')?.textContent).toContain('尚未启程');
    expect(playerCopy(root)).not.toMatch(forbiddenCopy);
    expect(JSON.stringify(model.state)).toBe(before);
    expect(interact).not.toHaveBeenCalled();
  });
});
