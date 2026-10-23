import { expect, test, type Locator, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createSelectedInitialState } from './academics-fixture';
import { reduceState } from '../../src/runtime/model';
import type { WorldState } from '../../src/frontend/types';

const storageKey = 'unread-city-margo-cafe-local-qa';
const fixturePath = '/__margo_cafe_local_qa.html';
const viewports = [
  { width: 1440, height: 900 }, { width: 1280, height: 800 },
  { width: 390, height: 844 }, { width: 320, height: 568 },
];
type FixtureWindow = Window & {
  margoFixture: { read(): WorldState; counts(): { saves: number; generations: number }; roll(value: number): void };
};

function initial() {
  const state = reduceState(createSelectedInitialState(), { type: 'novel_travel', locationId: 'street-cafe' });
  state.clock = { day: 1, hour: 15, minute: 30 };
  state.airTraffic.nextAmbientAt = Date.now() + 3_600_000;
  return state;
}

/** Complete App + lifecycle + reducers with a local atomic-save bridge. No model or phone service. */
async function host(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('http://127.0.0.1:5186/', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body></body></html>' }));
  await page.route(`**${fixturePath}`, route => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>
      <script type="module">
        import { mountShell } from '/src/frontend/lifecycle.ts';
        import { parseState } from '/src/runtime/model.ts';
        const key = ${JSON.stringify(storageKey)};
        const state = parseState(JSON.parse(localStorage.getItem(key)));
        localStorage.setItem('unread-city.presentation-mode.v1', 'novel');
        const counters = { saves: 0, generations: 0 };
        let saved = state;
        const bridge = {
          kind: 'demo', label: '玛格咖啡馆本地受控验收', session: () => 'margo-local-qa',
          load: () => parseState(saved),
          save(next) { saved = parseState(next); localStorage.setItem(key, JSON.stringify(saved)); counters.saves++; },
          onSessionChange() { return () => {}; },
          async generate() { counters.generations++; throw new Error('咖啡馆固定赠礼不得请求模型'); },
          cancel() {}, dispose() {},
        };
        const handle = mountShell(window, window, bridge, () => {});
        window.margoFixture = {
          read: () => JSON.parse(JSON.stringify(saved)), counts: () => ({ ...counters }),
          roll: value => { Math.random = () => value; },
        };
      </script></body></html>`,
  }));
  await page.goto('/');
  await page.evaluate(({ key, state }) => localStorage.setItem(key, JSON.stringify(state)), { key: storageKey, state: initial() });
  await page.goto(fixturePath);
  await expect(page.locator('.uc-shell')).toHaveAttribute('data-presentation-mode', 'novel');
  return errors;
}

const saved = (page: Page) => page.evaluate(() => (window as unknown as FixtureWindow).margoFixture.read());
const counts = (page: Page) => page.evaluate(() => (window as unknown as FixtureWindow).margoFixture.counts());
const roll = (page: Page, value: number) => page.evaluate(value => (window as unknown as FixtureWindow).margoFixture.roll(value), value);
const location = (page: Page) => page.locator('[data-window="location"]');
const overlay = (page: Page) => page.locator('[data-interaction-overlay]');

async function reachable(button: Locator) {
  await button.scrollIntoViewIfNeeded();
  const hit = await button.evaluate(node => {
    const box = node.getBoundingClientRect(), root = node.getRootNode() as ShadowRoot;
    return { hit: node.contains(root.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)),
      x: box.x, right: box.right, y: box.y, bottom: box.bottom, width: innerWidth, height: innerHeight };
  });
  expect(hit.hit).toBe(true);
  expect(hit.x).toBeGreaterThanOrEqual(-.5); expect(hit.right).toBeLessThanOrEqual(hit.width + .5);
  expect(hit.y).toBeGreaterThanOrEqual(-.5); expect(hit.bottom).toBeLessThanOrEqual(hit.height + .5);
}

async function noOverflow(page: Page) {
  const sizes = await page.locator('.uc-shell').evaluate(node => ({
    shell: node.scrollWidth - node.clientWidth, document: document.documentElement.scrollWidth - innerWidth,
  }));
  expect(sizes.shell).toBeLessThanOrEqual(1); expect(sizes.document).toBeLessThanOrEqual(1);
}

for (const viewport of viewports) {
  test(`${viewport.width}x${viewport.height} cafe owner, services, gift and saved cooldown`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const errors = await host(page);
    const prefix = `outputs/margo-cafe-qa/${viewport.width}x${viewport.height}`;
    mkdirSync('outputs/margo-cafe-qa', { recursive: true });
    await page.getByRole('button', { name: '地点', exact: true }).click();
    await expect(location(page).locator('[data-quick-service="drink-tea"]')).toBeEnabled();
    await expect(location(page)).toContainText('10:00');
    const enter = location(page).locator('[data-adjacent-place="margo-cafe-room"]');
    await expect(enter).toBeEnabled();
    await reachable(enter); await noOverflow(page);
    await page.screenshot({ path: `${prefix}-storefront.png` });

    await roll(page, .2);
    await enter.click();
    await expect(overlay(page)).toHaveAttribute('data-interaction-phase', 'choice');
    await reachable(page.locator('[data-interaction-accept]'));
    await page.screenshot({ path: `${prefix}-gift-choice.png` });
    await page.locator('[data-interaction-accept]').click();
    await expect(overlay(page)).toHaveCount(0);
    await expect(page.locator('[data-novel-background="margo-cafe-room"]')).toHaveAttribute('data-background-id', 'majo-margo-cafe-room');
    await expect(page.locator('[data-novel-background="margo-cafe-room"]')).toHaveAttribute('data-background-source', 'majo-art');
    const gifted = await saved(page);
    expect(gifted.locationId).toBe('margo-cafe-room');
    expect(gifted.inventory.reduce((sum, item) => sum + item.quantity, 0)).toBe(1);
    expect(gifted.story.at(-1)?.role).toBe('assistant');
    expect(gifted.interactionEventRate?.checks).toHaveLength(1);
    expect(gifted.interactionEventRate?.checks[0]?.offered).toBe(true);
    expect((await counts(page)).generations).toBe(0);

    await page.getByRole('button', { name: '地点', exact: true }).click();
    await expect(location(page).locator('[data-talk-person="majo-margo"]')).toBeVisible();
    await expect(location(page).locator('[data-talk-person="majo-emma"]')).toBeVisible();
    await reachable(location(page).locator('[data-talk-person="majo-margo"]'));
    await page.screenshot({ path: `${prefix}-inside-people.png` });
    await location(page).locator('[data-talk-person="majo-margo"]').click();
    await expect(page.locator('[data-current-encounter][data-person-id="majo-margo"]')).toBeVisible();
    const margoPortrait = page.locator('[data-majo-portrait="majo-margo"]');
    await expect(margoPortrait).toBeVisible();
    await margoPortrait.locator('img').evaluate(async node => { await (node as HTMLImageElement).decode(); });
    expect(await margoPortrait.locator('img').evaluate(node => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await expect(margoPortrait).toHaveCSS('opacity', '1');
    await page.screenshot({ path: `${prefix}-margo-portrait.png` });

    // Services use the existing catalog inside the shop, without another offer during cooldown.
    await page.getByRole('button', { name: '地点', exact: true }).click();
    const tea = location(page).locator('[data-quick-service="drink-tea"]');
    await expect(tea).toBeEnabled(); await reachable(tea); await tea.click();
    await expect.poll(async () => (await saved(page)).clock.minute).toBe(40);
    await expect(overlay(page)).toHaveCount(0);
    expect((await saved(page)).inventory).toEqual(gifted.inventory);

    const leave = location(page).locator('[data-adjacent-place="street-cafe"]');
    await reachable(leave); await leave.click();
    await expect.poll(async () => (await saved(page)).locationId).toBe('street-cafe');
    await page.getByRole('button', { name: '地点', exact: true }).click();
    await location(page).locator('[data-adjacent-place="margo-cafe-room"]').click();
    await expect.poll(async () => (await saved(page)).locationId).toBe('margo-cafe-room');
    await expect(overlay(page)).toHaveCount(0);
    const beforeReload = await saved(page);
    expect(beforeReload.inventory).toEqual(gifted.inventory);
    expect(beforeReload.interactionEventRate?.checks).toHaveLength(1);

    await page.reload();
    await expect(page.locator('.uc-shell')).toHaveAttribute('data-presentation-mode', 'novel');
    expect(await saved(page)).toEqual(beforeReload);
    await page.getByRole('button', { name: '背包', exact: true }).click();
    await expect(page.locator('[data-inventory-product]')).toHaveCount(1);
    await noOverflow(page);
    await page.screenshot({ path: `${prefix}-saved-inventory.png` });
    expect((await counts(page)).generations).toBe(0);
    expect(errors).toEqual([]);
    writeFileSync(`${prefix}.json`, JSON.stringify({ viewport, stage: 'passed', state: beforeReload,
      controlledBridge: true, sourceModules: true, realModelCalls: 0, physicalTauriTavern: false,
    }, null, 2) + '\n');
  });
}
