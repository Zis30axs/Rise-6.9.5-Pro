<script setup lang="ts">
import { computed, ref } from 'vue';
import type { ShellActions, ShellModel } from './types';
import { activeProtagonist, protagonistNames } from '../runtime/protagonist-world';
import { musicPersonId, bandLeaderName } from '../runtime/livehouse';
import { allResidentCast } from '../runtime/npc-cast';
import { createSocietyState, type AdvisorSeat, type SocietyCommand } from '../runtime/society';

const props = defineProps<{ model: ShellModel; actions: ShellActions }>();
type SocietyTab = 'bands' | 'circles' | 'unions' | 'contests';
const tab = ref<SocietyTab>('bands');
const tabs: readonly { id: SocietyTab; name: string }[] = [
  { id: 'bands', name: '阵营与顾问' }, { id: 'circles', name: '社交圈' },
  { id: 'unions', name: '广域联合体' }, { id: 'contests', name: '竞争决议' },
];
const efforts: readonly { id: 'small' | 'medium' | 'large'; label: string }[] = [
  { id: 'small', label: '小幅争取' }, { id: 'medium', label: '积极争取' }, { id: 'large', label: '集中争取' },
];
const actor = computed(() => activeProtagonist(props.model.state));
const myId = computed(() => musicPersonId(actor.value));
const society = computed(() => props.model.state.protagonists?.society ?? createSocietyState());
const bands = computed(() => props.model.state.livehouse?.bands ?? []);
const myBands = computed(() => bands.value.filter(b => b.members.some(m => m.personId === myId.value)));
const ownedGroups = computed(() => [
  ...bands.value.filter(b => b.founder === actor.value).map(b => ({ id: `band:${b.id}`, name: b.name })),
  ...society.value.circles.filter(c => c.founder === actor.value).map(c => ({ id: `circle:${c.id}`, name: c.title })),
]);
const knownContacts = computed(() => [...new Map<string, { id: string; name: string }>(props.model.state.contacts
  .filter(c => (c.sourcePersonId ?? c.id) !== myId.value)
  .map(c => [c.sourcePersonId ?? c.id, { id: c.sourcePersonId ?? c.id, name: c.name }] as const)).values()]);
const invitationsForMe = computed(() => society.value.invitations.filter(i => i.status === 'pending' && i.personId === myId.value));
const seats: readonly { id: AdvisorSeat; name: string }[] = [
  { id: 'music', name: '音乐顾问' }, { id: 'social', name: '社交顾问' }, { id: 'operations', name: '组织顾问' },
];
const circleName = ref('');
const circleInvites = ref<Record<string, string>>({});
const unionName = ref('');
const unionFounderGroup = ref('');
const unionApplicants = ref<Record<string, string>>({});
const contestName = ref('');
const contestKind = ref<'person' | 'opportunity'>('person');
const contestPersonId = ref('');
const contestOpportunityId = ref('opportunity:shared_event');
const contestDays = ref(3);
const feedback = ref('');
let serial = 0;
const requestId = () => `social-ui:${Date.now().toString(36)}:${++serial}`;
const resourceId = (prefix: string) => `${prefix}-${actor.value}-${Date.now().toString(36)}-${++serial}`;
const names = Object.fromEntries(Object.entries(protagonistNames).map(([id, name]) => [musicPersonId(id as keyof typeof protagonistNames), name]));
function personName(id: string) {
  return names[id] ?? allResidentCast.find(p => p.id === id)?.name
    ?? props.model.state.contacts.find(c => c.sourcePersonId === id || c.id === id)?.name ?? id;
}
function groupName(id: string) {
  if (id.startsWith('circle:')) return society.value.circles.find(c => `circle:${c.id}` === id)?.title ?? id;
  if (id.startsWith('band:')) return bands.value.find(b => `band:${b.id}` === id)?.name ?? id;
  return id;
}
function advisorFor(bandId: string, seat: AdvisorSeat) {
  const band = bands.value.find(b => b.id === bandId);
  const id = society.value.advisors.find(a => a.bandId === bandId && a.seat === seat)?.personId;
  return band?.members.some(m => m.personId === id) ? id ?? '' : '';
}
async function send(command: SocietyCommand): Promise<boolean> {
  if (props.model.busy) return false;
  feedback.value = '';
  try {
    const priorRevision = props.model.state.protagonists?.revision ?? -1;
    // Administrative decisions are instantaneous local writes, never narrative interactions.
    props.actions.dispatch({ type: 'society', requestId: requestId(), command });
    const saved = !props.model.notice && (props.model.state.protagonists?.revision ?? -1) > priorRevision;
    feedback.value = saved ? '已写入本地游戏存档。' : props.model.notice || '操作未完成。';
    return saved;
  } catch (error) {
    feedback.value = error instanceof Error ? error.message : '操作未成功。';
    return false;
  }
}
async function changeAdvisor(bandId: string, seat: AdvisorSeat, event: Event) {
  const personId = (event.target as HTMLSelectElement).value;
  if (personId) await send({ type: 'appoint_advisor', bandId, seat, personId });
  else if (advisorFor(bandId, seat)) await send({ type: 'dismiss_advisor', bandId, seat });
  (event.target as HTMLSelectElement).value = advisorFor(bandId, seat);
}
async function createCircle() {
  if (!circleName.value.trim()) return;
  if (await send({ type: 'create_circle', id: resourceId('circle'), title: circleName.value.trim() })) circleName.value = '';
}
async function invite(circleId: string) {
  const personId = circleInvites.value[circleId];
  if (personId && await send({ type: 'invite_circle', circleId, personId })) circleInvites.value[circleId] = '';
}
async function createUnion() {
  if (!unionName.value.trim() || !unionFounderGroup.value) return;
  if (await send({ type: 'create_union', id: resourceId('union'), title: unionName.value.trim(), groupId: unionFounderGroup.value })) unionName.value = '';
}
async function joinUnion(unionId: string) {
  const groupId = unionApplicants.value[unionId];
  if (groupId && await send({ type: 'propose_union', unionId, groupId })) unionApplicants.value[unionId] = '';
}
async function openContest() {
  const targetId = contestKind.value === 'person' ? contestPersonId.value : contestOpportunityId.value.trim();
  if (!contestName.value.trim() || !targetId) return;
  if (await send({ type: 'open_contest', id: resourceId('contest'), title: contestName.value.trim(), targetId,
    targetKind: contestKind.value, durationMinutes: Number(contestDays.value) * 1440 })) contestName.value = '';
}
function remaining(closesAt: number) {
  const now = (props.model.state.clock.day - 1) * 1440 + props.model.state.clock.hour * 60 + props.model.state.clock.minute;
  const minutes = Math.max(0, closesAt - now);
  return minutes ? `${Math.ceil(minutes / 60)} 小时` : '已到截止时间';
}
</script>

