import * as THREE from 'three';

export type TokyoAtmosphereMode = 'auto' | 'day' | 'dusk' | 'night' | 'cyber';
export type ResolvedAtmospherePreset = 'day' | 'dusk' | 'night' | 'cyber';

export interface TokyoAtmosphereProfile {
  preset: ResolvedAtmospherePreset;
  label: string;
  zenithColor: THREE.Color;
  horizonColor: THREE.Color;
  nadirColor: THREE.Color;
  sunColor: THREE.Color;
  sunDirection: THREE.Vector3;
  hemiSkyColor: THREE.Color;
  hemiGroundColor: THREE.Color;
  hemiIntensity: number;
  sunIntensity: number;
  rimColor: THREE.Color;
  rimIntensity: number;
  fogColor: THREE.Color;
  fogDensity: number;
  exposure: number;
  windowEmissiveBoost: number;
  lampIntensity: number;
  beamOpacity: number;
  starIntensity: number;
  rainIntensity: number;
}

const PROFILES: Record<ResolvedAtmospherePreset, TokyoAtmosphereProfile> = {
  day: {
    preset: 'day',
    label: '晴昼流光',
    zenithColor: new THREE.Color('#2b6cb0'),
    horizonColor: new THREE.Color('#b8e2f8'),
    nadirColor: new THREE.Color('#7ca392'),
    sunColor: new THREE.Color('#fff7e6'),
    sunDirection: new THREE.Vector3(-0.38, 0.78, 0.49).normalize(),
    hemiSkyColor: new THREE.Color('#ffffff'),
    hemiGroundColor: new THREE.Color('#6e837b'),
    hemiIntensity: 2.35,
    sunIntensity: 1.85,
    rimColor: new THREE.Color('#bae6fd'),
    rimIntensity: 0.75,
    fogColor: new THREE.Color('#cfe8f7'),
    fogDensity: 0.00055,
    exposure: 1.18,
    windowEmissiveBoost: 0.45,
    lampIntensity: 0.0,
    beamOpacity: 0.0,
    starIntensity: 0.0,
    rainIntensity: 0.0,
  },
  dusk: {
    preset: 'dusk',
    label: '逢魔夕照',
    zenithColor: new THREE.Color('#1e2952'),
    horizonColor: new THREE.Color('#ff7b54'),
    nadirColor: new THREE.Color('#3b2338'),
    sunColor: new THREE.Color('#ff9a44'),
    sunDirection: new THREE.Vector3(-0.68, 0.34, 0.65).normalize(),
    hemiSkyColor: new THREE.Color('#ffb07c'),
    hemiGroundColor: new THREE.Color('#3d354b'),
    hemiIntensity: 1.65,
    sunIntensity: 2.25,
    rimColor: new THREE.Color('#c084fc'),
    rimIntensity: 0.85,
    fogColor: new THREE.Color('#e88d72'),
    fogDensity: 0.00075,
    exposure: 1.16,
    windowEmissiveBoost: 1.95,
    lampIntensity: 0.85,
    beamOpacity: 0.32,
    starIntensity: 0.35,
    rainIntensity: 0.0,
  },
  night: {
    preset: 'night',
    label: '璀璨夜景',
    zenithColor: new THREE.Color('#050b1a'),
    horizonColor: new THREE.Color('#13294b'),
    nadirColor: new THREE.Color('#040812'),
    sunColor: new THREE.Color('#8ab4f8'),
    sunDirection: new THREE.Vector3(0.42, 0.72, -0.55).normalize(),
    hemiSkyColor: new THREE.Color('#3b629b'),
    hemiGroundColor: new THREE.Color('#101827'),
    hemiIntensity: 1.05,
    sunIntensity: 0.78,
    rimColor: new THREE.Color('#38bdf8'),
    rimIntensity: 0.92,
    fogColor: new THREE.Color('#0d1b33'),
    fogDensity: 0.00072,
    exposure: 1.24,
    windowEmissiveBoost: 3.2,
    lampIntensity: 1.35,
    beamOpacity: 0.68,
    starIntensity: 0.95,
    rainIntensity: 0.0,
  },
  cyber: {
    preset: 'cyber',
    label: '赛博雨夜',
    zenithColor: new THREE.Color('#07051a'),
    horizonColor: new THREE.Color('#2a164d'),
    nadirColor: new THREE.Color('#050510'),
    sunColor: new THREE.Color('#38bdf8'),
    sunDirection: new THREE.Vector3(0.35, 0.76, -0.54).normalize(),
    hemiSkyColor: new THREE.Color('#6366f1'),
    hemiGroundColor: new THREE.Color('#0f172a'),
    hemiIntensity: 1.12,
    sunIntensity: 0.85,
    rimColor: new THREE.Color('#f472b6'),
    rimIntensity: 1.1,
    fogColor: new THREE.Color('#161130'),
    fogDensity: 0.00088,
    exposure: 1.28,
    windowEmissiveBoost: 3.85,
    lampIntensity: 1.55,
    beamOpacity: 0.88,
    starIntensity: 0.65,
    rainIntensity: 1.0,
  },
};

export function resolveTokyoAtmosphere(
  mode: TokyoAtmosphereMode,
  clockMinutes = 780,
): TokyoAtmosphereProfile {
  if (mode !== 'auto') return PROFILES[mode];
  const minutesInDay = ((clockMinutes % 1440) + 1440) % 1440;
  const hour = minutesInDay / 60;
  if (hour >= 6 && hour < 16.25) return PROFILES.day;
  if (hour >= 16.25 && hour < 19) return PROFILES.dusk;
  if (hour >= 19 && hour < 23.25) return PROFILES.night;
  return PROFILES.cyber;
}

function createRadialGlowTexture(): THREE.DataTexture {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  const half = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dist = Math.min(1, Math.hypot(x - half, y - half) / half);
      const falloff = Math.pow(1 - dist, 2.2);
      const idx = (y * size + x) * 4;
      data[idx] = 255;
      data[idx + 1] = Math.round(215 + 40 * (1 - dist));
      data[idx + 2] = Math.round(140 + 115 * Math.pow(1 - dist, 1.6));
      data[idx + 3] = Math.round(255 * falloff);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.needsUpdate = true;
  return texture;
}

const SKY_VERTEX_SHADER = /* glsl */ `
  varying vec3 vWorldPos;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const SKY_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uNadir;
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;
  uniform float uStarIntensity;
  uniform float uTime;
  varying vec3 vWorldPos;

  float hash3(vec3 p) {
    p = fract(p * vec3(443.897, 441.423, 437.195));
    p += dot(p, p.yzx + 19.19);
    return fract((p.x + p.y) * p.z);
  }

  void main() {
    vec3 dir = normalize(vWorldPos);
    float y = dir.y;
    vec3 sky = y >= 0.0
      ? mix(uHorizon, uZenith, pow(clamp(y, 0.0, 1.0), 0.55))
      : mix(uHorizon, uNadir, pow(clamp(-y, 0.0, 1.0), 0.7));

    // Horizon atmospheric scattering band
    float horizonGlow = exp(-abs(y) * 9.5);
    sky += uHorizon * horizonGlow * 0.22;

    // Solar / Lunar disc and Mie scattering halo
    float sunDot = max(0.0, dot(dir, normalize(uSunDir)));
    sky += uSunColor * pow(sunDot, 14.0) * 0.35;
    sky += uSunColor * smoothstep(0.9965, 0.9994, sunDot) * 1.35;

    // High-altitude starfield & subtle aurora waves at night
    if (uStarIntensity > 0.01 && y > 0.04) {
      vec3 starCell = floor(dir * 260.0);
      float h = hash3(starCell);
      if (h > 0.9945) {
        float twinkle = 0.55 + 0.45 * sin(uTime * 3.2 + h * 620.0);
        float fade = smoothstep(0.04, 0.28, y);
        sky += vec3(0.88, 0.94, 1.0) * twinkle * fade * uStarIntensity * 1.4;
      }
      // Subtle cyber/night aurora ribbon
      float aurora = sin(dir.x * 6.0 + uTime * 0.4) * cos(dir.z * 5.0 - uTime * 0.3);
      float auroraBand = smoothstep(0.18, 0.45, y) * (1.0 - smoothstep(0.45, 0.78, y));
      sky += mix(vec3(0.05, 0.55, 0.75), vec3(0.55, 0.18, 0.75), 0.5 + 0.5 * aurora)
        * max(0.0, aurora) * auroraBand * uStarIntensity * 0.14;
    }

    gl_FragColor = vec4(sky, 1.0);
  }
`;

