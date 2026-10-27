import type { CharacterContact, CharacterPortraitId, GeneratedStory, WorldState } from '../frontend/types';
import { isProtagonistPerson, PROTAGONIST_PERSON_IDS, PROTAGONISTS, type ProtagonistId } from './dual-protagonists';
import { activeProtagonist, enableProtagonists, gameMinute, personState, protagonistNames } from './protagonist-world';
import { getInteriorPeople, getSceneArea, getScenePeople, hiddenProtagonistPersons, SCENE_ENCOUNTER_DISTANCE, sceneLocationId, scenePersonAnchors } from './scene-context';
import { parseNovelDialogue } from '../frontend/novel-dialogue';
import { isCharacterPortraitId } from './characters';
import { MAJO_GROUP_ID, MAJO_GROUP_NAME, residentById, residentCast, residentGroupById, residentGroupForNpc, residentPresence, WATANARE_GROUP_ID, WATANARE_GROUP_NAME, WATANARE_QUINTET_IDS } from './npc-cast';

export interface ContactProposal {
  kind: 'contact' | 'group';
  npcId: string;
  /** "current" means the NPC's spoken line in this same committed turn. */
  evidenceId: string;
  quote: string;
}
interface Meeting {
  id: string; owner: ProtagonistId; npcId: string; name: string;
  portraitId: CharacterPortraitId; summary: string; at: number; locationId: string;
}
interface SpokenEvidence {
  id: string; owner: ProtagonistId; npcId: string; turnId: string; at: number;
  speaker: 'player' | 'npc'; text: string;
}
interface ContactRequest {
  id: string; owner: ProtagonistId; npcId: string; kind: ContactProposal['kind'];
  evidenceId: string; quote: string; status: 'pending' | 'accepted' | 'declined'; at: number;
}
interface Relationship {
  owner: ProtagonistId; npcId: string; contactId: string; requestId: string;
}
interface PhoneGroup {
  id: string; owner: ProtagonistId; name: string; memberIds: string[]; requestId: string; joinedAt: number; joinedAfter: number;
}
export interface NpcTextMessage {
  id: string; owner: ProtagonistId;
  /** Addresses contain stable person/group IDs, never ProtagonistId. */
  channel: 'npc' | 'group'; targetId: string;
  direction: 'outgoing' | 'incoming'; speakerId: string;
  responderId: string | null; text: string; at: number; replyTo: string | null;
  status: 'pending' | 'answered' | 'silent';
  /** Saved bounded group turn; completed decisions survive partial retries. */
  responsePlan?: { id: string; status: 'pending' | 'answered' | 'silent' }[];
}
export interface NpcPhoneState {
  version: 1; meetings: Meeting[]; evidence: SpokenEvidence[]; requests: ContactRequest[];
  turns: {id: string; owner: ProtagonistId; proposals: string}[];
  relationships: Relationship[]; groups: PhoneGroup[]; messages: NpcTextMessage[];
}
export type NpcPhoneCommand =
  | { type: 'resolve_contact_request'; id: string; accept: boolean }
  | { type: 'send_npc_message'; npcId: string; text: string }
  | { type: 'send_group_message'; groupId: string; text: string };

const empty = (): NpcPhoneState => ({ version: 1, meetings: [], evidence: [], requests: [], turns: [], relationships: [], groups: [], messages: [] });
const controlledPerson = (s: WorldState): string | undefined => PROTAGONIST_PERSON_IDS[activeProtagonist(s)];
function fail(detail: string): never { throw new Error('联系人与短信：' + detail); }
function object(raw: unknown, fields: string[]) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).length !== fields.length || fields.some(k => !Object.hasOwn(raw, k))) return fail('字段无效');
  return raw as Record<string, unknown>;
}
const text = (raw: unknown, max = 1000): string => typeof raw === 'string' && !!raw.trim() && raw.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(raw) ? raw : fail('文本无效');
const id = (raw: unknown): string => typeof raw === 'string' && /^[A-Za-z0-9][\w:.-]{0,127}$/.test(raw) ? raw : fail('人物或事件 ID 无效');
const owner = (raw: unknown): ProtagonistId => PROTAGONISTS.includes(raw as ProtagonistId) ? raw as ProtagonistId : fail('手机主人无效');
const minute = (raw: unknown): number => typeof raw === 'number' && Number.isSafeInteger(raw) && raw >= 0 && raw <= 525600000 ? raw : fail('时间无效');
const flag = (raw: unknown): boolean => typeof raw === 'boolean' ? raw : fail('确认状态无效');
function list<T>(raw: unknown, max: number, parse: (row: unknown) => T): T[] {
  if (!Array.isArray(raw) || raw.length > max) return fail('记录数量超过上限');
  return raw.map(parse);
}
function unique<T>(rows: T[], key: (row: T) => string): T[] {
  if (new Set(rows.map(key)).size !== rows.length) return fail('重复记录');
  return rows;
}
function ensure(s: WorldState): NpcPhoneState { return s.protagonists!.npcPhone ??= empty(); }
const RENAKO_BUILTIN_GROUP_REQUEST_ID = 'builtin-watanare-quintet';
function isBuiltinGroup(g: PhoneGroup): boolean {
  return g.owner === 'renako' && g.id === WATANARE_GROUP_ID && g.requestId === RENAKO_BUILTIN_GROUP_REQUEST_ID && g.joinedAt === 0 && g.joinedAfter === 0;
}
function effectiveGroups(social: NpcPhoneState, who: ProtagonistId): PhoneGroup[] {
  if (who === 'renako' && !social.groups.some(g => g.owner === 'renako' && g.id === WATANARE_GROUP_ID)) {
    return [...social.groups, { id: WATANARE_GROUP_ID, owner: 'renako', name: WATANARE_GROUP_NAME, memberIds: [...WATANARE_QUINTET_IDS], requestId: RENAKO_BUILTIN_GROUP_REQUEST_ID, joinedAt: 0, joinedAfter: 0 }];
  }
  return social.groups;
}
function safeContact(c: CharacterContact) { return !c.id.startsWith('protagonist-'); }
export function npcIdForContact(c: CharacterContact): string { return c.sourcePersonId ?? c.id; }
function contactFor(s: WorldState, who: ProtagonistId, npcId: string) {
  return personState(s, who).contacts.find(c => safeContact(c) && npcIdForContact(c) === npcId);
}

