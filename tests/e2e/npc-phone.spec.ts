import { test, expect } from '@playwright/test';
import { proposal } from '../npc-fixture';
import { mkdirSync } from 'node:fs';

for (const [width,height] of [[1440,900],[1280,800],[390,844],[320,568]]) {
  test('real phone contacts and NPC route at '+width+'x'+height, async ({page}) => {
    await page.setViewportSize({width,height});
    const initial = proposal().state;
    initial.story.push({id:'player-secret',role:'assistant',text:'PRIVATE_PLAYER_SECRET'});
    initial.protagonists!.inactive.story.push({id:'other-secret',role:'assistant',text:'OTHER_PROTAGONIST_SECRET'});
    await page.addInitScript(s => { (window as any).fixtureInitial = s; }, initial);
    const errors: string[] = [], network: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/api/**', r => { network.push(r.request().url()); return r.abort(); });
    await page.route('https://**', r => { network.push(r.request().url()); return r.abort(); });
    await page.route('**/scripts/personas.js', r => r.fulfill({contentType:'text/javascript',body:'export let user_avatar="";'}));
    await page.route('**/scripts/extensions/regex/engine.js', r => r.fulfill({contentType:'text/javascript',body:'export const regex_placement={};export const getRegexedString=x=>x;'}));
    await page.goto('/tests/fixtures/npc-phone.html');
    await page.waitForFunction(() => (window as any).fixtureReady);
    const phone = page.frameLocator('#sttts-panel iframe');
    await phone.locator('[data-app="worldmessages"].app-icon').first().click();
    const view = phone.locator('section[data-app="worldmessages"]');
    await expect(view.getByRole('region',{name:'联系申请'})).toBeVisible();
    expect((await view.locator('h1').boundingBox())!.height).toBeLessThan(42);
    await page.evaluate(() => { (window as any).fixtureFailSave = true; });
    await view.getByRole('button',{name:'接受',exact:true}).click();
    await expect.poll(() => page.evaluate(() => (window as any).fixtureState().contacts.some((c:any)=>c.id==='majo-emma'))).toBe(false);
    await view.getByRole('button',{name:'重试保存',exact:true}).click();
    await expect(view.getByRole('region',{name:'联系申请'})).toHaveCount(0);
    await view.locator('[data-world-field="recipient"]').selectOption('npc:majo-emma');
    await view.locator('[data-world-field="message"]').fill('今天一起聊聊吗？');
    await view.getByRole('button',{name:'发送消息',exact:true}).click();
    await expect(view.locator('.sms-bubble.incoming')).toContainText('收到，稍晚一点再聊。');
    await expect(view.locator('.sms-bubble.outgoing')).toContainText('今天一起聊聊吗？');
    const prompt = await page.evaluate(() => JSON.stringify((window as any).fixturePrompts));
    expect(prompt).not.toContain('PRIVATE_PLAYER_SECRET'); expect(prompt).not.toContain('OTHER_PROTAGONIST_SECRET');
    await page.evaluate(() => (window as any).fixtureOpenNativeContact());
    await expect(view).toBeVisible();
    await expect(view.locator('[data-world-field="recipient"]')).toHaveValue('npc:majo-emma');
    await page.evaluate(() => (window as any).fixtureInvite());
    await view.getByRole('button',{name:'接受',exact:true}).click();
    await view.locator('[data-world-field="recipient"]').selectOption('group:majo-circle');
    // A fixed UUID whose draw selects three members, so every viewport checks
    // a real multi-member turn rather than relying on a lucky random sample.
    await phone.locator('body').evaluate(() => Object.defineProperty(crypto,'randomUUID',{value:()=> '00000000-0000-4000-8000-000000000001'}));
    await view.locator('[data-world-field="message"]').fill('大家好。');
    await view.getByRole('button',{name:'发送消息',exact:true}).click();
    await expect.poll(() => page.evaluate(() => (window as any).fixtureState().protagonists.npcPhone.messages.find((m:any)=>m.channel==='group'&&m.direction==='outgoing')?.status)).toBe('answered');
    const groupCount=await page.evaluate(() => (window as any).fixtureState().protagonists.npcPhone.messages.find((m:any)=>m.channel==='group'&&m.direction==='outgoing').responsePlan.length);
    expect(groupCount).toBe(3);
    await expect(view.locator('.sms-bubble.incoming')).toHaveCount(groupCount);
    await expect(view.locator('.sms-bubble.outgoing')).toHaveCount(1);
    await expect(view.locator('.sms-read-animation>b')).toBeVisible();
    await view.locator('[data-world-field="message"]').fill('还没发送的草稿');
    const frame = page.frames().find(f => f.parentFrame() && f.url()==='about:srcdoc')!;
    expect(await frame.evaluate(() => document.documentElement.scrollWidth <= innerWidth+1)).toBe(true);
    await view.locator('[data-world-field="message"]').scrollIntoViewIfNeeded();
    await expect(view.getByRole('button',{name:'发送消息',exact:true})).toBeEnabled();
    mkdirSync('outputs/npc-phone-qa',{recursive:true});
    await page.locator('#sttts-panel iframe').screenshot({path:'outputs/npc-phone-qa/'+width+'x'+height+'.png'});
    await page.reload(); await page.waitForFunction(() => (window as any).fixtureReady);
    await phone.locator('[data-app="worldmessages"].app-icon').first().click();
    await view.locator('[data-world-field="recipient"]').selectOption('group:majo-circle');
    await expect(view.locator('.sms-bubble.incoming')).toHaveCount(groupCount);
    await expect.poll(() => page.evaluate(() => (window as any).fixtureUnsafeCalls)).toBe(0);
    expect(errors).toEqual([]); expect(network).toEqual([]);
  });
}
