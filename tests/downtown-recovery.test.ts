import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createInitialState, getNovelTravelQuote, parseState, reduceState } from '../src/runtime/model';
import { transitStops, getTransitRoutes, selectTravelVehicle } from '../src/runtime/transit';
import { sceneLandmarks } from '../src/frontend/scene-layout';
import { getSceneArea } from '../src/runtime/scene-context';
import { getCampusInterior } from '../src/runtime/campus-interiors';
import { createCampusWorld } from '../src/frontend/scene-world';
import { isScenePositionWalkable } from '../src/frontend/scene-movement';
import { getNovelBackground } from '../src/frontend/novel-backgrounds';
import { mapBuildings, mapLocationPoint, mapDistrictLabels, createCampusMapProjection } from '../src/frontend/campus-map-layout';

describe('downtown recovery: real state, map and novel mode', () => {
  it('only ZBD-04A serves downtown, with a premium fare and a real return route', () => {
    expect(getTransitRoutes('campus').map(item => item.stop.id)).not.toContain('downtown');
    expect(getTransitRoutes('campus', 'zbd04a').find(item => item.stop.id === 'downtown')).toMatchObject({ minutes: 55, fare: 12 });
    expect(getTransitRoutes('downtown')).toEqual([]);
    expect(getTransitRoutes('downtown', 'zbd04a')).toMatchObject([{ stop: { id: 'campus' }, minutes: 55, fare: 12 }]);
    const campus = transitStops.find(item => item.id === 'campus')!;
    const initial = reduceState(createInitialState(), { type: 'walk', x: campus.x, z: campus.z, yaw: campus.yaw, seed: 'city-recovery' });
    const original = JSON.stringify(initial);
    expect(() => reduceState(initial, { type: 'ride_transit', vehicleId: 'btr82a', stopId: 'downtown' })).toThrow();
    const arrived = reduceState(initial, { type: 'ride_transit', vehicleId: 'zbd04a', stopId: 'downtown' });
    expect(arrived.locationId).toBe('downtown');
    expect(arrived.scene).toMatchObject({ areaId: 'downtown', x: -20, z: 185 });
    expect(arrived.player.balance).toBe(initial.player.balance - 12);
    expect(arrived.transit.lastRide).toMatchObject({ fromStopId: 'campus', toStopId: 'downtown', fare: 12, vehicleId: 'zbd04a' });
    expect(() => reduceState(arrived, { type: 'ride_transit', vehicleId: 'btr82a', stopId: 'campus' })).toThrow();
    const returned = reduceState(arrived, { type: 'ride_transit', vehicleId: 'zbd04a', stopId: 'campus' });
    expect(returned.locationId).toBe('bus-stop');
    expect(returned.player.balance).toBe(initial.player.balance - 24);
    expect(JSON.stringify(initial)).toBe(original);
    expect(parseState(JSON.parse(JSON.stringify(arrived)))).toEqual(arrived);
  });

  it('enters Toyokawa residence after a single valid bus journey, never a free teleport', () => {
    const state = createInitialState();
    expect(selectTravelVehicle('gate', 'downtown')).toBe('zbd04a');
    expect(selectTravelVehicle('toyokawa-house', 'library')).toBe('zbd04a');
    expect(selectTravelVehicle('gate', 'downtown', 'btr82a')).toBe('btr82a');
    const quote = getNovelTravelQuote(state, 'toyokawa-house');
    expect(quote.blockedReason).toBeNull();
    expect(quote.fare).toBe(12);
    expect(quote.rides).toMatchObject([{ toStopId: 'downtown', fare: 12, vehicleId: 'zbd04a' }]);
    expect(getNovelTravelQuote(state, 'toyokawa-house', 'btr82a').blockedReason).toBeTruthy();
    const inside = reduceState(state, { type: 'novel_travel', locationId: 'toyokawa-house' });
    expect(inside.locationId).toBe('toyokawa-house');
    expect(inside.interior?.roomId).toBe('toyokawa-house');
    expect(inside.player.balance).toBe(state.player.balance - quote.fare);
    expect(parseState(JSON.parse(JSON.stringify(inside)))).toEqual(inside);
    const exited = reduceState(inside, { type: 'novel_travel', locationId: 'downtown' });
    expect(exited.locationId).toBe('downtown');
    expect(exited.interior).toBeNull();
    expect(exited.player.balance).toBe(inside.player.balance);
    expect(getNovelTravelQuote(exited, 'library').fare).toBe(12);
  });

  it('shares walkable geometry, district pins and the household entrance across modes', () => {
    const stop = transitStops.find(item => item.id === 'downtown')!;
    const house = getCampusInterior('toyokawa-house')!;
    const world = createCampusWorld(new THREE.Scene());
    try {
      expect(getSceneArea(stop.x, stop.z)?.id).toBe('downtown');
      expect(getSceneArea(house.entrance.x, house.entrance.z)?.id).toBe('downtown');
      expect(sceneLandmarks.some(item => item.id === 'downtown')).toBe(true);
      expect(mapLocationPoint('toyokawa-house')).toEqual(house.entrance);
      expect(mapBuildings.some(item => item.id === 'building:toyokawa-residence')).toBe(true);
      expect(isScenePositionWalkable(stop.x, stop.z, world.movementWorld)).toBe(true);
      expect(isScenePositionWalkable(house.entrance.x, house.entrance.z, world.movementWorld)).toBe(true);
      const projection = createCampusMapProjection(240, 170, 0, 'city');
      const labels = mapDistrictLabels(transitStops.map(item => ({ id: item.id, anchor: projection.project(item.x, item.z) })), 240, 170);
      expect(labels).toHaveLength(5);
      for (const [index, first] of labels.entries()) for (const second of labels.slice(index + 1)) {
        expect(Math.abs(first.label.x - second.label.x) >= 104 || Math.abs(first.label.y - second.label.y) >= 44).toBe(true);
      }
    } finally { world.dispose(); }
  });

  it('provides real bundled day, sunset, night variants for downtown without network assets', () => {
    const images = [10, 18, 22].map(hour => getNovelBackground('downtown', hour));
    expect(images.map(item => item.id)).toEqual(['commercial-day', 'commercial-dusk', 'commercial-night']);
    expect(new Set(images.map(item => item.src)).size).toBe(3);
    expect(getNovelBackground('toyokawa-house', 22).phase).toBe('night');
  });
});
