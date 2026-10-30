import * as THREE from 'three';
import { takaoElevation, takaoPeak } from './world-layout';

/** Shared hill mesh. Vertices are already in world metres. */
export function createTakaoGeometry(segments = 36) {
  const geometry = new THREE.PlaneGeometry(takaoPeak.radius * 2, takaoPeak.radius * 2, segments, segments);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  for (let index = 0; index < position.count; index++) {
    const x = position.getX(index) + takaoPeak.x;
    const z = position.getZ(index) + takaoPeak.z;
    const height = takaoElevation(x, z);
    position.setXYZ(index, x, Math.max(height, 0.04), z);
    const shade = height / takaoPeak.height;
    colors[index * 3] = 0.34 + shade * 0.18;
    colors[index * 3 + 1] = 0.46 + (1 - shade) * 0.16;
    colors[index * 3 + 2] = 0.3 + shade * 0.05;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}
