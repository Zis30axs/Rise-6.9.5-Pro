import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, reactive, type App } from 'vue';
import CaliforniaSandbox from '../src/frontend/CaliforniaSandbox.vue';
import { californiaPlaces, internationalConnections, internationalLeg } from '../src/runtime/california';
import sandbox from '../assets/california-sandbox/sandbox.json';

const drawing = vi.hoisted(() => ({
  mount: vi.fn(), update: vi.fn(), destroy: vi.fn(),
  setScope: vi.fn(), zoomBy: vi.fn(), rotate: vi.fn(), reset: vi.fn(), selectSight: vi.fn(),
}));
vi.mock('../src/frontend/california-sandbox-renderer.js', () => ({ mountCaliforniaMap: drawing.mount }));
vi.mock('../assets/california-sandbox/sandbox.glb?inline', () => ({ default: 'data:model/gltf-binary;base64,AA==' }));

const apps: App[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  drawing.mount.mockImplementation(() => drawing);
});
afterEach(() => {
  apps.splice(0).forEach(app => app.unmount());
  document.body.replaceChildren();
});

function mountMap(locationId = 'sfo-airport') {
  const props = reactive({ locationId, places: californiaPlaces, routes: internationalConnections(locationId), busy: false });
  const travel = vi.fn();
  const root = document.createElement('div');
  document.body.append(root);
  const app = createApp({ render: () => h(CaliforniaSandbox, { ...props, onTravel: travel }) });
  apps.push(app);
  app.mount(root);
  return { root, props, travel, app };
}
function selectMarker(id: string) {
  const options = drawing.mount.mock.calls.at(-1)?.[3] as { onSelect: (id: string) => void };
  options.onSelect(id);
}

describe('California uploaded map assets', () => {
  it('preserves the supplied self-contained GLB and valid binary geometry ranges', () => {
    const bytes = readFileSync('assets/california-sandbox/sandbox.glb');
    expect(createHash('sha256').update(bytes).digest('hex')).toBe('24eb0ab6cb69735614de7db4d3166e12320be43950fa8d013583afe00b66e5eb');
    expect(bytes.toString('ascii', 0, 4)).toBe('glTF');
    expect(bytes.readUInt32LE(4)).toBe(2);
    expect(bytes.readUInt32LE(8)).toBe(bytes.length);
    expect(bytes.readUInt32LE(16)).toBe(0x4e4f534a);
    const jsonSize = bytes.readUInt32LE(12);
    const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + jsonSize));
    expect(gltf.asset.version).toBe('2.0');
    expect(gltf.meshes.length).toBeGreaterThan(0);
    expect(gltf.buffers).toHaveLength(1);
    expect(gltf.buffers[0].uri).toBeUndefined();
    expect(bytes.readUInt32LE(24 + jsonSize)).toBe(0x004e4942);
    for (const view of gltf.bufferViews) {
      expect(view.buffer).toBe(0);
      expect(view.byteOffset ?? 0).toBeGreaterThanOrEqual(0);
      expect((view.byteOffset ?? 0) + view.byteLength).toBeLessThanOrEqual(gltf.buffers[0].byteLength);
    }
    expect(gltf.buffers[0].byteLength).toBeLessThanOrEqual(bytes.readUInt32LE(20 + jsonSize));
  });

  it('uses known runtime destinations and routes without copying demo economy or model base64', () => {
    const ids = new Set(californiaPlaces.map(place => place.id));
    expect(sandbox.landmarks).toHaveLength(13);
    for (const sight of sandbox.sights) expect(sight.desc).not.toMatch(/单独建模|比例夸张|沙盘以|共用.*近景/);
    for (const place of sandbox.landmarks) {
      expect(ids.has(place.id)).toBe(true);
      for (const number of [place.x, place.y, place.z]) expect(Number.isFinite(number)).toBe(true);
    }
    expect(new Set(sandbox.landmarks.map(place => place.id)).size).toBe(sandbox.landmarks.length);
    for (const route of sandbox.routes) {
      expect(internationalLeg(route.from, route.to)).not.toBeNull();
      expect(route.points.length).toBeGreaterThan(1);
      for (const point of route.points) for (const number of [point.x, point.y, point.z]) expect(Number.isFinite(number)).toBe(true);
    }
    for (const field of ['glb', 'venues', 'rarity', 'cooldown', 'resale', 'gifts', 'flight']) expect(sandbox).not.toHaveProperty(field);
  });
});

