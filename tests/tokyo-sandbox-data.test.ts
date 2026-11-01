import { describe, expect, it } from 'vitest';
import sandbox from '../assets/models/unread-city-tokyo-sandbox-data.json';
import { MAP_DISTRICT_IDS } from '../src/frontend/map-districts';

describe('offline Tokyo sandbox metadata', () => {
  const districtIds = new Set(sandbox.districts.map(district => district.id));
  const landmarkIds = new Set(sandbox.landmarks.map(landmark => landmark.id));

  it('keeps eight scenic districts while retaining supported game districts', () => {
    expect(sandbox.districts).toHaveLength(8);
    expect(districtIds.size).toBe(8);
    expect(districtIds.has('market-district')).toBe(true);
    for (const id of MAP_DISTRICT_IDS) expect(districtIds.has(id)).toBe(true);
  });

  it('has valid landmarks, building IDs and roads', () => {
    expect(sandbox.landmarks).toHaveLength(23);
    expect(landmarkIds.size).toBe(23);
    expect(new Set(sandbox.buildings.map(building => building.id)).size).toBe(48);
    expect(sandbox.roads).toHaveLength(44);
    for (const landmark of sandbox.landmarks) {
      expect(districtIds.has(landmark.district)).toBe(true);
      expect(Number.isFinite(landmark.x) && Number.isFinite(landmark.z)).toBe(true);
    }
  });

  it('does not treat descriptive character locations as authoritative NPC presence', () => {
    expect(sandbox.characters).toHaveLength(44);
    expect(new Set(sandbox.characters.map(character => character.id)).size).toBe(44);
    for (const character of sandbox.characters) {
      expect(landmarkIds.has(character.dayLocationId)).toBe(true);
      expect(landmarkIds.has(character.nightLocationId)).toBe(true);
      expect(character.homeRoomId.length).toBeGreaterThan(0);
    }
  });
});
