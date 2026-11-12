import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { CircleSandboxOverlay } from './circle-sandbox-pack';

const colors = {
  plaster: '#ede8d7',
  stone: '#aaa89c',
  charcoal: '#263439',
  glazing: '#568186',
  reflection: '#a0c3c0',
  red: '#b93439',
  scarlet: '#df5650',
  ivory: '#fff4dc',
  timber: '#bb8d61',
  darkTimber: '#906745',
  paving: '#d7cdb8',
  soil: '#776e5a',
  leaf: '#557751',
} as const;
type Finish = keyof typeof colors;

type Stroke = readonly (readonly [number, number])[];
const letters: Record<string, readonly Stroke[]> = {
  C: [[[.75, .9], [.58, 1], [.22, 1], [0, .79], [0, .21], [.22, 0], [.58, 0], [.75, .1]]],
  i: [[[.2, 0], [.2, .63]], [[.2, .89], [.2, .94]]],
  R: [[[0, 0], [0, 1], [.53, 1], [.73, .84], [.73, .64], [.53, .5], [0, .5]], [[.36, .5], [.75, 0]]],
  L: [[[0, 1], [0, 0], [.72, 0]]],
  E: [[[.72, 1], [0, 1], [0, 0], [.72, 0]], [[0, .51], [.55, .51]]],
  S: [[[.72, .92], [.56, 1], [.18, 1], [0, .83], [0, .64], [.18, .51], [.54, .49], [.72, .35], [.72, .15], [.54, 0], [.16, 0], [0, .08]]],
  T: [[[0, 1], [.75, 1]], [[.375, 1], [.375, 0]]],
  U: [[[0, 1], [0, .18], [.17, 0], [.57, 0], [.74, .18], [.74, 1]]],
  D: [[[0, 0], [0, 1], [.5, 1], [.74, .78], [.74, .22], [.5, 0], [0, 0]]],
  I: [[[.36, 0], [.36, 1]]],
  O: [[[.17, 0], [0, .17], [0, .83], [.17, 1], [.57, 1], [.74, .83], [.74, .17], [.57, 0], [.17, 0]]],
};

