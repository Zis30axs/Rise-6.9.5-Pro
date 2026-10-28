import * as THREE from 'three';
import { applySandboxFrame } from './sandbox-camera';
import { createTakaoGeometry } from './takao-geometry';
import type { CampusMapScope } from './campus-map-layout';
import {
  buildingBaseY, cityDistrictAt, cityGrove, sceneAreas, sceneBounds, scenePaths, takaoElevation, takaoPeak, worldBuildings, worldSites,
} from './world-layout';

export interface CitySandboxView {
  width: number;
  height: number;
  bearing: number;
  scope: CampusMapScope;
  viewScale: number;
  hour: number;
  selectedId: string;
  reducedMotion: boolean;
}

const pickers = new WeakMap<HTMLElement, (clientX: number, clientY: number) => string | undefined>();

export function bindCitySandboxPick(root: HTMLElement, pick: (clientX: number, clientY: number) => string | undefined) {
  pickers.set(root, pick);
}

export function pickCitySandbox(viewport: HTMLElement, clientX: number, clientY: number) {
  const root = viewport.querySelector('[data-sandbox-live="true"]');
  return root instanceof HTMLElement ? pickers.get(root)?.(clientX, clientY) : undefined;
}

const districtColors: Record<string, number> = {
  campus: 0xd9c9a6,
  neighborhood: 0xddd0b6,
  home: 0xd4c4ae,
  commercial: 0xdccbb6,
  downtown: 0xd2c6b4,
  'city-park': 0xb7cba4,
  'grand-commercial': 0xcbc2c6,
  'takao-mountain': 0xa9c49a,
};

