/** Full native-resolution WebGL backing store for the Tokyo GLB map.
 * The camera zoom never controls render resolution: overview and district
 * close-ups use the same device-pixel ratio, independent of browser scaling.
 */
export interface TokyoCanvasResolution {
  width: number;
  height: number;
  pixelRatio: number;
}

interface ResolutionRenderer {
  setPixelRatio(ratio: number): void;
  setSize(width: number, height: number, updateStyle: boolean): void;
}

export function nativeTokyoCanvasResolution(
  cssWidth: number, cssHeight: number, devicePixelRatio?: number,
): TokyoCanvasResolution {
  const width = Number.isFinite(cssWidth) ? Math.max(1, Math.ceil(cssWidth)) : 1;
  const height = Number.isFinite(cssHeight) ? Math.max(1, Math.ceil(cssHeight)) : 1;
  const ratio = typeof devicePixelRatio === 'number' && Number.isFinite(devicePixelRatio) && devicePixelRatio > 0
    ? devicePixelRatio : 1;
  // No arbitrary 1.4x (or 1x) cap that blurs a Retina/HiDPI viewport.
  return { width, height, pixelRatio: Math.max(1, ratio) };
}

export function applyTokyoCanvasResolution(
  renderer: ResolutionRenderer,
  next: TokyoCanvasResolution,
  previous?: TokyoCanvasResolution,
): TokyoCanvasResolution {
  if (previous?.pixelRatio !== next.pixelRatio) renderer.setPixelRatio(next.pixelRatio);
  if (previous?.width !== next.width || previous?.height !== next.height) {
    // false leaves the CSS full-viewport size untouched; Three.js sets the
    // actual drawing buffer to (width * pixelRatio, height * pixelRatio).
    renderer.setSize(next.width, next.height, false);
  }
  return next;
}
