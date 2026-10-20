import * as THREE from 'three';
import { getInteriorMovementWorld, type CampusInterior, type InteriorObstacle } from '../runtime/campus-interiors';

/** All solid furniture footprints come from the same definitions used by the reducer. */
export function createInteriorWorld(scene: THREE.Scene, room: CampusInterior, ownerDocument?: Document) {
  const group = new THREE.Group(); group.name = `interior:${room.id}`; scene.add(group);
  const movementWorld = getInteriorMovementWorld(room);
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const unit = new THREE.BoxGeometry(1, 1, 1); geometries.add(unit);
  const material = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) => {
    const value = new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra }); materials.add(value); return value;
  };
  const palette = { wall: material(0xe6ddc9), trim: material(0xa6a58f), floor: material(room.id === 'dorm-room' ? 0xa5835f : 0xc8c3b0), wood: material(0x9d7751), dark: material(0x455c57), paper: material(0xece1bc), fabric: material(0x84998c), metal: material(0x6a756b), glass: material(0x97bdbb, { emissive: 0x567a7c, emissiveIntensity: 0.13 }), board: material(0x315b50), glow: material(0xffe7af, { emissive: 0xffd28d, emissiveIntensity: 0.8 }) };
  const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = group) => {
    const mesh = new THREE.Mesh(unit, mat); mesh.position.set(x, y, z); mesh.scale.set(w, h, d); parent.add(mesh); return mesh;
  };
  const { minX, maxX, minZ, maxZ } = room.bounds;
  const width = maxX - minX, depth = maxZ - minZ;
  const cx = (maxX + minX) / 2, cz = (maxZ + minZ) / 2;
  box(width + 0.5, 0.16, depth + 0.5, palette.floor, cx, -0.08, cz);
  // Four walls are outside the walkable bounds, including the closed exit door.
  box(width + 0.5, 3.4, 0.2, palette.wall, cx, 1.7, minZ - 0.1);
  box(width + 0.5, 3.4, 0.2, palette.wall, cx, 1.7, maxZ + 0.1);
  box(0.2, 3.4, depth, palette.wall, minX - 0.1, 1.7, cz);
  box(0.2, 3.4, depth, palette.wall, maxX + 0.1, 1.7, cz);
  box(width, 0.08, depth, palette.wall, cx, 3.42, cz);
  for (const z of [minZ + 0.025, maxZ - 0.025]) box(width, 0.12, 0.06, palette.trim, cx, 0.08, z);
  for (const x of [minX + 0.025, maxX - 0.025]) box(0.06, 0.12, depth, palette.trim, x, 0.08, cz);
  box(1.35, 2.4, 0.06, palette.wood, 0, 1.2, maxZ - 0.02);
  box(0.11, 0.07, 0.09, palette.paper, 0.48, 1.03, maxZ - 0.08);
  // Window panes sit inside the walls: no network textures or outdoor actors indoors.
  for (const x of [minX + 0.12, maxX - 0.12]) for (const z of [-2.6, 0.5]) {
    box(0.04, 1.4, 2.1, palette.glass, x, 2.05, z);
    for (const offset of [-0.72, 0, 0.72]) box(0.06, 0.055, 2.18, palette.paper, x + (x < 0 ? 0.03 : -0.03), 2.05 + offset, z);
    box(0.065, 1.5, 0.06, palette.paper, x + (x < 0 ? 0.03 : -0.03), 2.05, z);
  }
  // Visible ceiling strips and warm local lighting help rooms read at eye level.
  for (const x of [-2.8, 2.8]) for (const z of [-2.3, 1.6]) box(1.7, 0.035, 0.32, palette.glow, x, 3.31, z);
  const ambient = new THREE.HemisphereLight(0xfff2d2, 0x727868, 2.5); group.add(ambient);
  const light = new THREE.PointLight(0xffdea2, 42, 16, 1.2); light.position.set(0, 3.0, 0); group.add(light);
  const daylight = new THREE.DirectionalLight(0xc8e0e0, 1.6); daylight.position.set(-4, 3, -2); group.add(daylight);
  const books = (x: number, y: number, z: number, w: number, d: number, parent: THREE.Object3D) => {
    for (let i = 0; i < 5; i++) box(Math.min(0.12, w / 9), 0.29 + (i % 2) * 0.05, Math.min(d * 0.7, 0.3), i % 2 ? palette.fabric : palette.paper, x - w * 0.3 + i * w * 0.14, y, z, parent);
  };
  const furniture = (obstacle: InteriorObstacle) => {
    const furnitureGroup = new THREE.Group(); furnitureGroup.name = `furniture:${obstacle.id}`; furnitureGroup.userData.interiorObstacle = obstacle.id; group.add(furnitureGroup);
    const w = obstacle.maxX - obstacle.minX, d = obstacle.maxZ - obstacle.minZ;
    const x = (obstacle.minX + obstacle.maxX) / 2, z = (obstacle.minZ + obstacle.maxZ) / 2;
    if (obstacle.kind === 'bed') {
      box(w, 0.35, d, palette.wood, x, 0.3, z, furnitureGroup);
      box(w * 0.95, 0.22, d * 0.95, palette.paper, x, 0.58, z, furnitureGroup);
      box(w * 0.96, 0.09, d * 0.65, palette.fabric, x, 0.73, z + d * 0.14, furnitureGroup);
      box(w * 0.7, 0.14, Math.min(0.45, d * 0.2), palette.paper, x, 0.77, z - d * 0.33, furnitureGroup);
      box(w, 0.75, 0.08, palette.wood, x, 0.62, z - d / 2 + 0.04, furnitureGroup);
    } else if (obstacle.kind === 'desk' || obstacle.kind === 'podium') {
      const top = obstacle.kind === 'podium' ? 1.05 : 0.78;
      box(w, 0.12, d, palette.wood, x, top, z, furnitureGroup);
      for (const dx of [-w * 0.42, w * 0.42]) for (const dz of [-d * 0.35, d * 0.35]) box(0.07, top, 0.07, palette.metal, x + dx, top / 2, z + dz, furnitureGroup);
      box(w * 0.35, 0.025, d * 0.5, palette.paper, x, top + 0.075, z, furnitureGroup);
      if (room.id === 'dorm-room') {
        box(Math.min(w * 0.5, 0.7), 0.4, 0.05, palette.dark, x, top + 0.33, z - d * 0.2, furnitureGroup);
        box(0.08, 0.18, 0.08, palette.metal, x, top + 0.12, z - d * 0.2, furnitureGroup);
      }
    } else if (obstacle.kind === 'piano') {
      // Reuse low-cost primitives; visible piano stays inside its saved collision footprint.
      box(w, 0.9, d, palette.dark, x, 0.65, z, furnitureGroup);
      box(w * 0.88, 0.08, d * 0.32, palette.paper, x, 1.14, z + d * 0.24, furnitureGroup);
      for (let key = 0; key < 12; key++) {
        const xx = x - w * 0.38 + key * w * 0.069;
        box(w * 0.03, 0.04, d * 0.18, palette.dark, xx, 1.2, z + d * 0.27, furnitureGroup);
      }
      box(w * 0.92, 0.08, d * 0.9, palette.wood, x, 1.24, z, furnitureGroup);
    } else if (obstacle.kind === 'board') {
      const wide = w >= d;
      box(w, 1.35, d, palette.trim, x, 1.9, z, furnitureGroup);
      box(wide ? w * 0.94 : w + 0.015, 1.2, wide ? d + 0.015 : d * 0.94, palette.board, x, 1.9, z, furnitureGroup);
      if (wide) for (let i = 0; i < 3; i++) box(w * (0.4 - i * 0.06), 0.025, d + 0.025, palette.paper, x - w * 0.12, 2.15 - i * 0.2, z, furnitureGroup);
    } else {
      const h = obstacle.kind === 'wardrobe' ? 2.15 : 2.0;
      box(w, h, d, palette.wood, x, h / 2, z, furnitureGroup);
      if (obstacle.kind === 'wardrobe') {
        box(w * 0.025, h * 0.9, d + 0.02, palette.trim, x, h / 2, z, furnitureGroup);
        for (const dx of [-0.1, 0.1]) box(0.025, 0.24, d + 0.04, palette.paper, x + dx, 1.1, z, furnitureGroup);
      } else {
        // Open shelves face the central aisle. Every shelf stays in its collision footprint.
        const front = z + (z > 0 ? -1 : 1) * Math.max(0, d / 2 - Math.max(d * 0.075, Math.min(d * 0.7, 0.3) / 2) - 0.04);
        box(w * 0.91, h * 0.88, d * 0.15, palette.dark, x, h / 2, front, furnitureGroup);
        for (let row = 0; row < 4; row++) {
          box(w * 0.94, 0.055, d * 0.85, palette.paper, x, 0.18 + row * 0.48, z, furnitureGroup);
          books(x, 0.39 + row * 0.48, front, w, d, furnitureGroup);
        }
      }
    }
  };
  room.obstacles.forEach(furniture);
  // A small rug gives the dorm entrance a clear orientation without adding a collider.
  if (room.id === 'dorm-room') box(2.0, 0.012, 1.3, palette.fabric, 0, 0.012, 2.9);
  const markerGeometry = new THREE.RingGeometry(0.32, 0.38, 24); geometries.add(markerGeometry);
  const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xcda66b, side: THREE.DoubleSide, transparent: true, opacity: 0.65 }); materials.add(markerMaterial);
  for (const interaction of room.interactions) {
    const ring = new THREE.Mesh(markerGeometry, markerMaterial); ring.rotation.x = -Math.PI / 2; ring.position.set(interaction.x, 0.025, interaction.z); ring.userData.interiorAction = interaction.id; group.add(ring);
  }
  if (ownerDocument) {
    const labelCanvas = ownerDocument.createElement('canvas'); labelCanvas.width = 512; labelCanvas.height = 128;
    const context = labelCanvas.getContext('2d');
    if (context) {
      context.fillStyle = '#415c50'; context.fillRect(0, 0, 512, 128); context.fillStyle = '#ffedc6'; context.font = 'bold 46px sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(`${room.label} · 出口`, 256, 64, 480);
      const texture = new THREE.CanvasTexture(labelCanvas); texture.colorSpace = THREE.SRGBColorSpace; textures.add(texture);
      const signMaterial = new THREE.MeshBasicMaterial({ map: texture }); materials.add(signMaterial);
      const geometry = new THREE.PlaneGeometry(1.7, 0.42); geometries.add(geometry);
      const sign = new THREE.Mesh(geometry, signMaterial); sign.rotation.y = Math.PI; sign.position.set(0, 2.72, maxZ - 0.035); group.add(sign);
    }
  }
  let disposed = false;
  return {
    group, movementWorld,
    setTime(hour: number) { const night = hour < 6 || hour >= 20; ambient.intensity = night ? 1.5 : 2.5; daylight.intensity = night ? 0.25 : 1.6; light.intensity = night ? 53 : 42; },
    dispose() { if (disposed) return; disposed = true; group.removeFromParent(); group.clear(); geometries.forEach(item => item.dispose()); materials.forEach(item => item.dispose()); textures.forEach(item => item.dispose()); },
  };
}
