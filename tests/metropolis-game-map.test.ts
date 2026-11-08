// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { performance } from 'node:perf_hooks';
import { buildGameMapContext, gameMapPosition } from '../src/frontend/metropolis/game-map';
import type { CharacterContact, ShellModel, WorldState } from '../src/frontend/types';
import { locationDistrict, MAP_DISTRICT_IDS, mapDistricts } from '../src/frontend/map-districts';
import { mapLocationPoint } from '../src/frontend/campus-map-layout';
import { createInitialState, getNovelTravelQuote, getRouteOutlook, novelDestinations, parseState, reduceState } from '../src/runtime/model';
import { getTransitRoutes, type TransitVehicleId } from '../src/runtime/transit';
import { getLocationStatus } from '../src/runtime/location-services';
import { isInternationalLocation } from '../src/runtime/california';
import { enableProtagonists, personState } from '../src/runtime/protagonist-world';
import * as worldPresence from '../src/runtime/world-presence';
import { isLand, terrainHeight } from '../src/frontend/metropolis/terrain';

function model(state: WorldState = createInitialState()): ShellModel {
  return { state, mode: 'demo', busy: false, notice: '', connection: '',
    externalPhoneAvailable: false, externalPhoneOpen: false, phoneStatus: 'idle', phoneError: '',
    phoneSource: 'none', phoneLinkStatus: 'idle', phoneLinkError: '', phoneUnread: 0, phoneContactUnread: [] };
}
function freezeDeep(value: unknown) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return;
  Object.freeze(value);
  Object.values(value).forEach(freezeDeep);
}
function contact(id: string, sourcePersonId: string, affinity: number): CharacterContact {
  return { id, name: id, tag: '熟悉的人', summary: '已经认识的居民。', affinity, status: '在附近',
    portraitId: 'deepseek', sourcePersonId, isMain: false };
}
function resident(id: string, x: number, z: number): worldPresence.WorldScenePerson {
  return { id, name: id, candidateName: id, identity: '居民', tags: ['居民'], description: '附近的居民。',
    x, z, color: 0x859c6d, portraitId: 'deepseek', contactId: null, isMain: false };
}

afterEach(() => vi.restoreAllMocks());

