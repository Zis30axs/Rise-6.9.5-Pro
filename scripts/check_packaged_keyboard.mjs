// Final Lite IIFE and embedded phone; deterministic host, no model or hardware.
import {mkdirSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createServer} from 'vite';
import {chromium} from 'playwright';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'outputs/keyboard-layout');
mkdirSync(output, {recursive:true});
const origin = 'http://127.0.0.1:5189';
const server = await createServer({root, optimizeDeps:{entries:['tests/e2e/band-entry.html']}, server:{host:'127.0.0.1',port:5189,strictPort:true,watch:{ignored:['**/outputs/**']}}});
await server.listen();
let browser, currentPage;
const report = {scope:'Production Lite IIFE and embedded phone on a fixture Tavern host; simulated keyboard viewport events, not physical TauriTavern. Phone close uses DOM click because the existing optional Live2D installer overlaps the desktop close control.',cases:[],errors:[],blockedRequests:[]};
const metrics = () => {
  const root=document.querySelector('[data-unread-city-root]'), shadow=root.shadowRoot;
  const frame=document.querySelector('#sttts-panel iframe');
  const rect=el=>{
    if(!el)return null;
    const r=el.getBoundingClientRect();
    return {left:r.left-visualViewport.offsetLeft,top:r.top-visualViewport.offsetTop,width:r.width,height:r.height};
  };
  return {root:rect(root),shell:rect(shadow.querySelector('.uc-shell')),chrome:rect(shadow.querySelector('.world-chrome')),dock:rect(shadow.querySelector('.tool-dock')),input:rect(shadow.querySelector('.composer textarea')),phone:rect(frame),scale:document.querySelector('#sttts-panel')?.dataset.phoneScale,modelCalls:window.bandEntryFixture.modelCalls()};
};
const same=(before,after,phone)=>['root','shell','chrome','dock',phone?'phone':'input'].every(part=>['left','top','width','height'].every(key=>Math.abs(before[part][key]-after[part][key])<1)) && (!phone || before.scale===after.scale);
try {
  browser=await chromium.launch({channel:'msedge',headless:true});
  for(const [width,height] of [[390,844],[320,568],[1440,900]]) {
    const page=await browser.newPage({viewport:{width,height},hasTouch:true,isMobile:width<760,reducedMotion:'reduce'});
    page.setDefaultTimeout(20000);
    currentPage=page;
    page.on('pageerror',error=>report.errors.push(error.message));
    await page.route('**/*',route=>{
      const url=new URL(route.request().url());
      if(url.protocol==='http:' && url.origin===origin) {
        if(url.pathname.includes('/api/')) {report.blockedRequests.push(url.href);return route.abort();}
        if(url.pathname.endsWith('/unread-city-lite-assets.zip'))return route.continue({url:origin+'/dist/unread-city-lite-assets.zip'});
        if(url.pathname==='/scripts/personas.js')return route.fulfill({contentType:'text/javascript',body:'export let user_avatar = "";'});
        if(url.pathname==='/scripts/extensions/regex/engine.js')return route.fulfill({contentType:'text/javascript',body:'export const regex_placement={}; export const getRegexedString=value=>value;'});
        return route.continue();
      }
      if(['blob:','data:','about:'].includes(url.protocol))return route.continue();
      report.blockedRequests.push(url.href);return route.abort();
    });
    await page.addInitScript(()=>{
      // Only the host viewport changes; the phone iframe retains its own size.
      if(window!==window.top)return;
      const viewport=Object.assign(new EventTarget(),{width:innerWidth,height:innerHeight,offsetTop:0,offsetLeft:0,scale:1});
      Object.defineProperty(window,'visualViewport',{configurable:true,value:viewport});
      window.keyboardVisual=next=>{Object.assign(viewport,next);viewport.dispatchEvent(new Event('resize'));viewport.dispatchEvent(new Event('scroll'));window.dispatchEvent(new Event('resize'));};
    });
    await page.goto(origin+'/tests/e2e/band-entry.html');
    const install=page.locator('#unread-city-lite-import');
    await install.waitFor({timeout:30000});
    const chooserPromise=page.waitForEvent('filechooser');
    await install.click();
    await (await chooserPromise).setFiles(resolve(root,'dist/unread-city-lite-assets.zip'));
    await page.waitForFunction(()=>document.querySelector('#unread-city-lite-import')?.textContent.includes('已安装'),{},{timeout:60000});
    await page.reload();
    await page.locator('.uc-shell').waitFor({timeout:90000});
    for(const target of ['novel','phone','phone-expanded']) {
      let input;
      if(target==='novel')input=page.locator('.composer textarea');
      else {
        await page.locator('.tool-dock .phone-launcher').click();
        if(target==='phone')await page.locator('.phone-size-toggle').click();
        const phone=page.frameLocator('#sttts-panel iframe');
        // Closing/reopening the real phone preserves its current message thread.
        if(!await phone.locator('.uc-thread').isVisible()) {
          await phone.locator('button[data-app="worldmessages"]').click();
          await phone.locator('[data-action="open-thread"]').first().click();
        }
        input=phone.locator('.uc-thread textarea');
      }
      await input.waitFor();
      await page.waitForTimeout(350);
      const before=await page.evaluate(metrics);
      const draft='Keyboard layout regression draft';
      await input.fill(draft);
      const smaller=Math.max(180,height-260);
      await page.setViewportSize({width,height:smaller});
      await page.evaluate(({width,smaller})=>window.keyboardVisual({width,height:smaller,offsetTop:55}),{width,smaller});
      await page.waitForTimeout(350);
      const after=await page.evaluate(metrics);
      await page.screenshot({path:resolve(output,`packaged-${width}-${target}.png`)});
      await input.evaluate(el=>el.blur());
      await page.evaluate(({width,smaller})=>window.keyboardVisual({width,height:smaller+20,offsetTop:20}),{width,smaller});
      await page.waitForTimeout(100);
      const closing=await page.evaluate(metrics);
      await page.setViewportSize({width,height});
      await page.evaluate(({width,height})=>window.keyboardVisual({width,height,offsetTop:0}),{width,height});
      await page.waitForTimeout(250);
      const restored=await page.evaluate(metrics);
      report.cases.push({width,height,target,stable:same(before,after,target!=='novel'),heldThroughBlur:same(before,closing,target!=='novel'),recovered:same(before,restored,target!=='novel'),draftPreserved:await input.inputValue()===draft,before,after});
      if(target!=='novel')await page.locator('[aria-label="关闭手机窗口"]').evaluate(button=>button.click());
    }
    await page.locator('[aria-label="切换聊天并恢复原生界面"]').click();
    await page.locator('[data-unread-city-root]').waitFor({state:'detached'});
    await page.evaluate(()=>{const input=document.createElement('textarea');input.id='native-keyboard-check';document.body.append(input);});
    await page.locator('#native-keyboard-check').fill('Native input restored');
    if(await page.locator('#native-keyboard-check').inputValue()!=='Native input restored')throw Error('Native input did not recover');
    await page.close();
  }
  const passed=report.cases.every(c=>c.stable&&c.heldThroughBlur&&c.recovered&&c.draftPreserved&&c.after.modelCalls===0);
  console.log(JSON.stringify({cases:report.cases.length,passed,errors:report.errors,blockedRequests:report.blockedRequests}));
  if(!passed||report.errors.length||report.blockedRequests.length)process.exitCode=1;
} catch(error) {
  if(currentPage&&!currentPage.isClosed()) {
    await currentPage.screenshot({path:resolve(output,'packaged-failure.png')});
    console.error((await currentPage.locator('body').innerText()).slice(0,4000));
  }
  report.errors.push(String(error));console.error(error);process.exitCode=1;
} finally {
  writeFileSync(resolve(output,'packaged-browser.json'),JSON.stringify(report,null,2));
  await browser?.close();await server.close();
}
