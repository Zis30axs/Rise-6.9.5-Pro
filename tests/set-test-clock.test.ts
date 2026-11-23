import { expect, it } from 'vitest';
import { createInitialState, parseState } from '../src/runtime/model';
import { enableProtagonists } from '../src/runtime/protagonist-world';
import { setTestClock } from './helpers/set-test-clock';

it('preserves a scheduled NPC decision across repeated or earlier fixture times and a save round trip', () => {
  const state = enableProtagonists(createInitialState());
  const life = state.protagonists!.backgroundLife!;
  const nine = { day: 2, hour: 9, minute: 0 };
  const atNine = 1440 + 9 * 60;
  life.people.sakiko.nextDecisionAt = atNine + 30;

  setTestClock(state, nine);
  expect(life.people.sakiko.nextDecisionAt).toBe(atNine + 30);
  expect(life.people.soyo.nextDecisionAt).toBe(atNine);
  const snapshot = structuredClone(state);
  setTestClock(state, nine);
  expect(state).toEqual(snapshot);

  setTestClock(state, { ...nine, hour: 8 });
  expect(life.cursor).toBe(atNine - 60);
  expect(state.protagonists!.strategy!.cursor).toBe(life.cursor);
  expect(life.people).toEqual(snapshot.protagonists!.backgroundLife!.people);
  const restored = parseState(JSON.parse(JSON.stringify(state)));
  expect(restored.clock).toEqual(state.clock);
  expect(restored.protagonists!.backgroundLife).toEqual(life);
  expect(restored.protagonists!.strategy).toEqual(state.protagonists!.strategy);
});
