// Controlled local fixture only. No Agent Edition, Tavern server or LLM calls.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';
const root=resolve(import.meta.dirname,'..'), output=resolve(root,'outputs/live2d-ensemble/browser');
mkdirSync(output,{recursive:true});
const descriptor=JSON.parse(readFileSync(resolve(root,'assets/live2d-ensemble/pack.json'),'utf8'));
const core=readFileSync(resolve(root,'scripts/lite_asset_loader.js'),'utf8').replace('__UC_LITE_ASSET_LIST__','[]').replace('__UC_LITE_PACK_DIGEST__','"test"');
const optional=readFileSync(resolve(root,'scripts/live2d_asset_loader.js'),'utf8').replace('__UC_LIVE2D_DESCRIPTOR__',JSON.stringify(descriptor));
const shared=core.slice(core.indexOf('function __ucLiteRequest'),core.indexOf('async function __ucPackImport'));
const hostScript=`(function(){${shared}\n${optional}\n})();`;
const loader=`(function(){let host=window;try{if(window.parent.document.body)host=window.parent;}catch{}
  if(host.__UC_LIVE2D__?.status().pack!==${JSON.stringify(descriptor.sha)}){const script=host.document.createElement('script');script.textContent=${JSON.stringify(hostScript)};(host.document.head||host.document.body).append(script);script.remove();}
  globalThis.__UC_LIVE2D__=host.__UC_LIVE2D__;
  void globalThis.__UC_LIVE2D__.restore();})();`;
