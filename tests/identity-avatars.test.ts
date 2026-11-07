import { afterEach, describe, expect, it } from 'vitest';
import { createApp, h, nextTick, reactive, type App } from 'vue';
import IdentityCardPanel from '../src/frontend/IdentityCardPanel.vue';
import MapCharacterAvatar from '../src/frontend/MapCharacterAvatar.vue';
import { resolveMapCharacterAvatar } from '../src/frontend/map-character-avatar';
import { resolveUikaExpressionPortrait } from '../src/frontend/uika-art';
import { resolveUmiriExpressionPortrait } from '../src/frontend/umiri-art';
import { resolveNyamuExpressionPortrait } from '../src/frontend/nyamu-art';
import { createInitialState } from '../src/runtime/model';
import type { ShellActions, ShellModel } from '../src/frontend/types';

const people = [
  { id: 'bang-uika', name: '三角初华', portrait: resolveUikaExpressionPortrait },
  { id: 'bang-umiri', name: '八幡海铃', portrait: resolveUmiriExpressionPortrait },
  { id: 'bang-nyamu', name: '祐天寺若麦', portrait: resolveNyamuExpressionPortrait },
];
const apps: App[] = [];
afterEach(() => { apps.splice(0).forEach(app => app.unmount()); document.body.replaceChildren(); });
function mount(app: App): HTMLElement {
  const root = document.createElement('div');
  document.body.append(root);
  apps.push(app);
  app.mount(root);
  return root;
}

describe('identity and map avatar routing', () => {
  it.each(people)('$id keeps its own crop and fallback after contact renaming', ({ id, name, portrait }) => {
    const expected = resolveMapCharacterAvatar({ personId: id, name });
    expect(expected?.kind).toBe('headshot');
    for (const renamed of ['我的朋友', '长崎素世', '若叶睦']) {
      expect(resolveMapCharacterAvatar({ personId: id, name: renamed })).toEqual(expected);
      const fallback = resolveMapCharacterAvatar({ personId: id, name: renamed }, true);
      expect(fallback?.kind).toBe('sprite');
      expect(fallback?.src === portrait(id, 'neutral')?.src).toBe(true);
    }
    expect(resolveMapCharacterAvatar({ name })).toEqual(expected);
  });

  it.each(people)('$id falls back to its own art then initials, and recovers on identity change', async ({ id, name, portrait }) => {
    const props = reactive({ personId: id, name });
    const root = mount(createApp({ render: () => h(MapCharacterAvatar, props) }));
    expect(root.querySelector('[data-map-avatar-kind="headshot"]')).not.toBeNull();
    root.querySelector('img')!.dispatchEvent(new Event('error'));
    await nextTick();
    expect(root.querySelector('[data-map-avatar-kind="sprite"]')).not.toBeNull();
    expect(root.querySelector('img')!.getAttribute('src') === portrait(id, 'neutral')!.src).toBe(true);
    root.querySelector('img')!.dispatchEvent(new Event('error'));
    await nextTick();
    expect(root.querySelector('img')).toBeNull();
    expect(root.textContent).toContain(name.slice(-2));
    props.personId = id === 'bang-uika' ? 'bang-umiri' : 'bang-uika';
    await nextTick();
    expect(root.querySelector('[data-map-avatar-kind="headshot"]')).not.toBeNull();
  });

  it('uses initials for an unknown person instead of another face', () => {
    const root = mount(createApp(MapCharacterAvatar, { personId: 'custom-person', name: '林知夏' }));
    expect(root.querySelector('img')).toBeNull();
    expect(root.textContent).toBe('知夏');
  });

  it.each(['sakiko', 'emma', 'renako'] as const)('preserves %s identity-photo sprite fallback', async id => {
    const root = mount(createApp(IdentityCardPanel, {
      model: { state: createInitialState() } as ShellModel,
      actions: { dispatch() {} } as unknown as ShellActions,
      initialPersonId: id,
    }));
    const photo = root.querySelector('.jp-photo-frame .idcard-avatar')!;
    photo.querySelector('img')!.dispatchEvent(new Event('error'));
    await nextTick();
    expect(photo.getAttribute('data-map-avatar-kind')).toBe('sprite');
    const fallback = resolveMapCharacterAvatar({ personId: id, protagonistId: id, name: id }, true);
    expect(photo.querySelector('img')!.getAttribute('src') === fallback?.src).toBe(true);
  });

  it('renders three distinct correct portraits in the real relationship mesh', async () => {
    const root = mount(createApp(IdentityCardPanel, {
      model: { state: createInitialState() } as ShellModel,
      actions: { dispatch() {} } as unknown as ShellActions,
    }));
    const sources = people.map(({ id, name }) => {
      const img = root.querySelector(`[data-mesh-node="${id}"] img`)!;
      expect(img.namespaceURI).toBe('http://www.w3.org/1999/xhtml');
      expect(img.getAttribute('src')).toBe(resolveMapCharacterAvatar({ personId: id, name })!.src);
      return img.getAttribute('src');
    });
    expect(new Set(sources).size).toBe(3);
    const uika = root.querySelector('[data-mesh-node="bang-uika"]')!;
    uika.querySelector('img')!.dispatchEvent(new Event('error'));
    await nextTick();
    expect(uika.querySelector('[data-map-avatar-kind="sprite"]')).not.toBeNull();
    uika.querySelector('img')!.dispatchEvent(new Event('error'));
    await nextTick();
    expect(uika.querySelector('img')).toBeNull();
    expect(uika.querySelector('.cms-avatar-initials')?.textContent).toBe('初华');
    expect(root.querySelector('[data-mesh-node="bang-umiri"] [data-map-avatar-kind="headshot"]')).not.toBeNull();
  });
});
