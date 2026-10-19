import * as THREE from 'three';
import type { ScenePerson } from '../runtime/scene-context';
import { isScenePositionWalkable, sceneEyeHeight, type SceneMovementWorld } from './scene-movement';
import { type CharacterAssetPool, type CharacterInstance } from './scene-character-assets';

interface PersonView { person: ScenePerson; instance?: CharacterInstance; pending: boolean; wanted: boolean; retired: boolean; failed: boolean }
const MAX_VISIBLE_PEOPLE = 10;

/** Nearby NPCs use the supplied models while their saved identities and interaction anchors remain intact. */
export function createSceneCrowd(scene: THREE.Scene, world: SceneMovementWorld, pool: CharacterAssetPool, changed?: () => void) {
  const group = new THREE.Group(); group.name = 'scene-people'; scene.add(group);
  const views = new Map<string, PersonView>();
  let disposed = false;
  function retire(view: PersonView) { view.retired = true; view.wanted = false; view.instance?.dispose(); view.instance = undefined; }
  function ensure(view: PersonView) {
    if (view.instance || view.pending || view.retired || view.failed || !view.wanted) return;
    view.pending = true;
    void pool.acquire(view.person.portraitId).then(instance => {
      if (disposed || view.retired || !view.wanted) { instance.dispose(); return; }
      view.instance = instance; group.add(instance.group);
      instance.group.userData.scenePersonId = view.person.id;
      instance.group.position.set(view.person.x, sceneEyeHeight(view.person.x, view.person.z, world) - 1.7, view.person.z);
      // Natural exported standing pose: no invented walk clips and no rigid sliding NPCs.
      instance.group.rotation.y = view.person.x < 0 ? Math.PI / 2 : -Math.PI / 2;
      changed?.();
    }).catch(() => { view.failed = true; /* Retry on scene remount; keep the interaction available. */ })
      .finally(() => { view.pending = false; });
  }
  return {
    pickables: [group] as THREE.Object3D[],
    setPeople(people: ScenePerson[]) {
      if (disposed) return;
      const accepted = people.slice(0, 32).filter(person => isScenePositionWalkable(person.x, person.z, world));
      const ids = new Set(accepted.map(person => person.id));
      for (const [id, view] of views) if (!ids.has(id)) { retire(view); views.delete(id); }
      for (const person of accepted) {
        const existing = views.get(person.id);
        if (existing && existing.person.portraitId === person.portraitId) { existing.person = person; existing.instance?.group.position.set(person.x, sceneEyeHeight(person.x, person.z, world) - 1.7, person.z); }
        else {
          if (existing) retire(existing);
          views.set(person.id, { person, pending: false, wanted: false, retired: false, failed: false });
        }
      }
    },
    update(_now: number, _camera: THREE.PerspectiveCamera, eye: THREE.Vector3, _allowAnimation: boolean): boolean {
      if (disposed) return false;
      const nearest = [...views.values()].filter(view => Math.hypot(view.person.x - eye.x, view.person.z - eye.z) <= 42)
        .sort((a, b) => Math.hypot(a.person.x - eye.x, a.person.z - eye.z) - Math.hypot(b.person.x - eye.x, b.person.z - eye.z)).slice(0, MAX_VISIBLE_PEOPLE);
      const active = new Set(nearest);
      for (const view of views.values()) {
        view.wanted = active.has(view);
        if (!view.wanted && view.instance) { view.instance.dispose(); view.instance = undefined; }
        if (view.wanted) ensure(view);
      }
      return false;
    },
    personAtHit(hit: THREE.Intersection): string | undefined {
      let object: THREE.Object3D | null = hit.object;
      while (object && object !== group) {
        const id: unknown = object.userData.scenePersonId;
        if (typeof id === 'string' && views.has(id)) return id;
        object = object.parent;
      }
      return undefined;
    },
    dispose() { if (disposed) return; disposed = true; views.forEach(retire); views.clear(); group.removeFromParent(); },
  };
}
