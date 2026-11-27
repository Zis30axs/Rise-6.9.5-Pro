import { afterEach, expect, it, vi } from 'vitest';
import { createApp, nextTick, reactive, toRaw, type App as VueApp } from 'vue';
import App from '../src/frontend/App.vue';
import type { ShellActions, ShellModel, WorldAction } from '../src/frontend/types';
import { createInitialState, reduceState } from '../src/runtime/model';
import { enableProtagonists } from '../src/runtime/protagonist-world';
import { cookingDishId } from '../src/runtime/cooking-catalog';

let app: VueApp | undefined;
afterEach(() => {
  app?.unmount(); document.body.replaceChildren(); localStorage.clear();
  vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks();
});

it('连续吃同一道菜以及街边用餐后，手动和定时收起提示都保留食用结果', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} });
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  localStorage.setItem('unread-city.presentation-mode.v1', 'novel');
  const start = createInitialState();
  start.clock = { day: 4, hour: 12, minute: 0 };
  const dish = cookingDishId('egg-fried-rice', 'normal');
  start.inventory.push({ itemId: dish, quantity: 2 });
  const student = reduceState(enableProtagonists(start), { type: 'choose_academics', majorId: 'music' });
  const state = reduceState(student, { type: 'novel_travel', locationId: 'commercial' });
  const model = reactive({ state, busy: false, notice: '', mode: 'demo', phoneContactUnread: [] } as unknown as ShellModel);
  const actions = { dispatch(action: WorldAction) { model.state = reduceState(toRaw(model.state), action); } } as ShellActions;
  const root = document.createElement('div'); document.body.append(root);
  app = createApp(App, { model, actions }); app.mount(root);
  const button = async (selector: string) => {
    const el = root.querySelector<HTMLButtonElement>(selector);
    expect(el, selector).toBeTruthy(); expect(el!.disabled).toBe(false);
    el!.click(); await nextTick(); await nextTick();
  };
  const meal = `[data-inventory-product="${dish}"] button.inventory-use`;
  await button('.tool-dock button[aria-label="我"]');
  await button('[data-me-tab="carry"]');
  await button(meal);
  expect(root.querySelector('[data-use-receipt]')?.textContent).toContain('蛋炒饭');
  await button('[data-use-receipt] button[aria-label="关闭提示"]');
  expect(root.querySelector('[data-use-receipt]')).toBeNull();
  expect(model.state.inventory.find(row => row.itemId === dish)?.quantity).toBe(1);
  await button(meal);
  await vi.advanceTimersByTimeAsync(5999);
  expect(root.querySelector('[data-use-receipt]')).not.toBeNull();
  await vi.advanceTimersByTimeAsync(1);
  expect(root.querySelector('[data-use-receipt]')).toBeNull();
  expect(model.state.inventory.some(row => row.itemId === dish)).toBe(false);
  await button('[data-me-panel] .pn-close');
  const chat = '[data-reading-layer] [data-local-activity-receipt]';
  for (const manual of [true, false]) {
    await button('[data-here-strip] [data-quick-service="eat-meal"]');
    expect(root.querySelector(chat)?.textContent).toContain('吃简餐');
    const saved = JSON.stringify(model.state);
    if (manual) await button(chat + ' button[aria-label="关闭提示"]');
    else await vi.advanceTimersByTimeAsync(6000);
    expect(root.querySelector(chat)).toBeNull();
    expect(JSON.stringify(model.state)).toEqual(saved);
    expect(root.querySelector<HTMLTextAreaElement>('#uc-action-input')?.disabled).toBe(false);
  }
});
