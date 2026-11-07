import { describe, expect, it } from 'vitest';
import { gameDayFromISO } from '../src/runtime/game-calendar';
import { acknowledgeWorldChronicle, pendingWorldChronicle } from '../src/runtime/world-chronicle';
import { commitStoryTurn, createInitialState, parseState } from '../src/runtime/model';
import { enableProtagonists } from '../src/runtime/protagonist-world';
import type { WorldState } from '../src/frontend/types';

function at(iso: string, hour = 0, minute = 0, handledThroughMinute = -1): WorldState {
  return {
    ...createInitialState(),
    clock: { day: gameDayFromISO(iso), hour, minute },
    worldChronicle: { handledThroughMinute },
  };
}
function minuteAt(iso: string, hour = 0, minute = 0): number {
  return (gameDayFromISO(iso) - 1) * 1440 + hour * 60 + minute;
}

describe('GMT+8 real-world chronicle', () => {
  it('makes an astronomical event available at its verified start, not before', () => {
    const through = minuteAt('2025-09-07', 23, 59);
    expect(pendingWorldChronicle(at('2025-09-08', 1, 29, through))).toBeNull();
    const during = pendingWorldChronicle(at('2025-09-08', 1, 30, through));
    expect(during?.receipt.eventIds).toContain('real-20250908-003');
    expect(during?.events.find(e => e.id === 'real-20250908-003')?.phase).toBe('ongoing');
    const completed = pendingWorldChronicle(at('2025-09-08', 2, 53, through));
    expect(completed?.events.find(e => e.id === 'real-20250908-003')?.phase).toBe('occurred');
  });

  it('conservatively delays provisional day-only events without treating 00:00 as publication', () => {
    const through = minuteAt('2025-09-02', 23, 59);
    expect(pendingWorldChronicle(at('2025-09-04', 23, 59, through))).toBeNull();
    const delivered = pendingWorldChronicle(at('2025-09-05', 0, 0, through));
    expect(delivered?.receipt.eventIds).toContain('real-20250903-001');
  });

  it('does not announce the World Cup winner at kickoff, using a result-safe gate', () => {
    const through = minuteAt('2026-07-19', 23, 59);
    expect(pendingWorldChronicle(at('2026-07-20', 3, 0, through))).toBeNull();
    expect(pendingWorldChronicle(at('2026-07-20', 6, 0, through))).toBeNull();
    expect(pendingWorldChronicle(at('2026-07-21', 0, 0, through))?.receipt.eventIds)
      .toContain('real-20260719-042');
  });

  it('only acknowledges the actually injected set, once, after success', () => {
    const world = at('2025-09-08', 3, 0, minuteAt('2025-09-07', 23, 59));
    const offered = pendingWorldChronicle(world)!;
    const committed = acknowledgeWorldChronicle(world, world, offered.receipt);
    expect(committed.worldChronicle?.handledThroughMinute).toBe(offered.receipt.throughMinute);
    expect(pendingWorldChronicle(committed)).toBeNull();
    expect(() => acknowledgeWorldChronicle(world, world, {
      ...offered.receipt, eventIds: ['real-20301231-fabricated'],
    })).toThrow(/回执/);
    // A canceled or failed request does not change the original state.
    expect(pendingWorldChronicle(world)?.receipt.eventIds).toEqual(offered.receipt.eventIds);
  });

  it('validates bridge-only metadata outside the strict LLM response parser', () => {
    const initial = at('2025-09-08', 3, 0, minuteAt('2025-09-07', 23, 59));
    const injected = pendingWorldChronicle(initial)!;
    // This is a real novel submission: the model itself produces no receipt.
    const turn = commitStoryTurn(initial, '看一下刚刚的新闻。', {
      text: '窗边的手机屏幕显示了刚结束的月食新闻。',
      phoneMessages: [],
      worldChronicleReceipt: injected.receipt,
    }, { userId: 'history:user:1', assistantId: 'history:assistant:1' });
    expect(turn.worldChronicle?.handledThroughMinute).toBe(injected.receipt.throughMinute);
    expect(pendingWorldChronicle(turn)).toBeNull();

    // The entire validated turn is atomic: tampered receipts reject the turn.
    expect(() => commitStoryTurn(initial, '看一下刚刚的新闻。', {
      text: '窗边的手机屏幕显示了刚结束的月食新闻。',
      phoneMessages: [],
      worldChronicleReceipt: { ...injected.receipt, eventIds: [] },
    }, { userId: 'history:user:2', assistantId: 'history:assistant:2' })).toThrow(/回执/);
  });

  it('keeps the timeline shared, optional and compatible with historical saves', () => {
    const legacy = createInitialState();
    expect(parseState(legacy).worldChronicle).toBeUndefined();
    const enabled = enableProtagonists(legacy);
    const parsed = parseState({ ...enabled, worldChronicle: { handledThroughMinute: 125 } });
    expect(parsed.worldChronicle?.handledThroughMinute).toBe(125);
    expect(parsed.protagonists?.accounts.active).toBe(enabled.protagonists?.accounts.active);
    expect(() => parseState({ ...enabled, worldChronicle: { handledThroughMinute: 1.5 } })).toThrow();
  });

  it('bounds catch-up: no months-old breaking news when skipping ahead years', () => {
    expect(pendingWorldChronicle(at('2029-05-01'))).toBeNull();
    const recent = pendingWorldChronicle(at('2026-10-31'))!;
    expect(recent.events.length).toBeLessThanOrEqual(4);
    expect(recent.events.every(event => event.availableAtGMT8.endsWith('GMT+8'))).toBe(true);
    expect(new Set(recent.receipt.eventIds).size).toBe(recent.receipt.eventIds.length);
  });
});
