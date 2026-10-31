import { describe, expect, it } from 'vitest';
import { applyStoryActions, commitStoryTurn, createInitialState, parseState, reduceState } from '../src/runtime/model';
import { enableProtagonists } from '../src/runtime/protagonist-world';
import { parseGeneratedStory } from '../src/runtime/story-protocol';
import { validateStoryActions } from '../src/runtime/story-actions';
import { getCampusInterior } from '../src/runtime/campus-interiors';
import { getLocationServiceQuote, getLocationStatus, courtObservationServiceForMinutes } from '../src/runtime/location-services';

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
      '<world_actions>[{"type":"service","serviceId":"court-observe","minutes":60,"knowledgeGain":13}]</world_actions>',
      state,
    );
    expect(reply.worldActions).toEqual([{ ...COURT_OBSERVATION, minutes: 60, knowledgeGain: 13 }]);
    const saved = commitStoryTurn(state, '我在法院大厅旁听60min', reply,
      { userId: 'court-hour-user', assistantId: 'court-hour-assistant' });
    expect(minutesOf(saved.clock) - minutesOf(state.clock)).toBe(60);
    expect(saved.courtroom?.observationKnowledge?.soyo).toBe(13);
    expect(saved.academics?.subjects.find(row => row.subjectId === 'law-advocacy')?.points).toBe(13);
    expect(saved.academics?.lastGain?.channel).toBe('court-hearing');
    expect(saved.journal.filter(row => row.text.includes('旁听公开法庭辩论质证'))).toHaveLength(1);
    expect(saved.locationId).toBe('court-hearing');
    expect(saved.interior?.roomId).toBe('court-hearing');
    expect(saved.courtroom?.active).toBeNull();
    expect(parseState(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
  });

  it('supports explicit 60-minute observation from an existing public hearing seat', () => {
    let state = atCourthouse();
    state = reduceState(state, { type: 'enter_interior', roomId: 'court-hearing' });
    const start = minutesOf(state.clock);
    state = applyStoryActions(state, [{ ...COURT_OBSERVATION, minutes: 60, knowledgeGain: 17 }], 'court-seat-hour');
    expect(minutesOf(state.clock) - start).toBe(60);
    expect(state.courtroom?.observationKnowledge?.soyo).toBe(17);
    expect(state.interior?.roomId).toBe('court-hearing');
  });

  it('settles 45 minutes in one operation with independently authored 11 knowledge points', () => {
    let state = atCourthouse();
    state = reduceState(state, { type: 'enter_interior', roomId: 'court-hearing' });
    const quote = getLocationServiceQuote(state, 'court-observe', undefined, 45);
    expect(quote.blockedReason).toBeNull();
    expect(quote.service?.effects.energy).toBe(-8);
    expect(quote.service?.effects.morale).toBe(27);
    expect(quote.service?.effects.stress).toBe(-18);
    const beforeEnergy = state.player.energy;
    const next = applyStoryActions(state, [{ ...COURT_OBSERVATION, minutes: 45, knowledgeGain: 11 }], 'court-forty-five');
    expect(minutesOf(next.clock) - minutesOf(state.clock)).toBe(45);
    expect(next.player.energy - beforeEnergy).toBe(-8);
    expect(next.courtroom?.observationKnowledge?.soyo).toBe(11);
    expect(next.academics?.subjects.find(row => row.subjectId === 'law-advocacy')?.points).toBe(11);
    expect(next.academics?.lastGain).toMatchObject({ channel: 'court-hearing', minutes: 45, points: 11 });
    expect(next.journal.filter(row => row.text.includes('旁听公开法庭辩论质证'))).toHaveLength(1);
    expect(parseState(JSON.parse(JSON.stringify(next)))).toEqual(next);
  });

  it('accepts 67 minutes with zero knowledge on an unsuccessful learning attempt', () => {
    const state = atCourthouse();
    const next = applyStoryActions(state, [{ ...COURT_OBSERVATION, minutes: 67, knowledgeGain: 0 }], 'court-unproductive');
    expect(minutesOf(next.clock) - minutesOf(state.clock)).toBe(67);
    expect(next.courtroom?.observationKnowledge?.soyo).toBe(0);
    expect(next.academics?.lastGain).toBeNull();
    expect(parseState(JSON.parse(JSON.stringify(next)))).toEqual(next);
  });

  it('keeps the existing 30-minute UI service independent of the LLM grant', () => {
    let state = atCourthouse();
    state = reduceState(state, { type: 'enter_interior', roomId: 'court-hearing' });
    const next = reduceState(state, { type: 'location_service', serviceId: 'court-observe' });
    expect(minutesOf(next.clock) - minutesOf(state.clock)).toBe(30);
    expect(next.courtroom?.observationKnowledge?.soyo).toBe(10);
    expect(courtObservationServiceForMinutes(30).minutes).toBe(30);
  });

  it('can travel to the new courthouse and observe in one model turn without a case', () => {
    let state = createInitialState();
    state.clock = { day: 2, hour: 10, minute: 0 };
    state = enableProtagonists(state);
    const begin = minutesOf(state.clock);
    const next = applyStoryActions(state, [
      { type: 'travel', locationId: 'courthouse' },
      { ...COURT_OBSERVATION, minutes: 60, knowledgeGain: 9 },
    ], 'court-visit-and-hour');
    expect(next.locationId).toBe('court-hearing');
    expect(next.interior?.roomId).toBe('court-hearing');
    expect(minutesOf(next.clock) - begin).toBeGreaterThanOrEqual(60);
    expect(next.courtroom?.observationKnowledge?.soyo).toBe(9);
    expect(next.courtroom?.active).toBeNull();
  });

  it('accumulates independent knowledge even for an unregistered major', () => {
    const state = atCourthouse(10, false);
    const next = applyStoryActions(state, [{ ...COURT_OBSERVATION, minutes: 67, knowledgeGain: 4 }], 'court-unassigned-hour');
    expect(next.courtroom?.observationKnowledge?.soyo).toBe(4);
    expect(next.academics).toBeNull();
    expect(minutesOf(next.clock) - minutesOf(state.clock)).toBe(67);
  });

  it('respects exactly one authored session when minutes is not present', () => {
    const state = atCourthouse();
    const next = applyStoryActions(state, [COURT_OBSERVATION], 'court-default-period');
    expect(minutesOf(next.clock) - minutesOf(state.clock)).toBe(30);
    expect(next.courtroom?.observationKnowledge?.soyo).toBe(10);
  });

  it('accepts any integer minute and LLM-chosen knowledge while rejecting forged amounts', () => {
    const state = atCourthouse();
    expect(validateStoryActions([{ ...COURT_OBSERVATION, minutes: 45, knowledgeGain: 11 }], state))
      .toEqual([{ ...COURT_OBSERVATION, minutes: 45, knowledgeGain: 11 }]);
    expect(validateStoryActions([{ ...COURT_OBSERVATION, minutes: 67, knowledgeGain: 4 }], state))
      .toEqual([{ ...COURT_OBSERVATION, minutes: 67, knowledgeGain: 4 }]);
    expect(() => validateStoryActions([{ ...COURT_OBSERVATION, minutes: 45 }], state)).toThrow(/必须同时/);
    expect(() => validateStoryActions([{ ...COURT_OBSERVATION, knowledgeGain: 11 }], state)).toThrow(/必须同时/);
    expect(() => validateStoryActions([{ ...COURT_OBSERVATION, minutes: 0, knowledgeGain: 0 }], state)).toThrow();
    expect(() => validateStoryActions([{ ...COURT_OBSERVATION, minutes: 481, knowledgeGain: 1 }], state)).toThrow();
    expect(() => validateStoryActions([{ ...COURT_OBSERVATION, minutes: 45, knowledgeGain: 46 }], state)).toThrow();
    expect(() => validateStoryActions([{ ...COURT_OBSERVATION, minutes: 45, knowledgeGain: 0.5 }], state)).toThrow();
    expect(() => validateStoryActions([{ type: 'service', serviceId: 'drink-coffee', minutes: 60, knowledgeGain: 1 }], state)).toThrow(/只有法院旁听/);
    expect(() => validateStoryActions([{ ...COURT_OBSERVATION, minutes: 60, knowledgeGain: 8, arbitrary: true }], state)).toThrow();
  });

  it('rejects duplicate court blocks and conflicting timed actions in one response', () => {
    const state = atCourthouse();
    expect(() => validateStoryActions([
      { ...COURT_OBSERVATION, minutes: 60, knowledgeGain: 7 },
      { ...COURT_OBSERVATION, minutes: 30, knowledgeGain: 4 },
    ], state)).toThrow(/只能提交一次/);
    expect(() => validateStoryActions([
      { ...COURT_OBSERVATION, minutes: 60, knowledgeGain: 7 },
      { type: 'rest', kind: 'wait', minutes: 60 },
    ], state)).toThrow(/重复计算/);
    expect(() => validateStoryActions([
      { ...COURT_OBSERVATION, minutes: 60, knowledgeGain: 7 },
      { type: 'study', subjectId: 'law-advocacy', minutes: 60 },
    ], state)).toThrow(/重复计算/);
  });

  it('allows exact closing time, but cannot partially credit one minute beyond it', () => {
    const exterior = atCourthouse(16);
    const state = reduceState(exterior, { type: 'enter_interior', roomId: 'court-hearing' });
    const remaining = getLocationStatus('court-hearing', state.clock)!.minutesUntilClose!;
    expect(remaining).toBeGreaterThan(0);
    const exact = { ...COURT_OBSERVATION, minutes: remaining, knowledgeGain: 1 };
    const onTime = applyStoryActions(state, [exact], 'court-exact-closing-time');
    expect(minutesOf(onTime.clock) - minutesOf(state.clock)).toBe(remaining);
    const snapshot = JSON.stringify(state);
    const overTime = { ...COURT_OBSERVATION, minutes: remaining + 1, knowledgeGain: 1 };
    expect(getLocationServiceQuote(state, 'court-observe', undefined, remaining + 1).blockedReason).toMatch(/打烊/);
    expect(() => applyStoryActions(state, [overTime], 'court-too-late')).toThrow();
    expect(JSON.stringify(state)).toBe(snapshot);
    expect(state.courtroom?.observationKnowledge?.soyo).toBe(0);
  });

  it('rejects a 60-minute observation if the second session exceeds remaining energy', () => {
    const state = atCourthouse();
    state.player.energy = 8;
    const snapshot = JSON.stringify(state);
    expect(() => applyStoryActions(state, [{ ...COURT_OBSERVATION, minutes: 60, knowledgeGain: 7 }], 'court-too-tired')).toThrow(/精力/);
    expect(JSON.stringify(state)).toBe(snapshot);
    expect(state.courtroom?.observationKnowledge?.soyo).toBe(0);
  });

  it('cannot observe from an unrelated location or bypass a formal trial', () => {
    const elsewhere = createInitialState();
    expect(() => applyStoryActions(elsewhere, [{ ...COURT_OBSERVATION, minutes: 60, knowledgeGain: 7 }], 'court-remote')).toThrow(/法庭大厅/);
    const court = atCourthouse();
    const forged = structuredClone(court);
    const room = getCampusInterior('court-hearing')!;
    expect(room.parentLocationId).toBe('courthouse');
    expect(forged.courtroom?.active).toBeNull();
    expect(() => applyStoryActions(forged, [
      { type: 'travel', locationId: 'court-hearing' },
      { ...COURT_OBSERVATION, minutes: 60, knowledgeGain: 7 },
    ], 'court-forbidden-interior-teleport')).toThrow();
  });
});
