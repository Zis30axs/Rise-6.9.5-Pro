import { describe, expect, it } from 'vitest';
import { createInitialState, parseState, reduceState } from '../src/runtime/model';
import { activeProtagonist, enableProtagonists } from '../src/runtime/protagonist-world';
import { canManageLivehouseAndBand, getCampusInterior } from '../src/runtime/campus-interiors';
import { districtBounds, districtMapPlaces, locationDistrict, MAP_DISTRICT_IDS } from '../src/frontend/map-districts';
import { visibleMapBuildings } from '../src/frontend/campus-map-layout';
import { getNovelBackground } from '../src/frontend/novel-backgrounds';
import { getTransitRoutes, transitStops } from '../src/runtime/transit';
import { getLocationServices, getLocationStatus } from '../src/runtime/location-services';

describe('grand-commercial district sandtable and livehouse / ktv', () => {
  it('registers grand-commercial as a full map district sandtable with buildings and places', () => {
    expect(MAP_DISTRICT_IDS).toContain('grand-commercial');
    const places = districtMapPlaces('grand-commercial');
    expect(places.length).toBeGreaterThanOrEqual(2);
    expect(places.some(place => place.id === 'livehouse')).toBe(true);
    expect(places.some(place => place.id === 'ktv-lounge')).toBe(true);
    expect(locationDistrict('livehouse')).toBe('grand-commercial');
    expect(locationDistrict('ktv-lounge')).toBe('grand-commercial');

    const bounds = districtBounds('grand-commercial');
    const livehouse = getCampusInterior('livehouse')!;
    const ktv = getCampusInterior('ktv-lounge')!;
    expect(livehouse.entrance.x).toBeGreaterThanOrEqual(bounds.minX);
    expect(livehouse.entrance.x).toBeLessThanOrEqual(bounds.maxX);
    expect(ktv.entrance.x).toBeGreaterThanOrEqual(bounds.minX);
    expect(ktv.entrance.x).toBeLessThanOrEqual(bounds.maxX);

    const buildings = visibleMapBuildings('grand-commercial');
    expect(buildings.some(b => b.id === 'building:livehouse')).toBe(true);
    expect(buildings.some(b => b.id === 'building:ktv')).toBe(true);
    expect(buildings.some(b => b.id === 'building:grand-mall')).toBe(true);
  });

  it('provides dedicated illustrated backgrounds for livehouse and ktv', () => {
    const liveBg = getNovelBackground('livehouse', 20);
    expect(liveBg.src).toContain('data:image/');
    expect(liveBg.imagePhase).toBe('night');

    const ktvBg = getNovelBackground('ktv-lounge', 21);
    expect(ktvBg.src).toContain('data:image/');
    expect(ktvBg.imagePhase).toBe('night');

    const grandBg = getNovelBackground('grand-commercial', 18);
    expect(grandBg.src).toBeTruthy();
  });

  it('connects transit to grand-commercial and opens location services', () => {
    const stop = transitStops.find(s => s.id === 'grand-commercial')!;
    expect(stop).toBeDefined();
    expect(stop.locationId).toBe('grand-commercial');

    const routes = getTransitRoutes('campus');
    const toGrand = routes.find(r => r.stop.id === 'grand-commercial');
    expect(toGrand).toBeDefined();
    expect(toGrand!.minutes).toBe(20);
    expect(toGrand!.fare).toBe(220);

    const status = getLocationStatus('grand-commercial', { day: 1, hour: 14, minute: 0 });
    expect(status?.isOpen).toBe(true);

    const services = getLocationServices({ locationId: 'grand-commercial', interior: null });
    expect(services.some(s => s.id === 'eat-mall-meal')).toBe(true);
    expect(services.some(s => s.id === 'browse-music-store')).toBe(true);
  });
});

