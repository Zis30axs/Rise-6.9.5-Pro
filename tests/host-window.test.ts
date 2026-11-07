import { describe, expect, it } from 'vitest';
import { resolveShellHost } from '../src/frontend/host-window';

function fakeOwner(demo: boolean, parent: Window): Window {
  return {
    document: { documentElement: { hasAttribute: (name: string) => demo && name === 'data-unread-city-demo' } },
    parent,
  } as unknown as Window;
}

describe('browser preview host selection', () => {
  const crossOriginParent = {
    get document(): Document { throw new Error('SecurityError: cross-origin frame'); },
  } as Window;

  it('runs the explicit demo in its own document when the parent is cross-origin', () => {
    const owner = fakeOwner(true, crossOriginParent);
    expect(resolveShellHost(owner)).toEqual({ host: owner, demo: true });
  });

  it('does not take over a same-origin parent for the explicit demo', () => {
    const parent = { document: { body: {} } } as Window;
    const owner = fakeOwner(true, parent);
    expect(resolveShellHost(owner)).toEqual({ host: owner, demo: true });
  });

  it('retains the Tavern parent host in a real character script', () => {
    const parent = { document: { body: {} } } as Window;
    const owner = fakeOwner(false, parent);
    expect(resolveShellHost(owner)).toEqual({ host: parent, demo: false });
  });

  it('does not silently turn an inaccessible real Tavern script into a demo', () => {
    const owner = fakeOwner(false, crossOriginParent);
    expect(resolveShellHost(owner)).toBeNull();
  });
});
