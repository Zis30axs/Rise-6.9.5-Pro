import type { WorldState } from '../frontend/types';
import { live2dIdentity, live2dNames } from './live2d-identity';
import { live2dPack, type Live2dOutfit, type Live2dPerson, type Live2dPackStatus } from './live2d-pack';
import { activeProtagonist, personState } from './protagonist-world';
import { worldSceneContext } from './world-presence';
import { gameCalendar } from './game-calendar';
import { resolveWeather, type WeatherId } from './weather';
import { performanceMemberIds } from './livehouse';
import { isStudyInteraction } from './campus-interiors';
import { WARDROBE_CATEGORIES, wardrobeCategory, type WardrobeState } from './wardrobe-state';

export interface OutfitEnvironment {
  day: number; period: number; month: number; location: string; room: string | null;
  weather: WeatherId; activity: 'ordinary' | 'study' | 'work' | 'performance'; home: boolean;
}
export interface OutfitChoice { id: string; trigger: string; pack: string }
const saved = new Map<string, Partial<Record<Live2dPerson,OutfitChoice>>>();
// Confirmation is deliberately not persisted. A fresh renderer must succeed.
const confirmed = new Map<string, Map<Live2dPerson, {choice:OutfitChoice; generation:number; leases:Set<symbol>}>>();
function hash(text: string) { let n=2166136261; for (const c of text) n=Math.imul(n ^ c.charCodeAt(0),16777619); return n>>>0; }
const storageKey = (session:string) => `unread-city-live2d-wardrobe-v1:${session}`;
function choices(session: string) {
  let value=saved.get(session);
  if (!value) {
    value={};
    try {
      const raw=JSON.parse(localStorage.getItem(storageKey(session)) ?? '{}');
      for (const [person,row] of Object.entries(raw)) {
        if (!row || typeof row !== 'object' || live2dIdentity(person)!==person) continue;
        const r=row as OutfitChoice;
        if (typeof r.id==='string' && r.id.length<100 && typeof r.trigger==='string' && r.trigger.length<1000 && typeof r.pack==='string') value[person as Live2dPerson]={id:r.id,trigger:r.trigger,pack:r.pack};
      }
    } catch { /* Storage may be disabled. Deterministic selection still works. */ }
    saved.set(session,value);
  }
  return value;
}
/** Uses the same scene roster as the narrative bridge, with no new visibility. */
export function visibleLive2dPeople(state: WorldState): Map<Live2dPerson,string> {
  const result = new Map<Live2dPerson,string>();
  const active=live2dIdentity(activeProtagonist(state));
  if (active) result.set(active,live2dNames[active]);
  for (const row of worldSceneContext(state)?.nearbyPeople ?? []) {
    const person=live2dIdentity(row.id);
    if (!person) continue;
    const knowledge=(row as typeof row & {knownToPlayer?:boolean}).knownToPlayer;
    // A source name is not proof of player knowledge. Older rosters use a
    // contact/name projection; anonymous residents keep the projected label.
    const known=knowledge ?? (row.name === live2dNames[person] || !!row.contactId);
    result.set(person,known ? row.name : '附近一位尚未确认姓名的人');
  }
  return result;
}
export function outfitEnvironment(state:WorldState, person:Live2dPerson):OutfitEnvironment {
  const controlled=(person==='soyo'||person==='sakiko') && !!state.protagonists;
  const personal=controlled ? personState(state,person as 'soyo'|'sakiko') : state;
  const room=personal.interior?.roomId ?? null;
  // Never borrow the player's last interaction as an NPC's current activity.
  const activity=controlled||person===activeProtagonist(state) ? personal.interior?.activityId ?? '' : '';
  const minute=(state.clock.day-1)*1440+state.clock.hour*60+state.clock.minute;
  const performing=room==='livehouse' && (state.livehouse?.bookings ?? []).some(b => b.start<=minute && minute<b.start+b.duration && performanceMemberIds(state.livehouse,b).some(id=>live2dIdentity(id)===person));
  const working=['mlm-phone-sales','mlm-attend-rally','mlm-fold-flyers'].includes(activity);
  return {day:state.clock.day,period:Math.floor(state.clock.hour/6),month:gameCalendar(state.clock.day).month,
    location:personal.locationId,room,weather:resolveWeather(state).id,
    activity:performing?'performance':isStudyInteraction(activity)?'study':working?'work':'ordinary',
    home:!!room && /home|bedroom|apartment|dorm/.test(room)};
}
/** Positive weights retain variation; category totals avoid a large stage
 * wardrobe overwhelming the few everyday outfits by sheer count. */
