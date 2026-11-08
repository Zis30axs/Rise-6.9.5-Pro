import * as THREE from 'three';

/** Only pass trees owned by this renderer; deduplicate shared geometry/materials. */
export function disposeThreeTree(...roots: THREE.Object3D[]) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const bitmaps = new Set<{ close(): void }>();
  for (const root of roots) root.traverse(object => {
    if (object instanceof THREE.InstancedMesh) object.dispose();
    if (!(object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.Line)) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    }
  });
  for (const texture of textures) {
    const bitmap: unknown = texture.source?.data;
    texture.dispose();
    if (bitmap && typeof bitmap === 'object' && 'close' in bitmap && typeof bitmap.close === 'function') {
      bitmaps.add(bitmap as {close(): void});
    }
  }
  bitmaps.forEach(bitmap => bitmap.close());
  materials.forEach(material => material.dispose());
  geometries.forEach(geometry => geometry.dispose());
  roots.forEach(root => { root.removeFromParent(); root.clear(); });
}
