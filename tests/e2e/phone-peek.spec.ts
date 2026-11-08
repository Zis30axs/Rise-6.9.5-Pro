import {test,expect} from '@playwright/test';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {mountSwitchHost} from './phone-peek-host';
const viewports=[{width:1440,height:900},{width:1280,height:800},{width:390,height:844},{width:320,height:568}];
const readState=(helper:any)=>helper.evaluate(()=>(window as any).fixtureRead());
const counts=(helper:any)=>helper.evaluate(()=>(window as any).fixtureCounts());

const baseline=process.env.PHONE_PEEK_BASELINE==='1';
const release=baseline?'outputs/tool-dock/release':'outputs/phone-peek/release';
const bundle=readFileSync(`${release}/immersive-shell-lite.js`,'utf8');
mkdirSync('outputs/phone-peek',{recursive:true});
async function meeting(page:any){
  await page.goto('/');
  return page.evaluate(async()=>{
  const modelPath='/src/runtime/model.ts',worldPath='/src/runtime/protagonist-world.ts';
  const {createInitialState,reduceState}=await import(modelPath);
  const {enableProtagonists}=await import(worldPath);
  let state=createInitialState();
  state.academics={majorId:'computer-science',subjects:[{subjectId:'cs-programming',points:0},{subjectId:'cs-algorithms',points:0},{subjectId:'cs-networks',points:0}],lastGain:null};
  state=enableProtagonists(state);
  state.protagonists.inactive.academics=structuredClone(state.academics);
  const act=(action:any)=>state=reduceState(state,action);
  act({type:'novel_travel',locationId:'sports'});
  act({type:'phone_app',owner:'soyo',requestId:'soyo-sms',command:{type:'send_message',to:'sakiko',text:'今天一起去排练吗？'}});
  act({type:'switch_protagonist',target:'sakiko'});
  act({type:'novel_travel',locationId:'sports'});
  act({type:'phone_app',owner:'sakiko',requestId:'sakiko-sms',command:{type:'send_message',to:'soyo',text:'好的，带上乐谱。'}});
  act({type:'phone_app',owner:'sakiko',requestId:'sakiko-share',command:{type:'device',locked:true,share:'read'}});
  act({type:'switch_protagonist',target:'soyo'});
  return state;
  });
}
for(const viewport of viewports)test(`ordinary phone peek ${viewport.width}x${viewport.height}`,async({page})=>{
  await page.setViewportSize(viewport);
  await page.route('http://127.0.0.1:5197/',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>'}));
  const {helper,errors}=await mountSwitchHost(page,{state:await meeting(page),bundle,installZip:`${release}/unread-city-lite-assets.zip`});
  await page.locator('.phone-launcher').click();
  const frame=page.frameLocator('#sttts-panel > iframe');
  await expect(frame.locator('.screen')).toBeVisible({timeout:30_000});
  await expect(page.locator('#sttts-panel')).toHaveAttribute('data-phone-opening','false');
  const box=await page.locator('#sttts-panel > iframe').boundingBox();
  const metrics=await frame.locator('.screen').evaluate(e=>({width:e.clientWidth,height:e.clientHeight,scroll:e.scrollWidth,font:getComputedStyle(e).fontSize}));
  writeFileSync(`outputs/phone-peek/${baseline?'before':'after'}-${viewport.width}.json`,JSON.stringify({viewport,box,metrics},null,2));
  await page.screenshot({path:`outputs/phone-peek/${baseline?'before':'after'}-${viewport.width}.png`});
  if(baseline)return;
  await expect(frame.locator('[data-app="worldpeek"]')).toHaveCount(0);
  await frame.locator('[data-app="peek"]').first().click();
  await frame.locator('[data-action="peek-open"][data-name="丰川祥子"]').click();
  const peek=frame.locator('.peek-phone');
  await expect(peek).toBeVisible();
  await peek.locator('.pp-lock-head').click();
  await expect(peek).toHaveAttribute('data-page','home');
  await peek.locator('[data-id="messages"]').click();
  await peek.locator('.pp-chat-row').filter({hasText:'长崎素世'}).click();
  await expect(peek).toContainText('今天一起去排练吗？');
  await expect(peek).toContainText('好的，带上乐谱。');
  await expect(peek.locator('.pp-msg.own')).toContainText('好的，带上乐谱。');
  await page.evaluate(async()=>{
    const api=(window as any).__unreadCityWorldPhone,world=api.read();
    await api.act({binding:world.binding,revision:world.revision,owner:world.owner,requestId:'live-peek-sms',
      command:{type:'send_message',to:'sakiko',text:'我已经出门了。'}});
  });
  await expect(peek).toContainText('我已经出门了。');
  expect(await peek.textContent()).not.toMatch(/LLM|模型|协议|存档|world_actions/);
  await page.screenshot({path:`outputs/phone-peek/thread-${viewport.width}.png`});
  const before=(await readState(helper)).unread_city.protagonists!.conversations;
  expect(before).toHaveLength(3);
  expect((await counts(helper)).generations).toBe(0);
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y+box!.height).toBeLessThanOrEqual(viewport.height);
  if(viewport.width>760){
    await expect(page.locator('#sttts-panel > iframe')).toHaveCSS('transform','none');
    expect(metrics.scroll).toBeLessThanOrEqual(metrics.width+1);
  }
  await page.locator('[aria-label="查看手机背面"]').click();
  await expect(page.locator('#sttts-panel')).toHaveAttribute('data-phone-back-facing','true');
  await page.locator('[aria-label="手机回正"]').click();
  await expect(page.locator('#sttts-panel')).toHaveAttribute('data-phone-back-facing','false');
  await expect(peek).toContainText('好的，带上乐谱。');
  await page.locator('[aria-label="关闭手机窗口"]').click();
  await page.locator('[data-protagonist-select]').selectOption('sakiko');
  await expect(page.locator('.uc-shell')).toHaveAttribute('data-current-protagonist','sakiko',{timeout:30_000});
  await page.locator('.phone-launcher').click();
  await expect(page.locator('#sttts-panel')).toHaveAttribute('data-phone-opening','false');
  await frame.locator('[data-app="worldmessages"]').first().click();
  await frame.locator('[data-action="open-thread"][data-recipient="protagonist:soyo"]').click();
  await expect(frame.locator('[data-message-id="dual:soyo-sms"]')).toBeVisible();
  await expect(frame.locator('.view[data-world-owner="sakiko"]')).toContainText('好的，带上乐谱。');
  await expect(frame.locator('.view[data-world-owner="sakiko"]')).toContainText('我已经出门了。');
  expect((await readState(helper)).unread_city.protagonists!.conversations).toEqual(before);
  expect((await counts(helper)).generations).toBe(0);
  expect(errors).toEqual([]);
});
