import { describe, expect, it } from 'vitest';
import { createInitialState, parseState, reduceState } from '../src/runtime/model';
import { activeProtagonist, enableProtagonists, personState } from '../src/runtime/protagonist-world';
import { getCampusInterior } from '../src/runtime/campus-interiors';
import { districtMapPlaces, locationDistrict } from '../src/frontend/map-districts';
import { getAdjacentLocations } from '../src/runtime/location-links';
import { getInteriorPeople } from '../src/runtime/scene-context';
import { getLocationStatus } from '../src/runtime/location-services';
import { getAcademicMajor } from '../src/runtime/academics';
import { allResidentCast, residentPresence } from '../src/runtime/npc-cast';
import { lawCases, lawOwner, quoteLawCase, lawCareerStoryContext, SHERRY_ASSIST_RATE } from '../src/runtime/law-career';
import { npcProfession } from '../src/runtime/npc-professions';

function inOffice(protagonist: 'soyo' | 'emma' = 'emma', hour = 9, minute = 0) {
  let state = enableProtagonists(createInitialState());
  if (protagonist !== 'soyo') state = reduceState(state, { type: 'switch_protagonist', target: protagonist });
  const room = getCampusInterior('legal-office')!;
  state.clock = { day: 2, hour, minute };
  state.locationId = room.id;
  state.scene = {
    x: room.entrance.x, z: room.entrance.z, yaw: room.entrance.yaw,
    areaId: room.parentLocationId, seed: 'law-test', encounterId: null,
  };
  state.interior = { roomId: room.id, x: 0, z: 2, yaw: 0, activityId: null, lastRest: null, lastStudy: null };
  state.player.energy = 95;
  if (state.protagonists?.backgroundLife) {
    const cursor = (state.clock.day - 1) * 1440 + state.clock.hour * 60 + state.clock.minute;
    state.protagonists.backgroundLife.cursor = cursor;
    for (const person of Object.values(state.protagonists.backgroundLife.people))
      person.nextDecisionAt = Math.max(person.nextDecisionAt, cursor);
  }
  return parseState(state);
}
const act = (phase: 'accept' | 'investigate' | 'present' | 'sherry', caseId?: string, evidenceId?: string) =>
  ({ type: 'law_case' as const, phase, ...(caseId ? { caseId } : {}), ...(evidenceId ? { evidenceId } : {}) });