export function parseNpcPhoneCommand(raw: unknown): NpcPhoneCommand {
  const type = (raw as NpcPhoneCommand)?.type;
  if (type === 'resolve_contact_request') {
    const row = object(raw, ['type', 'id', 'accept']);
    return { type, id: id(row.id), accept: flag(row.accept) };
  }
  if (type !== 'send_npc_message' && type !== 'send_group_message') return fail('不支持的手机操作');
  const key = type === 'send_npc_message' ? 'npcId' : 'groupId';
  const row = object(raw, ['type', key, 'text']);
  return type === 'send_npc_message'
    ? { type, npcId: id(row.npcId), text: text(row.text) }
    : { type, groupId: id(row.groupId), text: text(row.text) };
}

/** Validate the transport now; encounter/quote authority is checked at commit. */
export function validateContactProposals(raw: unknown): ContactProposal[] {
  return unique(list(raw, 4, item => {
    const row = object(item, ['kind', 'npcId', 'evidenceId', 'quote']);
    if (row.kind !== 'contact' && row.kind !== 'group') return fail('申请类型无效');
    return { kind: row.kind, npcId: id(row.npcId), evidenceId: id(row.evidenceId), quote: text(row.quote, 500) };
  }), row => row.kind + ':' + row.npcId);
}

