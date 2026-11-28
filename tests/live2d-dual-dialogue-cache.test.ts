// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, reactive, ref, type App as VueApp } from 'vue';

const runtimeMocks = vi.hoisted(() => {
  let seq = 0;
  const instances: Array<{
    id: number;
    personHint: string;
    setActive: ReturnType<typeof vi.fn>;
    setEmotion: ReturnType<typeof vi.fn>;
    resize: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  }> = [];
  const createSoyoPortrait = vi.fn(async (_canvas: HTMLCanvasElement, _signal?: AbortSignal, source?: { person?: string; outfitId?: string }) => {
    const id = ++seq;
    const portrait = {
      id,
      personHint: source?.person ?? 'bundled-soyo',
      setActive: vi.fn(),
      setEmotion: vi.fn(async () => undefined),
      resize: vi.fn(),
      destroy: vi.fn(),
    };
    instances.push(portrait);
    return portrait;
  });
  return { instances, createSoyoPortrait, reset: () => { seq = 0; instances.length = 0; createSoyoPortrait.mockClear(); } };
});

vi.mock('../src/frontend/live2d-soyo-runtime', () => ({
  createSoyoPortrait: runtimeMocks.createSoyoPortrait,
}));

vi.mock('../src/frontend/live2d-ensemble-assets', () => ({
  createEnsembleSource: vi.fn(async (outfit: { person: string; id: string }) => ({
    person: outfit.person,
    outfitId: outfit.id,
    lease: { release: vi.fn() },
  })),
}));

import RootApp from '../src/frontend/App.vue';
import NovelInvitationPortraits from '../src/frontend/NovelInvitationPortraits.vue';
import NovelLive2DPortrait from '../src/frontend/NovelLive2DPortrait.vue';
import SoyoLive2D from '../src/frontend/SoyoLive2D.vue';
import { live2dContext } from '../src/frontend/live2d-context';
import { createLive2dPortraitCache, live2dPortraitCacheKey } from '../src/frontend/live2d-portrait-cache';
import { clearNovelReadingProgressCache } from '../src/frontend/novel-reading-progress';
import { savePresentationMode } from '../src/frontend/presentation-mode';
import { createInitialState } from '../src/runtime/model';
import { enableProtagonists, gameMinute } from '../src/runtime/protagonist-world';
import { MARGO_CAFE_LOCATION_ID, MARGO_CAFE_ROOM_ID } from '../src/runtime/margo-cafe-venue';
import { worldScenePresence } from '../src/runtime/world-presence';
import type { Live2dOutfit, Live2dPackApi, Live2dPackStatus } from '../src/runtime/live2d-pack';
import type { ShellActions, ShellModel } from '../src/frontend/types';

function makeOutfit(person: Live2dOutfit['person'], id: string, label: string): Live2dOutfit {
  return { id, person, label, description: '', tags: ['casual'], definitionSha: `${person}-${id}-sha`, bundledSoyo: false };
}

function createSceneWithCast() {
  const base = createInitialState();
  base.locationId = MARGO_CAFE_LOCATION_ID;
  const presence = worldScenePresence(base)!;
  base.scene = { ...presence, encounterId: null };
  base.interior = { roomId: MARGO_CAFE_ROOM_ID, x: 0, z: 3, yaw: 0, activityId: null, lastRest: null, lastStudy: null };
  const state = enableProtagonists(base);
  const minute = gameMinute(state);
  const store = state.protagonists!;
  store.inactive = {
    ...store.inactive,
    locationId: MARGO_CAFE_LOCATION_ID,
    interior: { roomId: MARGO_CAFE_ROOM_ID, x: 0, z: 3, yaw: 0, activityId: null, lastRest: null, lastStudy: null },
    scene: { ...presence, x: presence.x + 1, z: presence.z + 1, encounterId: null },
  };
  store.otherSideNpc = {
    'bang-mutsumi': { locationId: MARGO_CAFE_ROOM_ID, status: '在咖啡馆坐着', at: minute - 10, until: minute + 120 },
    'bang-anon': { locationId: MARGO_CAFE_ROOM_ID, status: '在咖啡馆聊天', at: minute - 10, until: minute + 120 },
  };
  return state;
}

