import { getNovelTravelQuote, getRouteOutlook, mapLocations, novelDestinations } from '../runtime/model';
import { isInternationalLocation } from '../runtime/california';
import { isBeijingLocation } from '../runtime/beijing';
import { requiresTransitReturn } from '../runtime/transit';
import { runInteraction } from './interaction-action';
import type { ShellActions, ShellModel } from './types';
const known=new Set(novelDestinations.map(p=>p.id));
export const isNovelTrip=(m:ShellModel,id:string,novel:boolean)=>novel||[m.state.locationId,id].some(p=>isInternationalLocation(p)||isBeijingLocation(p));
export function mapTrip(m:ShellModel,id:string,novel:boolean){
 const s=m.state,quoted=isNovelTrip(m,id,novel);
 if(!known.has(id))return {blocked:'此处仅供浏览。',minutes:0,fare:0,energy:0};
 if(quoted){const q=getNovelTravelQuote(s,id);return {blocked:q.alreadyThere?'当前地点':q.blockedReason||'',minutes:q.minutes,fare:q.fare,energy:q.energyCost}}
 const blocked=s.interior?'请先离开房间。':requiresTransitReturn(s.locationId,s.scene)?'请在附近公交站乘车返回校园。':id===s.locationId?'当前地点':!mapLocations.some(p=>p.id===id)?'请从附近入口步行前往。':'';
 return {blocked,minutes:15+getRouteOutlook(s,id).extraMinutes,fare:0,energy:5};
}
export async function submitMapTrip(m:ShellModel,a:ShellActions,id:string,novel:boolean){
 if(m.busy||mapTrip(m,id,novel).blocked)return false;
 const quoted=isNovelTrip(m,id,novel);
 const saved=await runInteraction(m,a,{type:quoted?'novel_travel':'travel',locationId:id});
 return saved&&quoted;
}
