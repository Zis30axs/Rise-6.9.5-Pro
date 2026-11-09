import { afterEach, expect, it, vi } from 'vitest';
import { createEnsembleSource } from '../src/frontend/live2d-ensemble-assets';
import type { Live2dOutfit } from '../src/runtime/live2d-pack';
const sha='a'.repeat(64), texture='b'.repeat(64)+'.png',model='c'.repeat(64)+'.moc';
const outfit:Live2dOutfit={id:'fixture',person:'anon',label:'便服',description:'',tags:['casual'],definitionSha:sha,bundledSoyo:false};
function fixture(fail=false){
  let count=0;const revoked=vi.fn();
  vi.stubGlobal('URL',{createObjectURL:vi.fn(()=>`blob:portrait-${++count}`),revokeObjectURL:revoked});
  const spec={definition:{model,textures:[texture],motions:{},expressions:[]},files:{[model]:{sha256:'model',bytes:3,mime:'application/octet-stream'},[texture]:{sha256:'texture',bytes:3,mime:'image/png'}}};
  const getAsset=vi.fn(async(key:string)=>{
    if(key===sha)return {text:async()=>JSON.stringify(spec)};
    if(fail&&key==='texture')throw Error('corrupt stored texture');
    return new Blob(['abc']);
  });
  vi.stubGlobal('__UC_LIVE2D__',{status:()=>({enabled:true,generation:1}),getAsset});
  return {revoked,getAsset};
}
afterEach(()=>vi.unstubAllGlobals());
it('gives simultaneous portraits independent URLs and refuses foreign paths',async()=>{
  const f=fixture(),signal=new AbortController().signal;
  const a=(await createEnsembleSource(outfit,signal))!,b=(await createEnsembleSource(outfit,signal))!;
  expect(a.lease.resolve(texture)).not.toBe(b.lease.resolve(texture));
  expect(()=>a.lease.resolve('../foreign')).toThrow();
  const other=b.lease.resolve(texture);a.lease.release();expect(f.revoked).not.toHaveBeenCalledWith(other);
  b.lease.release();expect(f.revoked).toHaveBeenCalledWith(other);
});
it('releases partial resources on missing/corrupt local data and rejects the load',async()=>{
  const f=fixture(true);
  await expect(createEnsembleSource(outfit,new AbortController().signal)).rejects.toThrow('corrupt stored texture');
  expect(f.revoked).toHaveBeenCalledTimes(1);
});
it('reuses the original Soyo lease without reading optional model bytes',async()=>{
  const f=fixture();
  expect(await createEnsembleSource({...outfit,person:'soyo',bundledSoyo:true,definitionSha:null},new AbortController().signal)).toBeUndefined();
  expect(f.getAsset).not.toHaveBeenCalled();
});