/** New optional 1.12 field: old saves keep all existing profiles/history intact. */
export function parseNpcPhone(raw: unknown, s: WorldState, options: { retireControlled?: boolean } = {}): NpcPhoneState {
  const root = object(raw, ['version', 'meetings', 'evidence', 'requests', 'turns', 'relationships', 'groups', 'messages']);
  if (root.version !== 1) return fail('不支持的联系人版本');
  const meetings = unique(list(root.meetings, 500, item => {
    const r = object(item, ['id', 'owner', 'npcId', 'name', 'portraitId', 'summary', 'at', 'locationId']);
    if (!isCharacterPortraitId(r.portraitId)) return fail('立绘无效');
    return { id: id(r.id), owner: owner(r.owner), npcId: id(r.npcId), name: text(r.name, 40), portraitId: r.portraitId,
      summary: text(r.summary, 500), at: minute(r.at), locationId: id(r.locationId) };
  }), r => r.owner + ':' + r.npcId);
  const evidence = unique(list(root.evidence, 4000, item => {
    const r = object(item, ['id', 'owner', 'npcId', 'turnId', 'at', 'speaker', 'text']);
    if (r.speaker !== 'npc' && r.speaker !== 'player') return fail('对白来源无效');
    return { id: id(r.id), owner: owner(r.owner), npcId: id(r.npcId), turnId: id(r.turnId), at: minute(r.at), speaker: r.speaker as SpokenEvidence['speaker'], text: text(r.text, 2000) };
  }), r => r.id);
  const requests = unique(list(root.requests, 500, item => {
    const r = object(item, ['id', 'owner', 'npcId', 'kind', 'evidenceId', 'quote', 'status', 'at']);
    if (r.kind !== 'contact' && r.kind !== 'group') return fail('申请类型无效');
    if (r.status !== 'pending' && r.status !== 'accepted' && r.status !== 'declined') return fail('申请状态无效');
    return { id: id(r.id), owner: owner(r.owner), npcId: id(r.npcId), kind: r.kind as ContactProposal['kind'], evidenceId: id(r.evidenceId), quote: text(r.quote, 500), status: r.status as ContactRequest['status'], at: minute(r.at) };
  }), r => r.id);
  const turns = unique(list(root.turns, 2000, item => {
    const r = object(item, ['id','owner','proposals']);
    const proposals = typeof r.proposals === 'string' && r.proposals.length <= 8000 ? r.proposals : fail('申请回执无效');
    let parsed: unknown; try { parsed = JSON.parse(proposals); } catch { return fail('申请回执无效'); }
    if (JSON.stringify(validateContactProposals(parsed)) !== proposals) return fail('申请回执字段无效');
    return {id:id(r.id),owner:owner(r.owner),proposals};
  }), r => r.owner + ':' + r.id);
  const relationships = unique(list(root.relationships, 100, item => {
    const r = object(item, ['owner', 'npcId', 'contactId', 'requestId']);
    return { owner: owner(r.owner), npcId: id(r.npcId), contactId: id(r.contactId), requestId: id(r.requestId) };
  }), r => r.owner + ':' + r.npcId);
  const groups = unique(list(root.groups, 8, item => {
    const r = object(item, ['id', 'owner', 'name', 'memberIds', 'requestId', 'joinedAt', 'joinedAfter']);
    const groupDef = residentGroupById(String(r.id));
    if (!groupDef) return fail('群成员无效');
    const memberIds = unique(list(r.memberIds, groupDef.memberIds.length, id), r => r);
    if (memberIds.length !== groupDef.memberIds.length || memberIds.some(i => !groupDef.memberIds.includes(i) || !residentById(i))) return fail('群成员无效');
    return { id: id(r.id), owner: owner(r.owner), name: text(r.name, 40), memberIds, requestId: id(r.requestId), joinedAt: minute(r.joinedAt), joinedAfter: minute(r.joinedAfter) };
  }), r => r.owner + ':' + r.id);
  const messages = unique(list(root.messages, 10000, item => {
    const hasPlan = !!item && typeof item === 'object' && Object.hasOwn(item, 'responsePlan');
    const r = object(item, ['id', 'owner', 'channel', 'targetId', 'direction', 'speakerId', 'responderId', 'text', 'at', 'replyTo', 'status', ...(hasPlan ? ['responsePlan'] : [])]);
    if (r.channel !== 'npc' && r.channel !== 'group' || r.direction !== 'outgoing' && r.direction !== 'incoming' || !['pending', 'answered', 'silent'].includes(String(r.status))) return fail('会话字段无效');
    const responsePlan = hasPlan ? unique(list(r.responsePlan, 3, item => {
      const p = object(item, ['id', 'status']);
      if (!residentById(id(p.id)) || !['pending', 'answered', 'silent'].includes(String(p.status))) return fail('群聊发言计划无效');
      return { id: id(p.id), status: p.status as NpcTextMessage['status'] };
    }), p => p.id) : undefined;
    if (responsePlan && (r.channel !== 'group' || r.direction !== 'outgoing')) return fail('群聊发言计划来源无效');
    return { id: id(r.id), owner: owner(r.owner), channel: r.channel as NpcTextMessage['channel'], targetId: id(r.targetId), direction: r.direction as NpcTextMessage['direction'],
      speakerId: id(r.speakerId), responderId: r.responderId === null ? null : id(r.responderId), text: text(r.text), at: minute(r.at),
      replyTo: r.replyTo === null ? null : id(r.replyTo), status: r.status as NpcTextMessage['status'], ...(responsePlan ? {responsePlan} : {}) };
  }), r => r.id);
  for (const e of evidence) if (!meetings.some(m => m.owner === e.owner && m.npcId === e.npcId)) fail('对白缺少相遇记录');
  for (const r of requests) {
    if (!meetings.some(m => m.owner === r.owner && m.npcId === r.npcId) ||
      !evidence.some(e => e.owner === r.owner && e.npcId === r.npcId && e.turnId === r.evidenceId && e.speaker === 'npc' && e.text === r.quote)) fail('申请缺少原始对白');
  }
  for (const r of relationships) if (!requests.some(q => q.id === r.requestId && q.owner === r.owner && q.npcId === r.npcId && q.kind === 'contact' && q.status === 'accepted') ||
    contactFor(s, r.owner, r.npcId)?.id !== r.contactId) fail('关系与联系人不一致');
  for (const g of groups) if (g.joinedAfter > messages.length || g.joinedAt > gameMinute(s) || (!isBuiltinGroup(g) && !requests.some(q => q.id === g.requestId && q.owner === g.owner && q.kind === 'group' && q.status === 'accepted' && residentGroupForNpc(q.npcId)?.id === g.id))) fail('缺少已接受的群邀请');
  const candidateState: NpcPhoneState = { version: 1, meetings, evidence, requests, turns, relationships, groups, messages };
  for (const m of messages) {
    if (m.channel === 'npc' ? !contactFor(s, m.owner, m.targetId) : !effectiveGroups(candidateState, m.owner).some(g => g.owner === m.owner && g.id === m.targetId)) fail('短信缺少联系人或群成员资格');
    if (m.direction === 'outgoing') {
      if (m.speakerId !== m.owner || m.replyTo !== null ||
        m.responderId === null && m.status !== 'silent' && !m.responsePlan ||
        m.channel === 'npc' && m.responderId !== m.targetId ||
        m.channel === 'group' && m.responderId !== null && !residentById(m.responderId)) fail('发信身份无效');
      const replies = messages.filter(reply => reply.replyTo === m.id);
      if (m.responsePlan) {
        const pending = m.responsePlan.find(p => p.status === 'pending');
        const expected = pending ? 'pending' : m.responsePlan.some(p => p.status === 'answered') ? 'answered' : 'silent';
        if (m.responderId !== (pending?.id ?? null) || m.status !== expected ||
          replies.length !== m.responsePlan.filter(p => p.status === 'answered').length ||
          m.responsePlan.some(p => replies.filter(r => r.speakerId === p.id).length !== (p.status === 'answered' ? 1 : 0))) fail('群聊回复计划不一致');
      } else if (replies.length !== (m.status === 'answered' ? 1 : 0)) fail('短信回复数量不一致');
    } else if (m.replyTo === null && m.id === 'auto:' + m.owner + ':' + m.at && m.channel === 'npc' && m.speakerId === m.targetId && m.status === 'answered' && m.responderId === null) {
      // Strictly shaped unsolicited DM: the only incoming NPC message without a parent send.
    } else if (m.status !== 'answered' || m.responderId !== null || !messages.some(parent => parent.id === m.replyTo && parent.owner === m.owner &&
      parent.channel === m.channel && parent.targetId === m.targetId && parent.direction === 'outgoing' &&
      (parent.responsePlan ? parent.responsePlan.some(p => p.id === m.speakerId && p.status === 'answered') && m.id === parent.id + ':reply:' + m.speakerId : parent.responderId === m.speakerId))) fail('回复来源无效');
  }
  if ([...meetings, ...evidence, ...requests, ...messages].some(row => row.at > gameMinute(s))) fail('记录时间在未来');
  const result: NpcPhoneState = candidateState;
  if (options.retireControlled) retireControlledNpcThreads(result);
  return result;
}

