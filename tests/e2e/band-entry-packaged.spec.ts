import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';

for(const viewport of [{width:1440,height:900},{width:1280,height:800},{width:390,height:844},{width:320,height:568}]) {
  test(`packaged phone band eligibility ${viewport.width}x${viewport.height}`,async({page})=>{
    test.setTimeout(150_000);
    await page.setViewportSize(viewport);
    await page.emulateMedia({reducedMotion:'reduce'});
    const errors:string[]=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/unread-city-lite-assets.zip',route=>route.continue({url:'http://127.0.0.1:5178/dist/unread-city-lite-assets.zip'}));
    await page.route('**/api/**',route=>route.abort());
    await page.route('https://**',route=>route.abort());
    await page.route('**/scripts/personas.js',route=>route.fulfill({contentType:'text/javascript',body:'export let user_avatar = "";'}));
    await page.route('**/scripts/extensions/regex/engine.js',route=>route.fulfill({contentType:'text/javascript',body:'export const regex_placement = {}; export const getRegexedString = value => value;'}));
    await page.goto('/tests/e2e/band-entry.html');
    await expect(page.locator('.uc-shell')).toBeVisible({timeout:60_000});
    mkdirSync('outputs/band-entry-qa',{recursive:true});
    for(const owner of ['soyo','sakiko','emma','renako']) {
      if(owner!=='soyo') await page.locator('[data-protagonist-select]').selectOption(owner);
      await expect(page.locator('.uc-shell')).toHaveAttribute('data-current-protagonist',owner);
      await page.locator('.tool-dock .phone-launcher').click();
      const phone=page.frameLocator('#sttts-panel iframe');
      await phone.locator('[data-app="worldmessages"]').click();
      const expected=owner==='soyo'||owner==='sakiko'?1:0;
      await expect(phone.locator('[data-action="open-bands"]')).toHaveCount(expected);
      await expect(phone.locator('.uc-conv-list')).toBeVisible();
      await page.screenshot({path:`outputs/band-entry-qa/${viewport.width}x${viewport.height}-${owner}.png`});
      await phone.locator('[data-action="open-thread"]').first().click();
      await expect(phone.locator('.uc-thread')).toBeVisible();
      await expect(phone.locator('[data-action="open-bands"]')).toHaveCount(expected);
      await expect(phone.locator('[data-action="send"]')).toBeVisible();
      await expect(phone.locator('body')).not.toContainText(/world_actions|不调用模型|不触发正文/);
      await page.locator('[aria-label="关闭手机窗口"]').click();
    }
    expect(await page.evaluate(()=>(window as any).bandEntryFixture.modelCalls())).toBe(0);
    expect(errors).toEqual([]);
  });
}
