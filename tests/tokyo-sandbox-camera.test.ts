import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import {
  applyTokyoCameraFlight, frameTokyoMapCamera, readTokyoCameraPose,
  type TokyoMapCameraFrame,
} from '../src/frontend/tokyo-sandbox-camera';
import {
  createTokyoSandboxVfx, resolveTokyoAtmosphere,
} from '../src/frontend/tokyo-sandbox-vfx';

const frame: TokyoMapCameraFrame = {
  bounds: { minX: -186, maxX: 252, minZ: -235, maxZ: 186 },
  width: 480, height: 320, bearing: 0, zoom: 1,
  summit: { x: 4, y: 68, z: -188 },
};

describe('Tokyo GLB map 3D camera gestures', () => {
  it('frames all district limits using camera perspective rather than a CSS-scaled canvas', () => {
    const camera = new THREE.PerspectiveCamera();
    const scale = frameTokyoMapCamera(camera, frame);
    expect(scale).toBeGreaterThan(0);
    for (const x of [frame.bounds.minX, frame.bounds.maxX]) {
      for (const z of [frame.bounds.minZ, frame.bounds.maxZ]) {
        const p = new THREE.Vector3(x, 0, z).project(camera);
        expect(Math.abs(p.x)).toBeLessThan(.95);
        expect(Math.abs(p.y)).toBeLessThan(.95);
      }
    }
  });

  it('moves the 3D camera and its projected pins when dragging', () => {
    const camera = new THREE.PerspectiveCamera();
    const point = new THREE.Vector3(35, 10, 10);
    frameTokyoMapCamera(camera, frame);
    const before = point.clone().project(camera);
    const eyeBefore = camera.position.clone();
    frameTokyoMapCamera(camera, { ...frame, pan: { x: 65, y: 35 } });
    const after = point.clone().project(camera);
    expect(camera.position.distanceTo(eyeBefore)).toBeGreaterThan(0);
    expect(after.x).toBeGreaterThan(before.x);
    expect(after.y).toBeLessThan(before.y);
  });

  it('keeps camera distance steady across 360-degree rotation and handles large vertical pans without horizon snap', () => {
    const camera = new THREE.PerspectiveCamera();
    const target = new THREE.Vector3(
      (frame.bounds.minX + frame.bounds.maxX) / 2,
      0,
      (frame.bounds.minZ + frame.bounds.maxZ) / 2,
    );
    frameTokyoMapCamera(camera, frame);
    const baseDist = camera.position.distanceTo(target);
    for (const bearing of [15, 45, 90, 135, 180, 255, 315]) {
      frameTokyoMapCamera(camera, { ...frame, bearing });
      expect(camera.position.distanceTo(target)).toBeCloseTo(baseDist, 4);
    }

    // Large vertical pans near or beyond viewport height must translate linearly, never snap to zero
    frameTokyoMapCamera(camera, { ...frame, pan: { x: 0, y: -150 } });
    const poseMid = readTokyoCameraPose(camera);
    frameTokyoMapCamera(camera, { ...frame, pan: { x: 0, y: -300 } });
    const poseFar = readTokyoCameraPose(camera);
    expect(poseFar.target.distanceTo(target)).toBeGreaterThan(poseMid.target.distanceTo(target));
  });

  it('moves the camera closer for zoom and around the city for rotation', () => {
    const camera = new THREE.PerspectiveCamera();
    frameTokyoMapCamera(camera, frame);
    const target = new THREE.Vector3((frame.bounds.minX + frame.bounds.maxX) / 2, 0,
      (frame.bounds.minZ + frame.bounds.maxZ) / 2);
    const baselineDistance = camera.position.distanceTo(target);
    frameTokyoMapCamera(camera, { ...frame, zoom: 2 });
    expect(camera.position.distanceTo(target)).toBeLessThan(baselineDistance);
    const beforeYaw = camera.position.clone();
    frameTokyoMapCamera(camera, { ...frame, bearing: 75 });
    expect(camera.position.distanceTo(beforeYaw)).toBeGreaterThan(30);
  });

  it('flies the same 3D camera towards a clicked district landmark instead of cropping pixels', () => {
    const overview = new THREE.PerspectiveCamera();
    frameTokyoMapCamera(overview, frame);
    const from = readTokyoCameraPose(overview);
    const detail = new THREE.PerspectiveCamera();
    frameTokyoMapCamera(detail, {
      ...frame, bounds: { minX: -186, maxX: -88, minZ: 54, maxZ: 186 },
      center: { x: -136, z: 115 },
    });
    const to = readTokyoCameraPose(detail);
    const visited = new THREE.Vector3(-136, 0, 115);
    expect(to.position.distanceTo(visited)).toBeLessThan(from.position.distanceTo(visited));
    const midpoint = new THREE.PerspectiveCamera(50, frame.width / frame.height, .25, 6500);
    midpoint.updateProjectionMatrix();
    applyTokyoCameraFlight(midpoint, from, to, .5);
    expect(midpoint.position.distanceTo(from.position)).toBeGreaterThan(10);
    expect(midpoint.position.distanceTo(to.position)).toBeGreaterThan(10);
    const point = new THREE.Vector3(-126, 0, 115);
    const imageSize = (camera: THREE.PerspectiveCamera) =>
      point.clone().project(camera).distanceTo(visited.clone().project(camera));
    expect(imageSize(detail)).toBeGreaterThan(imageSize(overview));
  });

  it('routes the existing pan and pinch values into the GLB camera, not DOM transforms, and animates the Su-30SM2', () => {
    const world = readFileSync('src/frontend/WorldMapJourney.vue', 'utf8');
    const scene = readFileSync('src/frontend/CitySandboxScene.vue', 'utf8');
    expect(world).toContain(':pan="pan"');
    expect(world).toContain(':view-scale="focusZoom"');
    expect(world).toContain('<div class="wm-stage">');
    expect(world).not.toContain('class="wm-stage" :style="transform"');
    expect(scene).toContain('frameTokyoMapCamera(camera, {');
    expect(scene).toContain('THREE.PerspectiveCamera');
    expect(scene).toContain('beginCameraFlight()');
    expect(scene).toContain('applyTokyoCameraFlight(camera, flight.from, targetPose, eased)');
    expect(scene).toContain("scene.add(model)");
    expect(scene).toContain("cameraFlying ? 'flying' : 'idle'");
    expect(scene).toContain('bindDynamicSceneNodes(model)');
    expect(scene).toContain('updateSu30Pose(su30State, nowMs)');
    expect(scene).toContain('createTokyoSandboxVfx(');
    expect(scene).toContain('Math.atan2(route.dirX * v.lane, route.dirZ * v.lane)');
    // Recovery/resource ownership is exercised by graphics-recovery.test.ts.
    // GPU residency and background prewarming are no longer a contract.
  });

  it('resolves atmosphere presets by game clock and drives Su-30SM2 supersonic VFX and flares', () => {
    expect(resolveTokyoAtmosphere('auto', 9 * 60).preset).toBe('day');
    expect(resolveTokyoAtmosphere('auto', 17 * 60 + 30).preset).toBe('dusk');
    expect(resolveTokyoAtmosphere('auto', 21 * 60).preset).toBe('night');
    expect(resolveTokyoAtmosphere('auto', 1 * 60).preset).toBe('cyber');
    expect(resolveTokyoAtmosphere('cyber', 10 * 60).preset).toBe('cyber');

    const scene = new THREE.Scene();
    const model = new THREE.Group();
    const su30 = new THREE.Group();
    su30.position.set(58, 52, 82);
    model.add(su30);
    scene.add(model);
    const hemi = new THREE.HemisphereLight(0xffffff, 0x6e837b, 2.5);
    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    const mockRenderer = { toneMappingExposure: 1, shadowMap: { enabled: false, type: THREE.PCFSoftShadowMap } } as unknown as THREE.WebGLRenderer;

    const vfx = createTokyoSandboxVfx(scene, mockRenderer, model, hemi, sun);
    expect(vfx.setAtmosphere('night').preset).toBe('night');
    vfx.triggerSu30Flares(su30);
    vfx.update(0.05, 1000, su30, { x: 0, z: 18 }, { x: -136, z: 118 });
    expect(su30.children.some(c => c.name === 'su30-local-vfx')).toBe(true);
    vfx.dispose();
  });
});
