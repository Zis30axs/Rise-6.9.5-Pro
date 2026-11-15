/** Shared floating zone-outline and borderless label helpers across city sandboxes. */
export type CameraPoint3 = { x: number; y: number; z: number };
export type ScreenPoint2 = { x: number; y: number };

export interface OutlineZoneOverlay {
  id: string;
  targetId: string;
  kind: 'district' | 'place';
  points: string;
  corners: string[];
  selected: boolean;
  current: boolean;
  available: boolean;
}

/**
 * Estimates floating label hit-box width from text length so short titles stay
 * compact on the map while keeping collision and touch targets exact.
 */
export function estimateFloatingLabelWidth(
  text: string,
  fontSizePx: number,
  extraPx = 0,
  minWidth = 56,
  maxWidth = 136,
): number {
  let units = 0;
  for (const ch of text) {
    units += ch.charCodeAt(0) > 127 ? 1.06 : 0.62;
  }
  return Math.min(maxWidth, Math.max(minWidth, Math.ceil(units * fontSizePx + extraPx)));
}

/**
 * Clips a camera-space polygon (camera looks down -Z) against z <= -nearPlane
 * so ground selection outlines project cleanly without inverted coordinates.
 */
export function clipViewPolygonToNearPlane(
  points: readonly CameraPoint3[],
  nearPlane = 2,
): CameraPoint3[] {
  if (points.length < 3) return [];
  const zLimit = -Math.max(0.25, nearPlane);
  const clipped: CameraPoint3[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const cur = points[i]!;
    const prev = points[(i + points.length - 1) % points.length]!;
    const curIn = cur.z <= zLimit;
    const prevIn = prev.z <= zLimit;
    if (curIn !== prevIn) {
      const denom = cur.z - prev.z;
      const t = Math.abs(denom) > 1e-6 ? (zLimit - prev.z) / denom : 0;
      clipped.push({
        x: prev.x + (cur.x - prev.x) * t,
        y: prev.y + (cur.y - prev.y) * t,
        z: zLimit,
      });
    }
    if (curIn) clipped.push(cur);
  }
  return clipped;
}

/** Builds short L-shaped SVG corner bracket paths along a projected polygon's vertices. */
export function buildOutlineCornerPaths(points: readonly ScreenPoint2[], fraction = 0.22): string[] {
  const n = points.length;
  if (n < 3) return [];
  return points.map((p, idx) => {
    const prev = points[(idx + n - 1) % n]!;
    const next = points[(idx + 1) % n]!;
    const ax = p.x + (prev.x - p.x) * fraction;
    const ay = p.y + (prev.y - p.y) * fraction;
    const bx = p.x + (next.x - p.x) * fraction;
    const by = p.y + (next.y - p.y) * fraction;
    return `M${ax.toFixed(1)},${ay.toFixed(1)} L${p.x.toFixed(1)},${p.y.toFixed(1)} L${bx.toFixed(1)},${by.toFixed(1)}`;
  });
}

/** Builds a culled SVG wireframe zone + corner-bracket overlay from 2D screen polygon corners. */
export function computeRectOutlineFromScreenCorners(
  id: string,
  targetId: string,
  kind: 'district' | 'place',
  screenPts: readonly ScreenPoint2[],
  width: number,
  height: number,
  options: { selected?: boolean; current?: boolean; available?: boolean; cornerFraction?: number } = {},
): OutlineZoneOverlay | null {
  if (screenPts.length < 3) return null;
  if (screenPts.some(pt => !Number.isFinite(pt.x) || !Number.isFinite(pt.y) || Math.abs(pt.x) > 12000 || Math.abs(pt.y) > 12000)) {
    return null;
  }
  const xs = screenPts.map(pt => pt.x);
  const ys = screenPts.map(pt => pt.y);
  if (Math.max(...xs) < -120 || Math.min(...xs) > width + 120 || Math.max(...ys) < -120 || Math.min(...ys) > height + 120) {
    return null;
  }
  const fraction = options.cornerFraction ?? (kind === 'district' ? 0.18 : 0.28);
  return {
    id,
    targetId,
    kind,
    points: screenPts.map(pt => `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(' '),
    corners: buildOutlineCornerPaths(screenPts, fraction),
    selected: Boolean(options.selected),
    current: Boolean(options.current),
    available: options.available ?? true,
  };
}

/** Computes a padded world-space rectangle around a group of map coordinates. */
export function computePointsBoundingRect(
  points: readonly { x: number; z: number }[],
  minHalfSpan = 10,
  padding = 7,
): { minX: number; maxX: number; minZ: number; maxZ: number; cx: number; cz: number } | null {
  if (!points.length) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const pt of points) {
    minX = Math.min(minX, pt.x);
    maxX = Math.max(maxX, pt.x);
    minZ = Math.min(minZ, pt.z);
    maxZ = Math.max(maxZ, pt.z);
  }
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const halfX = Math.max(minHalfSpan, (maxX - minX) / 2 + padding);
  const halfZ = Math.max(minHalfSpan, (maxZ - minZ) / 2 + padding);
  return { minX: cx - halfX, maxX: cx + halfX, minZ: cz - halfZ, maxZ: cz + halfZ, cx, cz };
}
