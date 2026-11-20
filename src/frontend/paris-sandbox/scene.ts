import {
  Color, DirectionalLight, Group, HemisphereLight, Mesh, MeshStandardMaterial, OrthographicCamera,
  PCFShadowMap, PlaneGeometry, Scene, SRGBColorSpace, Vector3, WebGLRenderer,
  type Material, type Texture,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import modelUrl from '../../../assets/paris-sandbox/sandbox.glb.gz.bin?url&inline';
import city from '../../../assets/paris-sandbox/places.json';
import airportPlaces from '../../../assets/paris-sandbox/airport.json';
import airportUrl from '../../../assets/paris-sandbox/airport.glb.gz.bin?url&inline';
import { readLocalAssetBytes } from '../local-asset-buffer';

export type ParisArea = 'city' | 'airport';
export type Pin = { id: string; x: number; y: number };
export type ViewUpdate = { pins: Pin[]; bearing: number };
type Frame = { target: Vector3; az: number; elevation: number; span: number };
const HOME: Frame = { target: new Vector3(0, 1.5, 0), az: .34, elevation: .60, span: 111 };
const cityViews = [[.51,.33],[-.30,.29],[-.32,.58],[-.64,.38],[.43,.39],[.66,.31]];
async function unpackModel(url: string) {
  const bytes = await readLocalAssetBytes(url, 4_000_000, '巴黎沙盘素材不可用');
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

function freeMeshes(scene: Scene | Group) {
  const materials = new Set<Material>();
  scene.traverse(obj => {
    if (!(obj instanceof Mesh)) return;
    obj.geometry.dispose();
    for (const mat of Array.isArray(obj.material) ? obj.material : [obj.material]) materials.add(mat);
  });
  const textures = new Set<Texture>();
  for (const mat of materials) {
    const tex = (mat as MeshStandardMaterial).map;
    if (tex) textures.add(tex);
    mat.dispose();
  }
  for (const tex of textures) {
    tex.dispose();
    if (typeof ImageBitmap !== 'undefined' && tex.image instanceof ImageBitmap) tex.image.close();
  }
}

export function createParisScene(
  canvas: HTMLCanvasElement, area: ParisArea, notify: (state: ViewUpdate) => void,
  onLost: () => void, onInteract: () => void,
) {
  const places = area === 'airport' ? airportPlaces : city;
  const views = area === 'airport' ? [[.40,.51],[-.42,.44]] : cityViews;
  const markerHeights = area === 'airport' ? [4.9,3.1] : [24.35,5.36,3.4,6.66,8.80,3.1];
  const renderer = new WebGLRenderer({ canvas, alpha: false, antialias: true, powerPreference: 'low-power' });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setPixelRatio(Math.min(1.85, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  const scene = new Scene();
  scene.background = new Color('#eae6dc');
  const camera = new OrthographicCamera(-50, 50, 30, -30, .1, 520);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = false;
  controls.minZoom = .62;
  controls.maxZoom = 11;
  controls.minPolarAngle = .16;
  controls.maxPolarAngle = Math.PI / 2 - .15;
  controls.rotateSpeed = .66;
  controls.zoomSpeed = .85;
  controls.screenSpacePanning = false;
  scene.add(new HemisphereLight(0xfff5e0, 0xc6b9a4, 1.61));
  const sun = new DirectionalLight(0xffefd9, 2.12);
  sun.position.set(-42, 78, 46);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -62, right: 62, top: 58, bottom: -58, near: 1, far: 187 });
  sun.shadow.normalBias = .035;
  sun.shadow.bias = -.00019;
  scene.add(sun);
  const floor = new Mesh(new PlaneGeometry(1800, 1800), new MeshStandardMaterial({ color: '#e3ded1', roughness: 1 }));
  floor.rotation.x = -Math.PI/2;
  floor.position.y = -2.99;
  floor.receiveShadow = true;
  scene.add(floor);
  let paused = false, disposed = false, spinning = false, ready = false;
  let raf = 0, previous = 0, width = 1, height = 1;
  let span = HOME.span, focused = '';
  let transition: { start: number; from: Frame; to: Frame } | undefined;
  const cameraDirection = new Vector3();
  const point = new Vector3();

  function projection() {
    const aspect = width / height;
    const halfHeight = Math.max(span / aspect, span * (focused ? .75 : .49)) / 2;
    camera.top = halfHeight; camera.bottom = -halfHeight;
    camera.left = -halfHeight * aspect; camera.right = halfHeight * aspect;
    camera.updateProjectionMatrix();
  }
  function apply(frame: Frame) {
    span = frame.span; projection();
    const a = frame.az, e = frame.elevation;
    cameraDirection.set(Math.sin(a)*Math.cos(e), Math.sin(e), Math.cos(a)*Math.cos(e));
    controls.target.copy(frame.target);
    camera.position.copy(frame.target).addScaledVector(cameraDirection, 133);
    controls.update();
  }
  function snapshot(): Frame {
    return { target: controls.target.clone(), az: controls.getAzimuthalAngle(),
      elevation: Math.PI/2-controls.getPolarAngle(), span: span/camera.zoom };
  }
  function schedule() {
    if (!raf && !disposed && !paused) raf = requestAnimationFrame(draw);
  }
  function draw(now: number) {
    raf = 0;
    if (disposed || paused) return;
    if (transition) {
      const { from, to, start } = transition;
      const t = Math.min(1, (now-start)/480);
      const u = t*t*(3-2*t);
      const delta = Math.atan2(Math.sin(to.az-from.az), Math.cos(to.az-from.az));
      apply({ target: from.target.clone().lerp(to.target,u), az: from.az+delta*u,
        elevation: from.elevation+(to.elevation-from.elevation)*u, span: from.span+(to.span-from.span)*u });
      if (t>=1) transition=undefined;
    } else if (spinning && ready) {
      const v=snapshot();
      camera.zoom=1;
      v.az+=Math.min(48,now-(previous||now))*.000095;
      apply(v);
    }
    previous=now;
    renderer.render(scene,camera);
    const pins: Pin[]=[];
    places.forEach((p,i) => {
      point.set(p.target[0],markerHeights[i]+.58,p.target[2]).project(camera);
      if (Math.abs(point.x)<.98 && Math.abs(point.y)<.98 && point.z>=-1 && point.z<=1) {
        pins.push({id:p.id,x:(point.x+1)*50,y:(1-point.y)*50});
      }
    });
    notify({ pins,bearing:controls.getAzimuthalAngle() });
    if (spinning || transition) schedule();
  }
  function resize() {
    if (paused || !canvas.clientWidth || !canvas.clientHeight) return;
    width=canvas.clientWidth;height=canvas.clientHeight;
    renderer.setSize(width,height,false);
    projection();schedule();
  }
  function focus(id: string, animate = true) {
    const i=places.findIndex(p=>p.id===id), p=places[i];
    const to = p ? { target: new Vector3(...p.target as [number,number,number]),
      az:views[i][0],elevation:views[i][1],span:p.span } : HOME;
    const from=snapshot();camera.zoom=1;focused=p?.id || '';
    if (animate && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      transition={ from,to,start:performance.now() };
    } else { transition=undefined;apply(to); }
    schedule();
  }
  function interact() { transition=undefined;spinning=false;onInteract(); }
  function lost(e: Event) { e.preventDefault();if (!disposed) onLost(); }
  controls.addEventListener('change',schedule);
  controls.addEventListener('start',interact);
  canvas.addEventListener('webglcontextlost',lost);
  const observer=new ResizeObserver(resize);
  observer.observe(canvas);
  apply(HOME);resize();

  async function load() {
    const bytes=await unpackModel(area === 'airport' ? airportUrl : modelUrl);
    if (disposed) return;
    const gltf=await new GLTFLoader().parseAsync(bytes,'');
    if (disposed) {freeMeshes(gltf.scene);return;}
    gltf.scene.traverse(obj=>{ if (obj instanceof Mesh){obj.castShadow=true;obj.receiveShadow=true;} });
    scene.add(gltf.scene);renderer.shadowMap.needsUpdate=true;ready=true;
    resize();schedule();
  }
  function dispose() {
    if (disposed) return;
    disposed=true;cancelAnimationFrame(raf);observer.disconnect();
    canvas.removeEventListener('webglcontextlost',lost);
    controls.dispose();freeMeshes(scene);sun.shadow.dispose();renderer.dispose();renderer.forceContextLoss();
  }
  return {load,focus,dispose,
    setPaused(value:boolean){paused=value;previous=0;if(value){cancelAnimationFrame(raf);raf=0;transition=undefined;}else resize();},
    setSpinning(value:boolean){spinning=value;previous=0;schedule();},
    zoom(factor:number){transition=undefined;camera.zoom=Math.max(.62,Math.min(11,camera.zoom*factor));camera.updateProjectionMatrix();schedule();},
    turn(delta:number){transition=undefined;const view=snapshot();camera.zoom=1;view.az+=delta;apply(view);schedule();},
  };
}