/** Called when an existing resident becomes a controllable protagonist. */
export function retireControlledNpcThreads(social: NpcPhoneState): void {
  for (const request of social.requests) {
    if (request.status === 'pending' && isProtagonistPerson(request.npcId)) request.status = 'declined';
  }
  for (const message of social.messages) {
    if (message.direction !== 'outgoing') continue;
    if (message.channel === 'npc' && isProtagonistPerson(message.targetId)) {
      message.responderId = null; message.status = 'silent'; delete message.responsePlan;
      continue;
    }
    if (message.channel === 'group' && message.responsePlan) {
      message.responsePlan = message.responsePlan.filter(row => !isProtagonistPerson(row.id));
      const pending = message.responsePlan.find(row => row.status === 'pending');
      message.responderId = pending?.id ?? null;
      message.status = pending ? 'pending' : 'silent';
      if (!message.responsePlan.length) delete message.responsePlan;
    }
  }
}

function nearbyEncounterPerson(state: WorldState, npcId: string) {
  // Playable residents use the protagonist conversation path, including when
  // an older save still carries their former NPC meeting receipt.
  if (state.protagonists && isProtagonistPerson(npcId)) return null;
  if (!state.scene || state.scene.encounterId !== npcId) return null;
  const point = state.interior ?? state.scene;
  const people = state.interior
    ? getInteriorPeople(state.interior.roomId, state.contacts, state.clock, hiddenProtagonistPersons(state))
    : getScenePeople(state.scene, state.contacts, state.clock, hiddenProtagonistPersons(state));
  return people.find(person => person.id === npcId && Math.hypot(person.x - point.x, person.z - point.z) <= SCENE_ENCOUNTER_DISTANCE) ?? null;
}

/** Called only after the controlled, distance-checked encounter action. */
export function recordNpcEncounter(state: WorldState, npcId: string): WorldState {
  if (!state.scene) return state;
  const person = nearbyEncounterPerson(state, npcId);
  if (!person) return fail('没有发生有效的相遇');
  const s = enableProtagonists(state), who = activeProtagonist(s), social = ensure(s);
  if (!social.meetings.some(m => m.owner === who && m.npcId === npcId)) {
    if (social.meetings.length >= 500) return fail('相遇记录已满');
    social.meetings.push({ id: 'met:' + who + ':' + npcId, owner: who, npcId, name: person.candidateName,
      portraitId: person.portraitId, summary: residentById(npcId)?.publicProfile ?? person.description, at: gameMinute(s), locationId: s.locationId });
    s.protagonists!.revision++;
  }
  return s;
}

