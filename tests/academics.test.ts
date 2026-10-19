import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AcademicState, WorldAction, WorldState } from '../src/frontend/types';
import { academicMajors, getAcademicMajor, getAcademicProgress, getAcademicSubject, getAcademicSubjectById, getAcademicOverview, getAcademicStudyQuote, getAcademicTimetable, MAX_ACADEMIC_POINTS } from '../src/runtime/academics';
import { commitStoryTurn, createInitialState, parseState, reduceState } from '../src/runtime/model';
import { withoutAcademics, withoutPlayerNeeds, withAcademicSelection , withoutContactProfiles } from './legacy-state';

afterEach(() => vi.restoreAllMocks());
const atDesk = (state = withAcademicSelection(createInitialState()), roomId = 'classroom', interactionId = roomId === 'classroom' ? 'classroom-notes' : 'study-focus') => reduceState(reduceState(state, { type: 'novel_travel', locationId: roomId }), { type: 'novel_approach', interactionId });
const study = (state: WorldState, subjectId = 'cs-programming', optionId = 'study-short', interactionId = state.interior?.roomId === 'classroom' ? 'classroom-notes' : 'study-focus') => reduceState(state, { type: 'interior_study', subjectId, interactionId, optionId });
const progress = (state: WorldState, subjectId = 'cs-programming') => getAcademicProgress(state.academics, subjectId)!;
const initialSubjects = (majorId: string) => getAcademicMajor(majorId)!.subjects.map(subject => ({ subjectId: subject.id, points: 0 }));

describe('major curriculum and repeating timetable', () => {
  it('keeps bookshop reading within opening hours and the entire chosen duration range', () => {
    const state = reduceState(withAcademicSelection(createInitialState()), { type: 'novel_travel', locationId: 'bookshop' });
    state.clock = { day: 2, hour: 0, minute: 20 };
    const request = { subjectId: 'cs-programming', optionId: 'study-short' };
    const before = JSON.stringify(state);
    expect(getAcademicStudyQuote(state, request).blockedReason).toMatch(/09:00|营业|打烊/);
    expect(() => reduceState(state, { type: 'read_subject', ...request })).toThrow(/09:00|营业|打烊/);
    expect(JSON.stringify(state)).toBe(before);
    state.clock = { day: 2, hour: 21, minute: 31 };
    expect(getAcademicStudyQuote(state, request).blockedReason).toMatch(/关门|打烊/);
    state.clock.minute = 30;
    expect(getAcademicStudyQuote(state, request).blockedReason).toBeNull();
    vi.spyOn(Math, 'random').mockReturnValue(.99999);
    const after = reduceState(state, { type: 'read_subject', ...request });
    expect(after.clock).toEqual({ day: 2, hour: 22, minute: 0 });
    expect(getAcademicStudyQuote(after, request).blockedReason).toMatch(/营业|打烊/);
  });

  it('offers eight frozen majors with three independent authored courses and specific goals each', () => {
    expect(academicMajors).toHaveLength(8);
    const ids = new Set<string>(); const goals = new Set<string>();
    expect(Object.isFrozen(academicMajors)).toBe(true);
    for (const major of academicMajors) {
      expect(major.subjects).toHaveLength(3); expect(Object.isFrozen(major)).toBe(true);
      for (const subject of major.subjects) {
        ids.add(subject.id); subject.stageGoals.forEach(goal => goals.add(goal));
        expect(getAcademicSubject(major.id, subject.id)).toBe(subject);
        expect(getAcademicSubjectById(subject.id)).toBe(subject);
        expect(subject.stageTargets).toEqual([120, 360, 720]);
        expect(Object.isFrozen(subject.stageGoals)).toBe(true);
      }
      expect(reduceState(createInitialState(), { type: 'choose_academics', majorId: major.id }).academics).toEqual({ majorId: major.id, subjects: initialSubjects(major.id), lastGain: null });
    }
    expect(ids.size).toBe(24); expect(goals.size).toBe(72);
    for (const id of ['__proto__', 'constructor', 'unknown', 'https://invalid']) {
      expect(getAcademicMajor(id)).toBeNull(); expect(getAcademicSubjectById(id)).toBeNull();
    }
    expect(getAcademicProgress(null, 'cs-programming')).toBeNull();
    expect(getAcademicOverview(null)).toBeNull(); expect(getAcademicTimetable(null)).toEqual([]);
  });

  it('confirms only the major for free, ignores forged progress and cannot reset an existing curriculum', () => {
    const initial = createInitialState(); const saved = JSON.stringify(initial);
    const selected = reduceState(initial, { type: 'choose_academics', majorId: 'computer-science', points: 99999 } as WorldAction);
    expect(selected.academics).toEqual({ majorId: 'computer-science', subjects: initialSubjects('computer-science'), lastGain: null });
    for (const key of ['player', 'clock', 'inventory', 'phone', 'story', 'contacts', 'schedule', 'scene', 'interior', 'airTraffic', 'transit'] as const) expect(selected[key]).toEqual(initial[key]);
    expect(selected.journal).toHaveLength(initial.journal.length + 1);
    expect(withAcademicSelection(selected)).toEqual(selected);
    expect(() => reduceState(initial, { type: 'choose_academics', majorId: '__proto__' })).toThrow(/专业/);
    expect(() => reduceState(selected, { type: 'choose_academics', majorId: 'music' })).toThrow(/已经确认/);
    expect(JSON.stringify(initial)).toBe(saved);
  });

  it('derives six non-overlapping 90-minute weekly lessons with two sessions per major subject without changing old schedule', () => {
    for (const major of academicMajors) {
      const state = reduceState(createInitialState(), { type: 'choose_academics', majorId: major.id });
      const saved = JSON.stringify(state); const week = getAcademicTimetable(state.academics);
      expect(week).toEqual(getAcademicTimetable(major.id)); expect(week).toHaveLength(6);
      expect(new Set(week.map(item => item.id)).size).toBe(6);
      const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
      for (const subject of major.subjects) expect(week.filter(item => item.subjectId === subject.id)).toHaveLength(2);
      for (const lesson of week) {
        expect(minutes(lesson.end) - minutes(lesson.start)).toBe(90);
        expect(['classroom', 'study-room']).toContain(lesson.locationId);
        for (const other of week.filter(item => item.id !== lesson.id && item.weekday === lesson.weekday)) expect(minutes(lesson.end) <= minutes(other.start) || minutes(other.end) <= minutes(lesson.start)).toBe(true);
      }
      expect(JSON.stringify(state)).toBe(saved);
    }
  });
});

