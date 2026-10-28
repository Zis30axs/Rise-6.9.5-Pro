import { describe, expect, it } from 'vitest';
import { MAP_DISTRICT_IDS, districtBounds, districtMapPlaces, locationDistrict } from '../src/frontend/map-districts';
import { visibleMapBuildings, mapLocationPoint } from '../src/frontend/campus-map-layout';
import { campusInteriors, getCampusInterior } from '../src/runtime/campus-interiors';
import { getTransitRoutes, isFarTransitLocation, requiresTransitReturn, transitStops } from '../src/runtime/transit';
import { getLocationServiceQuote, locationServiceCatalog, venues } from '../src/runtime/location-services';
import { createInitialState, getNovelTravelQuote, parseState, reduceState } from '../src/runtime/model';
import rawTakaoWorldbook from '../src/worldbook/takao-mountain.json';

describe('takao mountain sandbox & activities', () => {
  it('registers takao-mountain as a full-fledged district sandtable', () => {
    expect(MAP_DISTRICT_IDS).toContain('takao-mountain');
    const bounds = districtBounds('takao-mountain');
    expect(bounds.minX).toBeLessThanOrEqual(-95);
    expect(bounds.maxX).toBeGreaterThanOrEqual(95);
    expect(bounds.minZ).toBeLessThanOrEqual(-245);
    expect(bounds.maxZ).toBeGreaterThanOrEqual(-125);

    const places = districtMapPlaces('takao-mountain');
    expect(places.length).toBeGreaterThanOrEqual(4);
    const placeIds = places.map(p => p.id);
    expect(placeIds).toContain('takao-mountain');
    expect(placeIds).toContain('takao-onsen');
    expect(placeIds).toContain('takao-summit');
    expect(placeIds).toContain('takao-teahouse');

    for (const roomId of ['takao-onsen', 'takao-summit', 'takao-teahouse']) {
      const room = getCampusInterior(roomId)!;
      expect(room).toBeDefined();
      expect(room.parentLocationId).toBe('takao-mountain');
      expect(locationDistrict(room.id)).toBe('takao-mountain');
      expect(room.entrance.x).toBeGreaterThanOrEqual(bounds.minX);
      expect(room.entrance.x).toBeLessThanOrEqual(bounds.maxX);
      expect(room.entrance.z).toBeGreaterThanOrEqual(bounds.minZ);
      expect(room.entrance.z).toBeLessThanOrEqual(bounds.maxZ);
    }

    const buildings = visibleMapBuildings('takao-mountain');
    const buildingIds = buildings.map(b => b.id);
    expect(buildingIds).toContain('building:takao-station');
    expect(buildingIds).toContain('building:takao-onsen');
    expect(buildingIds).toContain('building:takao-teahouse');
    expect(buildingIds).toContain('building:takao-summit');
  });

  it('supports transit routes and novel travel quotes to and from takao mountain', () => {
    const stop = transitStops.find(s => s.id === 'takao-mountain');
    expect(stop).toBeDefined();
    expect(stop!.locationId).toBe('takao-mountain');
    expect(isFarTransitLocation('takao-mountain')).toBe(true);
    expect(requiresTransitReturn('takao-mountain', { x: 0, z: -175, areaId: 'takao-mountain', yaw: 0, seed: 'takao', encounterId: null })).toBe(true);

    const routesFromCampus = getTransitRoutes('campus');
    const takaoRoute = routesFromCampus.find(r => r.stop.id === 'takao-mountain');
    expect(takaoRoute).toBeDefined();
    expect(takaoRoute!.minutes).toBe(25);
    expect(takaoRoute!.fare).toBe(260);

    const routesFromTakao = getTransitRoutes('takao-mountain');
    expect(routesFromTakao.length).toBe(1);
    expect(routesFromTakao[0].stop.id).toBe('campus');

    const state = createInitialState();
    const quote = getNovelTravelQuote(state, 'takao-mountain');
    expect(quote.blockedReason).toBeNull();
    expect(quote.fare).toBe(260);
    expect(quote.minutes).toBeGreaterThanOrEqual(25);
    expect(quote.rides.some(r => r.toStopId === 'takao-mountain')).toBe(true);
  });

  it('provides all 5 recreational activities with balanced effects', () => {
    const venue = venues.find(v => v.locationId === 'takao-mountain');
    expect(venue).toBeDefined();
    expect(venue!.opens).toBe(6 * 60);
    expect(venue!.closes).toBe(21 * 60);

    const services = ['takao-hiking', 'takao-observation', 'takao-onsen', 'takao-teahouse', 'takao-cablecar'];
    for (const serviceId of services) {
      const catalogItem = locationServiceCatalog.find(s => s.id === serviceId);
      expect(catalogItem).toBeDefined();
      expect(catalogItem!.locationIds).toContain('takao-mountain');
    }

    // 1. Hiking (free, consumes energy, recovers health/morale, greatly drops stress)
    const baseState = createInitialState();
    baseState.locationId = 'takao-mountain';
    baseState.scene = { areaId: 'takao-mountain', x: 0, z: -175, yaw: 0, seed: 'takao-test', encounterId: null };
    baseState.clock = { day: 1, hour: 10, minute: 0 };
    baseState.player = { ...baseState.player, energy: 60, health: 60, stress: 50, morale: 50, balance: 20000 };

    const hikeQuote = getLocationServiceQuote(baseState, 'takao-hiking');
    expect(hikeQuote.blockedReason).toBeNull();
    expect(hikeQuote.price).toBe(0);
    expect(hikeQuote.playerAfter.stress).toBeLessThan(baseState.player.stress);
    expect(hikeQuote.playerAfter.morale).toBeGreaterThan(baseState.player.morale);
    expect(hikeQuote.playerAfter.health).toBeGreaterThan(baseState.player.health);

    const hikeExecuted = reduceState(baseState, { type: 'location_service', serviceId: 'takao-hiking' });
    expect(hikeExecuted.journal.at(-1)?.text).toContain('登山步道健行');
    expect(hikeExecuted.player.stress).toBe(15); // 50 - 35
    expect(hikeExecuted.player.health).toBe(68); // 60 + 8

    // 2. Observation deck (free, scenic relaxation)
    const viewQuote = getLocationServiceQuote(baseState, 'takao-observation');
    expect(viewQuote.blockedReason).toBeNull();
    expect(viewQuote.price).toBe(0);
    const viewExecuted = reduceState(baseState, { type: 'location_service', serviceId: 'takao-observation' });
    expect(viewExecuted.player.morale).toBe(65); // 50 + 15
    expect(viewExecuted.player.stress).toBe(30); // 50 - 20

    // 3. Hot spring onsen (costs 850, recovers energy/health/morale, greatly drops stress)
    const onsenQuote = getLocationServiceQuote(baseState, 'takao-onsen');
    expect(onsenQuote.blockedReason).toBeNull();
    expect(onsenQuote.price).toBe(850);
    const onsenExecuted = reduceState(baseState, { type: 'location_service', serviceId: 'takao-onsen' });
    expect(onsenExecuted.player.balance).toBe(20000 - 850);
    expect(onsenExecuted.player.health).toBe(85); // 60 + 25
    expect(onsenExecuted.player.stress).toBe(10); // 50 - 40
    expect(onsenExecuted.player.energy).toBe(95); // 60 + 35

    // 4. Teahouse (costs 460, replenishes satiety and foodEnergy)
    const teaExecuted = reduceState(baseState, { type: 'location_service', serviceId: 'takao-teahouse' });
    expect(teaExecuted.player.balance).toBe(20000 - 460);
    expect(teaExecuted.player.satiety).toBeGreaterThan(baseState.player.satiety);
    expect(teaExecuted.player.foodEnergy).toBeGreaterThan(baseState.player.foodEnergy);

    // 5. Cable car (costs 490, sightseeing)
    const cableExecuted = reduceState(baseState, { type: 'location_service', serviceId: 'takao-cablecar' });
    expect(cableExecuted.player.balance).toBe(20000 - 490);
    expect(cableExecuted.player.morale).toBe(60); // 50 + 10
  });

  it('validates interior facilities and room interactions', () => {
    const onsen = campusInteriors.find(r => r.id === 'takao-onsen')!;
    expect(onsen.interactions.some(i => i.id === 'onsen-relax')).toBe(true);
    expect(onsen.interactions.some(i => i.id === 'onsen-footbath')).toBe(true);

    const summit = campusInteriors.find(r => r.id === 'takao-summit')!;
    expect(summit.interactions.some(i => i.id === 'summit-view')).toBe(true);

    const teahouse = campusInteriors.find(r => r.id === 'takao-teahouse')!;
    expect(teahouse.interactions.some(i => i.id === 'teahouse-snack')).toBe(true);
  });

  it('contains valid worldbook lore and no japanese characters', () => {
    expect(rawTakaoWorldbook.name).toContain('高尾山');
    expect(rawTakaoWorldbook.entries.length).toBe(3);
    const content = rawTakaoWorldbook.entries.map(e => e.content).join('\n');
    expect(content).toContain('高尾山');
    expect(content).toContain('极乐汤');
    expect(content).toContain('十一丁目茶屋');
    expect(content).toContain('599米');
    // Ensure no Japanese kana
    expect(content).not.toMatch(/[\u3040-\u309F\u30A0-\u30FF]/);
  });
});