const server=await createServer({root,server:{host:'127.0.0.1',port:5186,strictPort:true}});await server.listen();
let browser;const report={models:[],checks:[],externalRequests:[],errors:[]};
function assert(condition,message){if(!condition)throw Error(message);report.checks.push(message);}
try{
  browser=await chromium.launch({channel:'msedge',headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  page.on('request',request=>{if(!/^(http:\/\/127\.0\.0\.1:5186\/|blob:|data:)/.test(request.url()))report.externalRequests.push(request.url());});
  page.on('pageerror',error=>report.errors.push(error.message));
  page.on('console',message=>{if(message.type()==='warning'||message.type()==='error')console.log(message.text());});
  // The packaged loader publishes its API before mounting the card.
  await page.addInitScript({content:`if (window === window.top) { ${hostScript} void window.__UC_LIVE2D__.restore(); }`});
  await page.goto('http://127.0.0.1:5186/tests/e2e/live2d-ensemble.html');
  await page.waitForFunction(()=>!!window.live2dFixture);
  await page.locator('[data-original-fallback]').waitFor();
  assert(await page.locator('[data-original-fallback]').count()===1,'uninstalled fallback');
  assert(await page.evaluate(()=>window.live2dFixture.prompt())==='','uninstalled prompt unchanged');
  const panel = page.getByRole('region', {name:'Live2D 素材'});
  const fileInput = panel.locator('input[type=file]');
  const settings = open => page.evaluate(value => window.live2dFixture.settings(value), open);
  const noInstaller = async () => {
    assert(await page.locator('#unread-city-live2d-import').count() === 0, 'no floating installer on the host');
    assert(await panel.count() === 0, 'settings controls unmounted');
    assert(await page.getByRole('button', {name:/Live2D 素材 ZIP/}).count() === 0, 'no installer outside settings');
  };
  const packFile = resolve(root, 'assets/live2d-ensemble/unread-city-live2d.zip');
  await noInstaller();
  await settings(true);
  const chooser = page.waitForEvent('filechooser');
  await panel.getByRole('button', {name:'安装 Live2D 素材 ZIP'}).click();
  await (await chooser).setFiles(packFile);
  await panel.getByRole('status').filter({hasText:'正在安装'}).waitFor();
  await settings(false);
  await noInstaller();
  await settings(true);
  assert(await panel.getByRole('button', {name:'安装 Live2D 素材 ZIP'}).isDisabled(), 're-entering settings keeps an active install locked');
  await page.waitForFunction(()=>window.__UC_LIVE2D__?.status().enabled,{},{timeout:180000});
  await settings(false);
  await noInstaller();
  await page.evaluate(()=>window.live2dFixture.refresh());
  await page.waitForSelector('[data-live2d-status="ready"]',{timeout:30000});
  assert(await page.evaluate(()=>window.live2dFixture.prompt().includes('【初始 Live2D 衣着】')),'loaded portrait confirms narrative');
  await page.screenshot({path:resolve(output,'desktop-single.png')});
  await page.evaluate(()=>window.live2dFixture.paired(true));
  await page.waitForFunction(()=>document.querySelectorAll('[data-live2d-status="ready"]').length===2);
  await page.waitForTimeout(150);
  await page.screenshot({path:resolve(output,'desktop-paired.png')});
  for(const width of [390,320]){
    await page.setViewportSize({width,height:width===390?844:568});
    await page.waitForTimeout(150);
    await page.screenshot({path:resolve(output,`mobile-${width}-paired.png`)});
    await settings(true);
    for (const button of await panel.getByRole('button').all()) {
      const rect = await button.boundingBox();
      assert(rect && rect.x >= 0 && rect.x + rect.width <= width, `settings controls fit ${width}`);
    }
    await settings(false);
  }
  await page.evaluate(()=>window.live2dFixture.visible(false));
  const ids=await page.evaluate(()=>window.__UC_LIVE2D__.status().models.map(row=>row.id));
  for(const id of ids){
    const result=await page.evaluate(id=>window.live2dFixture.render(id),id);
    if(result.opaque<1000)throw Error(`Empty rendered model: ${id}`);
    writeFileSync(resolve(output,`${id}.png`),Buffer.from(result.png.split(',')[1],'base64'));
    report.models.push({id,person:result.person,rendered:true,opaquePixels:result.opaque});
    console.log(`rendered ${report.models.length}/${ids.length} ${id}`);
  }
  assert(report.models.length===94,'all 94 real models loaded and rendered');
  // Reentry verifies real IndexedDB data, without another ZIP selection.
  await page.reload();await page.waitForFunction(()=>!!window.live2dFixture);
  await page.waitForFunction(()=>window.__UC_LIVE2D__?.status().enabled,{},{timeout:180000});
  await page.evaluate(()=>window.live2dFixture.refresh());await page.waitForSelector('[data-live2d-status="ready"]');
  assert(await page.evaluate(()=>window.__UC_LIVE2D__.status().models.length)===94,'installed pack survives reload');
  await settings(true);
  await panel.getByRole('button', {name:'停用'}).click();
  await panel.getByRole('button', {name:'启用'}).waitFor();
  await settings(false);
  await page.evaluate(()=>window.live2dFixture.refresh());
  assert(await page.evaluate(()=>window.live2dFixture.prompt())==='','disable stops prompt');
  await page.waitForSelector('[data-original-fallback]');
  await settings(true);
  await panel.getByRole('button', {name:'启用'}).click();
  await panel.getByRole('button', {name:'停用'}).waitFor();
  await settings(false);
  await page.evaluate(()=>window.live2dFixture.refresh());
  await page.waitForSelector('[data-live2d-status="ready"]');
  // Corrupt one compressed entry; the previous manifest must stay activated.
  await settings(true);
  const bad=Buffer.from(readFileSync(resolve(root,'assets/live2d-ensemble/unread-city-live2d.zip')));bad[bad.length-300000]^=0xff;
  writeFileSync(resolve(output,'broken.zip'),bad);
  await fileInput.setInputFiles(resolve(output,'broken.zip'));
  await panel.getByRole('status').filter({hasText:'未完成，请重试'}).waitFor({timeout:180000});
  assert(await page.evaluate(()=>window.__UC_LIVE2D__.status().enabled),'corrupt update keeps old activation');
  // A missing directory member must fail before activation as well.
  const missing=Buffer.from(readFileSync(resolve(root,'assets/live2d-ensemble/unread-city-live2d.zip')));
  const end=missing.length-22;missing.writeUInt16LE(missing.readUInt16LE(end+8)-1,end+8);missing.writeUInt16LE(missing.readUInt16LE(end+10)-1,end+10);
  writeFileSync(resolve(output,'missing.zip'),missing);
  await fileInput.setInputFiles(resolve(output,'missing.zip'));
  await panel.getByRole('status').filter({hasText:'未完成，请重试'}).waitFor();
  assert(await page.evaluate(()=>window.__UC_LIVE2D__.status().enabled),'missing member keeps old activation');
  await panel.getByRole('button', {name:'移除'}).click();
  await panel.getByRole('button', {name:'安装 Live2D 素材 ZIP'}).waitFor();
  await settings(false);
  await page.evaluate(()=>window.live2dFixture.refresh());
  await page.waitForSelector('[data-original-fallback]');assert(await page.evaluate(()=>window.live2dFixture.prompt())==='','remove restores fallback and stops prompt');
  // Boot from a disposable card script iframe, then return to the native library.
  await page.evaluate(()=>{window.live2dFixture.visible(false);delete window.__UC_LIVE2D__;const frame=document.createElement('iframe');frame.id='script-frame';document.body.append(frame);});
  const frame=page.frames().find(frame=>frame!==page.mainFrame());await frame.addScriptTag({content:loader});
  await page.evaluate(()=>document.querySelector('#script-frame').remove());
  await noInstaller();
  await settings(true);
  await fileInput.setInputFiles(packFile);
  await panel.getByRole('button', {name:'更换 Live2D 素材 ZIP'}).waitFor({timeout:180000});
  await page.screenshot({path:resolve(output,'settings-install-320.png')});
  await settings(false);
  await noInstaller();
  assert(report.externalRequests.length===0,'no external requests');assert(report.errors.length===0,'no uncaught page errors');
}catch(error){report.failure=String(error);throw error;}finally{
  writeFileSync(resolve(output,'verification.json'),JSON.stringify(report,null,2)+'\n');
  await browser?.close();await server.close();
}