function installFakePack(initialModels: Live2dOutfit[]): {
  status: Live2dPackStatus;
  notify: () => void;
  uninstall: () => void;
} {
  const listeners = new Set<() => void>();
  const status: Live2dPackStatus = {
    installed: true,
    enabled: true,
    hydrating: false,
    generation: 1,
    pack: 'ensemble-pack-v1',
    models: initialModels,
  };
  const api: Live2dPackApi = {
    status: () => ({ ...status }),
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    install: vi.fn(),
    setEnabled: vi.fn(),
    remove: vi.fn(),
    getAsset: async () => new Blob([]),
  };
  (globalThis as typeof globalThis & { __UC_LIVE2D__?: Live2dPackApi }).__UC_LIVE2D__ = api;
  return {
    status,
    notify() { for (const fn of [...listeners]) fn(); },
    uninstall() { delete (globalThis as typeof globalThis & { __UC_LIVE2D__?: Live2dPackApi }).__UC_LIVE2D__; },
  };
}

async function flushUi(rounds = 4) {
  for (let i = 0; i < rounds; i++) {
    await nextTick();
    await vi.dynamicImportSettled();
  }
  await new Promise(resolve => setTimeout(resolve, 0));
  await nextTick();
  await vi.dynamicImportSettled();
  await nextTick();
}

async function flushPortraitStartup() {
  await nextTick();
  expect(runtimeMocks.createSoyoPortrait).not.toHaveBeenCalled();
  await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  await flushUi();
}

const apps: VueApp[] = [];
function mountRoot(app: VueApp): HTMLElement {
  const root = document.createElement('div');
  document.body.append(root);
  apps.push(app);
  app.mount(root);
  return root;
}

function setDocumentHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  runtimeMocks.reset();
  clearNovelReadingProgressCache();
  setDocumentHidden(false);
  localStorage.clear();
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    disconnect() {}
  });
});

