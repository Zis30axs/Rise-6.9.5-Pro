<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { courtState, COURT_CATEGORY_NAMES, DAILY_COURT_CATEGORIES, type CourtCategory, type CourtOffer } from '../runtime/courtroom';
import { activeProtagonist, protagonistNames } from '../runtime/protagonist-world';
import { PROTAGONISTS, type ProtagonistId } from '../runtime/dual-protagonists';
import { lawOwner } from '../runtime/law-career';
import { formatGameNumber } from './format-game-number';
import type { ShellActions, ShellModel } from './types';

const props = defineProps<{ model: ShellModel; actions: ShellActions }>();
const emit = defineEmits<{ close: [] }>();
const owner = computed(() => activeProtagonist(props.model.state));
const court = computed(() => courtState(props.model.state));
const board = computed(() => court.value.board?.day === props.model.state.clock.day ? court.value.board : null);
const special = computed(() => court.value.special?.day === props.model.state.clock.day ? court.value.special.offer : null);
const active = computed(() => court.value.active);
const myTrial = computed(() => active.value?.owner === owner.value ? active.value : null);
const filing = computed(() => court.value.filing?.claimant === owner.value ? court.value.filing : null);
const lastResult = computed(() => court.value.results.filter(row => row.owner === owner.value).at(-1) ?? null);
const lawStats = computed(() => lawOwner(props.model.state));
const experience = computed(() => lawStats.value.experience + court.value.results.filter(row => row.owner === owner.value).reduce((n,row) => n + row.experience,0));
const earnings = computed(() => lawStats.value.totalPayout + court.value.results.filter(row => row.owner === owner.value).reduce((n,row) => n + row.payout,0));
const candidates = computed(() => PROTAGONISTS.filter(id => id !== owner.value));
const tab = ref<'docket'|'filing'>('docket');
const categories = ref<CourtCategory[]>([...DAILY_COURT_CATEGORIES]);
const defendant = ref(''), reason = ref(''), category = ref<CourtCategory>('civil');
const lawyer = ref<ProtagonistId | ''>(''), sherry = ref(false);
const working = ref(false);
watch(() => court.value.categories.join('|'), () => { categories.value = [...court.value.categories].filter(c => DAILY_COURT_CATEGORIES.includes(c)); }, {immediate:true});
watch(owner, () => { defendant.value=''; reason.value=''; lawyer.value=''; sherry.value=false; }, {flush:'post'});
function highlight(value:string) {
  return value.split(/(\^[^^\r\n]{1,80}\^)/g).filter(Boolean).map(value =>
    ({text:value.startsWith('^') && value.endsWith('^') ? value.slice(1,-1) : value,
      keyword:value.startsWith('^') && value.endsWith('^')}));
}
function chooseCategory(target:CourtCategory) {
  if (props.model.busy || board.value || active.value) return;
  const next = categories.value.includes(target) ? categories.value.filter(c=>c!==target) : [...categories.value,target];
  if (!next.length) return;
  props.actions.dispatch({type:'courtroom',phase:'filter',categories:next});
}
async function requestDocket() {
  if (props.model.busy || active.value || board.value || working.value) return;
  working.value = true;
  try {
    await props.actions.send('请展示今天枫庭律师事务所的三份委托。请根据已选的民事、行政、轻微刑事范围制作两份新委托，并用 court_docket 行动保存公告栏；另有一份事务所保留的卷宗。不要立即开庭。');
  } finally { working.value=false; }
}
async function requestSpecial() {
  if (props.model.busy || working.value || active.value || special.value) return;
  working.value = true;
  try {
    await props.actions.send('我希望主动查看一次重大刑事特殊委托。请只生成一份新的高报酬重大刑事卷宗，涉案人物优先使用临时人物，不从日常委托抽取，用 court_special 行动记录；现在只看委托概要，不开庭。');
  } finally { working.value=false; }
}
async function accept(offer:CourtOffer) {
  if (props.model.busy || active.value || working.value) return;
  if (offer.preset) {
    props.actions.dispatch({ type:'courtroom', phase:'accept-preset', offerId:offer.id });
    return;
  }
  working.value=true;
  try {
    await props.actions.send('我决定承接今天的委托「'+offer.title+'」（编号 '+offer.id+'）。请补全案情、公开证据和固定真相，用 court_open 行动锁定卷宗。开庭后由我自由推理，不进行地图调查，也不要提前泄露真正结论。');
  } finally { working.value=false; }
}
async function requestQuote() {
  if (props.model.busy || working.value || !defendant.value.trim() || !reason.value.trim() || active.value) return;
  working.value=true;
  try {
    await props.actions.send('我，'+protagonistNames[owner.value]+'，打算起诉'+defendant.value.trim()+
      '。事由：'+reason.value.trim()+'。案件类别：'+COURT_CATEGORY_NAMES[category.value]+'。'+
      (lawyer.value ? '希望由'+protagonistNames[lawyer.value]+'协助庭审。' : '我自行出庭。')+
      (sherry.value ? '另外请橘雪莉协助。' : '不聘请橘雪莉。')+
      '请先评估法律风险，然后根据案情报出起诉费、律师费和法律协助费，并以 court_quote 行动记录。现在只是咨询，请勿扣款，也不提前生成既定真相。');
  } finally { working.value=false; }
}
function confirmFiling() {
  if (props.model.busy || !filing.value || active.value) return;
  props.actions.dispatch({type:'courtroom',phase:'confirm-filing'});
}
async function askSherry() {
  if (props.model.busy || !myTrial.value || myTrial.value.source!=='commission' || owner.value!=='emma') return;
  props.actions.dispatch({type:'courtroom',phase:'sherry'});
  if (props.model.notice || court.value.active) return;
  emit('close');
  await props.actions.send('橘雪莉接手已结束的委托，依据已有证据完整说明矛盾和案件结论，并与艾玛一起离开法庭。', 'law_narration');
}
const feeTotal = computed(()=>filing.value ? filing.value.courtFeeYen + filing.value.lawyerFeeYen + filing.value.sherryFeeYen : 0);
</script>

