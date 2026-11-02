import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { projectOldTokyoPosition, tokyoDistricts, tokyoLandmarks, tokyoLocationPosition, tokyoCityBounds } from '../src/frontend/tokyo-sandbox-map';
import { mapLocationPoint } from '../src/frontend/campus-map-layout';
import { mapDistricts } from '../src/frontend/map-districts';
import sandboxData from '../assets/models/unread-city-tokyo-sandbox-data.json';

describe('Tokyo GLB scenic-coordinate migration', () => {
  it('maps each legacy district anchor onto the corresponding new map anchor', () => {
    for (const former of mapDistricts) {
      const current = tokyoDistricts.find(d => d.id === former.id)!;
      const mapped = projectOldTokyoPosition({ x: former.x, z: former.z });
      expect(mapped.x).toBeCloseTo(current.x, 5);
      expect(mapped.z).toBeCloseTo(current.z, 5);
    }
  });
  it('projects unmigrated campus landmarks onto the new buildings and keeps authored ones', () => {
    const library = tokyoLocationPosition('library');
    const oldLibrary = mapLocationPoint('library')!;
    expect(library).toEqual(projectOldTokyoPosition(oldLibrary));
    expect(library).not.toEqual(oldLibrary);
    const building = sandboxData.buildings.find(item => item.name.includes('图书馆'))!;
    const distance = (point: { x: number; z: number }) => Math.hypot(point.x - building.x, point.z - building.z);
    expect(distance(library!)).toBeLessThan(distance(oldLibrary));
    expect(tokyoLocationPosition('courthouse')).toEqual({ x: -38, z: 94 });
    for (const landmark of tokyoLandmarks) {
      const old = mapLocationPoint(landmark.id);
      const presented = tokyoLocationPosition(landmark.id);
      const copied = !!old && Math.abs(old.x - landmark.x) < 0.6 && Math.abs(old.z - landmark.z) < 0.6;
      if (copied) expect(presented).toEqual(projectOldTokyoPosition(old!));
      else expect(presented).toEqual({ x: landmark.x, z: landmark.z });
    }
    expect(tokyoDistricts).toHaveLength(9);
    expect(tokyoCityBounds.minX).toBeLessThan(0);
    expect(tokyoCityBounds.maxX).toBeGreaterThan(200);
  });
  it('retires old maps from the real map and protagonist switching entrypoints', () => {
    for (const file of ['WorldMap.vue', 'ProtagonistSwitchOverlay.vue']) {
      const text = readFileSync('src/frontend/' + file, 'utf8');
      expect(text).toContain('CitySandboxScene');
      expect(text).not.toContain('<CampusMapScene');
      expect(text).not.toContain('<LocalMapGeometry');
      expect(text).not.toContain(':preview-only="true"');
    }
  });
});
