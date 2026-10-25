import { PROTAGONISTS, type ProtagonistId } from '../runtime/dual-protagonists';
import { activeProtagonist, enableProtagonists, personState } from '../runtime/protagonist-world';
import { mapLocationPoint } from './campus-map-layout';
import type { InteriorPresence, ScenePresence, WorldState } from './types';

export const PROTAGONIST_SWITCH_TIMING = { ascent: 1200, traverse: 1600, descent: 1200, readyTimeout: 1500, fade: 150 } as const;
export type ProtagonistSwitchPhase = 'ascent' | 'traverse' | 'waiting' | 'descent' | 'fade';
export interface SwitchEndpoint {
  protagonist: ProtagonistId;
  locationId: string;
  scene: ScenePresence | null;
  interior: InteriorPresence | null;
  mapAnchor: { x: number; z: number };
}
export interface ProtagonistSwitchLease {
  readonly source: SwitchEndpoint;
  readonly target: SwitchEndpoint;
  commit(): boolean;
  release(): void;
}

export function switchEndpoint(state: WorldState, protagonist: ProtagonistId): SwitchEndpoint {
  const view = personState(state, protagonist);
  // A retained outdoor pose can be far from the entrance. Use the entrance
  // for an indoor camera bridge, never the room's local x/z coordinates.
  const anchor = view.interior ? mapLocationPoint(view.interior.roomId) : view.scene ?? mapLocationPoint(view.locationId);
  return { protagonist, locationId: view.locationId, scene: view.scene ? { ...view.scene } : null,
    interior: view.interior ? structuredClone(view.interior) : null, mapAnchor: { x: anchor?.x ?? 0, z: anchor?.z ?? 29 } };
}

/** One temporary switch can own the world input lock. It never owns a save. */
export function createProtagonistSwitchController(options: {
  state(): WorldState;
  current(): boolean;
  blocked(): boolean;
  cancelWork(): void;
  pending(value: boolean): void;
  commit(target: ProtagonistId): boolean;
}) {
  let active: ProtagonistSwitchLease | undefined;
  return {
    begin(target: ProtagonistId): ProtagonistSwitchLease | null {
      if (active || !options.current() || options.blocked() || !PROTAGONISTS.includes(target)
        || activeProtagonist(options.state()) === target) return null;
      const preview = enableProtagonists(options.state());
      const source = switchEndpoint(preview, activeProtagonist(preview)), destination = switchEndpoint(preview, target);
      options.cancelWork();
      let attempted = false, released = false;
      const lease: ProtagonistSwitchLease = {
        source, target: destination,
        commit() {
          if (attempted || released || active !== lease || !options.current()
            || activeProtagonist(options.state()) !== source.protagonist) return false;
          attempted = true;
          return options.commit(target);
        },
        release() {
          if (released) return;
          released = true;
          if (active === lease) { active = undefined; options.pending(false); }
        },
      };
      active = lease; options.pending(true);
      return lease;
    },
    release() { active?.release(); },
  };
}

export function switchEase(value: number) {
  const t = Math.min(1, Math.max(0, value));
  return t * t * (3 - 2 * t);
}
