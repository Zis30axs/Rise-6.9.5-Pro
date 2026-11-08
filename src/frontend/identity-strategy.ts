import type { ProtagonistId } from '../runtime/dual-protagonists';
import { FOCUS_CATALOG, SPIRIT_CATALOG, TRAIT_CATALOG, focusWeight } from '../runtime/strategy';
import { bandLeaderName, bandLeaderPersonId, musicRoleNames, performanceMemberIds } from '../runtime/livehouse';
import type { WorldState } from './types';
const OWNER:Record<string,ProtagonistId>={soyo:'soyo',sakiko:'sakiko',emma:'emma',renako:'renako'};
const PERSON:Record<ProtagonistId,string>={soyo:'protagonist-soyo',sakiko:'protagonist-sakiko',emma:'majo-emma',renako:'watanare-renako'};
const seats:Record<string,string>={music:'音乐顾问',social:'社交顾问',operations:'运营顾问'};
export function identityStrategyDossier(cardId:string,personId:string,state:WorldState){
 const owner=OWNER[cardId]??OWNER[personId]??null, keys=new Set([cardId,personId,...(owner?[PERSON[owner]]:[])]);
 const society=state.protagonists?.society, bands=(state.livehouse?.bands??[]).filter(b=>b.members.some(m=>keys.has(m.personId)));
 const circles=(society?.circles??[]).filter(c=>c.memberIds.some(id=>keys.has(id)));
 const organizations=[...bands.map(b=>({id:'band:'+b.id,kind:'阵营',title:b.name,detail:`${musicRoleNames[b.members.find(m=>keys.has(m.personId))!.role]} · ${keys.has(bandLeaderPersonId(b))?'Leader':`Leader：${bandLeaderName(b)}`}`})),...circles.map(c=>({id:'circle:'+c.id,kind:'社交圈',title:c.title,detail:c.founder===owner?'创建者':'成员'}))];
 const refs=new Set([...bands.map(b=>'band:'+b.id),...circles.map(c=>'circle:'+c.id)]);
 for(const u of society?.unions??[])if(u.groupIds.some(id=>refs.has(id)))organizations.push({id:'union:'+u.id,kind:'广域联合体',title:u.title,detail:u.coordinator===owner?'协调者':'成员组织'});
 for(const a of society?.advisors??[])if(keys.has(a.personId)){const b=bands.find(x=>x.id===a.bandId);if(b)organizations.push({id:'advisor:'+b.id+':'+a.seat,kind:'阵营职位',title:b.name+' · 顾问',detail:seats[a.seat]??a.seat});}
 const activity:any[]=[];
 for(const i of state.livehouse?.invitations??[])if(keys.has(i.personId))activity.push({id:'band-invite:'+i.id,at:i.at,title:'乐队邀请',detail:i.status+' · '+i.bandId});
 for(const b of state.livehouse?.bookings??[])if(performanceMemberIds(state.livehouse,b).some(id=>keys.has(id)))activity.push({id:'booking:'+b.id,at:b.createdAt,title:b.title,detail:'演出预约 · '+b.bandId});
 for(const b of state.livehouse?.bands??[])for(const m of b.formerMembers??[])if(keys.has(m.personId))activity.push({id:`band-left:${b.id}:${m.leftAt}`,at:m.leftAt,title:`退出 ${b.name}`,detail:'已离队'});
 for(const i of society?.invitations??[])if(keys.has(i.personId))activity.push({id:'circle-invite:'+i.id,at:i.at,title:'社交圈邀请',detail:i.status+' · '+i.circleId});
 for(const e of society?.history??[])if((owner&&e.actor===owner)||refs.has(e.subject))activity.push({id:'society:'+e.id,at:e.at,title:e.kind,detail:e.subject});
 const strategy=state.protagonists?.strategy,p=owner&&strategy?strategy.people[owner]:null,active=p?.active??null,def=active?FOCUS_CATALOG.find(x=>x.id===active.id):null;
 return {owner,controller:p?.controller??null,includeInPrompt:p?.includeInPrompt??false,
 focus:active?{id:active.id,title:def?.title??active.id,progress:active.progress,duration:def?.durationMinutes??0,percent:def?.durationMinutes?Math.min(100,Math.round(active.progress/def.durationMinutes*100)):0}:null,
 completed:p?.completed.map(id=>FOCUS_CATALOG.find(x=>x.id===id)?.title??id)??[],
 traits:p?.traits.map(id=>TRAIT_CATALOG.find(x=>x.id===id)?.title??id)??[],
 spirits:p?.spirits.map(x=>({title:SPIRIT_CATALOG.find(s=>s.id===x.id)?.title??x.id,expiresAt:x.expiresAt}))??[],
 organizations,weights:owner&&strategy?FOCUS_CATALOG.filter(x=>x.owner===owner).map(x=>({title:x.title,...focusWeight(strategy,owner,x)})):[],
 flags:owner&&strategy?Object.entries(strategy.flags):[],stats:owner&&strategy?Object.entries(strategy.stats):[],
 history:owner&&strategy?strategy.history.filter(x=>x.owner===owner).slice(-50).reverse():[],
 activity:activity.sort((a,b)=>b.at-a.at).slice(0,50),
 beats:state.story.flatMap(s=>(s.otherSideBeats??[]).filter(b=>owner&&b.protagonists.includes(owner)).map(b=>({id:s.id,text:b.text})))};
}
