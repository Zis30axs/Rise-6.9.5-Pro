<script setup lang="ts">
import { computed, ref } from 'vue';
import MapCharacterAvatar from './MapCharacterAvatar.vue';
import type { ShellActions, ShellModel } from './types';
import { activeProtagonist, protagonistNames } from '../runtime/protagonist-world';
import { musicPersonId, bandLeaderName } from '../runtime/livehouse';
import { allResidentCast } from '../runtime/npc-cast';
import { createSocietyState, type AdvisorSeat, type SocietyCommand } from '../runtime/society';
import { formatNpcTraitModifiers, resolveNpcTraits, type NpcTraitDefinition } from '../runtime/npc-traits';
import { MODIFIER_TARGET_LABELS, type ModifierTarget, type StrategyModifier } from '../runtime/strategy';
import FactionFocusSection from './FactionFocusSection.vue';

const props = defineProps<{ model: ShellModel; actions: ShellActions }>();
type SocietyTab = 'bands' | 'circles' | 'unions';
const tab = ref<SocietyTab>('bands');
const tabs: readonly { id: SocietyTab; name: string }[] = [
  { id: 'bands', name: '乐队与顾问' },
  { id: 'circles', name: '社交圈' },
  { id: 'unions', name: '联合体' },
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
const seats: readonly { id: AdvisorSeat; icon: string; name: string; roleNote: string }[] = [
  { id: 'music', icon: '♪', name: '音乐顾问', roleNote: '曲风统筹与排练' },
  { id: 'social', icon: '✦', name: '社交顾问', roleNote: '联络与协调' },
  { id: 'operations', icon: '⚙', name: '组织顾问', roleNote: '日程与后勤' },
];

function advisorTraitsFor(band: (typeof myBands.value)[number], seatId: AdvisorSeat): readonly NpcTraitDefinition[] {
  const personId = advisorFor(band.id, seatId);
  if (!personId) return [];
  const member = band.members.find(m => m.personId === personId);
  const contact = props.model.state.contacts.find(c => c.sourcePersonId === personId || c.id === personId);
  return resolveNpcTraits({
    id: contact?.id ?? personId,
    personId,
    sourcePersonId: contact?.sourcePersonId ?? personId,
    name: contact?.name ?? member?.name ?? personId,
    tag: contact?.tag,
    summary: contact?.summary,
    status: contact?.status,
  });
}

function bandAdvisorSummary(band: (typeof myBands.value)[number]): readonly string[] {
  const seen = new Set<string>();
  const mods: StrategyModifier[] = [];
  for (const seat of seats) {
    const personId = advisorFor(band.id, seat.id);
    if (!personId) continue;
    for (const item of advisorTraitsFor(band, seat.id)) {
      const key = `${personId}:${item.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      mods.push(...item.modifiers);
    }
  }
  if (!mods.length) return [];
  const grouped = new Map<ModifierTarget, { adds: number; mult: number }>();
  for (const mod of mods) {
    const entry = grouped.get(mod.target) ?? { adds: 0, mult: 1 };
    if (mod.operation === 'add') entry.adds += mod.amount;
    else entry.mult *= mod.amount;
    grouped.set(mod.target, entry);
  }
  const lines: string[] = [];
  for (const [target, { adds, mult }] of grouped) {
    const label = MODIFIER_TARGET_LABELS[target];
    const parts: string[] = [];
    if (adds !== 0) parts.push(`${adds > 0 ? '+' : ''}${Math.round(adds * 100) / 100}`);
    if (mult !== 1) parts.push(`× ${Math.round(mult * 100) / 100}`);
    if (parts.length) lines.push(`${label} ${parts.join(' ')}`);
  }
  return lines;
}

const circleName = ref('');
const circleInvites = ref<Record<string, string>>({});
const unionName = ref('');
const unionFounderGroup = ref('');
const unionApplicants = ref<Record<string, string>>({});
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
    feedback.value = saved ? '组织安排已更新。' : props.model.notice || '操作未完成。';
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
</script>

<template>
  <section class="society-panel" data-testid="society-panel" aria-label="乐队与社交圈">
    <nav class="soc-seg" aria-label="组织分类">
      <button
        v-for="item in tabs"
        :key="item.id"
        type="button"
        :aria-current="tab === item.id ? 'page' : undefined"
        :class="{ active: tab === item.id }"
        @click="tab = item.id"
      >
        <span>{{ item.name }}</span>
        <i v-if="item.id === 'circles' && invitationsForMe.length" class="soc-cnt">{{ invitationsForMe.length }}</i>
      </button>
    </nav>

    <p v-if="feedback" class="society-message" role="status">{{ feedback }}</p>

    <!-- TAB 1: Bands & Advisors -->
    <template v-if="tab === 'bands'">
      <article v-for="band in myBands" :key="band.id" class="society-card">
        <div class="society-row">
          <h3>{{ band.name }}</h3>
          <span class="soc-tag" :class="{ founder: band.founder === actor }">{{ band.founder===actor?'负责人':'成员' }}</span>
        </div>

        <div class="soc-roster">
          <div v-for="member in band.members" :key="member.personId" class="soc-mem" :class="{ lead: member.name === bandLeaderName(band) }">
            <div class="soc-mem-av">
              <MapCharacterAvatar :name="member.name" :person-id="member.personId" />
            </div>
            <div class="soc-mem-name">{{ member.name }}</div>
            <div class="soc-mem-role">{{ member.name === bandLeaderName(band) ? `队长 · ${member.role || '成员'}` : (member.role || '成员') }}</div>
          </div>
        </div>

        <div class="soc-advisor-grid">
          <label v-for="seat in seats" :key="seat.id" class="society-field soc-advisor-slot" :class="{ filled: !!advisorFor(band.id, seat.id) }">
            <div class="soc-advisor-head">
              <span aria-hidden="true">{{ seat.icon }}</span>
              <strong>{{ seat.name }}</strong>
              <small>{{ seat.roleNote }}</small>
            </div>
            <select :value="advisorFor(band.id,seat.id)" :disabled="model.busy||band.founder!==actor" @change="changeAdvisor(band.id,seat.id,$event)">
              <option value="">未任命</option>
              <option v-for="member in band.members" :key="member.personId" :value="member.personId">{{ member.name }}</option>
            </select>
            <div v-if="advisorTraitsFor(band, seat.id).length" class="soc-advisor-traits">
              <div v-for="item in advisorTraitsFor(band, seat.id)" :key="item.id" class="soc-advisor-trait">
                <strong>{{ item.icon }} {{ item.title }}</strong>
                <span v-if="formatNpcTraitModifiers(item).length">{{ formatNpcTraitModifiers(item).join(' · ') }}</span>
              </div>
            </div>
          </label>
        </div>

        <div v-if="bandAdvisorSummary(band).length" class="soc-buffs">
          <span v-for="line in bandAdvisorSummary(band)" :key="line" class="soc-buff-pill">{{ line }}</span>
        </div>
      </article>
      <p v-if="!myBands.length" class="society-empty">目前没有正式加入的乐队。乐队的创建与成员邀请可在 Live House 完成。</p>
    </template>

    <!-- TAB 2: Social Circles -->
    <template v-else-if="tab === 'circles'">
      <section v-if="invitationsForMe.length" class="society-card soc-invite-card" aria-label="等待你的社交圈邀请">
        <h3>邀请你加入</h3>
        <div v-for="inv in invitationsForMe" :key="inv.id" class="society-row">
          <span>{{ society.circles.find(c=>c.id===inv.circleId)?.title }} · 来自{{ protagonistNames[inv.from] }}</span>
          <div class="society-actions">
            <button :disabled="model.busy" @click="send({type:'accept_circle',invitationId:inv.id,accepted:true})">加入</button>
            <button class="muted" :disabled="model.busy" @click="send({type:'accept_circle',invitationId:inv.id,accepted:false})">婉拒</button>
          </div>
        </div>
      </section>

      <form class="society-form" @submit.prevent="createCircle">
        <input v-model="circleName" maxlength="60" placeholder="新的社交圈名称…" aria-label="社交圈名称" required>
        <button type="submit" :disabled="model.busy||!circleName.trim()">建立社交圈</button>
      </form>

      <article v-for="circle in society.circles" :key="circle.id" class="society-card">
        <div class="society-row">
          <h3>{{ circle.title }}</h3>
          <span class="soc-tag" :class="{ founder: circle.founder === actor }">{{ circle.founder===actor?'由你创建':`${protagonistNames[circle.founder]}创建` }}</span>
        </div>
        <p class="soc-line">成员：{{ circle.memberIds.map(personName).join('、') }}</p>
        <p v-if="society.invitations.some(i=>i.circleId===circle.id&&i.status==='pending')" class="society-help">还有 {{ society.invitations.filter(i=>i.circleId===circle.id&&i.status==='pending').length }} 份邀请等待答复；发出邀请不代表人物已同意。</p>
        <div v-if="circle.memberIds.includes(myId)" class="society-actions">
          <select v-model="circleInvites[circle.id]" aria-label="选择邀请对象" :disabled="model.busy">
            <option value="">选择已认识的人物</option>
            <option v-for="contact in knownContacts.filter(c=>!circle.memberIds.includes(c.id))" :key="contact.id" :value="contact.id">{{ contact.name }}</option>
          </select>
          <button :disabled="model.busy||!circleInvites[circle.id]" @click="invite(circle.id)">发送邀请</button>
          <button v-if="circle.founder!==actor" class="muted" :disabled="model.busy" @click="send({type:'leave_circle',circleId:circle.id})">退出</button>
        </div>
      </article>
      <p v-if="!society.circles.length" class="society-empty">尚无社交圈。发出邀请不代表人物已同意。</p>
    </template>

    <!-- TAB 3: Unions -->
    <template v-else>
      <p class="society-help">联合体可容纳多个独立乐队和社交圈。加入不改变原组织领导权，不代表人物已同意其他安排，也不会自动占用演出档期。</p>
      <form class="society-form soc-union-form" @submit.prevent="createUnion">
        <input v-model="unionName" maxlength="60" placeholder="联合体名称（如：学园乐队联合会）" aria-label="联合体名称" required>
        <select v-model="unionFounderGroup" aria-label="发起组织" required>
          <option value="">选择你负责的组织</option>
          <option v-for="g in ownedGroups" :key="g.id" :value="g.id">{{ g.name }}</option>
        </select>
        <button type="submit" :disabled="model.busy||!unionName.trim()||!unionFounderGroup">发起联合体</button>
      </form>

      <article v-for="union in society.unions" :key="union.id" class="society-card">
        <div class="society-row">
          <h3>{{ union.title }}</h3>
          <span class="soc-tag" :class="{ founder: union.coordinator === actor }">协调者：{{ protagonistNames[union.coordinator] }}</span>
        </div>
        <p class="soc-line">成员组织：{{ union.groupIds.map(groupName).join('、') }}</p>
        <div class="society-actions" v-if="ownedGroups.some(g=>!union.groupIds.includes(g.id))">
          <select v-model="unionApplicants[union.id]" aria-label="申请加入联合体的组织">
            <option value="">选择你负责的组织</option>
            <option v-for="group in ownedGroups.filter(g=>!union.groupIds.includes(g.id))" :key="group.id" :value="group.id">{{ group.name }}</option>
          </select>
          <button :disabled="model.busy||!unionApplicants[union.id]" @click="joinUnion(union.id)">申请加入</button>
        </div>
        <div v-for="app in society.applications.filter(a=>a.unionId===union.id)" :key="app.id" class="society-row">
          <span>待审核：{{ groupName(app.groupId) }}</span>
          <div v-if="union.coordinator===actor" class="society-actions">
            <button :disabled="model.busy" @click="send({type:'approve_union',applicationId:app.id,accepted:true})">同意</button>
            <button class="muted" :disabled="model.busy" @click="send({type:'approve_union',applicationId:app.id,accepted:false})">拒绝</button>
          </div>
        </div>
        <div class="society-actions" v-if="union.groupIds.length>1">
          <button v-for="group in ownedGroups.filter(g=>union.groupIds.includes(g.id))" :key="group.id" class="muted" :disabled="model.busy" @click="send({type:'leave_union',unionId:union.id,groupId:group.id})">{{ group.name }}退出联合体</button>
        </div>
      </article>
      <p v-if="!society.unions.length" class="society-empty">尚无联合体。先创建自己的社交圈，或在 Live House 拥有正式乐队。</p>
    </template>

    <details class="soc-faction-fold">
      <summary>阵营共同路线</summary>
      <FactionFocusSection :model="model" :actions="actions" />
    </details>
  </section>
</template>