describe('livehouse booking and band creation music major restrictions', () => {
  function world() {
    const enabled = enableProtagonists(createInitialState());
    return parseState(enabled);
  }

  function enterRoom(state: any, roomId: string, x: number, z: number) {
    const room = getCampusInterior(roomId)!;
    state.locationId = room.id;
    state.scene = {
      x: room.entrance.x,
      z: room.entrance.z,
      yaw: room.entrance.yaw,
      areaId: room.parentLocationId,
      seed: 'seed-test-music',
      encounterId: null,
    };
    state.interior = {
      roomId,
      x,
      z,
      yaw: 0,
      activityId: null,
      lastRest: null,
      lastStudy: null,
    };
    return parseState(state);
  }

  it('allows Soyo and Sakiko to book livehouse and create band without music major', () => {
    let state = world();
    expect(activeProtagonist(state)).toBe('soyo');
    // Soyo has null or non-music academics, but can manage livehouse
    expect(canManageLivehouseAndBand(state, 'soyo').allowed).toBe(true);

    // Register explicitly, then book a player-selected date.
    state = enterRoom(state, 'livehouse', 3.2, -1.2);
    state = reduceState(state, { type: 'interior_interact', interactionId: 'livehouse-create-band', registration: { id:'soyo-band', name:'素世测试乐队', founderRole:'bass' } });
    state = enterRoom(state, 'livehouse', -3.2, -1.2);
    state = reduceState(state, { type: 'interior_interact', interactionId: 'livehouse-booking', booking: { id:'soyo-show', bandId:'soyo-band', title:'素世测试演出', start:10000, duration:60 } });
    expect(state.interior!.activityId).toBe('livehouse-booking');
    expect(state.journal.at(-1)?.text).toContain('Live House');

    // Switch to Sakiko
    state = reduceState(state, { type: 'switch_protagonist', target: 'sakiko' });
    expect(activeProtagonist(state)).toBe('sakiko');
    expect(canManageLivehouseAndBand(state, 'sakiko').allowed).toBe(true);

    // Enter livehouse and create band as Sakiko
    state = enterRoom(state, 'livehouse', 3.2, -1.2);
    state = reduceState(state, { type: 'interior_interact', interactionId: 'livehouse-create-band', registration: { id:'band-'+activeProtagonist(state), name:activeProtagonist(state)+'测试乐队', founderRole:'keyboard' } });
    expect(state.interior!.activityId).toBe('livehouse-create-band');
    expect(state.journal.at(-1)?.text).toContain('Live House');
  });

  it('blocks Emma and Renako when they do not have music major, and allows them when music major is chosen', () => {
    let state = world();
    state = reduceState(state, { type: 'switch_protagonist', target: 'emma' });
    expect(activeProtagonist(state)).toBe('emma');

    // Emma without music major
    expect(canManageLivehouseAndBand(state, 'emma').allowed).toBe(false);
    expect(canManageLivehouseAndBand(state, 'emma').reason).toContain('樱羽艾玛');
    expect(canManageLivehouseAndBand(state, 'emma').reason).toContain('音乐专业');

    state = enterRoom(state, 'livehouse', -3.2, -1.2);
    expect(() => reduceState(state, { type: 'interior_interact', interactionId: 'livehouse-booking' }))
      .toThrow(/除了祥子和素世以外.*必须选修音乐专业/);

    // Emma chooses music major
    state = reduceState(state, { type: 'choose_academics', majorId: 'music' });
    expect(state.academics?.majorId).toBe('music');
    expect(canManageLivehouseAndBand(state, 'emma').allowed).toBe(true);

    state = enterRoom(state, 'livehouse', 3.2, -1.2);
    state = reduceState(state, { type: 'interior_interact', interactionId: 'livehouse-create-band', registration: { id:'emma-band', name:'艾玛测试乐队', founderRole:'vocal' } });
    state = enterRoom(state, 'livehouse', -3.2, -1.2);
    state = reduceState(state, { type: 'interior_interact', interactionId: 'livehouse-booking', booking: { id:'emma-show', bandId:'emma-band', title:'艾玛测试演出', start:12000, duration:60 } });
    expect(state.interior!.activityId).toBe('livehouse-booking');

    // Switch to Renako
    state = reduceState(state, { type: 'switch_protagonist', target: 'renako' });
    expect(activeProtagonist(state)).toBe('renako');

    // Renako chooses computer-science major
    state = reduceState(state, { type: 'choose_academics', majorId: 'computer-science' });
    expect(state.academics?.majorId).toBe('computer-science');
    expect(canManageLivehouseAndBand(state, 'renako').allowed).toBe(false);
    expect(canManageLivehouseAndBand(state, 'renako').reason).toContain('甘织玲奈子');

    state = enterRoom(state, 'livehouse', 3.2, -1.2);
    expect(() => reduceState(state, { type: 'interior_interact', interactionId: 'livehouse-create-band' }))
      .toThrow(/除了祥子和素世以外.*必须选修音乐专业/);

    // Renako corrects major to music
    state = reduceState(state, { type: 'correct_academics', majorId: 'music', keepProgress: false });
    expect(state.academics?.majorId).toBe('music');
    expect(canManageLivehouseAndBand(state, 'renako').allowed).toBe(true);

    state = reduceState(state, { type: 'interior_interact', interactionId: 'livehouse-create-band', registration: { id:'band-'+activeProtagonist(state), name:activeProtagonist(state)+'测试乐队', founderRole:'keyboard' } });
    expect(state.interior!.activityId).toBe('livehouse-create-band');
  });

  it('allows general activities in livehouse and ktv for everyone', () => {
    let state = world();
    state = reduceState(state, { type: 'switch_protagonist', target: 'renako' });

    // Singing in KTV works without music major
    state = enterRoom(state, 'ktv-lounge', 0, 2.2);
    state = reduceState(state, { type: 'interior_interact', interactionId: 'ktv-sing' });
    expect(state.interior!.activityId).toBe('ktv-sing');
    expect(state.journal.at(-1)?.text).toContain('KTV');

    // Rehearsal in livehouse works without music major
    state = enterRoom(state, 'livehouse', 0, -1.5);
    state = reduceState(state, { type: 'interior_interact', interactionId: 'livehouse-rehearsal' });
    expect(state.interior!.activityId).toBe('livehouse-rehearsal');
  });
});

