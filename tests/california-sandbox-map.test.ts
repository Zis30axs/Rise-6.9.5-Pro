import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  CALIFORNIA_PIN_ELEVATION, californiaDistrictBounds, californiaDistricts,
  californiaLandmarks, californiaLandmarkStructures, californiaLocationPosition, californiaRoutePoints,
  californiaStateBounds, californiaSummit, projectCaliforniaLatLon,
} from '../src/frontend/california-sandbox-map';

describe('California GLB scenic coordinates', () => {
  it('resolves every California place to its landmark and leaves Haneda off this map', () => {
    for (const landmark of californiaLandmarks) {
      expect(californiaLocationPosition(landmark.id)).toEqual({ x: landmark.x, z: landmark.z });
    }
    expect(californiaLocationPosition('haneda-airport')).toBeUndefined();
    expect(californiaLocationPosition('nowhere')).toBeUndefined();
    expect(CALIFORNIA_PIN_ELEVATION).toBe(8);
  });

  it('projects real lat/lon onto the model plane the generator uses', () => {
    expect(projectCaliforniaLatLon(37.25, -119.25)).toEqual({ x: 0, z: 0 });
    // SFO: 37.6213, -122.3790 — must land on its landmark.
    const sfo = projectCaliforniaLatLon(37.6213, -122.3790);
    const landmark = californiaLandmarks.find(item => item.id === 'sfo-airport')!;
    expect(sfo.x).toBeCloseTo(landmark.x, 0);
    expect(sfo.z).toBeCloseTo(landmark.z, 0);
    // North is -z, east is +x.
    expect(projectCaliforniaLatLon(40, -122).z).toBeLessThan(projectCaliforniaLatLon(34, -122).z);
    expect(projectCaliforniaLatLon(37, -118).x).toBeGreaterThan(projectCaliforniaLatLon(37, -122).x);
  });

  it('covers every landmark with the state bounds and its own region', () => {
    expect(californiaStateBounds.minX).toBeLessThan(-190);
    expect(californiaStateBounds.maxX).toBeGreaterThan(190);
    expect(californiaStateBounds.minZ).toBeLessThan(-230);
    expect(californiaStateBounds.maxZ).toBeGreaterThan(230);
    expect(californiaDistrictBounds('state')).toEqual(californiaStateBounds);
    for (const landmark of californiaLandmarks) {
      const district = californiaDistricts.find(item => item.id === landmark.district)!;
      expect(landmark.x).toBeGreaterThanOrEqual(district.minX);
      expect(landmark.x).toBeLessThanOrEqual(district.maxX);
      expect(landmark.z).toBeGreaterThanOrEqual(district.minZ);
      expect(landmark.z).toBeLessThanOrEqual(district.maxZ);
    }
    expect(californiaDistricts).toHaveLength(8);
  });

  it('returns route waypoints in travel order and reverses them on the way back', () => {
    const outward = californiaRoutePoints('sfo-airport', 'california-sacramento')!;
    expect(outward.length).toBeGreaterThanOrEqual(2);
    const sfo = californiaLocationPosition('sfo-airport')!;
    const sacramento = californiaLocationPosition('california-sacramento')!;
    expect(Math.hypot(outward[0].x - sfo.x, outward[0].z - sfo.z)).toBeLessThan(1);
    expect(Math.hypot(outward.at(-1)!.x - sacramento.x, outward.at(-1)!.z - sacramento.z)).toBeLessThan(1);
    const inward = californiaRoutePoints('california-sacramento', 'sfo-airport')!;
    expect(inward).toEqual([...outward].reverse());
    expect(californiaRoutePoints('sfo-airport', 'california-san-diego')).toBeUndefined();
  });

  it('fits the camera on Mt. Whitney, the highest peak', () => {
    const summit = californiaSummit();
    expect(summit.y).toBe(44);
    const sierra = californiaDistrictBounds('sierra-nevada');
    expect(summit.x).toBeGreaterThanOrEqual(sierra.minX);
    expect(summit.x).toBeLessThanOrEqual(sierra.maxX);
    expect(summit.z).toBeGreaterThanOrEqual(sierra.minZ);
    expect(summit.z).toBeLessThanOrEqual(sierra.maxZ);
  });

  it('exposes the four landmark structures for the scene', () => {
    expect(californiaLandmarkStructures).toHaveLength(4);
    const ids = new Set(californiaLandmarkStructures.map(structure => structure.landmarkId));
    for (const id of ['golden-gate', 'hollywood-sign', 'transamerica', 'griffith']) {
      expect(ids.has(id)).toBe(true);
    }
    for (const structure of californiaLandmarkStructures) {
      expect(structure.name.length).toBeGreaterThan(0);
      expect(structure.desc.length).toBeGreaterThan(0);
      expect(structure.x).toBeGreaterThanOrEqual(californiaStateBounds.minX);
      expect(structure.x).toBeLessThanOrEqual(californiaStateBounds.maxX);
      expect(structure.z).toBeGreaterThanOrEqual(californiaStateBounds.minZ);
      expect(structure.z).toBeLessThanOrEqual(californiaStateBounds.maxZ);
    }
  });

  it('wires the 3D scene into the world map instead of the old flat list', () => {
    const map = readFileSync('src/frontend/WorldMap.vue', 'utf8');
    expect(map).toContain('CaliforniaSandboxScene');
    expect(map).toContain('isCaliforniaLocalLocation(model.state.locationId)');
    expect(map).toContain(':places="californiaPlaces"');
    expect(map).toContain('@travel="travelTo"');
    const scene = readFileSync('src/frontend/CaliforniaSandboxScene.vue', 'utf8');
    expect(scene).toContain('CALIFORNIA_PIN_ELEVATION');
    expect(scene).toContain('california-sandbox-pin');
    expect(scene).toContain("emit('travel'");
  });
});
