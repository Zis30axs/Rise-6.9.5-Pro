import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { withArtPhone } from './downtown-art-fixture';
import { createSelectedInitialState } from './academics-fixture';
import { enableProtagonists } from '../../src/runtime/protagonist-world';

test.use({hasTouch:true});
const viewports = [{width:1440,height:900},{width:1280,height:800},{width:390,height:844},{width:320,height:568}];
const panel = (page:Page) => page.locator('#sttts-panel');
async function open(page:Page) {
  await page.getByRole('button',{name:'手机',exact:true}).click();
  await expect(panel(page)).toHaveAttribute('data-phone-opening','false',{timeout:20000});
  return page.frameLocator('#sttts-panel iframe');
}
for (const viewport of viewports) test(`${viewport.width}x${viewport.height} 3D case, gestures and live screen`,async({page})=>{
  test.setTimeout(150000); await page.setViewportSize(viewport);
  const state = enableProtagonists(createSelectedInitialState());
  state.protagonists!.inactive.academics=structuredClone(state.academics);
  state.protagonists!.third.academics=structuredClone(state.academics);
  const fixture=await withArtPhone(page,state);
  const prefix=`outputs/phone-3d-qa/${viewport.width}x${viewport.height}`;
  mkdirSync('outputs/phone-3d-qa',{recursive:true});
  const screenshots:string[]=[];
  const shot=async(name:string)=>{const file=`${prefix}-${name}.png`;await page.screenshot({path:file});screenshots.push(file);};
  let phone=await open(page);
  const iframe=await page.locator('#sttts-panel iframe').elementHandle();
  for (const [owner,name] of [['soyo','Petal 6'],['sakiko','Nocturne Pro'],['emma','Sakura Mini']]) {
    if(owner!=='soyo') {
      await page.getByRole('button',{name:'关闭手机窗口',exact:true}).click();
      await page.locator('[data-protagonist-select]').selectOption(owner!);
      phone=await open(page);
    }
    await expect(panel(page)).toHaveAttribute('data-uc-spatial-phone',owner!);
    await expect(page.locator('.uc-phone-solid')).toHaveAttribute('data-phone-model',name!);
    await expect(phone.locator('.screen')).toBeVisible();
    await shot(`${owner}-front`);
    await page.getByRole('button',{name:'查看手机背面',exact:true}).click();
    await expect(panel(page)).toHaveAttribute('data-phone-yaw','180.00');
    await expect(page.locator('.uc-phone-back')).toBeVisible();
    expect(await page.locator('#sttts-panel iframe').evaluate(el=>(el as HTMLIFrameElement).inert)).toBe(true);
    await shot(`${owner}-back`);
    await page.getByRole('button',{name:'手机回正',exact:true}).click();
    await expect(panel(page)).toHaveAttribute('data-phone-yaw','0.00');
    expect(await iframe!.evaluate(el=>el===document.querySelector('#sttts-panel iframe'))).toBe(true);
  }
  // A real mouse long press on the live screen rotates the hull and consumes its click.
  const screenBox=(await phone.locator('.home-clock').boundingBox())!;
  await page.mouse.move(screenBox.x+screenBox.width/2,screenBox.y+screenBox.height/2);
  await page.mouse.down(); await page.waitForTimeout(500);
  await expect(panel(page)).toHaveAttribute('data-phone-gesture','rotate');
  await page.mouse.move(screenBox.x+screenBox.width/2+70,screenBox.y+screenBox.height/2+20,{steps:8}); await page.mouse.up();
  await expect.poll(async()=>Math.abs(Number(await panel(page).getAttribute('data-phone-yaw')))).toBeGreaterThan(25);
  await shot('emma-rotated');
  await page.getByRole('button',{name:'手机回正',exact:true}).click();
  // CDP dispatches actual multi-touch input into the iframe, not synthetic DOM events.
  const cdp=await page.context().newCDPSession(page);
  const box=(await phone.locator('.screen').boundingBox())!;
  const cx=box.x+box.width/2, cy=box.y+box.height*.35;
  const fingers=(spread:number)=>[{x:cx-spread,y:cy,id:1},{x:cx+spread,y:cy,id:2}];
  const before=Number(await panel(page).getAttribute('data-phone-scale'));
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:fingers(25)});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:fingers(34)});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect.poll(async()=>Number(await panel(page).getAttribute('data-phone-scale'))).toBeGreaterThan(before);
  await shot('emma-pinched');
  await page.getByRole('button',{name:'手机回正',exact:true}).click();
  // Touch-and-hold rotation; a quick touch continues to operate the app.
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:cx,y:cy,id:3}]});
  await page.waitForTimeout(500);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:cx+45,y:cy+10,id:3}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect.poll(async()=>Math.abs(Number(await panel(page).getAttribute('data-phone-yaw')))).toBeGreaterThan(20);
  await page.getByRole('button',{name:'手机回正',exact:true}).click();
  await page.waitForTimeout(550);
  await phone.locator('.app-icon[data-app="notes"]').first().tap();
  await phone.getByRole('button',{name:'新增备忘录',exact:true}).tap();
  const draft=phone.locator('textarea[data-field="text"]');
  await expect(draft).toBeVisible(); await draft.fill('旋转、缩放和关开手机后保留的草稿。');
  await page.getByRole('button',{name:'查看手机背面',exact:true}).click();
  await page.getByRole('button',{name:'手机回正',exact:true}).click();
  await expect(draft).toHaveValue('旋转、缩放和关开手机后保留的草稿。');
  await page.getByRole('button',{name:'关闭手机窗口',exact:true}).click();
  await expect(page.locator('.uc-phone-solid')).toHaveCount(0);
  phone=await open(page); await expect(draft).toHaveValue('旋转、缩放和关开手机后保留的草稿。');
  expect(await iframe!.evaluate(el=>el===document.querySelector('#sttts-panel iframe'))).toBe(true);
  await phone.locator('body').evaluate(()=> (window as unknown as {stTtsPhone:{home(immediate:boolean):void}}).stTtsPhone.home(true));
  await phone.locator('.app-icon[data-app="appie"]').first().tap();
  const wallet=phone.locator('.view[data-app="appie"]');
  await expect(wallet).toBeVisible();
  const walletBox=(await wallet.boundingBox())!;
  const swipeX=walletBox.x+walletBox.width*.5, swipeY=walletBox.y+walletBox.height*.8;
  const scrollBefore=await wallet.evaluate(el=>el.scrollTop);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:swipeX,y:swipeY,id:4}]});
  for(let i=1;i<=6;i++) await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:swipeX,y:swipeY-walletBox.height*.45*i/6,id:4}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect.poll(()=>wallet.evaluate(el=>el.scrollTop)).toBeGreaterThan(scrollBefore+20);
  await expect(panel(page)).toHaveAttribute('data-phone-yaw','0.00');
  await phone.locator('.world-card').last().scrollIntoViewIfNeeded();
  await expect(phone.locator('.world-card').last()).toBeInViewport();
  await shot('emma-wallet-scroll');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  const close=page.getByRole('button',{name:'关闭手机窗口',exact:true}); await expect(close).toBeInViewport(); await close.click();
  await fixture.helper.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
  await expect(page.locator('.uc-phone-solid')).toHaveCount(0);
  expect(fixture.errors).toEqual([]);expect(fixture.modelRequests).toEqual([]);
  writeFileSync(`${prefix}.json`,JSON.stringify({viewport,status:'passed',screenshots,realMultiTouch:true,touchScroll:true,iframePreserved:true,errors:fixture.errors,physicalIPhoneTested:false},null,2));
});

