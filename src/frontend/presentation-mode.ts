export type PresentationMode = 'scene' | 'novel';

const storageKey = 'unread-city.presentation-mode.v1';

/** A display preference, independent of the character's world save. */
export function readPresentationMode(): PresentationMode {
  try { return globalThis.localStorage?.getItem(storageKey) === 'novel' ? 'novel' : 'scene'; }
  catch { return 'scene'; }
}

export function savePresentationMode(mode: PresentationMode): void {
  try { globalThis.localStorage?.setItem(storageKey, mode); }
  catch { /* Storage may be unavailable; the current session still works. */ }
}