export function outfitWeight(outfit:Live2dOutfit, environment:OutfitEnvironment):number {
  const has=(tag:string)=>outfit.tags.includes(tag);
  let weight=has('casual')?14:has('school')?5:has('work')?2:0.3;
  if(environment.home && has('casual')) weight*=4;
  if(environment.activity==='study' && has('school')) weight*=8;
  if(environment.activity==='work' && has('work')) weight*=12;
  if(environment.activity==='performance' && has('performance')) weight*=250;
  if(environment.weather==='snow'||environment.month<=2||environment.month===12) weight*=has('warm')?8:has('summer')?0.08:1;
  if(environment.weather==='hot'||[6,7,8].includes(environment.month)) weight*=has('summer')?4:has('warm')?0.12:1;
  if(!environment.room && ['rain','storm'].includes(environment.weather)) weight*=has('warm')?2:has('formal')?0.2:1;
  if(environment.period===0 && environment.home && has('casual')) weight*=2;
  // Small stable preferences; never pretend this configuration is canon.
  weight*=0.85+(hash(`${outfit.person}:${outfit.tags.join(',')}`)%31)/100;
  return weight;
}
export function selectOutfit(models:readonly Live2dOutfit[], person:Live2dPerson, env:OutfitEnvironment, seed:string):Live2dOutfit|null {
  const candidates=models.filter(row=>row.person===person).sort((a,b)=>a.id.localeCompare(b.id));
  if(!candidates.length) return null;
  const category=(row:Live2dOutfit)=>row.tags.includes('performance')?'performance':row.tags.includes('school')?'school':row.tags.includes('work')?'work':'casual';
  const weights=candidates.map(row=>outfitWeight(row,env)/candidates.filter(other=>category(other)===category(row)).length);
  let sample=hash(`${seed}:${person}:${JSON.stringify(env)}`)/4294967296*weights.reduce((a,b)=>a+b,0);
  for(let i=0;i<candidates.length;i++){sample-=weights[i];if(sample<0)return candidates[i];}
  return candidates[candidates.length-1];
}
function outfitTrigger(state: WorldState, person: Live2dPerson): string {
  const current = state.wardrobe?.[person];
  if (current && (current.outfitId || current.category || Object.keys(current.details ?? {}).length))
    return 'saved:' + JSON.stringify([current.outfitId ?? null, current.category ?? null]);
  return JSON.stringify(outfitEnvironment(state, person));
}
export function chooseLive2dOutfit(session:string|undefined,state:WorldState,person:Live2dPerson,status=live2dPack()?.status()):{outfit:Live2dOutfit;choice:OutfitChoice}|null {
  if(!session||!status?.enabled||!visibleLive2dPeople(state).has(person))return null;
  const env=outfitEnvironment(state,person), trigger=outfitTrigger(state,person);
  const current=state.wardrobe?.[person];
  const previous=choices(session)[person];
  let outfit=current?.outfitId?status.models.find(row=>row.id===current.outfitId&&row.person===person):undefined;
  const desiredCategory=current?.category;
  if (!outfit && desiredCategory) {
    const candidates=status.models.filter(row=>row.person===person&&row.tags.includes(desiredCategory))
      .sort((a,b)=>a.id.localeCompare(b.id));
    if (candidates.length) {
      outfit=previous?.pack===status.pack&&previous.trigger===trigger
        ?candidates.find(row=>row.id===previous.id):undefined;
      outfit??=candidates[hash(session+':'+person+':'+desiredCategory)%candidates.length];
    }
  }
  if (!outfit) {
    outfit=previous?.pack===status.pack&&previous.trigger===trigger
      ?status.models.find(row=>row.id===previous.id&&row.person===person):undefined;
    outfit??=selectOutfit(status.models,person,env,session)??undefined;
  }
  if(!outfit)return null;
  const choice={id:outfit.id,trigger,pack:status.pack};
  if(previous?.id!==choice.id||previous.trigger!==trigger||previous.pack!==status.pack){
    choices(session)[person]=choice; confirmed.get(session)?.delete(person);
    try{localStorage.setItem(storageKey(session),JSON.stringify(choices(session)));}catch{}
  }
  return {outfit,choice};
}
export function confirmLive2dOutfit(session:string,person:Live2dPerson,choice:OutfitChoice,status:Live2dPackStatus):()=>void {
  const current=live2dPack()?.status();
  if(!current?.enabled||current.generation!==status.generation||choices(session)[person]?.id!==choice.id)return ()=>{};
  let group=confirmed.get(session);if(!group){group=new Map();confirmed.set(session,group);}
  let row=group.get(person);
  if(!row||row.choice.id!==choice.id||row.choice.trigger!==choice.trigger||row.generation!==status.generation){row={choice,generation:status.generation,leases:new Set()};group.set(person,row);}
  const token=Symbol();row.leases.add(token);
  return ()=>{row!.leases.delete(token);};
}
function confirmedOutfit(session:string,state:WorldState,person:Live2dPerson,status:Live2dPackStatus):Live2dOutfit|undefined {
  const row=confirmed.get(session)?.get(person);
  if(!row?.leases.size||row.generation!==status.generation||row.choice.pack!==status.pack||row.choice.trigger!==outfitTrigger(state,person))return undefined;
  return status.models.find(model=>model.person===person&&model.id===row.choice.id);
}
/** Snapshot only confirmed initial looks; never reinitialize someone who has an entry. */
export function confirmedWardrobeBootstrap(session: string|null, state: WorldState): WardrobeState {
  const status=live2dPack()?.status(), result: WardrobeState = {};
  if (!session || !status?.enabled) return result;
  for (const [person] of visibleLive2dPeople(state)) {
    if (state.wardrobe?.[person]) continue;
    const outfit=confirmedOutfit(session, state, person, status);
    if (outfit) result[person]={ outfitId:outfit.id, category:wardrobeCategory(outfit) };
  }
  return result;
}
export function visibleLive2dOutfit(session: string | undefined, state: WorldState, speaker: string): Live2dOutfit | undefined {
  const status = live2dPack()?.status();
  const person = live2dIdentity(speaker);
  if (!session || !status?.enabled || !person || !visibleLive2dPeople(state).has(person)) return;
  return confirmedOutfit(session, state, person, status);
}

export function live2dAppearancePrompt(
  session: string | null, state: WorldState, bootstrap = confirmedWardrobeBootstrap(session, state),
): string {
  const status = live2dPack()?.status();
  if (!session || !status?.enabled) return '';
  const initial: string[] = [], categories: string[] = [];
  for (const [person, name] of visibleLive2dPeople(state)) {
    const confirmed = confirmedOutfit(session, state, person, status);
    if (!confirmed) continue;
    if (bootstrap[person]?.outfitId === confirmed.id) {
      initial.push(`${name}：${confirmed.label}。${confirmed.description}`);
    }
    const available = WARDROBE_CATEGORIES.filter(row =>
      status.models.some(model => model.person === person && model.tags.includes(row.id)));
    if (available.length) categories.push(person + ':' + available.map(row => row.id).join('/'));
  }
  return (initial.length ? '\n【初始 Live2D 衣着】\n' + initial.join('\n') + '\n' : '') +
    (categories.length ? '【可切换 Live2D 衣装大类】' + categories.join('；') + '。剧情衣着文字可超出资源类别。\n' : '');
}
