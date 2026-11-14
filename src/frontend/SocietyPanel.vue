<script setup lang="ts">
import { computed, ref } from 'vue';
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
const tabs: readonly { id: SocietyTab; code: string; name: string }[] = [
  { id: 'bands', code: 'CABINET', name: '阵营与顾问' },
  { id: 'circles', code: 'CIRCLES', name: '社交圈' },
  { id: 'unions', code: 'SPHERE', name: '广域联合体' },
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
  { id: 'music', icon: '♪', name: '音乐顾问', roleNote: '曲风统筹与排练督导' },
  { id: 'social', icon: '✦', name: '社交顾问', roleNote: '对外联络与成员协调' },
  { id: 'operations', icon: '⚙', name: '组织顾问', roleNote: '日程规划与现场后勤' },
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
  <section class="society-panel tno-society-screen" data-testid="society-panel" aria-label="阵营与社交圈管理">
    <div class="tno-crt-lines" aria-hidden="true"></div>

    <!-- Top TNO Command Header -->
    <header class="society-head tno-society-header">
      <div>
        <small class="tno-kicker">FACTION CABINET &amp; SPHERE // 组织与阵营终端</small>
        <h2>阵营与社交圈</h2>
        <p>{{ protagonistNames[actor] }} · 所属组织与人际联系</p>
      </div>
      <div class="tno-head-badges">
        <span v-if="invitationsForMe.length" class="tno-alert-pill">{{ invitationsForMe.length }} 份待处理邀请</span>
        <span class="tno-total-pill">共 {{ society.circles.length + society.unions.length + bands.length }} 个组织</span>
      </div>
    </header>

    <!-- TNO 3-Tab Tactical Navigation -->
    <nav class="society-tabs tno-tabs" aria-label="组织管理分类">
      <button
        v-for="item in tabs"
        :key="item.id"
        type="button"
        :aria-current="tab === item.id ? 'page' : undefined"
        :class="{ active: tab === item.id }"
        @click="tab = item.id"
      >
        <small>{{ item.code }}</small>
        <span>{{ item.name }}</span>
      </button>
    </nav>

    <p v-if="feedback" class="society-message" role="status">{{ feedback }}</p>

    <!-- TAB 1: Faction Cabinet & Advisors -->
    <template v-if="tab === 'bands'">
      <p class="society-help">乐队 Leader 可以从在队成员中任命顾问；成员离队后，也会卸任顾问。</p>
      <article v-for="band in myBands" :key="band.id" class="society-card tno-cabinet-card">
        <div class="society-row tno-card-top">
          <div>
            <small class="tno-card-kicker">FACTION ROSTER // 正式乐队阵营</small>
            <h3>{{ band.name }}</h3>
          </div>
          <small class="tno-role-badge" :class="{ founder: band.founder === actor }">{{ band.founder===actor?'你是 Leader':'你是成员' }}</small>
        </div>

        <div class="tno-member-strip">
          <p>Leader：{{ bandLeaderName(band) }}</p>
          <span class="tno-strip-label">在册成员：</span>
          <p>成员：{{ band.members.map(m=>m.name).join('、') }}</p>
        </div>

        <!-- TNO 3-Slot Cabinet Minister Row -->
        <div class="society-grid tno-minister-grid">
          <label v-for="seat in seats" :key="seat.id" class="society-field tno-minister-slot" :class="{ filled: !!advisorFor(band.id, seat.id) }">
            <div class="tno-minister-head">
              <span class="tno-minister-icon" aria-hidden="true">{{ seat.icon }}</span>
              <div>
                <span>{{ seat.name }}</span>
                <ins>{{ seat.roleNote }}</ins>
              </div>
            </div>
            <select :value="advisorFor(band.id,seat.id)" :disabled="model.busy||band.founder!==actor" @change="changeAdvisor(band.id,seat.id,$event)">
              <option value="">未任命</option>
              <option v-for="member in band.members" :key="member.personId" :value="member.personId">{{ member.name }}</option>
            </select>
            <div v-if="advisorTraitsFor(band, seat.id).length" class="tno-advisor-traits">
              <div v-for="item in advisorTraitsFor(band, seat.id)" :key="item.id" class="tno-advisor-trait">
                <div class="tno-advisor-trait-head">
                  <span aria-hidden="true">{{ item.icon }}</span>
                  <strong>{{ item.title }}</strong>
                </div>
                <p v-if="formatNpcTraitModifiers(item).length" class="tno-advisor-trait-mods">{{ formatNpcTraitModifiers(item).join(' · ') }}</p>
              </div>
            </div>
            <p v-else-if="advisorFor(band.id, seat.id)" class="tno-advisor-empty">该成员暂无额外顾问修正</p>
          </label>
        </div>
        <div v-if="bandAdvisorSummary(band).length" class="tno-cabinet-buffs">
          <span class="tno-cabinet-buffs-label">内阁协同修正</span>
          <span v-for="line in bandAdvisorSummary(band)" :key="line" class="tno-cabinet-buff-pill">{{ line }}</span>
        </div>
      </article>
      <p v-if="!myBands.length" class="society-empty">目前没有你正式加入的乐队。乐队的创建与成员邀请仍在 Live House 完成。</p>
    </template>

    <!-- TAB 2: Social Circles -->
    <template v-else-if="tab === 'circles'">
      <form class="society-form tno-console-form" @submit.prevent="createCircle">
        <label class="society-field">
          <span>创建小小的社交圈</span>
          <input v-model="circleName" maxlength="60" placeholder="为新的社交圈取名" required>
        </label>
        <button type="submit" :disabled="model.busy||!circleName.trim()">建立社交圈</button>
      </form>

      <section v-if="invitationsForMe.length" class="society-card tno-invite-alert" aria-label="等待你的社交圈邀请">
        <h3>邀请你加入</h3>
        <div v-for="inv in invitationsForMe" :key="inv.id" class="society-row">
          <span>{{ society.circles.find(c=>c.id===inv.circleId)?.title }} · 来自{{ protagonistNames[inv.from] }}</span>
          <div class="society-actions">
            <button :disabled="model.busy" @click="send({type:'accept_circle',invitationId:inv.id,accepted:true})">加入</button>
            <button class="muted" :disabled="model.busy" @click="send({type:'accept_circle',invitationId:inv.id,accepted:false})">婉拒</button>
          </div>
        </div>
      </section>

      <article v-for="circle in society.circles" :key="circle.id" class="society-card">
        <div class="society-row tno-card-top">
          <div>
            <small class="tno-card-kicker">SOCIAL CIRCLE // 日常共同活动圈</small>
            <h3>{{ circle.title }}</h3>
          </div>
          <span class="society-meta tno-role-badge" :class="{ founder: circle.founder === actor }">{{ circle.founder===actor?'由你创建':`${protagonistNames[circle.founder]}创建` }}</span>
        </div>
        <p>成员：{{ circle.memberIds.map(personName).join('、') }}</p>
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
      <p v-if="!society.circles.length" class="society-empty">尚无社交圈。它没有内阁或顾问，只保存真实参加者与共同活动关系。</p>
    </template>

    <!-- TAB 3: Super-Regional Coalitions / Unions -->
    <template v-else>
      <p class="society-help">广域联合体可容纳多个独立乐队和社交圈。加入不改变原组织领导权，不代表人物已同意其他安排，也不会自动占用演出档期。</p>
      <form class="society-form tno-console-form" @submit.prevent="createUnion">
        <div class="society-grid">
          <label class="society-field">
            <span>联合体名称</span>
            <input v-model="unionName" maxlength="60" placeholder="例如：东京音乐交流网络" required>
          </label>
          <label class="society-field">
            <span>发起组织</span>
            <select v-model="unionFounderGroup" required>
              <option value="">选择你负责的组织</option>
              <option v-for="g in ownedGroups" :key="g.id" :value="g.id">{{ g.name }}</option>
            </select>
          </label>
        </div>
        <button type="submit" :disabled="model.busy||!unionName.trim()||!unionFounderGroup">发起联合体</button>
      </form>

      <article v-for="union in society.unions" :key="union.id" class="society-card">
        <div class="society-row tno-card-top">
          <div>
            <small class="tno-card-kicker">COALITION SPHERE // 广域协作网络</small>
            <h3>{{ union.title }}</h3>
          </div>
          <small class="tno-role-badge" :class="{ founder: union.coordinator === actor }">协调者：{{ protagonistNames[union.coordinator] }}</small>
        </div>
        <p>组织：{{ union.groupIds.map(groupName).join('、') }}</p>
        <div class="society-actions" v-if="ownedGroups.some(g=>!union.groupIds.includes(g.id))">
          <select v-model="unionApplicants[union.id]" aria-label="申请加入联合体的组织">
            <option value="">选择你负责的组织</option>
            <option v-for="group in ownedGroups.filter(g=>!union.groupIds.includes(g.id))" :key="group.id" :value="group.id">{{ group.name }}</option>
          </select>
          <button :disabled="model.busy||!unionApplicants[union.id]" @click="joinUnion(union.id)">申请加入</button>
        </div>
        <div v-for="app in society.applications.filter(a=>a.unionId===union.id)" :key="app.id" class="society-row tno-pending-row">
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
      <p v-if="!society.unions.length" class="society-empty">尚无广域联合体。先创建自己的社交圈，或在 Live House 拥有正式乐队。</p>
    </template>

    <FactionFocusSection :model="model" :actions="actions" />
  </section>
</template>