<template>
  <section class="law-career" data-law-career>
    <header class="law-career-heading">
      <small>枫庭律师事务所</small>
      <h2>案件与诉讼</h2>
      <div class="law-career-stats">
        <span>职业经验 <strong>{{ formatGameNumber(experience) }}</strong></span>
        <span>累计报酬 <strong>¥{{ formatGameNumber(earnings) }}</strong></span>
        <span>已结案 <strong>{{ lawStats.completedCaseIds.length + court.results.filter(row => row.owner === owner).length }}</strong></span>
      </div>
    </header>
    <p v-if="model.notice" class="law-error" role="alert">{{ model.notice }}</p>
    <div v-if="active && !myTrial" class="law-case">
      <h3>当前案件正在审理</h3>
      <p>{{ protagonistNames[active.owner] }}正在办理「{{ active.title }}」。这场庭审结束前，事务所不再受理其他案件。</p>
    </div>
    <template v-else-if="myTrial">
      <article class="law-case" data-court-active>
        <small>庭审进行中 · {{ COURT_CATEGORY_NAMES[myTrial.category] }}</small>
        <h3>{{ myTrial.title }}</h3>
        <p v-for="(part,index) in highlight(myTrial.white)" :key="index" class="law-inline" :class="{ 'law-keyword':part.keyword }">{{ part.text }}</p>
        <h4>已提交的证据</h4>
        <div v-for="(item,index) in myTrial.evidence" :key="index" class="law-evidence-item">
          <strong>{{ item.title }}</strong>
          <p>{{ item.detail }}</p>
        </div>
        <p v-if="myTrial.steps.length" class="law-progress">庭审记录：{{ myTrial.steps.map(step=>step.summary).join('；') }}</p>
        <button type="button" data-court-return @click="emit('close')">回到法庭继续辩论</button>
      </article>
      <div v-if="owner==='emma' && myTrial.source==='commission'" class="law-partner">
        <strong>橘雪莉</strong>
        <p>如果陷入困境，可以请雪莉完成剩余论证。案件仍可妥善结案，你将取得四成职业报酬。</p>
        <button type="button" data-court-sherry :disabled="model.busy" @click="askSherry">请雪莉接手</button>
      </div>
    </template>
    <template v-else>
      <article v-if="lastResult" class="law-verdict">
        <strong>最近结案 · {{ lastResult.title }}</strong>
        <p>{{ lastResult.summary }}</p>
        <small>{{ lastResult.solvedBy==='forfeit'?'本案无职业收益':lastResult.solvedBy==='sherry'?'雪莉完成关键论证': '庭审已结束' }} · 报酬 ¥{{ formatGameNumber(lastResult.payout) }}</small>
      </article>
      <div class="law-tabs" role="tablist" aria-label="法律事务">
        <button type="button" role="tab" :aria-selected="tab==='docket'" @click="tab='docket'">今日委托</button>
        <button type="button" role="tab" :aria-selected="tab==='filing'" @click="tab='filing'">主动起诉</button>
      </div>
      <template v-if="tab==='docket'">
        <div class="law-case">
          <h3>服务筛选</h3>
          <div class="law-filters">
            <label v-for="kind in DAILY_COURT_CATEGORIES" :key="kind">
              <input type="checkbox" :checked="categories.includes(kind)" :disabled="!!board || model.busy" @change="chooseCategory(kind)" />
              {{ COURT_CATEGORY_NAMES[kind] }}
            </label>
          </div>
          <small>每日三份委托，次日更新；受理后必须结案才能承接下一份。</small>
        </div>
        <div v-if="!board" class="law-case">
          <h3>今日委托</h3>
          <p>事务所正在整理今天的委托目录。</p>
          <button type="button" data-court-docket :disabled="model.busy || working" @click="requestDocket">查看今日三份委托</button>
        </div>
        <template v-else>
          <article v-for="offer in board.offers" :key="offer.id" class="law-case" :data-court-offer="offer.id">
            <small>{{ COURT_CATEGORY_NAMES[offer.category] }} · {{ offer.difficulty==='easy'?'简单':offer.difficulty==='normal'?'中等':'复杂' }}</small>
            <h3>{{ offer.title }}</h3>
            <p>{{ offer.summary }}</p>
            <small>委托人：{{ offer.client }} · 报酬 ¥{{ formatGameNumber(offer.rewardYen) }}</small>
            <button type="button" :disabled="model.busy || working || court.results.some(row => row.id === offer.id)"
              @click="accept(offer)">{{ court.results.some(row=>row.id===offer.id)?'已结案':'承接委托' }}</button>
          </article>
        </template>
        <details class="law-case">
          <summary>重大刑事 · 特殊委托</summary>
          <p>特殊案件不会出现在日常委托中；涉案人物优先为新出现的临时人物。</p>
          <article v-if="special" class="law-special-offer" data-court-special>
            <h3>{{ special.title }}</h3>
            <p>{{ special.summary }}</p>
            <small>委托人：{{ special.client }} · 报酬 ¥{{ formatGameNumber(special.rewardYen) }}</small>
            <button type="button" :disabled="model.busy || working || court.results.some(row=>row.id===special.id)" @click="accept(special)">
              {{ court.results.some(row=>row.id===special.id)?'已结案':'承接特殊委托' }}
            </button>
          </article>
          <button v-else type="button" data-court-special-request :disabled="model.busy || working" @click="requestSpecial">查看特殊委托</button>
        </details>
      </template>
      <template v-else>
        <article v-if="filing" class="law-case" data-court-quote>
          <h3>诉前费用与风险</h3>
          <p>{{ protagonistNames[filing.claimant] }} 诉 {{ filing.defendant }}</p>
          <p>{{ filing.reason }}</p>
          <p class="law-risk"><strong>诉讼风险：</strong>{{ filing.risk }}</p>
          <div class="law-fees">
            <p>起诉费 <strong>¥{{ formatGameNumber(filing.courtFeeYen) }}</strong></p>
            <p>代理或协助费 <strong>¥{{ formatGameNumber(filing.lawyerFeeYen) }}</strong></p>
            <p>雪莉协助费 <strong>¥{{ formatGameNumber(filing.sherryFeeYen) }}</strong></p>
            <p>预计总额 <strong>¥{{ formatGameNumber(feeTotal) }}</strong></p>
          </div>
          <button type="button" data-court-confirm :disabled="model.busy || model.state.player.balance < feeTotal" @click="confirmFiling">确认费用并提交诉状</button>
          <p v-if="model.state.player.balance < feeTotal" class="law-error">余额不足，无法提交诉状。</p>
        </article>
        <article class="law-case">
          <h3>起诉申请</h3>
          <label>起诉对象 <input v-model.trim="defendant" maxlength="100" placeholder="对方姓名" /></label>
          <label>起诉理由 <textarea v-model.trim="reason" maxlength="1000" rows="3" placeholder="说明争议经过与诉求"></textarea></label>
          <label>案件类别
            <select v-model="category">
              <option v-for="kind in DAILY_COURT_CATEGORIES" :key="kind" :value="kind">{{ COURT_CATEGORY_NAMES[kind] }}</option>
            </select>
          </label>
          <label>律师或协助人
            <select v-model="lawyer">
              <option value="">本人出庭</option>
              <option v-for="id in candidates" :key="id" :value="id">{{ protagonistNames[id] }} · 协助庭审</option>
            </select>
          </label>
          <label class="law-check"><input v-model="sherry" type="checkbox" /> 请橘雪莉协助</label>
          <p>事务所会先说明诉讼风险及费用；即使存在败诉风险，仍可选择坚持起诉。</p>
          <button type="button" data-court-quote-request :disabled="model.busy || working || !defendant.trim() || !reason.trim()" @click="requestQuote">申请诉前咨询与报价</button>
        </article>
      </template>
    </template>
    <button type="button" class="law-return" @click="emit('close')">返回此地</button>
  </section>
