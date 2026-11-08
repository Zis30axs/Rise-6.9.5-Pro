import { describe, expect, it } from 'vitest';
import { districtMapPlaces, locationDistrict, mapDistricts } from '../src/frontend/map-districts';
import { mapLocationPoint } from '../src/frontend/campus-map-layout';
import { projectOldTokyoPosition, tokyoDistrictBounds, tokyoLocationPosition } from '../src/frontend/tokyo-sandbox-map';
import { switchEndpoint } from '../src/frontend/protagonist-switch';
import { createInitialState, getNovelTravelQuote, parseState, reduceState } from '../src/runtime/model';
import { isCaliforniaLocalLocation } from '../src/runtime/california';
import { enableProtagonists } from '../src/runtime/protagonist-world';
import * as THREE from 'three';
import { attachAirportGeometry } from '../src/frontend/airport-sandbox-geometry';
import { disposeThreeTree } from '../src/frontend/dispose-three-tree';

describe('airport sandtable and existing travel', () => {
  it('reserves the airport footprint without removing existing city buildings or distant skyline', () => {
    const root = new THREE.Group();
    const skyline = new THREE.InstancedMesh(new THREE.BoxGeometry(20, 40, 20), new THREE.MeshStandardMaterial(), 3);
    const original = [new THREE.Matrix4().makeTranslation(-80, 20, 290),
      new THREE.Matrix4().makeTranslation(-80, 20, 170), new THREE.Matrix4().makeTranslation(350, 20, 290)];
    original.forEach((matrix, index) => skyline.setMatrixAt(index, matrix));
    root.add(skyline);
    attachAirportGeometry(root);
    const matrix = new THREE.Matrix4();
    skyline.getMatrixAt(0, matrix);
    expect(matrix.determinant()).toBe(0);
    for (const index of [1, 2]) {
      skyline.getMatrixAt(index, matrix);
      expect(matrix.equals(original[index]!)).toBe(true);
    }
    disposeThreeTree(root);
  });

  it('keeps the runway above the existing ground slab and clear of the terminal', () => {
    const root = new THREE.Group();
    attachAirportGeometry(root);
    root.updateMatrixWorld(true);
    const runway = new THREE.Box3().setFromObject(root.getObjectByName('airport-runway')!);
    const terminal = new THREE.Box3().setFromObject(root.getObjectByName('airport-terminal')!);
    expect(runway.min.y).toBeGreaterThan(0);
    expect(runway.intersectsBox(terminal)).toBe(false);
    const bounds = tokyoDistrictBounds('haneda-airport');
    expect(runway.min.x).toBeGreaterThan(bounds.minX);
    expect(runway.max.x).toBeLessThan(bounds.maxX);
    expect(runway.min.z).toBeGreaterThan(bounds.minZ);
    expect(runway.max.z).toBeLessThan(bounds.maxZ);
    disposeThreeTree(root);
  });

  it('owns the existing terminal and keeps overseas locations off the Tokyo districts', () => {
    expect(locationDistrict('haneda-airport')).toBe('haneda-airport');
    expect(districtMapPlaces('haneda-airport').map(place => place.id)).toEqual(['haneda-airport']);
    expect(districtMapPlaces('campus').some(place => place.id === 'haneda-airport')).toBe(false);
    for (const district of mapDistricts) {
      expect(districtMapPlaces(district.id).some(place => isCaliforniaLocalLocation(place.id))).toBe(false);
    }
  });

  it('projects old saves and the protagonist switch to the same terminal without changing the save', () => {
    const start = enableProtagonists(createInitialState());
    const stop = reduceState(start, { type: 'novel_travel', locationId: 'bus-stop' });
    const airport = reduceState(stop, { type: 'novel_travel', locationId: 'haneda-airport' });
    const loaded = parseState(JSON.parse(JSON.stringify(airport)));
    const before = JSON.stringify(loaded);
    const pin = tokyoLocationPosition(loaded.locationId)!;
    const bounds = tokyoDistrictBounds('haneda-airport');
    expect(pin.x).toBeGreaterThan(bounds.minX);
    expect(pin.x).toBeLessThan(bounds.maxX);
    expect(pin.z).toBeGreaterThan(bounds.minZ);
    expect(pin.z).toBeLessThan(bounds.maxZ);
    expect(projectOldTokyoPosition(mapLocationPoint(loaded.locationId)!)).toEqual(pin);
    expect(projectOldTokyoPosition(switchEndpoint(loaded, 'soyo').mapAnchor)).toEqual(pin);
    expect(JSON.stringify(loaded)).toBe(before);
    expect(loaded.scene).toBeNull();
    expect(loaded.player.balance).toBe(stop.player.balance - 1200);
    expect(getNovelTravelQuote(loaded, 'bus-stop')).toMatchObject({ minutes: 50, fare: 1200, blockedReason: null });
    expect(getNovelTravelQuote(loaded, 'sfo-airport')).toMatchObject({ minutes: 600, fare: 48000 });
    expect(getNovelTravelQuote(start, 'haneda-airport').blockedReason).toBeTruthy();
  });
});
