<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { currentLawCase, lawCases, lawOwner, quoteLawCase, type LawCaseAction } from '../runtime/law-career';
import { activeProtagonist } from '../runtime/protagonist-world';
import { runInteraction } from './interaction-action';
import { formatGameNumber } from './format-game-number';
import type { ShellActions, ShellModel } from './types';

const props = defineProps<{ model: ShellModel; actions: ShellActions }>();
const emit = defineEmits<{ close: [] }>();
const owner = computed(() => activeProtagonist(props.model.state));
const progress = computed(() => lawOwner(props.model.state));
const current = computed(() => currentLawCase(props.model.state));
const active = computed(() => progress.value.active);
const statement = computed(() => current.value?.rounds[active.value?.round ?? 0]?.statement ?? '');
const receipt = ref('');
const attempted = ref(false);
const working = ref(false);
const caseAction = (phase: LawCaseAction['phase'], caseId?: string, evidenceId?: string): LawCaseAction =>
  ({ type: 'law_case', phase, ...(caseId ? { caseId } : {}), ...(evidenceId ? { evidenceId } : {}) });
const quote = (action: LawCaseAction) => quoteLawCase(props.model.state, action);

async function perform(action: LawCaseAction) {
  const before = quote(action);
  if (props.model.busy || working.value || before.blockedReason) return;
  working.value = true;
  attempted.value = true;
  receipt.value = '';
  try {
    if (!await runInteraction(props.model, props.actions, action)) return;
    const result = progress.value.lastResult;
    const finished = !!result && !progress.value.active &&
      result.caseId === (current.value?.id ?? action.caseId ?? result.caseId);
    receipt.value = finished && result
      ? '完美结案 · ' + (result.solvedBy === 'sherry' ? '雪莉完成了证据推理' : '艾玛独立完成了证据论证') +
        ' · 经验 +' + result.experience + ' · 报酬 ¥' + formatGameNumber(result.payout) + '。'
      : before.feedback;
    attempted.value = false;
    // Save first, generate optional courtroom dialogue afterward. AI does not pay rewards.
    if (finished && (action.phase === 'sherry' || action.phase === 'present')) {
      const request = action.phase === 'sherry'
        ? '艾玛请雪莉桑接过法庭上的推理。请让雪莉逐条解释刚刚保存的证物与证词矛盾，并描写完美结案的过程；不要再结算收入或篡改结果。'
        : '艾玛根据自己刚刚完成的证据论证总结这个案件，请自然描写证词被澄清及完美结案后的反应；不要再结算收入或篡改结果。';
      void props.actions.send(request);
    }
  } finally {
    working.value = false;
  }
}
watch(owner, () => { receipt.value = ''; attempted.value = false; });
</script>

