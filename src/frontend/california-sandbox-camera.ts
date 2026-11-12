/** California camera framing on the shared perspective-camera math.
 * The underlying projection is generic (see tokyo-sandbox-camera); this module
 * only supplies California defaults: the whole-state bounds and Mt. Whitney
 * as the fitting summit, plus California-named aliases for the shared poses.
 */
import * as THREE from 'three';
import {
  applyTokyoCameraFlight, frameTokyoMapCamera, measureTokyoGroundScale,
  readTokyoCameraPose, type TokyoCameraPose, type TokyoMapCameraFrame,
} from './tokyo-sandbox-camera';
import { californiaStateBounds, californiaSummit } from './california-sandbox-map';

export type CaliforniaCameraPose = TokyoCameraPose;

export interface CaliforniaCameraFrame {
  width: number; height: number;
  bearing: number; zoom: number;
  pan?: { x: number; y: number };
  center?: { x: number; z: number };
  overhead?: number;
}

/** Frame the whole state (or a centred sub-view) through a real perspective camera. */
export function frameCaliforniaMapCamera(
  camera: THREE.PerspectiveCamera, frame: CaliforniaCameraFrame,
): number {
  const tokyoFrame: TokyoMapCameraFrame = {
    bounds: californiaStateBounds,
    width: frame.width, height: frame.height,
    bearing: frame.bearing, zoom: frame.zoom,
    pan: frame.pan, center: frame.center, overhead: frame.overhead,
    summit: californiaSummit(),
  };
  return frameTokyoMapCamera(camera, tokyoFrame);
}

export function measureCaliforniaGroundScale(
  camera: THREE.PerspectiveCamera, width: number, height: number,
): number {
  return measureTokyoGroundScale(camera, width, height);
}

export function readCaliforniaCameraPose(camera: THREE.PerspectiveCamera): CaliforniaCameraPose {
  return readTokyoCameraPose(camera);
}

export function applyCaliforniaCameraFlight(
  camera: THREE.PerspectiveCamera, from: CaliforniaCameraPose,
  to: CaliforniaCameraPose, fraction: number,
): void {
  applyTokyoCameraFlight(camera, from, to, fraction);
}