interface EmissiveEntry {
  material: THREE.MeshStandardMaterial;
  baseEmissive: THREE.Color;
  isNightWindow: boolean;
}

interface CachedModelCatalog {
  emissiveEntries: EmissiveEntry[];
  waterMaterials: THREE.MeshStandardMaterial[];
  streetlampPositions: THREE.Vector3[];
}

const modelCatalogCache = new WeakMap<THREE.Group, CachedModelCatalog>();

function getModelCatalog(model: THREE.Group): CachedModelCatalog {
  const existing = modelCatalogCache.get(model);
  if (existing) return existing;

  const emissiveEntries: EmissiveEntry[] = [];
  const waterMaterials: THREE.MeshStandardMaterial[] = [];
  const streetlampPositions: THREE.Vector3[] = [];
  const seenMaterials = new Set<THREE.Material>();

  const container = model.children.length === 1 && model.children[0].children.length > 30
    ? model.children[0]
    : model;

  for (const child of container.children) {
    if (child.children.length === 3 && Math.abs(child.position.y) < 1.2) {
      const bulb = child.children[2];
      streetlampPositions.push(new THREE.Vector3(
        child.position.x + (bulb?.position.x ?? 0.62),
        child.position.y + (bulb?.position.y ?? 4.05),
        child.position.z + (bulb?.position.z ?? 0),
      ));
    }
  }

  model.traverse(obj => {
    if (!(obj instanceof THREE.Mesh)) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of mats) {
      if (!(mat instanceof THREE.MeshStandardMaterial) || seenMaterials.has(mat)) continue;
      seenMaterials.add(mat);

      const emSum = mat.emissive.r + mat.emissive.g + mat.emissive.b;
      if (emSum > 0.04) {
        emissiveEntries.push({
          material: mat,
          baseEmissive: mat.emissive.clone(),
          isNightWindow: false,
        });
      } else if (mat.transparent && mat.opacity < 0.88 && mat.roughness <= 0.25) {
        emissiveEntries.push({
          material: mat,
          baseEmissive: new THREE.Color('#ffbe6b'),
          isNightWindow: true,
        });
      }

      if (mat.color.b > 0.65 && mat.color.r < 0.22 && mat.roughness < 0.25) {
        waterMaterials.push(mat);
      }
    }
  });

  const catalog: CachedModelCatalog = { emissiveEntries, waterMaterials, streetlampPositions };
  modelCatalogCache.set(model, catalog);
  return catalog;
}

interface FlareParticle {
  active: boolean;
  age: number;
  life: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  mesh: THREE.Mesh;
}

interface SearchlightBeam {
  pivot: THREE.Object3D;
  material: THREE.MeshBasicMaterial;
  baseX: number;
  baseZ: number;
  phase: number;
  speed: number;
}

interface CloudCluster {
  group: THREE.Group;
  speed: number;
  baseY: number;
  phase: number;
}

export interface TokyoSandboxVfxController {
  root: THREE.Group;
  update: (
    dt: number,
    nowMs: number,
    su30Node: THREE.Object3D | undefined,
    playerWorldPos: { x: number; z: number } | undefined,
    districtCenter: { x: number; z: number } | undefined,
  ) => void;
  setAtmosphere: (mode: TokyoAtmosphereMode, clockMinutes?: number) => TokyoAtmosphereProfile;
  triggerSu30Flares: (su30Node?: THREE.Object3D) => void;
  dispose: () => void;
}