describe('California map runtime integration', () => {
  it('previews a destination and emits the existing direct travel action without moving locally', async () => {
    const { root, props, travel } = mountMap();
    selectMarker('california-openai');
    await nextTick();
    expect(root.querySelector('.ca-place-panel h3')?.textContent).toContain('OpenAI 办公地点');
    expect(travel).not.toHaveBeenCalled();
    expect(props.locationId).toBe('sfo-airport');
    const go = root.querySelector<HTMLButtonElement>('[data-ca-travel]');
    expect(go).not.toBeNull();
    expect(go?.textContent).toContain('65');
    go!.click();
    expect(travel).toHaveBeenCalledExactlyOnceWith('california-openai');
    expect(props.locationId).toBe('sfo-airport');
  });

  it('blocks current-place, unavailable-route and busy travel', async () => {
    const { root, props, travel } = mountMap();
    expect(root.querySelector('[data-ca-travel]')).toBeNull();
    selectMarker('california-yosemite');
    await nextTick();
    expect(root.querySelector('[data-ca-travel]')).toBeNull();
    expect(travel).not.toHaveBeenCalled();
    selectMarker('california-openai');
    props.busy = true;
    await nextTick();
    const go = root.querySelector<HTMLButtonElement>('[data-ca-travel]');
    expect(go?.disabled).toBe(true);
    go!.click();
    expect(travel).not.toHaveBeenCalled();
  });

  it('follows authoritative arrival and keeps destination-list selection as a preview', async () => {
    const { root, props, travel } = mountMap();
    const select = root.querySelector<HTMLButtonElement>('[data-ca-place="california-openai"]');
    expect(select).not.toBeNull();
    select!.click();
    await nextTick();
    expect(root.querySelector('.ca-place-panel h3')?.textContent).toContain('OpenAI 办公地点');
    props.locationId = 'california-sacramento';
    props.routes = internationalConnections(props.locationId);
    await nextTick();
    expect(root.querySelector('.ca-place-panel h3')?.textContent).toContain('萨克拉门托');
    expect(root.querySelector('[data-ca-travel]')).toBeNull();
    expect(drawing.update).toHaveBeenCalledWith(expect.objectContaining({ locationId: 'california-sacramento', selectedId: 'california-sacramento' }));
    expect(travel).not.toHaveBeenCalled();
  });

  it('keeps sightseeing separate from travel and returns to normal place selection', async () => {
    const { root, travel } = mountMap();
    selectMarker('california-openai');
    await nextTick();
    expect(root.querySelector('[data-ca-travel]')).not.toBeNull();
    const options = drawing.mount.mock.calls.at(-1)?.[3] as { onSightSelect: (id: string | null) => void };
    options.onSightSelect(sandbox.sights[0].id);
    await nextTick();
    expect(root.querySelector('.ca-place-panel h3')?.textContent).toBe(sandbox.sights[0].name);
    expect(root.querySelector('[data-ca-travel]')).toBeNull();
    selectMarker('california-openai');
    await nextTick();
    expect(root.querySelector('[data-ca-travel]')).not.toBeNull();
    expect(travel).not.toHaveBeenCalled();
  });

  it('releases its renderer on close and keeps demo instructions out of the player panel', () => {
    const { root, app } = mountMap();
    expect(root.textContent).not.toMatch(/离线演示|工程|平行存档|不调用模型|world_actions|MVU/);
    app.unmount();
    apps.splice(apps.indexOf(app), 1);
    expect(drawing.destroy).toHaveBeenCalledOnce();
  });
});