afterEach(() => {
  apps.splice(0).forEach(app => app.unmount());
  document.body.replaceChildren();
  delete (globalThis as typeof globalThis & { __UC_LIVE2D__?: Live2dPackApi }).__UC_LIVE2D__;
  clearNovelReadingProgressCache();
  localStorage.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('live2d dual dialogue standby cache', () => {
  it('reuses parked models across Soyo <-> Sakiko dialogue in App without reloading', async () => {
    const pack = installFakePack([
      makeOutfit('soyo', 'soyo-casual', '日常便服'),
      makeOutfit('sakiko', 'sakiko-uniform', '校服'),
    ]);
    savePresentationMode('novel');

    const state = createSceneWithCast();
    state.story = [{
      id: 'turn-1',
      role: 'assistant',
      text: [
        '|长崎素世|平静|早安，祥子。|',
        '|丰川祥子|严肃|早上好，有什么事？|',
        '|长崎素世|开心|一起走吧。|',
        '|丰川祥子|平静|……好。|',
        '|长崎素世|平静|走这边。|',
        '|丰川祥子|思考|嗯。|',
      ].join('\n'),
    }];

    const model = reactive<ShellModel>({
      mode: 'tavern',
      memoryScope: 'fresh',
      state,
      busy: false,
      notice: '',
      connection: 'ready',
      externalPhoneAvailable: false,
      externalPhoneOpen: false,
      phoneStatus: 'idle',
      phoneError: '',
      phoneSource: 'none',
      phoneLinkStatus: 'idle',
      phoneLinkError: '',
      phoneUnread: 0,
      phoneContactUnread: [],
    });
    const actions: ShellActions = {
      dispatch() {},
      send: async () => undefined,
      exit() {},
      switchChat() {},
      openPhone() {},
      closePhone() {},
      openPhoneContact: async () => undefined,
      retryPhoneSync() {},
    };

    const root = mountRoot(createApp(RootApp, { model, actions }));
    await flushPortraitStartup();

    expect(runtimeMocks.createSoyoPortrait).toHaveBeenCalledTimes(1);
    expect(root.querySelector('[data-live2d-person="soyo"][data-live2d-status="ready"]')).not.toBeNull();

    const advanceBtn = () => root.querySelector<HTMLButtonElement>('button[aria-label="点击推进剧情"]')!;

    // Turn 2: Sakiko (cold load once)
    advanceBtn().click();
    await flushUi();
    expect(runtimeMocks.createSoyoPortrait).toHaveBeenCalledTimes(2);
    expect(root.querySelector('[data-live2d-person="sakiko"][data-live2d-status="ready"]')).not.toBeNull();
    expect(root.querySelector('[data-live2d-person="soyo"]')).toBeNull();

    // Turns 3-6: alternating Soyo <-> Sakiko should reuse parked GPU instances with 0 new loads
    for (const expectedPerson of ['soyo', 'sakiko', 'soyo', 'sakiko'] as const) {
      advanceBtn().click();
      await flushUi();
      expect(runtimeMocks.createSoyoPortrait).toHaveBeenCalledTimes(2);
      expect(root.querySelector(`[data-live2d-person="${expectedPerson}"][data-live2d-status="ready"]`)).not.toBeNull();
    }

    // Manual refresh clears cache and forces reload on next appearance
    root.querySelector<HTMLButtonElement>('.graphics-refresh-button')!.click();
    await flushUi();
    expect(runtimeMocks.createSoyoPortrait).toHaveBeenCalledTimes(3);

    // Pack disable immediately destroys live & parked instances
    pack.status.enabled = false;
    pack.status.generation += 1;
    pack.notify();
    await flushUi();
    expect(runtimeMocks.instances.every(item => item.destroy.mock.calls.length >= 1)).toBe(true);
  });

  it('reuses parked models across two non-Soyo speakers (Sakiko <-> Mutsumi) inside App', async () => {
    installFakePack([
      makeOutfit('sakiko', 'sakiko-uniform', '校服'),
      makeOutfit('mutsumi', 'mutsumi-uniform', '校服'),
    ]);
    savePresentationMode('novel');

    const state = createSceneWithCast();
    state.story = [{
      id: 'turn-npc',
      role: 'assistant',
      text: [
        '|丰川祥子|严肃|睦。|',
        '|若叶睦|平静|……嗯。|',
        '|丰川祥子|平静|今天去排练。|',
        '|若叶睦|思考|知道了。|',
      ].join('\n'),
    }];

    const model = reactive<ShellModel>({
      mode: 'tavern',
      memoryScope: 'fresh',
      state,
      busy: false,
      notice: '',
      connection: 'ready',
      externalPhoneAvailable: false,
      externalPhoneOpen: false,
      phoneStatus: 'idle',
      phoneError: '',
      phoneSource: 'none',
      phoneLinkStatus: 'idle',
      phoneLinkError: '',
      phoneUnread: 0,
      phoneContactUnread: [],
    });
    const actions: ShellActions = {
      dispatch() {},
      send: async () => undefined,
      exit() {},
      switchChat() {},
      openPhone() {},
      closePhone() {},
      openPhoneContact: async () => undefined,
      retryPhoneSync() {},
    };

    const root = mountRoot(createApp(RootApp, { model, actions }));
    await flushPortraitStartup();
    expect(runtimeMocks.createSoyoPortrait).toHaveBeenCalledTimes(1);

    const advanceBtn = () => root.querySelector<HTMLButtonElement>('button[aria-label="点击推进剧情"]')!;
    advanceBtn().click();
    await flushUi();
    expect(runtimeMocks.createSoyoPortrait).toHaveBeenCalledTimes(2);
    expect(root.querySelector('[data-live2d-person="mutsumi"][data-live2d-status="ready"]')).not.toBeNull();

    advanceBtn().click();
    await flushUi();
    expect(runtimeMocks.createSoyoPortrait).toHaveBeenCalledTimes(2);
    expect(root.querySelector('[data-live2d-person="sakiko"][data-live2d-status="ready"]')).not.toBeNull();

    advanceBtn().click();
    await flushUi();
    expect(runtimeMocks.createSoyoPortrait).toHaveBeenCalledTimes(2);
    expect(root.querySelector('[data-live2d-person="mutsumi"][data-live2d-status="ready"]')).not.toBeNull();
  });

  it('hands off single <-> paired invitation stage Live2D and survives bystander interruptions', async () => {
    installFakePack([
      makeOutfit('soyo', 'soyo-casual', '日常便服'),
      makeOutfit('sakiko', 'sakiko-uniform', '校服'),
      makeOutfit('anon', 'anon-casual', '便服'),
    ]);

    const cache = createLive2dPortraitCache();
    const world = createSceneWithCast();
    const pairedVisible = ref(false);
    const singleSpeaker = ref('长崎素世');
    const singleActive = ref(true);

    const Host = {
      setup() {
        return () => h('div', [
          pairedVisible.value
            ? h(NovelInvitationPortraits, {
                pair: {
                  invitationId: 'inv-1',
                  left: { id: 'soyo', speaker: '长崎素世', aliases: ['素世'], portraitId: null, live2d: true },
                  right: { id: 'sakiko', speaker: '丰川祥子', aliases: ['祥子'], portraitId: null, live2d: true },
                },
                focus: {
                  invitationId: 'inv-1',
                  entryId: 'turn-1',
                  viewpoint: 'soyo',
                  speaking: 'right',
                  leftEmotion: '开心',
                  rightEmotion: '平静',
                  unrelatedSpeaker: false,
                },
                locationId: world.locationId,
                active: true,
              })
            : null,
          h(NovelLive2DPortrait, {
            speaker: singleSpeaker.value,
            emotion: '平静',
            active: !pairedVisible.value && singleActive.value,
          }),
        ]);
      },
    };

    const app = createApp(Host);
    app.provide(live2dContext, () => ({ session: 'protagonist:soyo', state: world, enabled: true }));
    app.provide(live2dPortraitCacheKey, cache);
    const root = mountRoot(app);
    await flushUi();

    expect(runtimeMocks.createSoyoPortrait).toHaveBeenCalledTimes(1);
    const soyoInstance = runtimeMocks.instances[0]!;

    // Single stage Soyo -> Paired stage (left Soyo adopts active instance; right Sakiko loads once)
    pairedVisible.value = true;
    await flushUi();
    expect(runtimeMocks.createSoyoPortrait).toHaveBeenCalledTimes(2);
    expect(soyoInstance.destroy).not.toHaveBeenCalled();

    const sides = root.querySelectorAll('.novel-invitation-portraits__side');
    expect(sides.length).toBe(2);
    expect(sides[0]?.querySelector('[data-live2d-person="soyo"][data-live2d-status="ready"]')).not.toBeNull();
    expect(sides[1]?.querySelector('[data-live2d-person="sakiko"][data-live2d-status="ready"]')).not.toBeNull();

    // Bystander interruption unmounts paired stage and loads Anon once
    pairedVisible.value = false;
    singleSpeaker.value = '千早爱音';
    await flushUi();
    expect(runtimeMocks.createSoyoPortrait).toHaveBeenCalledTimes(3);
    expect(soyoInstance.destroy).not.toHaveBeenCalled();
    expect(runtimeMocks.instances[1]!.destroy).not.toHaveBeenCalled();

    // Returning to paired stage reuses BOTH Soyo and Sakiko with 0 new loads
    pairedVisible.value = true;
    await flushUi();
    expect(runtimeMocks.createSoyoPortrait).toHaveBeenCalledTimes(3);
    expect(root.querySelectorAll('.novel-invitation-portraits__side [data-live2d-status="ready"]').length).toBe(2);

    // Exiting paired stage back to Single Soyo also reuses Soyo with 0 new loads
    singleSpeaker.value = '长崎素世';
    pairedVisible.value = false;
    await flushUi();
    expect(runtimeMocks.createSoyoPortrait).toHaveBeenCalledTimes(3);
    expect(root.querySelector('[data-live2d-person="soyo"][data-live2d-status="ready"]')).not.toBeNull();
  });

  it('keeps bundled SoyoLive2D warm across !active pauses and paired-stage handoffs', async () => {
    const cache = createLive2dPortraitCache();
    const activeSingle = ref(true);
    const speaker = ref('长崎素世');
    const pairedMount = ref(false);

    const Host = {
      setup() {
        return () => h('div', [
          h(SoyoLive2D, { speaker: speaker.value, emotion: '平静', active: activeSingle.value }),
          pairedMount.value
            ? h(SoyoLive2D, { speaker: '长崎素世', emotion: '开心', active: true })
            : null,
        ]);
      },
    };

    const app = createApp(Host);
    app.provide(live2dPortraitCacheKey, cache);
    const root = mountRoot(app);
    await flushUi();

    expect(runtimeMocks.createSoyoPortrait).toHaveBeenCalledTimes(1);
    const bundled = runtimeMocks.instances[0]!;

    // Briefly opening panel/dialog does not destroy immediately
    activeSingle.value = false;
    await flushUi();
    expect(bundled.destroy).not.toHaveBeenCalled();
    expect(bundled.setActive).toHaveBeenLastCalledWith(false);

    // Paired SoyoLive2D adopts the paused bundled instance with 0 reloads
    pairedMount.value = true;
    await flushUi();
    expect(runtimeMocks.createSoyoPortrait).toHaveBeenCalledTimes(1);
    expect(bundled.destroy).not.toHaveBeenCalled();

    // Returning back to Single SoyoLive2D also reuses it
    pairedMount.value = false;
    activeSingle.value = true;
    await flushUi();
    expect(runtimeMocks.createSoyoPortrait).toHaveBeenCalledTimes(1);
    expect(bundled.destroy).not.toHaveBeenCalled();
    expect(root.querySelector('[data-live2d-status="ready"]')).not.toBeNull();
  });

  it('enforces standby LRU, TTL expiration, and webglcontextlost cleanup in cache', () => {
    vi.useFakeTimers();
    const cache = createLive2dPortraitCache({ maxParked: 2, standbyTtlMs: 5_000 });

    const mk = (id: string) => {
      const destroy = vi.fn();
      const setActive = vi.fn();
      const portrait = { destroy, setActive, setEmotion: vi.fn(), resize: vi.fn() };
      const canvas = document.createElement('canvas');
      document.body.append(canvas);
      return { key: id, portrait, canvas, destroy, setActive };
    };

    const a = mk('a');
    const b = mk('b');
    const c = mk('c');

    expect(cache.park(a)).toBe(true);
    expect(a.canvas.isConnected).toBe(false);
    expect(a.setActive).toHaveBeenCalledWith(false);

    expect(cache.park(b)).toBe(true);
    expect(cache.park(c)).toBe(true);
    // LRU evicted 'a' when 'c' pushed capacity past 2
    expect(a.destroy).toHaveBeenCalledTimes(1);
    expect(b.destroy).not.toHaveBeenCalled();
    expect(c.destroy).not.toHaveBeenCalled();

    // WebGL context loss evicts parked 'b'
    const lost = new Event('webglcontextlost', { cancelable: true });
    b.canvas.dispatchEvent(lost);
    expect(lost.defaultPrevented).toBe(true);
    expect(b.destroy).toHaveBeenCalledTimes(1);

    // TTL expires 'c'
    vi.advanceTimersByTime(5_000);
    expect(c.destroy).toHaveBeenCalledTimes(1);
    expect(cache.acquire('c')).toBeNull();
  });

  it('never reloads or replays bundled SoyoLive2D motion when !active toggles or speaker returns with same emotion', async () => {
    const cache = createLive2dPortraitCache();
    const world = createSceneWithCast();
    const speaker = ref('长崎素世');
    const emotion = ref('平静');
    const active = ref(true);

    const Host = {
      setup() {
        return () => h(NovelLive2DPortrait, {
          speaker: speaker.value,
          emotion: emotion.value,
          active: active.value,
        }, {
          default: () => h(SoyoLive2D, {
            speaker: speaker.value,
            emotion: emotion.value,
            active: active.value,
          }),
        });
      },
    };

    const app = createApp(Host);
    app.provide(live2dContext, () => ({ session: 'protagonist:soyo', state: world, enabled: true }));
    app.provide(live2dPortraitCacheKey, cache);
    mountRoot(app);
    await flushUi();

    expect(runtimeMocks.createSoyoPortrait).toHaveBeenCalledTimes(1);
    const bundled = runtimeMocks.instances[0]!;
    expect(bundled.setEmotion).toHaveBeenCalledTimes(1);
    expect(bundled.setEmotion).toHaveBeenLastCalledWith('平静');

    // Temporarily deactivating stage (e.g. invitation pair / modal overlay) must not unmount Soyo
    active.value = false;
    await flushUi();
    expect(bundled.destroy).not.toHaveBeenCalled();
    expect(bundled.setActive).toHaveBeenLastCalledWith(false);

    // Switching to another speaker parks Soyo without destroying
    active.value = true;
    speaker.value = '千早爱音';
    await flushUi();
    expect(runtimeMocks.createSoyoPortrait).toHaveBeenCalledTimes(1);
    expect(bundled.destroy).not.toHaveBeenCalled();

    // Returning to Soyo with an equivalent resolved emotion ('微笑' -> '平静') must reuse without replaying motion
    speaker.value = '长崎素世';
    emotion.value = '微笑';
    await flushUi();
    expect(runtimeMocks.createSoyoPortrait).toHaveBeenCalledTimes(1);
    expect(bundled.destroy).not.toHaveBeenCalled();
    expect(bundled.setEmotion).toHaveBeenCalledTimes(1);
    expect(bundled.setActive).toHaveBeenLastCalledWith(true);
  });

  it('skips redundant setEmotion across ensemble Soyo -> Sakiko -> Soyo turns when resolved emotion matches cached', async () => {
    const pack = installFakePack([
      makeOutfit('soyo', 'soyo-casual', '日常便服'),
      makeOutfit('sakiko', 'sakiko-uniform', '校服'),
    ]);
    const cache = createLive2dPortraitCache();
    const world = createSceneWithCast();
    const speaker = ref('长崎素世');
    const emotion = ref('平静');

    const Host = {
      setup() {
        return () => h(NovelLive2DPortrait, {
          speaker: speaker.value,
          emotion: emotion.value,
          active: true,
        });
      },
    };

    const app = createApp(Host);
    app.provide(live2dContext, () => ({ session: 'protagonist:soyo', state: world, enabled: true }));
    app.provide(live2dPortraitCacheKey, cache);
    mountRoot(app);
    await flushUi();

    expect(runtimeMocks.createSoyoPortrait).toHaveBeenCalledTimes(1);
    const soyo = runtimeMocks.instances[0]!;
    expect(soyo.setEmotion).toHaveBeenCalledTimes(1);

    // Next dialogue line goes to Sakiko
    speaker.value = '丰川祥子';
    emotion.value = '冷静';
    await flushUi();
    expect(runtimeMocks.createSoyoPortrait).toHaveBeenCalledTimes(2);
    expect(soyo.destroy).not.toHaveBeenCalled();

    // Turning back to Soyo with unchanged emotion reuses warm instance and skips redundant motion trigger
    speaker.value = '长崎素世';
    emotion.value = '平静';
    await flushUi();
    expect(runtimeMocks.createSoyoPortrait).toHaveBeenCalledTimes(2);
    expect(soyo.destroy).not.toHaveBeenCalled();
    expect(soyo.setEmotion).toHaveBeenCalledTimes(1);
    pack.uninstall();
  });
});
