import { describe, expect, it } from 'vitest';
import { createInitialState, parseState, reduceState } from '../src/runtime/model';
import { activeProtagonist, enableProtagonists, personState } from '../src/runtime/protagonist-world';
import type { AcademicState } from '../src/frontend/types';
import type { ProtagonistId } from '../src/runtime/dual-protagonists';

const owners = ['soyo', 'sakiko', 'emma', 'renako'] as const;
const assignments = {
  soyo: 'computer-science',
  sakiko: 'music',
  emma: 'psychology',
  renako: 'design',
} as const;
const fresh = () => enableProtagonists(createInitialState());
const roundTrip = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

function progressWithLastGain(base: AcademicState): AcademicState {
  const academics = structuredClone(base);
  const subject = academics.subjects[0]!;
  subject.points = 30;
  academics.lastGain = {
    subjectId: subject.subjectId, minutes: 30, points: 30, totalPoints: 30,
    at: '第 1 天 17:20', outcome: null, channel: null,
    interactionId: null, energyConsumed: null, moraleChange: null, stressChange: null,
  };
  return academics;
}

describe('per-protagonist academic majors', () => {
  it('does not seed the current major into other protagonists when enabling viewpoints', () => {
    const soyoOnly = reduceState(createInitialState(), { type: 'choose_academics', majorId: 'computer-science' });
    const state = parseState(enableProtagonists(soyoOnly));
    expect(state.academics?.majorId).toBe('computer-science');
    for (const owner of owners.filter(id => id !== 'soyo')) {
      expect(personState(state, owner).academics).toBeNull();
    }
    expect(parseState(roundTrip(state))).toEqual(state);
  });

  it('keeps unchosen majors null across switches rather than copying the previously active major', () => {
    let state = reduceState(fresh(), { type: 'choose_academics', majorId: 'computer-science' });
    for (const target of ['sakiko', 'emma', 'renako'] as const) {
      state = reduceState(state, { type: 'switch_protagonist', target });
      expect(activeProtagonist(state)).toBe(target);
      expect(state.academics).toBeNull();
      state = parseState(roundTrip(state));
      expect(state.academics).toBeNull();
    }
    state = reduceState(state, { type: 'switch_protagonist', target: 'soyo' });
    expect(state.academics?.majorId).toBe('computer-science');
  });

  it('saves independent majors for all four viewpoints across switches and JSON reloads', () => {
    let state = fresh();
    for (const target of owners) {
      if (activeProtagonist(state) !== target) state = reduceState(state, { type: 'switch_protagonist', target });
      expect(state.academics).toBeNull();
      state = reduceState(state, { type: 'choose_academics', majorId: assignments[target] });
      expect(state.academics?.majorId).toBe(assignments[target]);
      state = parseState(roundTrip(state));
    }
    for (const target of [...owners, ...owners].reverse()) {
      state = reduceState(state, { type: 'switch_protagonist', target });
      expect(state.academics?.majorId).toBe(assignments[target]);
      for (const owner of owners) expect(personState(state, owner).academics?.majorId).toBe(assignments[owner]);
      state = parseState(roundTrip(state));
    }
  });

  it('leaves a previously contaminated save unchanged until the affected character explicitly corrects it', () => {
    let state = reduceState(fresh(), { type: 'choose_academics', majorId: 'computer-science' });
    const oldMajor = progressWithLastGain(state.academics!);
    state.academics = structuredClone(oldMajor);
    for (const owner of owners.filter(id => id !== 'soyo')) personState(state, owner).academics = structuredClone(oldMajor);
    state = parseState(roundTrip(state));
    expect(owners.map(owner => personState(state, owner).academics?.majorId)).toEqual(owners.map(() => 'computer-science'));

    state = reduceState(state, { type: 'switch_protagonist', target: 'emma' });
    state = reduceState(state, { type: 'correct_academics', majorId: 'music', keepProgress: true });
    expect(state.academics?.majorId).toBe('music');
    expect(state.academics?.correction).toEqual({ previousMajorId: 'computer-science', keepProgress: true });
    expect(state.academics?.lastGain).toBeNull();
    expect(state.academics?.subjects.filter(s => s.points > 0)).toEqual([{ subjectId: oldMajor.subjects[0]!.subjectId, points: 30 }]);
    expect(state.academics?.subjects).toHaveLength(4);
    for (const owner of ['soyo', 'sakiko', 'renako'] as const) {
      expect(personState(state, owner).academics).toEqual(oldMajor);
    }
    state = parseState(roundTrip(state));
    state = reduceState(state, { type: 'switch_protagonist', target: 'soyo' });
    expect(state.academics).toEqual(oldMajor);
    state = reduceState(state, { type: 'switch_protagonist', target: 'emma' });
    expect(state.academics?.majorId).toBe('music');
    expect(state.academics?.subjects.find(item => item.subjectId === oldMajor.subjects[0]!.subjectId)?.points).toBe(30);
  });

  it('can explicitly clear an affected character while preserving the other three', () => {
    let state = reduceState(fresh(), { type: 'choose_academics', majorId: 'computer-science' });
    const oldMajor = progressWithLastGain(state.academics!);
    state.academics = structuredClone(oldMajor);
    personState(state, 'sakiko').academics = structuredClone(oldMajor);
    state = parseState(roundTrip(state));
    state = reduceState(state, { type: 'switch_protagonist', target: 'sakiko' });
    state = reduceState(state, { type: 'correct_academics', majorId: 'psychology', keepProgress: false });
    expect(state.academics?.majorId).toBe('psychology');
    expect(state.academics?.subjects.every(item => item.points === 0)).toBe(true);
    expect(state.academics?.lastGain).toBeNull();
    expect(personState(state, 'soyo').academics).toEqual(oldMajor);
    expect(parseState(roundTrip(state))).toEqual(state);
  });

  it('rejects invalid corrections and refuses to reset an unassigned major', () => {
    const state = fresh();
    expect(() => reduceState(state, { type: 'correct_academics', majorId: 'music', keepProgress: true })).toThrow();
    const chosen = reduceState(state, { type: 'choose_academics', majorId: 'computer-science' });
    expect(() => reduceState(chosen, { type: 'correct_academics', majorId: 'missing', keepProgress: true })).toThrow();
    expect(() => reduceState(chosen, { type: 'correct_academics', majorId: 'music', keepProgress: 'yes' as unknown as boolean })).toThrow();
    expect(chosen.academics?.majorId).toBe('computer-science');
    expect(personState(chosen, 'sakiko').academics).toBeNull();
  });
});
