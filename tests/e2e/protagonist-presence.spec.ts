import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { getCampusInterior } from '../../src/runtime/campus-interiors';
import { personState } from '../../src/runtime/protagonist-world';
import { getScenePeople } from '../../src/runtime/scene-context';
import type { CharacterContact } from '../../src/frontend/types';
import { mountSwitchHost as mountBaseHost, switchState, viewports, readState, noOverflow } from './switch-map-fixture';

const out = 'outputs/protagonist-presence-qa';
const tool = (page: Page, name: string) => page.locator('.tool-dock button').filter({ hasText: name });

async function mountSwitchHost(page: Page, options: Parameters<typeof mountBaseHost>[1]) {
  // The production IIFE is under test. Vite's demo bootstrap/HMR must not replace the controlled host.
  await page.route('http://127.0.0.1:5188/', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>' }));
  return mountBaseHost(page, options);
}

function sportsState() {
  const state = switchState();
  state.locationId = 'sports';
  state.scene = { x: 39, z: -11, yaw: 0, areaId: 'sports', seed: 'presence-sports', encounterId: null };
  state.interior = null;
  const sakiko = personState(state, 'sakiko');
  sakiko.locationId = 'sports'; sakiko.interior = null;
  sakiko.scene = { ...state.scene, x: 46 };
  return state;
}

async function campusMap(page: Page) {
  await tool(page, '地图').click();
  await page.locator('[data-map-plane="city"] [data-map-target="city:campus"]').click();
  await expect(page.locator('.world-map')).toHaveAttribute('data-map-district', 'campus');
}

test.beforeEach(() => mkdirSync(out, { recursive: true }));

for (const viewport of viewports) {
  const size = `${viewport.width}x${viewport.height}`;
  test(`${size} sports meeting exposes protagonist, avatar and explicit dialogue`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const { helper, errors } = await mountSwitchHost(page, { state: sportsState() });
    await tool(page, '地点').click();
    const nearby = page.locator('[data-nearby-people]');
    await nearby.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${out}/${size}-sports-people.png` });
    await expect(nearby).toContainText('丰川祥子');
    const sakikoRow = nearby.locator(':scope > div').filter({ hasText: '丰川祥子' });
    await expect(sakikoRow.getByRole('button', { name: '交流', exact: true })).toBeEnabled();
    await noOverflow(page);
    await campusMap(page);
    const avatar = page.getByRole('button', { name: '查看人物：丰川祥子', exact: true });
    await expect(avatar).toBeVisible();
    await avatar.click();
    await expect(page.locator('.cms-person-detail')).toContainText('丰川祥子');
    await expect(avatar.locator('[data-map-avatar-kind="sprite"] img')).toBeVisible();
    await page.screenshot({ path: `${out}/${size}-sports-map.png` });
    await noOverflow(page);
    await tool(page, '地点').click();
    await sakikoRow.getByRole('button', { name: '交流', exact: true }).click();
    await expect(page.locator('textarea')).toHaveValue(/向丰川祥子打招呼/);
    await expect(page.locator('[data-current-encounter]')).toContainText('丰川祥子');
    await expect(page.locator('[data-sakiko-sprite]')).toBeVisible();
    expect((await readState(helper)).unread_city.scene?.encounterId).toBe('protagonist-sakiko');
    await helper.evaluate(() => {
      const host = window as unknown as Record<string, unknown>;
      host.presenceCalls = [];
      host.generate = async (config: { user_input: string }) => {
        (host.presenceCalls as string[]).push(config.user_input);
        return '<story>|丰川祥子|平静|你也来到运动场了。|</story><phone_messages>[]</phone_messages>';
      };
    });
    await page.locator('button[type="submit"]').click();
    await expect(page.locator('[data-toggle-dialogue]')).toContainText('展开对白');
    await page.locator('[data-toggle-dialogue]').click();
    await expect(page.locator('.novel-speech')).toContainText('你也来到运动场了。');
    const calls = await helper.evaluate(() => (window as unknown as { presenceCalls: string[] }).presenceCalls);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('protagonist-sakiko');
    await page.screenshot({ path: `${out}/${size}-sports-dialogue.png` });
    await noOverflow(page);
    expect(errors).toEqual([]);
    writeFileSync(`${out}/${size}.json`, JSON.stringify({ viewport, scenario: 'sports at 7 metres', nearbyProtagonist: true, actualSprite: true, mapAvatar: true, explicitDialogue: true, modelCalls: 'one controlled local reply', overflow: false, errors }, null, 2));
  });
  test(`${size} sports 3D shortcut keeps the protagonist at seven metres`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const { helper, errors } = await mountSwitchHost(page, { state: sportsState(), mode: 'scene' });
    await expect(page.locator('[data-unread-city-scene]')).toHaveAttribute('data-renderer', 'webgl');
    await page.getByRole('button', { name: '收起正文', exact: true }).click();
    const shortcut = page.getByRole('button', { name: '与丰川祥子搭话', exact: true });
    await expect(shortcut).toBeVisible();
    await expect(shortcut).toContainText('7米');
    await page.screenshot({ path: `${out}/${size}-sports-3d.png` });
    await shortcut.click();
    await expect(page.locator('textarea')).toHaveValue(/向丰川祥子打招呼/);
    expect((await readState(helper)).unread_city.scene?.encounterId).toBe('protagonist-sakiko');
    await noOverflow(page);
    expect(errors).toEqual([]);
  });
}

test('same room protagonist appears on map and can be selected for conversation', async ({ page }) => {
  const state = sportsState(), room = getCampusInterior('dorm-room')!;
  for (const person of [state, personState(state, 'sakiko')]) {
    person.locationId = room.id;
    person.scene = { ...person.scene!, x: room.entrance.x, z: room.entrance.z, areaId: 'residences' };
    person.interior = { roomId: room.id, ...room.spawn, activityId: null, lastRest: null, lastStudy: null };
  }
  const { errors } = await mountSwitchHost(page, { state });
  await campusMap(page);
  const avatar = page.getByRole('button', { name: '查看人物：丰川祥子', exact: true });
  await expect(avatar).toBeVisible();
  await avatar.click();
  await expect(page.locator('.cms-person-detail')).toContainText('丰川祥子');
  await expect(page.locator('.cms-person-detail')).toContainText('她在这里');
  await page.screenshot({ path: `${out}/same-room-map.png` });
  await tool(page, '地点').click();
  const row = page.locator('[data-nearby-people] > div').filter({ hasText: '丰川祥子' });
  await row.getByRole('button', { name: '交流', exact: true }).click();
  await expect(page.locator('textarea')).toHaveValue(/向丰川祥子打招呼/);
  expect(errors).toEqual([]);
});

test('map NPC affinity follows the current protagonist and excludes unknown passers-by', async ({ page }) => {
  const state = sportsState();
  const people = getScenePeople(state.scene!, [], state.clock).filter(person => person.id.startsWith('ped-')).slice(8, 10);
  expect(people).toHaveLength(2);
  const contact = (person: typeof people[number], affinity: number): CharacterContact => ({
    id: `contact-${person.id}`, sourcePersonId: person.id, name: person.name, summary: person.description,
    portraitId: person.portraitId, isMain: true, affinity, tag: '已认识', status: '在运动场',
  });
  state.contacts = [...state.contacts, contact(people[0]!, 9), contact(people[1]!, 10)];
  personState(state, 'sakiko').contacts = [contact(people[0]!, 10), contact(people[1]!, 9)];
  const { errors } = await mountSwitchHost(page, { state });
  await campusMap(page);
  await expect(page.getByRole('button', { name: `查看人物：${people[0]!.name}`, exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: `查看人物：${people[1]!.name}`, exact: true })).toBeVisible();
  await expect(page.locator('[data-map-person-id]')).toHaveCount(2);
  await page.keyboard.press('Escape');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('[data-protagonist-select]').selectOption('sakiko');
  await expect(page.locator('.uc-shell')).toHaveAttribute('data-current-protagonist', 'sakiko');
  await campusMap(page);
  await expect(page.getByRole('button', { name: `查看人物：${people[0]!.name}`, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: `查看人物：${people[1]!.name}`, exact: true })).toHaveCount(0);
  await expect(page.locator('[data-map-person-id]')).toHaveCount(2);
  expect(errors).toEqual([]);
});
