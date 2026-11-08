<script setup lang="ts">
import { computed, ref } from 'vue';
import crychicBranchIcon from './assets/focus/crychic-branch.webp';
import mygoBranchIcon from './assets/focus/mygo-branch.webp';
import type { ShellActions, ShellModel } from './types';
import { activeProtagonist, protagonistNames } from '../runtime/protagonist-world';
import {
  FOCUS_CATALOG, DECISION_CATALOG, TRAIT_CATALOG, SPIRIT_CATALOG,
  canStartFocus, checkCondition, createStrategyState, focusWeight, focusBranchLocked,
  type FocusDefinition, type DecisionDefinition, type StrategyCommand,
} from '../runtime/strategy';

const props = defineProps<{ model: ShellModel; actions: ShellActions }>();
const actor = computed(() => activeProtagonist(props.model.state));
const minute = computed(() => (props.model.state.clock.day - 1) * 1440 + props.model.state.clock.hour * 60 + props.model.state.clock.minute);
const state = computed(() => props.model.state.protagonists?.strategy ?? createStrategyState(minute.value));
const profile = computed(() => state.value.people[actor.value]);
const focuses = computed(() => FOCUS_CATALOG.filter(row => row.owner === actor.value));
const decisions = computed(() => DECISION_CATALOG.filter(row => row.owner === actor.value));
const history = computed(() => state.value.history.filter(row => row.owner === actor.value).slice(-12).reverse());
const current = computed(() => FOCUS_CATALOG.find(row => row.id === profile.value.active?.id) ?? null);
const traits = computed(() => profile.value.traits.flatMap(id => TRAIT_CATALOG.filter(row => row.id === id)));
const spirits = computed(() => profile.value.spirits.flatMap(item => SPIRIT_CATALOG.filter(row => row.id === item.id)));
const focusArtwork: Readonly<Record<string,string>> = {
  soyo_rebuild_crychic: crychicBranchIcon,
  soyo_mygo_future: mygoBranchIcon,
};
const focusIcon = (id: string): string | null => focusArtwork[id] ?? null;
const hasBranches = computed(() => focuses.value.some(f => !!f.branchGroup));
const feedback = ref('');
let serial = 0;
function dispatch(command: StrategyCommand) {
  if (props.model.busy) return;
  feedback.value = '';
  const previous = props.model.state.protagonists?.revision ?? -1;
  try {
    // Strategy management is synchronous and offline, not an LLM interaction.
    props.actions.dispatch({ type: 'strategy', requestId: `focus-ui:${Date.now().toString(36)}:${++serial}`, command });
    feedback.value = !props.model.notice && (props.model.state.protagonists?.revision ?? -1) > previous
      ? '已写入本地存档。' : props.model.notice || '操作未完成。';
  } catch (error) {
    feedback.value = error instanceof Error ? error.message : '操作未完成。';
  }
}
function setControl(controller: 'manual' | 'auto', includeInPrompt = profile.value.includeInPrompt) {
  dispatch({ type: 'set_control', owner: actor.value, controller, includeInPrompt });
}
function available(focus: FocusDefinition) { return canStartFocus(state.value, actor.value, focus); }
function status(focus: FocusDefinition) {
  if (profile.value.completed.includes(focus.id)) return '已完成';
  if (profile.value.active?.id === focus.id) return '进行中';
  if (focusBranchLocked(state.value, actor.value, focus)) return '路线已锁定';
  if (!available(focus)) return '尚未解锁';
  return '可执行';
}
function percentage(focus: FocusDefinition) {
  return profile.value.active?.id === focus.id
    ? Math.round(profile.value.active.progress / focus.durationMinutes * 100) : 0;
}
function prerequisites(focus: FocusDefinition) {
  const condition = focus.prerequisites;
  if (!condition) return '无需前置国策';
  if ('completed' in condition) return `需要完成：${FOCUS_CATALOG.find(f => f.id === condition.completed)?.title ?? condition.completed}`;
  return checkCondition(condition, { state: state.value, owner: actor.value }) ? '前置条件已满足' : '前置条件尚未满足';
}
function decisionAvailable(decision: DecisionDefinition) {
  const used = profile.value.decisionUsedAt[decision.id];
  return profile.value.controller === 'manual'
    && checkCondition(decision.available, { state: state.value, owner: actor.value })
    && (used === undefined || !!decision.cooldownMinutes && minute.value - used >= decision.cooldownMinutes);
}
function decisionDescription(decision: DecisionDefinition) {
  const last = profile.value.decisionUsedAt[decision.id];
  if (last === undefined) return '尚未执行';
  if (!decision.cooldownMinutes) return '已执行';
  const minutes = Math.max(0, decision.cooldownMinutes - (minute.value - last));
  return minutes ? `冷却中 · 还需 ${Math.ceil(minutes / 60)} 游戏小时` : '可以再次执行';
}
function weight(focus: FocusDefinition) { return focusWeight(state.value, actor.value, focus); }
function sourceName(id: string) {
  if (id.startsWith('trait:')) return TRAIT_CATALOG.find(x => x.id === id.slice(6))?.title ?? id;
  if (id.startsWith('spirit:')) return SPIRIT_CATALOG.find(x => x.id === id.slice(7))?.title ?? id;
  return '国策条件';
}
</script>

