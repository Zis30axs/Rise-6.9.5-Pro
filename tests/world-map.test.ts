import { createApp, defineComponent, h, nextTick, reactive, type App } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInitialState, getNovelTravelQuote, novelDestinations, reduceState } from '../src/runtime/model';
import type { ShellActions, ShellModel, WorldAction, WorldState } from '../src/frontend/types';

vi.mock('../src/frontend/AtlasMapScene.vue', () => ({ default: defineComponent({
  setup(_props, { expose }) { expose({ resetView: vi.fn(), isHomeRegion: () => true }); return () => h('div', { 'data-atlas-stub': '' }); },
}) }));
import WorldMap from '../src/frontend/WorldMap.vue';

let app: App | undefined;
beforeEach(() => { vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true }))); });
afterEach(() => { app?.unmount(); app = undefined; document.body.innerHTML = ''; vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function mountMap(novelMode = false, state: WorldState = createInitialState()) {
  const model = reactive<ShellModel>({ mode: 'demo', state, busy: false, notice: '', connection: '', externalPhoneAvailable: false, externalPhoneOpen: false, phoneStatus: 'idle', phoneError: '', phoneSource: 'none', phoneLinkStatus: 'idle', phoneLinkError: '', phoneUnread: 0, phoneContactUnread: [] });
  const dispatch = vi.fn((action: WorldAction) => { try { model.state = reduceState(model.state, action); model.notice = ''; } catch (error) { model.notice = (error as Error).message; } });
  const actions: ShellActions = { dispatch, send: vi.fn(async () => {}), exit: vi.fn(), switchChat: vi.fn(), openPhone: vi.fn(), closePhone: vi.fn(), openPhoneContact: vi.fn(async () => {}), retryPhoneSync: vi.fn() };
  const travelled = vi.fn();
  const host = document.createElement('div'); document.body.append(host);
  app = createApp({ render: () => h(WorldMap, { model, actions, novelMode, onTravelled: travelled }) }); app.mount(host); await nextTick();
  return { host, model, dispatch, travelled };
}
function button(host: HTMLElement, text: string, scope = '') {
  const result = [...host.querySelectorAll<HTMLButtonElement>(scope ? scope + ' button' : 'button')].find(item => item.textContent?.trim() === text);
  if (!result) throw new Error('Missing button: ' + text);
  return result;
}

describe('沙盘与小说出行界面', () => {
  it('默认只有沙盘入口，缩放经过原校园层时持续保持立体，城市与全球入口保留', async () => {
    const { host, dispatch } = await mountMap();
    expect([...host.querySelectorAll('.wm-layers button')].map(item => item.textContent)).toEqual(['沙盘', '城市', '所在区域', '世界']);
    expect(host.querySelector('.world-map')?.getAttribute('data-map-layer')).toBe('sandtable');
    const viewport = host.querySelector('[data-world-map-viewport]')!;
    expect(viewport.getAttribute('data-map-rise')).toBe('1.000');
    (host.querySelector('[aria-label="缩小地图"]') as HTMLButtonElement).click(); await nextTick();
    expect(viewport.getAttribute('data-map-layer')).toBe('sandtable');
    expect(viewport.getAttribute('data-map-rise')).toBe('1.000');
    expect(host.querySelectorAll('.wm-destination')).toHaveLength(12);
    expect(host.querySelectorAll('.cms-place-pin')).toHaveLength(6);
    expect(host.querySelectorAll('.cms-place-dot')).toHaveLength(6);
    button(host, '城市', '.wm-layers').click(); await nextTick();
    expect(viewport.getAttribute('data-map-layer')).toBe('city');
    expect([...host.querySelectorAll('.wm-district-list button')].map(item => item.textContent)).toEqual(['校园与南门', '家与住宅区', '商业区', '城市公园', '市中心区']);
    button(host, '世界', '.wm-layers').click(); await nextTick();
    expect(viewport.getAttribute('data-map-layer')).toBe('world'); expect(dispatch).not.toHaveBeenCalled();
  });

  it('小说模式列出 15 处校园及室内地点，去室内按真实报价结算并通知关闭地图', async () => {
    const { host, model, dispatch, travelled } = await mountMap(true);
    expect(host.querySelectorAll('.wm-destination')).toHaveLength(15);
    const room = novelDestinations.find(item => item.id === 'study-room')!;
    const target = [...host.querySelectorAll<HTMLButtonElement>('.wm-destination')].find(item => item.querySelector('b')?.textContent === room.name)!;
    const quote = getNovelTravelQuote(model.state, room.id), energy = model.state.player.energy;
    expect(target.textContent).toContain(`${quote.minutes} 分钟`);
    target.click(); await nextTick();
    expect(dispatch).toHaveBeenCalledExactlyOnceWith({ type: 'novel_travel', locationId: room.id });
    expect(model.state.interior?.roomId).toBe(room.id); expect(model.state.player.energy).toBe(energy - quote.energyCost);
    expect(travelled).toHaveBeenCalledTimes(1);
  });

  it('小说城市目的地显示完整公交费用，确认后状态与报价一致', async () => {
    const { host, model, dispatch, travelled } = await mountMap(true);
    const quote = getNovelTravelQuote(model.state, 'home'), balance = model.state.player.balance;
    button(host, '城市', '.wm-layers').click(); await nextTick();
    button(host, '家与住宅区', '.wm-district-list').click(); await nextTick();
    expect(host.querySelector('.wm-details')?.textContent).toContain(`车费 ¥${quote.fare}`);
    expect(host.querySelector('.wm-details')?.textContent).toContain(`${quote.minutes} 分钟`);
    button(host, '前往家与住宅区').click(); await nextTick();
    expect(dispatch).toHaveBeenCalledExactlyOnceWith({ type: 'novel_travel', locationId: 'home' });
    expect(model.state.locationId).toBe('home'); expect(model.state.player.balance).toBe(balance - quote.fare);
    expect(model.state.transit.sequence).toBe(quote.rides.length); expect(travelled).toHaveBeenCalledTimes(1);
  });

  it('3D 城市层仍要求前往南门公交站，不直接传送到远郊', async () => {
    const { host, dispatch, travelled } = await mountMap();
    button(host, '城市', '.wm-layers').click(); await nextTick();
    button(host, '商业区', '.wm-district-list').click(); await nextTick();
    expect([...host.querySelectorAll('button')].some(item => item.textContent === '前往商业区')).toBe(false);
    button(host, '前往南门公交站').click(); await nextTick();
    expect(dispatch).toHaveBeenCalledExactlyOnceWith({ type: 'travel', locationId: 'bus-stop' });
    expect(travelled).not.toHaveBeenCalled();
  });

  it('费用不足禁止小说出行；保存失败留在地图，忙碌时也不触发', async () => {
    const { host, model, dispatch, travelled } = await mountMap(true);
    model.state.player.balance = 0;
    button(host, '城市', '.wm-layers').click(); await nextTick();
    button(host, '家与住宅区', '.wm-district-list').click(); await nextTick();
    expect(button(host, '前往家与住宅区').disabled).toBe(true);
    button(host, '前往家与住宅区').click(); expect(dispatch).not.toHaveBeenCalled();
    model.state.player.balance = 100; await nextTick();
    dispatch.mockImplementation(() => { model.notice = '无法保存'; });
    button(host, '前往家与住宅区').click(); await nextTick();
    expect(travelled).not.toHaveBeenCalled(); expect(model.state.locationId).toBe('gate');
    dispatch.mockClear(); model.busy = true; await nextTick();
    button(host, '前往家与住宅区').click(); expect(dispatch).not.toHaveBeenCalled();
  });

  it('3D 室内不绕过出口，小说模式可直接按统一规则离开房间', async () => {
    const state = reduceState(createInitialState(), { type: 'novel_travel', locationId: 'dorm-room' });
    const f = await mountMap(false, state);
    expect([...f.host.querySelectorAll<HTMLButtonElement>('.wm-destination')].every(item => item.disabled)).toBe(true);
    expect(button(f.host, '离开房间，回到入口').disabled).toBe(false);
    app?.unmount(); app = undefined; document.body.innerHTML = '';
    const novel = await mountMap(true, state);
    const library = [...novel.host.querySelectorAll<HTMLButtonElement>('.wm-destination')].find(item => item.querySelector('b')?.textContent === '图书馆')!;
    expect(library.disabled).toBe(false); library.click(); await nextTick();
    expect(novel.model.state.interior).toBeNull(); expect(novel.model.state.locationId).toBe('library'); expect(novel.travelled).toHaveBeenCalledTimes(1);
  });
});
