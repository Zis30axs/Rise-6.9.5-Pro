import type { ProtagonistId } from '../runtime/dual-protagonists';
import {
  ADVISOR_SEAT_LABELS,
  NPC_TRAIT_CATEGORY_LABELS,
  activeAdvisorPlacementsForPerson,
  canonicalNpcTraitPersonId,
  formatNpcTraitModifiers,
  isPresetNpcTarget,
  npcSelfExternalModifiers,
  resolveNpcTraits,
} from '../runtime/npc-traits';
import {
  DECISION_CATALOG,
  FOCUS_CATALOG,
  MUTSUMI_OWNER_ID,
  SPIRIT_CATALOG,
  TRAIT_CATALOG,
  canStartFocus,
  createGameStrategyState,
  focusBranchLocked,
  focusWeight,
  mutsumiBalanceValue,
  type StrategyOwner,
} from '../runtime/strategy';
import { mutsumiBalanceStatus } from '../runtime/mutsumi-balance';
import { bandLeaderName, bandLeaderPersonId, musicRoleNames, performanceMemberIds } from '../runtime/livehouse';
import type { WorldState } from './types';
export interface IdentityCardTraitHint {
  id: string;
  personId: string;
  name: string;
  gradeOrTitle?: string;
  schoolOrAffiliation?: string;
  anchorSpotDetail?: string;
  bioParagraphs?: readonly string[];
}
const OWNER:Record<string,ProtagonistId>={soyo:'soyo',sakiko:'sakiko',emma:'emma',renako:'renako'};
const PERSON:Record<ProtagonistId,string>={soyo:'protagonist-soyo',sakiko:'protagonist-sakiko',emma:'majo-emma',renako:'watanare-renako'};
const seats:Record<string,string>={...ADVISOR_SEAT_LABELS};
export function identityStrategyDossier(cardId:string,personId:string,state:WorldState,card?:IdentityCardTraitHint){
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
 const matchedContact = !owner
   ? (state.contacts ?? []).find(c =>
       c.id === cardId || c.id === personId || c.sourcePersonId === personId
       || (card?.name && c.name === card.name))
   : undefined;
 const npcTarget = !owner ? {
   id: card?.id ?? cardId,
   personId: card?.personId ?? personId,
   sourcePersonId: matchedContact?.sourcePersonId ?? null,
   name: card?.name ?? matchedContact?.name ?? cardId,
   tag: matchedContact?.tag,
   summary: matchedContact?.summary,
   status: matchedContact?.status,
   gradeOrTitle: card?.gradeOrTitle,
   schoolOrAffiliation: card?.schoolOrAffiliation,
   anchorSpotDetail: card?.anchorSpotDetail,
   bioParagraphs: card?.bioParagraphs,
 } : null;
 const npcTraits = npcTarget ? resolveNpcTraits(npcTarget).map(item => ({
   id: item.id,
   title: item.title,
   icon: item.icon,
   category: NPC_TRAIT_CATEGORY_LABELS[item.category],
   summary: item.summary,
   recommendedSeat: item.recommendedSeat ? ADVISOR_SEAT_LABELS[item.recommendedSeat] : null,
   modifiers: formatNpcTraitModifiers(item),
 })) : [];
 const advisorPlacements = npcTarget
   ? activeAdvisorPlacementsForPerson(state, [cardId, personId, matchedContact?.sourcePersonId ?? ''].filter(Boolean))
   : [];
 const isPresetNpc = npcTarget ? isPresetNpcTarget(npcTarget) : false;
 const npcStrategyOwner: StrategyOwner | null = !owner && npcTarget ? canonicalNpcTraitPersonId(npcTarget) : null;
 const npcCatalogFocuses = npcStrategyOwner ? FOCUS_CATALOG.filter(x => x.owner === npcStrategyOwner) : [];
 const hasNpcFocusTree = npcCatalogFocuses.length > 0;
 const subjectTitles = new Map([
   ...FOCUS_CATALOG.map(x => [x.id, x.title] as const),
   ...DECISION_CATALOG.map(x => [x.id, x.title] as const),
   ...SPIRIT_CATALOG.map(x => [x.id, x.title] as const),
   ['mutsumi_balance', '心境天平'] as const,
 ]);
 const strategy = state.protagonists?.strategy;
 const effectiveNpcStrategy = hasNpcFocusTree ? (strategy ?? createGameStrategyState(0)) : null;
 const mutsumiBalance = npcStrategyOwner === MUTSUMI_OWNER_ID && effectiveNpcStrategy
   ? mutsumiBalanceStatus(mutsumiBalanceValue(effectiveNpcStrategy))
   : null;
 const p = owner && strategy ? strategy.people[owner] : null;
 const active = p?.active ?? null;
 const def = active ? FOCUS_CATALOG.find(x => x.id === active.id) : null;
 const npcPerson = npcStrategyOwner && effectiveNpcStrategy ? effectiveNpcStrategy.people[npcStrategyOwner] ?? null : null;
 const npcActive = npcPerson?.active ?? null;
 const npcDef = npcActive ? FOCUS_CATALOG.find(x => x.id === npcActive.id) : null;
 const npcModifiers = npcStrategyOwner ? npcSelfExternalModifiers(npcStrategyOwner) : [];
 const npcFocusNodes = npcStrategyOwner && effectiveNpcStrategy && npcPerson
   ? npcCatalogFocuses.map(node => {
     const done = npcPerson.completed.includes(node.id);
     const isCurrent = npcPerson.active?.id === node.id;
     const locked = focusBranchLocked(effectiveNpcStrategy, npcStrategyOwner, node);
     const available = canStartFocus(effectiveNpcStrategy, npcStrategyOwner, node);
     const status: 'completed' | 'active' | 'available' | 'locked' = done
       ? 'completed'
       : isCurrent
         ? 'active'
         : locked || !available
           ? 'locked'
           : 'available';
     const prereq = node.prerequisites && 'completed' in node.prerequisites
       ? [subjectTitles.get(node.prerequisites.completed) ?? node.prerequisites.completed]
       : [];
     const percent = isCurrent && node.durationMinutes
       ? Math.min(100, Math.round((npcPerson.active!.progress / node.durationMinutes) * 100))
       : done ? 100 : 0;
     return {
       id: node.id,
       title: node.title,
       description: node.description ?? '',
       durationDays: Math.round((node.durationMinutes / 1440) * 10) / 10,
       branchGroup: node.branchGroup ?? null,
       prerequisiteTitles: prereq,
       status,
       percent,
       weight: focusWeight(effectiveNpcStrategy, npcStrategyOwner, node, npcModifiers).value,
     };
   })
   : [];
 const npcWeights = npcStrategyOwner && effectiveNpcStrategy
   ? npcCatalogFocuses.map(x => ({ title: x.title, ...focusWeight(effectiveNpcStrategy, npcStrategyOwner, x, npcModifiers) }))
   : [];
 const historyOwner = owner ?? (hasNpcFocusTree ? npcStrategyOwner : null);
 const historySource = historyOwner && strategy
   ? strategy.history.filter(x => x.owner === historyOwner).slice(-50).reverse().map(x => ({
     ...x,
     subject: subjectTitles.get(x.subject) ?? x.subject,
   }))
   : [];

 return {
   owner,
   npcStrategyOwner: hasNpcFocusTree ? npcStrategyOwner : null,
   controller: p?.controller ?? npcPerson?.controller ?? null,
   includeInPrompt: p?.includeInPrompt ?? false,
   focus: active ? { id: active.id, title: def?.title ?? active.id, progress: active.progress, duration: def?.durationMinutes ?? 0, percent: def?.durationMinutes ? Math.min(100, Math.round(active.progress / def.durationMinutes * 100)) : 0 } : null,
   completed: p?.completed.map(id => subjectTitles.get(id) ?? id) ?? [],
   npcFocus: npcActive ? { id: npcActive.id, title: npcDef?.title ?? npcActive.id, progress: npcActive.progress, duration: npcDef?.durationMinutes ?? 0, percent: npcDef?.durationMinutes ? Math.min(100, Math.round(npcActive.progress / npcDef.durationMinutes * 100)) : 0 } : null,
   npcCompleted: npcPerson?.completed.map(id => subjectTitles.get(id) ?? id) ?? [],
   npcFocusNodes,
   npcWeights,
   mutsumiBalance,
   traits: p?.traits.map(id => TRAIT_CATALOG.find(x => x.id === id)?.title ?? id) ?? [],
   spirits: p?.spirits.map(x => ({ title: SPIRIT_CATALOG.find(s => s.id === x.id)?.title ?? x.id, expiresAt: x.expiresAt })) ?? [],
   npcTraits,
   isPresetNpc,
   advisorPlacements,
   organizations,
   weights: owner && strategy ? FOCUS_CATALOG.filter(x => x.owner === owner).map(x => ({ title: x.title, ...focusWeight(strategy, owner, x) })) : [],
   flags: owner && strategy ? Object.entries(strategy.flags) : [],
   stats: owner && strategy ? Object.entries(strategy.stats) : [],
   history: historySource,
   activity: activity.sort((a, b) => b.at - a.at).slice(0, 50),
   beats: state.story.flatMap(s => (s.otherSideBeats ?? []).filter(b => owner && b.protagonists.includes(owner)).map(b => ({ id: s.id, text: b.text }))),
 };
}
