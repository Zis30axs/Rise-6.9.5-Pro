export interface MapLabelBox { x: number; y: number; width: number; height: number }
export interface MapLabelCandidate extends MapLabelBox { id: string; priority: number }

export function mapLabelsOverlap(a: MapLabelBox, b: MapLabelBox, gap = 4): boolean {
  return Math.abs(a.x - b.x) < (a.width + b.width) / 2 + gap &&
    Math.abs(a.y - b.y) < (a.height + b.height) / 2 + gap;
}

/** All label categories share the same hit-box budget. Overflow stays in the list,
 * rather than falling back to an overlapping, unclickable label at its anchor.
 */
export function arrangeMapLabels(candidates: readonly MapLabelCandidate[], width: number, height: number,
  reserved: readonly MapLabelBox[] = []): Map<string, MapLabelBox> {
  const placed = new Map<string, MapLabelBox>(), occupied = [...reserved];
  for (const candidate of [...candidates].sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))) {
    const offsets: [number, number][] = [[0, 0]];
    for (const radius of [48, 96, 144, 192]) {
      for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        offsets.push([dx! * radius, dy! * radius]);
      }
    }
    // A short viewport needs aligned rows; arbitrary anchor offsets can waste
    // the only two usable rows even though there is room for more touch targets.
    if (height < 240) offsets.length = 0;
    if (candidate.width > width - 8 || candidate.height > height - 8) continue;
    let box = offsets.map(([dx, dy]) => ({
      width: candidate.width, height: candidate.height,
      x: Math.max(candidate.width / 2 + 4, Math.min(width - candidate.width / 2 - 4, candidate.x + dx)),
      y: Math.max(candidate.height / 2 + 4, Math.min(height - candidate.height / 2 - 4, candidate.y + dy)),
    })).find(next => occupied.every(previous => !mapLabelsOverlap(next, previous)));
    if (!box) {
      const grid: MapLabelBox[] = [];
      for (let y = candidate.height / 2 + 4; y <= height - candidate.height / 2 - 4; y += 48) {
        for (let x = candidate.width / 2 + 4; x <= width - candidate.width / 2 - 4; x += 48)
          grid.push({ x, y, width: candidate.width, height: candidate.height });
      }
      box = grid.sort((a, b) => Math.hypot(a.x - candidate.x, a.y - candidate.y) - Math.hypot(b.x - candidate.x, b.y - candidate.y))
        .find(next => occupied.every(previous => !mapLabelsOverlap(next, previous)));
    }
    if (box) { occupied.push(box); placed.set(candidate.id, box); }
  }
  return placed;
}