<template>
  <section class="focus-panel" data-testid="focus-tree-panel" aria-label="国策与决议管理">
    <header class="focus-top">
      <div><h2>{{ protagonistNames[actor] }} · 个人国策</h2><p>以现有时间和世界状态推进，不额外请求模型</p></div>
      <span class="focus-control">{{ profile.controller==='auto'?'AI 托管中':'手动控制' }}</span>
    </header>
    <div class="focus-controls">
      <button type="button" :class="{selected:profile.controller==='manual'}" :disabled="model.busy" @click="setControl('manual')">接管人物</button>
      <button type="button" :class="{selected:profile.controller==='auto'}" :disabled="model.busy" @click="setControl('auto')">启用 AI 托管</button>
      <label class="focus-toggle"><input type="checkbox" :checked="profile.includeInPrompt" :disabled="model.busy" @change="setControl(profile.controller,($event.target as HTMLInputElement).checked)"><span>允许已授权国策影响下一轮剧情</span></label>
    </div>
    <p v-if="feedback" role="status" class="focus-feedback">{{ feedback }}</p>
    <p class="focus-note">AI 选择由本地权重计算，重大转折须经合法剧情事件。人物不会自动知晓其他人的秘密。</p>

    <h3>个人国策树</h3>
    <p v-if="hasBranches" class="focus-note">分叉路线：完成其中一条后，另一条将永久锁定。完成「延续 CRYCHIC」后，素世将退出 MyGO!!!!!；昔日成员是否重聚，仍需各自决定。</p>
    <div class="focus-tree" :class="{'has-branches':hasBranches}">
      <article v-for="focus in focuses" :key="focus.id" class="focus-card" :class="{'active':profile.active?.id===focus.id,done:profile.completed.includes(focus.id),'focus-route':!!focus.branchGroup,'route-locked':focusBranchLocked(state,actor,focus)}">
        <figure v-if="focusIcon(focus.id)" class="focus-icon"><img :src="focusIcon(focus.id)!" :alt="`${focus.title}国策图标`" loading="lazy" /></figure>
        <p v-if="focus.branchGroup" class="focus-route-tag">互斥路线 · 二选一</p>
        <div class="focus-row"><h4>{{ focus.title }}</h4><span>{{ status(focus) }}</span></div>
        <p v-if="focus.description" class="focus-note">{{ focus.description }}</p>
        <p>{{ prerequisites(focus) }}</p>
        <p>计划推进时间：{{ focus.durationMinutes / 1440 }} 游戏日 <span v-if="focus.important"> · 重要里程碑</span></p>
        <div v-if="profile.active?.id===focus.id" class="focus-progress" role="progressbar" :aria-label="focus.title" :aria-valuenow="percentage(focus)" aria-valuemin="0" aria-valuemax="100"><span :style="{width:percentage(focus)+'%'}"></span></div>
        <div class="focus-actions">
          <button v-if="profile.active?.id===focus.id && profile.controller==='manual'" type="button" :disabled="model.busy" @click="dispatch({type:'cancel_focus',owner:actor})">取消国策</button>
          <button v-else-if="!profile.completed.includes(focus.id)" type="button" :disabled="model.busy||profile.controller==='auto'||!!profile.active||!available(focus)" @click="dispatch({type:'start_focus',owner:actor,focusId:focus.id})">开始国策</button>
        </div>
        <details class="focus-ai" data-ai-view>
          <summary>AI View · 权重 {{ weight(focus).value }}</summary>
          <p>基础权重 {{ focus.aiWeight }}；负数代表本地 AI 倾向拒绝，不限制玩家手动选择。</p>
          <p v-for="(modifier,index) in weight(focus).breakdown" :key="index">{{ sourceName(modifier.source) }}：{{ modifier.amount>0?'+':'' }}{{ modifier.amount }}</p>
        </details>
      </article>
      <p v-if="!focuses.length" class="focus-note">当前人物尚未登记个人国策。</p>
    </div>

    <h3>决议</h3>
    <div class="focus-decisions">
      <article v-for="decision in decisions" :key="decision.id" class="focus-card">
        <div class="focus-row"><h4>{{ decision.title }}</h4><small>{{ decisionDescription(decision) }}</small></div>
        <button type="button" :disabled="model.busy||!decisionAvailable(decision)" @click="dispatch({type:'choose_decision',owner:actor,decisionId:decision.id})">执行决议</button>
      </article>
      <p v-if="!decisions.length" class="focus-note">暂时没有符合这条路线的个人决议。</p>
    </div>

    <details class="focus-history"><summary>领导者特质、个人精神与国策记录</summary>
      <p v-for="trait in traits" :key="trait.id">领导者特质：{{ trait.title }}</p>
      <p v-for="spirit in spirits" :key="spirit.id">个人精神：{{ spirit.title }}</p>
      <p v-for="entry in history" :key="entry.id">第 {{ Math.floor(entry.at/1440)+1 }} 天 · {{ entry.kind }} · {{ entry.subject }}<span v-if="entry.note">：{{ entry.note }}</span></p>
      <p v-if="!history.length&&!traits.length&&!spirits.length">暂无记录。</p>
    </details>
  </section>
