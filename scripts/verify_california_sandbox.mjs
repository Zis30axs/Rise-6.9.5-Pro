// Local component verification only: no Agent Edition, CI, phone, LLM or real save writes.
import {build} from 'vite';
import vue from '@vitejs/plugin-vue';
import {chromium} from '@playwright/test';
import {createServer} from 'node:http';
import {existsSync} from 'node:fs';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));process.chdir(root);
const temp='.vite/california-preview';const out='outputs/california-sandbox-20261113';
await mkdir(temp,{recursive:true});await mkdir(out,{recursive:true});
await writeFile(`${temp}/main.ts`,"import {createApp,defineComponent,h,ref} from 'vue';\nimport CaliforniaSandbox from '../../src/frontend/CaliforniaSandbox.vue';\nimport {californiaPlaces,internationalConnections} from '../../src/runtime/california';\nimport css from '../../src/frontend/shell.css?inline';\nconst host = document.getElementById('app')!;\nconst shadow=host.attachShadow({mode:'open'});\nconst style=document.createElement('style');style.textContent=css;shadow.append(style);\nconst target=document.createElement('div');target.className='uc-shell';target.style.cssText='box-sizing:border-box;height:auto;min-height:100vh;overflow:visible;padding:12px;';shadow.append(target);\nconst app=createApp(defineComponent({setup(){const locationId=ref('sfo-airport');return()=>h(CaliforniaSandbox,{locationId:locationId.value,places:californiaPlaces,routes:internationalConnections(locationId.value),onTravel:(id:string)=>{locationId.value=id;}})}}));\napp.mount(target);\n(window as any).californiaPreview={unmount:()=>app.unmount()};\n");
await build({configFile:false,define:{'process.env.NODE_ENV':JSON.stringify('production')},plugins:[vue()],assetsInclude:['**/*.glb'],build:{outDir:'.vite/california-production',emptyOutDir:true,lib:{entry:`${temp}/main.ts`,name:'CaliforniaPreview',formats:['iife'],fileName:()=> 'preview.js'}}});
const bundle=await readFile('.vite/california-production/preview.js');
const html='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>加州沙盘组件验收</title><style>body{margin:0;background:#172e30}</style><div id="app"></div><script src="/preview.js"></script></html>';
const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/preview.js'?'text/javascript; charset=utf-8':'text/html; charset=utf-8');res.end(req.url==='/preview.js'?bundle:html);});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const baseUrl=`http://127.0.0.1:${server.address().port}/`;
let browser;
try {
browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const results=[];
for(const [width,height] of [[1440,900],[1280,800],[390,844],[320,568]]){
 const page=await browser.newPage({viewport:{width,height}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(baseUrl,{waitUntil:'load'});
 await page.locator('[data-renderer="webgl"]').waitFor({timeout:30000});
 await page.screenshot({path:`${out}/${width}x${height}-map.png`,fullPage:true});
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
 const oldWidth=await page.locator('canvas.routes').evaluate(c=>c.width);
 await page.getByRole('button',{name:'全州',exact:true}).click();
 await page.getByRole('button',{name:'旋转地图',exact:true}).click();
 await page.getByRole('button',{name:'放大',exact:true}).click();
 await page.getByRole('button',{name:'地点近景',exact:true}).click();
 await page.locator('.ca-place-list [data-ca-place="california-openai"]').click();
 await page.locator('[data-ca-travel]').click();
 await page.getByText('当前位置 · OpenAI 办公地点',{exact:true}).waitFor();
 const list=page.locator('.ca-place-list');await list.evaluate(el=>el.scrollTop=el.scrollHeight);
 const sight=list.getByRole('button').filter({hasText:'Apple Park'}).first();await sight.click();
 const sightPanel=await page.locator('.ca-place-panel').innerText();
 if(!sightPanel.includes('Apple Park'))throw Error('Sight selection failed');
 await page.locator('.ca-place-list [data-ca-place="california-openai"]').click();
 if(await page.locator('[data-ca-travel]').count())throw Error('Travel shown for current location');
 await page.locator('.ca-place-panel').scrollIntoViewIfNeeded();
 await page.screenshot({path:`${out}/${width}x${height}-details.png`,fullPage:false});
 if(width===1440){
  await page.locator('canvas.terrain').evaluate(c=>{const ext=c.getContext('webgl').getExtension('WEBGL_lose_context');window.__restoreCalifornia=()=>ext.restoreContext();ext.loseContext();});
  await page.locator('[data-renderer="canvas"]').waitFor();
  await page.screenshot({path:`${out}/canvas-fallback.png`,fullPage:true});
  await page.evaluate(()=>window.__restoreCalifornia());
  await page.locator('[data-renderer="webgl"]').waitFor();
 }
 const scope=await page.getByRole('button',{name:'湾区',exact:true}).getAttribute('aria-pressed');
 if(scope!=='true')throw Error('Sight exit did not restore selection scope');
 await list.getByRole('button').filter({hasText:'Apple Park'}).first().click();
 await page.locator('.ca-place-list [data-ca-place="haneda-airport"]').click();
 if(await page.locator('.pin.selected').count())throw Error('Off-atlas selection left stale marker');
 if(await page.getByRole('button',{name:'全州',exact:true}).getAttribute('aria-pressed')!=='true')throw Error('Off-atlas selection retained sight close-up');
 const text=await page.locator('.ca-sandbox').innerText();
 if(/离线演示|SELECTED LOCATION|平行时钟|LLM|MVU/.test(text))throw Error('Engineering prose visible');
 await page.evaluate(()=>window.californiaPreview.unmount());
 const remaining=await page.locator('canvas').count();
 results.push({width,height,renderer:'webgl',canvasWidth:oldWidth,overflow,errors,controls:true,previewTravelEvent:true,propArrival:true,sightExit:true,remainingCanvases:remaining});
 if(overflow||errors.length||remaining)throw Error(JSON.stringify(results.at(-1)));
 await page.close();
}
await writeFile(`${out}/verification.json`,JSON.stringify({date:'2026-11-13',scope:'Built CaliforniaSandbox component IIFE inside Shadow DOM; real runtime route catalog, test host handles travel emit; no full game, LLM, phone or Tauri verification.',fallbackAndContextRestore:true,offAtlasSelection:true,results},null,2)+'\n');
console.log(JSON.stringify(results));
} finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
