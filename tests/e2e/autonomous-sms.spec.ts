import { expect, test, type Page } from '@playwright/test';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

// Controlled source-runtime smoke test. Every model response comes from fixture.html.
// The system browser is selected explicitly for cloud execution.
test.use({ launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), args: ['--no-sandbox'] } });
const out = 'outputs/autonomous-sms';
async function capture(page: Page, path: string) {
  const cdp=await page.context().newCDPSession(page);
  const result=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  writeFileSync(path,Buffer.from(result.data,'base64'));
  await cdp.detach();
}

const viewports = [{width:1440,height:900},{width:1280,height:800},{width:390,height:844},{width:320,height:568}];
test('four viewports: unsolicited delivery, reload and manual replies', async ({page}) => {
  const viewport=viewports[0];
  test.setTimeout(240000); mkdirSync(out,{recursive:true});
  await page.setViewportSize(viewport);
  await page.emulateMedia({reducedMotion:'reduce'});
  const errors:string[] = [], blocked:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(!['127.0.0.1','localhost'].includes(url.hostname)&&!['data:','blob:'].includes(url.protocol)) {blocked.push(url.origin);await route.abort('blockedbyclient');return;}
    if(url.pathname==='/scripts/personas.js') {await route.fulfill({contentType:'text/javascript',body:'export let user_avatar = "";'});return;}
    if(url.pathname==='/scripts/extensions/regex/engine.js') {await route.fulfill({contentType:'text/javascript',body:'export const regex_placement = {}; export const getRegexedString = value => value;'});return;}
    await route.continue();
  });
  await page.goto('/outputs/autonomous-sms/fixture.html?fresh=1', {waitUntil:'domcontentloaded'});
  await expect(page.locator('[data-unread-city-root]')).toBeVisible({timeout:60000});
  await expect.poll(()=>page.evaluate(()=>(window as any).fixtureSms?.read().rawCalls)).toBe(1);
  await expect(page.locator('[data-phone-unread]')).toHaveAttribute('data-phone-unread','1',{timeout:60000});
  const initial=await page.evaluate(()=>(window as any).fixtureSms.read());
  const id=initial.state.phone[0].id;
  expect(initial.state.phone).toHaveLength(1);
  for(const size of viewports){await page.setViewportSize(size);await expect(page.locator('[data-phone-unread]')).toBeVisible();await capture(page,`${out}/${size.width}x${size.height}-unread.png`);}
  await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.locator('[data-phone-unread]')).toHaveAttribute('data-phone-unread','1',{timeout:60000});
  await page.waitForTimeout(1500);
  const reloaded=await page.evaluate(()=>(window as any).fixtureSms.read());
  expect(reloaded.rawCalls).toBe(1);expect(reloaded.state.phone.filter((m:any)=>m.id===id)).toHaveLength(1);
  await page.getByRole('button',{name:'手机',exact:true}).click();
  const phone=page.frameLocator('#sttts-panel iframe');
  await expect(phone.locator('body')).toBeVisible();
  // Phone entry and direct conversation use the real world-phone and embedded-phone APIs.
  await page.evaluate(async()=>{const f=(window as any).fixtureSms;await f.handle.actions.openPhoneContact(f.read().state.phone[0].npcId);});
  await expect(phone.locator('body')).toContainText('街角的面包店刚烤好了司康');
  for(const size of viewports){await page.setViewportSize(size);await expect(phone.locator('body')).toContainText('街角的面包店刚烤好了司康');await capture(page,`${out}/${size.width}x${size.height}-conversation.png`);}
  // Exercise the real composer: sending persists a bubble and leaves reply generation manual.
  await phone.locator('textarea').fill('我忙完再联系你。');
  await phone.getByRole('button',{name:'发送',exact:true}).click();
  await expect(phone.locator('body')).toContainText('我忙完再联系你。');
  const apiResult=await page.evaluate(()=>(window as any).fixtureSms.read());
  expect(apiResult.manualCalls).toBe(0);
  await expect(phone.getByRole('button',{name:'让对方回复',exact:true})).toBeEnabled();
  await phone.getByRole('button',{name:'让对方回复',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).fixtureSms.read().manualCalls)).toBe(1);
  await expect(phone.locator('body')).toContainText('好呀，等你忙完再说。');
  for(const size of viewports){
    await page.setViewportSize(size);
    await expect(phone.locator('body')).toContainText('好呀，等你忙完再说。');
    await capture(page,`${out}/${size.width}x${size.height}-manual-reply.png`);
    const overflow=await page.locator('.uc-shell').evaluate(el=>({shell:el.scrollWidth-el.clientWidth,document:document.documentElement.scrollWidth-innerWidth}));
    expect(overflow.shell).toBeLessThanOrEqual(1);expect(overflow.document).toBeLessThanOrEqual(1);expect(errors).toEqual([]);
    writeFileSync(`${out}/${size.width}x${size.height}.json`,JSON.stringify({viewport:size,automaticRawCalls:1,reloadNoDuplicate:true,manualReplyCalls:1,overflow,errors,blockedExternalOrigins:[...new Set(blocked)],verification:'controlled local source runtime; no real model or mobile hardware'},null,2));
  }
});
