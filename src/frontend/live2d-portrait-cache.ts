import type { InjectionKey } from 'vue';
import type { SoyoPortrait } from './live2d-soyo-runtime';

export interface Live2dCachedInstance {
  portrait: SoyoPortrait;
  canvas: HTMLCanvasElement;
  emotion?: string;
}

export interface Live2dActiveOwner {
  isActive: () => boolean;
  yieldPortrait: () => Live2dCachedInstance | null;
}

export interface Live2dParkPayload extends Live2dCachedInstance {
  key: string;
}

interface ParkedEntry {
  key: string;
  portrait: SoyoPortrait;
  canvas: HTMLCanvasElement;
  emotion?: string;
  timer: ReturnType<typeof setTimeout>;
  onContextLost: (event: Event) => void;
}

export interface Live2dPortraitCache {
  readonly disposed: boolean;
  acquire: (key: string) => Live2dCachedInstance | null;
  park: (payload: Live2dParkPayload) => boolean;
  invalidate: (key: string) => void;
  registerOwner: (key: string, owner: Live2dActiveOwner) => () => void;
  clear: () => void;
  dispose: () => void;
}

export interface Live2dPortraitCacheOptions {
  maxParked?: number;
  standbyTtlMs?: number;
}

export const live2dPortraitCacheKey: InjectionKey<Live2dPortraitCache> = Symbol('live2d-portrait-cache');

const DEFAULT_MAX_PARKED = 3;
const DEFAULT_STANDBY_TTL_MS = 60_000;

function destroyEntry(entry: ParkedEntry) {
  clearTimeout(entry.timer);
  entry.canvas.removeEventListener('webglcontextlost', entry.onContextLost, true);
  entry.canvas.remove();
  entry.portrait.destroy();
}

/**
 * Shell-scoped standby pool for decoded Live2D instances so dual-character
 * turns and single/paired stage handoffs reuse GPU resources without reloading.
 */
export function createLive2dPortraitCache(options: Live2dPortraitCacheOptions = {}): Live2dPortraitCache {
  const maxParked = Math.max(0, options.maxParked ?? DEFAULT_MAX_PARKED);
  const standbyTtlMs = Math.max(1, options.standbyTtlMs ?? DEFAULT_STANDBY_TTL_MS);
  const parked = new Map<string, ParkedEntry>();
  const owners = new Map<string, Set<Live2dActiveOwner>>();
  let isDisposed = false;

  function removeParked(entry: ParkedEntry, destroy: boolean) {
    if (parked.get(entry.key) === entry) parked.delete(entry.key);
    clearTimeout(entry.timer);
    entry.canvas.removeEventListener('webglcontextlost', entry.onContextLost, true);
    if (destroy) {
      entry.canvas.remove();
      entry.portrait.destroy();
    }
  }

  function evictOldestIfFull() {
    while (parked.size >= maxParked) {
      const oldest = parked.values().next().value;
      if (!oldest) break;
      removeParked(oldest, true);
    }
  }

  function acquire(key: string): Live2dCachedInstance | null {
    if (isDisposed || !key) return null;
    const hit = parked.get(key);
    if (hit) {
      removeParked(hit, false);
      return { portrait: hit.portrait, canvas: hit.canvas, ...(hit.emotion !== undefined ? { emotion: hit.emotion } : {}) };
    }
    const keyOwners = owners.get(key);
    if (!keyOwners) return null;
    // Snapshot so yielding mutates owner sets safely without skipping siblings.
    for (const owner of [...keyOwners]) {
      if (owner.isActive()) continue;
      const handed = owner.yieldPortrait();
      if (handed) return handed;
    }
    return null;
  }

  function park(payload: Live2dParkPayload): boolean {
    if (isDisposed || !payload.key || maxParked === 0) return false;
    const existing = parked.get(payload.key);
    if (existing) removeParked(existing, true);
    evictOldestIfFull();

    payload.portrait.setActive(false);
    payload.canvas.style.display = 'none';
    payload.canvas.remove();

    const entry: ParkedEntry = {
      key: payload.key,
      portrait: payload.portrait,
      canvas: payload.canvas,
      ...(payload.emotion !== undefined ? { emotion: payload.emotion } : {}),
      timer: undefined as unknown as ReturnType<typeof setTimeout>,
      onContextLost: (event: Event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        removeParked(entry, true);
      },
    };
    entry.timer = setTimeout(() => removeParked(entry, true), standbyTtlMs);
    entry.canvas.addEventListener('webglcontextlost', entry.onContextLost, true);
    parked.set(payload.key, entry);
    return true;
  }

  function invalidate(key: string) {
    const entry = parked.get(key);
    if (entry) removeParked(entry, true);
  }

  function registerOwner(key: string, owner: Live2dActiveOwner): () => void {
    if (isDisposed || !key) return () => undefined;
    let bucket = owners.get(key);
    if (!bucket) {
      bucket = new Set();
      owners.set(key, bucket);
    }
    bucket.add(owner);
    return () => {
      const current = owners.get(key);
      if (!current) return;
      current.delete(owner);
      if (current.size === 0) owners.delete(key);
    };
  }

  function clear() {
    for (const entry of [...parked.values()]) destroyEntry(entry);
    parked.clear();
  }

  function dispose() {
    if (isDisposed) return;
    isDisposed = true;
    clear();
    owners.clear();
  }

  return {
    get disposed() { return isDisposed; },
    acquire,
    park,
    invalidate,
    registerOwner,
    clear,
    dispose,
  };
}
