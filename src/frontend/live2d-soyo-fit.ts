/** Fit the complete authored Cubism model within the portrait stage, hem first. */
export function fitSoyoPortrait(viewWidth: number, viewHeight: number, modelWidth: number, modelHeight: number) {
  if (![viewWidth, viewHeight, modelWidth, modelHeight].every(value => Number.isFinite(value) && value > 0)) return null;
  return {
    scale: Math.min(viewWidth / modelWidth, viewHeight / modelHeight),
    x: viewWidth / 2,
    y: viewHeight,
  };
}