test('continuous rotation across the back face, opening animation and reduced motion',async({page})=>{
  test.setTimeout(90000);await page.setViewportSize({width:390,height:844});
  const fixture=await withArtPhone(page);
  const phone=await open(page);
  const clockBox=(await phone.locator('.home-clock').boundingBox())!;
  const x=clockBox.x+clockBox.width/2,y=clockBox.y+clockBox.height/2;
  await page.mouse.move(x,y);await page.mouse.down();await page.waitForTimeout(500);
  await page.mouse.move(x-175,y+5,{steps:18});await page.mouse.up();
  await expect.poll(async()=>Number(await panel(page).getAttribute('data-phone-yaw'))).toBeLessThan(-95);
  expect(await page.locator('#sttts-panel iframe').evaluate(el=>(el as HTMLIFrameElement).inert)).toBe(true);
  await page.screenshot({path:'outputs/phone-3d-qa/390x844-soyo-turned.png'});
  await page.getByRole('button',{name:'查看手机背面',exact:true}).click();
  const back=(await page.locator('.uc-phone-back').boundingBox())!;
  await page.mouse.move(back.x+back.width/2,back.y+back.height/2);await page.mouse.down();await page.waitForTimeout(500);
  await page.mouse.move(back.x+back.width/2+65,back.y+back.height/2,{steps:8});await page.mouse.up();
  await expect.poll(async()=>Number(await panel(page).getAttribute('data-phone-yaw'))).toBeLessThan(-100);
  await page.screenshot({path:'outputs/phone-3d-qa/390x844-soyo-back-angled.png'});
  await page.getByRole('button',{name:'关闭手机窗口',exact:true}).click();
  await page.getByRole('button',{name:'手机',exact:true}).click();
  await expect(panel(page)).toHaveAttribute('data-phone-opening','true');
  const entry=await page.locator('.uc-phone-solid').boundingBox();
  await expect(panel(page)).toHaveAttribute('data-phone-opening','false');
  expect((await page.locator('.uc-phone-solid').boundingBox())!.width).toBeGreaterThan(entry!.width);
  await page.getByRole('button',{name:'关闭手机窗口',exact:true}).click();
  await page.emulateMedia({reducedMotion:'reduce'});await open(page);
  await expect(panel(page)).toHaveAttribute('data-phone-opening','false');
  await fixture.helper.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
  await expect(page.locator('.uc-phone-solid')).toHaveCount(0);
  expect(fixture.errors).toEqual([]);expect(fixture.modelRequests).toEqual([]);
});
