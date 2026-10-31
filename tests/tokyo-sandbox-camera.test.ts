import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import {
  applyTokyoCameraFlight, frameTokyoMapCamera, readTokyoCameraPose,
  type TokyoMapCameraFrame,
} from '../src/frontend/tokyo-sandbox-camera';

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

  it('routes the existing pan and pinch values into the GLB camera, not DOM transforms', () => {
    const world = readFileSync('src/frontend/WorldMap.vue', 'utf8');
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
  });
});
