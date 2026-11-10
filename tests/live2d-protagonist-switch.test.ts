import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, reactive, toRaw, type App } from 'vue';
import Shell from '../src/frontend/App.vue';
import { createInitialState, reduceState } from '../src/runtime/model';
import { activeProtagonist, enableProtagonists } from '../src/runtime/protagonist-world';
import { switchEndpoint, type ProtagonistSwitchLease } from '../src/frontend/protagonist-switch';
import type { ShellActions, ShellModel } from '../src/frontend/types';
import type { Live2dPackStatus } from '../src/runtime/live2d-pack';

const fake = vi.hoisted(() => ({ loads: vi.fn(), sources: vi.fn() }));
vi.mock('../src/frontend/live2d-soyo-runtime', () => ({ createSoyoPortrait: fake.loads }));
vi.mock('../src/frontend/live2d-ensemble-assets', () => ({ createEnsembleSource: fake.sources }));
vi.mock('../src/frontend/shell-layout', () => ({ bindShellLayout: () => ({ dispose() {} }) }));
vi.mock('../src/frontend/InteractiveScene.vue', () => ({ default: defineComponent({ render: () => null }) }));
vi.mock('../src/frontend/InteriorScene.vue', () => ({ default: defineComponent({ render: () => null }) }));
vi.mock('../src/frontend/ProtagonistSwitchOverlay.vue', () => ({ default: defineComponent({
  props: ['lease'], emits: ['finished'], setup(props, { emit }) {
    return () => h('div', { 'data-switch-fixture': '' }, [
      h('button', { 'data-commit-switch': '', onClick: () => props.lease.commit() }),
      h('button', { 'data-finish-switch': '', onClick: () => emit('finished') }),
    ]);
  },
}) }));
let app: App | undefined;
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); localStorage.setItem('unread-city.presentation-mode.v1', 'novel');
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  const status: Live2dPackStatus = { installed: true, enabled: true, generation: 1, pack: 'switch',
    models: ['soyo', 'sakiko'].map(person => ({ id: person + '-casual', person: person as 'soyo' | 'sakiko',
      label: '便服', description: '便服', tags: ['casual'], definitionSha: person, bundledSoyo: false })) };
  vi.stubGlobal('__UC_LIVE2D__', { status: () => status, subscribe: () => () => {} });
  fake.loads.mockReset().mockImplementation(async () => ({ destroy: vi.fn(), resize: vi.fn(), setActive: vi.fn(), setEmotion: vi.fn(async () => true) }));
  fake.sources.mockReset().mockImplementation(async () => ({ lease: { release: vi.fn() } }));
});
afterEach(() => { app?.unmount(); app = undefined; document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('keeps Sakiko Live2D during switch ascent, then shows only the target outfit without legacy Soyo', async () => {
  let initial = enableProtagonists(createInitialState());
  initial = reduceState(initial, { type: 'switch_protagonist', target: 'sakiko' });
  const model = reactive<ShellModel>({ state: initial, mode: 'demo', memoryScope: 'switch-view', busy: false,
    notice: '', connection: '', externalPhoneAvailable: false, externalPhoneOpen: false,
    phoneStatus: 'idle', phoneError: '', phoneSource: 'none', phoneLinkStatus: 'idle', phoneLinkError: '', phoneUnread: 0, phoneContactUnread: [] });
  const actions: ShellActions = {
    beginProtagonistSwitch(target) {
      const snapshot = toRaw(model.state);
      const lease: ProtagonistSwitchLease = { source: switchEndpoint(snapshot, activeProtagonist(snapshot)), target: switchEndpoint(snapshot, target),
        commit() { model.state = reduceState(toRaw(model.state), { type: 'switch_protagonist', target }); return true; }, release() {} };
      return lease;
    },
    dispatch: vi.fn(), send: vi.fn(), exit: vi.fn(), switchChat: vi.fn(), openPhone: vi.fn(), closePhone: vi.fn(),
    openPhoneContact: vi.fn(), retryPhoneSync: vi.fn(),
  };
  const root = document.createElement('div'); document.body.append(root);
  app = createApp(Shell, { model, actions }); app.mount(root);
  await vi.waitFor(() => expect(root.querySelector('[data-live2d-person="sakiko"][data-live2d-status="ready"]')).not.toBeNull());
  const canvas = root.querySelector('[data-live2d-person="sakiko"] canvas');
  const select = root.querySelector<HTMLSelectElement>('[data-protagonist-select]')!;
  select.value = 'soyo'; select.dispatchEvent(new Event('change')); await nextTick();
  expect(root.querySelector('[data-switch-fixture]')).not.toBeNull();
  expect(root.querySelector('[data-live2d-person="sakiko"][data-live2d-status="ready"] canvas')).toBe(canvas);
  expect(root.querySelector('[data-sakiko-sprite]')).toBeNull();
  root.querySelector<HTMLButtonElement>('[data-commit-switch]')!.click(); await nextTick();
  await vi.waitFor(() => expect(root.querySelector('[data-live2d-person="soyo"][data-live2d-status="ready"]')).not.toBeNull());
  expect(root.querySelector('[data-live2d-person="sakiko"]')).toBeNull();
  expect(root.querySelector('[data-live2d-speaker-visible="true"]')).toBeNull();
  root.querySelector<HTMLButtonElement>('[data-finish-switch]')!.click(); await nextTick();
  select.value = 'sakiko'; select.dispatchEvent(new Event('change')); await nextTick();
  root.querySelector<HTMLButtonElement>('[data-commit-switch]')!.click(); await nextTick();
  await vi.waitFor(() => expect(root.querySelector('[data-live2d-person="sakiko"][data-live2d-status="ready"]')).not.toBeNull());
  expect(root.querySelector('[data-live2d-person="soyo"]')).toBeNull();
  expect(root.querySelector('[data-live2d-speaker-visible="true"]')).toBeNull();
});