<template>
  <section class="society-panel" data-testid="society-panel" aria-label="阵营与社交圈管理">
    <header class="society-head">
      <div><h2>阵营与社交圈</h2><p>{{ protagonistNames[actor] }} · 本地组织管理</p></div>
      <span>共 {{ society.circles.length + society.unions.length + bands.length }} 个组织</span>
    </header>
    <nav class="society-tabs" aria-label="组织管理分类">
      <button v-for="item in tabs" :key="item.id" type="button" :aria-current="tab===item.id?'page':undefined" :class="{ active:tab===item.id }" @click="tab=item.id">{{ item.name }}</button>
    </nav>
    <p v-if="feedback" class="society-message" role="status">{{ feedback }}</p>

    <template v-if="tab==='bands'">
      <p class="society-help">乐队 Leader 可以从在队成员中任命顾问；成员离队后，也会卸任顾问。</p>
      <article v-for="band in myBands" :key="band.id" class="society-card">
        <div class="society-row"><h3>{{ band.name }}</h3><small>{{ band.founder===actor?'你是 Leader':'你是成员' }}</small></div>
        <p>Leader：{{ bandLeaderName(band) }}</p>
        <p>成员：{{ band.members.map(m=>m.name).join('、') }}</p>
        <div class="society-grid">
          <label v-for="seat in seats" :key="seat.id" class="society-field">
            <span>{{ seat.name }}</span>
            <select :value="advisorFor(band.id,seat.id)" :disabled="model.busy||band.founder!==actor" @change="changeAdvisor(band.id,seat.id,$event)">
              <option value="">未任命</option>
              <option v-for="member in band.members" :key="member.personId" :value="member.personId">{{ member.name }}</option>
            </select>
          </label>
        </div>
      </article>
      <p v-if="!myBands.length" class="society-empty">目前没有你正式加入的乐队。乐队的创建与成员邀请仍在 Live House 完成。</p>
    </template>

    <template v-else-if="tab==='circles'">
      <form class="society-form" @submit.prevent="createCircle">
        <label class="society-field"><span>创建小小的社交圈</span><input v-model="circleName" maxlength="60" placeholder="为新的社交圈取名" required></label>
        <button type="submit" :disabled="model.busy||!circleName.trim()">建立社交圈</button>
      </form>
      <section v-if="invitationsForMe.length" class="society-card" aria-label="等待你的社交圈邀请">
        <h3>邀请你加入</h3>
        <div v-for="inv in invitationsForMe" :key="inv.id" class="society-row">
          <span>{{ society.circles.find(c=>c.id===inv.circleId)?.title }} · 来自{{ protagonistNames[inv.from] }}</span>
          <div class="society-actions"><button :disabled="model.busy" @click="send({type:'accept_circle',invitationId:inv.id,accepted:true})">加入</button><button class="muted" :disabled="model.busy" @click="send({type:'accept_circle',invitationId:inv.id,accepted:false})">婉拒</button></div>
        </div>
      </section>
      <article v-for="circle in society.circles" :key="circle.id" class="society-card">
        <div class="society-row"><h3>{{ circle.title }}</h3><span class="society-meta">{{ circle.founder===actor?'由你创建':`${protagonistNames[circle.founder]}创建` }}</span></div>
        <p>成员：{{ circle.memberIds.map(personName).join('、') }}</p>
        <p v-if="society.invitations.some(i=>i.circleId===circle.id&&i.status==='pending')" class="society-help">还有 {{ society.invitations.filter(i=>i.circleId===circle.id&&i.status==='pending').length }} 份邀请等待答复；发出邀请不等于对方同意。</p>
        <div v-if="circle.memberIds.includes(myId)" class="society-actions">
          <select v-model="circleInvites[circle.id]" aria-label="选择邀请对象" :disabled="model.busy">
            <option value="">选择已认识的人物</option>
            <option v-for="contact in knownContacts.filter(c=>!circle.memberIds.includes(c.id))" :key="contact.id" :value="contact.id">{{ contact.name }}</option>
          </select>
          <button :disabled="model.busy||!circleInvites[circle.id]" @click="invite(circle.id)">发送邀请</button>
          <button v-if="circle.founder!==actor" class="muted" :disabled="model.busy" @click="send({type:'leave_circle',circleId:circle.id})">退出</button>
        </div>
      </article>
      <p v-if="!society.circles.length" class="society-empty">尚无社交圈。它没有内阁或顾问，只保存真实参加者与共同活动关系。</p>
    </template>

    <template v-else-if="tab==='unions'">
      <p class="society-help">广域联合体可容纳多个独立乐队和社交圈。加入不改变原组织领导权，也不等于跨组织成员自动相识。</p>
      <form class="society-form" @submit.prevent="createUnion">
        <label class="society-field"><span>联合体名称</span><input v-model="unionName" maxlength="60" placeholder="例如：东京音乐交流网络" required></label>
        <label class="society-field"><span>发起组织</span><select v-model="unionFounderGroup" required><option value="">选择你负责的组织</option><option v-for="g in ownedGroups" :key="g.id" :value="g.id">{{ g.name }}</option></select></label>
        <button type="submit" :disabled="model.busy||!unionName.trim()||!unionFounderGroup">发起联合体</button>
      </form>
      <article v-for="union in society.unions" :key="union.id" class="society-card">
        <div class="society-row"><h3>{{ union.title }}</h3><small>协调者：{{ protagonistNames[union.coordinator] }}</small></div>
        <p>组织：{{ union.groupIds.map(groupName).join('、') }}</p>
        <div class="society-actions" v-if="ownedGroups.some(g=>!union.groupIds.includes(g.id))">
          <select v-model="unionApplicants[union.id]" aria-label="申请加入联合体的组织"><option value="">选择你负责的组织</option><option v-for="group in ownedGroups.filter(g=>!union.groupIds.includes(g.id))" :key="group.id" :value="group.id">{{ group.name }}</option></select>
          <button :disabled="model.busy||!unionApplicants[union.id]" @click="joinUnion(union.id)">申请加入</button>
        </div>
        <div v-for="app in society.applications.filter(a=>a.unionId===union.id)" :key="app.id" class="society-row">
          <span>待审核：{{ groupName(app.groupId) }}</span>
          <div v-if="union.coordinator===actor" class="society-actions"><button :disabled="model.busy" @click="send({type:'approve_union',applicationId:app.id,accepted:true})">同意</button><button class="muted" :disabled="model.busy" @click="send({type:'approve_union',applicationId:app.id,accepted:false})">拒绝</button></div>
        </div>
        <div class="society-actions" v-if="union.groupIds.length>1">
          <button v-for="group in ownedGroups.filter(g=>union.groupIds.includes(g.id))" :key="group.id" class="muted" :disabled="model.busy" @click="send({type:'leave_union',unionId:union.id,groupId:group.id})">{{ group.name }}退出联合体</button>
        </div>
      </article>
      <p v-if="!society.unions.length" class="society-empty">尚无广域联合体。先创建自己的社交圈，或在 Live House 拥有正式乐队。</p>
    </template>

    <template v-else>
      <p class="society-help">共享竞争采用独立影响力账本：各方争取同一对象或机会，到期比较有效支持。领先不代表人物已同意，也不会自动占用演出档期。</p>
      <form class="society-form" @submit.prevent="openContest">
        <label class="society-field"><span>竞争决议名称</span><input v-model="contestName" maxlength="60" placeholder="例如：争取共同演出机会" required></label>
        <label class="society-field"><span>目标类型</span><select v-model="contestKind"><option value="person">已认识的人物</option><option value="opportunity">共享机会</option></select></label>
        <label v-if="contestKind==='person'" class="society-field"><span>争取对象</span><select v-model="contestPersonId" required><option value="">请选择</option><option v-for="contact in knownContacts" :key="contact.id" :value="contact.id">{{ contact.name }}</option></select></label>
        <label v-else class="society-field"><span>机会编号</span><input v-model="contestOpportunityId" maxlength="80" pattern="opportunity:[A-Za-z0-9_:-]+" required></label>
        <label class="society-field"><span>期限（游戏日）</span><select v-model.number="contestDays"><option v-for="day in [1,2,3,5,7]" :key="day" :value="day">{{ day }} 天</option></select></label>
        <button type="submit" :disabled="model.busy||!contestName.trim()||(contestKind==='person'?!contestPersonId:!contestOpportunityId.trim())">发起共享决议</button>
      </form>
      <article v-for="contest in [...society.contests].reverse()" :key="contest.id" class="society-card">
        <div class="society-row"><h3>{{ contest.title }}</h3><small>{{ contest.status==='resolved'?'已结束':`剩余 ${remaining(contest.closesAt)}` }}</small></div>
        <p>争取目标：{{ contest.targetKind==='person'?personName(contest.targetId):contest.targetId }}</p>
        <div v-for="who in contest.participants" :key="who" class="society-score">
          <div class="society-row"><span>{{ protagonistNames[who] }}</span><strong>{{ contest.influence[who]??0 }} 影响力</strong></div>
          <div class="society-meter"><span :style="{width:Math.min(100,Math.round((contest.influence[who]??0)/Math.max(1,...Object.values(contest.influence))*100))+'%'}"></span></div>
        </div>
        <p v-if="contest.status==='resolved'">{{ contest.winner?`${protagonistNames[contest.winner]}影响力胜出`:'无人取得决定性优势' }}</p>
        <div v-else class="society-actions">
          <button v-if="!contest.participants.includes(actor)" :disabled="model.busy" @click="send({type:'join_contest',contestId:contest.id})">参与竞争</button>
          <template v-else><button v-for="effort in efforts" :key="effort.id" :disabled="model.busy" @click="send({type:'contribute_contest',contestId:contest.id,effort:effort.id})">{{ effort.label }}</button><button class="muted" :disabled="model.busy" @click="send({type:'withdraw_contest',contestId:contest.id})">退出竞争</button></template>
        </div>
      </article>
      <p v-if="!society.contests.length" class="society-empty">目前没有共享竞争决议。</p>
    </template>
  </section>
