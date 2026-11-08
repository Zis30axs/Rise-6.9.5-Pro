import * as THREE from 'three';
import sandboxData from '../../assets/models/unread-city-tokyo-sandbox-data.json';
import { circleSandboxOverlay } from './circle-sandbox-pack';
import { disposeThreeTree } from './dispose-three-tree';
import { tokyoCityBounds } from './tokyo-sandbox-map';
import type { TokyoAtmosphereProfile } from './tokyo-sandbox-vfx';

export interface TokyoCinematicController {
  setAtmosphere(profile: TokyoAtmosphereProfile): void;
  update(nowMs: number, reducedMotion?: boolean): void;
  dispose(): void;
}

type Corner = [number, number];
const city = tokyoCityBounds;
const centreX = (city.minX + city.maxX) / 2;
const centreZ = (city.minZ + city.maxZ) / 2;
const width = city.maxX - city.minX + 24;
const depth = city.maxZ - city.minZ + 24;

/** Chamfered display edge, independent of the simulation's ground coordinates. */
function perimeter(inset = 0): Corner[] {
  const minX = city.minX - 12 + inset, maxX = city.maxX + 12 - inset;
  const minZ = city.minZ - 12 + inset, maxZ = city.maxZ + 12 - inset;
  const corner = Math.max(2, 14 - inset * .35);
  return [
    [minX + corner, minZ], [maxX - corner, minZ],
    [maxX, minZ + corner], [maxX, maxZ - corner],
    [maxX - corner, maxZ], [minX + corner, maxZ],
    [minX, maxZ - corner], [minX, minZ + corner],
  ];
}

