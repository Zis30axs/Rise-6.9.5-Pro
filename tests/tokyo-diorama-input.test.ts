import { afterEach, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick } from 'vue';
import { createInitialState } from '../src/runtime/model';
import type { ShellModel, ShellActions } from '../src/frontend/types';
import WorldMap from '../src/frontend/WorldMap.vue';
const capture = vi.hoisted(() => ({ lastPan: { x: 0, y: 0 }, picks: 0 }));
vi.mock('../src/frontend/CitySandboxScene.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      props: ['pan', 'viewScale'],
      setup(props, { emit, expose }) {
        expose({
          pickAt: (_x: number, _y: number, focus = false) => {
            capture.picks++;
            emit(focus ? 'focusPlace' : 'inspect', 'aquarium');
            return true;
          },
        });
        return () => {
          capture.lastPan = { ...props.pan };
          return h('canvas', { class: 'test-city' });
        };
      },
    }),
  };
});
afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});
it('pinches and pans a phone viewport, suppresses drag taps, then selects and focuses without travel', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  const state = createInitialState(),
    model = { state, busy: false, notice: '' } as ShellModel,
    actions = { dispatch: vi.fn() } as unknown as ShellActions;
  const mount = document.createElement('div');
  document.body.append(mount);
  const app = createApp(
    defineComponent({
      setup: () => () =>
        h(WorldMap, { model, actions, novelMode: true, tokyoOnly: true }),
    })
  );
  app.mount(mount);
  try {
    const viewport = mount.querySelector(
      '[data-world-map-viewport]'
    ) as HTMLElement;
    viewport.getBoundingClientRect = () =>
      ({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 390,
        bottom: 430,
        width: 390,
        height: 430,
        toJSON() {},
      }) as DOMRect;
    const event = (kind: string, id: number, x: number, y: number) => {
      const e = new MouseEvent(kind, {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: x,
        clientY: y,
      });
      Object.defineProperties(e, {
        pointerId: { value: id },
        pointerType: { value: 'touch' },
      });
      viewport.dispatchEvent(e);
    };
    const scale = () => Number(viewport.dataset.mapScale);
    const initial = scale();
    event('pointerdown', 1, 70, 150);
    event('pointerdown', 2, 170, 150);
    event('pointermove', 2, 235, 147);
    event('pointerup', 1, 70, 150);
    event('pointerup', 2, 235, 147);
    await nextTick();
    expect(scale()).toBeGreaterThan(initial);
    expect(capture.picks).toBe(0);
    const before = { ...capture.lastPan };
    event('pointerdown', 1, 100, 165);
    event('pointermove', 1, 145, 190);
    event('pointerup', 1, 145, 190);
    await nextTick();
    expect(capture.lastPan).not.toEqual(before);
    expect(capture.picks).toBe(0);
    event('pointerdown', 1, 95, 120);
    event('pointerup', 1, 95, 120);
    await nextTick();
    expect(mount.querySelector('.tc-selection h3')?.textContent).toContain(
      'Sunshine City'
    );
    viewport.dispatchEvent(
      new MouseEvent('dblclick', { bubbles: true, clientX: 95, clientY: 120 })
    );
    await nextTick();
    expect(
      mount.querySelector('.world-map')?.getAttribute('data-map-district')
    ).toBe('commercial');
    expect(actions.dispatch).not.toHaveBeenCalled();
    expect(state.locationId).toBe('gate');
  } finally {
    app.unmount();
  }
});
