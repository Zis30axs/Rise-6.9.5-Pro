import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { highland } from '../runtime/highland';

/** South-facing terraces, with the Wakaba villa set back from the public steps. */
export function createHighlandModel() {
  const district = new THREE.Group();
  district.name = 'highland-residential-model';
  district.position.set(highland.x, 0, highland.z);
  const palette = {
    earth: '#977c65', stone: '#c4b9a4', path: '#d5c9b1', road: '#717578',
    lawn: '#8da478', hedge: '#47684e', leaf: '#729454', tree: '#9ead66', wood: '#74523a',
    cream: '#f1e6d1', clay: '#c58e75', sage: '#aebbb2', roof: '#545e68', tile: '#906956',
    sill: '#e6d9bb', glass: '#72939b', steel: '#536168', soil: '#60503c', vine: '#548152',
    fruit: '#365d42', flower: '#f4c758',
  };
  type Color = keyof typeof palette;
  const materials = new Map<Color, THREE.MeshStandardMaterial>();
  const batches = new Map<Color, THREE.BufferGeometry[]>();
  const pose = new THREE.Object3D();
  const cube = new THREE.BoxGeometry();
  const foliage = new THREE.IcosahedronGeometry(1, 1);
  const trunk = new THREE.CylinderGeometry(.8, 1, 1, 8);
  function part(shape: THREE.BufferGeometry, color: Color, x: number, y: number, z: number,
    w: number, h: number, d: number, pitch = 0, yaw = 0, roll = 0) {
    pose.position.set(x, y, z); pose.scale.set(w, h, d); pose.rotation.set(pitch, yaw, roll);
    pose.updateMatrix();
    const copy = shape.clone().applyMatrix4(pose.matrix);
    const geometry = copy.index ? copy.toNonIndexed() : copy;
    if (geometry !== copy) copy.dispose();
    const group = batches.get(color) ?? [];
    group.push(geometry); batches.set(color, group);
  }
  function box(color: Color, x: number, y: number, z: number, w: number, h: number, d: number, pitch = 0) {
    part(cube, color, x, y, z, w, h, d, pitch);
  }
  function finish(name: string) {
    const group = new THREE.Group();
    group.name = name;
    for (const [color, pieces] of batches) {
      let material = materials.get(color);
      if (!material) {
        material = new THREE.MeshStandardMaterial({ color: palette[color], roughness: .85, flatShading: true });
        materials.set(color, material);
      }
      const mesh = new THREE.Mesh(mergeGeometries(pieces)!, material);
      mesh.castShadow = true; mesh.receiveShadow = true;
      group.add(mesh);
      pieces.forEach(geometry => geometry.dispose());
    }
    batches.clear(); district.add(group);
  }

  box('earth', 0, -.55, 0, 70, 1.1, 46);
  box('lawn', 0, .04, 0, 70, .12, 46);
  box('road', 0, .14, 14, 70, .15, 4.6);
  box('path', 0, .26, 10.7, 70, .25, 1.8);
  box('stone', 0, 1, -7, 66, 2, 30);
  box('lawn', 0, 2, -7, 66, .15, 30);
  box('stone', 0, 2.95, -14, 64, 1.9, 15);
  box('lawn', 0, 3.94, -14, 64, .14, 15);
  box('path', 0, 2.15, 2.3, 64, .16, 2.8);
  for (let i = 0; i < 10; i++) {
    const h = (i + 1) * .2;
    box('path', 12, .17 + h / 2, 10.25 - i * .49, 3, h, .52);
    box('path', 12, 2 + h / 2, -3.1 - i * .46, 2.8, h, .5);
  }
  box('path', 12, 2.1, -.3, 2.8, .2, 6);
  for (const x of [-30, -17, -5, 2, 27]) box('hedge', x, 2.56, 6.7, 6, 1.1, 1.4);
  // Copings on the two retaining walls and a handrail along the exposed stair.
  for (const [y, z] of [[2.05, 8], [3.99, -6.5]]) {
    box('sill', -10, y, z, 41.2, .16, .42);
    box('sill', 23, y, z, 18.8, .16, .42);
  }
  for (let i = 0; i < 10; i++) {
    box('sill', -30 + i * 6.6, .24, 14, 2.2, .025, .12);
  }
  for (const z of [10, 8, 6]) box('steel', 13.58, 1.05 + (10 - z) * .4, z, .09, 1.1, .09);
  box('steel', 13.58, 2.34, 8, .11, .11, 4.52, .385);
  for (const x of [-17, 18]) {
    box('steel', x, 2.33, 10.1, .13, 4.1, .13);
    box('steel', x, 4.35, 10.47, .14, .14, .82);
    box('sill', x, 4.28, 10.86, .45, .16, .56);
  }
  // Bus shelter at the foot of the steps.
  for (const x of [-2.5, 2.5]) box('steel', x, 1.65, 10.3, .13, 2.8, .13);
  box('sage', 0, 3.1, 10.5, 6.2, .22, 2.1);
  box('wood', 0, .95, 10.45, 4.6, .22, .8);
  box('cream', 3.4, 1.55, 10.5, .62, 1.4, .12);
  finish('Terraces-stairs-and-bus-stop');

  function house(x: number, z: number, y: number, w: number, d: number, wall: Color, tiles: Color) {
    box(wall, x, y + 2.4, z, w, 4.8, d);
    for (const side of [-1, 1]) {
      const half = d / 2 + .65;
      box(tiles, x, y + 5.42, z + side * half / 2, w + .95, .35, half / Math.cos(.28), side * .28);
    }
    for (const floor of [1.35, 3.65]) for (const side of [-1, 1]) {
      const wx = x + side * w * .26, wz = z + d / 2;
      box('wood', wx, y + floor, wz + .04, w * .26 + .2, 1.4, .13);
      box('glass', wx, y + floor, wz + .12, w * .26, 1.2, .08);
      box('sill', wx, y + floor - .68, wz + .15, w * .26 + .32, .14, .25);
      box('sill', wx, y + floor, wz + .18, .075, 1.24, .06);
    }
    box('wood', x, y + 1.05, z + d / 2 + .1, 1, 2.1, .18);
  }
  house(-24,-13,4,8,6,'cream','tile'); house(-11,-15,4,9,6.6,'sage','roof');
  house(-22,-1.8,2.1,7,5,'clay','roof'); house(-7,-2,2.1,6,4.8,'cream','tile');
  house(27,-2.5,2.1,6,5,'sage','roof');
  finish('Neighborhood-houses');

  house(12,-14,4,11.8,7,'cream','roof');
  box('clay', 5.2, 5.5, -14, 3.4, 3, 6); box('roof',5.2,7.15,-14,4.1,.38,6.6);
  box('path', 12, 6.85, -9.3, 10.8, .32, 2.8);
  for (const x of [6.9,17.1]) box('wood',x,5.35,-8.2,.25,3,.25);
  box('wood',12,7.98,-7.98,10.6,.15,.16);
  for (let i=0;i<19;i++) box('wood',6.9+i*.565,7.52,-7.98,.085,.92,.085);
  box('wood',12,7.96,-10.43,2.9,2.1,.14); box('glass',12,7.96,-10.32,2.65,1.92,.12);
  for (const x of [10.12,13.88]) box('stone',x,4.75,-6.4,.74,1.5,.74);
  for (const x of [6.9,16.6]) box('hedge',x,4.76,-6.65,5.4,1.45,.75);
  finish('Wakaba-house-and-balcony');
  for (const x of [8,9.55,15.3]) {
    box('clay',x,7.28,-9,1.25,.53,.68); box('soil',x,7.56,-9,1.08,.06,.53);
    for (const side of [-.5,.5]) box('wood',x+side,8.39,-9,.07,1.95,.07);
    for (const y of [8.1,8.55,8.93]) box('wood',x,y,-9,1.12,.055,.055);
    for (let i=0;i<8;i++) {
      const dx=Math.sin(i*.97)*.34;
      part(foliage,'vine',x+dx,7.64+i*.175,-8.93,.23,.21,.13,0,i*.3);
      if(i%3===1) part(foliage,'fruit',x+dx+.14,7.61+i*.175,-8.78,.068,.22,.065,0,0,.2);
      if(i%3===0) part(foliage,'flower',x+dx-.14,7.7+i*.175,-8.79,.07,.07,.04);
    }
  }
  finish('Cucumber-planters-and-trellises');
  for (const [x,z,y,size] of [[-30,-9,4,2.3],[-18,-16,4,2],[-3,-12,4,2.5],[1,-16,4,2],[24,-14,4,2.8],[30,-18,4,2],[20,4,2,1.8],[-14,5,2,2],[-28,18,.1,2],[22,19,.1,2.2]]) {
    part(trunk,'wood',x,y+1.45,z,.32,2.9,.32);
    part(foliage,'leaf',x,y+3.6,z,size,size*1.12,size*.9);
    part(foliage,'tree',x+size*.5,y+3.7,z+.4,size*.72,size*.76,size*.68);
  }
  finish('Street-and-garden-trees');
  cube.dispose(); foliage.dispose(); trunk.dispose();
  return district;
}
