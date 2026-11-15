// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, reactive, type App as VueApp } from 'vue';
import DebugPanel from '../src/frontend/DebugPanel.vue';
import type { ShellActions, ShellModel } from '../src/frontend/types';
import { createInitialState, parseState, reduceState } from '../src/runtime/model';
import { appiePayBalance } from '../src/runtime/dual-protagonists';
import { enableProtagonists } from '../src/runtime/protagonist-world';

const apps: VueApp[] = [];

afterEach(() => {
  apps.splice(0).forEach(app => app.unmount());
  document.body.replaceChildren();
});

describe('debug_update runtime & DebugPanel UI', () => {
  it('updates player stats and syncs Appie Pay ledger on credit and debit', () => {
    const start = enableProtagonists(createInitialState());
    const credited = reduceState(start, {
      type: 'debug_update',
      player: { balance: 8_888_888, energy: 95, health: 90, morale: 85, stress: 5, satiety: 92, foodEnergy: 2100 },
    });
    expect(credited.player.balance).toBe(8_888_888);
    expect(credited.player.energy).toBe(95);
    expect(credited.player.stress).toBe(5);
    expect(credited.player.foodEnergy).toBe(2100);
    expect(appiePayBalance(credited.protagonists!.accounts, 'soyo')).toBe(888_888_800);

    const debited = reduceState(credited, {
      type: 'debug_update',
      player: { balance: 12_345.67 },
    });
    expect(debited.player.balance).toBe(12_345.67);
    expect(appiePayBalance(debited.protagonists!.accounts, 'soyo')).toBe(1_234_567);
    expect(() => parseState(debited)).not.toThrow();
  });

  it('adjusts game clock forward, across weeks, and backward cleanly', () => {
    const start = enableProtagonists(createInitialState());
    const advanced = reduceState(start, {
      type: 'debug_update',
      clock: { day: 3, hour: 14, minute: 45 },
    });
    expect(advanced.clock).toEqual({ day: 3, hour: 14, minute: 45 });

    const jumped = reduceState(advanced, {
      type: 'debug_update',
      clock: { day: 20, hour: 9, minute: 15 },
    });
    expect(jumped.clock).toEqual({ day: 20, hour: 9, minute: 15 });

    const rewound = reduceState(jumped, {
      type: 'debug_update',
      clock: { day: 1, hour: 8, minute: 0 },
    });
    expect(rewound.clock).toEqual({ day: 1, hour: 8, minute: 0 });
    expect(() => parseState(rewound)).not.toThrow();
  });

  it('teleports across Tokyo outdoors, interiors, Beijing, and California cleanly', () => {
    const start = enableProtagonists(createInitialState());
    const indoor = reduceState(start, { type: 'debug_update', locationId: 'dorm-room' });
    expect(indoor.locationId).toBe('dorm-room');
    expect(indoor.interior?.roomId).toBe('dorm-room');

    const tokyoOut = reduceState(indoor, { type: 'debug_update', locationId: 'circle' });
    expect(tokyoOut.locationId).toBe('circle');
    expect(tokyoOut.interior).toBeNull();

    const haneda = reduceState(tokyoOut, { type: 'debug_update', locationId: 'haneda-airport' });
    expect(haneda.locationId).toBe('haneda-airport');
    expect(haneda.interior).toBeNull();

    const beijing = reduceState(haneda, { type: 'debug_update', locationId: 'beijing-qianmen' });
    expect(beijing.locationId).toBe('beijing-qianmen');
    expect(beijing.interior).toBeNull();
    expect(beijing.scene).toBeNull();

    const california = reduceState(beijing, { type: 'debug_update', locationId: 'california-los-angeles' });
    expect(california.locationId).toBe('california-los-angeles');
    expect(california.interior).toBeNull();
    expect(california.scene).toBeNull();
    expect(() => parseState(california)).not.toThrow();
  });

  it('updates schedule and protagonist phone calendar via debug_update', () => {
    const start = enableProtagonists(createInitialState());
    const updated = reduceState(start, {
      type: 'debug_update',
      schedule: [
        { id: 'dbg-1', title: '调试彩排', locationId: 'circle', time: '18:30', done: false },
      ],
      calendar: {
        protagonistId: 'soyo',
        events: [
          { id: 'cal-dbg-1', title: '音乐室集合', locationId: 'gate', start: 600, duration: 90, reminded: true },
        ],
      },
    });
    expect(updated.schedule).toEqual([
      { id: 'dbg-1', title: '调试彩排', locationId: 'circle', time: '18:30', done: false },
    ]);
    expect(updated.protagonists!.devices.soyo.calendar).toEqual([
      { id: 'cal-dbg-1', title: '音乐室集合', locationId: 'gate', start: 600, duration: 90, reminded: true },
    ]);
    expect(() => parseState(updated)).not.toThrow();
  });

  it('allows interactive editing of stats, country teleport with map open, and schedules in DebugPanel.vue', async () => {
    const model = reactive<ShellModel>({
      state: enableProtagonists(createInitialState()),
      mode: 'demo',
      busy: false,
      notice: '',
      connection: 'test',
      externalPhoneOpen: false,
      phoneStatus: 'idle',
      phoneError: '',
      phoneSource: 'none',
      phoneLinkStatus: 'idle',
      phoneLinkError: '',
      externalPhoneAvailable: false,
      phoneUnread: 0,
      phoneContactUnread: [],
    });
    const openMapSpy = vi.fn();
    const actions: ShellActions = {
      dispatch(action) {
        model.state = reduceState(model.state, action);
        model.notice = '';
      },
      send: async () => {},
      exit: () => {},
      switchChat: () => {},
      openPhone: () => {},
      closePhone: () => {},
      openPhoneContact: async () => {},
      retryPhoneSync: () => {},
    };

    const root = document.createElement('div');
    document.body.append(root);
    const app = createApp({
      render: () => h(DebugPanel, { model, actions, onOpenMap: openMapSpy }),
    });
    apps.push(app);
    app.mount(root);
    await nextTick();

    // 1. Preset 10M balance
    root.querySelector<HTMLButtonElement>('[data-debug-preset="funds-10m"]')?.click();
    await nextTick();
    expect(model.state.player.balance).toBe(10_000_000);

    // 2. Schedule & calendar tab
    root.querySelector<HTMLButtonElement>('[data-debug-tab="schedule"]')?.click();
    await nextTick();
    const schTitleInput = root.querySelector<HTMLInputElement>('[data-debug-new-schedule="title"]')!;
    schTitleInput.value = '去加州看海';
    schTitleInput.dispatchEvent(new Event('input'));
    root.querySelector<HTMLButtonElement>('[data-debug-add-schedule]')?.click();
    await nextTick();
    root.querySelector<HTMLButtonElement>('[data-debug-save-schedule]')?.click();
    await nextTick();
    expect(model.state.schedule.some(row => row.title === '去加州看海')).toBe(true);

    // 3. Teleport to Beijing, California, and Tokyo & open sandbox
    root.querySelector<HTMLButtonElement>('[data-debug-tab="world"]')?.click();
    await nextTick();
    root.querySelector<HTMLButtonElement>('[data-debug-sandbox="beijing-qianmen"]')?.click();
    await nextTick();
    expect(model.state.locationId).toBe('beijing-qianmen');
    expect(openMapSpy).toHaveBeenCalledTimes(1);

    root.querySelector<HTMLButtonElement>('[data-debug-sandbox="california-los-angeles"]')?.click();
    await nextTick();
    expect(model.state.locationId).toBe('california-los-angeles');
    expect(openMapSpy).toHaveBeenCalledTimes(2);

    root.querySelector<HTMLButtonElement>('[data-debug-sandbox="haneda-airport"]')?.click();
    await nextTick();
    expect(model.state.locationId).toBe('haneda-airport');
    expect(openMapSpy).toHaveBeenCalledTimes(3);

    // Every quick sandbox preset button resolves to a valid state without throwing
    const presetButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-debug-sandbox]')];
    expect(presetButtons.length).toBeGreaterThanOrEqual(10);
    for (const btn of presetButtons) {
      const targetId = btn.dataset.debugSandbox!;
      btn.click();
      await nextTick();
      expect(model.state.locationId).toBe(targetId);
    }
  });
});
