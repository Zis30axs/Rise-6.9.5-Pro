import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createCampusMapProjection, districtChipMetrics, mapDistrictLabels, placeDistrictChips, screenBuildingBoxes, separatePoints, visibleMapBuildings } from '../src/frontend/campus-map-layout';
import { applySandboxFrame } from '../src/frontend/sandbox-camera';
import { createCampusWorld } from '../src/frontend/scene-world';
import {
  buildingFootprint, cityDistrictAt, cityGrove, sceneBounds, takaoElevation, takaoPeak, worldBuildings,
} from '../src/frontend/world-layout';
import { mapDistricts } from '../src/frontend/map-districts';

describe('shared city layout', () => {
  it('keeps every building, including the Takao summit, inside the walkable bounds', () => {
    for (const building of worldBuildings) {
      const footprint = buildingFootprint(building);
      expect(footprint.minX).toBeGreaterThanOrEqual(sceneBounds.minX);
      expect(footprint.maxX).toBeLessThanOrEqual(sceneBounds.maxX);
      expect(footprint.minZ).toBeGreaterThanOrEqual(sceneBounds.minZ);
      expect(footprint.maxZ).toBeLessThanOrEqual(sceneBounds.maxZ);
    }
    const summit = worldBuildings.find(building => building.id === 'building:takao-summit')!;
    const footprint = buildingFootprint(summit);
    expect(footprint.minZ).toBeLessThan(-220);
    expect(takaoPeak.z - takaoPeak.radius).toBeGreaterThanOrEqual(sceneBounds.minZ);
    expect(takaoElevation(summit.x, summit.z)).toBeGreaterThan(takaoElevation(-25, -155));
    expect(takaoElevation(400, 400)).toBe(0);
  });

  it('names the district under a point and keeps grove trees off footprints', () => {
    expect(cityDistrictAt(0, -10)).toBe('campus');
    expect(cityDistrictAt(25, -215)).toBe('takao-mountain');
    expect(cityDistrictAt(-180, 150)).toBe('home');
    expect(cityDistrictAt(0, 48)).toBe('campus');
    const trees = cityGrove();
    expect(trees.length).toBeGreaterThan(20);
    for (const tree of trees) {
      expect(tree.x).toBeGreaterThan(sceneBounds.minX);
      expect(tree.z).toBeGreaterThan(sceneBounds.minZ);
      expect(worldBuildings.some(building => Math.abs(tree.x - building.x) < building.width / 2 && Math.abs(tree.z - building.z) < building.depth / 2)).toBe(false);
    }
  });

  it('keeps district chips small, apart, and off building footprints', () => {
    const rested = districtChipMetrics(1100, 1);
    const narrow = districtChipMetrics(390, 1);
    const zoomed = districtChipMetrics(1100, 2);
    expect(rested.show).toBe(true);
    expect(rested.font).toBeLessThanOrEqual(10);
    expect(rested.height).toBeLessThanOrEqual(18);
    expect(narrow.font).toBeLessThan(rested.font);
    expect(narrow.height).toBeLessThan(rested.height);
    expect(zoomed.layoutScale).toBeLessThan(rested.layoutScale);
    expect(districtChipMetrics(800, 0.6).show).toBe(false);
    for (const [width, height, least] of [[1100, 640, 5], [390, 520, 4]] as const) {
      const metrics = districtChipMetrics(width, 1);
      const projection = createCampusMapProjection(width, height, 18, 'city');
      const project = projection.project.bind(projection);
      const obstacles = screenBuildingBoxes(visibleMapBuildings('city'), project);
      const chips = placeDistrictChips(mapDistricts.map(district => ({ ...district, anchor: project(district.x, district.z) })), obstacles, width, height, metrics);
      const visible = chips.filter(chip => chip.visible);
      expect(visible.length).toBeGreaterThanOrEqual(least);
      for (let index = 0; index < visible.length; index++) {
        const chip = visible[index];
        expect(chip.chipWidth).toBeLessThan(96);
        expect(chip.chipHeight).toBeLessThan(22);
        const box = { x: chip.label.x - chip.chipWidth / 2, y: chip.label.y - chip.chipHeight / 2, w: chip.chipWidth, h: chip.chipHeight };
        for (const block of obstacles) {
          const overlap = box.x < block.x + block.w && box.x + box.w > block.x && box.y < block.y + block.h && box.y + box.h > block.y;
          expect(overlap).toBe(false);
        }
        for (const other of visible.slice(index + 1)) {
          const next = { x: other.label.x - other.chipWidth / 2, y: other.label.y - other.chipHeight / 2, w: other.chipWidth, h: other.chipHeight };
          const overlap = box.x < next.x + next.w && box.x + box.w > next.x && box.y < next.y + next.h && box.y + box.h > next.y;
          expect(overlap).toBe(false);
        }
      }
    }
    expect(mapDistrictLabels([{ anchor: { x: 20, y: 20 } }, { anchor: { x: 200, y: 200 } }], 320, 240)).toHaveLength(2);
  });

  it('separates stacked touch points without comparing every pair up front', () => {
    const placed = separatePoints([{ x: 80, y: 80 }, { x: 82, y: 81 }, { x: 84, y: 79 }, { x: 200, y: 200 }], 400, 300, 44);
    expect(placed).toHaveLength(4);
    for (let index = 0; index < placed.length; index++) for (const other of placed.slice(index + 1)) {
      expect(Math.hypot(placed[index].x - other.x, placed[index].y - other.y)).toBeGreaterThanOrEqual(43);
    }
    expect(placed[3].moved).toBe(false);
  });

  it('matches the sandbox camera to the map projection', () => {
    const camera = new THREE.OrthographicCamera();
    const width = 390;
    const height = 640;
    for (const bearing of [0, 18, -40]) {
      const projection = applySandboxFrame(camera, width, height, bearing, 'city');
      for (const [x, z, elevation] of [[0, 15, 0], [25, -215, 12], [-180, 150, 4]] as const) {
        const expected = projection.project(x, z, elevation);
        const projected = new THREE.Vector3(x, elevation, z).project(camera);
        expect((projected.x + 1) / 2 * width).toBeCloseTo(expected.x, 1);
        expect((1 - projected.y) / 2 * height).toBeCloseTo(expected.y, 1);
      }
    }
  });

  it('builds the walkable Takao summit from the same catalog', () => {
    const scene = new THREE.Scene();
    const world = createCampusWorld(scene);
    const summit = world.movementWorld.colliders.find(collider => collider.kind === 'box' && collider.id === 'building:takao-summit');
    expect(summit && summit.kind === 'box' && summit.minZ).toBeGreaterThanOrEqual(sceneBounds.minZ);
    expect(world.movementWorld.bounds.minZ).toBe(sceneBounds.minZ);
    expect(world.movementWorld.surfaces.some(surface => surface.height > 1 && surface.minZ < -180)).toBe(true);
    world.dispose();
  });
});
