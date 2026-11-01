import * as THREE from 'three';

export interface TokyoMapCameraBounds {
  minX: number; maxX: number; minZ: number; maxZ: number;
}

export interface TokyoMapCameraFrame {
  bounds: TokyoMapCameraBounds;
  width: number; height: number;
  bearing: number; zoom: number;
  pan?: { x: number; y: number };
  center?: { x: number; z: number };
  overhead?: number;
  summit?: { x: number; y: number; z: number };
}

const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

/** Ground under the given offset from the viewport centre, in pixels (positive y down). */
function groundAt(camera: THREE.PerspectiveCamera, width: number, height: number, x: number, y: number) {
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(2 * x / width, -2 * y / height), camera);
  return raycaster.ray.intersectPlane(ground, new THREE.Vector3());
}

/**
 * Project the original Tokyo GLB through a real perspective camera.
 * Pan translates the camera along the 3D ground plane; wheel/pinch changes
 * camera distance. Markers use the resulting same projection matrix.
 * This is presentation-only: no world-state coordinates are changed.
 */
export function frameTokyoMapCamera(camera: THREE.PerspectiveCamera, frame: TokyoMapCameraFrame): number {
  const width = Math.max(1, frame.width), height = Math.max(1, frame.height);
  const bounds = frame.bounds;
  const sourceCentre = new THREE.Vector3((bounds.minX + bounds.maxX) / 2, 0, (bounds.minZ + bounds.maxZ) / 2);
  const bearing = (frame.bearing + 35) * Math.PI / 180;
  const overhead = Math.max(-0.85, Math.min(1, frame.overhead ?? 0));
  const pitch = (58 + 25 * overhead) * Math.PI / 180;
  const sin = Math.sin(bearing), cos = Math.cos(bearing), sp = Math.sin(pitch), cp = Math.cos(pitch);
  const eye = new THREE.Vector3(sin * cp, sp, cos * cp);
  const right = new THREE.Vector3(cos, 0, -sin);
  const groundForward = new THREE.Vector3(-sin, 0, -cos);

  camera.fov = 50;
  camera.aspect = width / height;
  camera.near = .25; camera.far = 6500;
  camera.updateProjectionMatrix();

  // Fit ground corners and the visible skyline without selecting the huge
  // background slab as the camera target. Never fake zoom with CSS scaling.
  // Use canonical reference angles for fitDistance so rotating bearing/pitch
  // keeps a steady orbital radius instead of oscillating with bounding-box corners.
  const target = frame.center
    ? new THREE.Vector3(frame.center.x, 0, frame.center.z) : sourceCentre.clone();
  const baseBearing = 35 * Math.PI / 180;
  const basePitch = 58 * Math.PI / 180;
  const bSin = Math.sin(baseBearing), bCos = Math.cos(baseBearing);
  const bSp = Math.sin(basePitch), bCp = Math.cos(basePitch);
  const baseEye = new THREE.Vector3(bSin * bCp, bSp, bCos * bCp);
  const baseRight = new THREE.Vector3(bCos, 0, -bSin);
  const baseUp = new THREE.Vector3(-bSin * bSp, bCp, -bCos * bSp);

  const points: THREE.Vector3[] = [];
  for (const x of [bounds.minX, bounds.maxX]) for (const z of [bounds.minZ, bounds.maxZ]) {
    points.push(new THREE.Vector3(x, 0, z), new THREE.Vector3(x, 18, z));
  }
  const peak = frame.summit;
  if (peak && peak.x >= bounds.minX && peak.x <= bounds.maxX &&
      peak.z >= bounds.minZ && peak.z <= bounds.maxZ) {
    points.push(new THREE.Vector3(peak.x, peak.y, peak.z));
  }
  const halfVertical = Math.tan(camera.fov * Math.PI / 360);
  const halfHorizontal = halfVertical * camera.aspect;
  let fitDistance = 20;
  for (const point of points) {
    const offset = point.sub(target);
    const requiredX = Math.abs(offset.dot(baseRight)) / (halfHorizontal * .91);
    const requiredY = Math.abs(offset.dot(baseUp)) / (halfVertical * .88);
    fitDistance = Math.max(fitDistance, offset.dot(baseEye) + Math.max(requiredX, requiredY));
  }

  const zoom = Math.max(.65, Math.min(12, Number.isFinite(frame.zoom) ? frame.zoom : 1));
  const distance = fitDistance / zoom;

  if (frame.pan && (frame.pan.x || frame.pan.y)) {
    // Linear ground-plane tangent translation: 1:1 with finger/cursor at screen
    // centre, and immune to horizon ray-plane divergence at large vertical pans.
    const radPerPixel = (2 * halfVertical) / height;
    const shiftRight = -frame.pan.x * distance * radPerPixel;
    const shiftForward = (frame.pan.y * distance * radPerPixel) / Math.max(0.28, sp);
    target.addScaledVector(right, shiftRight);
    target.addScaledVector(groundForward, shiftForward);
  }

  camera.position.copy(target).addScaledVector(eye, distance);
  camera.lookAt(target);
  camera.updateMatrixWorld(true);

  return measureTokyoGroundScale(camera, width, height);
}

/** The map scale bar samples the current camera, including in-flight frames. */
export function measureTokyoGroundScale(camera: THREE.PerspectiveCamera, width: number, height: number): number {
  const step = Math.max(1, Math.min(30, height / 5));
  const a = groundAt(camera, width, height, 0, 0);
  const b = groundAt(camera, width, height, 0, step);
  return a && b ? Math.max(.001, a.distanceTo(b) / step) : 4;
}

export interface TokyoCameraPose {
  position: THREE.Vector3;
  target: THREE.Vector3;
}

/** Centre-ray ground target, rather than a screen crop or a CSS translation. */
export function readTokyoCameraPose(camera: THREE.PerspectiveCamera): TokyoCameraPose {
  camera.updateMatrixWorld(true);
  const direction = camera.getWorldDirection(new THREE.Vector3());
  const distance = direction.y < -1e-6 ? -camera.position.y / direction.y : 0;
  const target = camera.position.clone().addScaledVector(direction, Math.max(0, distance));
  target.y = 0;
  return { position: camera.position.clone(), target };
}

/** Interpolate actual camera poses for a city-to-landmark fly-in and its return. */
export function applyTokyoCameraFlight(
  camera: THREE.PerspectiveCamera, from: TokyoCameraPose, to: TokyoCameraPose, fraction: number,
): void {
  const t = Math.min(1, Math.max(0, fraction));
  camera.position.copy(from.position).lerp(to.position, t);
  camera.lookAt(from.target.clone().lerp(to.target, t));
  camera.updateMatrixWorld(true);
}
