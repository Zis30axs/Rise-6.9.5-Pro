// Controlled viewport signals in a real browser; not a physical keyboard test.
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createServer} from 'vite';
import {chromium} from 'playwright';
const root=resolve(import.meta.dirname,'..');
const option=process.argv.indexOf('--phone-source');
const phoneRoot=resolve(option<0?resolve(root,'../ST-iPhonie'):process.argv[option+1]);
const output=resolve(root,'outputs/keyboard-layout');mkdirSync(output,{recursive:true});
const expectedFailure=process.argv.includes('--expect-bug');
const server=await createServer({root,server:{host:'127.0.0.1',port:5188,strictPort:true},plugins:[{
 name:'keyboard-phone-host',resolveId(id){if(id==='virtual:keyboard-phone-host')return '\0keyboard-phone-host';},
 load(id){if(id==='\0keyboard-phone-host')return readFileSync(resolve(phoneRoot,'panel-host.js'),'utf8');},
}]});
await server.listen();let browser;
const report={scope:'Controlled viewport changes; real CSS, viewport lease, original phone host and spatial phone renderer. No Agent Edition, real LLM or physical Tauri device.',cases:[],errors:[],externalRequests:[]};
try{
 browser=await chromium.launch({channel:'msedge',headless:true});
 for(const [width,height] of [[390,844],[320,568],[844,390],[1024,768]])for(const target of ['novel','phone','phone-expanded'])for(const layoutResize of [false,true]){
  const smaller=Math.max(180,height-260);
  const page=await browser.newPage({viewport:{width,height},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  page.on('pageerror',error=>report.errors.push(error.message));
  page.on('request',request=>{if(!/^(http:\/\/127\.0\.0\.1:5188\/|blob:|data:|about:)/.test(request.url()))report.externalRequests.push(request.url());});
  await page.goto('http://127.0.0.1:5188/tests/e2e/keyboard-layout.html');
  await page.waitForFunction(()=>!!window.keyboardFixture);
  if(target!=='novel')await page.evaluate(expanded=>window.keyboardFixture.phone(expanded),target==='phone-expanded');
  await page.waitForTimeout(100);
  const before=await page.evaluate(()=>window.keyboardFixture.metrics());
  if(target==='novel')await page.locator('.composer textarea').focus();
  else await page.frameLocator('#sttts-panel iframe').locator('textarea').focus();
  if(layoutResize)await page.setViewportSize({width,height:smaller});
  await page.evaluate(({width,smaller})=>window.keyboardFixture.visual({width,height:smaller,offsetTop:55}),{width,smaller});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.waitForTimeout(300);
  const after=await page.evaluate(()=>window.keyboardFixture.metrics());
  const key=target==='novel'?'input':'phone';
  const same=(a,b)=>['root','chrome','dock','portrait','live2d','pairedPortraits','fixed',key].every(part=>['left','top','width','height'].every(k=>Math.abs(a[part][k]-b[part][k])<1))&&a.scale===b.scale;
  const stable=same(before,after);
  await page.screenshot({path:resolve(output,`${expectedFailure?'before':'after'}-${width}-${target}-${layoutResize?'layout':'visual'}.png`)});
  await page.evaluate(()=>window.keyboardFixture.blur());
  await page.evaluate(({width,smaller})=>window.keyboardFixture.visual({width,height:smaller+20,offsetTop:20}),{width,smaller});
  await page.waitForTimeout(100);
  const closing=await page.evaluate(()=>window.keyboardFixture.metrics());
  await page.setViewportSize({width,height});
  await page.evaluate(({width,height})=>window.keyboardFixture.visual({width,height,offsetTop:0}),{width,height});
  await page.waitForTimeout(150);
  const restored=await page.evaluate(()=>window.keyboardFixture.metrics());
  const recovered=same(before,restored)&&restored.draft===before.draft&&restored.phoneDraft===before.phoneDraft;
  const heldThroughBlur=same(before,closing);
  await page.evaluate(()=>window.keyboardFixture.dispose());
  await page.locator('#native').fill('native input restored');
  const nativeRestored=await page.locator('#native').inputValue()==='native input restored';
  report.cases.push({width,height,target,layoutResize,stable,heldThroughBlur,recovered,nativeRestored,before,after});
  await page.close();
 }
 const all=report.cases.every(c=>c.stable&&c.heldThroughBlur&&c.recovered&&c.nativeRestored),none=report.cases.filter(c=>!c.stable).length>=report.cases.length*.8;
 writeFileSync(resolve(output,expectedFailure?'reproduction.json':'browser.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({cases:report.cases.length,stable:report.cases.filter(c=>c.stable).length,errors:report.errors,externalRequests:report.externalRequests}));
 if(report.errors.length||report.externalRequests.length||!(expectedFailure?none:all))process.exitCode=1;
}finally{await browser?.close();await server.close();}
