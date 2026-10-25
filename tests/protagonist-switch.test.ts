import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createProtagonistSwitchController, switchEndpoint } from '../src/frontend/protagonist-switch';
import { createSwitchCamera } from '../src/frontend/switch-camera';
import { createInitialState, reduceState } from '../src/runtime/model';
import { activeProtagonist, enableProtagonists, personState } from '../src/runtime/protagonist-world';
import { getCampusInterior } from '../src/runtime/campus-interiors';
import type { ProtagonistId } from '../src/runtime/dual-protagonists';

function fixture() {
  let state = enableProtagonists(createInitialState()), current = true, blocked = false;
  const pending = vi.fn(), cancelWork = vi.fn(), save = vi.fn();
  const controller = createProtagonistSwitchController({ state: () => state, current: () => current, blocked: () => blocked,
    pending, cancelWork, commit(target) { save(); state = reduceState(state, { type: 'switch_protagonist', target }); return true; } });
  return { controller, pending, cancelWork, save, state: () => state, retire: () => { current = false; }, block: () => { blocked = true; } };
}

describe('protagonist switch transaction', () => {
  it('previews the destination without publishing it, then commits once', () => {
    const f = fixture(), before = structuredClone(f.state());
    const lease = f.controller.begin('emma')!;
    expect(lease.source.protagonist).toBe('soyo');
    expect(lease.target.mapAnchor).toEqual({ x: -190, z: 130 });
    expect(f.state()).toEqual(before);
    expect(f.cancelWork).toHaveBeenCalledOnce();
    expect(lease.commit()).toBe(true);
    expect(lease.commit()).toBe(false);
    expect(f.save).toHaveBeenCalledOnce();
    expect(activeProtagonist(f.state())).toBe('emma');
    expect(f.state().clock).toEqual(before.clock);
    expect(personState(f.state(), 'soyo').player).toEqual(before.player);
    lease.release(); lease.release();
    expect(f.pending.mock.calls).toEqual([[true], [false]]);
  });

  it('blocks overlapping switches and releases without saving on cancellation', () => {
    const f = fixture(), lease = f.controller.begin('sakiko')!;
    expect(f.controller.begin('emma')).toBeNull();
    f.controller.release();
    expect(lease.commit()).toBe(false);
    expect(f.save).not.toHaveBeenCalled();
    expect(f.controller.begin('emma')).not.toBeNull();
  });

  it('rejects retired sessions and interaction choices', () => {
    const f = fixture(), lease = f.controller.begin('emma')!;
    f.retire(); expect(lease.commit()).toBe(false); expect(f.save).not.toHaveBeenCalled();
    const blocked = fixture(); blocked.block(); expect(blocked.controller.begin('emma')).toBeNull();
  });

  it('ignores the current identity and unrecognized IDs', () => {
    const f = fixture();
    expect(f.controller.begin('soyo')).toBeNull();
    expect(f.controller.begin('unrecognized' as ProtagonistId)).toBeNull();
    expect(f.pending).not.toHaveBeenCalled(); expect(f.cancelWork).not.toHaveBeenCalled();
  });

  it('uses a house entrance instead of room-local coordinates', () => {
    const state = enableProtagonists(createInitialState()), room = getCampusInterior('toyokawa-house')!;
    const sakiko = personState(state, 'sakiko');
    sakiko.locationId = room.id;
    sakiko.interior = { roomId: room.id, ...room.spawn, activityId: null, lastRest: null, lastStudy: null };
    const endpoint = switchEndpoint(state, 'sakiko');
    expect(endpoint.mapAnchor).toEqual({ x: room.entrance.x, z: room.entrance.z });
    expect(endpoint.interior?.x).toBe(room.spawn.x);
    endpoint.interior!.x = 999;
    expect(sakiko.interior.x).toBe(room.spawn.x);
  });

  it('leaves the current state intact when saving fails', () => {
    let state = enableProtagonists(createInitialState());
    const original = structuredClone(state), save = vi.fn(() => false);
    const controller = createProtagonistSwitchController({ state: () => state, current: () => true, blocked: () => false,
      pending() {}, cancelWork() {}, commit: save });
    const lease = controller.begin('sakiko')!;
    expect(lease.commit()).toBe(false); expect(lease.commit()).toBe(false);
    expect(save).toHaveBeenCalledOnce(); expect(state).toEqual(original); lease.release();
  });
});

describe('display camera', () => {
  it('rises continuously and restores every camera property without moving the player', () => {
    const eye = new THREE.Vector3(4, 1.7, 29), originalEye = eye.clone();
    const camera = new THREE.PerspectiveCamera(68, 1.6, .1, 360);
    camera.position.set(4, 3, 34); camera.lookAt(eye);
    const originalPosition = camera.position.clone(), originalRotation = camera.quaternion.clone();
    const display = createSwitchCamera(camera, eye);
    display.apply(.5); expect(camera.position.y).toBeGreaterThan(3); expect(camera.position.y).toBeLessThan(145);
    display.apply(1); expect(camera.position.y).toBe(145); expect(camera.far).toBe(800);
    expect(eye).toEqual(originalEye);
    display.restore(); expect(camera.position.toArray()).toEqual(originalPosition.toArray());
    expect(camera.quaternion.toArray()).toEqual(originalRotation.toArray());
    expect(camera.fov).toBe(68); expect(camera.far).toBe(360);
  });
});
