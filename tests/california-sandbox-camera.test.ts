import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  applyCaliforniaCameraFlight, frameCaliforniaMapCamera, readCaliforniaCameraPose,
} from '../src/frontend/california-sandbox-camera';
import { californiaStateBounds } from '../src/frontend/california-sandbox-map';

describe('California GLB map 3D camera', () => {
  it('frames the whole state using camera perspective rather than a CSS-scaled canvas', () => {
    const camera = new THREE.PerspectiveCamera();
    const scale = frameCaliforniaMapCamera(camera, {
      width: 640, height: 480, bearing: 0, zoom: 1,
    });
    expect(scale).toBeGreaterThan(0);
    for (const x of [californiaStateBounds.minX, californiaStateBounds.maxX]) {
      for (const z of [californiaStateBounds.minZ, californiaStateBounds.maxZ]) {
        const p = new THREE.Vector3(x, 0, z).project(camera);
        expect(Math.abs(p.x)).toBeLessThan(1.05);
        expect(Math.abs(p.y)).toBeLessThan(1.05);
      }
    }
    const pose = readCaliforniaCameraPose(camera);
    expect(pose.position.y).toBeGreaterThan(0);
    expect(Math.abs(pose.target.x)).toBeLessThan(1);
    expect(Math.abs(pose.target.z)).toBeLessThan(1);
  });

  it('zooms closer when the zoom factor grows', () => {
    const near = new THREE.PerspectiveCamera();
    const far = new THREE.PerspectiveCamera();
    const closeScale = frameCaliforniaMapCamera(near, {
      width: 640, height: 480, bearing: 0, zoom: 2,
    });
    const wideScale = frameCaliforniaMapCamera(far, {
      width: 640, height: 480, bearing: 0, zoom: 1,
    });
    expect(closeScale).toBeLessThan(wideScale);
    expect(near.position.distanceTo(far.position)).toBeGreaterThan(0);
  });

  it('flies the camera from the state overview to a landmark', () => {
    const camera = new THREE.PerspectiveCamera();
    frameCaliforniaMapCamera(camera, { width: 640, height: 480, bearing: 0, zoom: 1 });
    const from = readCaliforniaCameraPose(camera);
    const target = new THREE.Vector3(-126, 0, -19);
    const to = {
      position: target.clone().add(new THREE.Vector3(0, 320, 320)),
      target,
    };
    applyCaliforniaCameraFlight(camera, from, to, 0.5);
    const mid = readCaliforniaCameraPose(camera);
    expect(mid.position.distanceTo(from.position)).toBeGreaterThan(0);
    expect(mid.position.distanceTo(to.position)).toBeGreaterThan(0);
    applyCaliforniaCameraFlight(camera, from, to, 1);
    const done = readCaliforniaCameraPose(camera);
    expect(done.target.x).toBeCloseTo(target.x, 5);
    expect(done.target.z).toBeCloseTo(target.z, 5);
  });
});
