import { live2dPack, type Live2dOutfit } from '../runtime/live2d-pack';
import type { PortraitSource } from './live2d-soyo-runtime';
export interface EnsembleDefinition {
  model:string; textures:string[]; physics?:string;
  motions:Record<string,{file:string}[]>; expressions:{name:string;file:string}[];
  layout?:Record<string,number>;
}
const emotionNames:Record<string,string[]> = {
  平静:['default','idle01','normal','默认'],开心:['smile01','smile','笑容01'],难过:['sad01','cry01','难过01'],
  生气:['angry01','angry','生气01'],惊讶:['surprised01','surprise01','惊讶01'],害羞:['shame01','shame','羞耻01'],
  思考:['thinking01','thinking','思考01'],严肃:['serious01','serious','严肃01'],安心:['ando01','smile01','安心'],
};
export function ensembleEmotion(definition:EnsembleDefinition,value:string) {
  const pick=(names:string[],kind:string[])=>{
    for(const name of kind){const exact=names.find(n=>n===name)||names.find(n=>n===`mts_${name}`);if(exact)return exact;}
    return undefined;
  };
  const candidates=emotionNames[value]??emotionNames.平静;
  const expressions=definition.expressions.map(row=>row.name), motions=Object.keys(definition.motions).filter(key=>definition.motions[key].length>0);
  return {expression:pick(expressions,candidates)??pick(expressions,emotionNames.平静),
    motion:pick(motions,candidates)??pick(motions,['idle01','default','默认'])};
}
export async function createEnsembleSource(outfit:Live2dOutfit,signal:AbortSignal):Promise<PortraitSource|undefined> {
  if(outfit.bundledSoyo)return undefined;
  const api=live2dPack();if(!api||!outfit.definitionSha)throw Error('立绘素材不可用');
  const revision=api.status().generation;
  const payload=JSON.parse(await (await api.getAsset(outfit.definitionSha)).text()) as {definition:EnsembleDefinition;files:Record<string,{sha256:string;bytes:number;mime:string}>};
  const allowed=new Map<string,string>();let released=false;
  const lease={resolve(file:string){const url=allowed.get(file);if(released||!url)throw Error('立绘素材不可用');return url;},
    release(){if(released)return;released=true;for(const url of allowed.values())URL.revokeObjectURL(url);allowed.clear();}};
  try{
    for(const [name,row] of Object.entries(payload.files)){
      if(signal.aborted||api.status().generation!==revision)throw Error('立绘已关闭');
      if(!/^[0-9a-f]{64}\.(moc|png|mtn|exp\.json|physics\.json)$/.test(name))throw Error('立绘引用无效');
      const blob=await api.getAsset(row.sha256);
      if(signal.aborted)throw Error('立绘已关闭');
      // Each portrait owns texture URLs, avoiding Pixi's shared cache teardown.
      allowed.set(name,URL.createObjectURL(blob));
    }
    if(signal.aborted||api.status().generation!==revision)throw Error('立绘已关闭');
    return {definition:{...payload.definition,url:'ensemble.model.json'},lease,emotion:value=>ensembleEmotion(payload.definition,value)};
  }catch(error){lease.release();throw error;}
}
