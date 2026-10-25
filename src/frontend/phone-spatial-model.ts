import type { ProtagonistId } from '../runtime/dual-protagonists';
import soyoCase from '../../assets/phone-visuals/soyo/wallpaper.svg?raw';
import sakikoCase from '../../assets/phone-visuals/sakiko/wallpaper.svg?raw';
import emmaCase from '../../assets/phone-visuals/emma/wallpaper.svg?raw';
import renakoCase from '../../assets/phone-visuals/renako/wallpaper.svg?raw';

/** Authored game devices, not claims about the characters' canonical hardware. */
export const phoneModels = {
  soyo: { name: 'Petal 6', caseName: '花叶软壳', width: 418, height: 880, depth: 24, radius: 52, color: '#d7ddc7', metal: '#c4c8ba', ink: '#40584a', art: soyoCase, cameras: [[38, 38], [91, 96]], cameraWidth: 132, cameraHeight: 140 },
  sakiko: { name: 'Nocturne Pro', caseName: '深蓝银纹壳', width: 432, height: 896, depth: 27, radius: 30, color: '#18283e', metal: '#8191a9', ink: '#d1ddf0', art: sakikoCase, cameras: [[36, 36], [96, 70], [36, 104]], cameraWidth: 136, cameraHeight: 144 },
  emma: { name: 'Sakura Mini', caseName: '黑樱蓝纹壳', width: 408, height: 866, depth: 23, radius: 42, color: '#16151c', metal: '#738aa5', ink: '#f3b7ce', art: emmaCase, cameras: [[38, 38], [99, 38]], cameraWidth: 138, cameraHeight: 78 },
  renako: { name: 'Peach Flip', caseName: '甘织粉紫壳', width: 398, height: 856, depth: 22, radius: 48, color: '#f7d8e6', metal: '#c9aedb', ink: '#6d466b', art: renakoCase, cameras: [[36, 36], [36, 94]], cameraWidth: 82, cameraHeight: 138 },
} as const;

export interface PhonePose { yaw: number; pitch: number; zoom: number }
export const frontPose = (): PhonePose => ({ yaw: 0, pitch: 0, zoom: 1 });
export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
export function rotatePhone(pose: PhonePose, dx: number, dy: number): PhonePose {
  return { ...pose, yaw: ((pose.yaw + dx * .65 + 180) % 360 + 360) % 360 - 180, pitch: clamp(pose.pitch - dy * .45, -65, 65) };
}
export function zoomPhone(pose: PhonePose, ratio: number): PhonePose {
  return { ...pose, zoom: Number.isFinite(ratio) && ratio > 0 ? clamp(pose.zoom * ratio, .6, 1.8) : pose.zoom };
}

/** Fit the perspective-projected hull, including camera protrusion, into the slot. */
export function fitPhoneScale(width: number, height: number, depth: number, pose: PhonePose, availableWidth: number, availableHeight: number, requested: number) {
  const yaw = pose.yaw * Math.PI / 180, pitch = pose.pitch * Math.PI / 180;
  const corners = [-1, 1].flatMap(sx => [-1, 1].flatMap(sy => [-1, 1].map(sz => {
    const x = sx * width / 2, y = sy * height / 2, z = sz * (depth / 2 + 12);
    const turnedZ = -x * Math.sin(yaw) + z * Math.cos(yaw);
    return { x: x * Math.cos(yaw) + z * Math.sin(yaw), y: y * Math.cos(pitch) - turnedZ * Math.sin(pitch), z: y * Math.sin(pitch) + turnedZ * Math.cos(pitch) };
  })));
  const fits = (scale: number) => corners.every(p => {
    const perspective = 1800 / (1800 - scale * p.z);
    return Math.abs(p.x * scale * perspective) <= availableWidth / 2 && Math.abs(p.y * scale * perspective) <= availableHeight / 2;
  });
  if (fits(requested)) return requested;
  let low = 0, high = requested;
  for (let i = 0; i < 16; i++) { const mid = (low + high) / 2; if (fits(mid)) low = mid; else high = mid; }
  return low;
}

