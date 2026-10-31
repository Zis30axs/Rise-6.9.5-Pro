import { describe, expect, it } from 'vitest';
import { campusInteriors } from '../src/runtime/campus-interiors';
import { createCampusMapProjection, mapLocationPoint, visibleMapBuildings } from '../src/frontend/campus-map-layout';
import { districtBounds, districtMapPlaces, locationDistrict, MAP_DISTRICT_IDS } from '../src/frontend/map-districts';

describe('district sandtables', () => {
  it('assigns every existing room to its outdoor parent and contains its entrance', () => {
    for (const room of campusInteriors) {
      const district = locationDistrict(room.id), bounds = districtBounds(district);
      expect(district).toBe(locationDistrict(room.parentLocationId));
      // The new courthouse is one navigable exterior marker: the public room
      // is entered from its door, never exposed as a duplicate map destination.
      const destination = room.id === 'court-hearing' ? 'courthouse' : room.id;
      expect(districtMapPlaces(district).some(place => place.id === destination)).toBe(true);
      expect(room.entrance.x).toBeGreaterThanOrEqual(bounds.minX); expect(room.entrance.x).toBeLessThanOrEqual(bounds.maxX);
      expect(room.entrance.z).toBeGreaterThanOrEqual(bounds.minZ); expect(room.entrance.z).toBeLessThanOrEqual(bounds.maxZ);
    }
  });

  it('gives each district its own places, with no campus destinations in other districts', () => {
    for (const id of MAP_DISTRICT_IDS) {
      const places = districtMapPlaces(id);
      expect(places.length).toBeGreaterThan(0);
      expect(places.every(place => locationDistrict(place.id) === id)).toBe(true);
      if (id !== 'campus') expect(places.some(place => place.id === 'library')).toBe(false);
    }
    expect(visibleMapBuildings('home').some(building => building.id === 'building:home-apartment')).toBe(true);
    expect(visibleMapBuildings('commercial').some(building => building.id === 'building:home-apartment')).toBe(false);
  });

  it('centers the shared city geometry on the actual source or destination', () => {
    for (const id of ['emma-yuki-home', 'toyokawa-house', 'library']) {
      const center = mapLocationPoint(id)!;
      const view = createCampusMapProjection(390, 844, 0, 'city', { center, zoom: 3, overhead: 1 });
      const projected = view.project(center.x, center.z);
      expect(projected.x).toBeCloseTo(195, 8);
      expect(projected.y).toBeCloseTo(422, 8);
      expect(Number.isFinite(view.metersPerPixel)).toBe(true);
    }
  });
});