/** Save only explicit spoken dialogue, never player thoughts or omniscient prose. */
export function commitNpcDialogue(before: WorldState, after: WorldState, input: string, reply: GeneratedStory, turnId: string): WorldState {
  const who = activeProtagonist(before), metId = before.scene?.encounterId;
  const meeting = before.protagonists?.npcPhone?.meetings.find(m => m.owner === who && m.npcId === metId);
  const proposals = validateContactProposals(reply.contactRequests ?? []);
  const receipt = before.protagonists?.npcPhone?.turns.find(r => r.owner === who && r.id === turnId);
  if (before.story.some(row => row.id === turnId)) {
    if (receipt ? receipt.proposals !== JSON.stringify(proposals) : proposals.length > 0) return fail('重复剧情的联系申请不一致');
    return after;
  }
  if (!meeting || before.locationId !== after.locationId || before.interior?.roomId !== after.interior?.roomId ||
      !nearbyEncounterPerson(before, meeting.npcId) || !nearbyEncounterPerson(after, meeting.npcId)) {
    if (proposals.length) return fail('申请必须基于当面相遇及真实对白');
    return after;
  }
  const s = enableProtagonists(after), social = ensure(s);
  if (social.turns.length >= 2000) return fail('对白回执已满，请导出存档');
  social.turns.push({id:turnId,owner:who,proposals:JSON.stringify(proposals)});
  const aliases = new Set([meeting.npcId, meeting.name, contactFor(before, who, meeting.npcId)?.name, ...(residentById(meeting.npcId)?.aliases ?? [])]);
  const utterances = [
    ...parseNovelDialogue(input).filter(line => [who, protagonistNames[who], '我', '玩家'].includes(line.speaker)).map(line => ({ speaker: 'player' as const, text: line.text })),
    ...parseNovelDialogue(reply.text).filter(line => aliases.has(line.speaker)).map(line => ({ speaker: 'npc' as const, text: line.text })),
  ];
  const rows: SpokenEvidence[] = utterances.map((line, index) => ({ ...line, id: turnId + ':said:' + index, owner: who, npcId: meeting.npcId, turnId, at: gameMinute(s) }));
  for (const row of rows) {
    const existing = social.evidence.find(e => e.id === row.id);
    if (existing) { if (JSON.stringify(existing) !== JSON.stringify(row)) return fail('重复对白内容不一致'); }
    else { if (social.evidence.length >= 4000) return fail('对白记录已满，请导出存档'); social.evidence.push(row); }
  }
  for (const [index, proposal] of proposals.entries()) {
    if (proposal.npcId !== meeting.npcId) return fail('不能代替未在场人物提出申请');
    const evidenceId = proposal.evidenceId === 'current' ? turnId : proposal.evidenceId;
    if (!social.evidence.some(e => e.owner === who && e.npcId === proposal.npcId && e.turnId === evidenceId && e.speaker === 'npc' && e.text === proposal.quote)) return fail('申请引用的对白不存在');
    if (proposal.kind === 'contact' ? !/(联系|手机|号码|好友|短信|账号|連絡|電話|contact|phone)/i.test(proposal.quote)
      : !/(群聊|群里|入群|进群|加群|group)/i.test(proposal.quote)) return fail('对白没有提出相应联系请求');
    const targetGroup = proposal.kind === 'group' ? residentGroupForNpc(proposal.npcId) : undefined;
    if (proposal.kind === 'group' && (!targetGroup || !contactFor(s, who, proposal.npcId))) return fail('邀请人须是已认识的魔裁或五人组联系人');
    const requestId = turnId + ':contact:' + index;
    const duplicate = social.requests.find(q => q.id === requestId);
    if (duplicate) {
      if (duplicate.npcId !== proposal.npcId || duplicate.kind !== proposal.kind || duplicate.evidenceId !== evidenceId || duplicate.quote !== proposal.quote || duplicate.owner !== who) return fail('重复申请内容不一致');
      continue;
    }
    if (proposal.kind === 'contact' && contactFor(s, who, proposal.npcId) ||
        proposal.kind === 'group' && targetGroup && effectiveGroups(social, who).some(g => g.owner === who && g.id === targetGroup.id) ||
        social.requests.some(q => q.owner === who && q.npcId === proposal.npcId && q.kind === proposal.kind && q.status === 'pending')) continue;
    if (social.requests.length >= 500) return fail('联系人申请已满');
    social.requests.push({ id: requestId, owner: who, npcId: proposal.npcId, kind: proposal.kind, evidenceId, quote: proposal.quote, status: 'pending', at: gameMinute(s) });
  }
  if (rows.length || proposals.length) s.protagonists!.revision++;
  return s;
}

