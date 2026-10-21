import { expect, test, type Frame } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import type { WorldState } from '../../src/frontend/types';
import type { ProtagonistId } from '../../src/runtime/dual-protagonists';
import { enableProtagonists, gameMinute, otherProtagonist, personState } from '../../src/runtime/protagonist-world';
import { createSelectedInitialState } from './academics-fixture';
import { withArtPhone } from './downtown-art-fixture';

const viewports = [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
  { width: 320, height: 568 },
];
const privateMarker = (owner: ProtagonistId) => `${owner.toUpperCase()}_PRIVATE_ONLY`;
const recapMarker = (owner: ProtagonistId) => `${owner.toUpperCase()}_RECAP_ONLY`;

function initialWorld(): WorldState {
  const state = enableProtagonists(createSelectedInitialState());
  // These are authored local test saves; real players still choose each major.
  state.protagonists!.inactive.academics = structuredClone(state.academics);
  for (const owner of ['soyo', 'sakiko'] as const) {
    personState(state, owner).journal.push({ id: `private-${owner}`, at: '第 1 天 17:20', text: `${privateMarker(owner)}：尚未告诉别人的私人安排。` });
    // A pre-existing long record exercises wrapping. The new records below must
    // come from the production foreground turn and background reducer.
    state.protagonists!.backgroundLife!.people[owner].events.push({
      id: `bg:${owner}:fixture`, at: gameMinute(state), kind: 'routine',
      text: `${recapMarker(owner)}：${'已经独自整理过自己的日常安排，接下来仍由自己决定。'.repeat(12)}`,
    });
  }
  return state;
}

async function readWorld(helper: Frame): Promise<WorldState> {
  return helper.evaluate(() => (window as unknown as { fixtureRead(): { unread_city: WorldState } }).fixtureRead().unread_city);
}

async function queueReply(helper: Frame, text: string, minutes = 0) {
  const reply = `<story>${text}</story><phone_messages>[]</phone_messages><world_actions>${JSON.stringify(minutes ? [{ type: 'rest', kind: 'wait', minutes }] : [])}</world_actions>`;
  await helper.evaluate(reply => (window as unknown as { fixtureReply(reply: string): void }).fixtureReply(reply), reply);
}