<template>
  <section class="law-career" data-law-career>
    <header class="law-career-heading">
      <small>枫庭律师事务所 · 案件档案</small>
      <h2>法律职业</h2>
      <p>从调查证据到质证，每一步由你决定。橘雪莉会与艾玛一起工作。</p>
      <div class="law-career-stats">
        <span>职业经验 <strong>{{ progress.experience }}</strong></span>
        <span>累计报酬 <strong>¥{{ formatGameNumber(progress.totalPayout) }}</strong></span>
        <span>结案 <strong>{{ progress.completedCaseIds.length }}</strong></span>
      </div>
    </header>
    <div v-if="receipt" role="status" class="law-receipt" data-law-receipt>{{ receipt }}</div>
    <div v-if="attempted && model.notice" role="alert" class="law-error">{{ model.notice }}</div>

    <template v-if="!active">
      <div v-if="progress.lastResult" class="law-verdict" data-law-verdict>
        <strong>最近结案 · 完美结局</strong>
        <p>{{ lawCases.find(item => item.id === progress.lastResult?.caseId)?.title }}</p>
        <p>{{ progress.lastResult.solvedBy === 'sherry' ? '雪莉接手推理 · 艾玛获得40%职业收获' : '玩家独立破案 · 获得全部职业收获' }}</p>
        <ol><li v-for="(deduction, index) in progress.lastResult.deductions" :key="index">{{ deduction }}</li></ol>
      </div>
      <h3>可承接的委托</h3>
      <article v-for="item in lawCases" :key="item.id" class="law-case" :data-law-case="item.id">
        <h4>{{ item.title }}</h4>
        <p>{{ item.summary }}</p>
        <small>委托人：{{ item.client }} · 满额报酬 ¥{{ formatGameNumber(item.rewardYen) }} · 经验 {{ item.experience }}</small>
        <button type="button" :data-accept-law-case="item.id"
          :disabled="model.busy || working || progress.completedCaseIds.includes(item.id) || !!quote(caseAction('accept', item.id)).blockedReason"
          @click="perform(caseAction('accept', item.id))">
          {{ progress.completedCaseIds.includes(item.id) ? '已结案' : '接收委托' }}
        </button>
        <p v-if="!progress.completedCaseIds.includes(item.id) && quote(caseAction('accept', item.id)).blockedReason" class="law-blocked">
          {{ quote(caseAction('accept', item.id)).blockedReason }}
        </p>
      </article>
    </template>

    <template v-else-if="current">
      <div class="law-case">
        <small>进行中 · {{ active.stage === 'investigation' ? '调查阶段' : '庭审质证 ' + (active.round + 1) + ' / ' + current.rounds.length }}</small>
        <h3>{{ current.title }}</h3>
        <p>{{ current.summary }}</p>
        <p>委托人：{{ current.client }}</p>
        <p v-if="active.mistakes">已重新检查证据 {{ active.mistakes }} 次，仍可继续尝试。</p>
      </div>
      <div v-if="active.stage === 'investigation'" class="law-case">
        <h4>现场调查</h4>
        <p>与雪莉一起核对监控记录、笔录与书面材料，完成调查后才能提交证据质疑证词。</p>
        <button type="button" data-law-investigate :disabled="model.busy || working || !!quote(caseAction('investigate')).blockedReason"
          @click="perform(caseAction('investigate'))">调查并整理卷宗</button>
        <p v-if="quote(caseAction('investigate')).blockedReason" class="law-blocked">{{ quote(caseAction('investigate')).blockedReason }}</p>
      </div>
      <div v-else class="law-case">
        <small>当前证言</small>
        <blockquote>{{ statement }}</blockquote>
        <h4>选择一份证据提出异议</h4>
        <div class="law-evidence">
          <button v-for="evidence in current.evidence" :key="evidence.id" type="button" :data-law-evidence="evidence.id"
            :disabled="model.busy || working || !!quote(caseAction('present', undefined, evidence.id)).blockedReason"
            @click="perform(caseAction('present', undefined, evidence.id))">
            <strong>{{ evidence.title }}</strong>
            <small>{{ evidence.detail }}</small>
          </button>
        </div>
        <p v-if="active.deductions.length">已证实的矛盾：{{ active.deductions.join('；') }}</p>
      </div>
      <div v-if="owner === 'emma'" class="law-partner" data-law-partner>
        <strong>搭档 · 橘雪莉</strong>
        <p>可以随时请雪莉接手剩下的推理。案件依然完美结案，艾玛获得40%的职业经验和报酬。</p>
        <button type="button" data-law-sherry :disabled="model.busy || working || !!quote(caseAction('sherry')).blockedReason"
          @click="perform(caseAction('sherry'))">请雪莉接手推理</button>
        <p v-if="quote(caseAction('sherry')).blockedReason" class="law-blocked">{{ quote(caseAction('sherry')).blockedReason }}</p>
      </div>
    </template>
    <button type="button" class="law-return" @click="emit('close')">返回此地</button>
  </section>
</template>

<style scoped>
.law-career { display: grid; gap: 12px; padding: 12px; color: var(--text-primary, #eae7ea); font-size: 13px; }
.law-career-heading h2 { font-size: 22px; margin: 5px 0 8px; }
.law-career-heading p, .law-case p, .law-partner p { line-height: 1.6; }
.law-career-stats { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 12px; }
.law-career-stats span { padding: 7px 9px; border: 1px solid #8b8b8b65; border-radius: 8px; }
.law-career-stats strong { margin-left: 6px; }
.law-case, .law-partner, .law-verdict { padding: 13px; border: 1px solid #9792a34a; border-radius: 11px; background: #8c89a012; display: grid; gap: 8px; }
.law-case h3, .law-case h4, .law-case p, .law-partner p { margin: 0; }
.law-case h3 { font-size: 17px; }
.law-case h4 { font-size: 15px; }
.law-case blockquote { margin: 0; padding: 11px; border-left: 3px solid #b9a8e1; line-height: 1.65; }
.law-evidence { display: grid; grid-template-columns: repeat(auto-fit,minmax(min(100%,175px),1fr)); gap: 8px; }
.law-evidence button { display: grid; text-align: left; gap: 7px; }
.law-career button { padding: 10px 13px; border-radius: 8px; border: 1px solid #aa9fbb91; background: #6d5e8b4a; color: inherit; cursor: pointer; }
.law-career button:disabled { cursor: not-allowed; opacity: .52; }
.law-career button:focus-visible { outline: 2px solid #c3aadf; outline-offset: 2px; }
.law-partner { border-color: #c99cad81; }
.law-verdict ol { padding-left: 20px; margin: 2px 0; line-height: 1.55; }
.law-receipt { border-left: 3px solid #99b9a6; padding: 10px 12px; background: #99b9a617; line-height: 1.55; }
.law-error,.law-blocked { color: #e9b2ad; }
.law-return { justify-self: start; }
@media (max-width: 400px) { .law-career { padding: 8px; } .law-evidence { grid-template-columns: 1fr; } }
</style>
