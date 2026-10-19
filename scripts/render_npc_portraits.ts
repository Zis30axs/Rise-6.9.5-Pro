import * as THREE from 'three';
import { createCharacterAssetPool, loadCharacterModel, type CharacterModelId } from '../src/frontend/scene-character-assets';

type NpcPortraitId = Exclude<CharacterModelId, 'soyo'>;
const width = 768, height = 960;
const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(width, height);
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
document.body.style.cssText = 'margin:0;background:transparent';
document.body.append(renderer.domElement);

async function render(id: NpcPortraitId, encoded: string) {
  if (!['deepseek', 'xiaoyang', 'claude'].includes(id)) throw new Error('Unknown NPC portrait');
  const pool = createCharacterAssetPool({ loadModel: () => loadCharacterModel(encoded) });
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8f9eaa, 2.2));
  const key = new THREE.DirectionalLight(0xffffff, 2.8);
  key.position.set(-3, 7, 6); scene.add(key);
  try {
    const instance = await pool.acquire(id);
    scene.add(instance.group);
    instance.group.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(instance.group);
    const modelHeight = bounds.max.y - bounds.min.y;
    // Keep equal headroom; wider hair/capes fit inside the frame without cutting
    // their side silhouette. The reading panel can cover the lower costume.
    const viewHeight = Math.max(modelHeight * 0.715, (bounds.max.x - bounds.min.x) * 1.1 * height / width);
    const top = modelHeight + viewHeight * 0.0625, bottom = top - viewHeight, center = (top + bottom) / 2;
    const camera = new THREE.OrthographicCamera(-viewHeight * width / height / 2, viewHeight * width / height / 2, viewHeight / 2, -viewHeight / 2, 0.01, 20);
    camera.position.set(0, center, 4); camera.lookAt(0, center, 0);
    renderer.render(scene, camera);
    return {
      png: renderer.domElement.toDataURL('image/png'),
      width, height, modelHeight,
      camera: { type: 'orthographic', position: [0, center, 4], target: [0, center, 0], visibleTop: top, visibleBottom: bottom, viewHeight },
      pose: 'Imported relaxed standing pose, front +Z, no animation or invented expression',
    };
  } finally { pool.dispose(); scene.clear(); }
}

Object.assign(window, { npcPortraitRenderer: { render, dispose: () => renderer.dispose() } });
