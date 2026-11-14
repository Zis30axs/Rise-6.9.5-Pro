import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const load = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

describe('story correction and editor wiring', () => {
  it('keeps the middle-school CRYCHIC breakup and family-company boundary explicit', () => {
    const arcs = JSON.parse(load('src/worldbook/story-arcs-relationships.json')) as { entries: { name: string; content: string; keys: string[] }[] };
    const people = JSON.parse(load('src/worldbook/bang-dream-canon.json')) as { entries: { name: string; content: string; keys: string[] }[] };
    const core = JSON.parse(load('src/worldbook/core.json')) as { entries: { name: string; content: string }[] };
    const downtown = JSON.parse(load('src/worldbook/sakiko-downtown.json')) as { entries: { name: string; content: string; keys: string[] }[] };
    const bg = JSON.parse(load('src/worldbook/background-characters.json')) as { entries: { name: string; content: string; keys: string[] }[] };
    const crychicEntry = arcs.entries.find(row => row.name.includes('CRYCHIC 的盛夏'));
    const sakikoEntry = people.entries.find(row => row.name === '丰川祥子');
    const soyo = people.entries.find(row => row.name === '长崎素世')?.content ?? '';
    const crychic = crychicEntry?.content ?? '';
    const sakiko = sakikoEntry?.content ?? '';
    const coreContent = core.entries.find(row => row.name.includes('世界基调'))?.content ?? '';
    const mejiroContent = downtown.entries.find(row => row.name.includes('目白台'))?.content ?? '';
    const kiyoaki = bg.entries.find(row => row.name === '丰川清告')?.content ?? '';
    const sadaharu = bg.entries.find(row => row.name === '丰川定治')?.content ?? '';
    expect(crychic).toContain('初中三年级');
    expect(crychic).toContain('丰川清告');
    expect(crychic).toContain('丰川定治');
    expect(crychic).toContain('168亿日元');
    expect(crychic).toContain('丰川家族或丰川集团破产');
    expect(crychic).toContain('严禁写成财阀垮台');
    expect(crychic).not.toContain('突遭家庭破产');
    expect(sakiko).toContain('初中三年级');
    expect(sakiko).toContain('升入高中后');
    expect(sakiko).toContain('168亿日元');
    expect(sakiko).toContain('搬回位于目白台的丰川宅邸');
    expect(sakiko).toContain('清告家');
    expect(sakiko).toContain('不代表丰川家族或丰川集团整体破产');
    expect(sakiko).toContain('严禁将其错写为“丰川集团垮台”或“丰川家破产”');
    expect(sakiko).not.toContain('过去的家庭剧变');
    expect(soyo).not.toContain('家族剧变');
    expect(coreContent).toContain('严禁将父女两人的困顿错写为“丰川集团垮台”或“丰川家破产”');
    expect(mejiroContent).toContain('从未破产垮台');
    expect(kiyoaki).toContain('严禁将父女落魄错写为“丰川集团垮台”或“丰川家破产”');
    expect(sadaharu).toContain('从未破产垮台');
    expect(sakikoEntry?.keys).toEqual(expect.arrayContaining(['丰川集团', '丰川财阀', '丰川家', '丰川本家', '丰川清告', '丰川定治']));
    expect(crychicEntry?.keys).toEqual(expect.arrayContaining(['丰川集团', '丰川财阀', '丰川家', '丰川清告', '丰川定治']));
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
