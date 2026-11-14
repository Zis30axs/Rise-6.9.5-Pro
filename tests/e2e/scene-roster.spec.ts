import { expect, test, type Page } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { mountSwitchHost } from './phone-peek-host';
import { selectDockAction } from './tool-dock-helpers';

const output = 'outputs/scene-roster';
const release = `${output}/release`;
const bundle = readFileSync(`${release}/immersive-shell-lite.js`, 'utf8');
const viewports = [{ width: 1440, height: 900 }, { width: 1280, height: 800 },
  { width: 390, height: 844 }, { width: 320, height: 568 }];

async function fixture(page: Page) {
  await page.route('http://127.0.0.1:5198/', route => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>',
  }));
  await page.goto('/');
  return page.evaluate(async () => {
    const modelPath = '/src/runtime/model.ts', worldPath = '/src/runtime/protagonist-world.ts';
    const { createInitialState } = await import(modelPath);
    const { enableProtagonists, personState } = await import(worldPath);
    const state = enableProtagonists(createInitialState());
    state.academics = { majorId: 'computer-science', subjects: [
      { subjectId: 'cs-programming', points: 0 }, { subjectId: 'cs-algorithms', points: 0 },
      { subjectId: 'cs-networks', points: 0 },
    ], lastGain: null };
    state.locationId = 'sports'; state.interior = null;
    state.scene = { x: 39, z: -11, yaw: 0, areaId: 'sports', seed: 'roster', encounterId: null };
    state.story = [{ id: 'roster-fixture', role: 'assistant', text: '风吹过运动场，你停下脚步。' }];
    const sakiko = personState(state, 'sakiko');
    sakiko.locationId = 'sports'; sakiko.interior = null;
    sakiko.scene = { ...state.scene, x: 64 };
    return state;
  });
}

async function labelGeometry(page: Page) {
  return page.locator('.tokyo-sandbox-scene').evaluate(element => {
    const bounds = element.getBoundingClientRect();
    const boxes = [...element.querySelectorAll<HTMLElement>('.tokyo-sandbox-pin,.tokyo-sandbox-caption,.tokyo-sandbox-avatar,.tokyo-sandbox-event')]
      .map(node => ({ id: node.dataset.mapPersonId ?? node.dataset.mapTarget ?? node.className,
        rect: node.getBoundingClientRect() })).filter(box => box.rect.width > 0);
    const collisions: string[][] = [], outside: string[] = [];
    for (const [i, box] of boxes.entries()) {
      if (box.rect.left < bounds.left - 1 || box.rect.right > bounds.right + 1 ||
        box.rect.top < bounds.top - 1 || box.rect.bottom > bounds.bottom + 1) outside.push(box.id);
      for (const other of boxes.slice(i + 1)) {
        if (Math.min(box.rect.right, other.rect.right) - Math.max(box.rect.left, other.rect.left) > 1 &&
          Math.min(box.rect.bottom, other.rect.bottom) - Math.max(box.rect.top, other.rect.top) > 1)
          collisions.push([box.id, other.id]);
      }
    }
    return { count: boxes.length, collisions, outside };
  });
}

