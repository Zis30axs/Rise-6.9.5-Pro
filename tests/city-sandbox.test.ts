import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { anchorLabels, createCampusMapProjection, mapDistrictLabels, separatePoints } from '../src/frontend/campus-map-layout';
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

  it('gives all seven district labels a non-overlapping touch target', () => {
    const projection = createCampusMapProjection(1100, 640, 18, 'city');
    const labels = anchorLabels(mapDistricts.map(district => ({ ...district, anchor: projection.project(district.x, district.z) })), 1100, 640);
    const edged = mapDistrictLabels(mapDistricts.map(district => ({ ...district, anchor: projection.project(district.x, district.z) })), 640, 420);
    expect(edged).toHaveLength(7);
    expect(labels).toHaveLength(7);
    for (let index = 0; index < labels.length; index++) {
      const label = labels[index].label;
      expect(label.x).toBeGreaterThanOrEqual(52);
      expect(label.x).toBeLessThanOrEqual(1048);
      expect(label.y).toBeGreaterThanOrEqual(22);
      expect(label.y).toBeLessThanOrEqual(618);
      expect(Math.hypot(label.x - labels[index].anchor.x, label.y - labels[index].anchor.y)).toBeLessThan(180);
      for (const other of labels.slice(index + 1)) {
        const box = { x: label.x - 52, y: label.y - 22, w: 104, h: 44 };
        const next = { x: other.label.x - 52, y: other.label.y - 22, w: 104, h: 44 };
        const overlap = box.x < next.x + next.w && box.x + box.w > next.x && box.y < next.y + next.h && box.y + box.h > next.y;
        expect(overlap).toBe(false);
      }
    }
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
