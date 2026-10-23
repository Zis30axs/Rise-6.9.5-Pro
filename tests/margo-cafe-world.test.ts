import { describe, expect, it } from 'vitest';
import { getCampusInterior } from '../src/runtime/campus-interiors';
import { getLocationServiceQuote, getLocationServices, getLocationStatus, getTakeawayQuote } from '../src/runtime/location-services';
import { createInitialState, parseState, reduceState, commitStoryTurn } from '../src/runtime/model';
import { residentById, residentPresence } from '../src/runtime/npc-cast';
import { MARGO_CAFE_ROOM_ID, isMargoCafeOpen } from '../src/runtime/margo-cafe-venue';
import { getInteriorPeople, getInteriorPeopleForValidation, getSceneArea, getSceneContext, getScenePeople, hiddenProtagonistPersons, sceneLocationId } from '../src/runtime/scene-context';
import { contactProposalContext, npcPhoneView } from '../src/runtime/npc-phone';

const reload = (state: ReturnType<typeof createInitialState>) => parseState(JSON.parse(JSON.stringify(state)));
function atCafe(hour = 16, minute = 0) {
  const state = createInitialState();
  state.clock = { day: 1, hour, minute };
  state.locationId = MARGO_CAFE_ROOM_ID;
  state.scene = { x: 48, z: 55.5, yaw: 0, areaId: 'street-cafe', seed: 'cafe-world-test', encounterId: null };
  state.interior = { roomId: MARGO_CAFE_ROOM_ID, ...getCampusInterior(MARGO_CAFE_ROOM_ID)!.spawn, activityId: null, lastRest: null, lastStudy: null };
  return parseState(state);
}

