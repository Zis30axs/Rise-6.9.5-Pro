import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const loader=new URL('../scripts/lite_asset_loader.js',import.meta.url);
const available=existsSync(loader);

/** Execute the real Lite loader with missing local data and no network. */
for(const mode of ['unavailable','not-installed','missing-blob'])test(`Lite ${mode}: native chat remains available and import can be retried`,{skip:!available},async()=>{
  const nodes=[],events=new Map();
  const document={body:{append:(...els)=>nodes.push(...els)},getElementById:()=>null,createElement:tag=>({tag,style:{},addEventListener(name,fn){events.set(`${tag}:${name}`,fn);},remove(){},click(){}})};
  const request=result=>{const r={result};queueMicrotask(()=>r.onsuccess?.());return r;};
  const db={close(){},transaction(store){return {objectStore(){return {get(){return request(store==='meta'&&mode==='missing-blob'?'pack-v1':undefined);}};}};}};
  const context=vm.createContext({document,window:{parent:{document},addEventListener(){}},console:{warn(){},error(){}},Blob,URL,Map,DataView,Uint8Array,TextDecoder,crypto:webcrypto,fetch(){throw Error('No online fallback allowed');}});
  if(mode!=='unavailable')context.indexedDB={open:()=>request(db)};
  const source=readFileSync(loader,'utf8').replace('__UC_LITE_ASSET_LIST__',JSON.stringify([{sha256:'0'.repeat(64),mime:'image/webp',bytes:1,path:'assets/'+'0'.repeat(64)}])).replace('__UC_LITE_PACK_DIGEST__',JSON.stringify('pack-v1'));
  vm.runInContext(source+'\nglobalThis.check={init:__uc_lite_init__,asset:__UC_LITE_ASSET__,zip:__ucLiteZipEntries};',context);
  assert.equal(await context.check.init(),false);
  assert.equal(nodes.find(el=>el.tag==='button').id,'unread-city-lite-import');
  assert.match(context.check.asset('0'.repeat(64),'image/webp'),/^data:image\/gif/);
  assert.equal(context.check.asset('0'.repeat(64),'model/gltf-binary'),'data:application/octet-stream;base64,');
  await assert.rejects(context.check.zip(new Blob([new Uint8Array(30)])),/ZIP/);
});
