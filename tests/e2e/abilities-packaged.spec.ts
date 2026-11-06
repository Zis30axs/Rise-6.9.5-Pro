import { expect, test } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
const viewports = [{ width: 1440, height: 900 }, { width: 1280, height: 800 }, { width: 390, height: 844 }, { width: 320, height: 568 }];
const host = readFileSync('index.html', 'utf8').replace(
  '<script type="module" src="/src/frontend/main.ts"></script>',
  '<script src="/dist/immersive-shell-lite.js"></script>',
);
if (host.includes('/src/frontend/main.ts') || !host.includes('src="/dist/immersive-shell-lite.js"')) {
  throw new Error('The packaged regression host must load the production IIFE');
}

for (const viewport of viewports) {
  test(`packaged abilities styles ${viewport.width}x${viewport.height}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('unread-city.presentation-mode.v1', 'novel'));
    // No Vite entry or CSS: use the same IIFE and ZIP that ship inside the card.
    await page.route('http://127.0.0.1:5178/', route => route.fulfill({
      contentType: 'text/html', body: host,
    }));
    await page.route('http://127.0.0.1:5178/unread-city-lite-assets.zip', route => route.continue({ url: 'http://127.0.0.1:5178/dist/unread-city-lite-assets.zip' }));
    await page.route('**/api/**', route => route.abort());
    await page.route('https://**', route => route.abort());
    await page.goto('/');
    await page.locator('[data-academic-major="computer-science"]').click();
    await page.locator('[data-academic-confirm]').click();
    await page.getByRole('button', { name: '能力', exact: true }).click();
    const panel = page.locator('[data-abilities-panel]');
    await expect(panel).toBeVisible();
    const style = await panel.evaluate(el => {
      const icon = el.querySelector('.uc-skill-icon-badge svg')!;
      const ring = el.querySelector('.uc-radar-ring')!;
      const label = el.querySelector('.uc-radar-label-name')!;
      return {
        iconWidth: icon.getBoundingClientRect().width,
        iconHeight: icon.getBoundingClientRect().height,
        radarWidth: el.querySelector('.uc-radar-svg')!.getBoundingClientRect().width,
        ringFill: getComputedStyle(ring).fill,
        ringStroke: getComputedStyle(ring).stroke,
        labelFill: getComputedStyle(label).fill,
        layout: getComputedStyle(el.querySelector('.uc-radar-dashboard')!).display,
      };
    });
    mkdirSync('outputs/abilities-packaged-qa', { recursive: true });
    writeFileSync(`outputs/abilities-packaged-qa/${viewport.width}x${viewport.height}.json`, JSON.stringify(style, null, 2));
    await page.screenshot({ path: `outputs/abilities-packaged-qa/${viewport.width}x${viewport.height}.png` });
    expect(style, 'Packaged Shadow DOM must contain the ability component styles').toMatchObject({
      iconWidth: 18, iconHeight: 18, ringFill: 'none', layout: 'grid',
    });
    expect(style.radarWidth).toBeLessThanOrEqual(310);
    expect(style.ringStroke).not.toBe('none');
    expect(style.labelFill).not.toBe('rgb(0, 0, 0)');
    const cards = panel.locator('.uc-skill-card');
    await expect(cards).toHaveCount(6);
    for (const card of await cards.all()) {
      const dimensions = await card.evaluate(el => ({
        icon: el.querySelector('.uc-skill-icon-badge svg')!.getBoundingClientRect().width,
        ring: el.querySelector('.uc-card-ring-svg')!.getBoundingClientRect().width,
        fill: getComputedStyle(el.querySelector('.uc-card-ring-bg')!).fill,
      }));
      expect(dimensions).toEqual({ icon: 18, ring: 42, fill: 'none' });
    }
    await cards.first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: `outputs/abilities-packaged-qa/${viewport.width}x${viewport.height}-skills.png` });
    await expect(panel).not.toContainText(/LLM|world_actions|不调用模型|不触发正文/);
    await page.getByRole('button', { name: /专业学识/ }).click();
    await expect(panel).toContainText('程序设计');
    const academicRings = panel.locator('.uc-academic-rings-svg');
    await academicRings.scrollIntoViewIfNeeded();
    expect(await academicRings.evaluate(el => ({
      width: el.getBoundingClientRect().width,
      fill: getComputedStyle(el.querySelector('.uc-acad-ring-bg')!).fill,
      label: getComputedStyle(el.querySelector('.uc-acad-ring-total')!).fill,
    }))).toEqual({ width: 108, fill: 'none', label: 'rgb(248, 250, 252)' });
    await page.screenshot({ path: `outputs/abilities-packaged-qa/${viewport.width}x${viewport.height}-academics.png` });
    await page.getByRole('button', { name: '实务与见闻', exact: true }).click();
    await panel.getByText('家常料理与厨艺手记', { exact: true }).scrollIntoViewIfNeeded();
    await expect(panel.getByText('家常料理与厨艺手记', { exact: true })).toBeVisible();
    expect(await panel.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    expect(await page.locator('.uc-shell').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    expect(errors).toEqual([]);
  });
}
