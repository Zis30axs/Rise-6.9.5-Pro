import { describe, expect, it } from 'vitest';
import { applyStoryActions, createInitialState, getNovelTravelQuote, parseState, reduceState } from '../src/runtime/model';
import { enableProtagonists } from '../src/runtime/protagonist-world';
import { getCampusInterior } from '../src/runtime/campus-interiors';
import { COURT_OBSERVE_ID, getLocationServiceQuote, locationServiceCatalog } from '../src/runtime/location-services';
import { sceneLandmarks } from '../src/frontend/scene-layout';
import { tokyoLocationPosition } from '../src/frontend/tokyo-sandbox-map';
import data from '../assets/models/unread-city-tokyo-sandbox-data.json';

function atCourthouse(hour = 10, academia = true) {
  let state = enableProtagonists(createInitialState());
  state.clock = { day: 2, hour, minute: 0 };
  if (academia) state = reduceState(state, { type: 'choose_academics', majorId: 'law' });
  state = reduceState(state, { type: 'novel_travel', locationId: 'courthouse' });
  return state;
}

function inOffice() {
  let state = enableProtagonists(createInitialState());
  const office = getCampusInterior('legal-office')!;
  state.clock = { day: 2, hour: 9, minute: 0 };
  state.locationId = office.id;
  state.scene = { ...office.entrance, areaId: office.parentLocationId, seed: 'court-observe-tests', encounterId: null };
  state.interior = { roomId: office.id, x: 0, z: 2, yaw: 0, activityId: null, lastRest: null, lastStudy: null };
  return parseState(state);
}

const offers = [
  { id: 'courthouse-test-a', category: 'civil' as const, title: '手表交易合同', client: '市民甲',
    summary: '交易双方对约定的交付日期存在争议。', difficulty: 'easy' as const, rewardYen: 8000, experience: 100, preset: false },
  { id: 'courthouse-test-b', category: 'minor-criminal' as const, title: '配送单遗失', client: '店员乙',
    summary: '证物交接和门禁时间存在差异。', difficulty: 'normal' as const, rewardYen: 12000, experience: 130, preset: false },
];