function section(lower: Corner[], upper: Corner[], bottom: number, top: number) {
  const positions: number[] = [];
  for (let i = 0; i < lower.length; i++) {
    const n = (i + 1) % lower.length;
    const a = [lower[i][0], bottom, lower[i][1]], b = [upper[i][0], top, upper[i][1]];
    const c = [upper[n][0], top, upper[n][1]], d = [lower[n][0], bottom, lower[n][1]];
    positions.push(...a, ...b, ...c, ...a, ...c, ...d);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function cap(points: Corner[], height: number) {
  const positions: number[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    positions.push(centreX, height, centreZ, b[0], height, b[1], a[0], height, a[1]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function ribbon(outer: Corner[], inner: Corner[], height: number) {
  const positions: number[] = [], uv: number[] = [], indices: number[] = [];
  const lengths = outer.map((p, i) => Math.hypot(p[0] - outer[(i + 1) % outer.length][0], p[1] - outer[(i + 1) % outer.length][1]));
  const total = lengths.reduce((sum, value) => sum + value, 0);
  let distance = 0;
  for (let i = 0; i <= outer.length; i++) {
    const n = i % outer.length;
    positions.push(outer[n][0], height, outer[n][1], inner[n][0], height, inner[n][1]);
    uv.push(distance / total, 0, distance / total, 1);
    if (i < outer.length) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      distance += lengths[i];
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  return geometry;
}

/** A small local texture gives the authored buildings soft contact with their plots. */
function contactTexture() {
  const size = 48, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const px = Math.abs((x + .5) / size * 2 - 1), py = Math.abs((y + .5) / size * 2 - 1);
    const dx = Math.max(0, px - .45), dy = Math.max(0, py - .45);
    const edge = Math.min(1, Math.max(0, (1 - Math.max(px, py)) * 7));
    const i = (y * size + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = 255;
    data[i + 3] = Math.round(Math.exp(-(dx * dx + dy * dy) * 10) * edge * 225);
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/** Exhibition scenery only: authored buildings, routes and map positions are untouched. */
export function createTokyoSandboxCinematic(scene: THREE.Scene, model: THREE.Group): TokyoCinematicController {
  const root = new THREE.Group();
  root.name = 'tokyo-cinematic-plinth';
  scene.add(root);

  // The original 1500 m background slab would conceal the display's vertical sides.
  // Hide only that backdrop, or the explicitly marked procedural equivalent.
  const hiddenBackdrops: THREE.Mesh[] = [];
  const box = new THREE.Box3(), size = new THREE.Vector3();
  let surfaceHeight = -.12;
  let proceduralGround = false;
  model.updateMatrixWorld(true);
  model.traverse(object => {
    if (!(object instanceof THREE.Mesh) || !object.visible) return;
    box.setFromObject(object); box.getSize(size);
    if (object.userData.tokyoBackdrop ||
      (size.x > width * 1.8 && size.z > depth * 1.8 && size.y < 6 && box.max.y < 1.5)) {
      hiddenBackdrops.push(object);
      surfaceHeight = box.max.y - .03;
      proceduralGround ||= object.userData.tokyoBackdrop === true;
      object.visible = false;
    }
  });
  // The geometric preview has lower pavement than the GLB. Keep the replacement
  // floor at the original backdrop height so it cannot cover either set of roads.
  root.position.y = surfaceHeight + .12;

  const groundMaterial = new THREE.MeshStandardMaterial({ color: '#435f5c', roughness: .94, metalness: .04 });
  const stoneMaterial = new THREE.MeshStandardMaterial({ color: '#172d39', roughness: .64, metalness: .24 });
  const bevelMaterial = new THREE.MeshStandardMaterial({ color: '#334951', roughness: .45, metalness: .32 });
  const footMaterial = new THREE.MeshStandardMaterial({ color: '#101e2c', roughness: .48, metalness: .36 });
  const brassMaterial = new THREE.MeshStandardMaterial({
    color: '#bfa16a', roughness: .3, metalness: .62, emissive: '#5f421f', emissiveIntensity: .16,
  });
  root.add(
    new THREE.Mesh(section(perimeter(-2), perimeter(-2), -27, -24.4), footMaterial),
    new THREE.Mesh(cap(perimeter(-2), -24.4), brassMaterial),
    new THREE.Mesh(section(perimeter(), perimeter(), -24.3, -3.5), stoneMaterial),
    new THREE.Mesh(section(perimeter(-.7), perimeter(.4), -3.5, -.12), bevelMaterial),
    new THREE.Mesh(cap(perimeter(.4), -.12), groundMaterial),
  );

  const edgeUniforms = {
    uTime: { value: 0 }, uGold: { value: new THREE.Color('#e6c383') }, uIntensity: { value: .8 },
  };
  const edgeMaterial = new THREE.ShaderMaterial({
    uniforms: edgeUniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `
      uniform float uTime; uniform vec3 uGold; uniform float uIntensity; varying vec2 vUv;
      void main(){
        float glint=pow(max(0.0,cos((vUv.x-uTime*.018)*6.2831853)),26.0);
        float border=sin(vUv.y*3.1415926);
        gl_FragColor=vec4(uGold*(.8+glint*.65),(.42+glint*.45)*border*uIntensity);
      }`,
  });
  root.add(new THREE.Mesh(ribbon(perimeter(-.7), perimeter(1.2), -.055), edgeMaterial));
  root.add(new THREE.Mesh(ribbon(perimeter(-2.2), perimeter(-.35), -24.25), edgeMaterial));

  // Fine stratification, chamfer seams and engraved ticks use two batched draws.
  const trim: number[] = [], engraving: number[] = [];
  const outline = perimeter(-.08);
  for (const y of [-7.5, -15.8, -21.8]) for (let i = 0; i < outline.length; i++) {
    const a = outline[i], b = outline[(i + 1) % outline.length];
    trim.push(a[0], y, a[1], b[0], y, b[1]);
  }
  for (const [x, z] of outline) trim.push(x, -4, z, x, -23.8, z);
  for (let x = city.minX + 6; x < city.maxX; x += 20) {
    const long = Math.round((x - city.minX - 6) / 20) % 5 === 0;
    const len = long ? 4.5 : 2;
    for (const z of [city.minZ - 9, city.maxZ + 9]) {
      engraving.push(x, -.04, z, x, -.04, z + (z < centreZ ? len : -len));
    }
  }
  for (let z = city.minZ + 6; z < city.maxZ; z += 20) for (const x of [city.minX - 9, city.maxX + 9]) {
    engraving.push(x, -.04, z, x + (x < centreX ? 2.6 : -2.6), -.04, z);
  }
  const trimMaterial = new THREE.LineBasicMaterial({ color: '#ba9860', transparent: true, opacity: .34 });
  const tickMaterial = new THREE.LineBasicMaterial({ color: '#e1c38a', transparent: true, opacity: .48 });
  root.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(trim, 3)), trimMaterial));
  root.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(engraving, 3)), tickMaterial));

  const stageUniforms = { uHalo: { value: new THREE.Color('#38536d') }, uIntensity: { value: .48 } };
  const stageMaterial = new THREE.ShaderMaterial({
    uniforms: stageUniforms, transparent: true, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: `
      uniform vec3 uHalo; uniform float uIntensity; varying vec2 vUv;
      void main(){
        vec2 p=(vUv-.5)*2.0;
        float d=dot(p,p);
        float halo=exp(-d*3.1);
        float shadow=exp(-d*9.0);
        vec3 color=mix(uHalo,vec3(.008,.015,.028),shadow*.93);
        gl_FragColor=vec4(color,halo*uIntensity);
      }`,
  });
  const stage = new THREE.Mesh(new THREE.PlaneGeometry(width * 1.9, depth * 1.9), stageMaterial);
  stage.rotation.x = -Math.PI / 2;
  stage.position.set(centreX, -28.2, centreZ);
  root.add(stage);

  const grid: number[] = [];
  for (let x = centreX - width * .8; x <= centreX + width * .8; x += 40) {
    grid.push(x, -28, centreZ - depth * .8, x, -28, centreZ + depth * .8);
  }
  for (let z = centreZ - depth * .8; z <= centreZ + depth * .8; z += 40) {
    grid.push(centreX - width * .8, -28, z, centreX + width * .8, -28, z);
  }
  const gridMaterial = new THREE.LineBasicMaterial({ color: '#b5b49a', transparent: true, opacity: .08, depthWrite: false });
  root.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(grid, 3)), gridMaterial));

  const buildings = [...sandboxData.buildings, ...circleSandboxOverlay.buildings];
  const shadowMaterial = new THREE.MeshBasicMaterial({
    color: '#081724', map: contactTexture(), transparent: true, opacity: .3, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });
  const contacts = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), shadowMaterial, buildings.length);
  contacts.name = 'tokyo-building-contact-shadows';
  const transform = new THREE.Object3D();
  transform.rotation.x = -Math.PI / 2;
  buildings.forEach((building, i) => {
    transform.position.set(building.x, (proceduralGround ? -1.49 : .24) - root.position.y, building.z);
    transform.scale.set(building.width + 7, building.depth + 7, 1);
    transform.updateMatrix(); contacts.setMatrixAt(i, transform.matrix);
  });
  contacts.instanceMatrix.needsUpdate = true;
  root.add(contacts);

  let disposed = false;
  return {
    setAtmosphere(profile) {
      if (disposed) return;
      const night = profile.preset === 'night' || profile.preset === 'cyber';
      const cyber = profile.preset === 'cyber';
      groundMaterial.color.set(night ? '#263f45' : profile.preset === 'dusk' ? '#46564c' : '#58726a');
      stoneMaterial.color.set(night ? '#132735' : '#20353e');
      bevelMaterial.color.set(night ? '#2c434f' : '#455958');
      edgeUniforms.uGold.value.set(cyber ? '#dcb7d2' : '#e6c383');
      edgeUniforms.uIntensity.value = night ? 1 : .8;
      brassMaterial.emissiveIntensity = night ? .32 : .16;
      trimMaterial.opacity = night ? .47 : .34;
      tickMaterial.opacity = night ? .62 : .48;
      stageUniforms.uHalo.value.copy(profile.rimColor).multiplyScalar(night ? .28 : .2);
      stageUniforms.uIntensity.value = night ? .64 : .46;
      shadowMaterial.opacity = night ? .23 : .34;
      gridMaterial.opacity = night ? .065 : .085;
    },
    update(nowMs, reducedMotion = false) {
      if (!disposed) edgeUniforms.uTime.value = reducedMotion ? 0 : Math.max(0, nowMs) * .001;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      hiddenBackdrops.forEach(object => { object.visible = true; });
      disposeThreeTree(root);
    },
  };
}