</template>

<style scoped>
.society-panel{display:grid;gap:14px;min-width:0;color:var(--text-color,inherit)}.society-head,.society-row{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}.society-head h2{font-size:1.18rem;margin:0}.society-head p,.society-help,.society-empty,.society-meta,.society-head span{font-size:.78rem;opacity:.72;line-height:1.55;margin:3px 0}.society-tabs,.society-actions{display:flex;gap:7px;flex-wrap:wrap}.society-tabs button,.society-actions button,.society-form button{border:1px solid rgba(121,131,153,.4);border-radius:9px;padding:9px 11px;background:rgba(121,131,153,.10);color:inherit;cursor:pointer;font-size:.8rem}.society-tabs button.active{background:rgba(97,137,190,.22);border-color:rgba(97,137,190,.7);font-weight:700}.society-actions button.muted{opacity:.73}.society-panel button:disabled{opacity:.45;cursor:not-allowed}.society-card,.society-form{border:1px solid rgba(121,131,153,.22);border-radius:13px;padding:14px;display:grid;gap:12px;min-width:0}.society-card h3{margin:0;font-size:.99rem}.society-card p{margin:0;font-size:.82rem;line-height:1.5}.society-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:9px}.society-field{display:grid;gap:5px;min-width:0}.society-field span{font-size:.75rem;opacity:.83}.society-panel input,.society-panel select{width:100%;min-width:0;box-sizing:border-box;padding:10px;border:1px solid rgba(121,131,153,.45);border-radius:9px;color:inherit;background:var(--surface-secondary,#8881);font:inherit;font-size:.82rem}.society-actions select{flex:1 1 150px;width:auto}.society-message{padding:10px;border:1px solid rgba(97,137,190,.4);border-radius:10px;font-size:.81rem;margin:0}.society-score{display:grid;gap:4px}.society-score .society-row{font-size:.78rem}.society-meter{height:7px;border-radius:20px;overflow:hidden;background:rgba(121,131,153,.18)}.society-meter span{display:block;height:100%;background:#759fd2;border-radius:inherit}@media(max-width:520px){.society-card,.society-form{padding:10px}.society-tabs button{flex:1 1 40%;padding:10px 5px}}
</style>
