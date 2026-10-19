import { afterEach, describe, expect, it } from 'vitest';
import { createApp, nextTick, type App } from 'vue';
import NovelDialogue from '../src/frontend/NovelDialogue.vue';
import StoryEntryContent from '../src/frontend/StoryEntryContent.vue';

let app: App | undefined;
afterEach(() => { app?.unmount(); app = undefined; document.body.innerHTML = ''; });
function mount(component: typeof NovelDialogue | typeof StoryEntryContent, props: Record<string, unknown>) {
  const host = document.createElement('div'); document.body.append(host);
  app = createApp(component, props); app.mount(host); return host;
}

describe('event-first reading preserves conversations', () => {
  it('keeps narration visible and folds complete dialogue in its original position', async () => {
    const text = '走廊里忽然停了电。\n|陌生同学|惊讶|灯怎么灭了？|\n|素世|思考|去看看配电室吧。|\n门外传来脚步声。';
    const host = mount(StoryEntryContent, { text, role: 'assistant' });
    expect([...host.querySelectorAll('[data-story-event]')].map(row => row.textContent)).toEqual(['走廊里忽然停了电。', '门外传来脚步声。']);
    const fold = host.querySelector<HTMLDetailsElement>('[data-story-dialogue]')!;
    expect(fold.open).toBe(false); expect(fold.querySelectorAll('p')).toHaveLength(2);
    expect(fold.textContent).toContain('灯怎么灭了？'); expect(fold.textContent).toContain('去看看配电室吧。');
    fold.open = true; fold.dispatchEvent(new Event('toggle')); await nextTick();
    expect(fold.open).toBe(true); expect(host.children[1]).toBe(fold);
    expect(text).toContain('|陌生同学|惊讶|灯怎么灭了？|');
  });

  it('displays legacy prose and markup as inert text while keeping player dialogue expandable', () => {
    const host = mount(StoryEntryContent, { text: '<img src=x onerror=alert(1)>\n旧版正文中的普通句子。', role: 'assistant' });
    expect(host.querySelector('img')).toBeNull(); expect(host.querySelector('details')).toBeNull();
    expect(host.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('defaults the original novel box to events, and restores all sequential dialogue on request', async () => {
    const entries = [{ id: 'u', role: 'user' as const, text: '我问她是否需要帮忙。' }, { id: 'a', role: 'assistant' as const,
      text: '她抱着的书散落了。\n|陌生同学|害羞|可以帮我捡一下吗？|' }];
    const before = JSON.stringify(entries);
    const host = mount(NovelDialogue, { entries, busy: false });
    expect(host.querySelector('[data-event-reading]')?.textContent).toContain('她抱着的书散落了。');
    expect(host.querySelector('.novel-speech')).toBeNull();
    const toggle = host.querySelector<HTMLButtonElement>('[data-toggle-dialogue]')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('false'); toggle.click(); await nextTick();
    host.querySelector<HTMLButtonElement>('[aria-label="下一句剧情"]')!.click(); await nextTick();
    expect(host.querySelector('.novel-speech')?.textContent).toBe('可以帮我捡一下吗？');
    toggle.click(); await nextTick(); expect(host.querySelector('.novel-speech')).toBeNull();
    expect(JSON.stringify(entries)).toBe(before);
  });
});
