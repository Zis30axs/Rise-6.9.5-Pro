import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { projectOldTokyoPosition, tokyoDistricts, tokyoLocationPosition, tokyoCityBounds } from '../src/frontend/tokyo-sandbox-map';
import { mapDistricts } from '../src/frontend/map-districts';

describe('Tokyo GLB scenic-coordinate migration', () => {
  it('maps each legacy district anchor onto the corresponding new map anchor', () => {
    for (const former of mapDistricts) {
      const current = tokyoDistricts.find(d => d.id === former.id)!;
      const mapped = projectOldTokyoPosition({ x: former.x, z: former.z });
      expect(mapped.x).toBeCloseTo(current.x, 5);
      expect(mapped.z).toBeCloseTo(current.z, 5);
    }
  });
  it('prioritizes exact landmark positions and supports 8 district boundaries', () => {
    expect(tokyoLocationPosition('library')).toEqual({ x: 0, z: -6 });
    expect(tokyoDistricts).toHaveLength(8);
    expect(tokyoCityBounds.minX).toBeLessThan(0);
    expect(tokyoCityBounds.maxX).toBeGreaterThan(200);
  });
  it('retires old maps from the real map and protagonist switching entrypoints', () => {
    for (const file of ['WorldMap.vue', 'ProtagonistSwitchOverlay.vue']) {
      const text = readFileSync('src/frontend/' + file, 'utf8');
      expect(text).toContain('CitySandboxScene');
      expect(text).not.toContain('<CampusMapScene');
      expect(text).not.toContain('<LocalMapGeometry');
    }
  });
});
