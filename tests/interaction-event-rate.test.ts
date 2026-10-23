import { describe, expect, it } from 'vitest';
import { canCheckInteractionEvent, recordInteractionEventCheck } from '../src/runtime/interaction-event-rate';
import { createInitialState, parseState, reduceState } from '../src/runtime/model';
import { enableProtagonists } from '../src/runtime/protagonist-world';
import type { WorldState } from '../src/frontend/types';

const cafe = { type: 'travel', locationId: 'cafe' } as const;
const library = { type: 'travel', locationId: 'library' } as const;

/** Advance through legal player waits without changing the runtime's 120-minute cap. */
function waitMinutes(state: WorldState, minutes: number): WorldState {
  let next = state;
  for (let remaining = minutes; remaining > 0; remaining -= 120) {
    next = reduceState(next, { type: 'wait', minutes: Math.min(remaining, 120) });
  }
  return next;
}

describe('persisted interaction-event rate limit', () => {
  it('gates checks for three game hours, including misses and declined offers', () => {
    const first = recordInteractionEventCheck(createInitialState(), cafe, false);
    expect(parseState(first).interactionEventRate?.checks).toHaveLength(1);
    expect(canCheckInteractionEvent(first, library)).toBe(false);
    const early = waitMinutes(first, 179);
    expect(canCheckInteractionEvent(early, library)).toBe(false);
    const ready = waitMinutes(first, 180);
    expect(canCheckInteractionEvent(ready, library)).toBe(true);
  });

  it('checks a destination once per game day even after the cooldown', () => {
    const first = recordInteractionEventCheck(createInitialState(), cafe, false);
    const later = waitMinutes(first, 180);
    expect(canCheckInteractionEvent(later, cafe)).toBe(false);
    expect(canCheckInteractionEvent(later, library)).toBe(true);
    expect(canCheckInteractionEvent(later, { type: 'wait', minutes: 15 })).toBe(true);
  });

  it('limits offered prompts to two per protagonist/day and resets on a new day', () => {
    const first = recordInteractionEventCheck(createInitialState(), cafe, true);
    const secondReady = waitMinutes(first, 180);
    const second = recordInteractionEventCheck(secondReady, library, true);
    const later = waitMinutes(second, 180);
    expect(canCheckInteractionEvent(later, { type: 'wait', minutes: 15 })).toBe(false);
    const tomorrow = waitMinutes(later, 1440);
    expect(canCheckInteractionEvent(tomorrow, cafe)).toBe(true);
  });

  it('keeps the full three-hour cooldown across midnight after a save round trip', () => {
    const late = waitMinutes(createInitialState(), 340);
    expect(late.clock).toEqual({ day: 1, hour: 23, minute: 0 });
    const first = parseState(recordInteractionEventCheck(late, cafe, true));
    const midnight = parseState(waitMinutes(first, 60));
    expect(midnight.clock).toEqual({ day: 2, hour: 0, minute: 0 });
    expect(canCheckInteractionEvent(midnight, cafe)).toBe(false);
    expect(canCheckInteractionEvent(waitMinutes(first, 179), cafe)).toBe(false);
    expect(canCheckInteractionEvent(parseState(waitMinutes(first, 180)), cafe)).toBe(true);
  });

  it('uses each protagonist identity separately without letting reloads erase history', () => {
    const initial = enableProtagonists(createInitialState());
    const soyo = parseState(recordInteractionEventCheck(initial, cafe, true));
    expect(canCheckInteractionEvent(soyo, library)).toBe(false);
    const sakiko = reduceState(soyo, { type: 'switch_protagonist', target: 'sakiko' });
    expect(canCheckInteractionEvent(sakiko, library)).toBe(true);
    const sakikoSaved = parseState(recordInteractionEventCheck(sakiko, library, true));
    const emma = reduceState(sakikoSaved, { type: 'switch_protagonist', target: 'emma' });
    expect(canCheckInteractionEvent(emma, cafe)).toBe(true);
    const saved = parseState(recordInteractionEventCheck(emma, cafe, true));
    const restored = reduceState(saved, { type: 'switch_protagonist', target: 'soyo' });
    expect(canCheckInteractionEvent(restored, library)).toBe(false);
    const sakikoRestored = reduceState(parseState(restored), { type: 'switch_protagonist', target: 'sakiko' });
    expect(canCheckInteractionEvent(sakikoRestored, cafe)).toBe(false);
    const emmaRestored = reduceState(parseState(sakikoRestored), { type: 'switch_protagonist', target: 'emma' });
    expect(canCheckInteractionEvent(emmaRestored, library)).toBe(false);
    expect(saved.interactionEventRate?.checks.map(item => item.owner)).toEqual(['soyo', 'sakiko', 'emma']);
    expect(emmaRestored.interactionEventRate).toEqual(saved.interactionEventRate);
  });

  it('rejects malformed or future-dated limiter records, while old saves remain valid', () => {
    expect(parseState(createInitialState()).interactionEventRate).toBeUndefined();
    const first = recordInteractionEventCheck(createInitialState(), cafe, true);
    const invalid = structuredClone(first);
    invalid.interactionEventRate!.checks[0]!.at += 1000;
    expect(() => parseState(invalid)).toThrow('interactionEventRate');
    const extra = structuredClone(first);
    (extra.interactionEventRate!.checks[0] as unknown as Record<string, unknown>).unknown = true;
    expect(() => parseState(extra)).toThrow('interactionEventRate');
  });
});