function hash(value: string): number {
  let n = 2166136261;
  for (const ch of value) n = Math.imul(n ^ ch.charCodeAt(0), 16777619);
  return n >>> 0;
}
/** Mutates only a cloned transaction; the caller handles save-before-publish. */
export function applyNpcPhoneCommand(s: WorldState, who: ProtagonistId, raw: NpcPhoneCommand, requestId: string): void {
  const command = parseNpcPhoneCommand(raw), social = ensure(s);
  if (who !== activeProtagonist(s)) return fail('请使用当前主角自己的手机');
  if (command.type === 'resolve_contact_request') {
    const request = social.requests.find(q => q.id === command.id && q.owner === who);
    if (!request) return fail('申请不存在或不属于这台手机');
    if (command.accept && request.npcId === controlledPerson(s)) return fail('该人物现在由玩家控制，不能再作为 NPC 联系人加入');
    const status = command.accept ? 'accepted' : 'declined';
    if (request.status !== 'pending') { if (request.status !== status) return fail('申请已经处理'); return; }
    if (command.accept) {
      if (request.kind === 'contact') {
        let contact = contactFor(s, who, request.npcId);
        const meeting = social.meetings.find(m => m.owner === who && m.npcId === request.npcId)!;
        if (!contact) {
          if (s.contacts.length >= 50) return fail('联系人已满');
          if (s.contacts.some(c => c.id === request.npcId || c.sourcePersonId === request.npcId)) return fail('人物 ID 冲突');
          if (s.contacts.some(c => c.name.trim() === meeting.name)) return fail('已有同名联系人，请先区分联系人姓名');
          contact = { id: request.npcId, sourcePersonId: request.npcId, name: meeting.name, summary: meeting.summary,
            portraitId: meeting.portraitId, isMain: true, affinity: 0, tag: '已结识的人物', status: '已交换联系方式' };
          s.contacts.push(contact);
        }
        if (!social.relationships.some(r => r.owner === who && r.npcId === request.npcId)) social.relationships.push({ owner: who, npcId: request.npcId, contactId: contact.id, requestId: request.id });
      } else {
        const targetGroup = residentGroupForNpc(request.npcId);
        if (!targetGroup) return fail('群邀请人不在固定群聊中');
        if (!effectiveGroups(social, who).some(g => g.owner === who && g.id === targetGroup.id)) {
          if (!contactFor(s, who, request.npcId)) return fail('群邀请人不再是联系人');
          social.groups.push({ id: targetGroup.id, owner: who, name: targetGroup.name, memberIds: [...targetGroup.memberIds], requestId: request.id, joinedAt: gameMinute(s), joinedAfter: social.messages.length });
        }
      }
    }
    request.status = status;
    return;
  }
  const channel = command.type === 'send_npc_message' ? 'npc' : 'group';
  const targetId = command.type === 'send_npc_message' ? command.npcId : command.groupId;
  let responderId: string | null;
  let responsePlan: NpcTextMessage['responsePlan'];
  if (channel === 'npc') {
    if (targetId === controlledPerson(s)) return fail('该人物现在由玩家控制，请切换到她的手机或使用主角之间的短信');
    if (!contactFor(s, who, targetId)) return fail('请先认识此人并保存联系人');
    responderId = targetId;
  } else {
    let group = social.groups.find(g => g.id === targetId && g.owner === who);
    if (!group && who === 'renako' && targetId === WATANARE_GROUP_ID) {
      group = { id: WATANARE_GROUP_ID, owner: 'renako', name: WATANARE_GROUP_NAME, memberIds: [...WATANARE_QUINTET_IDS], requestId: RENAKO_BUILTIN_GROUP_REQUEST_ID, joinedAt: 0, joinedAfter: 0 };
      social.groups.push(group);
    }
    if (!group) return fail('尚未接受这个群的邀请');
    // Residents who are controllable protagonists are not sampled as background NPCs.
    const candidates = group.memberIds.filter(i => i !== controlledPerson(s) && residentPresence(i, s.clock)?.available);
    const count = candidates.length ? 1 + hash(requestId + ':count') % Math.min(3, candidates.length) : 0;
    const selected = [...candidates].sort((a, b) => hash(requestId + ':' + a) - hash(requestId + ':' + b) || a.localeCompare(b)).slice(0, count);
    responsePlan = selected.map(id => ({id, status: 'pending'}));
    responderId = selected[0] ?? null;
  }
  if (social.messages.length >= 10000) return fail('短信记录已满，请先导出存档');
  social.messages.push({ id: 'npc:' + requestId, owner: who, channel, targetId, direction: 'outgoing', speakerId: who,
    responderId, text: command.text, at: gameMinute(s), replyTo: null, status: responderId ? 'pending' : 'silent', ...(responsePlan ? {responsePlan} : {}) });
}

