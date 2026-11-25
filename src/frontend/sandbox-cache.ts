import type { InjectionKey } from 'vue';
import type { SandboxRuntime } from './CitySandboxScene.vue';
/** One idle renderer per Shell, exclusively transferred between map views.
 * It owns its decoded tree and GPU resources; active views never share them.
 * No animation runs while parked. Leaving the Shell or hiding the page frees it. */
export function createSandboxCache() {
  let idle: SandboxRuntime | undefined, closed = false;
  const take = () => {
    const runtime = idle; idle = undefined;
    if (runtime) {
      runtime.canvas.removeEventListener('webglcontextlost', lost, true);
      runtime.canvas.ownerDocument.removeEventListener('visibilitychange', visibility);
      runtime.canvas.ownerDocument.defaultView?.removeEventListener('pagehide', clear);
    }
    return runtime;
  };
  function clear() { const runtime = take(); if (runtime) runtime.dispose(); }
  function visibility() { if (idle?.canvas.ownerDocument.hidden) clear(); }
  function lost(event: Event) { event.preventDefault(); event.stopImmediatePropagation(); clear(); }
  return {
    take(previewOnly: boolean) {
      const runtime = take();
      if (runtime && (closed || runtime.previewOnly !== previewOnly || runtime.canvas.ownerDocument.hidden)) {
        runtime.dispose(); return undefined;
      }
      return runtime;
    },
    park(runtime: SandboxRuntime) {
      clear();
      if (closed || runtime.canvas.ownerDocument.hidden) { runtime.dispose(); return; }
      idle = runtime; runtime.canvas.remove();
      runtime.canvas.addEventListener('webglcontextlost', lost, true);
      runtime.canvas.ownerDocument.addEventListener('visibilitychange', visibility);
      runtime.canvas.ownerDocument.defaultView?.addEventListener('pagehide', clear);
    },
    clear,
    close() { closed = true; clear(); },
  };
}
export const sandboxCacheKey: InjectionKey<ReturnType<typeof createSandboxCache>> = Symbol('sandbox-cache');
