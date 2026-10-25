import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

test.use({hasTouch: true, isMobile: true});
const actualCaseCss = readFileSync('src/frontend/phone-spatial.css', 'utf8');
const dimensions = [
  {width:1440,height:900}, {width:1280,height:800},
  {width:390,height:844}, {width:320,height:568},
];
const appHtml = `<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><style>
*{box-sizing:border-box}html,body{margin:0;width:390px;height:844px;overflow:hidden}
.screen{height:100%;overflow:hidden;background:white}
.pages{width:100%;overflow-x:auto;white-space:nowrap;height:190px;background:#abc}
.page{display:inline-block;width:390px;height:190px}
.view{height:500px;overflow-y:auto;background:#fed}
.row{height:80px;border-bottom:1px solid #aaa}
</style><div class="screen"><div class="pages"><span class="page">A</span><span class="page">B</span><span class="page">C</span></div>
<div class="view">${Array.from({length:40},(_,i)=>`<div class="row">Row ${i}</div>`).join('')}</div></div></html>`;
const htmlEscape = (v: string) => v.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
function fixture(scale: number) {
  return `<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><style>
*{box-sizing:border-box}html,body{padding:0;margin:0;height:100%;overflow:hidden}
#sttts-panel{position:absolute;display:block;margin:0;padding:0;border:0;inset:0;width:100vw;height:100dvh;pointer-events:auto}
#sttts-panel > iframe{position:absolute;left:calc(50% - 195px);top:calc(50% - 422px);width:390px;height:844px;border:0;
 transform:perspective(1800px) scale(${scale}) translateZ(13px);transform-origin:50% 50%}
#sttts-panel .uc-phone-solid{left:calc(50% - 204px);top:calc(50% - 440px);width:408px;height:880px;
 transform:perspective(1800px) scale(${scale})}
${actualCaseCss}
</style><dialog id="sttts-panel" data-uc-spatial-phone="emma" data-phone-back-facing="false" open>
<iframe id="phone" srcdoc="${htmlEscape(appHtml)}"></iframe>
<div class="uc-phone-solid">
<div class="uc-phone-front" style="transform:translateZ(12px)"></div>
<div class="uc-phone-back" style="transform:rotateY(180deg) translateZ(12px)"></div>
</div></dialog></html>`;
}
async function swipe(page:Page, box: {x:number;y:number;width:number;height:number}, direction:'vertical'|'horizontal', id:number) {
  const x=box.x+box.width*.75, y=box.y+box.height*.72;
  const steps=10;
  const session=await page.context().newCDPSession(page);
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id}]});
  for(let i=1;i<=steps;i++){
    const nextX=direction==='horizontal'?x-box.width*.58*i/steps:x;
    const nextY=direction==='vertical'?y-box.height*.48*i/steps:y;
    await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:nextX,y:nextY,id}]});
    await page.waitForTimeout(24);
  }
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await session.detach();
}
for(const viewport of dimensions) test(`${viewport.width}x${viewport.height}: 3D phone passes vertical and horizontal touch swipes to iframe`,async({page})=>{
  await page.setViewportSize(viewport);
  const scale=Math.min((viewport.width-20)/408,(viewport.height-20)/880,.86);
  await page.setContent(fixture(scale));
  const front=page.locator('.uc-phone-front'), back=page.locator('.uc-phone-back');
  await expect(front).toHaveCSS('pointer-events','none');
  await expect(back).toHaveCSS('pointer-events','none');
  const app=page.frameLocator('#phone');
  const vertical=app.locator('.view'), horizontal=app.locator('.pages');
  await expect(vertical).toBeVisible();
  const vb=(await vertical.boundingBox())!;
  await swipe(page,vb,'vertical',1);
  await expect.poll(()=>vertical.evaluate(el=>el.scrollTop)).toBeGreaterThan(30);
  const hb=(await horizontal.boundingBox())!;
  await swipe(page,hb,'horizontal',2);
  await expect.poll(()=>horizontal.evaluate(el=>el.scrollLeft)).toBeGreaterThan(30);
  await page.locator('#sttts-panel').evaluate(el=>{(el as HTMLElement).dataset.phoneBackFacing='true';});
  await expect(back).toHaveCSS('pointer-events','auto');
  await expect(back).toHaveCSS('touch-action','none');
});
