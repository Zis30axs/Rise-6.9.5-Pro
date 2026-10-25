import * as THREE from 'three';
import { switchEase } from './protagonist-switch';

export interface SwitchSceneHandle {
  focus(): void;
  flushPresence(): void;
  setSwitchCamera(lift: number): boolean;
  clearSwitchCamera(): void;
  presentationReady(): boolean;
}

/** A display-only camera pose. Player eye, yaw and presence stay untouched. */
export function createSwitchCamera(camera: THREE.PerspectiveCamera, eye: THREE.Vector3) {
  const original = { position: camera.position.clone(), rotation: camera.quaternion.clone(), fov: camera.fov, far: camera.far };
  const aerial = camera.clone();
  aerial.position.set(eye.x, 145, eye.z + 35);
  aerial.lookAt(eye.x, 0, eye.z);
  return {
    apply(lift: number) {
      const t = switchEase(lift);
      camera.position.lerpVectors(original.position, aerial.position, t);
      camera.quaternion.slerpQuaternions(original.rotation, aerial.quaternion, t);
      camera.fov = THREE.MathUtils.lerp(original.fov, 72, t);
      camera.far = Math.max(original.far, 800);
      camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    },
    restore() {
      camera.position.copy(original.position); camera.quaternion.copy(original.rotation);
      camera.fov = original.fov; camera.far = original.far;
      camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    },
  };
}