export function createTokyoSandboxVfx(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  model: THREE.Group,
  hemiLight: THREE.HemisphereLight,
  sunLight: THREE.DirectionalLight,
): TokyoSandboxVfxController {
  const root = new THREE.Group();
  root.name = 'tokyo-ultra-max-vfx';
  scene.add(root);

  // Fast secondary rim/fill directional light (zero cubemap/shadowmap shader stall!)
  const rimLight = new THREE.DirectionalLight('#bae6fd', 0.75);
  rimLight.position.set(220, 260, -240);
  root.add(rimLight);

  const fog = new THREE.FogExp2('#cfe8f7', 0.00055);
  scene.fog = fog;

  // Custom GLSL Sky Dome & Volumetric Horizon Glow Ring
  const skyUniforms = {
    uZenith: { value: PROFILES.day.zenithColor.clone() },
    uHorizon: { value: PROFILES.day.horizonColor.clone() },
    uNadir: { value: PROFILES.day.nadirColor.clone() },
    uSunColor: { value: PROFILES.day.sunColor.clone() },
    uSunDir: { value: PROFILES.day.sunDirection.clone() },
    uStarIntensity: { value: 0.0 },
    uTime: { value: 0.0 },
  };
  const skyMat = new THREE.ShaderMaterial({
    vertexShader: SKY_VERTEX_SHADER,
    fragmentShader: SKY_FRAGMENT_SHADER,
    uniforms: skyUniforms,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const skyDome = new THREE.Mesh(new THREE.SphereGeometry(2200, 32, 18), skyMat);
  skyDome.renderOrder = -10;
  root.add(skyDome);

  const horizonRingMat = new THREE.MeshBasicMaterial({
    color: '#ff9a5c',
    transparent: true,
    opacity: 0.16,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const horizonRing = new THREE.Mesh(
    new THREE.CylinderGeometry(360, 410, 88, 48, 1, true),
    horizonRingMat,
  );
  horizonRing.position.set(16, 28, -10);
  root.add(horizonRing);

  // Retrieve cached GLB catalog (windows, water, and 56 streetlamps) in O(1) on repeat opens
  const { emissiveEntries, waterMaterials, streetlampPositions } = getModelCatalog(model);

  // Create instanced glowing bulbs & light pools for all 56 streetlamps
  const glowTex = createRadialGlowTexture();
  const lampGroup = new THREE.Group();
  const lampBulbMat = new THREE.MeshBasicMaterial({
    color: '#ffd27d',
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const lampPoolMat = new THREE.MeshBasicMaterial({
    color: '#ffb85c',
    map: glowTex,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const bulbGeom = new THREE.SphereGeometry(0.55, 8, 8);
  const poolGeom = new THREE.PlaneGeometry(7.2, 7.2);
  poolGeom.rotateX(-Math.PI / 2);

  if (streetlampPositions.length > 0) {
    const bulbInst = new THREE.InstancedMesh(bulbGeom, lampBulbMat, streetlampPositions.length);
    const poolInst = new THREE.InstancedMesh(poolGeom, lampPoolMat, streetlampPositions.length);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < streetlampPositions.length; i++) {
      const pos = streetlampPositions[i];
      dummy.position.copy(pos);
      dummy.updateMatrix();
      bulbInst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(pos.x, 0.26, pos.z);
      dummy.updateMatrix();
      poolInst.setMatrixAt(i, dummy.matrix);
    }
    bulbInst.instanceMatrix.needsUpdate = true;
    poolInst.instanceMatrix.needsUpdate = true;
    lampGroup.add(bulbInst, poolInst);
  }
  root.add(lampGroup);

  // 4. Su-30SM2 Ultra-Max Supersonic VFX (Mach shock diamonds, vapor cone, wingtip contrails, flares)
  let su30Attached: THREE.Object3D | undefined;
  const su30LocalVfx = new THREE.Group();
  su30LocalVfx.name = 'su30-local-vfx';

  // 4a. Twin Mach Shock-Diamond Afterburner Plumes
  const afterburnerGroup = new THREE.Group();
  const outerPlumeMat = new THREE.MeshBasicMaterial({
    color: '#ff6b1a',
    transparent: true,
    opacity: 0.86,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const corePlumeMat = new THREE.MeshBasicMaterial({
    color: '#e0f2fe',
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const diamondMat = new THREE.MeshBasicMaterial({
    color: '#38bdf8',
    transparent: true,
    opacity: 0.88,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const outerPlumeGeom = new THREE.ConeGeometry(0.46, 5.2, 14, 1, true);
  outerPlumeGeom.rotateX(-Math.PI / 2);
  const corePlumeGeom = new THREE.ConeGeometry(0.24, 3.4, 10);
  corePlumeGeom.rotateX(-Math.PI / 2);
  const diamondGeom = new THREE.RingGeometry(0.08, 0.28, 14);

  for (const side of [-0.95, 0.95]) {
    const nozzleGroup = new THREE.Group();
    nozzleGroup.position.set(side, -0.1, -10.8);
    const outer = new THREE.Mesh(outerPlumeGeom, outerPlumeMat);
    outer.position.z = -2.2;
    const core = new THREE.Mesh(corePlumeGeom, corePlumeMat);
    core.position.z = -1.3;
    nozzleGroup.add(outer, core);
    for (let d = 0; d < 5; d++) {
      const ring = new THREE.Mesh(diamondGeom, diamondMat);
      ring.position.z = -0.55 - d * 0.78;
      ring.scale.setScalar(1 - d * 0.14);
      nozzleGroup.add(ring);
    }
    afterburnerGroup.add(nozzleGroup);
  }
  su30LocalVfx.add(afterburnerGroup);

  // 4b. Transonic Prandtl-Glauert Vapor Cone (跨音速音爆云)
  const vaporConeMat = new THREE.MeshBasicMaterial({
    color: '#f0f9ff',
    transparent: true,
    opacity: 0.0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const vaporConeGeom = new THREE.ConeGeometry(4.2, 5.4, 28, 1, true);
  vaporConeGeom.rotateX(Math.PI / 2);
  const vaporCone = new THREE.Mesh(vaporConeGeom, vaporConeMat);
  vaporCone.position.set(0, 0.15, -1.8);
  const vaporConeInner = new THREE.Mesh(vaporConeGeom, vaporConeMat);
  vaporConeInner.position.set(0, 0.15, -3.4);
  vaporConeInner.scale.set(0.72, 0.72, 0.68);
  su30LocalVfx.add(vaporCone, vaporConeInner);

  // 4c. Navigation Lights & Anti-Collision Strobe on Su-30SM2
  const navRedMat = new THREE.MeshBasicMaterial({ color: '#ff2e4c', blending: THREE.AdditiveBlending });
  const navGreenMat = new THREE.MeshBasicMaterial({ color: '#22c55e', blending: THREE.AdditiveBlending });
  const strobeWhiteMat = new THREE.MeshBasicMaterial({
    color: '#ffffff',
    transparent: true,
    opacity: 1,
    blending: THREE.AdditiveBlending,
  });
  const navSphere = new THREE.SphereGeometry(0.24, 8, 8);
  const portLight = new THREE.Mesh(navSphere, navRedMat);
  portLight.position.set(5.35, 0.05, -2.6);
  const starboardLight = new THREE.Mesh(navSphere, navGreenMat);
  starboardLight.position.set(-5.35, 0.05, -2.6);
  const dorsalStrobe = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 8), strobeWhiteMat);
  dorsalStrobe.position.set(0, 1.35, -1.2);
  su30LocalVfx.add(portLight, starboardLight, dorsalStrobe);

  // 4d. World-Space Wingtip Vortex Contrail Ribbons (90 segments per wingtip)
  const TRAIL_LEN = 90;
  function createWingtipRibbon() {
    const positions = new Float32Array(TRAIL_LEN * 2 * 3);
    const colors = new Float32Array(TRAIL_LEN * 2 * 4);
    for (let i = 0; i < TRAIL_LEN; i++) {
      const alpha = Math.pow(1 - i / (TRAIL_LEN - 1), 1.6) * 0.62;
      for (let side = 0; side < 2; side++) {
        const idx = (i * 2 + side) * 4;
        colors[idx] = 0.88;
        colors[idx + 1] = 0.96;
        colors[idx + 2] = 1.0;
        colors[idx + 3] = alpha;
      }
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 4));
    const indices: number[] = [];
    for (let i = 0; i < TRAIL_LEN - 1; i++) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      indices.push(a, b, c, b, d, c);
    }
    geom.setIndex(indices);
    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.frustumCulled = false;
    root.add(mesh);
    return {
      mesh,
      history: [] as { left: THREE.Vector3; right: THREE.Vector3 }[],
    };
  }
  const leftContrail = createWingtipRibbon();
  const rightContrail = createWingtipRibbon();

  // 4e. Tactical Countermeasure Flare Salvo Pool (天使之翼热诱饵弹)
  const flarePool: FlareParticle[] = [];
  const flareGeom = new THREE.SphereGeometry(0.65, 8, 8);
  const flareMat = new THREE.MeshBasicMaterial({
    color: '#fff3b0',
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  for (let i = 0; i < 36; i++) {
    const mesh = new THREE.Mesh(flareGeom, flareMat.clone());
    mesh.visible = false;
    root.add(mesh);
    flarePool.push({
      active: false,
      age: 0,
      life: 2.2,
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      mesh,
    });
  }
  let flareBurstRemaining = 0;
  let flareBurstCooldown = 0;
  let autoFlareTimer = 5.5;
  let vaporBurstTimer = 0;

  function spawnFlarePair(su30Node: THREE.Object3D) {
    su30Node.updateMatrixWorld(true);
    const origin = new THREE.Vector3(0, 0.2, -9.5).applyMatrix4(su30Node.matrixWorld);
    const rightAxis = new THREE.Vector3(1, 0, 0).transformDirection(su30Node.matrixWorld);
    const upAxis = new THREE.Vector3(0, 1, 0).transformDirection(su30Node.matrixWorld);
    const backAxis = new THREE.Vector3(0, 0, -1).transformDirection(su30Node.matrixWorld);

    for (const sign of [-1, 1]) {
      const slot = flarePool.find(f => !f.active);
      if (!slot) break;
      slot.active = true;
      slot.age = 0;
      slot.life = 1.9 + Math.random() * 0.6;
      slot.pos.copy(origin).addScaledVector(rightAxis, sign * 1.2);
      slot.vel
        .copy(rightAxis)
        .multiplyScalar(sign * (18 + Math.random() * 6))
        .addScaledVector(upAxis, 7 + Math.random() * 4)
        .addScaledVector(backAxis, 14 + Math.random() * 5);
      slot.mesh.position.copy(slot.pos);
      slot.mesh.scale.setScalar(1.2);
      slot.mesh.visible = true;
    }
  }

  function triggerSu30Flares() {
    flareBurstRemaining = 8;
    flareBurstCooldown = 0;
    vaporBurstTimer = 2.4;
  }

  // 5. Elevated High-Speed Shinkansen / Express Train (新干线高速流线列车)
  const shinkansenGroup = new THREE.Group();
  const trainBodyMat = new THREE.MeshStandardMaterial({
    color: '#f8fafc',
    roughness: 0.22,
    metalness: 0.35,
  });
  const trainStripeMat = new THREE.MeshStandardMaterial({
    color: '#0ea5e9',
    emissive: '#0284c7',
    emissiveIntensity: 0.85,
    roughness: 0.25,
  });
  const trainWindowMat = new THREE.MeshBasicMaterial({
    color: '#bae6fd',
    blending: THREE.AdditiveBlending,
  });
  const carCount = 6;
  const carLen = 7.4;
  for (let c = 0; c < carCount; c++) {
    const car = new THREE.Group();
    car.position.x = -c * (carLen + 0.55);
    const body = new THREE.Mesh(new THREE.BoxGeometry(carLen, 1.45, 1.85), trainBodyMat);
    body.position.y = 0.85;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(carLen + 0.04, 0.22, 1.9), trainStripeMat);
    stripe.position.y = 0.72;
    const winStrip = new THREE.Mesh(new THREE.BoxGeometry(carLen * 0.86, 0.32, 1.92), trainWindowMat);
    winStrip.position.y = 1.08;
    car.add(body, stripe, winStrip);
    if (c === 0 || c === carCount - 1) {
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.92, 3.2, 12), trainBodyMat);
      nose.rotation.z = c === 0 ? -Math.PI / 2 : Math.PI / 2;
      nose.position.set(c === 0 ? carLen / 2 + 1.4 : -carLen / 2 - 1.4, 0.72, 0);
      car.add(nose);
    }
    shinkansenGroup.add(car);
  }
  const trainBeamGeom = new THREE.ConeGeometry(2.6, 16, 14, 1, true);
  trainBeamGeom.rotateZ(Math.PI / 2);
  const trainBeamMat = new THREE.MeshBasicMaterial({
    color: '#e0f2fe',
    transparent: true,
    opacity: 0.38,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const trainBeam = new THREE.Mesh(trainBeamGeom, trainBeamMat);
  trainBeam.position.set(carLen / 2 + 9.5, 0.65, 0);
  shinkansenGroup.add(trainBeam);
  shinkansenGroup.position.set(-190, 0.32, 43.2);
  root.add(shinkansenGroup);
  let trainX = -190;

  // 6. Patrolling Helicopter with Sweeping Volumetric Searchlight
  const heliGroup = new THREE.Group();
  const heliBodyMat = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.3, metalness: 0.65 });
  const heliCockpitMat = new THREE.MeshBasicMaterial({ color: '#38bdf8', transparent: true, opacity: 0.75 });
  const fuselage = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.35, 4.2), heliBodyMat);
  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.95, 10, 8), heliCockpitMat);
  cockpit.position.set(0, 0.05, 1.45);
  const tailBoom = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.48, 3.8), heliBodyMat);
  tailBoom.position.set(0, 0.25, -3.4);
  const rotorMat = new THREE.MeshBasicMaterial({
    color: '#94a3b8',
    transparent: true,
    opacity: 0.42,
    side: THREE.DoubleSide,
  });
  const mainRotor = new THREE.Mesh(new THREE.RingGeometry(0.3, 4.2, 20), rotorMat);
  mainRotor.rotation.x = Math.PI / 2;
  mainRotor.position.set(0, 0.92, 0);
  const rotorBlade = new THREE.Mesh(new THREE.BoxGeometry(8.2, 0.06, 0.32), heliBodyMat);
  mainRotor.add(rotorBlade);

  const heliSearchlightMat = new THREE.MeshBasicMaterial({
    color: '#fef08a',
    transparent: true,
    opacity: 0.28,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const heliConeGeom = new THREE.ConeGeometry(11.5, 38, 20, 1, true);
  const heliSearchlight = new THREE.Mesh(heliConeGeom, heliSearchlightMat);
  heliSearchlight.position.set(0, -18.5, 4.5);
  heliSearchlight.rotation.x = 0.24;

  const heliStrobe = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), navRedMat);
  heliStrobe.position.set(0, 0.75, -5.1);

  heliGroup.add(fuselage, cockpit, tailBoom, mainRotor, heliSearchlight, heliStrobe);
  root.add(heliGroup);

  // 6b. Mejirodai Opulent High-Density Luxury Residential Towers & Royal Fountain Boulevard (目白台高密度豪宅塔楼群与皇家喷泉大道)
  const mejirodaiGroup = new THREE.Group();
  mejirodaiGroup.name = 'mejirodai-luxury-residences';

  const marblePaveMat = new THREE.MeshStandardMaterial({ color: '#f3ede2', roughness: 0.35, metalness: 0.12 });
  const goldTrimMat = new THREE.MeshStandardMaterial({
    color: '#eab308',
    emissive: '#ca8a04',
    emissiveIntensity: 0.28,
    roughness: 0.25,
    metalness: 0.78,
  });
  emissiveEntries.push({ material: goldTrimMat, baseEmissive: new THREE.Color('#ca8a04'), isNightWindow: false });

  const hedgeMat = new THREE.MeshStandardMaterial({ color: '#15803d', roughness: 0.75, metalness: 0.05 });
  const roseBloomMat = new THREE.MeshStandardMaterial({
    color: '#fb7185',
    emissive: '#e11d48',
    emissiveIntensity: 0.18,
    roughness: 0.5,
  });
  const lobbyGlassMat = new THREE.MeshStandardMaterial({
    color: '#fef3c7',
    emissive: '#f59e0b',
    emissiveIntensity: 0.65,
    roughness: 0.18,
    metalness: 0.25,
  });
  emissiveEntries.push({ material: lobbyGlassMat, baseEmissive: new THREE.Color('#f59e0b'), isNightWindow: false });

  const warmWinMat = new THREE.MeshStandardMaterial({
    color: '#fffbeb',
    emissive: '#fbbf24',
    emissiveIntensity: 0.55,
    roughness: 0.2,
    metalness: 0.3,
  });
  emissiveEntries.push({ material: warmWinMat, baseEmissive: new THREE.Color('#fbbf24'), isNightWindow: true });

  const champagneWinMat = new THREE.MeshStandardMaterial({
    color: '#f0f9ff',
    emissive: '#fde68a',
    emissiveIntensity: 0.48,
    roughness: 0.18,
    metalness: 0.4,
  });
  emissiveEntries.push({ material: champagneWinMat, baseEmissive: new THREE.Color('#fde68a'), isNightWindow: true });

  const balconyGlassMat = new THREE.MeshStandardMaterial({
    color: '#bae6fd',
    roughness: 0.15,
    metalness: 0.65,
    transparent: true,
    opacity: 0.65,
  });

  // Grand Central Boulevard & Tiered Marble Fountain at (0, 150)
  const boulevardPlinth = new THREE.Mesh(new THREE.BoxGeometry(15.5, 0.12, 42), marblePaveMat);
  boulevardPlinth.position.set(0, 0.06, 151);
  const boulevardGoldBorderL = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.15, 42), goldTrimMat);
  boulevardGoldBorderL.position.set(-7.6, 0.08, 151);
  const boulevardGoldBorderR = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.15, 42), goldTrimMat);
  boulevardGoldBorderR.position.set(7.6, 0.08, 151);
  mejirodaiGroup.add(boulevardPlinth, boulevardGoldBorderL, boulevardGoldBorderR);

  const fountainGroup = new THREE.Group();
  fountainGroup.position.set(0, 0.1, 151);
  const basinOuter = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 4.7, 0.72, 24), marblePaveMat);
  basinOuter.position.y = 0.36;
  const basinGoldRim = new THREE.Mesh(new THREE.TorusGeometry(4.45, 0.14, 10, 28), goldTrimMat);
  basinGoldRim.rotation.x = Math.PI / 2;
  basinGoldRim.position.y = 0.72;
  const fountainWaterMat = new THREE.MeshStandardMaterial({
    color: '#38bdf8',
    emissive: '#0284c7',
    emissiveIntensity: 0.35,
    roughness: 0.08,
    metalness: 0.55,
  });
  waterMaterials.push(fountainWaterMat);
  const basinWater = new THREE.Mesh(new THREE.CylinderGeometry(4.15, 4.15, 0.55, 24), fountainWaterMat);
  basinWater.position.y = 0.38;
  const midBowl = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 1.3, 1.35, 20), marblePaveMat);
  midBowl.position.y = 1.15;
  const topSpire = new THREE.Mesh(new THREE.ConeGeometry(0.65, 2.8, 16), goldTrimMat);
  topSpire.position.y = 2.85;
  fountainGroup.add(basinOuter, basinGoldRim, basinWater, midBowl, topSpire);
  mejirodaiGroup.add(fountainGroup);

  // Symmetrical Rose Parterres & Boulevard Lamps along the Mejirodai Plaza
  const poleGeom = new THREE.CylinderGeometry(0.1, 0.14, 4.6, 8);
  const poleMat = new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.4, metalness: 0.7 });
  for (const side of [-1, 1]) {
    for (const zPos of [135, 143, 159, 167]) {
      const parterre = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.55, 5.2), hedgeMat);
      parterre.position.set(side * 6.1, 0.28, zPos);
      const roses = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.24, 4.4), roseBloomMat);
      roses.position.set(side * 6.1, 0.62, zPos);
      const bPole = new THREE.Mesh(poleGeom, poleMat);
      bPole.position.set(side * 7.8, 2.3, zPos);
      mejirodaiGroup.add(parterre, roses, bPole);

      const bBulb = new THREE.Mesh(bulbGeom, lampBulbMat);
      bBulb.position.set(side * 7.8, 4.65, zPos);
      const bPool = new THREE.Mesh(poolGeom, lampPoolMat);
      bPool.position.set(side * 7.8, 0.14, zPos);
      lampGroup.add(bBulb, bPool);
    }
  }

  // High-Density Luxury Residential Towers Specification
  const mejirodaiTowers: {
    x: number;
    z: number;
    w: number;
    d: number;
    h: number;
    floors: number;
    bodyColor: string;
    crownStyle: 'penthouse' | 'spire' | 'twin-crest' | 'mansard';
  }[] = [
    // Front Boulevard Row (z = 139)
    { x: -60, z: 139, w: 13.5, d: 11.5, h: 22.0, floors: 7, bodyColor: '#e8dec8', crownStyle: 'spire' },
    { x: -38, z: 139, w: 14.8, d: 12.6, h: 29.5, floors: 10, bodyColor: '#f5efe2', crownStyle: 'penthouse' }, // Soyo's Luxury High-Rise
    { x: -18, z: 139, w: 12.6, d: 11.0, h: 19.5, floors: 6, bodyColor: '#dfd5c3', crownStyle: 'mansard' },
    { x: 18, z: 139, w: 12.6, d: 11.0, h: 19.5, floors: 6, bodyColor: '#dfd5c3', crownStyle: 'mansard' },
    { x: 38, z: 139, w: 14.5, d: 12.4, h: 25.0, floors: 8, bodyColor: '#efe4d4', crownStyle: 'penthouse' },
    { x: 60, z: 139, w: 13.5, d: 11.5, h: 21.0, floors: 7, bodyColor: '#e4d9c5', crownStyle: 'spire' },
    // Middle Row Slender High-Rise Infill (z = 162, between existing mansions)
    { x: -36, z: 162, w: 9.2, d: 13.6, h: 26.0, floors: 9, bodyColor: '#dce5df', crownStyle: 'spire' },
    { x: 38.5, z: 162, w: 9.6, d: 13.6, h: 25.0, floors: 8, bodyColor: '#ebe0ce', crownStyle: 'spire' },
    // North Skyline High-Rise Row (z = 179)
    { x: -60, z: 179, w: 14.6, d: 10.2, h: 24.5, floors: 8, bodyColor: '#e6dcc8', crownStyle: 'mansard' },
    { x: -38, z: 179, w: 15.6, d: 10.8, h: 28.0, floors: 9, bodyColor: '#f0e9da', crownStyle: 'penthouse' },
    { x: -14, z: 179, w: 16.2, d: 10.8, h: 33.0, floors: 11, bodyColor: '#f7f2e7', crownStyle: 'twin-crest' },
    { x: 14, z: 179, w: 16.2, d: 10.8, h: 31.5, floors: 10, bodyColor: '#f7f2e7', crownStyle: 'twin-crest' },
    { x: 38, z: 179, w: 15.6, d: 10.8, h: 27.0, floors: 9, bodyColor: '#ede3d2', crownStyle: 'penthouse' },
    { x: 60, z: 179, w: 14.6, d: 10.2, h: 23.5, floors: 8, bodyColor: '#e2d7c3', crownStyle: 'mansard' },
  ];

  for (let idx = 0; idx < mejirodaiTowers.length; idx++) {
    const t = mejirodaiTowers[idx]!;
    const tower = new THREE.Group();
    tower.position.set(t.x, 0, t.z);

    const facadeMat = new THREE.MeshStandardMaterial({
      color: t.bodyColor,
      roughness: 0.42,
      metalness: 0.18,
    });
    const podiumMat = new THREE.MeshStandardMaterial({
      color: '#cbd5e1',
      roughness: 0.38,
      metalness: 0.25,
    });

    // 1) Grand Podium & Illuminated Lobby
    const podiumH = 3.2;
    const podium = new THREE.Mesh(new THREE.BoxGeometry(t.w + 0.8, podiumH, t.d + 0.8), podiumMat);
    podium.position.y = podiumH / 2;
    const lobbyGlass = new THREE.Mesh(new THREE.BoxGeometry(t.w * 0.58, podiumH * 0.72, t.d + 0.92), lobbyGlassMat);
    lobbyGlass.position.y = podiumH * 0.42;
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(t.w * 0.68, 0.28, t.d + 1.8), goldTrimMat);
    canopy.position.y = podiumH * 0.88;
    tower.add(podium, lobbyGlass, canopy);

    // 2) Main High-Density Residential Shaft
    const shaftH = t.h - podiumH;
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(t.w, shaftH, t.d), facadeMat);
    shaft.position.y = podiumH + shaftH / 2;
    tower.add(shaft);

    // 3) Vertical Golden Architectural Fins
    for (const fx of [-t.w * 0.46, -t.w * 0.16, t.w * 0.16, t.w * 0.46]) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.26, shaftH + 0.6, t.d + 0.24), goldTrimMat);
      fin.position.set(fx, podiumH + shaftH / 2, 0);
      tower.add(fin);
    }

    // 4) High-Density Illuminated Apartment Window Bands & Glass Balconies
    const winMat = idx % 2 === 0 ? warmWinMat : champagneWinMat;
    const stepH = shaftH / t.floors;
    for (let f = 0; f < t.floors; f++) {
      const fy = podiumH + (f + 0.55) * stepH;
      const winBandFB = new THREE.Mesh(new THREE.BoxGeometry(t.w * 0.84, stepH * 0.46, t.d + 0.14), winMat);
      winBandFB.position.y = fy;
      const winBandLR = new THREE.Mesh(new THREE.BoxGeometry(t.w + 0.14, stepH * 0.46, t.d * 0.82), winMat);
      winBandLR.position.y = fy;
      tower.add(winBandFB, winBandLR);

      if (f % 2 === 1) {
        const balcony = new THREE.Mesh(new THREE.BoxGeometry(t.w + 0.56, 0.2, t.d + 0.56), balconyGlassMat);
        balcony.position.y = fy - stepH * 0.26;
        tower.add(balcony);
      }
    }

    // 5) Opulent Rooftop Penthouse, Sky-Garden & Golden Crown
    const roofY = t.h;
    const cornice = new THREE.Mesh(new THREE.BoxGeometry(t.w + 0.7, 0.42, t.d + 0.7), goldTrimMat);
    cornice.position.y = roofY + 0.21;
    const skyGarden = new THREE.Mesh(new THREE.BoxGeometry(t.w * 0.86, 0.35, t.d * 0.86), hedgeMat);
    skyGarden.position.y = roofY + 0.45;
    const penthouse = new THREE.Mesh(new THREE.BoxGeometry(t.w * 0.62, 2.8, t.d * 0.62), facadeMat);
    penthouse.position.y = roofY + 1.8;
    const penthouseWin = new THREE.Mesh(new THREE.BoxGeometry(t.w * 0.64, 1.5, t.d * 0.64), lobbyGlassMat);
    penthouseWin.position.y = roofY + 1.85;
    tower.add(cornice, skyGarden, penthouse, penthouseWin);

    if (t.crownStyle === 'penthouse' || t.crownStyle === 'twin-crest') {
      const crownFrame = new THREE.Mesh(new THREE.BoxGeometry(t.w * 0.68, 0.35, t.d * 0.68), goldTrimMat);
      crownFrame.position.y = roofY + 3.35;
      tower.add(crownFrame);
    }
    if (t.crownStyle === 'spire' || t.crownStyle === 'twin-crest') {
      const spire = new THREE.Mesh(new THREE.ConeGeometry(0.55, 4.8, 12), goldTrimMat);
      spire.position.y = roofY + 5.4;
      tower.add(spire);
    }
    if (t.crownStyle === 'mansard') {
      const mansard = new THREE.Mesh(new THREE.ConeGeometry(t.w * 0.48, 3.2, 4), podiumMat);
      mansard.rotation.y = Math.PI / 4;
      mansard.position.y = roofY + 3.8;
      tower.add(mansard);
    }

    mejirodaiGroup.add(tower);
  }
  root.add(mejirodaiGroup);

  // 7. Skyscraper Rooftop Sky-Searchlights (城市天际线体积探照光束)
  const searchlights: SearchlightBeam[] = [];
  const beamAnchors = [
    { x: -136, y: 26, z: 118, color: '#38bdf8', speed: 0.55, phase: 0.2 },
    { x: 138, y: 32, z: 96, color: '#f472b6', speed: 0.48, phase: 1.4 },
    { x: 0, y: 24, z: 154, color: '#fbbf24', speed: 0.62, phase: 2.6 },
    { x: 218, y: 22, z: 54, color: '#2dd4bf', speed: 0.52, phase: 3.8 },
    { x: -136, y: 24, z: -72, color: '#a78bfa', speed: 0.44, phase: 4.9 },
    { x: 136, y: 22, z: -72, color: '#60a5fa', speed: 0.58, phase: 5.7 },
  ];
  const skyBeamGeom = new THREE.CylinderGeometry(7.5, 0.45, 92, 16, 1, true);
  skyBeamGeom.translate(0, 46, 0);
  for (const b of beamAnchors) {
    const pivot = new THREE.Group();
    pivot.position.set(b.x, b.y, b.z);
    const mat = new THREE.MeshBasicMaterial({
      color: b.color,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(skyBeamGeom, mat);
    pivot.add(mesh);
    root.add(pivot);
    searchlights.push({ pivot, material: mat, baseX: b.x, baseZ: b.z, phase: b.phase, speed: b.speed });
  }

  // 8. Volumetric Drifting Cloud Layer around Mountain Peaks & Skyline
  const clouds: CloudCluster[] = [];
  const cloudMat = new THREE.MeshLambertMaterial({
    color: '#ffffff',
    transparent: true,
    opacity: 0.64,
    depthWrite: false,
  });
  const puffGeom = new THREE.DodecahedronGeometry(1, 1);
  for (let i = 0; i < 12; i++) {
    const cluster = new THREE.Group();
    const puffCount = 4 + (i % 3);
    for (let p = 0; p < puffCount; p++) {
      const puff = new THREE.Mesh(puffGeom, cloudMat);
      const sx = 6.5 + ((i * 3 + p) % 5) * 1.8;
      const sy = 2.4 + (p % 2) * 0.9;
      const sz = 4.8 + ((i + p) % 4) * 1.4;
      puff.scale.set(sx, sy, sz);
      puff.position.set((p - puffCount / 2) * 4.2, (p % 2) * 0.8, ((p * 7) % 5 - 2) * 1.6);
      cluster.add(puff);
    }
    const startX = -210 + i * 36;
    const baseY = 50 + (i % 4) * 6.5;
    const startZ = -195 + ((i * 37) % 120);
    cluster.position.set(startX, baseY, startZ);
    root.add(cluster);
    clouds.push({ group: cluster, speed: 2.2 + (i % 4) * 0.65, baseY, phase: i * 0.9 });
  }

  // 9. Atmospheric Weather Particles (Sakura / Golden Motes / Cyber Neon Rain)
  const PARTICLE_COUNT = 240;
  const particlePositions = new Float32Array(PARTICLE_COUNT * 3);
  const particleVelocities = new Float32Array(PARTICLE_COUNT * 3);
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    particlePositions[i * 3] = (Math.random() - 0.5) * 380;
    particlePositions[i * 3 + 1] = Math.random() * 85 + 2;
    particlePositions[i * 3 + 2] = (Math.random() - 0.5) * 360;
    particleVelocities[i * 3] = (Math.random() - 0.5) * 3.5;
    particleVelocities[i * 3 + 1] = -(3.5 + Math.random() * 4.5);
    particleVelocities[i * 3 + 2] = (Math.random() - 0.5) * 3.5;
  }
  const particleGeom = new THREE.BufferGeometry();
  particleGeom.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
  const particleMat = new THREE.PointsMaterial({
    color: '#ffd6e7',
    map: glowTex,
    size: 2.6,
    transparent: true,
    opacity: 0.72,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const particleSystem = new THREE.Points(particleGeom, particleMat);
  root.add(particleSystem);

  // 10. 3D Holographic Ground Radar Pulse & Destination Light Pillar
  const playerPulseGroup = new THREE.Group();
  const pulseRingMat1 = new THREE.MeshBasicMaterial({
    color: '#f59e0b',
    transparent: true,
    opacity: 0.75,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const pulseRingMat2 = new THREE.MeshBasicMaterial({
    color: '#38bdf8',
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const ringGeom = new THREE.RingGeometry(2.2, 3.1, 32);
  ringGeom.rotateX(-Math.PI / 2);
  const pulseRing1 = new THREE.Mesh(ringGeom, pulseRingMat1);
  const pulseRing2 = new THREE.Mesh(ringGeom, pulseRingMat2);
  const beaconMat = new THREE.MeshBasicMaterial({
    color: '#fbbf24',
    transparent: true,
    opacity: 0.28,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const beaconGeom = new THREE.CylinderGeometry(0.45, 2.1, 24, 16, 1, true);
  beaconGeom.translate(0, 12, 0);
  const playerBeacon = new THREE.Mesh(beaconGeom, beaconMat);
  playerPulseGroup.add(pulseRing1, pulseRing2, playerBeacon);
  playerPulseGroup.visible = false;
  root.add(playerPulseGroup);

  const districtHighlightMat = new THREE.MeshBasicMaterial({
    color: '#38bdf8',
    transparent: true,
    opacity: 0.35,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const districtRingGeom = new THREE.RingGeometry(24, 26.5, 48);
  districtRingGeom.rotateX(-Math.PI / 2);
  const districtHighlightRing = new THREE.Mesh(districtRingGeom, districtHighlightMat);
  districtHighlightRing.visible = false;
  root.add(districtHighlightRing);

  let currentProfile = PROFILES.day;

  function setAtmosphere(mode: TokyoAtmosphereMode, clockMinutes = 780): TokyoAtmosphereProfile {
    const profile = resolveTokyoAtmosphere(mode, clockMinutes);
    currentProfile = profile;

    skyUniforms.uZenith.value.copy(profile.zenithColor);
    skyUniforms.uHorizon.value.copy(profile.horizonColor);
    skyUniforms.uNadir.value.copy(profile.nadirColor);
    skyUniforms.uSunColor.value.copy(profile.sunColor);
    skyUniforms.uSunDir.value.copy(profile.sunDirection);
    skyUniforms.uStarIntensity.value = profile.starIntensity;

    hemiLight.color.copy(profile.hemiSkyColor);
    hemiLight.groundColor.copy(profile.hemiGroundColor);
    hemiLight.intensity = profile.hemiIntensity;

    sunLight.color.copy(profile.sunColor);
    sunLight.intensity = profile.sunIntensity;
    sunLight.position.copy(profile.sunDirection).multiplyScalar(480);

    rimLight.color.copy(profile.rimColor);
    rimLight.intensity = profile.rimIntensity;

    fog.color.copy(profile.fogColor);
    fog.density = profile.fogDensity;
    renderer.toneMappingExposure = profile.exposure;

    horizonRingMat.color.copy(profile.horizonColor);
    horizonRingMat.opacity = profile.preset === 'day' ? 0.12 : 0.24;

    // Update city window & neon emissive intensity
    for (const entry of emissiveEntries) {
      if (entry.isNightWindow) {
        if (profile.lampIntensity > 0.2) {
          entry.material.emissive.copy(entry.baseEmissive);
          entry.material.emissiveIntensity = profile.lampIntensity * 0.55;
        } else {
          entry.material.emissive.setRGB(0, 0, 0);
          entry.material.emissiveIntensity = 0;
        }
      } else {
        entry.material.emissive.copy(entry.baseEmissive);
        entry.material.emissiveIntensity = profile.windowEmissiveBoost;
      }
    }

    // Update 56 streetlamps
    lampBulbMat.opacity = Math.min(1, profile.lampIntensity * 0.85);
    lampPoolMat.opacity = Math.min(0.75, profile.lampIntensity * 0.42);
    lampGroup.visible = profile.lampIntensity > 0.05;

    // Update skyscraper searchlights & train/heli beams
    for (const beam of searchlights) {
      beam.material.opacity = profile.beamOpacity * 0.24;
      beam.pivot.visible = profile.beamOpacity > 0.05;
    }
    heliSearchlightMat.opacity = 0.14 + profile.beamOpacity * 0.26;
    trainBeamMat.opacity = 0.18 + profile.beamOpacity * 0.35;

    // Update weather particle appearance
    if (profile.rainIntensity > 0.5) {
      particleMat.color.set('#38bdf8');
      particleMat.size = 2.1;
      particleMat.opacity = 0.78;
    } else if (profile.preset === 'dusk') {
      particleMat.color.set('#ffb482');
      particleMat.size = 2.8;
      particleMat.opacity = 0.75;
    } else if (profile.preset === 'night') {
      particleMat.color.set('#fef08a');
      particleMat.size = 2.3;
      particleMat.opacity = 0.62;
    } else {
      particleMat.color.set('#ffd6e7');
      particleMat.size = 2.6;
      particleMat.opacity = 0.68;
    }

    cloudMat.color.copy(
      profile.preset === 'dusk'
        ? new THREE.Color('#ffcdb2')
        : profile.preset === 'night' || profile.preset === 'cyber'
          ? new THREE.Color('#334155')
          : new THREE.Color('#ffffff'),
    );

    return profile;
  }

  function updateContrailRibbon(
    ribbon: { mesh: THREE.Mesh; history: { left: THREE.Vector3; right: THREE.Vector3 }[] },
    tipWorld: THREE.Vector3,
    wingRightAxis: THREE.Vector3,
  ) {
    const halfWidth = 0.28;
    const left = tipWorld.clone().addScaledVector(wingRightAxis, -halfWidth);
    const right = tipWorld.clone().addScaledVector(wingRightAxis, halfWidth);
    ribbon.history.unshift({ left, right });
    if (ribbon.history.length > TRAIL_LEN) ribbon.history.pop();

    const posAttr = ribbon.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;
    const last = ribbon.history[ribbon.history.length - 1] ?? { left, right };
    for (let i = 0; i < TRAIL_LEN; i++) {
      const sample = ribbon.history[i] ?? last;
      const spread = 1 + i * 0.025;
      const midX = (sample.left.x + sample.right.x) * 0.5;
      const midY = (sample.left.y + sample.right.y) * 0.5;
      const midZ = (sample.left.z + sample.right.z) * 0.5;
      const dx = (sample.right.x - sample.left.x) * 0.5 * spread;
      const dy = (sample.right.y - sample.left.y) * 0.5 * spread;
      const dz = (sample.right.z - sample.left.z) * 0.5 * spread;

      const idx = i * 6;
      arr[idx] = midX - dx;
      arr[idx + 1] = midY - dy;
      arr[idx + 2] = midZ - dz;
      arr[idx + 3] = midX + dx;
      arr[idx + 4] = midY + dy;
      arr[idx + 5] = midZ + dz;
    }
    posAttr.needsUpdate = true;
  }

  function update(
    dt: number,
    nowMs: number,
    su30Node: THREE.Object3D | undefined,
    playerWorldPos: { x: number; z: number } | undefined,
    districtCenter: { x: number; z: number } | undefined,
  ) {
    const timeSec = nowMs * 0.001;
    skyUniforms.uTime.value = timeSec;

    // 1. Attach & animate Su-30SM2 supersonic VFX
    if (su30Node) {
      if (su30Attached !== su30Node) {
        su30Attached = su30Node;
        su30Node.add(su30LocalVfx);
      }
      su30Node.updateMatrixWorld(true);

      // High-frequency Mach shock-diamond flicker
      const flicker = 0.88 + 0.26 * Math.sin(nowMs * 0.065) + 0.12 * Math.cos(nowMs * 0.14);
      for (const nozzle of afterburnerGroup.children) {
        nozzle.scale.set(1, 1, flicker);
      }

      // Navigation strobe flash
      const strobeOn = (nowMs % 1100) < 110 || ((nowMs % 1100) > 220 && (nowMs % 1100) < 310);
      strobeWhiteMat.opacity = strobeOn ? 1.0 : 0.08;

      // Transonic Prandtl-Glauert vapor cone during high-G bank or flare burst
      if (vaporBurstTimer > 0) vaporBurstTimer = Math.max(0, vaporBurstTimer - dt);
      const bankFactor = Math.max(0, (Math.abs(su30Node.rotation.z) - 0.24) * 2.2);
      const targetVapor = Math.min(0.62, Math.max(bankFactor, vaporBurstTimer > 0 ? 0.55 : 0));
      vaporConeMat.opacity += (targetVapor - vaporConeMat.opacity) * Math.min(1, dt * 8);
      vaporCone.rotation.z = timeSec * 2.5;
      vaporConeInner.rotation.z = -timeSec * 3.2;

      // Update world-space wingtip vortex contrails
      const wingRight = new THREE.Vector3(1, 0, 0).transformDirection(su30Node.matrixWorld);
      const leftTip = new THREE.Vector3(5.35, 0.05, -3.2).applyMatrix4(su30Node.matrixWorld);
      const rightTip = new THREE.Vector3(-5.35, 0.05, -3.2).applyMatrix4(su30Node.matrixWorld);
      updateContrailRibbon(leftContrail, leftTip, wingRight);
      updateContrailRibbon(rightContrail, rightTip, wingRight);

      // Periodic automatic flare burst every ~15s when banking
      autoFlareTimer -= dt;
      if (autoFlareTimer <= 0 && Math.abs(su30Node.rotation.z) > 0.26) {
        autoFlareTimer = 14.5;
        flareBurstRemaining = 5;
        flareBurstCooldown = 0;
        vaporBurstTimer = 1.8;
      }

      if (flareBurstRemaining > 0) {
        flareBurstCooldown -= dt;
        if (flareBurstCooldown <= 0) {
          spawnFlarePair(su30Node);
          flareBurstRemaining--;
          flareBurstCooldown = 0.11;
        }
      }
    }

    // 2. Animate active countermeasure flare particles
    for (const f of flarePool) {
      if (!f.active) continue;
      f.age += dt;
      if (f.age >= f.life) {
        f.active = false;
        f.mesh.visible = false;
        continue;
      }
      f.vel.multiplyScalar(Math.max(0, 1 - dt * 1.35));
      f.vel.y -= 12.5 * dt; // Gravity
      f.pos.addScaledVector(f.vel, dt);
      f.mesh.position.copy(f.pos);
      const lifeRatio = 1 - f.age / f.life;
      f.mesh.scale.setScalar(0.35 + lifeRatio * 1.15);
      (f.mesh.material as THREE.MeshBasicMaterial).opacity = lifeRatio;
    }

    // 3. Animate High-Speed Shinkansen Express Train
    trainX += dt * 42;
    if (trainX > 220) trainX = -195;
    shinkansenGroup.position.x = trainX;

    // 4. Animate Patrolling Helicopter & Sweeping Searchlight
    const heliAngle = timeSec * 0.32;
    const hx = 18 + Math.cos(heliAngle) * 76;
    const hz = 54 + Math.sin(heliAngle) * 58;
    const hy = 35 + Math.sin(timeSec * 1.4) * 1.2;
    const nextAngle = heliAngle + 0.02;
    heliGroup.position.set(hx, hy, hz);
    heliGroup.lookAt(18 + Math.cos(nextAngle) * 76, hy - 0.5, 54 + Math.sin(nextAngle) * 58);
    mainRotor.rotation.z = timeSec * 28;

    // 5. Animate Skyscraper Rooftop Searchlights
    if (currentProfile.beamOpacity > 0.05) {
      for (const beam of searchlights) {
        const t = timeSec * beam.speed + beam.phase;
        beam.pivot.rotation.x = Math.sin(t) * 0.38;
        beam.pivot.rotation.z = Math.cos(t * 0.82) * 0.38;
      }
    }

    // 6. Animate Volumetric Clouds
    for (const c of clouds) {
      c.group.position.x += c.speed * dt;
      if (c.group.position.x > 235) c.group.position.x = -235;
      c.group.position.y = c.baseY + Math.sin(timeSec * 0.6 + c.phase) * 0.8;
    }

    // 7. Animate Weather Particles (Sakura / Motes vs Neon Rain)
    const posAttr = particleGeom.getAttribute('position') as THREE.BufferAttribute;
    const pArr = posAttr.array as Float32Array;
    const isRain = currentProfile.rainIntensity > 0.5;
    const fallMult = isRain ? 6.5 : 1.0;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const idx = i * 3;
      pArr[idx] += (particleVelocities[idx] + Math.sin(timeSec + i) * (isRain ? 0.5 : 1.8)) * dt;
      pArr[idx + 1] += particleVelocities[idx + 1] * fallMult * dt;
      pArr[idx + 2] += particleVelocities[idx + 2] * dt;
      if (pArr[idx + 1] < 0.5) {
        pArr[idx + 1] = 82 + Math.random() * 14;
        pArr[idx] = (Math.random() - 0.5) * 380;
        pArr[idx + 2] = (Math.random() - 0.5) * 360;
      }
    }
    posAttr.needsUpdate = true;

    // 8. Shimmer water materials
    for (const wm of waterMaterials) {
      wm.roughness = 0.06 + 0.04 * Math.sin(timeSec * 2.4);
    }

    // 9. Animate 3D Player Location Radar Pulse & District Ring
    if (playerWorldPos) {
      playerPulseGroup.visible = true;
      playerPulseGroup.position.set(playerWorldPos.x, 0.32, playerWorldPos.z);
      const p1 = (timeSec * 0.85) % 1;
      const p2 = (timeSec * 0.85 + 0.5) % 1;
      pulseRing1.scale.setScalar(0.6 + p1 * 3.2);
      pulseRingMat1.opacity = (1 - p1) * 0.78;
      pulseRing2.scale.setScalar(0.6 + p2 * 3.2);
      pulseRingMat2.opacity = (1 - p2) * 0.65;
      beaconMat.opacity = 0.2 + 0.12 * Math.sin(timeSec * 3.2);
    } else {
      playerPulseGroup.visible = false;
    }

    if (districtCenter) {
      districtHighlightRing.visible = true;
      districtHighlightRing.position.set(districtCenter.x, 0.28, districtCenter.z);
      districtHighlightRing.rotation.z = timeSec * 0.35;
      districtHighlightMat.opacity = 0.22 + 0.14 * Math.sin(timeSec * 2.5);
    } else {
      districtHighlightRing.visible = false;
    }
  }

  function dispose() {
    su30LocalVfx.removeFromParent();
    scene.fog = null;
    glowTex.dispose();
    root.traverse(obj => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Points) {
        obj.geometry.dispose();
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach(m => m.dispose());
      }
    });
    root.removeFromParent();
  }

  return {
    root,
    update,
    setAtmosphere,
    triggerSu30Flares,
    dispose,
  };
}