describe('metropolis game map display adapter', () => {
  it('maps all authored city destinations and real calendar data without mutating the save', () => {
    const shell = model();
    shell.state.clock.hour = 8; shell.state.clock.minute = 9;
    const before = JSON.stringify(shell.state);
    freezeDeep(shell.state);
    const context = buildGameMapContext(shell);
    expect(context.clockLabel).toBe('08:09');
    expect(context.dayLabel).toBe('2025年8月28日 周四');
    expect(context.clock.minutesOfDay).toBe(489);
    expect(context.currentLocation).toMatchObject({ id: 'gate', name: '校园南门', districtId: 'campus', mapping: 'city' });
    expect(context.districts.map(district => district.id)).toEqual([...MAP_DISTRICT_IDS]);
    for (const district of context.districts) {
      const source = mapDistricts.find(item => item.id === district.id)!;
      expect(district.name).toBe(source.name);
      expect(district.caption).toBe(source.shortName);
      expect(district.count).toBe(context.destinations.filter(place => place.districtId === district.id).length);
      expect(district.position.every(Number.isFinite)).toBe(true);
    }
    expect(context.destinations.map(place => place.locationId)).toEqual(novelDestinations.map(place => place.id));
    expect(new Set(context.destinations.map(place => place.id)).size).toBe(context.destinations.length);
    expect(context.destinations).toHaveLength(54);
    expect(context.destinations.filter(place => place.mapping === 'city')).toHaveLength(49);
    for (const destination of context.destinations) {
      if (isInternationalLocation(destination.id)) {
        expect(destination.mapping).toBe('international');
        expect(destination.position).toBeNull();
        expect(destination.districtId).toBeNull();
      } else {
        expect(destination.districtId).toBe(locationDistrict(destination.id));
        expect(destination.position?.every(Number.isFinite)).toBe(true);
        const [x, y, z] = destination.position!;
        expect(isLand(x, z), destination.id).toBe(true);
        expect(y).toBeGreaterThan(terrainHeight(x, z));
      }
    }
    expect(context.player.position).toEqual(gameMapPosition('gate'));
    expect(context.destinations.filter(place => place.current).map(place => place.id)).toEqual(['gate']);
    expect(JSON.stringify(shell.state)).toBe(before);
  });

  it('maps actual indoor presence to its authored entrance and retains the current room identity', () => {
    const state = reduceState(createInitialState(), { type: 'novel_travel', locationId: 'dorm-room' });
    const before = structuredClone(state);
    const context = buildGameMapContext(model(state));
    expect(state.locationId).toBe(state.interior!.roomId);
    expect(context.currentLocation.id).toBe('dorm-room');
    expect(context.player.locationId).toBe('dorm-room');
    expect(context.player.position).toEqual(gameMapPosition('dorm-room', mapLocationPoint('dorm-room')));
    expect(context.destinations.filter(place => place.current).map(place => place.id)).toEqual(['dorm-room']);
    expect(context.inInterior).toBe(true);
    expect(context.destinations.find(place => place.id === 'dorm')!.quote).toEqual(getNovelTravelQuote(state, 'dorm'));
    expect(state).toEqual(before);
  });

  it('uses complete runtime travel quotes, service hours and transit routes', () => {
    const shell = model();
    const context = buildGameMapContext(shell);
    for (const id of ['library', 'home', 'soyo-house', 'circle-cafe']) {
      const destination = context.destinations.find(place => place.id === id)!;
      expect(destination.quote, id).toEqual(getNovelTravelQuote(shell.state, id));
      expect(destination.openState, id).toEqual(getLocationStatus(id, shell.state.clock));
      expect(destination.actionType).toBe('novel_travel');
    }
    const residential = context.destinations.find(place => place.id === 'home')!;
    expect(residential.quote!.rides.length).toBeGreaterThan(0);
    expect(residential.transitRoutes).toEqual(residential.quote!.rides.map(ride =>
      getTransitRoutes(ride.fromStopId, ride.vehicleId as TransitVehicleId).find(route => route.stop.id === ride.toStopId)));
    expect(context.destinations.find(place => place.id === 'soyo-house')!.actionLabel).toBe('进入这里');
    expect(residential.routeLine).toHaveLength(19);
    expect(residential.routeLine.every(([x, y, z]) => Number.isFinite(x + y + z) && y >= terrainHeight(x, z) + .19)).toBe(true);
    expect(context.destinations.find(place => place.id === 'gate')!.routeLine).toEqual([]);
  });

  it('preserves blocked fares, novel and legacy travel rules, and switching locks', () => {
    const shell = model(); shell.state.player.balance = 0; shell.state.player.energy = 0;
    const context = buildGameMapContext(shell);
    const home = context.destinations.find(place => place.id === 'home')!;
    expect(home.quote!.blockedReason).toBeTruthy();
    expect(home.disabled).toBe(true);
    expect(home.reason).toBe(home.quote!.blockedReason);
    expect(home.quoteLabel).toBe(home.quote!.blockedReason);
    expect(context.destinations.find(place => place.id === 'library')!.disabled).toBe(false);
    const legacy = buildGameMapContext(shell, { novelMode: false });
    const library = legacy.destinations.find(place => place.id === 'library')!;
    expect(library.actionType).toBe('travel');
    expect(library.disabled).toBe(false);
    expect(library.legacy.minutes).toBe(15 + getRouteOutlook(shell.state, 'library').extraMinutes);
    expect(legacy.destinations.find(place => place.id === 'gate')!.disabled).toBe(true);
    expect(legacy.destinations.find(place => place.id === 'dorm-room')!.disabled).toBe(true);
    const indoor = model(reduceState(createInitialState(), { type: 'novel_travel', locationId: 'dorm-room' }));
    expect(buildGameMapContext(indoor, { novelMode: false }).destinations.find(place => place.id === 'library')!.disabled).toBe(true);
    const remote = model(reduceState(createInitialState(), { type: 'novel_travel', locationId: 'home' }));
    expect(buildGameMapContext(remote, { novelMode: false }).requiresTransitReturn).toBe(true);
    expect(buildGameMapContext(remote, { novelMode: false }).destinations.find(place => place.id === 'library')!.disabled).toBe(true);
    shell.switchingProtagonist = true;
    expect(buildGameMapContext(shell).destinations.every(place => place.disabled)).toBe(true);
  });

  it('does not invent campus positions for unknown or international locations', () => {
    expect(gameMapPosition('future-place')).toBeNull();
    expect(gameMapPosition('gate', { x: Number.NaN, z: 0 })).toBeNull();
    expect(gameMapPosition('sfo-airport')).toBeNull();
    const unknown = model(); unknown.state.locationId = 'future-place';
    const missing = buildGameMapContext(unknown);
    expect(missing.currentLocation.position).toBeNull();
    expect(missing.currentDistrictId).toBeNull();
    expect(missing.currentLocation.mapping).toBe('unmapped');
    expect(missing.destinations.every(place => place.disabled)).toBe(true);
    const overseas = model(); overseas.state.locationId = 'sfo-airport'; overseas.state.scene = null;
    const context = buildGameMapContext(overseas, { novelMode: false });
    expect(context.currentLocation).toMatchObject({ id: 'sfo-airport', name: '旧金山国际机场', districtId: null, position: null, mapping: 'international' });
    const visit = context.destinations.find(place => place.id === 'california-openai')!;
    expect(visit.quote).toEqual(getNovelTravelQuote(overseas.state, 'california-openai'));
    expect(visit.quote).toMatchObject({ fare: 2600, minutes: 65 });
    expect(visit.actionType).toBe('novel_travel');
    expect(visit.disabled).toBe(false);
    expect(context.destinations.every(place => place.routeLine.length === 0)).toBe(true);
  });

  it('checks recognition, affinity and original-world distance before scenic compression', () => {
    const shell = model(), origin = worldPresence.worldScenePosition(shell.state)!;
    shell.state.contacts = [contact('renamed-friend', 'at-boundary', 10), contact('too-cold', 'low-affinity', 9), contact('far-friend', 'beyond-boundary', 100)];
    vi.spyOn(worldPresence, 'worldScenePeople').mockReturnValue([
      resident('at-boundary', origin.x + 35, origin.z), resident('beyond-boundary', origin.x + 35.01, origin.z),
      resident('low-affinity', origin.x + 1, origin.z), resident('stranger', origin.x + 1, origin.z),
    ]);
    const before = JSON.stringify(shell.state);
    expect(buildGameMapContext(shell).people.map(person => person.id)).toEqual(['at-boundary']);
    expect(JSON.stringify(shell.state)).toBe(before);
  });

  it('does not disclose contacts known only to another protagonist', () => {
    const state = enableProtagonists(createInitialState());
    state.contacts = [];
    personState(state, 'sakiko').contacts.push(contact('sakiko-private-friend', 'private-resident', 100));
    const origin = worldPresence.worldScenePosition(state)!;
    vi.spyOn(worldPresence, 'worldScenePeople').mockReturnValue([resident('private-resident', origin.x, origin.z)]);
    expect(buildGameMapContext(model(state)).people).toEqual([]);
  });

  it('uses actual independent protagonist locations while preserving the original visibility exception', () => {
    let state = enableProtagonists(createInitialState());
    state = reduceState(state, { type: 'novel_travel', locationId: 'sports' });
    state = reduceState(state, { type: 'switch_protagonist', target: 'sakiko' });
    state = reduceState(state, { type: 'novel_travel', locationId: 'sports' });
    state.contacts = [];
    const here = buildGameMapContext(model(state));
    expect(here.people.some(person => person.protagonistId === 'soyo')).toBe(true);
    expect(here.people.some(person => person.protagonistId === 'sakiko')).toBe(false);
    const soyo = personState(state, 'soyo');
    soyo.locationId = 'home';
    soyo.scene = { ...soyo.scene!, ...mapLocationPoint('home')!, areaId: 'home' };
    const before = structuredClone(state);
    expect(buildGameMapContext(model(state)).people.some(person => person.protagonistId === 'soyo')).toBe(false);
    expect(state).toEqual(before);
  });

  it('measures complete contexts for initial and history-rich valid saves without omitting quotes', () => {
    const initial = model(), large = model();
    large.state.story = Array.from({ length: 100 }, (_, i) => ({ id: `history-${i}`, role: 'assistant' as const, text: '一段已经存档的故事。'.repeat(40) }));
    large.state.journal = Array.from({ length: 100 }, (_, i) => ({ id: `journal-${i}`, at: '第 1 天 17:20', text: '今天的行程记录。'.repeat(15) }));
    large.state = parseState(large.state);
    const samples = [initial, large].map((shell, index) => {
      const start = performance.now(), context = buildGameMapContext(shell), milliseconds = performance.now() - start;
      expect(context.destinations).toHaveLength(novelDestinations.length);
      expect(context.destinations.find(place => place.id === 'home')!.quote).toEqual(getNovelTravelQuote(shell.state, 'home'));
      return { case: index === 0 ? 'initial' : 'history-rich', destinations: context.destinations.length,
        stateKiB: Math.round(Buffer.byteLength(JSON.stringify(shell.state)) / 1024), milliseconds: Math.round(milliseconds * 10) / 10 };
    });
    console.info('[metropolis-game-map performance]', JSON.stringify(samples));
    expect(samples.every(sample => Number.isFinite(sample.milliseconds))).toBe(true);
  });
});
