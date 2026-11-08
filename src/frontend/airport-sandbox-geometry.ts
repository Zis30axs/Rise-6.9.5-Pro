import * as THREE from 'three';
import { airportDistrict } from './airport-sandbox-layout';

/** Replace only overlapping, unaddressed skyline instances south of the city. */
function reserveAirportSite(root: THREE.Group) {
  const { minX, maxX, minZ, maxZ } = airportDistrict;
  root.updateMatrixWorld(true);
  root.traverse(object => {
    if (!(object instanceof THREE.InstancedMesh)) return;
    object.geometry.computeBoundingBox();
    const localBounds = object.geometry.boundingBox;
    if (!localBounds) return;
    const matrix = new THREE.Matrix4();
    const bounds = new THREE.Box3();
    let changed = false;
    for (let index = 0; index < object.count; index++) {
      object.getMatrixAt(index, matrix);
      bounds.copy(localBounds).applyMatrix4(matrix).applyMatrix4(object.matrixWorld);
      // The existing authored districts end at z=186. Keep their buildings,
      // low scenery and all instances outside the airport footprint intact.
      if (bounds.min.z <= 186 || bounds.max.y - bounds.min.y < 8 ||
          bounds.max.x < minX || bounds.min.x > maxX || bounds.max.z < minZ || bounds.min.z > maxZ) continue;
      matrix.scale(new THREE.Vector3(0, 0, 0));
      object.setMatrixAt(index, matrix);
      changed = true;
    }
    if (changed) {
      object.instanceMatrix.needsUpdate = true;
      object.computeBoundingBox();
      object.computeBoundingSphere();
    }
  });
}

/** Local, static sand-table architecture; never advances the simulation clock. */
export function attachAirportGeometry(root: THREE.Group): void {
  if (root.getObjectByName('haneda-airport-sandbox')) return;
  reserveAirportSite(root);
  const group = new THREE.Group();
  group.name = 'haneda-airport-sandbox';
  // Keep the site clear of the GLB's outer skyline and above its y=0 base slab.
  group.position.set(airportDistrict.x - 180, 1.5, airportDistrict.z - 260);
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  function material(color: string) {
    let result = materials.get(color);
    if (!result) {
      result = new THREE.MeshStandardMaterial({ color, roughness: .78 });
      materials.set(color, result);
    }
    return result;
  }
  function box(name: string, x: number, y: number, z: number, w: number, h: number, d: number, color: string) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material(color));
    mesh.name = name;
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  }
  const { minX, maxX, minZ, maxZ } = airportDistrict;
  box('airport-coastal-base', 180, -2, 260, maxX - minX, 2, maxZ - minZ, '#7aa9b4');
  box('airport-island', 177, -1, 258, 180, .7, 112, '#9baea4');
  box('airport-apron', 176, -.5, 259, 164, .2, 54, '#c3c6bf');
  box('airport-access-road', 148, -.75, 208, 110, .2, 7, '#53656b');
  box('airport-city-connector', 126, -.75, 196, 7, .2, 25, '#53656b');
  box('airport-forecourt', 155, -.4, 219, 94, .2, 12, '#e4ddc9');
  for (const x of [114, 126, 138, 150, 162, 174, 186]) {
    box('airport-road-marking', x, -.61, 208, 5, .05, .3, '#f4e8c4');
  }
  // A long glazed terminal, curved roof, and three boarding bridges face the apron.
  box('airport-terminal', 155, 4.8, 231, 88, 10, 17, '#d7e5e3');
  box('airport-terminal-glass', 155, 5.2, 222.4, 82, 5.7, .4, '#548396');
  box('airport-terminal-canopy', 155, 3.8, 219, 90, .5, 5, '#edf1e7');
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(9.5, 9.5, 92, 20, 1, false, 0, Math.PI), material('#eaf0e6'));
  roof.name = 'airport-terminal-roof';
  roof.rotation.z = Math.PI / 2;
  roof.position.set(155, 9.8, 231);
  group.add(roof);
  for (const x of [118, 136, 154, 172, 190]) {
    box('airport-window-mullion', x, 5.3, 222, .5, 6.5, .5, '#d7e5e3');
  }
  for (const x of [128, 155, 182]) {
    box('airport-boarding-bridge', x, 3.1, 246, 3.3, 2.4, 14, '#d1dad6');
    box('airport-gate', x, 3.1, 253, 5, 3, 4, '#789da3');
    box('airport-stand-guide', x, -.33, 266, .4, .08, 18, '#e8bf5f');
  }
  // Control tower and hangar remain scenery, not invented travel destinations.
  box('airport-control-tower', 216, 12, 222, 5, 24, 5, '#cbd6ce');
  box('airport-control-cabin', 216, 25, 222, 12, 5, 10, '#4f7e91');
  box('airport-control-roof', 216, 28, 222, 14, 1, 12, '#e5e8df');
  box('airport-hangar', 243, 5, 239, 28, 10, 22, '#c4d0ce');
  box('airport-hangar-door', 243, 4, 250.2, 22, 7, .4, '#647f87');
  box('airport-taxiway', 179, -.3, 281, 166, .15, 6, '#65767a');
  box('airport-taxiway-line', 179, -.2, 281, 160, .04, .35, '#e8bf5f');
  box('airport-runway', 179, -.3, 302, 170, .2, 15, '#485b63');
  for (const x of [112, 134, 156, 178, 200, 222, 244]) {
    box('airport-runway-centerline', x, -.16, 302, 9, .05, .45, '#f0f0df');
  }
  for (const x of [102, 256]) for (const z of [297, 299, 305, 307]) {
    box('airport-runway-threshold', x, -.16, z, 7, .05, .8, '#f0f0df');
  }
  for (const x of [111, 247]) box('airport-runway-connector', x, -.3, 291, 5, .15, 17, '#65767a');
  for (let x = 98; x <= 260; x += 12) for (const z of [293, 311]) {
    box('airport-runway-light', x, .05, z, .7, .5, .7, '#f5df9d');
  }
  // Parked civilian aircraft are deliberately separate from the existing patrol jet.
  for (const x of [128, 182]) {
    const aircraft = new THREE.Group();
    aircraft.name = 'airport-parked-airliner';
    aircraft.position.set(x, 2.4, 263);
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(1.25, 12, 4, 10), material('#f0eee3'));
    body.rotation.x = Math.PI / 2;
    const wings = new THREE.Mesh(new THREE.BoxGeometry(16, .25, 3), material('#dce4e3'));
    wings.rotation.y = -.12;
    const tail = new THREE.Mesh(new THREE.BoxGeometry(.45, 3.6, 3), material('#678ca4'));
    tail.position.set(0, 1.5, 5.5);
    const stabilizer = new THREE.Mesh(new THREE.BoxGeometry(6, .2, 2), material('#dce4e3'));
    stabilizer.position.z = 5.7;
    aircraft.add(body, wings, tail, stabilizer);
    group.add(aircraft);
  }
  // The existing disposal traversal owns all of these meshes and shared materials.
  root.add(group);
}