/** Rounded hull side quads; each is an actual plane spanning the device depth. */
export function phoneContour(width: number, height: number, radius: number) {
  const points: { x: number; y: number }[] = [];
  for (const [cx, cy, start] of [[width / 2 - radius, -height / 2 + radius, -90], [width / 2 - radius, height / 2 - radius, 0], [-width / 2 + radius, height / 2 - radius, 90], [-width / 2 + radius, -height / 2 + radius, 180]]) {
    for (let step = 0; step <= 8; step++) {
      const angle = (start! + step * 90 / 8) * Math.PI / 180;
      points.push({ x: cx! + radius * Math.cos(angle), y: cy! + radius * Math.sin(angle) });
    }
  }
  return points.map((a, i) => {
    const b = points[(i + 1) % points.length]!;
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, length: Math.hypot(b.x - a.x, b.y - a.y) + .5, angle: Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI };
  });
}

export function createPhoneSolid(doc: Document, owner: ProtagonistId): HTMLElement {
  const spec = phoneModels[owner];
  const solid = doc.createElement('div');
  solid.className = 'uc-phone-solid'; solid.dataset.phoneOwner = owner; solid.dataset.phoneModel = spec.name;
  solid.style.cssText = `width:${spec.width}px;height:${spec.height}px;--case:${spec.color};--metal:${spec.metal};--case-ink:${spec.ink};--radius:${spec.radius}px;--depth:${spec.depth}px`;
  const part = (className: string, parent = solid) => { const el = doc.createElement('div'); el.className = className; parent.append(el); return el; };
  const front = part('uc-phone-front'); front.style.transform = `translateZ(${spec.depth / 2}px)`;
  for (const quad of phoneContour(spec.width, spec.height, spec.radius)) {
    const side = part('uc-phone-edge');
    side.style.cssText = `width:${quad.length}px;height:${spec.depth}px;margin-left:${-quad.length / 2}px;margin-top:${-spec.depth / 2}px;transform:translate3d(${quad.x}px,${quad.y}px,0) rotateZ(${quad.angle}deg) rotateX(90deg);background:linear-gradient(0deg,var(--case),var(--metal) 35%,var(--case));filter:brightness(${.68 + .22 * Math.cos(quad.angle * Math.PI / 180)})`;
  }
  const back = part('uc-phone-back');
  back.style.transform = `rotateY(180deg) translateZ(${spec.depth / 2}px)`;
  back.style.backgroundImage = `url("data:image/svg+xml,${encodeURIComponent(spec.art)}")`;
  const mark = part('uc-phone-brand', back); mark.textContent = spec.name;
  const caption = part('uc-phone-case-name', back); caption.textContent = spec.caseName;
  const camera = part('uc-phone-camera', back);
  camera.style.cssText = `width:${spec.cameraWidth}px;height:${spec.cameraHeight}px;transform:translateZ(5px)`;
  spec.cameras.forEach(([x, y]) => { const lens = part('uc-phone-lens', camera); lens.style.left = `${x}px`; lens.style.top = `${y}px`; });
  const flash = part('uc-phone-flash', back); flash.style.left = `${spec.cameraWidth + 50}px`;
  for (const [x, y, length] of [[spec.width / 2 + 2, -135, 68], [-spec.width / 2 - 2, -145, 48], [-spec.width / 2 - 2, -77, 48]]) {
    const key = part('uc-phone-key'); key.style.cssText = `height:${length}px;margin-top:${-length! / 2}px;transform:translate3d(${x}px,${y}px,0) rotateY(90deg)`;
  }
  const port = part('uc-phone-port'); port.style.transform = `translate3d(0,${spec.height / 2 + .5}px,0) rotateX(90deg)`;
  return solid;
}
