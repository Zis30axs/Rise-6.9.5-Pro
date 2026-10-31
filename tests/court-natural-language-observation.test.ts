import { describe, expect, it } from 'vitest';
import { applyStoryActions, commitStoryTurn, createInitialState, parseState, reduceState } from '../src/runtime/model';
import { enableProtagonists } from '../src/runtime/protagonist-world';
import { parseGeneratedStory } from '../src/runtime/story-protocol';
import { validateStoryActions } from '../src/runtime/story-actions';
import { getCampusInterior } from '../src/runtime/campus-interiors';
import { getLocationServiceQuote } from '../src/runtime/location-services';

const COURT_OBSERVATION = { type: 'service' as const, serviceId: 'court-observe' };
const minutesOf = (clock: { day: number; hour: number; minute: number }) =>
  (clock.day - 1) * 1440 + clock.hour * 60 + clock.minute;

function atCourthouse(hour = 10, major = true) {
  let state = createInitialState();
  state.clock = { day: 2, hour, minute: 0 };
  state = enableProtagonists(state);
  if (major) state = reduceState(state, { type: 'choose_academics', majorId: 'law' });
  return reduceState(state, { type: 'novel_travel', locationId: 'courthouse' });
}

describe('free-text timed courthouse observation', () => {
  it('parses a model tagged response for a 60-minute public observation', () => {
    const state = atCourthouse();
    const reply = parseGeneratedStory(
      '<story>她在大厅登记后走进旁听席，安静聆听了一小时的公开庭审。</story>' +
      '<phone_messages>[]</phone_messages>' +
      '<world_actions>[{"type":"service","serviceId":"court-observe","minutes":60}]</world_actions>',
      state,
    );
    expect(reply.worldActions).toEqual([{ ...COURT_OBSERVATION, minutes: 60 }]);
    const saved = commitStoryTurn(state, '我在法院大厅旁听60min', reply,
      { userId: 'court-hour-user', assistantId: 'court-hour-assistant' });
    expect(minutesOf(saved.clock) - minutesOf(state.clock)).toBe(60);
    expect(saved.courtroom?.observationKnowledge?.soyo).toBe(20);
    expect(saved.academics?.subjects.find(row => row.subjectId === 'law-advocacy')?.points).toBe(20);
    expect(saved.academics?.lastGain?.channel).toBe('court-hearing');
    expect(saved.journal.filter(row => row.text.includes('旁听公开法庭辩论质证'))).toHaveLength(2);
    expect(saved.locationId).toBe('court-hearing');
    expect(saved.interior?.roomId).toBe('court-hearing');
    expect(saved.courtroom?.active).toBeNull();
    expect(parseState(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
  });

  it('supports explicit 60-minute observation from an existing public hearing seat', () => {
    let state = atCourthouse();
    state = reduceState(state, { type: 'enter_interior', roomId: 'court-hearing' });
    const start = minutesOf(state.clock);
    state = applyStoryActions(state, [{ ...COURT_OBSERVATION, minutes: 60 }], 'court-seat-hour');
    expect(minutesOf(state.clock) - start).toBe(60);
    expect(state.courtroom?.observationKnowledge?.soyo).toBe(20);
    expect(state.interior?.roomId).toBe('court-hearing');
  });

  it('can travel to the new courthouse and observe in one model turn without a case', () => {
    let state = createInitialState();
    state.clock = { day: 2, hour: 10, minute: 0 };
    state = enableProtagonists(state);
    const begin = minutesOf(state.clock);
    const next = applyStoryActions(state, [
      { type: 'travel', locationId: 'courthouse' },
      { ...COURT_OBSERVATION, minutes: 60 },
    ], 'court-visit-and-hour');
    expect(next.locationId).toBe('court-hearing');
    expect(next.interior?.roomId).toBe('court-hearing');
    expect(minutesOf(next.clock) - begin).toBeGreaterThanOrEqual(60);
    expect(next.courtroom?.observationKnowledge?.soyo).toBe(20);
    expect(next.courtroom?.active).toBeNull();
  });

  it('accumulates independent knowledge even for an unregistered major', () => {
    const state = atCourthouse(10, false);
    const next = applyStoryActions(state, [{ ...COURT_OBSERVATION, minutes: 90 }], 'court-unassigned-hour');
    expect(next.courtroom?.observationKnowledge?.soyo).toBe(30);
    expect(next.academics).toBeNull();
    expect(minutesOf(next.clock) - minutesOf(state.clock)).toBe(90);
  });

  it('respects exactly one authored session when minutes is not present', () => {
    const state = atCourthouse();
    const next = applyStoryActions(state, [COURT_OBSERVATION], 'court-default-period');
    expect(minutesOf(next.clock) - minutesOf(state.clock)).toBe(30);
    expect(next.courtroom?.observationKnowledge?.soyo).toBe(10);
  });

  it('restricts a variable duration to the courthouse and multiples of 30', () => {
    const state = atCourthouse();
    expect(() => validateStoryActions([{ type: 'service', serviceId: 'court-observe', minutes: 45 }], state)).toThrow(/30 分钟/);
    expect(() => validateStoryActions([{ type: 'service', serviceId: 'court-observe', minutes: 0 }], state)).toThrow();
    expect(() => validateStoryActions([{ type: 'service', serviceId: 'court-observe', minutes: 270 }], state)).toThrow();
    expect(() => validateStoryActions([{ type: 'service', serviceId: 'drink-coffee', minutes: 60 }], state)).toThrow(/只有法院旁听/);
    expect(() => validateStoryActions([{ type: 'service', serviceId: 'court-observe', minutes: 60, arbitrary: true }], state)).toThrow();
  });

  it('never partially credits a requested hour if closing time interrupts it', () => {
    const state = atCourthouse(16);
    expect(getLocationServiceQuote(state, 'court-observe').blockedReason).toBeTruthy();
    const snapshot = JSON.stringify(state);
    expect(() => applyStoryActions(state, [{ ...COURT_OBSERVATION, minutes: 60 }], 'court-too-late')).toThrow();
    expect(JSON.stringify(state)).toBe(snapshot);
    expect(state.courtroom?.observationKnowledge?.soyo).toBe(0);
  });

  it('rejects a 60-minute observation if the second session exceeds remaining energy', () => {
    const state = atCourthouse();
    state.player.energy = 8;
    const snapshot = JSON.stringify(state);
    expect(() => applyStoryActions(state, [{ ...COURT_OBSERVATION, minutes: 60 }], 'court-too-tired')).toThrow(/精力/);
    expect(JSON.stringify(state)).toBe(snapshot);
    expect(state.courtroom?.observationKnowledge?.soyo).toBe(0);
  });

  it('cannot observe from an unrelated location or bypass a formal trial', () => {
    const elsewhere = createInitialState();
    expect(() => applyStoryActions(elsewhere, [{ ...COURT_OBSERVATION, minutes: 60 }], 'court-remote')).toThrow(/法庭大厅/);
    const court = atCourthouse();
    const forged = structuredClone(court);
    const room = getCampusInterior('court-hearing')!;
    expect(room.parentLocationId).toBe('courthouse');
    expect(forged.courtroom?.active).toBeNull();
    expect(() => applyStoryActions(forged, [
      { type: 'travel', locationId: 'court-hearing' },
      { ...COURT_OBSERVATION, minutes: 60 },
    ], 'court-forbidden-interior-teleport')).toThrow();
  });
});