describe('explicit subject study and read-only quotes', () => {
  it('requires a chosen major and an explicit valid subject before any draw', () => {
    const random = vi.spyOn(Math, 'random'); const unselected = atDesk(createInitialState()); const saved = JSON.stringify(unselected);
    expect(() => study(unselected)).toThrow(/先选择专业/);
    const selected = atDesk();
    for (const subjectId of ['unknown', '__proto__', '']) expect(() => study(selected, subjectId)).toThrow(/学科/);
    expect(() => study(selected, 'music-theory')).toThrow(/教室仅/);
    expect(random).not.toHaveBeenCalled(); expect(JSON.stringify(unselected)).toBe(saved);
  });

  it.each([
    { room: 'classroom', option: 'study-short', sample: 0, minutes: 15 },
    { room: 'study-room', option: 'study-short', sample: .5, minutes: 23 },
    { room: 'classroom', option: 'study-short', sample: 1, minutes: 30 },
    { room: 'study-room', option: 'study-medium', sample: .5, minutes: 90 },
    { room: 'classroom', option: 'study-long', sample: 0, minutes: 120 },
    { room: 'study-room', option: 'study-long', sample: 1, minutes: 240 },
  ])('commits $minutes minutes only to the selected subject in $room', ({ room, option, sample, minutes }) => {
    const state = atDesk(withAcademicSelection(createInitialState()), room); const saved = JSON.stringify(state);
    const random = vi.spyOn(Math, 'random').mockReturnValue(sample);
    const after = study(state, 'cs-algorithms', option);
    expect(progress(after, 'cs-algorithms').points).toBe(minutes);
    expect(progress(after).points).toBe(0); expect(progress(after, 'cs-networks').points).toBe(0);
    expect(after.academics!.lastGain).toMatchObject({ subjectId: 'cs-algorithms', minutes, points: minutes, totalPoints: minutes, at: after.journal.at(-1)!.at, outcome: 'normal', channel: room, energyConsumed: Math.ceil(minutes / 6) });
    expect(after.player.energy).toBe(Number((state.player.energy - Math.ceil(minutes / 6)).toFixed(2)));
    expect(parseState(JSON.parse(JSON.stringify(after)))).toEqual(after);
    expect(random).toHaveBeenCalledTimes(1); expect(JSON.stringify(state)).toBe(saved);
    expect(withAcademicSelection(after)).toEqual(after);
  });

  it.each([
    { sample: 0, outcome: 'inspiration', points: 22.5, energy: 3, morale: 2, stress: -1 },
    { sample: .24999, outcome: 'inspiration', points: 22.5, energy: 3, morale: 2, stress: -1 },
    { sample: .25, outcome: 'confusion', points: 7.5, energy: 6, morale: -5, stress: 6 },
    { sample: .49999, outcome: 'confusion', points: 7.5, energy: 6, morale: -5, stress: 6 },
    { sample: .5, outcome: 'normal', points: 15, energy: 3, morale: -1, stress: 1 },
    { sample: 1, outcome: 'normal', points: 15, energy: 3, morale: -1, stress: 1 },
  ])('settles cross-major $outcome at boundary $sample once with exact half points', ({ sample, outcome, points, energy, morale, stress }) => {
    const state = atDesk(withAcademicSelection(createInitialState()), 'study-room', 'study-reading');
    const random = vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(sample);
    const quote = getAcademicStudyQuote(state, { subjectId: 'music-theory', optionId: 'study-short', interactionId: 'study-reading' });
    expect(quote).toMatchObject({ isCrossMajor: true, maxEnergyCost: 8, blockedReason: null });
    expect(quote.outcomes.map(item => item.probability)).toEqual([.25, .25, .5]); expect(random).not.toHaveBeenCalled();
    const after = study(state, 'music-theory', 'study-short', 'study-reading');
    expect(after.academics!.subjects).toHaveLength(4); expect(progress(after, 'music-theory')).toMatchObject({ points, isMajorSubject: false });
    expect(after.player.energy).toBe(Number((state.player.energy - energy).toFixed(2)));
    expect(after.player.morale - state.player.morale).toBe(morale); expect(after.player.stress - state.player.stress).toBe(stress);
    expect(after.academics!.lastGain).toMatchObject({ outcome, points, energyConsumed: energy, moraleChange: morale, stressChange: stress, interactionId: 'study-reading' });
    expect(after.interior!.lastStudy!.energyConsumed).toBe(energy);
    expect(parseState(JSON.parse(JSON.stringify(after)))).toEqual(after); expect(random).toHaveBeenCalledTimes(2);
    expect(getAcademicOverview(after.academics)).toMatchObject({ totalPoints: points, lastGain: { outcome } });
  });

  it('allows bookshop reading only at the outdoor shop, and preserves finances, phone and schedule', () => {
    const state = reduceState(withAcademicSelection(createInitialState()), { type: 'novel_travel', locationId: 'bookshop' });
    const random = vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0);
    const action = { type: 'read_subject', subjectId: 'bio-cell', optionId: 'study-short' } as const;
    expect(() => reduceState(createInitialState(), action)).toThrow(/书店/); expect(random).not.toHaveBeenCalled();
    const after = reduceState(state, action);
    expect(after.academics!.lastGain).toMatchObject({ subjectId: 'bio-cell', points: 22.5, channel: 'bookshop', interactionId: null });
    expect(after.player.balance).toBe(state.player.balance);
    for (const key of ['inventory', 'phone', 'schedule', 'story', 'contacts', 'scene'] as const) expect(after[key]).toEqual(state[key]);
    expect(parseState(JSON.parse(JSON.stringify(after)))).toEqual(after);
  });

  it('blocks worst-case energy before randomness and keeps low energy travel and recovery available', () => {
    const state = atDesk(withAcademicSelection(createInitialState()), 'study-room'); state.player.energy = 7.99;
    const saved = JSON.stringify(state); const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(() => study(state, 'music-theory')).toThrow(/至少需要 8/); expect(random).not.toHaveBeenCalled(); expect(JSON.stringify(state)).toBe(saved);
    state.player.energy = 8; expect(study(state, 'music-theory').player.energy).toBe(5);
    state.player.energy = 0; const moved = reduceState(state, { type: 'novel_travel', locationId: 'dorm-room' });
    expect(moved.locationId).toBe('dorm-room'); expect(moved.player.energy).toBe(0);
    expect(reduceState(moved, { type: 'wait', minutes: 15 }).player.energy).toBe(2);
  });

  it('clamps mental gains once, rejects invalid random draws atomically, and cannot exceed the point/time limit', () => {
    const state = atDesk(withAcademicSelection(createInitialState()), 'study-room'); state.player.morale = 100; state.player.stress = 0;
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    const inspired = study(state, 'music-theory');
    expect(inspired.academics!.lastGain).toMatchObject({ moraleChange: 0, stressChange: 0 }); expect(parseState(inspired)).toEqual(inspired);
    for (const invalid of [NaN, -1, 1.01]) {
      random.mockReset().mockReturnValueOnce(0).mockReturnValueOnce(invalid);
      const saved = JSON.stringify(state); expect(() => study(state, 'music-theory')).toThrow(/生成失败/); expect(JSON.stringify(state)).toBe(saved);
    }
    random.mockReset().mockReturnValue(0);
    const full = study(atDesk()); full.academics!.subjects[0].points = MAX_ACADEMIC_POINTS; full.academics!.lastGain!.totalPoints = MAX_ACADEMIC_POINTS;
    random.mockClear(); expect(() => study(full)).toThrow(/进度.*上限/); expect(random).not.toHaveBeenCalled();
    state.clock = { day: 365000, hour: 23, minute: 59 }; const saved = JSON.stringify(state);
    random.mockClear(); expect(getAcademicStudyQuote(state, { subjectId: 'cs-programming', optionId: 'study-short', interactionId: 'study-focus' }).blockedReason).toMatch(/最大天数/);
    expect(() => study(state)).toThrow(/最大天数/); expect(JSON.stringify(state)).toBe(saved); expect(random).not.toHaveBeenCalled();
  });

  it('keeps old ten-minute browsing distinct and never credits generation, timetable or reloads', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const first = study(atDesk()); const second = study(atDesk(first, 'study-room'), 'cs-networks');
    expect(progress(second).points).toBe(15); expect(progress(second, 'cs-networks').points).toBe(15);
    expect(progress(second).lastGain).toBeNull();
    const waited = reduceState(second, { type: 'wait', minutes: 15 });
    const shelf = reduceState(waited, { type: 'novel_approach', interactionId: 'study-shelf' });
    const browsed = reduceState(shelf, { type: 'interior_interact', interactionId: 'study-shelf' });
    expect(browsed.player.energy).toBe(Number((shelf.player.energy - 1).toFixed(2)));
    expect(browsed.interior!.lastStudy).toBeNull();
    const left = reduceState(browsed, { type: 'leave_interior' });
    for (const value of [waited, shelf, browsed, left]) expect(value.academics).toEqual(second.academics);
    const ids = { userId: 'academics-user', assistantId: 'academics-assistant' };
    const reply = { text: '你回顾了刚才学习的内容。', phoneMessages: [] };
    const continued = commitStoryTurn(left, '继续看看', reply, ids);
    expect(continued.academics).toEqual(second.academics);
    expect(commitStoryTurn(continued, '继续看看', reply, ids).academics).toEqual(second.academics);
  });

  it('can discover all 24 courses without duplicate rows or changing the chosen major', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    let state = atDesk(withAcademicSelection(createInitialState()), 'study-room');
    for (const subject of academicMajors.flatMap(major => major.subjects)) {
      state.player.energy = 100;
      state = study(state, subject.id);
      expect(parseState(state)).toEqual(state);
    }
    expect(state.academics!.subjects).toHaveLength(24);
    expect(new Set(state.academics!.subjects.map(item => item.subjectId)).size).toBe(24);
    expect(state.academics!.majorId).toBe('computer-science');
    state.player.energy = 100;
    const repeated = study(state, 'bio-cell');
    expect(repeated.academics!.subjects).toHaveLength(24);
    expect(progress(repeated, 'bio-cell').points).toBe(45);
  });

  it.each([[0, 0, 120, 120], [119.5, 0, 120, .5], [120, 1, 360, 240], [360, 2, 720, 360], [720, 3, null, 0]])('shows independent stages at %s points', (points, index, target, remaining) => {
    const academics: AcademicState = { majorId: 'music', subjects: initialSubjects('music'), lastGain: null };
    academics.subjects[0].points = points!;
    const snapshot = JSON.stringify(academics); const result = getAcademicProgress(academics, 'music-theory')!;
    expect(result).toMatchObject({ points, stageIndex: index, nextTarget: target, remaining });
    expect(getAcademicProgress(academics, 'music-history')!.points).toBe(0);
    expect(JSON.stringify(academics)).toBe(snapshot);
  });
});

