// Depth-tested rendering of the same indexed city surfaces for WebViews without WebGL.
import * as T from 'three';
import type { ResolvedAtmospherePreset } from '../tokyo-sandbox-vfx';
type Draw = {
  coords: Float32Array;
  colors: Uint8ClampedArray;
  uv: ArrayLike<number> | null;
  day?: Uint8ClampedArray;
  night?: Uint8ClampedArray;
};
export function softwareView(canvas: HTMLCanvasElement, world: T.Group) {
  const ctx = canvas.getContext('2d', { alpha: false })!;
  const draws: Draw[] = [];
  world.updateMatrixWorld(true);
  world.traverse((o) => {
    if (!(o instanceof T.Mesh)) return;
    for (let n: T.Object3D | null = o; n; n = n.parent)
      if (n.userData.isSu30 || n.visible === false) return;
    const g = o.geometry,
      xyz = g.getAttribute('position'),
      color = g.getAttribute('color'),
      normal = g.getAttribute('normal'),
      uv = g.getAttribute('uv');
    const count = g.index?.count ?? xyz.count,
      coords = new Float32Array(count * 3),
      colors = new Uint8ClampedArray(count * 3);
    const texcoord = uv ? new Float32Array(count * 2) : null,
      pos = new T.Vector3(),
      n = new T.Vector3(),
      c = new T.Color(),
      light = new T.Vector3(-0.46, 0.82, 0.36).normalize(),
      normMat = new T.Matrix3().getNormalMatrix(o.matrixWorld);
    const mat = Array.isArray(o.material) ? o.material[0] : o.material,
      texture = (t?: T.Texture) => {
        const el = t?.image as HTMLCanvasElement | undefined;
        return el?.getContext?.('2d')?.getImageData(0, 0, el.width, el.height)
          .data;
      };
    for (let i = 0; i < count; i++) {
      const k = g.index?.getX(i) ?? i;
      pos
        .fromBufferAttribute(xyz, k)
        .applyMatrix4(o.matrixWorld)
        .toArray(coords, i * 3);
      if (color) c.fromBufferAttribute(color, k);
      else c.copy(mat.color);
      c.convertLinearToSRGB();
      const l =
        0.8 +
        0.19 *
          Math.max(
            0,
            n
              .fromBufferAttribute(normal, k)
              .applyMatrix3(normMat)
              .normalize()
              .dot(light)
          );
      colors[i * 3] = c.r * l * 255;
      colors[i * 3 + 1] = c.g * l * 255;
      colors[i * 3 + 2] = c.b * l * 255;
      if (texcoord) {
        texcoord[i * 2] = uv.getX(k);
        texcoord[i * 2 + 1] = uv.getY(k);
      }
    }
    draws.push({
      coords,
      colors,
      uv: texcoord,
      day: texture(mat.map),
      night: texture(mat.emissiveMap),
    });
  });
  // Bake a directional horizon from the actual roofs and terrain. The CPU path
  // uses its world-space height for both cast shadows and soft contact shading.
  const gridW = 751,
    gridH = 621,
    originX = -325,
    originZ = -268,
    field = new Float32Array(gridW * gridH);
  for (const { coords } of draws)
    for (let k = 0; k < coords.length; k += 9) {
      const ax = coords[k] - originX,
        az = coords[k + 2] - originZ,
        bx = coords[k + 3] - originX,
        bz = coords[k + 5] - originZ,
        cx = coords[k + 6] - originX,
        cz = coords[k + 8] - originZ;
      const dx = bx - ax,
        dz = bz - az,
        ex = cx - ax,
        ez = cz - az,
        det = dx * ez - dz * ex;
      if (Math.abs(det) < 0.09) continue;
      const y0 = coords[k + 1],
        y1 = coords[k + 4] - y0,
        y2 = coords[k + 7] - y0;
      if (Math.max(y0, y0 + y1, y0 + y2) > 85) continue;
      for (
        let z = Math.max(0, Math.ceil(Math.min(az, bz, cz)));
        z <= Math.min(gridH - 1, Math.floor(Math.max(az, bz, cz)));
        z++
      )
        for (
          let x = Math.max(0, Math.ceil(Math.min(ax, bx, cx)));
          x <= Math.min(gridW - 1, Math.floor(Math.max(ax, bx, cx)));
          x++
        ) {
          const u = ((x - ax) * ez - (z - az) * ex) / det,
            v = (dx * (z - az) - dz * (x - ax)) / det;
          if (u >= 0 && v >= 0 && u + v <= 1) {
            const i = z * gridW + x;
            field[i] = Math.max(field[i], y0 + u * y1 + v * y2);
          }
        }
    }
  for (let z = gridH - 2; z >= 0; z--)
    for (let x = 1; x < gridW; x++) {
      const j = z * gridW + x;
      field[j] = Math.max(
        field[j],
        (field[j - 1] + field[j - 1 + gridW]) * 0.5 - 1.2
      );
    }
  let width = 0,
    height = 0,
    depth = new Float32Array(0),
    bitmap: ImageData;
  return function paint(
    camera: T.PerspectiveCamera,
    w: number,
    h: number,
    mode: ResolvedAtmospherePreset
  ) {
    const ratio = Math.min(1.24, 1536 / w, 1040 / h);
    const W = Math.max(1, Math.round(w * ratio)),
      H = Math.max(1, Math.round(h * ratio));
    if (W !== width || H !== height) {
      canvas.width = width = W;
      canvas.height = height = H;
      depth = new Float32Array(W * H);
      bitmap = ctx.createImageData(W, H);
    }
    depth.fill(-Infinity);
    const night = mode === 'night' || mode === 'cyber',
      dusk = mode === 'dusk';
    const px = bitmap.data,
      words = new Uint32Array(px.buffer);
    words.fill(night ? 0xff3b3027 : dusk ? 0xffbdd4e4 : 0xffdce8e4);
    const M = new T.Matrix4().multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    ).elements;
    for (const draw of draws) {
      const { coords, colors, uv } = draw,
        texture = night ? draw.night : draw.day;
      for (let k = 0; k < coords.length; k += 9) {
        const screen = [] as number[];
        for (let j = k; j < k + 9; j += 3) {
          const x = coords[j],
            y = coords[j + 1],
            z = coords[j + 2],
            iw = 1 / (M[3] * x + M[7] * y + M[11] * z + M[15]);
          if (iw <= 0) break;
          screen.push(
            ((M[0] * x + M[4] * y + M[8] * z + M[12]) * iw * 0.5 + 0.5) * W,
            (0.5 - (M[1] * x + M[5] * y + M[9] * z + M[13]) * iw * 0.5) * H,
            iw
          );
        }
        if (screen.length !== 9) continue;
        const [ax, ay, az, bx, by, bz, cx, cy, cz] = screen,
          dx = bx - ax,
          dy = by - ay,
          ex = cx - ax,
          ey = cy - ay,
          det = dx * ey - dy * ex;
        if (Math.abs(det) < 0.12) continue;
        const l = Math.max(0, Math.floor(Math.min(ax, bx, cx))),
          r = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx))),
          t = Math.max(0, Math.floor(Math.min(ay, by, cy))),
          b = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)));
        const unlit = night && !texture;
        const dr = unlit ? 0.38 : dusk ? 1.04 : 1,
          dg = unlit ? 0.46 : dusk ? 0.89 : 1,
          db = unlit ? 0.62 : dusk ? 0.79 : 1;
        const rr = colors[k] * dr,
          gg = colors[k + 1] * dg,
          bb = colors[k + 2] * db,
          uvIndex = (k / 3) * 2;
        for (let y = t; y <= b; y++) {
          let u = ((l + 0.5 - ax) * ey - (y + 0.5 - ay) * ex) / det,
            v = (dx * (y + 0.5 - ay) - dy * (l + 0.5 - ax)) / det;
          for (let x = l; x <= r; x++, u += ey / det, v -= dy / det) {
            if (u < 0 || v < 0 || u + v > 1) continue;
            const at = y * W + x,
              z = az + u * (bz - az) + v * (cz - az);
            if (z < depth[at]) continue;
            depth[at] = z;
            const p = at * 4;
            const wa = ((1 - u - v) * az) / z,
              wb = (u * bz) / z,
              wc = (v * cz) / z;
            const gx = Math.round(
                wa * coords[k] +
                  wb * coords[k + 3] +
                  wc * coords[k + 6] -
                  originX
              ),
              gz = Math.round(
                wa * coords[k + 2] +
                  wb * coords[k + 5] +
                  wc * coords[k + 8] -
                  originZ
              ),
              gy = wa * coords[k + 1] + wb * coords[k + 4] + wc * coords[k + 7];
            let shade = 1;
            if (
              gx > 1 &&
              gz > 1 &&
              gx < gridW - 2 &&
              gz < gridH - 2 &&
              !night
            ) {
              const cell = gz * gridW + gx,
                base = gy + 1.0;
              const soft = (v: number) =>
                Math.min(1, Math.max(0, (v - base) * 0.65));
              const occlusion =
                soft(field[cell]) * 0.5 +
                (soft(field[cell - 1]) +
                  soft(field[cell + 1]) +
                  soft(field[cell - gridW]) +
                  soft(field[cell + gridW])) *
                  0.125;
              shade = 1 - 0.32 * occlusion;
            }
            if (texture && uv) {
              const s =
                  wa * uv[uvIndex] +
                  wb * uv[uvIndex + 2] +
                  wc * uv[uvIndex + 4],
                q =
                  wa * uv[uvIndex + 1] +
                  wb * uv[uvIndex + 3] +
                  wc * uv[uvIndex + 5],
                i =
                  ((127 - (Math.floor(q * 128) & 127)) * 128 +
                    (Math.floor(s * 128) & 127)) *
                  4;
              px[p] = ((rr * texture[i]) / 255) * shade;
              px[p + 1] = ((gg * texture[i + 1]) / 255) * (0.05 + 0.95 * shade);
              px[p + 2] = ((bb * texture[i + 2]) / 255) * (0.15 + 0.85 * shade);
            } else {
              px[p] = rr * shade;
              px[p + 1] = gg * (0.05 + 0.95 * shade);
              px[p + 2] = bb * (0.15 + 0.85 * shade);
            }
          }
        }
      }
    }
    ctx.putImageData(bitmap, 0, 0);
  };
}
