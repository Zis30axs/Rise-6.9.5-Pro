import { describe, expect, it } from 'vitest';
import sandbox from '../assets/models/unread-city-california-sandbox-data.json';
import {
  californiaPlaces, internationalLeg, PRO200_CLAIM_SERVICE_ID, PRO200_RESELL_SERVICE_ID,
} from '../src/runtime/california';

describe('offline California sandbox metadata', () => {
  const districtIds = new Set(sandbox.districts.map(district => district.id));
  const landmarkIds = new Set(sandbox.landmarks.map(landmark => landmark.id));
  const placeById = new Map(californiaPlaces.map(place => [place.id, place]));

  it('keeps eight scenic regions for the whole state', () => {
    expect(sandbox.districts).toHaveLength(8);
    expect(districtIds.size).toBe(8);
    for (const id of ['bay-area', 'north-coast', 'sacramento-valley', 'sierra-nevada',
      'central-valley', 'central-coast', 'southern-california', 'desert']) {
      expect(districtIds.has(id)).toBe(true);
    }
    for (const district of sandbox.districts) {
      expect(district.minX).toBeLessThan(district.maxX);
      expect(district.minZ).toBeLessThan(district.maxZ);
      expect(Number.isFinite(district.color)).toBe(true);
    }
  });

  it('mirrors the runtime place list except the Tokyo departure airport', () => {
    expect(sandbox.landmarks).toHaveLength(13);
    expect(landmarkIds.size).toBe(13);
    expect(landmarkIds.has('haneda-airport')).toBe(false);
    for (const place of californiaPlaces) {
      if (place.id === 'haneda-airport') continue;
      const landmark = sandbox.landmarks.find(item => item.id === place.id)!;
      expect(landmark).toBeDefined();
      expect(landmark.name).toBe(place.name);
      expect(landmark.subtitle).toBe(place.subtitle);
      expect(landmark.desc).toBe(place.description);
      expect(districtIds.has(landmark.district)).toBe(true);
      const district = sandbox.districts.find(item => item.id === landmark.district)!;
      expect(landmark.x).toBeGreaterThanOrEqual(district.minX);
      expect(landmark.x).toBeLessThanOrEqual(district.maxX);
      expect(landmark.z).toBeGreaterThanOrEqual(district.minZ);
      expect(landmark.z).toBeLessThanOrEqual(district.maxZ);
    }
    expect(placeById.size).toBe(14);
  });

  it('gives every landmark at least one service in the Tokyo shape', () => {
    for (const landmark of sandbox.landmarks) {
      expect(landmark.services.length).toBeGreaterThanOrEqual(1);
      for (const service of landmark.services) {
        expect(Object.keys(service).sort()).toEqual(
          ['energyDelta', 'id', 'label', 'minutes', 'moraleDelta', 'price', 'result', 'stressDelta']);
        expect(service.minutes).toBeGreaterThan(0);
        expect(service.price).toBe(0);
      }
    }
    const openai = sandbox.landmarks.find(item => item.id === 'california-openai')!;
    expect(openai.services.some(service => service.id === PRO200_CLAIM_SERVICE_ID)).toBe(true);
    const market = sandbox.landmarks.find(item => item.id === 'california-market')!;
    expect(market.services.some(service => service.id === PRO200_RESELL_SERVICE_ID)).toBe(true);
  });

  it('keeps buildings, roads, routes and mountains consistent with the places', () => {
    expect(new Set(sandbox.buildings.map(building => building.id)).size)
      .toBe(sandbox.buildings.length);
    expect(sandbox.buildings.length).toBeGreaterThan(0);
    for (const building of sandbox.buildings) {
      const placeId = building.id.split(':')[1];
      expect(landmarkIds.has(placeId)).toBe(true);
      expect(building.height).toBeGreaterThan(0);
      expect(building.width).toBeGreaterThan(0);
      expect(building.depth).toBeGreaterThan(0);
    }
    expect(sandbox.roads.length).toBeGreaterThan(0);
    for (const road of sandbox.roads) {
      expect(['road', 'walk']).toContain(road.kind);
    }
    expect(sandbox.routes).toHaveLength(14);
    for (const route of sandbox.routes) {
      expect(landmarkIds.has(route.from)).toBe(true);
      expect(landmarkIds.has(route.to)).toBe(true);
      expect(route.points.length).toBeGreaterThanOrEqual(2);
      const leg = internationalLeg(route.from, route.to)!;
      expect(leg).not.toBeNull();
      expect(leg.minutes).toBe(route.minutes);
      expect(leg.fare).toBe(route.fare);
      expect(leg.method).toBe(route.method);
      const from = sandbox.landmarks.find(item => item.id === route.from)!;
      const to = sandbox.landmarks.find(item => item.id === route.to)!;
      expect(Math.hypot(route.points[0].x - from.x, route.points[0].z - from.z)).toBeLessThan(1);
      expect(Math.hypot(route.points.at(-1)!.x - to.x, route.points.at(-1)!.z - to.z)).toBeLessThan(1);
    }
    expect(sandbox.mountains).toHaveLength(6);
    const whitney = sandbox.mountains.find(mountain => mountain.id === 'mount-whitney')!;
    expect(whitney.height).toBe(
      Math.max(...sandbox.mountains.map(mountain => mountain.height)));
    expect(sandbox.characters).toHaveLength(0);
  });

  it('adds four recognizable landmark structures with downtown towers', () => {
    const structures = sandbox.buildings.filter(
      building => (building as { kind?: string }).kind === 'landmark');
    expect(structures).toHaveLength(4);
    const ids = new Set(structures.map(
      building => (building as { landmarkId: string }).landmarkId));
    for (const id of ['golden-gate', 'hollywood-sign', 'transamerica', 'griffith']) {
      expect(ids.has(id)).toBe(true);
    }
    for (const building of structures) {
      const entry = building as { landmarkId: string; desc: string };
      expect(building.name.length).toBeGreaterThan(0);
      expect(entry.desc.length).toBeGreaterThan(0);
      const placeId = building.id.split(':')[1];
      expect(landmarkIds.has(placeId)).toBe(true);
      const place = sandbox.landmarks.find(item => item.id === placeId)!;
      const district = sandbox.districts.find(item => item.id === place.district)!;
      expect(building.x).toBeGreaterThanOrEqual(district.minX);
      expect(building.x).toBeLessThanOrEqual(district.maxX);
      expect(building.z).toBeGreaterThanOrEqual(district.minZ);
      expect(building.z).toBeLessThanOrEqual(district.maxZ);
    }
    // Denser cities: v1 had 60 buildings; v2 has 166 city boxes + 4 landmarks.
    expect(sandbox.buildings.length).toBeGreaterThanOrEqual(150);
    const marketTowers = sandbox.buildings.filter(
      building => building.id.startsWith('building:california-market:'));
    expect(Math.max(...marketTowers.map(building => building.height))).toBeGreaterThanOrEqual(12);
    const laTowers = sandbox.buildings.filter(
      building => building.id.startsWith('building:california-los-angeles:'));
    expect(Math.max(...laTowers.map(building => building.height))).toBeGreaterThanOrEqual(12);
  });

  it('documents the lat/lon projection the generator uses', () => {
    expect(sandbox.projection.type).toBe('equirectangular');
    expect(sandbox.projection.lonCenter).toBe(-119.25);
    expect(sandbox.projection.latCenter).toBe(37.25);
    expect(sandbox.projection.unitsPerDegreeLat).toBeGreaterThan(0);
    expect(sandbox.projection.unitsPerDegreeLon).toBeGreaterThan(0);
  });
});
