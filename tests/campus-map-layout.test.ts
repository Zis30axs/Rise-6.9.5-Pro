import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { campusMapBounds, createCampusMapProjection, mapBounds, mapBuildings, mapDistrictLabels, mapLocationPoint, mapPaths, visibleMapBuildings } from '../src/frontend/campus-map-layout';
import { sceneBounds, sceneLandmarks, scenePaths } from '../src/frontend/scene-layout';
import { createCampusWorld } from '../src/frontend/scene-world';
import { campusInteriors } from '../src/runtime/campus-interiors';
import { novelDestinations } from '../src/runtime/model';
import { transitStops } from '../src/runtime/transit';

afterEach(() => vi.restoreAllMocks());

describe('校园与城市沙盘的真实场景布局', () => {
  it('与当前户外场景共用道路和边界，每处主建筑与实际碰撞轮廓一致', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const world = createCampusWorld(new THREE.Scene());
    try {
      expect(mapPaths).toBe(scenePaths);
      expect(mapBounds('city')).toBe(sceneBounds);
      expect(mapBuildings).toHaveLength(21);
      for (const building of mapBuildings) {
        const collider = world.movementWorld.colliders.find(item => item.id === building.id);
        expect(collider, building.id).toBeDefined();
        if (!collider || collider.kind !== 'box') throw new Error('Missing building collider: ' + building.id);
        expect((collider.minX + collider.maxX) / 2).toBeCloseTo(building.x);
        expect((collider.minZ + collider.maxZ) / 2).toBeCloseTo(building.z);
        expect(collider.maxX - collider.minX).toBeCloseTo(building.width + .15);
        expect(collider.maxZ - collider.minZ).toBeCloseTo(building.depth + .12);
      }
    } finally { world.dispose(); }
  });

  it('27 个小说目的地均有真实入口坐标，室内沿用所属建筑门口', () => {
    expect(novelDestinations).toHaveLength(27);
    for (const destination of novelDestinations) expect(mapLocationPoint(destination.id), destination.id).toBeDefined();
    for (const room of campusInteriors) expect(mapLocationPoint(room.id)).toEqual(room.entrance);
    expect(mapLocationPoint('dorm')).toEqual(sceneLandmarks.find(item => item.id === 'residences'));
    expect(mapLocationPoint('gate')).toEqual(sceneLandmarks.find(item => item.id === 'south-gate'));
    expect(mapLocationPoint('imaginary-station')).toBeUndefined();
    expect(visibleMapBuildings('campus')).toHaveLength(10);
    expect(visibleMapBuildings('city')).toHaveLength(21);
  });

  it('朝北时宿舍在西、教学楼在北、商业区在东南、公园在东北', () => {
    const projection = createCampusMapProjection(620, 420, 0, 'city');
    const campus = projection.project(0, 0);
    const dorm = mapLocationPoint('dorm')!, teaching = mapLocationPoint('teaching')!;
    expect(projection.project(dorm.x, dorm.z).x).toBeLessThan(campus.x);
    expect(projection.project(teaching.x, teaching.z).y).toBeLessThan(campus.y);
    const commercial = projection.project(180, 150), park = projection.project(180, -150), home = projection.project(-180, 150);
    expect(commercial.x).toBeGreaterThan(campus.x); expect(commercial.y).toBeGreaterThan(campus.y);
    expect(park.x).toBeGreaterThan(campus.x); expect(park.y).toBeLessThan(campus.y);
    expect(home.x).toBeLessThan(campus.x); expect(home.y).toBeGreaterThan(campus.y);
  });

  it('不同尺寸和旋转下完整容纳地块、建筑屋顶并保持立体高度', () => {
    for (const scope of ['campus', 'city'] as const) for (const [width, height] of [[240, 170], [320, 250], [620, 420]]) for (const bearing of [0, 45, 90, 180, 270]) {
      const p = createCampusMapProjection(width, height, bearing, scope), bounds = mapBounds(scope);
      const samples = [bounds.minX, bounds.maxX].flatMap(x => [bounds.minZ, bounds.maxZ].flatMap(z => [p.project(x, z), p.project(x, z, -4)]));
      for (const building of visibleMapBuildings(scope)) for (const x of [building.x - building.width / 2, building.x + building.width / 2]) for (const z of [building.z - building.depth / 2, building.z + building.depth / 2]) samples.push(p.project(x, z, building.height));
      for (const point of samples) {
        expect(point.x).toBeGreaterThanOrEqual(11.99); expect(point.x).toBeLessThanOrEqual(width - 11.99);
        expect(point.y).toBeGreaterThanOrEqual(11.99); expect(point.y).toBeLessThanOrEqual(height - 11.99);
      }
      expect(p.project(0, -14, 10.2).y).toBeLessThan(p.project(0, -14).y);
      const determinant = p.a * p.d - p.b * p.c;
      const worldDx = p.d / determinant, worldDz = -p.b / determinant;
      expect(p.metersPerPixel).toBeCloseTo(Math.hypot(worldDx, worldDz));
    }
  });

  it('五片区标签在小屏旋转后仍各有独立 104×44 点击区域', () => {
    for (const [width, height] of [[240, 170], [320, 250], [620, 420]]) for (const bearing of [0, 45, 90, 180, 270]) {
      const projection = createCampusMapProjection(width, height, bearing, 'city');
      const districts = mapDistrictLabels(transitStops.map(stop => ({ id: stop.id, anchor: projection.project(stop.x, stop.z) })), width, height);
      for (const [index, district] of districts.entries()) {
        expect(district.label.x - 52).toBeGreaterThanOrEqual(4); expect(district.label.x + 52).toBeLessThanOrEqual(width - 4);
        expect(district.label.y - 22).toBeGreaterThanOrEqual(6); expect(district.label.y + 22).toBeLessThanOrEqual(height - 26);
        for (const other of districts.slice(index + 1)) expect(Math.abs(district.label.x - other.label.x) >= 104 || Math.abs(district.label.y - other.label.y) >= 44).toBe(true);
      }
    }
  });

  it('校园内目的地为 17 处，市中心与丰川家在城市层，所有边界均来自实景', () => {
    const campus = novelDestinations.filter(destination => {
      const point = mapLocationPoint(destination.id)!;
      return point.x >= campusMapBounds.minX && point.x <= campusMapBounds.maxX && point.z >= campusMapBounds.minZ && point.z <= campusMapBounds.maxZ;
    });
    expect(campus).toHaveLength(17);
    expect(novelDestinations.filter(destination => !campus.includes(destination)).map(destination => destination.id)).toEqual([
      'home', 'commercial', 'downtown', 'city-park', 'toyokawa-house',
      'emma-yuki-home', 'koko-old-house', 'nikaido-house', 'majo-highrise-home', 'majo-studio',
    ]);
  });
});