export function npcReplySource(s: WorldState, messageId: string): NpcTextMessage {
  const source = s.protagonists?.npcPhone?.messages.find(m => m.id === messageId);
  if (!source || source.owner !== activeProtagonist(s) || source.direction !== 'outgoing' || source.replyTo !== null || !source.responderId && !source.responsePlan?.length) return fail('短信回复来源无效');
  if (source.responderId && source.responderId === controlledPerson(s)) return fail('该人物现在由玩家控制，不再自动回复');
  return source;
}
export function npcPhoneReplyContext(s: WorldState, messageId: string) {
  const source = npcReplySource(s, messageId), social = s.protagonists!.npcPhone!;
  if (source.status !== 'pending') return fail('这条短信已经处理');
  const actorId = source.responderId!, resident = residentById(actorId), contact = contactFor(s, source.owner, actorId);
  const meeting = social.meetings.find(m => m.owner === source.owner && m.npcId === actorId);
  const presence = residentPresence(actorId, s.clock);
  const residentAnchor = scenePersonAnchors.find(a => a.id === presence?.anchorId);
  const residentArea = residentAnchor ? getSceneArea(residentAnchor.x, residentAnchor.z) : null;
  let promptBudget = 24000;
  const thread = social.messages.filter(m => m.channel === source.channel && m.targetId === source.targetId && (source.channel === 'group' || m.owner === source.owner)).slice(-60).reverse().filter(m => { promptBudget -= m.text.length + 150; return promptBudget >= 0; }).reverse();
  const anchor = meeting ? scenePersonAnchors.find(a => {
    const person = s.scene && getScenePeople(s.scene, s.contacts, s.clock, hiddenProtagonistPersons(s)).find(p => p.id === actorId);
    return person && person.x === a.x && person.z === a.z;
  }) : undefined;
  const groupDef = source.channel === 'group' ? residentGroupById(source.targetId) : undefined;
  const baseGroupMembers = source.channel === 'group'
    ? (groupDef?.memberIds ?? residentCast.map(r => r.id)).map(memberId => ({ id: memberId, name: residentById(memberId)?.name ?? memberId }))
    : [];
  const extraGroupProtagonists = source.channel === 'group'
    ? social.groups.filter(g => g.id === source.targetId && !baseGroupMembers.some(m => m.id === PROTAGONIST_PERSON_IDS[g.owner])).map(g => ({ id: g.owner, name: protagonistNames[g.owner] }))
    : [];
  return {
    task: 'reply_to_npc_sms', actor: { id: actorId, name: resident?.name ?? contact?.name ?? meeting?.name,
      worldbook: resident?.profile ?? contact?.summary ?? meeting?.summary, publicProfile: resident?.publicProfile ?? null },
    sender: { id: source.owner, name: protagonistNames[source.owner] },
    message: source, clock: s.clock, minute: gameMinute(s),
    location: presence ? { ...presence, locationId: residentArea ? sceneLocationId(residentArea.id) : presence.locationId,
      position: residentAnchor ? { x:residentAnchor.x+.6,z:residentAnchor.z+.6 } : null }
      : { locationId: anchor?.id ?? null, activity: '未记录当前行程', available: null },
    // Only this NPC's face-to-face words and this one thread. No global story,
    // weekly summary, player journal, other protagonist, or other NPC's DM.
    knownDialogue: social.evidence.filter(e => e.owner === source.owner && e.npcId === actorId).slice(-12)
      .map(({ speaker, text, at }) => ({ speaker, text, at })),
    priorReceivedMessages: source.channel === 'npc' && contact
      ? s.phone.filter(m => m.npcId === contact.id && !social.messages.some(row => row.id === m.id)).slice(-12)
        .map(({ text, at }) => ({ text: text.slice(0,1000), at }))
      : [],
    messages: thread,
    group: source.channel === 'group' ? { id: source.targetId, name: groupDef?.name ?? MAJO_GROUP_NAME,
      members: [...baseGroupMembers, ...extraGroupProtagonists],
      rule: '你只扮演当前指定的这一位成员，其他被选成员会依次单独回复；可以回应本轮前面的群发言，不得冒充他人。群聊内容对成员可见，私聊与其他人物的经历不可见。' } : null,
    instruction: '玩家手动触发本次回复；发送者可能已经连续发送了多条短信，请结合 messages 中同一会话已存的短消息作自然的一次答复（无需逐条重复）。仅依据本人设定、已知对白、此会话和实际日程；可以用 text:null 表示暂不回复。不得读取玩家内心、其他人的私聊，不得替玩家同意邀请、捏造移动或日程。缺少证据的行程保持未知。',
  };
}

