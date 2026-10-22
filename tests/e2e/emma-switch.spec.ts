import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createSelectedInitialState } from './academics-fixture';
import { withArtPhone } from './downtown-art-fixture';
import { enableProtagonists, activeProtagonist } from '../../src/runtime/protagonist-world';
import type { WorldState } from '../../src/frontend/types';

const viewports = [
  { width: 1440, height: 900 }, { width: 1280, height: 800 },
  { width: 390, height: 844 }, { width: 320, height: 568 },
];
const read = (helper: Awaited<ReturnType<typeof withArtPhone>>['helper']) => helper.evaluate(() =>
  (window as unknown as { fixtureRead(): { unread_city: WorldState } }).fixtureRead().unread_city);

function initial(): WorldState {
  const state = enableProtagonists(createSelectedInitialState());
  state.story = [{ id: 'switch-opening', role: 'assistant', text: '三位主角共享同一条时间线。\n|樱羽艾玛|平静|我这边也没问题。|\n|丰川祥子|平静|先处理自己的安排。|\n|长崎素世|平静|今天也按自己的步调来。|' }];
  return state;
}

async function noOverflow(page: import('@playwright/test').Page) {
  const overflow = await page.locator('.uc-shell').evaluate(element => ({
    shell: element.scrollWidth - element.clientWidth,
    document: document.documentElement.scrollWidth - innerWidth,
  }));
  expect(overflow.shell).toBeLessThanOrEqual(1);
  expect(overflow.document).toBeLessThanOrEqual(1);
}

for (const viewport of viewports) {
  test(`${viewport.width}x${viewport.height} switches Soyo, Sakiko and Emma with their own portraits and state`, async ({ page }) => {
    test.setTimeout(150_000);
    await page.setViewportSize(viewport);
    mkdirSync('outputs/emma-switch-qa', { recursive: true });
    const fixture = await withArtPhone(page, initial());
    const source = await read(fixture.helper);
    await noOverflow(page);
    const select = page.locator('[data-protagonist-select]');
    await expect(select.locator('option')).toHaveCount(3);
    await expect(select).toHaveValue('soyo');

    // Start with the selected protagonist's Live2D, not Sakiko/Emma art.
    await expect(page.locator('[data-live2d-speaker-visible="true"]')).toHaveCount(1);
    await page.screenshot({ path: `outputs/emma-switch-qa/${viewport.width}x${viewport.height}-soyo.png` });

    await select.selectOption('sakiko');
    await expect.poll(async () => (await read(fixture.helper)).protagonists!.accounts.active).toBe('sakiko');
    await expect(page.locator('[data-sakiko-sprite]')).toHaveCount(1);
    await expect(page.locator('[data-majo-portrait]')).toHaveCount(0);
    await noOverflow(page);
    await page.screenshot({ path: `outputs/emma-switch-qa/${viewport.width}x${viewport.height}-sakiko.png` });

    await select.selectOption('emma');
    await expect.poll(async () => (await read(fixture.helper)).protagonists!.accounts.active).toBe('emma');
    await expect(select).toHaveValue('emma');
    await expect(page.locator('.uc-shell')).toHaveAttribute('data-current-protagonist', 'emma');
    await expect(page.locator('[data-majo-portrait="majo-emma"]')).toHaveCount(1);
    await expect(page.locator('[data-sakiko-sprite]')).toHaveCount(0);
    const emma = await read(fixture.helper);
    expect(emma.locationId).toBe('home');
    expect(Object.keys(emma.protagonists!.accounts.people).sort()).toEqual(['emma', 'sakiko', 'soyo']);
    expect(emma.protagonists!.third.locationId).toBe('downtown');
    expect(emma.schema_version).toBe('1.13.0');
    await noOverflow(page);
    await page.screenshot({ path: `outputs/emma-switch-qa/${viewport.width}x${viewport.height}-emma.png` });

    await select.selectOption('soyo');
    await expect.poll(async () => (await read(fixture.helper)).protagonists!.accounts.active).toBe('soyo');
    await expect(page.locator('[data-live2d-speaker-visible="true"]')).toHaveCount(1);
    await expect(page.locator('[data-majo-portrait]')).toHaveCount(0);
    const soyo = await read(fixture.helper);
    expect(soyo.story).toEqual(source.story);
    expect(soyo.protagonists!.accounts.people.soyo.cards.gpt).toBe(32800);
    expect(soyo.protagonists!.accounts.people.emma.cards.gpt).toBe(60000);
    expect(fixture.modelRequests).toEqual([]);
    expect(fixture.errors).toEqual([]);
    writeFileSync(`outputs/emma-switch-qa/${viewport.width}x${viewport.height}.json`, JSON.stringify({
      viewport, options: 3, emmaLocation: emma.locationId, schema: emma.schema_version,
      accounts: Object.keys(emma.protagonists!.accounts.people), stage: 'passed',
    }, null, 2) + '\n');
  });
}
