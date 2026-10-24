import {expect,test,type FrameLocator,type Page} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createSelectedInitialState} from './academics-fixture';
import {withArtPhone} from './downtown-art-fixture';
import {enableProtagonists} from '../../src/runtime/protagonist-world';

test.use({screenshot:'only-on-failure'});

async function openPhone(page:Page) {
  await page.getByRole('button',{name:'手机',exact:true}).click();
  await expect(page.locator('[data-unread-city-phone-slot]')).toHaveAttribute('data-phone-status','ready',{timeout:20000});
  const phone=page.frameLocator('#sttts-panel iframe');
  await expect(phone.locator('.screen')).toBeVisible();
  return phone;
}
async function home(phone:FrameLocator) {
  await phone.locator('body').evaluate(()=> (window as unknown as {stTtsPhone:{home(immediate:boolean):void}}).stTtsPhone.home(true));
}
async function noOverflow(phone:FrameLocator) {
  // App launch briefly scales the home behind the opening window.
  await expect.poll(()=>phone.locator('.screen').evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);
}
for(const viewport of [{width:1440,height:900},{width:1280,height:800},{width:390,height:844},{width:320,height:568}]) {
  test(`${viewport.width}x${viewport.height} device art, preferences and switching`,async({page})=>{
    test.setTimeout(150000);await page.setViewportSize(viewport);
    const source=enableProtagonists(createSelectedInitialState());
    // All test devices have completed enrolment; production keeps separate academic progress.
    source.protagonists!.inactive.academics=structuredClone(source.academics);
    source.protagonists!.third.academics=structuredClone(source.academics);
    const fixture=await withArtPhone(page,source);
    const screenshots:string[]=[];
    const qaDirectory=process.env.PHONE_VISUALS_QA_DIR || 'outputs/emma-phone-qa';
    mkdirSync(qaDirectory,{recursive:true});
    const prefix=`${qaDirectory}/${viewport.width}x${viewport.height}`;
    const shot=async(name:string)=>{
      await phone.locator('.screen').evaluate(async el=>{
        await Promise.all(el.getAnimations({subtree:true}).filter(a=>a.effect?.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));
      });
      const file=`${prefix}-${name}.png`;await page.screenshot({path:file});screenshots.push(file);
    };
    let phone=await openPhone(page);
    await expect(phone.locator('.screen')).toHaveAttribute('data-world-device','unread-city-phone-soyo');
    await expect(phone.locator('html')).toHaveAttribute('data-theme','light');
    const soyoWall=await phone.locator('.screen').evaluate(el=>(el as HTMLElement).style.getPropertyValue('--wall'));
    expect(soyoWall).toContain('data:image/svg+xml');
    await noOverflow(phone);await shot('soyo-home');
    const first=await phone.locator('.apps-grid').first().locator('[data-app]').evaluateAll(els=>els.map(el=>(el as HTMLElement).dataset.app));
    expect(first[0]).toBe('worldmessages');
    expect(await phone.locator('[data-app="appie"] .icon-tile>svg').count()).toBe(1);
    await phone.locator('[data-app="appie"]').first().click();
    await expect(phone.locator('.world-card')).toHaveCount(3);
    await expect(phone.locator('.world-card').first()).toContainText('长崎素世');
    await expect(phone.locator('.world-card-art').first()).toHaveCSS('background-image',/data:image\/svg\+xml/);
    await phone.locator('.world-card').last().scrollIntoViewIfNeeded();await shot('soyo-wallet');await noOverflow(phone);
    await home(phone);await phone.locator('[data-app="worldstyle"]').first().click();
    await phone.locator('[data-world-field="layout"]').selectOption('focus');
    await phone.locator('[data-world-field="wallpaper"]').selectOption('plain');
    await phone.locator('[data-world-field="theme"]').selectOption('dark');
    await phone.getByRole('button',{name:'保存外观',exact:true}).click();
    await expect(phone.locator('.screen')).toHaveAttribute('data-world-layout','focus');
    await expect(phone.locator('html')).toHaveAttribute('data-theme','dark');
    await page.getByRole('button',{name:'关闭手机窗口',exact:true}).click();
    await page.locator('[data-protagonist-select]').selectOption('sakiko');
    phone=await openPhone(page);
    await expect(phone.locator('.screen')).toHaveAttribute('data-world-device','unread-city-phone-sakiko');
    await expect(phone.locator('.screen')).toHaveAttribute('data-world-layout','daily');
    await expect(phone.locator('html')).toHaveAttribute('data-theme','dark');
    const sakikoWall=await phone.locator('.screen').evaluate(el=>(el as HTMLElement).style.getPropertyValue('--wall'));
    expect(sakikoWall).not.toBe(soyoWall);expect(sakikoWall).toContain('data:image/svg+xml');
    await noOverflow(phone);await shot('sakiko-home');
    await phone.locator('[data-app="appie"]').first().click();
    await expect(phone.locator('.world-card').first()).toContainText('丰川祥子');
    await expect(phone.locator('.world-card').first()).toHaveAttribute('data-card-owner','sakiko');
    await phone.locator('.world-card').last().scrollIntoViewIfNeeded();await shot('sakiko-wallet');
    await home(phone);await phone.locator('[data-system="control"]').first().click();
    await phone.locator('[data-theme="light"]').click();
    await expect(phone.locator('html')).toHaveAttribute('data-theme','light');
    await home(phone);
    await page.getByRole('button',{name:'关闭手机窗口',exact:true}).click();
    await page.locator('[data-protagonist-select]').selectOption('emma');
    phone=await openPhone(page);
    await expect(phone.locator('.screen')).toHaveAttribute('data-world-device','unread-city-phone-emma');
    await expect(phone.locator('html')).toHaveAttribute('data-theme','dark');
    await expect(phone.locator('html')).toHaveCSS('--bg','#0c0d12');
    const emmaWall=await phone.locator('.screen').evaluate(el=>(el as HTMLElement).style.getPropertyValue('--wall'));
    expect(emmaWall).toContain('data:image/svg+xml');expect(emmaWall).not.toBe(sakikoWall);
    for(const app of ['worldmessages','worldcalendar','twiitch','gallery','notes','worldshop','appie','worlddelivery','worldstyle','chat','music','peek','settings']) {
      const icon=phone.locator(`.app-icon[data-app="${app}"] .icon-tile>svg`).first();
      await expect(icon).toBeVisible();
      expect(await icon.innerHTML()).toContain('#f3b7ce');
      expect(await icon.innerHTML()).toContain('#79b8ef');
    }
    await noOverflow(phone);await shot('emma-home');
    await phone.locator('[data-app="appie"]').first().click();
    await expect(phone.locator('.world-card')).toHaveCount(3);
    await expect(phone.locator('.world-card').first()).toContainText('樱羽艾玛');
    await expect(phone.locator('.world-card').first()).toContainText('0303');
    await expect(phone.locator('.world-card').first()).toHaveAttribute('data-card-owner','emma');
    await expect(phone.locator('.world-card-art').first()).toHaveCSS('background-image',/data:image\/svg\+xml/);
    await shot('emma-wallet-top');
    await phone.locator('.world-card').last().scrollIntoViewIfNeeded();
    await expect(phone.locator('.world-card').last()).toBeInViewport();
    await noOverflow(phone);await shot('emma-wallet-scrolled');
    await home(phone);await phone.locator('[data-app="worldmessages"]').first().click();
    await expect(phone.locator('.view[data-app="worldmessages"] .world-device-header')).toContainText('樱羽艾玛的手机');
    await noOverflow(phone);await shot('emma-messages');
    await home(phone);await phone.locator('[data-app="worldstyle"]').first().click();
    await shot('emma-appearance');
    await phone.locator('[data-world-field="layout"]').selectOption('focus');
    await phone.locator('[data-world-field="wallpaper"]').selectOption('plain');
    await phone.locator('[data-world-field="theme"]').selectOption('light');
    await phone.getByRole('button',{name:'保存外观',exact:true}).click();
    await expect(phone.locator('html')).toHaveAttribute('data-theme','light');
    await expect(phone.locator('html')).toHaveCSS('--bg','#f8f3f5');
    await shot('emma-appearance-light');
    await home(phone);
    await expect(phone.locator('.screen')).toHaveCSS('--wall','#0c0d12');
    await noOverflow(phone);await shot('emma-plain');
    await page.getByRole('button',{name:'关闭手机窗口',exact:true}).click();
    await page.locator('[data-protagonist-select]').selectOption('soyo');
    phone=await openPhone(page);
    await expect(phone.locator('.screen')).toHaveAttribute('data-world-layout','focus');
    await expect(phone.locator('.screen')).toHaveAttribute('data-world-wallpaper','plain');
    await expect(phone.locator('html')).toHaveAttribute('data-theme','dark');
    await shot('soyo-restored');
    await page.getByRole('button',{name:'关闭手机窗口',exact:true}).click();
    await page.locator('[data-protagonist-select]').selectOption('sakiko');
    phone=await openPhone(page);
    await expect(phone.locator('html')).toHaveAttribute('data-theme','light');
    await expect(phone.locator('html')).toHaveAttribute('data-world-owner','sakiko');
    await expect(phone.locator('html')).toHaveCSS('--bg','#f3f8ff');
    await page.getByRole('button',{name:'关闭手机窗口',exact:true}).click();
    await page.locator('[data-protagonist-select]').selectOption('emma');
    phone=await openPhone(page);
    await expect(phone.locator('.screen')).toHaveAttribute('data-world-layout','focus');
    await expect(phone.locator('.screen')).toHaveAttribute('data-world-wallpaper','plain');
    await expect(phone.locator('html')).toHaveAttribute('data-theme','light');
    await shot('emma-restored');
    const saved=await fixture.helper.evaluate(()=>(window as unknown as {fixtureRead():unknown}).fixtureRead());
    expect(fixture.modelRequests).toEqual([]);expect(fixture.extensionResources).toEqual([]);expect(fixture.errors).toEqual([]);
    expect(await page.locator('script[data-unread-city-embedded-phone]').count()).toBe(1);
    writeFileSync(`${prefix}.json`,JSON.stringify({viewport,screenshots,saved,modelRequests:fixture.modelRequests,errors:fixture.errors,physicalIPhoneTested:false},null,2));
  });
}