describe('Margo cafe world and actual presence', () => {
  it('uses the existing street cafe and shared overnight hours for its owner, room and services', () => {
    expect(getCampusInterior(MARGO_CAFE_ROOM_ID)?.parentLocationId).toBe('street-cafe');
    expect(residentById('majo-margo')?.publicProfile).toContain('店主');
    for (const [hour, minute, open] of [[9, 59, false], [10, 0, true], [23, 59, true], [1, 59, true], [2, 0, false]] as const) {
      const clock = { day: 1, hour, minute };
      expect(isMargoCafeOpen(clock)).toBe(open);
      expect(getLocationStatus(MARGO_CAFE_ROOM_ID, clock)?.isOpen).toBe(open);
      expect(getLocationStatus('street-cafe', clock)?.isOpen).toBe(open);
      expect(residentPresence('majo-margo', clock)?.locationId === MARGO_CAFE_ROOM_ID).toBe(open);
      expect(getInteriorPeople(MARGO_CAFE_ROOM_ID, [], clock).some(person => person.id === 'majo-margo')).toBe(open);
    }
  });

  it('moves visitors between the cafe and their own routines without duplicating outdoor people', () => {
    const scene = atCafe().scene!;
    const clock = { hour: 16, minute: 0 };
    const people = getInteriorPeople(MARGO_CAFE_ROOM_ID, [], clock);
    expect(people.map(person => person.id)).toEqual(['majo-emma', 'majo-hiro', 'majo-anan', 'majo-margo']);
    const outdoorIds = getScenePeople(scene, [], clock).map(person => person.id);
    expect(people.some(person => outdoorIds.includes(person.id))).toBe(false);
    expect(getInteriorPeople(MARGO_CAFE_ROOM_ID, [], { hour: 17, minute: 0 }).some(person => person.id === 'majo-emma')).toBe(false);
    expect(getInteriorPeople(MARGO_CAFE_ROOM_ID, [], { hour: 18, minute: 0 }).map(person => person.id)).toEqual(['majo-anan', 'majo-noa', 'majo-margo']);
    expect(getInteriorPeople(MARGO_CAFE_ROOM_ID, [], clock, ['majo-emma']).some(person => person.id === 'majo-emma')).toBe(false);
    expect(getInteriorPeople('dorm-room', [], clock)).toEqual([]);
    expect(getInteriorPeople(MARGO_CAFE_ROOM_ID)).toEqual([]);
    expect(getInteriorPeopleForValidation(MARGO_CAFE_ROOM_ID)).toHaveLength(5);
  });

  it('loads historical junction encounters while keeping Margo inside the cafe at runtime', () => {
    const old = createInitialState();
    const scene = { x: -5.4, z: 49.6, yaw: 0, areaId: getSceneArea(-5.4, 49.6)!.id, seed: 'old-margo-encounter', encounterId: 'majo-margo' };
    old.scene = scene;
    old.locationId = sceneLocationId(scene.areaId);
    expect(reload(old).scene?.encounterId).toBe('majo-margo');
    expect(getScenePeople(scene, old.contacts, old.clock).some(person => person.id === 'majo-margo')).toBe(false);
    expect(getSceneContext(scene, null, old.contacts, old.clock)?.encounter).toBeNull();
  });

  it('retains inactive protagonist saves after a visitor leaves, without reviving the encounter', () => {
    const met = reduceState(atCafe(), { type: 'encounter', personId: 'majo-emma' });
    const away = reduceState(met, { type: 'switch_protagonist', target: 'sakiko' });
    expect(away.protagonists?.inactive.scene?.encounterId).toBe('majo-emma');
    // Stored inactive encounters are historical facts, even when the shared
    // clock has moved past the visitor's live schedule.
    const future = reduceState(away, { type: 'wait', minutes: 120 });
    future.protagonists!.inactive = structuredClone(away.protagonists!.inactive);
    const later = reload(future);
    const returned = reload(reduceState(later, { type: 'switch_protagonist', target: 'soyo' }));
    expect(contactProposalContext(returned)).toBeNull();
    expect(getSceneContext(returned.scene, returned.interior, returned.contacts, returned.clock)?.encounter).toBeNull();
  });

  it('provides the existing priced menu inside, including controlled takeaway and closing-time limits', () => {
    const state = atCafe();
    expect(getLocationServices(state).map(service => service.id)).toEqual(['drink-coffee', 'drink-latte', 'drink-tea', 'eat-dessert']);
    expect(getLocationServiceQuote(state, 'drink-coffee')).toMatchObject({ price: 16, minutes: 10, blockedReason: null });
    expect(getTakeawayQuote(state, 'drink-coffee')).toMatchObject({ totalPrice: 18, blockedReason: null });
    const served = reload(reduceState(state, { type: 'location_service', serviceId: 'drink-coffee' }));
    expect(served.player.balance).toBe(state.player.balance - 16);
    expect(served.clock.minute).toBe(10);
    expect(served.inventory).toEqual(state.inventory);
    expect(getLocationServiceQuote(atCafe(1, 55), 'drink-coffee').blockedReason).toContain('打烊');
    expect(getTakeawayQuote(atCafe(2), 'drink-coffee').blockedReason).toContain('打烊');
    expect(getLocationServices({ ...state, interior: { ...state.interior!, roomId: 'dorm-room' }, locationId: 'dorm-room' })).toEqual([]);
  });

  it('supports a real indoor encounter and explicit dialogue evidence without creating contacts', () => {
    const before = atCafe();
    const met = reload(reduceState(before, { type: 'encounter', personId: 'majo-margo' }));
    expect(met.protagonists?.npcPhone?.meetings[0]).toMatchObject({ npcId: 'majo-margo', locationId: MARGO_CAFE_ROOM_ID });
    expect(met.contacts).toEqual(before.contacts);
    const context = getSceneContext(met.scene, met.interior, met.contacts, met.clock, hiddenProtagonistPersons(met));
    expect(context?.encounter?.id).toBe('majo-margo');
    expect(context?.nearbyPeople.some(person => person.id === 'majo-margo')).toBe(true);
    const quote = '想知道明天的甜点的话，可以加个手机好友。';
    const result = { text: `|宝生玛格|平静|${quote}|`, phoneMessages: [], contactRequests: [{ kind: 'contact' as const, npcId: 'majo-margo', evidenceId: 'current', quote }] };
    const pending = reload(commitStoryTurn(met, '|素世|平静|今天有什么甜点？|', result, { userId: 'cafe-u', assistantId: 'cafe-a' }));
    expect(npcPhoneView(pending, 'soyo').requests[0]).toMatchObject({ npcId: 'majo-margo', status: 'pending' });
    expect(pending.contacts).toEqual(before.contacts);
    expect(contactProposalContext(pending)?.npcId).toBe('majo-margo');
    const closed = { ...pending, clock: { day: 2, hour: 2, minute: 0 } };
    expect(contactProposalContext(closed)).toBeNull();
    expect(() => reduceState(atCafe(2), { type: 'encounter', personId: 'majo-margo' })).toThrow();
  });
});