</template>

<style scoped>
.law-career{display:grid;gap:12px;padding:12px;color:var(--text-primary,#eae7ea);font-size:13px}
.law-career-heading h2{font-size:22px;margin:5px 0 8px}
.law-career-stats{display:flex;flex-wrap:wrap;gap:7px;margin-top:12px}
.law-career-stats span{padding:7px 9px;border:1px solid #8b8b8b65;border-radius:8px}
.law-career-stats strong{margin-left:6px}
.law-case,.law-partner,.law-verdict{padding:13px;border:1px solid #9792a34a;border-radius:11px;background:#8c89a012;display:grid;gap:10px}
.law-case h3,.law-case h4,.law-case p,.law-partner p{margin:0}
.law-case p,.law-partner p{line-height:1.6}
.law-case h3{font-size:17px}
.law-case h4{font-size:15px}
.law-special-offer{display:grid;gap:9px;padding:9px;border:1px solid #b895a34a;border-radius:9px}
.law-evidence-item{display:grid;gap:5px;padding:9px;border-left:3px solid #b9a8e1;background:#8c89a00d}
.law-inline{display:inline!important;white-space:pre-wrap;overflow-wrap:anywhere}
.law-keyword{color:#e66a73;font-weight:800}
.law-filters,.law-tabs{display:flex;flex-wrap:wrap;gap:8px}
.law-filters label{display:flex;align-items:center;gap:5px;padding:5px 8px;border:1px solid #9792a34a;border-radius:8px}
.law-tabs button[aria-selected="true"]{border-color:#cfb9ff;background:#8b73bd73}
.law-case label{display:grid;gap:5px}
.law-case input:not([type="checkbox"]),.law-case textarea,.law-case select{width:100%;min-height:38px;border-radius:7px;border:1px solid #a297b4;background:var(--surface-secondary,#292737);color:inherit;padding:7px}
.law-check{display:flex!important;flex-direction:row;align-items:center;gap:8px!important}
.law-fees{display:grid;gap:5px}
.law-fees p{display:flex;justify-content:space-between}
.law-career button{padding:10px 13px;border-radius:8px;border:1px solid #aa9fbb91;background:#6d5e8b4a;color:inherit;cursor:pointer}
.law-career button:disabled{opacity:.52;cursor:not-allowed}
.law-career button:focus-visible{outline:2px solid #c3aadf;outline-offset:2px}
.law-error{color:#e9b2ad}
.law-risk{padding:10px 12px;border-left:3px solid #d2aa75;background:#b88c4613}
.law-return{justify-self:start}
.law-partner{border-color:#c99cad81}
@media(max-width:400px){.law-career{padding:8px}.law-filters{gap:5px}}
</style>
