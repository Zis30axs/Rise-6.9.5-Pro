import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  byId,
  campusEnclosure,
  campusSiteKeys,
  commercialDistricts,
  residentialCommunities,
  closest,
  contains,
  destinations,
  distance,
  local,
  mid,
  nodes,
  roadRoute,
  scenery,
  sites,
  streets,
  type Point,
} from '../src/frontend/tokyo-diorama/plan';
import { cityModel } from '../src/frontend/tokyo-diorama/geometry';
import { hitSite } from '../src/frontend/tokyo-diorama/picking';
import {
  MAP_DISTRICT_IDS,
  districtMapPlaces,
} from '../src/frontend/map-districts';
import { tokyoLocationPosition } from '../src/frontend/tokyo-sandbox-map';
import {
  createInitialState,
  getNovelTravelQuote,
  reduceState,
} from '../src/runtime/model';

type Poly = { p: Point[]; bounds: number[] };
function poly(p: Point[]): Poly {
  return {
    p,
    bounds: [
      Math.min(...p.map((k) => k[0])),
      Math.max(...p.map((k) => k[0])),
      Math.min(...p.map((k) => k[1])),
      Math.max(...p.map((k) => k[1])),
    ],
  };
}
function overlaps(a: Poly, b: Poly) {
  const [x, X, z, Z] = a.bounds,
    [u, U, v, V] = b.bounds;
  if (
    Math.min(X, U) - Math.max(x, u) < 0.02 ||
    Math.min(Z, V) - Math.max(z, v) < 0.02
  )
    return false;
  for (const outline of [a.p, b.p])
    for (let i = 0; i < outline.length; i++) {
      const p = outline[i],
        q = outline[(i + 1) % outline.length],
        d = distance(p, q);
      const axis = [(q[1] - p[1]) / d, (p[0] - q[0]) / d];
      const dot = (p: Point) => p[0] * axis[0] + p[1] * axis[1],
        A = a.p.map(dot),
        B = b.p.map(dot);
      if (
        Math.min(Math.max(...A), Math.max(...B)) -
          Math.max(Math.min(...A), Math.min(...B)) <
        0.02
      )
        return false;
    }
  return true;
}
const all = [...sites, ...scenery],
  outlines = all.map((s) => poly(s.polygon));