for (const viewport of viewports) test(`shared scene roster and labels ${viewport.width}x${viewport.height}`, async ({ page }) => {
  mkdirSync(output, { recursive: true });
  await page.setViewportSize(viewport);
  const { helper, errors } = await mountSwitchHost(page, {
    state: await fixture(page), bundle, installZip: `${release}/unread-city-lite-assets.zip`,
  });
  await selectDockAction(page, '地点');
  const distant = page.locator('[data-visible-person="protagonist-sakiko"]');
  await expect(distant).toContainText('25 米 · 远处');
  await expect(distant.locator('[data-talk-person]')).toBeDisabled();
  const ids = await page.locator('[data-visible-person]').evaluateAll(rows => rows.map(row => (row as HTMLElement).dataset.visiblePerson));
  await distant.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${output}/people-${viewport.width}.png` });
  await selectDockAction(page, '地图');
  await expect(page.locator('[data-tokyo-sandbox-status]')).toHaveAttribute('data-tokyo-sandbox-status', 'ready', { timeout: 45_000 });
  await page.getByRole('navigation', { name: '城市片区' }).getByRole('button', { name: '高田／西早稻田校园', exact: true }).click();
  await expect(page.locator('[data-tokyo-sandbox-scope]')).toHaveAttribute('data-tokyo-sandbox-scope', 'campus');
  await expect(page.locator('[data-tokyo-camera-flight]')).toHaveAttribute('data-tokyo-camera-flight', 'idle');
  const map = page.locator('.world-map');
  await expect(map.locator('.wm-people-summary')).toContainText('丰川祥子');
  await expect(page.getByRole('button', { name: '查看人物：丰川祥子', exact: true })).toBeVisible();
  const first = await labelGeometry(page);
  expect(first.count).toBeGreaterThan(2);
  expect(first.collisions).toEqual([]); expect(first.outside).toEqual([]);
  await page.locator('[data-world-map-viewport]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${output}/map-${viewport.width}.png` });
  const filters = page.getByRole('group', { name: '沙盘标签分类' });
  await filters.getByRole('checkbox', { name: '行人', exact: true }).uncheck();
  await expect(page.locator('[data-map-person-kind="passerby"]')).toHaveCount(0);
  await filters.getByRole('checkbox', { name: '地点', exact: true }).uncheck();
  await expect(page.locator('[data-map-location]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '查看人物：丰川祥子', exact: true })).toBeVisible();
  await filters.getByRole('checkbox', { name: '行人', exact: true }).check();
  await filters.getByRole('checkbox', { name: '地点', exact: true }).check();
  await page.getByRole('button', { name: '向右旋转地图', exact: true }).click();
  await page.getByRole('button', { name: '放大地图', exact: true }).click();
  await expect.poll(async () => (await labelGeometry(page)).collisions).toEqual([]);
  await page.getByRole('button', { name: '复位地图视图', exact: true }).click();
  await expect.poll(async () => (await labelGeometry(page)).collisions).toEqual([]);
  await expect(map).not.toContainText(/演示定位|场景存档|模型|LLM/);
  const overflow = await page.locator('.uc-shell').evaluate(e => e.scrollWidth - e.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(await helper.evaluate(() => (window as any).fixtureCounts().generations)).toBe(0);
  await page.getByRole('button', { name: '返回城市总览', exact: true }).click();
  await page.getByRole('navigation', { name: '城市片区' }).getByRole('button', { name: '杂司谷住宅区', exact: true }).click();
  await expect(page.locator('[data-tokyo-camera-flight]')).toHaveAttribute('data-tokyo-camera-flight', 'idle');
  await expect(page.locator('[data-map-person-id]')).toHaveCount(0);
  await expect(map.locator('.wm-people-summary')).toHaveCount(0);
  await helper.evaluate(() => {
    (window as any).rosterRequests = [];
    (window as any).generate = async (config: unknown) => {
      (window as any).rosterRequests.push(config);
      return '<story>你望向运动场，没有走近或出声。</story><phone_messages>[]</phone_messages>';
    };
  });
  await page.keyboard.press('Escape');
  await page.locator('textarea').fill('看看运动场上有哪些人。');
  await page.locator('button[type="submit"]').click();
  await expect.poll(() => helper.evaluate(() => (window as any).rosterRequests.length)).toBe(1);
  const request = await helper.evaluate(() => (window as any).rosterRequests[0]);
  const summary = JSON.parse(request.user_input.split('\n').find((line: string) => line.startsWith('{')));
  expect(summary.scene.nearbyPeople.map((person: { id: string }) => person.id)).toEqual(ids);
  expect(summary.scene.nearbyPeople.find((person: { id: string }) => person.id === 'protagonist-sakiko'))
    .toMatchObject({ distanceMetres: 25, canTalk: false });
  expect(request.injects[0].content).toContain('随机路人只作补充');
  const kinds = summary.scene.nearbyPeople.map((person: { kind: string }) => person.kind);
  expect(kinds.slice(kinds.indexOf('passerby'))).not.toContain('person');
  expect(errors).toEqual([]);
  writeFileSync(`${output}/browser-${viewport.width}.json`, JSON.stringify({ viewport, ids, geometry: first,
    modelCalls: 'one controlled reply; no upstream request', zeroGenerationWhileBrowsing: true,
    sameOrderedRosterInRequest: true, distantConversationDisabled: true, errors }, null, 2));
});
