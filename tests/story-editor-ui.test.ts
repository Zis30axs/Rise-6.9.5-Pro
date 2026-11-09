import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const load = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

describe('story correction and editor wiring', () => {
  it('keeps the middle-school CRYCHIC breakup and family-company boundary explicit', () => {
    const arcs = JSON.parse(load('src/worldbook/story-arcs-relationships.json')) as { entries: { name: string; content: string }[] };
    const people = JSON.parse(load('src/worldbook/bang-dream-canon.json')) as { entries: { name: string; content: string }[] };
    const crychic = arcs.entries.find(row => row.name.includes('CRYCHIC 的盛夏'))?.content ?? '';
    const sakiko = people.entries.find(row => row.name === '丰川祥子')?.content ?? '';
    expect(crychic).toContain('初中三年级');
    expect(crychic).toContain('丰川清告');
    expect(crychic).toContain('丰川定治');
    expect(crychic).toContain('丰川家族或丰川集团破产');
    expect(crychic).not.toContain('突遭家庭破产');
    expect(sakiko).toContain('初中三年级');
    expect(sakiko).toContain('升入高中后');
    expect(sakiko).toContain('不代表丰川家族或丰川集团整体破产');
  });

  it('offers edits in both the history list and the novel scene, with a confirmation dialog', () => {
    const app = load('src/frontend/App.vue');
    const novel = load('src/frontend/NovelDialogue.vue');
    const css = load('src/frontend/shell.css');
    const lifecycle = load('src/frontend/lifecycle.ts');
    expect(app).toContain('data-story-editor');
    expect(app).toContain('data-story-edit-input');
    expect(app).toContain('beginStoryEdit(entry)');
    expect(app).toContain('@edit="beginStoryEditById"');
    expect(novel).toContain("emit('edit', current.entryId)");
    expect(lifecycle).toContain('editSavedStoryEntry(current, entryId, expectedText, revisedText)');
    expect(lifecycle).toContain('bridge.save(validated)');
    expect(css).toContain('.story-editor-mask');
    expect(css).toContain('@media(max-width:600px)');
  });

  it('keeps engineering implementation notes out of the editor visible text', () => {
    const app = load('src/frontend/App.vue');
    expect(app).not.toContain('不重播已结算');
    expect(app).not.toContain('长期记忆中的旧摘要');
  });
});