for (const viewport of viewports) {
  test(`both personal narratives resume and scroll at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    test.setTimeout(150_000);
    await page.setViewportSize(viewport);
    const { helper, errors, modelRequests, extensionResources } = await withArtPhone(page, initialWorld());
    await helper.evaluate(() => {
      const host = window as unknown as {
        generate(config: { user_input: string }): Promise<string>;
        fixturePrompts?: () => string[];
      };
      const generate = host.generate;
      const prompts: string[] = [];
      host.generate = async config => { prompts.push(config.user_input); return generate(config); };
      host.fixturePrompts = () => [...prompts];
    });
    const root = page.locator('[data-unread-city-root]');
    const input = page.getByRole('textbox', { name: '接下来，你想做什么？' });
    const continueStory = page.getByRole('button', { name: /^继续故事/ });
    const summaries: Array<Record<string, unknown>> = [];
    const output = `outputs/dual-narrative-qa/${viewport.width}x${viewport.height}`;
    await mkdir('outputs/dual-narrative-qa', { recursive: true });

    for (const owner of ['sakiko', 'soyo'] as const) {
      const before = await readWorld(helper);
      const foreground = otherProtagonist(owner);
      expect(before.protagonists!.accounts.active).toBe(foreground);
      await queueReply(helper, `SAVED_FRONT_${foreground}：你在自己的位置安静等了一小时。`, 60);
      await input.fill('安静等一小时，然后接着自己的经历。');
      await continueStory.click();
      await expect(continueStory).toBeEnabled();
      await expect.poll(async () => gameMinute(await readWorld(helper))).toBe(gameMinute(before) + 60);
      const progressed = await readWorld(helper);
      const produced = progressed.protagonists!.backgroundLife!.people[owner].events.filter(event => !event.id.endsWith(':fixture'));
      expect(produced.length).toBeGreaterThan(0);
      expect(personState(progressed, owner).story).toEqual(personState(before, owner).story);

      await page.locator('[data-protagonist-select]').selectOption(owner);
      await expect.poll(async () => (await readWorld(helper)).protagonists!.accounts.active).toBe(owner);
      const switched = await readWorld(helper);
      expect(switched.clock).toEqual(progressed.clock);
      expect(switched.protagonists!.backgroundLife!.people[owner].events).toEqual(expect.arrayContaining(produced));
      await page.getByRole('button', { name: '状态', exact: true }).click();
      const panel = page.locator('[data-window="status"]');
      const content = panel.locator('.window-content');
      const recap = page.getByTestId('protagonist-recap');
      await expect(recap).toHaveAttribute('data-owner', owner);
      await expect(recap).toContainText(owner === 'soyo' ? '长崎素世' : '丰川祥子');
      await expect(recap).toContainText(recapMarker(owner));
      await expect(recap).not.toContainText(recapMarker(foreground));
      await expect(recap).not.toContainText(privateMarker(foreground));
      await recap.locator('summary').scrollIntoViewIfNeeded();
      await expect(recap.locator('summary')).toBeInViewport();
      await page.screenshot({ path: `${output}-${owner}-recap.png` });

      const panelBox = (await panel.boundingBox())!;
      const dockBox = (await page.locator('.tool-dock').boundingBox())!;
      expect(panelBox.x).toBeGreaterThanOrEqual(0);
      expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(viewport.width + 1);
      if (viewport.width <= 760) expect(panelBox.y + panelBox.height).toBeLessThanOrEqual(dockBox.y - 4);
      else expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(dockBox.x - 4);
      const overflow = await content.evaluate(node => ({ horizontal: node.scrollWidth - node.clientWidth, height: node.scrollHeight, viewport: node.clientHeight }));
      expect(overflow.horizontal).toBeLessThanOrEqual(1);
      const textMetrics = await recap.locator('.wp-journal-entry p').evaluateAll(nodes => nodes.map(node => ({
        width: node.scrollWidth - node.clientWidth,
        fontSize: Number.parseFloat(getComputedStyle(node).fontSize),
      })));
      expect(textMetrics.length).toBeGreaterThan(0);
      expect(textMetrics.every(metric => metric.width <= 1 && metric.fontSize >= 12)).toBe(true);
      const lastRecord = recap.locator('.wp-journal-entry').last();
      await lastRecord.scrollIntoViewIfNeeded();
      await expect(lastRecord).toBeInViewport();
      await page.screenshot({ path: `${output}-${owner}-scrolled.png` });
      await content.evaluate(node => { node.scrollTop = node.scrollHeight; });
      const scroll = await content.evaluate(node => ({ top: node.scrollTop, height: node.scrollHeight, viewport: node.clientHeight }));
      if (scroll.height > scroll.viewport + 2) expect(scroll.top).toBeGreaterThan(0);

      await recap.locator('summary').click();
      await expect(recap).not.toHaveAttribute('open', '');
      await recap.locator('summary').click();
      await expect(recap).toHaveAttribute('open', '');
      expect((await readWorld(helper)).protagonists!.backgroundLife).toEqual(switched.protagonists!.backgroundLife);
      summaries.push({ owner, clock: switched.clock, eventIds: produced.map(event => event.id), panelBox, dockBox, overflow, scroll, textMetrics });
      await page.getByRole('button', { name: '状态', exact: true }).click();
      await expect(panel).toHaveCount(0);
    }

    // Soyo also continues after returning to her newly saved background life.
    await queueReply(helper, 'SOYO_CONTINUED：你接着自己刚才整理的安排继续。');
    await input.fill('接着我的日常继续，不要重演刚才的事。');
    await continueStory.click();
    await expect.poll(async () => (await readWorld(helper)).story.some(entry => entry.text.includes('SOYO_CONTINUED'))).toBe(true);
    const prompts = await helper.evaluate(() => (window as unknown as { fixturePrompts(): string[] }).fixturePrompts());
    expect(prompts).toHaveLength(3);
    for (const owner of ['soyo', 'sakiko'] as const) {
      const ownPrompts = prompts.filter(prompt => JSON.parse(prompt.split('\n')[1]).narrative.owner === owner);
      expect(ownPrompts.length).toBeGreaterThan(0);
      const prompt = ownPrompts.at(-1)!;
      const context = JSON.parse(prompt.split('\n')[1]);
      expect(prompt).toContain(privateMarker(owner));
      expect(prompt).not.toContain(privateMarker(otherProtagonist(owner)));
      expect(prompt).not.toContain(recapMarker(otherProtagonist(owner)));
      expect(context.narrative.recentLife.length).toBeLessThanOrEqual(6);
      expect(context.narrative.recentLife.some((entry: { id: string }) => !entry.id.endsWith(':fixture'))).toBe(true);
    }

    const saved = await readWorld(helper);
    await page.getByRole('button', { name: '切换聊天并恢复原生界面' }).click();
    await expect(root).toHaveCount(0);
    await page.getByRole('button', { name: '重新进入测试角色', exact: true }).click();
    await expect(root).toBeVisible();
    const reopened = await readWorld(helper);
    expect(reopened.clock).toEqual(saved.clock);
    expect(reopened.protagonists!.backgroundLife).toEqual(saved.protagonists!.backgroundLife);
    expect(reopened.protagonists!.accounts).toEqual(saved.protagonists!.accounts);
    expect(reopened.story).toEqual(saved.story);
    expect(modelRequests).toEqual([]);
    expect(extensionResources).toEqual([]);
    expect(errors).toEqual([]);
    await writeFile(`${output}-checks.json`, JSON.stringify({ viewport, summaries, generationCount: prompts.length, modelRequests, extensionResources, errors }, null, 2));
  });
}
