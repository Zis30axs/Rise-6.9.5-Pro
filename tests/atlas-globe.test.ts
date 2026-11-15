// @vitest-environment jsdom
import type { FeatureCollection, Geometry } from 'geojson';
import * as THREE from 'three';
import { createApp, nextTick } from 'vue';
import { describe, expect, it } from 'vitest';
import rawAtlasData from '../src/frontend/atlas-data.json';
import AtlasMapScene from '../src/frontend/AtlasMapScene.vue';
import type { AtlasProperties } from '../src/frontend/atlas-geometry';
import {
  ANTARCTICA_FEATURE,
  computeGlobeBounds,
  computeGlobeCameraPose,
  featureAnchorLatLon,
  formatAltitudeKm,
  formatLatLon,
  GLOBE_RADIUS,
  globeBorderGeometry,
  globeLandGeometry,
  greatCircleDistanceKm,
  interpolateGreatCircle,
  LAND_BASE_OFFSET,
  latLonToSphere,
  layoutGlobeLabels,
  MAJOR_COUNTRY_PRIORITIES,
  orientObjectOnSphere,
  spherePointToLatLon,
  withAntarcticaCountry,
  WORLD_ORBIT_SPAN_DEG,
  type GlobeLabelCandidate,
} from '../src/frontend/atlas-globe';
import { TOKYO_CENTER } from '../src/runtime/tokyo-world';

const atlasData = rawAtlasData as {
  countries: FeatureCollection<Geometry, AtlasProperties>;
  subdivisions: FeatureCollection<Geometry, AtlasProperties>;
  chinaMaritimeLines: FeatureCollection<Geometry, AtlasProperties>;
};

