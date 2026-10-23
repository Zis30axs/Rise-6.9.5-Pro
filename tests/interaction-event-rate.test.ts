import { describe, expect, it } from 'vitest';
import { canCheckInteractionEvent, recordInteractionEventCheck } from '../src/runtime/interaction-event-rate';
import { createInitialState, parseState, reduceState } from '../src/runtime/model';
import { enableProtagonists } from '../src/runtime/protagonist-world';

const cafe = { type: 'travel', locationId: 'cafe' } as const;
const library = { type: 'travel', locationId: 'library' } as const;

describe('persisted interaction-event rate limit', () => {
  it('gates checks for three game hours, including misses and declined offers', () => {
    const first = recordInteractionEventCheck(createInitialState(), cafe, false);
    expect(parseState(first).interactionEventRate?.checks).toHaveLength(1);
    expect(canCheckInteractionEvent(first, library)).toBe(false);
    const early = reduceState(first, { type: 'wait', minutes: 179 });
    expect(canCheckInteractionEvent(early, library)).toBe(false);
    const ready = reduceState(first, { type: 'wait', minutes: 180 });
    expect(canCheckInteractionEvent(ready, library)).toBe(true);
  });

  it('checks a destination once per game day even after the cooldown', () => {
    const first = recordInteractionEventCheck(createInitialState(), cafe, false);
    const later = reduceState(first, { type: 'wait', minutes: 180 });
    expect(canCheckInteractionEvent(later, cafe)).toBe(false);
    expect(canCheckInteractionEvent(later, library)).toBe(true);
    expect(canCheckInteractionEvent(later, { type: 'wait', minutes: 15 })).toBe(true);
  });

  it('limits offered prompts to two per protagonist/day and resets on a new day', () => {
    const first = recordInteractionEventCheck(createInitialState(), cafe, true);
    const secondReady = reduceState(first, { type: 'wait', minutes: 180 });
    const second = recordInteractionEventCheck(secondReady, library, true);
    const later = reduceState(second, { type: 'wait', minutes: 360 });
    expect(canCheckInteractionEvent(later, { type: 'wait', minutes: 15 })).toBe(false);
    const tomorrow = reduceState(later, { type: 'wait', minutes: 1440 });
    expect(canCheckInteractionEvent(tomorrow, cafe)).toBe(true);
  });

  it('uses each protagonist identity separately without letting reloads erase history', () => {
    const initial = enableProtagonists(createInitialState());
    const soyo = parseState(recordInteractionEventCheck(initial, cafe, true));
    expect(canCheckInteractionEvent(soyo, library)).toBe(false);
    const sakiko = reduceState(soyo, { type: 'switch_protagonist', target: 'sakiko' });
    expect(canCheckInteractionEvent(sakiko, library)).toBe(true);
    const saved = parseState(recordInteractionEventCheck(sakiko, library, true));
    const restored = reduceState(saved, { type: 'switch_protagonist', target: 'soyo' });
    expect(canCheckInteractionEvent(restored, library)).toBe(false);
    expect(saved.interactionEventRate?.checks.map(item => item.owner)).toEqual(['soyo', 'sakiko']);
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
