/** Pick the preview's own document before inspecting any parent frame.
 * Real Tavern sessions still require a same-origin parent and Helper bridge.
 */
export function resolveShellHost(owner: Window): { host: Window; demo: boolean } | null {
  if (owner.document.documentElement.hasAttribute('data-unread-city-demo')) {
    return { host: owner, demo: true };
  }
  try {
    const host = owner.parent;
    void host.document.body;
    return { host, demo: false };
  } catch {
    return null;
  }
}