</template>

<style scoped>
.focus-panel{display:grid;gap:12px;color:var(--text-color,inherit);min-width:0}.focus-top,.focus-row,.focus-controls,.focus-actions{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}.focus-top h2{margin:0;font-size:1.16rem}.focus-top p,.focus-note{font-size:.77rem;line-height:1.5;opacity:.72;margin:0}.focus-control{padding:6px 9px;border:1px solid rgba(112,137,182,.32);border-radius:12px;font-size:.72rem}.focus-controls{justify-content:start}.focus-panel button{border:1px solid rgba(112,137,182,.35);border-radius:9px;background:rgba(112,137,182,.12);color:inherit;padding:9px 12px;cursor:pointer;font-size:.81rem}.focus-panel button.selected{border-color:rgba(112,137,182,.85);background:rgba(112,137,182,.3)}.focus-panel button:disabled{opacity:.45;cursor:not-allowed}.focus-toggle{display:flex;gap:8px;align-items:center;font-size:.74rem}.focus-panel h3{margin:8px 0 0;font-size:1rem}.focus-tree,.focus-decisions{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px}.focus-tree.has-branches{grid-template-columns:repeat(2,minmax(0,1fr))}.focus-tree.has-branches>.focus-card:not(.focus-route){grid-column:1/-1}.focus-route{position:relative}.focus-route.route-locked{opacity:.6}.focus-route-tag{font-size:.7rem;color:#a78952;letter-spacing:.03em}.focus-icon{width:min(100%,190px);margin:0 auto 4px;aspect-ratio:1;overflow:hidden;border-radius:50%;background:#111}.focus-icon img{display:block;width:100%;height:100%;object-fit:contain}.focus-card{display:grid;align-content:start;gap:9px;border:1px solid rgba(112,137,182,.23);border-radius:13px;padding:13px;min-width:0}.focus-card.active{border-color:rgba(112,137,182,.86)}.focus-card.done{opacity:.78}.focus-card h4{font-size:.92rem;margin:0}.focus-card .focus-row>span,.focus-card small{font-size:.72rem;opacity:.75}.focus-card p,.focus-ai p{font-size:.76rem;line-height:1.45;margin:0;overflow-wrap:anywhere}.focus-progress{height:8px;border-radius:12px;background:rgba(112,137,182,.15);overflow:hidden}.focus-progress span{display:block;height:100%;border-radius:inherit;background:#73a3ce}.focus-ai{border-top:1px solid rgba(112,137,182,.22);padding-top:7px;font-size:.76rem}.focus-ai summary,.focus-history summary{cursor:pointer;font-weight:600}.focus-ai p{padding-top:5px}.focus-history{border-top:1px solid rgba(112,137,182,.25);padding-top:11px;font-size:.8rem}.focus-history p{font-size:.73rem;line-height:1.5;overflow-wrap:anywhere}.focus-feedback{font-size:.78rem;padding:9px;border:1px solid rgba(112,137,182,.35);border-radius:10px;margin:0}@media(max-width:500px){.focus-tree,.focus-decisions,.focus-tree.has-branches{grid-template-columns:1fr}}
</style>