describe('law career and Sherry evidence assistance', () => {
  it('gives all authored NPCs a profession slot, fixes Sherry to law and places her with Emma', () => {
    const sherry = allResidentCast.find(person => person.id === 'majo-sherry')!;
    expect(sherry).toMatchObject({ majorId: 'law', careerId: 'lawyer', qualification: 'trainee' });
    expect(allResidentCast.every(person => Object.hasOwn(person, 'majorId') && Object.hasOwn(person, 'careerId'))).toBe(true);
    expect(allResidentCast.find(person => person.id === 'majo-hiro')?.majorId).toBeNull();
    expect(getAcademicMajor('law')?.subjects).toHaveLength(3);
    expect(getCampusInterior('legal-office')?.parentLocationId).toBe('grand-commercial');
    expect(locationDistrict('legal-office')).toBe('grand-commercial');
    expect(districtMapPlaces('grand-commercial').some(point => point.id === 'legal-office')).toBe(true);
    expect(getAdjacentLocations({ locationId: 'grand-commercial', interior: null }).some(point => point.id === 'legal-office')).toBe(true);
    expect(getLocationStatus('legal-office', { day: 2, hour: 9, minute: 0 })?.isOpen).toBe(true);
    expect(residentPresence('majo-sherry', { hour: 10, minute: 0 })?.locationId).toBe('legal-office');
    expect(getInteriorPeople('legal-office', [], { hour: 10, minute: 0 }).some(person => person.id === 'majo-sherry')).toBe(true);
  });

  it('persists NPC professional variables separately and keeps Sherry specialization locked', () => {
    const state = inOffice();
    expect(npcProfession(state, 'majo-sherry')).toMatchObject({
      majorId: 'law', careerId: 'lawyer', qualification: 'trainee',
    });
    expect(npcProfession(state, 'majo-hiro')?.majorId).toBeNull();
    const modified = structuredClone(state);
    modified.npcProfessions!.people['majo-hiro'] = {
      majorId: 'law', careerId: 'lawyer', qualification: 'student', careerExperience: 9,
    };
    const restored = parseState(JSON.parse(JSON.stringify(modified)));
    expect(npcProfession(restored, 'majo-hiro')).toMatchObject({ majorId: 'law', careerExperience: 9 });
    const changedSherry = structuredClone(state);
    changedSherry.npcProfessions!.people['majo-sherry']!.majorId = 'economics';
    expect(() => parseState(changedSherry)).toThrow(/雪莉/);
    const legacy = structuredClone(state);
    delete legacy.npcProfessions;
    expect(npcProfession(parseState(legacy), 'majo-sherry')?.majorId).toBe('law');
  });

  it('lets Emma solve a case without help, earning full rewards exactly once', () => {
    let state = inOffice();
    expect(activeProtagonist(state)).toBe('emma');
    const original = structuredClone(state);
    const case1 = lawCases[0]!;
    const originalBalance = state.player.balance;
    expect(quoteLawCase(state, act('accept', case1.id)).blockedReason).toBeNull();
    state = reduceState(state, act('accept', case1.id));
    expect(lawOwner(state).active).toMatchObject({ caseId: case1.id, stage: 'investigation', round: 0 });
    state = reduceState(state, act('investigate'));
    expect(lawOwner(state).active?.stage).toBe('cross-examination');
    const beforeWrong = state.player.balance;
    state = reduceState(state, act('present', undefined, 'witness-note'));
    expect(lawOwner(state).active?.round).toBe(0);
    expect(lawOwner(state).active?.mistakes).toBe(1);
    expect(state.player.balance).toBe(beforeWrong);
    state = reduceState(state, act('present', undefined, case1.rounds[0]!.evidenceId));
    expect(lawOwner(state).active?.round).toBe(1);
    state = reduceState(state, act('present', undefined, case1.rounds[1]!.evidenceId));
    expect(lawOwner(state).active).toBeNull();
    expect(lawOwner(state).experience).toBe(case1.experience);
    expect(lawOwner(state).totalPayout).toBe(case1.rewardYen);
    expect(state.player.balance - originalBalance).toBe(case1.rewardYen);
    expect(npcProfession(state, 'majo-sherry')?.careerExperience).toBe(Math.round(case1.experience * 0.2));
    expect(lawOwner(state).lastResult).toMatchObject({ outcome: 'perfect', solvedBy: 'player' });
    expect(lawOwner(state).lastResult?.deductions).toEqual(case1.rounds.map(round => round.deduction));
    expect(() => reduceState(state, act('accept', case1.id))).toThrow(/已经结案/);
    expect(parseState(JSON.parse(JSON.stringify(state)))).toEqual(state);
    expect(original.lawCareer?.owners.emma).toBeUndefined();
  });

  it('guarantees the perfect ending with Sherry but grants Emma only 40% payout and experience', () => {
    let state = inOffice();
    const case2 = lawCases[1]!;
    const balance = state.player.balance;
    state = reduceState(state, act('accept', case2.id));
    state = reduceState(state, act('investigate'));
    state = reduceState(state, act('present', undefined, case2.rounds[0]!.evidenceId));
    state = reduceState(state, act('sherry'));
    const result = lawOwner(state).lastResult!;
    expect(SHERRY_ASSIST_RATE).toBe(0.4);
    expect(result.outcome).toBe('perfect');
    expect(result.solvedBy).toBe('sherry');
    expect(result.payout).toBe(Math.round(case2.rewardYen * 0.4));
    expect(result.experience).toBe(Math.round(case2.experience * 0.4));
    expect(state.player.balance - balance).toBe(result.payout);
    expect(npcProfession(state, 'majo-sherry')?.careerExperience).toBe(Math.round(case2.experience * 0.6));
    expect(lawOwner(state).active).toBeNull();
    expect(result.deductions).toEqual(case2.rounds.map(round => round.deduction));
    expect(lawCareerStoryContext(state).lastResult?.deductions).toEqual(result.deductions);
    expect(() => reduceState(state, act('sherry'))).toThrow();
    expect(parseState(JSON.parse(JSON.stringify(state)))).toEqual(state);
    const ledger = state.protagonists!.accounts.ledger.filter(row => row.actor === 'emma' && row.deltaCents === result.payout * 100);
    expect(ledger).toHaveLength(1);
  });

  it('allows rescue already during investigation; rejects rescue for other protagonists', () => {
    const case1 = lawCases[0]!;
    let emma = inOffice();
    emma = reduceState(emma, act('accept', case1.id));
    emma = reduceState(emma, act('sherry'));
    expect(lawOwner(emma).lastResult?.solvedBy).toBe('sherry');
    expect(lawOwner(emma).lastResult?.deductions).toEqual(case1.rounds.map(round => round.deduction));

    let soyo = inOffice('soyo');
    soyo = reduceState(soyo, act('accept', case1.id));
    expect(quoteLawCase(soyo, act('sherry')).blockedReason).toMatch(/艾玛/);
    expect(() => reduceState(soyo, act('sherry'))).toThrow();
  });

  it('preserves separate protagonist progress and rejects forged case settlements', () => {
    const case1 = lawCases[0]!;
    let state = inOffice();
    state = reduceState(state, act('accept', case1.id));
    state = reduceState(state, act('sherry'));
    const emmaExperience = lawOwner(state).experience;
    state = reduceState(state, { type: 'switch_protagonist', target: 'soyo' });
    expect(lawOwner(state).experience).toBe(0);
    expect(personState(state, 'emma').player.balance).toBeGreaterThan(0);
    state = reduceState(state, { type: 'switch_protagonist', target: 'emma' });
    expect(lawOwner(state).experience).toBe(emmaExperience);
    const forged = structuredClone(state);
    forged.lawCareer!.owners.emma!.lastResult!.payout = 999999;
    expect(() => parseState(forged)).toThrow(/律师存档无效/);
  });

  it('enforces hours, place, energy and does not commit blocked changes', () => {
    const case1 = lawCases[0]!;
    const late = inOffice('emma', 17, 30);
    expect(quoteLawCase(late, act('accept', case1.id)).blockedReason).toBeNull();
    const accepted = reduceState(late, act('accept', case1.id));
    expect(quoteLawCase(accepted, act('investigate')).blockedReason).toMatch(/下班/);
    const tired = inOffice(); tired.player.energy = 0;
    expect(quoteLawCase(tired, act('accept', case1.id)).blockedReason).toMatch(/精力不足/);
    const elsewhere = inOffice(); elsewhere.locationId = 'grand-commercial'; elsewhere.interior = null;
    expect(quoteLawCase(elsewhere, act('accept', case1.id)).blockedReason).toMatch(/进入律师事务所/);
  });
});
