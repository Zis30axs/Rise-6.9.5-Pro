import * as THREE from 'three';
import { createCampusMapProjection, type CampusMapScope, type MapCameraView } from './campus-map-layout';

const right = new THREE.Vector3();
const up = new THREE.Vector3();
const target = new THREE.Vector3();

/**
 * Orthographic camera whose screen projection matches createCampusMapProjection.
 * Pins, leaders and raycasts then share one oblique frame.
 */
export function applySandboxFrame(camera: THREE.OrthographicCamera, width: number, height: number, bearing: number, scope: CampusMapScope, view: MapCameraView = {}) {
  const projection = createCampusMapProjection(Math.max(1, width), Math.max(1, height), bearing, scope, view);
  const angle = (Number.isFinite(bearing) ? bearing : 0) * Math.PI / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  right.set(cos, 0, -sin);
  up.set(-sin * projection.compression, projection.elevationScale, -cos * projection.compression);
  const upLength = Math.max(0.001, up.length());
  up.multiplyScalar(1 / upLength);
  const { a, b, c, d, e, f, unit } = projection;
  const determinant = a * d - b * c || 0.001;
  const px = width / 2 - e;
  const py = height / 2 - f;
  target.set((px * d - py * c) / determinant, 0, (a * py - b * px) / determinant);
  const frustumWidth = Math.max(1, width) / unit;
  const frustumHeight = Math.max(1, height) / (unit * upLength);
  camera.left = -frustumWidth / 2;
  camera.right = frustumWidth / 2;
  camera.top = frustumHeight / 2;
  camera.bottom = -frustumHeight / 2;
  camera.near = -500;
  camera.far = 1400;
  camera.zoom = 1;
  camera.updateProjectionMatrix();
  camera.up.copy(up);
  camera.position.copy(target).addScaledVector(new THREE.Vector3().crossVectors(right, up), 180);
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
  return projection;
}