function windowTexture(owner: Document) {
  const canvas = owner.createElement('canvas');
  canvas.width = 64;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.fillStyle = '#efe6d4';
  context.fillRect(0, 0, 64, 128);
  for (let y = 10; y < 120; y += 22) {
    for (let x = 6; x < 60; x += 16) {
      const lit = (x + y) % 32 !== 0;
      context.fillStyle = lit ? '#f2c98a' : '#6f8d90';
      context.fillRect(x, y, 8, 12);
      context.fillStyle = '#8d7c62';
      context.strokeStyle = '#8d7c62';
      context.strokeRect(x - 0.5, y - 0.5, 9, 13);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

export function createCitySandbox(canvas: HTMLCanvasElement) {
  const ownerWindow = canvas.ownerDocument.defaultView;
  if (!ownerWindow) return null;
  const owner: Window = ownerWindow;
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'low-power' });
  } catch {
    return null;
  }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -500, 1400);
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const keep = (geometry: THREE.BufferGeometry, material: THREE.Material) => { geometries.add(geometry); materials.add(material); return new THREE.Mesh(geometry, material); };
  const lambert = (color: number, extra: THREE.MeshLambertMaterialParameters = {}) => {
    const material = new THREE.MeshLambertMaterial({ color, ...extra });
    materials.add(material);
    return material;
  };

  scene.background = new THREE.Color(0xd5e3ee);
  scene.fog = new THREE.FogExp2(0xd7e4ee, 0.00115);
  const hemi = new THREE.HemisphereLight(0xfff3e2, 0x6e8b72, 1.25);
  const sun = new THREE.DirectionalLight(0xffe2bc, 1.45);
  sun.position.set(-90, 140, 50);
  const fill = new THREE.DirectionalLight(0xc5d7ef, 0.35);
  fill.position.set(70, 40, -30);
  scene.add(hemi, sun, fill);

  const grass = lambert(0xc5d4b6);
  const ground = keep(new THREE.BoxGeometry(sceneBounds.maxX - sceneBounds.minX, 0.4, sceneBounds.maxZ - sceneBounds.minZ), grass);
  ground.position.set((sceneBounds.minX + sceneBounds.maxX) / 2, -0.22, (sceneBounds.minZ + sceneBounds.maxZ) / 2);
  scene.add(ground);

  const districtMeshes = new Map<string, THREE.Mesh>();
  for (const area of sceneAreas) {
    const color = districtColors[area.id];
    if (color === undefined || area.id === 'city-roads') continue;
    const pad = keep(new THREE.BoxGeometry(area.maxX - area.minX, 0.08, area.maxZ - area.minZ), lambert(color));
    pad.position.set((area.minX + area.maxX) / 2, 0.02, (area.minZ + area.maxZ) / 2);
    pad.userData.districtId = area.id === 'neighborhood' ? 'campus' : area.id;
    scene.add(pad);
    if (area.id !== 'neighborhood') districtMeshes.set(area.id, pad);
  }

  const asphalt = lambert(0x6e7874);
  const walkway = lambert(0xe6dcc4);
  const paint = lambert(0xf3edd4);
  for (const path of scenePaths) {
    const lift = takaoElevation(path.x, path.z);
    const slab = keep(new THREE.BoxGeometry(path.width, 0.06, path.depth), path.kind === 'road' ? asphalt : walkway);
    slab.position.set(path.x, 0.05 + lift, path.z);
    scene.add(slab);
    if (path.kind === 'road' && path.width > 20) {
      const mark = keep(new THREE.BoxGeometry(path.width * 0.72, 0.02, 0.18), paint);
      mark.position.set(path.x, 0.09 + lift, path.z);
      scene.add(mark);
    }
  }

  const sports = worldSites.sports;
  const field = keep(new THREE.CircleGeometry(1, 28), lambert(0xc4a07e));
  field.rotation.x = -Math.PI / 2;
  field.position.set(sports.x, 0.06, sports.z);
  field.scale.set(sports.rx, sports.ry, 1);
  scene.add(field);
  const infield = keep(new THREE.CircleGeometry(1, 24), lambert(0x8eae84));
  infield.rotation.x = -Math.PI / 2;
  infield.position.set(sports.x, 0.07, sports.z);
  infield.scale.set(sports.rx * 0.82, sports.ry * 0.86, 1);
  scene.add(infield);

  const lake = worldSites.lake;
  const waterMaterial = new THREE.MeshStandardMaterial({ color: 0x6e9aa4, roughness: 0.22, metalness: 0.08, transparent: true, opacity: 0.92 });
  materials.add(waterMaterial);
  const water = keep(new THREE.CircleGeometry(1, 28), waterMaterial);
  water.rotation.x = -Math.PI / 2;
  water.position.set(lake.x, 0.07, lake.z);
  water.scale.set(lake.rx, lake.ry, 1);
  scene.add(water);

  const park = worldSites.pocketPark;
  const parkPad = keep(new THREE.BoxGeometry(park.width, 0.05, park.depth), lambert(0x9cba8e));
  parkPad.position.set(park.x + park.width / 2, 0.06, park.z + park.depth / 2);
  scene.add(parkPad);
  const site = worldSites.worksite;
  const sitePad = keep(new THREE.BoxGeometry(site.width, 0.05, site.depth), lambert(0xc9a67a));
  sitePad.position.set(site.x + site.width / 2, 0.06, site.z + site.depth / 2);
  scene.add(sitePad);

  const mountain = keep(createTakaoGeometry(), lambert(0xffffff, { vertexColors: true }));
  scene.add(mountain);

  const facadeTexture = windowTexture(canvas.ownerDocument);
  if (facadeTexture) textures.add(facadeTexture);
  const facadeMaterials: THREE.MeshLambertMaterial[] = [];
  for (const building of worldBuildings) {
    const base = buildingBaseY(building);
    const roof = lambert(Number.parseInt(building.color.slice(1), 16));
    const facade = lambert(0xefe6d4, facadeTexture ? { map: facadeTexture } : {});
    if (facadeTexture) {
      const map = facadeTexture.clone();
      map.repeat.set(Math.max(1, building.width / 8), Math.max(1, building.height / 6));
      textures.add(map);
      facade.map = map;
    }
    facade.emissive = new THREE.Color(0xffc98a);
    facade.emissiveIntensity = 0.08;
    facadeMaterials.push(facade);
    const body = keep(new THREE.BoxGeometry(building.width, building.height, building.depth), facade);
    body.position.set(building.x, base + building.height / 2, building.z);
    if (building.rotationY) body.rotation.y = building.rotationY;
    body.userData.districtId = cityDistrictAt(building.x, building.z);
    scene.add(body);
    const cap = keep(new THREE.BoxGeometry(building.width + 0.6, 0.35, building.depth + 0.6), roof);
    cap.position.set(building.x, base + building.height + 0.15, building.z);
    scene.add(cap);
    const shadow = keep(new THREE.BoxGeometry(building.width * 0.92, 0.02, building.depth * 0.92), lambert(0x2c4034, { transparent: true, opacity: 0.16, depthWrite: false }));
    shadow.position.set(building.x + 1.4, base + 0.05, building.z + 1.6);
    scene.add(shadow);
  }

  const grove = cityGrove();
  const trunk = lambert(0x7a5a3c);
  const leafColors = [0x6e845c, 0x8d9a62, 0x547252, 0x9a8b5c];
  const crownMaterial = lambert(0xffffff);
  const trunkMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.32, 2.2, 5), trunk, Math.max(1, grove.length));
  const crownMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.15, 0), crownMaterial, Math.max(1, grove.length));
  trunkMesh.count = grove.length;
  crownMesh.count = grove.length;
  geometries.add(trunkMesh.geometry); geometries.add(crownMesh.geometry);
  const matrix = new THREE.Matrix4();
  const leafMatrix = new THREE.Matrix4();
  const scale = new THREE.Vector3();
  grove.forEach((tree, index) => {
    const y = takaoElevation(tree.x, tree.z);
    scale.set(tree.scale, tree.scale, tree.scale);
    matrix.makeScale(scale.x, scale.y, scale.z);
    matrix.setPosition(tree.x, y + 1.1 * tree.scale, tree.z);
    trunkMesh.setMatrixAt(index, matrix);
    leafMatrix.makeScale(tree.scale, tree.scale * 1.05, tree.scale);
    leafMatrix.setPosition(tree.x, y + 2.5 * tree.scale, tree.z);
    crownMesh.setMatrixAt(index, leafMatrix);
    crownMesh.setColorAt(index, new THREE.Color(leafColors[tree.tint % leafColors.length]));
  });
  if (crownMesh.instanceColor) crownMesh.instanceColor.needsUpdate = true;
  scene.add(trunkMesh, crownMesh);

  const cableA = new THREE.Vector3(-25, takaoElevation(-25, -155) + 9, -155);
  const cableB = new THREE.Vector3(takaoPeak.x, takaoElevation(takaoPeak.x, takaoPeak.z) + takaoPeak.height * 0.72, takaoPeak.z);
  const cable = keep(new THREE.CylinderGeometry(0.08, 0.08, cableA.distanceTo(cableB), 5), lambert(0x4d5c58));
  cable.position.copy(cableA).lerp(cableB, 0.5);
  cable.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), cableB.clone().sub(cableA).normalize());
  scene.add(cable);

  const agentCount = 10;
  const agentPaths = scenePaths.filter(path => path.kind === 'road' && path.width >= 8 && takaoElevation(path.x, path.z) < 1);
  const agentMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1.1, 0.7, 2.2), lambert(0xf4efe2), agentCount);
  geometries.add(agentMesh.geometry);
  agentMesh.count = Math.min(agentCount, agentPaths.length);
  scene.add(agentMesh);
  const agentMatrix = new THREE.Matrix4();
  const agentSpin = new THREE.Matrix4().makeRotationY(Math.PI / 2);
  const agentColor = new THREE.Color();

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let view: CitySandboxView = { width: 1, height: 1, bearing: 0, scope: 'city', viewScale: 1, hour: 15, selectedId: '', reducedMotion: true };
  let frame = 0;
  let running = false;
  let disposed = false;

  function applyHour(hour: number) {
    const night = hour < 6 || hour >= 19;
    const evening = hour >= 16 && hour < 19;
    hemi.intensity = night ? 0.55 : 1.25;
    hemi.color.set(night ? 0x9eb0c8 : 0xfff3e2);
    sun.intensity = night ? 0.22 : evening ? 1.15 : 1.45;
    sun.color.set(night ? 0xb7c6de : evening ? 0xffc896 : 0xffe2bc);
    const sky = night ? 0x243246 : evening ? 0xe7c7a4 : 0xd5e3ee;
    (scene.background as THREE.Color).set(sky);
    if (scene.fog instanceof THREE.FogExp2) scene.fog.color.set(sky);
    facadeMaterials.forEach(material => { material.emissiveIntensity = night ? 0.85 : evening ? 0.28 : 0.08; });
  }

  function paintAgents(now: number) {
    agentPaths.forEach((path, index) => {
      if (index >= agentCount) return;
      const along = ((now / 9000) + index * 0.17) % 1;
      const horizontal = path.width >= path.depth;
      const x = horizontal ? path.x - path.width / 2 + along * path.width : path.x + (index % 2 ? 1.4 : -1.4);
      const z = horizontal ? path.z + (index % 2 ? 1.4 : -1.4) : path.z - path.depth / 2 + along * path.depth;
      const y = 0.45 + takaoElevation(x, z);
      if (horizontal) agentMatrix.makeTranslation(x, y, z);
      else { agentMatrix.copy(agentSpin); agentMatrix.setPosition(x, y, z); }
      agentMesh.setMatrixAt(index, agentMatrix);
      agentColor.set(['#f4efe2', '#d98b73', '#7f9e8f', '#e6d39a'][index % 4]);
      agentMesh.setColorAt(index, agentColor);
    });
    agentMesh.instanceMatrix.needsUpdate = true;
    if (agentMesh.instanceColor) agentMesh.instanceColor.needsUpdate = true;
  }

  function render(now = 0) {
    frame = 0;
    if (disposed || !running) return;
    paintAgents(view.reducedMotion ? 0 : now);
    water.position.y = 0.07 + Math.sin(now / 900) * 0.012;
    try { renderer.render(scene, camera); } catch (error) { console.error(error); stop(); return; }
    if (!view.reducedMotion) frame = owner.requestAnimationFrame(render);
  }

  function stop() {
    running = false;
    if (frame) owner.cancelAnimationFrame(frame);
    frame = 0;
  }

  function start() {
    if (disposed || running) return;
    running = true;
    if (!frame) frame = owner.requestAnimationFrame(render);
  }

  function setView(next: CitySandboxView) {
    view = next;
    const ratio = Math.min(2, (owner.devicePixelRatio || 1) * Math.min(next.viewScale, 1.75));
    renderer.setPixelRatio(ratio);
    renderer.setSize(Math.max(1, next.width), Math.max(1, next.height), false);
    applySandboxFrame(camera, next.width, next.height, next.bearing, next.scope, {});
    applyHour(next.hour);
    districtMeshes.forEach((mesh, id) => {
      const material = mesh.material as THREE.MeshLambertMaterial;
      material.emissive = new THREE.Color(id === next.selectedId ? 0xf0d7a4 : 0x000000);
      material.emissiveIntensity = id === next.selectedId ? 0.28 : 0;
    });
    if (view.reducedMotion) { paintAgents(0); renderer.render(scene, camera); }
    else if (running && !frame) frame = owner.requestAnimationFrame(render);
  }

  function pick(clientX: number, clientY: number) {
    if (view.scope !== 'city') return undefined;
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return undefined;
    pointer.set((clientX - rect.left) / rect.width * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(scene.children, false).find(item => item.object.userData.districtId);
    const id = hit?.object.userData.districtId;
    return typeof id === 'string' ? `city:${id}` : undefined;
  }

  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); stop(); });

  return {
    setView, start, stop, pick,
    dispose() {
      if (disposed) return;
      disposed = true;
      stop();
      renderer.dispose();
      renderer.forceContextLoss();
      geometries.forEach(geometry => geometry.dispose());
      materials.forEach(material => material.dispose());
      textures.forEach(texture => texture.dispose());
      scene.clear();
    },
  };
}

export type CitySandboxHandle = NonNullable<ReturnType<typeof createCitySandbox>>;
