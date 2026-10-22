import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,cp,rm,writeFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {loadPhoneArt} from '../scripts/phone_visual_assets.mjs';
const root=path.resolve(import.meta.dirname,'..');
const art=await loadPhoneArt(root);
const source=(await readFile(path.join(root,'integration/dual-protagonists/phone-visuals.js'),'utf8')).replace("import {phoneArt} from 'UNREAD_CITY_PHONE_ART';",`const phoneArt=${JSON.stringify(art)};`);
const visual=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
function screen(owner='soyo',appearance) {
  const state={active:owner,owner,deviceId:`unread-city-phone-${owner}`,appearance};
  const style=new Map();
  return {state,style,dataset:{},ownerDocument:{documentElement:{dataset:{}},defaultView:{parent:{__unreadCityWorldPhone:{read:()=>state}},matchMedia:()=>({matches:true})}},querySelector:()=>({replaceChildren(){}}),set styleValue(v){},getStyle:()=>style};
}
test('all art is static, deterministic and device-specific',()=>{
  assert.equal(Object.keys(art).length,67);
  for(const file of Object.keys(art).filter(x=>x.startsWith('soyo/')))assert.notEqual(art[file],art[file.replace('soyo/','sakiko/')]);
  for(const file of Object.keys(art).filter(x=>x.startsWith('twiitch/')))assert.match(art[file],/^<svg /);
  assert.equal(Object.keys(art).filter(x=>x.startsWith('twiitch/')).length,13);
});
test('twiitch app icon uses the recovered per-device SVG',()=>{
  const soyo=visual.worldPhoneIcon(screen('soyo'),'twiitch',art), sakiko=visual.worldPhoneIcon(screen('sakiko'),'twiitch',art);
  assert.match(soyo,/^<svg /);assert.match(sakiko,/^<svg /);assert.notEqual(soyo,sakiko);
  assert.equal(visual.worldPhoneIcon(screen('soyo'),'twiitch',{}),null);
});
test('missing runtime wallpaper/card/icon uses usable fallbacks',()=>{
  const s=screen();s.style={setProperty:(k,v)=>s.getStyle().set(k,v)};
  assert.equal(visual.applyWorldPhoneTheme(s,{}),true);
  assert.match(s.getStyle().get('--wall'),/^linear-gradient/);
  assert.equal(visual.worldPhoneIcon(s,'appie',{}),null);
  assert.equal(visual.worldCardArt('soyo','gpt',{}),'none');
});
test('home preserves every application exactly once and restores device layout',()=>{
  const original={pages:[['appie','worldshop','worldcalendar','notes','gallery','music','draw','worlddelivery','worldmessages','worldstyle']],dock:['chat','settings','listen','peek']};
  const a=visual.worldPhoneHome(screen('soyo'),original), b=visual.worldPhoneHome(screen('sakiko'),original);
  assert.notDeepEqual(a,b);
  for(const home of [a,b]){
    const all=[...home.pages.flat(),...home.dock];assert.equal(new Set(all).size,all.length);
    for(const id of [...original.pages.flat(),...original.dock])assert.ok(all.includes(id));
  }
  assert.equal(visual.worldPhoneHome(screen('soyo',{layout:'focus'}),original).pages[0][0],'worldcalendar');
});
test('missing build input and mismatched hash fail before shipping',async()=>{
  const temp=await mkdtemp(path.join(os.tmpdir(),'phone-art-'));
  try{
    await cp(path.join(root,'assets/phone-visuals'),path.join(temp,'assets/phone-visuals'),{recursive:true});
    const file=path.join(temp,'assets/phone-visuals/soyo/wallpaper.svg');
    await writeFile(file,'<svg/>');await assert.rejects(loadPhoneArt(temp),/hash mismatch/);
    await rm(file);await assert.rejects(loadPhoneArt(temp),/ENOENT/);
  }finally{await rm(temp,{recursive:true,force:true});}
});
