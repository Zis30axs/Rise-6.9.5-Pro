import { Raycaster, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import source from '../assets/circle-livehouse/circle-sandbox.json';
import { createCircleSandboxGeometry } from '../src/frontend/circle-sandbox-geometry';
import type { CircleSandboxOverlay } from '../src/frontend/circle-sandbox-pack';
import { disposeThreeTree } from '../src/frontend/dispose-three-tree';

const overlay = source as CircleSandboxOverlay;

describe('CiRCLE sandbox exterior', () => {
  it.each([-.05, -1.53])('keeps the plaza route outside the buildings at ground y=%s', ground => {
    const model = createCircleSandboxGeometry(overlay, ground);
    try {
      model.updateMatrixWorld(true);
      const road = overlay.roads[0]!;
      for (const x of [road.x, road.x - road.width / 2 + 1, road.x + road.width / 2 - 1]) {
        const ray = new Raycaster(new Vector3(x, 20, road.z), new Vector3(0, -1, 0));
        const first = ray.intersectObject(model, true)[0];
        expect(first?.object.name).toBe('circle:paving');
        expect(first?.point.y).toBeCloseTo(ground + .27);
      }
      expect(model.getObjectByName('circle:glazing')).toBeDefined();
      expect(model.getObjectByName('circle:ivory')).toBeDefined();
    } finally {
      disposeThreeTree(model);
    }
  });
});