describe('the continuous Tokyo city', () => {
  it('covers the complete location registry and only shares real premises', () => {
    const original = MAP_DISTRICT_IDS.flatMap((d) =>
      districtMapPlaces(d)
        .filter((p) => tokyoLocationPosition(p.id, d))
        .map((p) => p.id)
    );
    expect(original).toHaveLength(96);
    expect([...byId.keys()].sort()).toEqual([...original].sort());
    expect([...destinations.keys()].sort()).toEqual([...original].sort());
    expect(sites).toHaveLength(81);
    expect(byId.get('aquarium')?.ids).toHaveLength(5);
    expect(byId.get('margo-cafe-room')).toBe(byId.get('street-cafe'));
    expect(byId.get('book-cafe')).toBe(byId.get('minami-ikebukuro-park'));
    expect(byId.get('chitose-bridge')).not.toBe(byId.get('junction'));
    expect(byId.get('circle-studio')).toBe(byId.get('circle'));
  });
  it('separates every destination and scenery footprint and keeps buildings off traffic lanes', () => {
    const pairs: string[] = [];
    for (let i = 0; i < outlines.length; i++)
      for (let j = i + 1; j < outlines.length; j++)
        if (overlaps(outlines[i], outlines[j])) pairs.push(i + '/' + j);
    expect(pairs).toEqual([]);
    const roads = streets
      .filter((e) => !e.walk)
      .map((e) => {
        const a = nodes[e.a],
          b = nodes[e.b],
          l = distance(a, b),
          u = ((a[1] - b[1]) * e.width) / (2 * l),
          v = ((b[0] - a[0]) * e.width) / (2 * l);
        return poly([
          [a[0] + u, a[1] + v],
          [a[0] - u, a[1] - v],
          [b[0] - u, b[1] - v],
          [b[0] + u, b[1] + v],
        ]);
      });
    const collision = all.filter(
      (s, i) =>
        s.form !== 'bridge' && roads.some((r) => overlaps(outlines[i], r))
    );
    expect(collision.map((s) => s.key || s.seed)).toEqual([]);
  });
  it('reaches every entrance, including the air terminal and summit, on one network', () => {
    const graph = new Map<number, number[]>();
    for (const e of streets)
      for (const [a, b] of [
        [e.a, e.b],
        [e.b, e.a],
      ])
        graph.set(a, [...(graph.get(a) || []), b]);
    const seen = new Set<number>(),
      queue = [streets[0].a];
    while (queue.length) {
      const n = queue.pop()!;
      if (seen.has(n)) continue;
      seen.add(n);
      queue.push(...graph.get(n)!);
    }
    expect(seen.size).toBe(graph.size);
    expect(streets.filter((e) => e.bridge)).toHaveLength(6);
    for (const s of sites) {
      expect(s.street.every((n) => seen.has(n))).toBe(true);
      expect(
        distance(
          closest(s.entry, nodes[s.street[0]], nodes[s.street[1]]),
          s.entry
        )
      ).toBeLessThan(0.0001);
      const route = roadRoute(byId.get('gate')!, s);
      expect(route.at(0)).toEqual(byId.get('gate')?.door);
      expect(route.at(-1)).toEqual(s.door);
      const endpoints = route.slice(2, -2).map((p) => nodes.indexOf(p));
      for (let i = 1; i < endpoints.length; i++)
        expect(graph.get(endpoints[i - 1])).toContain(endpoints[i]);
    }
  });
  it('selects the first visible 3D surface of every entrance group', () => {
    const world = cityModel();
    world.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(),
      misses: string[] = [];
    for (const site of sites) {
      const found = [
        [0, 0],
        [0.2, 0.1],
        [-0.21, -0.18],
        [0, 0.32],
      ].some(([u, v]) => {
        const [x, z] = local(site, site.w * u, site.d * v);
        ray.set(new THREE.Vector3(x, 160, z), new THREE.Vector3(0, -1, 0));
        const nearest = ray.intersectObject(world, true)[0];
        return nearest && hitSite(nearest) === site;
      });
      if (!found) misses.push(site.key);
    }
    expect(misses).toEqual([]);
  }, 30000);
  it('keeps the university campus unified without public car roads or stray city blocks inside', () => {
    const insideCarRoads = streets.filter(
      (e) => !e.walk && contains(mid(nodes[e.a], nodes[e.b]), campusEnclosure)
    );
    expect(insideCarRoads).toEqual([]);
    const strayScenery = scenery.filter((s) =>
      contains([s.x, s.z], campusEnclosure)
    );
    expect(strayScenery).toEqual([]);
    const straySites = sites.filter(
      (s) => !campusSiteKeys.has(s.key) && contains([s.x, s.z], campusEnclosure)
    );
    expect(straySites.map((s) => s.key)).toEqual([]);
    for (const key of ['teaching', 'library', 'dorm', 'sports', 'cafe', 'gate']) {
      const site = byId.get(key)!;
      expect(site).toBeDefined();
      expect(contains([site.x, site.z], campusEnclosure)).toBe(true);
    }
    const campusRoute = roadRoute(byId.get('gate')!, byId.get('teaching')!);
    expect(campusRoute.length).toBeGreaterThanOrEqual(4);
    for (const pt of campusRoute.slice(1, -1)) {
      expect(contains(pt, campusEnclosure)).toBe(true);
    }
  });
  it('keeps residential communities unified without cutting car roads or stray city blocks', () => {
    expect(residentialCommunities.map((c) => c.id)).toEqual([
      'downtown',
      'home',
      'riverside',
      'highland',
    ]);
    for (const comm of residentialCommunities) {
      const insideCarRoads = streets.filter(
        (e) => !e.walk && contains(mid(nodes[e.a], nodes[e.b]), comm.enclosure)
      );
      expect(insideCarRoads, comm.id).toEqual([]);
      const strayScenery = scenery.filter((s) =>
        contains([s.x, s.z], comm.enclosure)
      );
      expect(strayScenery, comm.id).toEqual([]);
      const straySites = sites.filter(
        (s) => !comm.siteKeys.has(s.key) && contains([s.x, s.z], comm.enclosure)
      );
      expect(straySites.map((s) => s.key), comm.id).toEqual([]);
      for (const key of comm.siteKeys) {
        const site = byId.get(key)!;
        expect(site, key).toBeDefined();
        expect(contains([site.x, site.z], comm.enclosure), key).toBe(true);
      }
    }
    expect(byId.get('soyo-house')?.form).toBe('luxury-tower');
    const dtRoute = roadRoute(
      byId.get('soyo-house')!,
      byId.get('toyokawa-house')!
    );
    expect(dtRoute.length).toBeGreaterThanOrEqual(4);
    const dtEnc = residentialCommunities.find((c) => c.id === 'downtown')!.enclosure;
    for (const pt of dtRoute.slice(1, -1)) {
      expect(contains(pt, dtEnc)).toBe(true);
    }
  });
  it('keeps Ikebukuro and Shinjuku commercial hubs unified with full pedestrian connectivity', () => {
    expect(commercialDistricts.map((c) => c.id)).toEqual([
      'commercial',
      'grand-commercial',
    ]);
    for (const hub of commercialDistricts) {
      const insideCarRoads = streets.filter(
        (e) => !e.walk && contains(mid(nodes[e.a], nodes[e.b]), hub.enclosure)
      );
      expect(insideCarRoads, hub.id).toEqual([]);
      const strayScenery = scenery.filter((s) =>
        contains([s.x, s.z], hub.enclosure)
      );
      expect(strayScenery, hub.id).toEqual([]);
      const straySites = sites.filter(
        (s) => !hub.siteKeys.has(s.key) && contains([s.x, s.z], hub.enclosure)
      );
      expect(straySites.map((s) => s.key), hub.id).toEqual([]);
      for (const key of hub.siteKeys) {
        const site = sites.find((item) => item.key === key)!;
        expect(site, key).toBeDefined();
        expect(contains([site.x, site.z], hub.enclosure), key).toBe(true);
      }
    }
    const sunRoute = roadRoute(
      byId.get('aquarium')!,
      byId.get('minami-ikebukuro-park')!
    );
    expect(sunRoute.length).toBeGreaterThanOrEqual(4);
    const cmEnc = commercialDistricts.find((c) => c.id === 'commercial')!.enclosure;
    for (const pt of sunRoute.slice(1, -1)) {
      expect(contains(pt, cmEnc)).toBe(true);
    }
  });
  it('browsing and routing leave the world unchanged; explicit travel uses the registered quote', () => {
    const state = createInitialState(),
      before = JSON.stringify(state),
      id = 'aquarium';
    const quote = getNovelTravelQuote(state, id);
    roadRoute(byId.get(state.locationId)!, byId.get(id)!);
    expect(JSON.stringify(state)).toBe(before);
    const after = reduceState(state, { type: 'novel_travel', locationId: id });
    expect(after.locationId).toBe(id);
    expect(
      (after.clock.hour - state.clock.hour) * 60 +
        after.clock.minute -
        state.clock.minute
    ).toBe(quote.minutes);
  });
});