export function applyNpcPhoneReply(state: WorldState, messageId: string, raw: string | null, responderId?: string): WorldState {
  const s = enableProtagonists(state), source = npcReplySource(s, messageId), social = ensure(s);
  const reply = raw === null ? null : text(raw);
  if (source.responsePlan && !responderId) return fail('群聊回复缺少人物 ID');
  const actorId = responderId ?? source.responderId!;
  const decision = source.responsePlan?.find(p => p.id === actorId);
  if (source.responsePlan && !decision || !source.responsePlan && actorId !== source.responderId) return fail('回复人物不在本轮计划中');
  const existing = social.messages.find(m => m.replyTo === messageId && m.speakerId === actorId);
  const status = decision?.status ?? source.status;
  if (status !== 'pending') {
    if (status === 'silent' ? reply !== null : existing?.text !== reply) return fail('重复短信回复内容不一致');
    return s;
  }
  if (actorId !== source.responderId) return fail('群聊回复顺序不一致');
  if (reply !== null) {
    if (social.messages.length >= 10000 || s.phone.length >= 200) return fail('短信收件已满');
    social.messages.push({ id: source.id + ':reply' + (source.responsePlan ? ':' + actorId : ''), owner: source.owner, channel: source.channel, targetId: source.targetId,
      direction: 'incoming', speakerId: actorId, responderId: null, text: reply, at: gameMinute(s), replyTo: source.id, status: 'answered' });
    // Existing ST-iPhonie story delivery handles DM unread/read receipts.
    if (source.channel === 'npc') s.phone.push({ id: source.id + ':reply', npcId: contactFor(s, source.owner, source.targetId)!.id, text: reply, read: false,
      at: '第 ' + s.clock.day + ' 天 ' + String(s.clock.hour).padStart(2, '0') + ':' + String(s.clock.minute).padStart(2, '0') });
  }
  if (decision) {
    decision.status = reply === null ? 'silent' : 'answered';
    source.responderId = source.responsePlan!.find(p => p.status === 'pending')?.id ?? null;
    source.status = source.responderId ? 'pending' : source.responsePlan!.some(p => p.status === 'answered') ? 'answered' : 'silent';
  } else source.status = reply === null ? 'silent' : 'answered';
  // A manual reply may cover several short consecutive messages. Avoid leaving
  // older unsent-to-model segments perpetually pending in the persisted thread.
  // For groups preserve already-answered members while silencing only decisions
  // that were never generated. All other chats and owners remain isolated.
  const index = social.messages.indexOf(source);
  for (const prior of social.messages.slice(0, index)) {
    if (s.livehouse?.invitations.some(i => i.messageId === prior.id && i.status === 'pending')) continue;
    if (prior.direction !== 'outgoing' || prior.replyTo !== null ||
        prior.owner !== source.owner || prior.channel !== source.channel ||
        prior.targetId !== source.targetId || prior.status !== 'pending') continue;
    if (prior.responsePlan) {
      for (const candidate of prior.responsePlan) if (candidate.status === 'pending') candidate.status = 'silent';
      prior.responderId = null;
      prior.status = prior.responsePlan.some(candidate => candidate.status === 'answered') ? 'answered' : 'silent';
    } else {
      // A direct NPC send must retain its stable responderId for save parsing.
      prior.status = 'silent';
    }
  }
  s.protagonists!.revision++;
  return s;
}

export function npcPhoneView(s: WorldState, who: ProtagonistId) {
  const social = s.protagonists?.npcPhone ?? empty();
  const ownGroups = effectiveGroups(social, who).filter(g => g.owner === who);
  return {
    contacts: personState(s, who).contacts.filter(safeContact).map(c => ({ id: npcIdForContact(c), contactId: c.id, name: c.name })),
    requests: social.requests.filter(q => q.owner === who).map(q => ({ ...q, name: social.meetings.find(m => m.owner === who && m.npcId === q.npcId)?.name ?? q.npcId })),
    groups: ownGroups.map(g => ({ id: g.id, name: g.name,
      memberCount: g.memberIds.length + social.groups.filter(member => member.id === g.id && !g.memberIds.includes(PROTAGONIST_PERSON_IDS[member.owner] ?? '')).length })),
    messages: social.messages.filter((m, index) => m.owner === who && m.channel === 'npc' || m.channel === 'group' && ownGroups.some(g => g.owner === who && g.id === m.targetId && g.joinedAfter <= index)).map(m => ({ ...m,
      direction: m.direction === 'outgoing' && m.owner === who ? 'outgoing' : 'incoming',
      speakerName: m.direction === 'outgoing' ? (m.owner === who ? '我' : protagonistNames[m.owner]) : residentById(m.speakerId)?.name ?? contactFor(s, who, m.speakerId)?.name ?? m.speakerId })),
  };
}

export function contactProposalContext(s: WorldState) {
  const who = activeProtagonist(s), social = s.protagonists?.npcPhone;
  const meeting = social?.meetings.find(m => m.owner === who && m.npcId === s.scene?.encounterId && nearbyEncounterPerson(s, m.npcId));
  return meeting ? { npcId: meeting.npcId, name: meeting.name, worldbook: residentById(meeting.npcId)?.profile ?? meeting.summary,
    hasContact: !!contactFor(s, who, meeting.npcId), canInviteGroup: !!residentGroupForNpc(meeting.npcId) && !!contactFor(s, who, meeting.npcId),
    evidence: social!.evidence.filter(e => e.owner === who && e.npcId === meeting.npcId && e.speaker === 'npc').slice(-4).map(e => ({ evidenceId: e.turnId, quote: e.text })) } : null;
}