/** The visual model is shared by the decoded Tokyo map and its offline geometric fallback. */
export function createCircleSandboxGeometry(overlay: CircleSandboxOverlay, ground: number): THREE.Group {
  const root = new THREE.Group();
  root.name = 'circle-sandbox-pack';
  root.position.y = ground;

  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const batches = new Map<Finish, THREE.BufferGeometry[]>();
  const add = (geometry: THREE.BufferGeometry, finish: Finish) => {
    const batch = batches.get(finish) ?? [];
    batch.push(geometry);
    batches.set(finish, batch);
  };
  const box = (finish: Finish, x: number, y: number, z: number, w: number, h: number, d: number, rx = 0) => {
    add(unitBox.clone().scale(w, h, d).rotateX(rx).translate(x, y, z), finish);
  };
  const round = (finish: Finish, x: number, y: number, z: number, top: number, bottom: number, h: number, rx = 0) => {
    add(new THREE.CylinderGeometry(top, bottom, h, 12).rotateX(rx).translate(x, y, z), finish);
  };
  const wordmark = (word: string, center: number, y: number, z: number, size: number, tilt = 0) => {
    const start = center - (word.length * .93 - .18) * size / 2;
    [...word].forEach((letter, index) => {
      for (const stroke of letters[letter]!) {
        for (let i = 1; i < stroke.length; i++) {
          const [ax, ay] = stroke[i - 1]!, [bx, by] = stroke[i]!;
          const thickness = .105 * size;
          const height = (ay + by) * size / 2;
          add(unitBox.clone().scale(Math.hypot(bx - ax, by - ay) * size + thickness, thickness, .08)
            .rotateZ(Math.atan2(by - ay, bx - ax)).rotateX(tilt)
            .translate(start + (index * .93 + (ax + bx) / 2) * size,
              y + height * Math.cos(tilt), z + height * Math.sin(tilt)), 'ivory');
        }
      }
    });
  };
  const window = (x: number, y: number, z: number, w: number, h: number) => {
    box('charcoal', x, y, z, w, h, .24);
    box('glazing', x, y, z + .16, w - .25, h - .24, .1);
    box('reflection', x - w * .24, y, z + .22, .12, h - .33, .04);
    box('charcoal', x, y, z + .23, .11, h, .08);
  };

  const hall = overlay.buildings.find(building => building.id === 'building:circle-hall')!;
  const studio = overlay.buildings.find(building => building.id === 'building:circle-studio')!;
  const x = hall.x, z = hall.z, front = z + hall.depth / 2;
  const wingFront = studio.z + studio.depth / 2;

  // Cream upper stories, glass entry and the red awning from the game exterior.
  box('plaster', x, hall.height / 2, z, hall.width, hall.height, hall.depth);
  box('stone', x, .18, z, hall.width + .35, .36, hall.depth + .35);
  box('stone', x, hall.height + .07, z, hall.width + .32, .34, hall.depth + .32);
  box('charcoal', x, hall.height + .29, z, hall.width - .5, .14, hall.depth - .5);
  for (const edge of [-1, 1]) {
    box('plaster', x + edge * (hall.width / 2 - .28), hall.height + .48, z, .55, .5, hall.depth);
    box('plaster', x, hall.height + .48, z + edge * (hall.depth / 2 - .28), hall.width, .5, .55);
  }
  for (const floor of [6.7, 9.25]) {
    for (const dx of [-9, -3, 3, 9]) window(x + dx, floor, front + .03, 4.05, 1.52);
    box('stone', x, floor - 1.12, front + .09, hall.width, .13, .21);
  }
  box('stone', x - 6.3, hall.height + .75, z - 3.1, 3.65, 1.1, 2.25);
  box('charcoal', x - 6.3, hall.height + 1.32, z - 3.1, 3.8, .11, 2.4);
  box('stone', x + 5.2, hall.height + .61, z - 2.8, 2.7, .78, 1.55);

  box('charcoal', x, 2.2, front + .1, 23.2, 3.95, .23);
  for (const dx of [-8.4, -4.25, 0, 4.25, 8.4]) window(x + dx, 2.14, front + .28, 3.9, 3.25);
  for (const dx of [-.35, .35]) box('ivory', x + dx, 2.02, front + .59, .09, .63, .08);
  box('charcoal', x, 5.05, front + .23, 14.5, 1.82, .42);
  round('red', x - 5.65, 5.05, front + .48, .63, .63, .16, Math.PI / 2);
  round('ivory', x - 5.65, 5.05, front + .58, .28, .28, .08, Math.PI / 2);
  wordmark('CiRCLE', x + .35, 4.5, front + .48, 1.08);
  box('red', x, 4.01, front + 1.33, 24, .23, 2.8, .16);
  wordmark('CiRCLE', x, 4.01, front + 2.42, .83, .16 - Math.PI / 2);
  box('scarlet', x, 3.65, front + 2.68, 24, .56, .16);
  for (const dx of [-10, -6, -2, 2, 6, 10]) box('red', x + dx, 3.65, front + 2.77, .14, .54, .08);

  // Rehearsal annex has a distinct low profile, banded facade and its own entrance.
  box('plaster', studio.x, studio.height / 2, studio.z, studio.width, studio.height, studio.depth);
  box('stone', studio.x, .19, studio.z, studio.width + .24, .38, studio.depth + .24);
  box('charcoal', studio.x, studio.height, studio.z, studio.width + .36, .34, studio.depth + .36);
  box('red', studio.x, studio.height - .49, wingFront + .09, studio.width, .45, .22);
  window(studio.x, 1.8, wingFront + .12, 3.1, 2.95);
  for (const dx of [-4.6, 4.6]) window(studio.x + dx, 4.58, wingFront + .12, 3.85, 1.1);
  box('charcoal', studio.x, 3.95, wingFront + .22, 6.25, 1.05, .26);
  wordmark('STUDIO', studio.x, 3.66, wingFront + .39, .54);

  // Paving at the real ground plane, plus a raised wood terrace and small café furniture.
  const terraceX = x - 1.6, terraceZ = front + 3.1;
  box('paving', x + 7, .06, front + 11, 47, .12, 23);
  for (const road of overlay.roads) box('paving', road.x, .19, road.z, road.width, .16, road.depth);
  box('darkTimber', terraceX, .28, terraceZ, 22.8, .34, 6.4);
  for (let row = 0; row < 13; row++) {
    box('timber', terraceX, .49, terraceZ - 3 + row * .49, 22.8, .13, .46);
  }
  box('timber', x, .25, front + 6.62, 7.6, .3, .75);
  for (const dx of [-8.3, 7.1]) {
    const tableX = x + dx, tableZ = front + 4.85;
    round('charcoal', tableX, .96, tableZ, .09, .15, .8);
    round('timber', tableX, 1.4, tableZ, .73, .73, .14);
    for (const offset of [-1.02, 1.02]) {
      round('charcoal', tableX + offset, .76, tableZ, .07, .11, .44);
      round('timber', tableX + offset, 1.01, tableZ, .26, .26, .13);
    }
  }
  const kioskX = x - 10.2, kioskZ = front + 2.05;
  box('darkTimber', kioskX, 1.15, kioskZ, 2.75, 1.25, 1.32);
  box('ivory', kioskX, 1.84, kioskZ, 2.96, .16, 1.52);
  box('scarlet', kioskX, 2.93, kioskZ, 3.18, .19, 1.71);
  for (const dx of [-1.18, 1.18]) box('charcoal', kioskX + dx, 2.34, kioskZ, .13, 1.12, .12);
  for (const [px, pz] of [[x - 13.2, front + 7.1], [x + 11.3, front + 7.1], [studio.x - 6.2, wingFront + 1.9]] as const) {
    box('stone', px, .45, pz, 1.35, .66, 1.23);
    box('soil', px, .8, pz, 1.13, .06, 1.01);
    round('leaf', px, 1.09, pz, .4, .53, .61);
  }

  for (const [finish, parts] of batches) {
    const geometry = mergeGeometries(parts)!;
    parts.forEach(part => part.dispose());
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
      color: colors[finish],
      roughness: finish === 'glazing' ? .46 : .82,
      ...(finish === 'ivory' ? { emissive: colors.ivory, emissiveIntensity: .08 } : {}),
    }));
    mesh.name = `circle:${finish}`;
    root.add(mesh);
  }
  unitBox.dispose();
  return root;
}
