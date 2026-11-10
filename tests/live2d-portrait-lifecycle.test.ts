import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, reactive, type App } from 'vue';
import NovelLive2DPortrait from '../src/frontend/NovelLive2DPortrait.vue';
import { live2dContext } from '../src/frontend/live2d-context';
import { createInitialState, reduceState } from '../src/runtime/model';
import { enableProtagonists } from '../src/runtime/protagonist-world';
import { live2dAppearancePrompt } from '../src/runtime/live2d-wardrobe';
import type { Live2dPackStatus } from '../src/runtime/live2d-pack';
import type { SoyoPortrait } from '../src/frontend/live2d-soyo-runtime';

const fake = vi.hoisted(() => ({ loads: vi.fn(), sources: vi.fn() }));
vi.mock('../src/frontend/live2d-soyo-runtime', () => ({ createSoyoPortrait: fake.loads }));
vi.mock('../src/frontend/live2d-ensemble-assets', () => ({ createEnsembleSource: fake.sources }));
const apps: App[] = [];
let serial = 0;
let status: Live2dPackStatus & { hydrating?: boolean };
let notify: () => void;
const portrait = (): SoyoPortrait => ({ destroy: vi.fn(), resize: vi.fn(), setActive: vi.fn(), setEmotion: vi.fn(async () => true) });
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  status = { installed: true, enabled: true, generation: 1, pack: 'lifecycle', models: ['soyo', 'sakiko'].map(person => ({
    id: person + '-casual', person: person as 'soyo' | 'sakiko', label: '便服', description: '便服',
    tags: ['casual'], definitionSha: person, bundledSoyo: false,
  })) };
  vi.stubGlobal('__UC_LIVE2D__', { status: () => status, subscribe: (fn: () => void) => { notify = fn; return () => {}; } });
  fake.loads.mockReset().mockImplementation(async () => portrait());
  fake.sources.mockReset().mockImplementation(async () => ({ lease: { release: vi.fn() } }));
});
afterEach(() => { apps.splice(0).forEach(app => app.unmount()); document.body.replaceChildren(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function mount() {
  const props = reactive({ speaker: '长崎素世', emotion: '平静', active: true, refreshToken: 0 });
  const context = reactive({ session: `portrait-lifecycle-${++serial}`, state: enableProtagonists(createInitialState()), enabled: true });
  const root = document.createElement('div'); document.body.append(root);
  const app = createApp({ render: () => h(NovelLive2DPortrait, props, { default: () => h('div', { 'data-legacy-portrait': props.speaker }) }) });
  app.provide(live2dContext, () => context); apps.push(app); app.mount(root);
  return { root, props, context };
}
const ready = (root: HTMLElement) => vi.waitFor(() => expect(root.querySelector('[data-live2d-status="ready"]')).not.toBeNull());

it('does not flash the legacy school uniform while the selected outfit is loading', async () => {
  let complete!: (value: SoyoPortrait) => void;
  fake.loads.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
  const { root } = mount();
  await vi.waitFor(() => expect(complete).toBeTypeOf('function'));
  expect(root.querySelector('[data-legacy-portrait]')).toBeNull();
  complete(portrait()); await ready(root);
});

it('waits for persisted optional-pack hydration before choosing the legacy portrait', async () => {
  status = { ...status, installed: false, enabled: false, hydrating: true };
  const { root } = mount(); await nextTick();
  expect(root.querySelector('[data-legacy-portrait]')).toBeNull();
  status = { ...status, installed: true, enabled: true, hydrating: false, generation: 2 }; notify();
  await ready(root);
});

it('pauses a covered portrait and resumes the same canvas without loading or flashing a fallback', async () => {
  const instance = portrait(); fake.loads.mockResolvedValueOnce(instance);
  const { root, props } = mount(); await ready(root);
  const canvas = root.querySelector('canvas');
  props.active = false; await nextTick();
  expect(instance.destroy).not.toHaveBeenCalled();
  expect(instance.setActive).toHaveBeenLastCalledWith(false);
  expect(root.querySelector('[data-legacy-portrait]')).toBeNull();
  props.active = true; await ready(root);
  expect(fake.loads).toHaveBeenCalledTimes(1); expect(root.querySelector('canvas')).toBe(canvas);
});

it('does not rebuild a model when the environment changes but its selected outfit is unchanged', async () => {
  const { root, context } = mount(); await ready(root);
  context.state.clock.hour = 19; await nextTick(); await ready(root);
  expect(fake.loads).toHaveBeenCalledTimes(1);
});

it('hides the outgoing person and never shows Sakiko as a temporary static fallback', async () => {
  const { root, props, context } = mount(); await ready(root);
  let complete!: (value: SoyoPortrait) => void;
  fake.loads.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
  context.state = reduceState(context.state, { type: 'switch_protagonist', target: 'sakiko' });
  props.speaker = '丰川祥子';
  await vi.waitFor(() => expect(complete).toBeTypeOf('function'));
  expect(root.querySelector('[data-legacy-portrait]')).toBeNull();
  expect(root.querySelector('[data-live2d-status="ready"]')).toBeNull();
  complete(portrait()); await ready(root);
  expect(root.querySelector('[data-live2d-person]')?.getAttribute('data-live2d-person')).toBe('sakiko');
});

it('still falls back after a real load failure and retries after a manual refresh', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  fake.loads.mockRejectedValueOnce(Error('invalid texture'));
  const { root, props } = mount();
  await vi.waitFor(() => expect(fake.loads).toHaveBeenCalledTimes(1)); await nextTick();
  await vi.waitFor(() => expect(root.querySelector('[data-legacy-portrait]')).not.toBeNull());
  props.refreshToken++; await ready(root);
  expect(root.querySelector('[data-legacy-portrait]')).toBeNull();
});

it('drops a late portrait from the previous person without replacing the current one', async () => {
  let complete!: (value: SoyoPortrait) => void;
  fake.loads.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
  const { root, props, context } = mount();
  await vi.waitFor(() => expect(complete).toBeTypeOf('function'));
  context.state = reduceState(context.state, { type: 'switch_protagonist', target: 'sakiko' }); props.speaker = '丰川祥子';
  await ready(root); const late = portrait(); complete(late);
  await vi.waitFor(() => expect(late.destroy).toHaveBeenCalledTimes(1));
  expect(root.querySelector('[data-live2d-person="sakiko"][data-live2d-status="ready"]')).not.toBeNull();
  expect(root.querySelector('[data-legacy-portrait]')).toBeNull();
});

it('withdraws outfit confirmation while covered and frees a long-idle portrait', async () => {
  const instance = portrait(); fake.loads.mockResolvedValueOnce(instance);
  const { root, props, context } = mount(); await ready(root);
  expect(live2dAppearancePrompt(context.session, context.state)).toContain('便服');
  vi.useFakeTimers(); props.active = false; await nextTick();
  expect(live2dAppearancePrompt(context.session, context.state)).toBe('');
  await vi.advanceTimersByTimeAsync(30_000);
  expect(instance.destroy).toHaveBeenCalledTimes(1);
  expect(root.querySelector('[data-legacy-portrait]')).toBeNull();
  vi.useRealTimers(); props.active = true; await ready(root);
  expect(fake.loads).toHaveBeenCalledTimes(2);
});

it('invalidates the optional model when the pack is disabled and restores the authored fallback', async () => {
  const instance = portrait(); fake.loads.mockResolvedValueOnce(instance);
  const { root, context } = mount(); await ready(root);
  status = { ...status, enabled: false, generation: status.generation + 1 }; notify(); await nextTick();
  expect(instance.destroy).toHaveBeenCalledTimes(1);
  expect(root.querySelector('[data-legacy-portrait="长崎素世"]')).not.toBeNull();
  expect(live2dAppearancePrompt(context.session, context.state)).toBe('');
});