describe('new Tokyo courthouse visit, observation and formal trial', () => {
  it('links the authoritative sandbox building to the old court-hearing room', () => {
    const landmark = data.landmarks.find(place => place.id === 'courthouse')!;
    const room = getCampusInterior('court-hearing')!;
    expect(room.parentLocationId).toBe('courthouse');
    expect(sceneLandmarks.some(place => place.id === 'courthouse')).toBe(true);
    expect(tokyoLocationPosition('courthouse')).toEqual({ x: landmark.x, z: landmark.z });
    expect(tokyoLocationPosition('court-hearing')).toEqual({ x: landmark.x, z: landmark.z });
    const state = atCourthouse();
    expect(state.locationId).toBe('courthouse');
    expect(state.scene?.areaId).toBe('courthouse');
    expect(Math.hypot(state.scene!.x - room.entrance.x, state.scene!.z - room.entrance.z)).toBeLessThanOrEqual(5);
  });

  it('settles observation locally, credits knowledge and academic law, and returns outside', () => {
    let state = atCourthouse();
    expect(getNovelTravelQuote(state, 'court-hearing').blockedReason).toBeTruthy();
    state = reduceState(state, { type: 'enter_interior', roomId: 'court-hearing' });
    const authored = data.landmarks.find(place => place.id === 'courthouse')!.services.find(service => service.id === COURT_OBSERVE_ID)!;
    const catalog = locationServiceCatalog.find(service => service.id === COURT_OBSERVE_ID)!;
    const quote = getLocationServiceQuote(state, COURT_OBSERVE_ID);
    expect(quote.blockedReason).toBeNull();
    expect(catalog.minutes).toBe(authored.minutes);
    expect(catalog.effects.energy).toBe(authored.energyDelta);
    expect(catalog.effects.morale).toBe(authored.moraleDelta);
    expect(catalog.effects.stress).toBe(authored.stressDelta);
    const before = structuredClone(state);
    state = reduceState(state, { type: 'location_service', serviceId: COURT_OBSERVE_ID });
    expect(state.clock.hour * 60 + state.clock.minute - (before.clock.hour * 60 + before.clock.minute)).toBe(30);
    expect(state.player.energy).toBe(before.player.energy - 5);
    expect(state.courtroom?.active).toBeNull();
    expect(state.courtroom?.observationKnowledge?.soyo).toBe(10);
    const progress = state.academics!.subjects.find(subject => subject.subjectId === 'law-advocacy')!;
    expect(progress.points).toBe(10);
    expect(state.academics?.lastGain).toMatchObject({ subjectId: 'law-advocacy', channel: 'court-hearing', points: 10 });
    expect(state.journal.at(-1)?.text).toContain('法庭见闻 +10');
    expect(parseState(JSON.parse(JSON.stringify(state)))).toEqual(state);
    state = reduceState(state, { type: 'leave_interior' });
    expect(state.locationId).toBe('courthouse');
    expect(state.interior).toBeNull();
    expect(state.scene?.areaId).toBe('courthouse');
  });

  it('awards durable courthouse knowledge even without choosing an academic major', () => {
    let state = atCourthouse(10, false);
    state = reduceState(state, { type: 'enter_interior', roomId: 'court-hearing' });
    state = reduceState(state, { type: 'location_service', serviceId: COURT_OBSERVE_ID });
    expect(state.academics).toBeNull();
    expect(state.courtroom?.observationKnowledge?.soyo).toBe(10);
    state = reduceState(state, { type: 'switch_protagonist', target: 'sakiko' });
    expect(state.courtroom?.observationKnowledge?.sakiko).toBe(0);
    expect(state.courtroom?.observationKnowledge?.soyo).toBe(10);
    expect(parseState(state)).toEqual(state);
  });

  it('rejects observation outside the courtroom and entry after closing', () => {
    const outside = atCourthouse();
    expect(getLocationServiceQuote(outside, COURT_OBSERVE_ID).blockedReason).toBeTruthy();
    expect(() => reduceState(outside, { type: 'location_service', serviceId: COURT_OBSERVE_ID })).toThrow();
    const late = atCourthouse(18);
    expect(() => reduceState(late, { type: 'enter_interior', roomId: 'court-hearing' })).toThrow(/开放时间/);
  });

  it('keeps a formal law case isolated from public observation and returns to the office', () => {
    let state = applyStoryActions(inOffice(), [{ type: 'court_docket', offers }], 'courthouse-board');
    const preset = state.courtroom!.board!.offers.find(offer => offer.preset)!;
    state = reduceState(state, { type: 'courtroom', phase: 'accept-preset', offerId: preset.id });
    expect(state.locationId).toBe('court-hearing');
    expect(state.interior?.roomId).toBe('court-hearing');
    expect(state.scene?.areaId).toBe('courthouse');
    expect(getLocationServiceQuote(state, COURT_OBSERVE_ID).blockedReason).toMatch(/正式庭审/);
    expect(() => reduceState(state, { type: 'location_service', serviceId: COURT_OBSERVE_ID })).toThrow();
    expect(parseState(state)).toEqual(state);

    // A legitimate old save from the former Shinjuku room remains loadable.
    const old = structuredClone(state);
    old.scene = { x: -145, z: -158, yaw: 0, areaId: 'grand-commercial', seed: state.scene!.seed, encounterId: null };
    const migrated = parseState(old);
    expect(migrated.locationId).toBe('court-hearing');
    expect(migrated.scene?.areaId).toBe('courthouse');
    expect(migrated.scene?.x).toBe(-20);
    state = applyStoryActions(migrated, [
      { type: 'court_step', kind: 'insight', key: 'contract-evidence', summary: '当庭明确了交付日与票据的关联。' },
      { type: 'court_finish', verdict: 'win', summary: '法院根据交付记录和证词作出判决。' },
    ], 'courthouse-verdict');
    expect(state.courtroom?.active).toBeNull();
    expect(state.locationId).toBe('legal-office');
    expect(state.scene?.areaId).toBe('grand-commercial');
    expect(state.interior?.roomId).toBe('legal-office');
    expect(parseState(state)).toEqual(state);
  });

  it('rejects inflated knowledge records in the existing academic save validator', () => {
    let state = atCourthouse();
    state = reduceState(state, { type: 'enter_interior', roomId: 'court-hearing' });
    state = reduceState(state, { type: 'location_service', serviceId: COURT_OBSERVE_ID });
    const forged = structuredClone(state);
    forged.academics!.lastGain!.points = 100;
    expect(() => parseState(forged)).toThrow();
    const invalid = structuredClone(state);
    invalid.courtroom!.observationKnowledge!.soyo = -1;
    expect(() => parseState(invalid)).toThrow();
  });
});