describe('Google Earth 3D globe math, geometry & HUD', () => {
  it('converts lat/lon coordinates to Y-up sphere and back accurately', () => {
    const samples = [
      { lon: 0, lat: 0 },
      { lon: TOKYO_CENTER.lon, lat: TOKYO_CENTER.lat },
      { lon: -122.42, lat: 37.77 },
      { lon: -43.21, lat: -22.95 },
      { lon: 179.5, lat: -66.2 },
      { lon: -179.5, lat: 74.1 },
    ];
    for (const s of samples) {
      const vec = latLonToSphere(s.lon, s.lat, 0);
      expect(vec.length()).toBeCloseTo(GLOBE_RADIUS, 4);
      const back = spherePointToLatLon(vec);
      expect(back.lat).toBeCloseTo(s.lat, 4);
      expect(back.lon).toBeCloseTo(s.lon, 4);
    }
    // Prime meridian faces +Z, 90E sits on +X, North Pole on +Y
    expect(latLonToSphere(0, 0, 0).z).toBeCloseTo(GLOBE_RADIUS, 4);
    expect(latLonToSphere(90, 0, 0).x).toBeCloseTo(GLOBE_RADIUS, 4);
    expect(latLonToSphere(0, 90, 0).y).toBeCloseTo(GLOBE_RADIUS, 4);
  });

  it('orients 3D landmarks radially outward perpendicular to the sphere surface', () => {
    const obj = new THREE.Object3D();
    orientObjectOnSphere(obj, TOKYO_CENTER.lon, TOKYO_CENTER.lat, 0.8);
    expect(obj.position.length()).toBeCloseTo(GLOBE_RADIUS + 0.8, 3);
    const localUp = new THREE.Vector3(0, 1, 0).applyQuaternion(obj.quaternion);
    const radialNormal = obj.position.clone().normalize();
    expect(localUp.dot(radialNormal)).toBeCloseTo(1, 5);
  });

  it('crosses the Pacific antimeridian cleanly via shortest great-circle route', () => {
    const dist = greatCircleDistanceKm(139.71, 35.73, -122.42, 37.77);
    expect(dist).toBeGreaterThan(8000);
    expect(dist).toBeLessThan(8600);
    const mid = interpolateGreatCircle(139.71, 35.73, -122.42, 37.77, 0.5);
    expect(Math.abs(mid.lon)).toBeGreaterThan(150);
    expect(mid.lat).toBeGreaterThan(40);
  });

  it('subdivides large landmasses cleanly on the curved globe with outward normals above ocean radius', () => {
    for (const id of ['CHN', 'JPN', 'USA', 'SUN', 'AUS', 'BRA']) {
      const feature = atlasData.countries.features.find(f => f.properties.id === id);
      expect(feature).toBeDefined();
      const geo = globeLandGeometry(feature!);
      const pos = geo.getAttribute('position');
      const norm = geo.getAttribute('normal');
      expect(pos.count).toBeGreaterThan(100);
      for (let i = 0; i < pos.count; i += 3) {
        const vx = pos.getX(i);
        const vy = pos.getY(i);
        const vz = pos.getZ(i);
        const r = Math.hypot(vx, vy, vz);
        expect(r).toBeGreaterThanOrEqual(GLOBE_RADIUS + LAND_BASE_OFFSET);
        expect(Number.isFinite(norm.getX(i))).toBe(true);
      }
      geo.dispose();
    }

    const maritimeGeo = globeBorderGeometry(atlasData.chinaMaritimeLines.features[0]!);
    const mPos = maritimeGeo.getAttribute('position');
    expect(mPos.count).toBeGreaterThan(10);
    for (let i = 0; i < mPos.count; i++) {
      const r = Math.hypot(mPos.getX(i), mPos.getY(i), mPos.getZ(i));
      expect(r).toBeGreaterThan(GLOBE_RADIUS + LAND_BASE_OFFSET);
    }
    maritimeGeo.dispose();
  });

  it('keeps camera clear of Earth surface across nadir, 62° horizon tilt, and portrait screens', () => {
    const cases = [
      { lon: 112, lat: 26, spanDeg: WORLD_ORBIT_SPAN_DEG, headingDeg: 0, tiltDeg: 0, aspect: 1.6 },
      { lon: 112, lat: 26, spanDeg: WORLD_ORBIT_SPAN_DEG, headingDeg: 35, tiltDeg: 55, aspect: 0.52 },
      { lon: TOKYO_CENTER.lon, lat: TOKYO_CENTER.lat, spanDeg: 16, headingDeg: 120, tiltDeg: 58, aspect: 1.4 },
      { lon: TOKYO_CENTER.lon, lat: TOKYO_CENTER.lat, spanDeg: 2.2, headingDeg: -45, tiltDeg: 62, aspect: 0.6 },
      { lon: 0, lat: 82, spanDeg: 30, headingDeg: 0, tiltDeg: 45, aspect: 1.0 },
    ];
    for (const c of cases) {
      const pose = computeGlobeCameraPose(c);
      expect(pose.eye.length()).toBeGreaterThan(GLOBE_RADIUS + 1.5);
      expect(pose.up.length()).toBeCloseTo(1, 4);
      expect(pose.altitudeKm).toBeGreaterThan(10);
      const lookDir = pose.target.clone().sub(pose.eye).normalize();
      expect(Math.abs(pose.up.dot(lookDir))).toBeLessThan(0.25);
    }
  });

  it('culls back-hemisphere labels and resolves overlaps by priority', () => {
    const candidates: GlobeLabelCandidate[] = [
      { id: 'far-side', target: 'country:BRA', name: '巴西', kind: 'country', x: 300, y: 200, hemisphereDot: -0.25, priority: 99 },
      { id: 'lm', target: 'landmark:fuji', name: '富士山', kind: 'landmark', x: 300, y: 200, hemisphereDot: 0.85, priority: 90 },
      { id: 'overlap', target: 'country:JPN', name: '日本', kind: 'country', x: 310, y: 204, hemisphereDot: 0.85, priority: 85 },
      { id: 'ocean', target: '', name: '太平洋', kind: 'ocean', x: 140, y: 260, hemisphereDot: 0.72, priority: 40 },
    ];
    const laid = layoutGlobeLabels(candidates, 800, 600);
    expect(laid.map(i => i.id)).toEqual(['lm', 'ocean']);
  });

  it('mounts AtlasMapScene with orthographic globe fallback, China maritime lines, and tilt controls', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);

    const app = createApp(AtlasMapScene, {
      countries: atlasData.countries,
      subdivisions: atlasData.subdivisions,
      chinaMaritimeLines: atlasData.chinaMaritimeLines,
      depth: 5,
      width: 820,
      height: 540,
      active: true,
    });
    const vm = app.mount(host) as unknown as {
      toggleTilt: () => void;
      adjustTilt: (d: number) => void;
      getTilt: () => number;
      focusFeature: (id: string) => { depth: number; zoom: number } | undefined;
      focusLandmark: (id: string) => { depth: number; zoom: number; countryId: string } | undefined;
      panBy: (dx: number, dy: number) => void;
      getZoomView: (f: number) => { depth: number; zoom: number };
      resetView: () => void;
    };
    await nextTick();

    const sceneEl = host.querySelector('.atlas-scene') as HTMLElement | null;
    expect(sceneEl).not.toBeNull();
    expect(sceneEl?.getAttribute('data-atlas-renderer')).toBe('fallback');
    expect(sceneEl?.querySelector('.atlas-svg-ocean')).not.toBeNull();
    expect(sceneEl?.querySelector('.atlas-svg-atmo')).not.toBeNull();
    expect(sceneEl?.querySelector('[data-map-target="country:CHN"]')).not.toBeNull();
    expect(sceneEl?.querySelector('.atlas-maritime path')).not.toBeNull();
    expect(sceneEl?.querySelector('[data-atlas-coords]')?.textContent).toMatch(/°[NS]\s+\d+\.\d+°[EW]/);

    expect(vm).not.toBeNull();
    expect(vm.getTilt()).toBe(0);
    const tiltBtn = sceneEl?.querySelector('[data-atlas-tilt-toggle]') as HTMLButtonElement | null;
    expect(tiltBtn?.textContent).toBe('垂直俯视');
    tiltBtn?.click();
    await nextTick();
    expect(vm.getTilt()).toBe(48);
    expect(sceneEl?.getAttribute('data-atlas-tilt')).toBe('48.0');
    expect(tiltBtn?.textContent).toContain('3D 倾斜');
    vm.adjustTilt(20);
    expect(vm.getTilt()).toBe(62);
    const chnFocus = vm.focusFeature('country:CHN');
    expect(chnFocus?.depth).toBe(4);
    expect(chnFocus?.zoom).toBeGreaterThan(0.1);
    const fujiFocus = vm.focusLandmark('fuji');
    expect(fujiFocus?.countryId).toBe('JPN');
    vm.panBy(24, -12);
    const zoomed = vm.getZoomView(2);
    expect(zoomed.depth).toBeLessThanOrEqual(5);
    vm.resetView();
    expect(vm.getTilt()).toBe(0);

    expect(formatLatLon(139.71, 35.73)).toBe('35.73°N  139.71°E');
    expect(formatAltitudeKm(0.42)).toBe('420 m');
    expect(computeGlobeBounds(atlasData.countries.features.find(f => f.properties.id === 'JPN') as never).angularSpan).toBeGreaterThan(5);
    expect(sceneEl?.querySelector('[data-map-target="country:ATA"].antarctica')).not.toBeNull();
    const ataFocus = vm.focusFeature('country:ATA');
    expect(ataFocus?.depth).toBe(4);
    expect(ataFocus?.zoom).toBeGreaterThan(0.1);
    app.unmount();
    host.remove();
  });

  it('restores Antarctica above the ocean sphere with seamless polar subdivision and label priority', () => {
    const injected = withAntarcticaCountry(atlasData.countries.features);
    expect(injected.some(f => f.properties.id === 'ATA' && f.properties.name === '南极洲')).toBe(true);
    expect(withAntarcticaCountry(injected).filter(f => f.properties.id === 'ATA')).toHaveLength(1);
    expect(MAJOR_COUNTRY_PRIORITIES.ATA).toBeGreaterThan(50);
    expect(featureAnchorLatLon(ANTARCTICA_FEATURE).lat).toBeLessThanOrEqual(-75);

    const geo = globeLandGeometry(ANTARCTICA_FEATURE);
    const pos = geo.getAttribute('position');
    expect(pos.count).toBeGreaterThan(1500);
    for (let i = 0; i < pos.count; i += 3) {
      for (let v = 0; v < 3; v++) {
        const r = Math.hypot(pos.getX(i + v), pos.getY(i + v), pos.getZ(i + v));
        expect(r).toBeGreaterThanOrEqual(GLOBE_RADIUS + LAND_BASE_OFFSET);
      }
      // Every triangle centroid stays clear above the spherical ocean surface (no polar chord sag).
      const cx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
      const cy = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
      const cz = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
      expect(Math.hypot(cx, cy, cz)).toBeGreaterThan(GLOBE_RADIUS + LAND_BASE_OFFSET * 0.5);
    }
    geo.dispose();

    const border = globeBorderGeometry(ANTARCTICA_FEATURE);
    const bPos = border.getAttribute('position');
    expect(bPos.count).toBeGreaterThan(60);
    for (let i = 0; i < bPos.count; i += 2) {
      const segLen = Math.hypot(
        bPos.getX(i + 1) - bPos.getX(i),
        bPos.getY(i + 1) - bPos.getY(i),
        bPos.getZ(i + 1) - bPos.getZ(i),
      );
      expect(segLen).toBeLessThan(12);
    }
    border.dispose();
  });
});