describe('strict multi-course save migration', () => {
  it.each(['1.0.0', '1.1.0', '1.2.0', '1.3.0', '1.4.0', '1.5.0', '1.6.0', '1.7.0', '1.8.0'])('migrates %s with academics null and preserves existing supported data', version => {
    const state = createInitialState();
    if (version >= '1.7.0') { state.inventory = [{ itemId: 'meal-standard', quantity: 3 }]; state.player.health = 66; }
    if (version === '1.8.0') { state.player.energy = 79.29; state.player.morale = 42; }
    const old: Record<string, unknown> = { ...(version < '1.7.0' ? withoutPlayerNeeds(state) : withoutAcademics(state)), schema_version: version };
    if (version === '1.7.0') { const { morale: ignored, ...player } = state.player; old.player = player; }
    if (version < '1.6.0') delete old.transit;
    if (version < '1.3.0') delete old.interior;
    if (version < '1.2.0') delete old.airTraffic;
    if (version < '1.1.0') delete old.scene;
    const saved = JSON.stringify(old); expect(parseState(JSON.parse(saved))).toEqual(state); expect(JSON.stringify(old)).toBe(saved);
    expect(() => parseState({ ...old, academics: null })).toThrow(/字段/);
  });

  it('strictly migrates 1.9 points to the original course and preserves historical gain without inventing outcomes', () => {
    const state = createInitialState(); state.player.energy = 79.29; state.inventory = [{ itemId: 'meal-standard', quantity: 3 }];
    const old = { ...withoutContactProfiles(state), schema_version: '1.9.0', academics: { majorId: 'computer-science', subjectId: 'cs-algorithms', points: 390, lastGain: { subjectId: 'cs-algorithms', minutes: 30, points: 30, totalPoints: 390, at: '第 1 天 17:20' } } };
    const saved = JSON.stringify(old); const migrated = parseState(old);
    expect(migrated.academics!.subjects).toEqual([{ subjectId: 'cs-programming', points: 0 }, { subjectId: 'cs-algorithms', points: 390 }, { subjectId: 'cs-networks', points: 0 }]);
    expect(migrated.academics!.lastGain).toEqual({ ...old.academics.lastGain, outcome: null, channel: null, interactionId: null, energyConsumed: null, moraleChange: null, stressChange: null });
    expect({ ...withoutContactProfiles(migrated), schema_version: old.schema_version, academics: old.academics }).toEqual(old);
    expect(parseState(migrated)).toEqual(migrated); expect(JSON.stringify(old)).toBe(saved);
    for (const patch of [{ points: 390.5 }, { subjectId: 'music-theory' }, { lastGain: { ...old.academics.lastGain, points: 15 } }]) expect(() => parseState({ ...old, academics: { ...old.academics, ...patch } })).toThrow(/academics/);
    expect(parseState({ ...old, academics: null }).academics).toBeNull();
  });

  it('never retroactively credits old room study after selection', () => {
    vi.spyOn(Math, 'random').mockReturnValue(.5);
    const studied = study(atDesk()); const migrated = parseState({ ...withoutAcademics(studied), schema_version: '1.8.0' });
    expect(migrated.academics).toBeNull(); expect(migrated.interior!.lastStudy).toEqual(studied.interior!.lastStudy);
    const selected = withAcademicSelection(migrated);
    expect(selected.academics!.subjects.every(item => item.points === 0)).toBe(true);
    expect(selected.player).toEqual(migrated.player); expect(selected.clock).toEqual(migrated.clock);
    expect(progress(study(selected)).points).toBe(23);
  });

  it('rejects duplicate, missing, unknown, fractional and inconsistent progress or outcome evidence', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); const state = study(atDesk()); const academics = state.academics!;
    const invalid: unknown[] = [undefined, {}, { ...academics, extra: true }, { ...academics, majorId: '__proto__' }, { ...academics, subjects: academics.subjects.slice(1) }, { ...academics, subjects: [...academics.subjects, academics.subjects[0]] }, { ...academics, lastGain: null }];
    for (const points of [-1, .25, MAX_ACADEMIC_POINTS + 1, Infinity]) invalid.push({ ...academics, subjects: [{ subjectId: 'cs-programming', points }, ...academics.subjects.slice(1)] });
    for (const patch of [{ subjectId: 'music-theory' }, { minutes: 31 }, { points: 99 }, { totalPoints: 16 }, { at: '第 2 天 00:00' }, { outcome: 'inspiration' }, { energyConsumed: 9 }, { moraleChange: 4 }, { channel: 'bookshop' }, { interactionId: '__proto__' }, { extra: true }]) invalid.push({ ...academics, lastGain: { ...academics.lastGain, ...patch } });
    expect(() => parseState({ ...state, interior: { ...state.interior!, lastStudy: { ...state.interior!.lastStudy!, energyConsumed: 6 } } })).toThrow(/额外消耗/);
    const saved = JSON.stringify(state); for (const value of invalid) expect(() => parseState({ ...state, academics: value })).toThrow(/academics/); expect(JSON.stringify(state)).toBe(saved);
  });
});
