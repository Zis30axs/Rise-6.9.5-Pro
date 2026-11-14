import { describe, expect, it } from 'vitest';
import { arrangeMapLabels, mapLabelsOverlap, type MapLabelCandidate } from '../src/frontend/map-label-layout';

describe('shared map label placement', () => {
  it('keeps the other protagonist ahead of residents, places and pedestrians on a short mobile map', () => {
    const labels = Array.from({ length: 32 }, (_, i) => ({
      id: 'label-' + i, x: 210, y: 85, width: 44, height: 44, priority: 2,
    }));
    labels.push({ id: 'player', x: 180, y: 90, width: 44, height: 44, priority: 0 });
    labels.push({ id: 'sakiko', x: 230, y: 60, width: 44, height: 44, priority: 1 });
    const layout = arrangeMapLabels(labels, 260, 170, [
      { x: 236, y: 23, width: 48, height: 46 }, { x: 130, y: 138, width: 260, height: 64 },
    ]);
    expect(layout.has('player')).toBe(true);
    expect(layout.has('sakiko')).toBe(true);
    expect(layout.size).toBeGreaterThanOrEqual(5);
  });
  for (const [width, height] of [[620, 420], [350, 340], [280, 260]]) {
    it(`keeps mixed labels apart at ${width} x ${height}, with the player first`, () => {
      const labels: MapLabelCandidate[] = Array.from({ length: 30 }, (_, i) => ({
        id: 'label-' + i, x: width / 2, y: height / 2, width: i % 3 === 0 ? 128 : 44,
        height: 44, priority: i + 1,
      }));
      labels.push({ id: 'player', x: width / 2, y: height / 2, width: 44, height: 44, priority: 0 });
      const arranged = arrangeMapLabels(labels, width, height);
      expect(arranged.get('player')).toMatchObject({ x: width / 2, y: height / 2 });
      expect(arranged.size).toBeGreaterThan(3);
      const boxes = [...arranged.values()];
      for (const [index, box] of boxes.entries()) {
        expect(box.x - box.width / 2).toBeGreaterThanOrEqual(4);
        expect(box.y + box.height / 2).toBeLessThanOrEqual(height - 4);
        for (const other of boxes.slice(index + 1)) expect(mapLabelsOverlap(box, other)).toBe(false);
      }
    });
  }
});
