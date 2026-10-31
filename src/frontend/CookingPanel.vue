<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { runInteraction } from './interaction-action';
import type { ShellActions, ShellModel } from './types';
import { COOKING_RECIPES, COOKING_INGREDIENTS, COOKING_DIFFICULTY, COOKING_QUALITY_LABEL,
  cookingZones, cookingQuality, drawCookingCenter, type CookingQuality } from '../runtime/cooking-recipes';
import { cookingSkill, cookQuote } from '../runtime/cooking';
import { activeProtagonist } from '../runtime/protagonist-world';

const props = defineProps<{ model: ShellModel; actions: ShellActions }>();
const emit = defineEmits<{ close: [] }>();
const dialog = ref<HTMLElement | null>(null);
const selectedId = ref(COOKING_RECIPES[0].id);
const center = ref(0.5);
const needle = ref(0);
const playing = ref(false);
const saving = ref(false);
const outcome = ref<CookingQuality | null>(null);
const error = ref('');
let raf = 0;
let startedAt = 0;
const owner = computed(() => activeProtagonist(props.model.state));
const xp = computed(() => props.model.state.cooking?.experience[owner.value] ?? 0);
const skill = computed(() => cookingSkill(xp.value));
const recipe = computed(() => COOKING_RECIPES.find(item => item.id === selectedId.value)!);
const quote = computed(() => cookQuote(props.model.state, selectedId.value));
const zones = computed(() => cookingZones(recipe.value.difficulty, center.value));
const ingredients = computed(() => recipe.value.ingredients.map(row => ({
  ...row, name: COOKING_INGREDIENTS.find(item => item.id === row.itemId)?.name ?? row.itemId,
  owned: props.model.state.inventory.find(item => item.itemId === row.itemId)?.quantity ?? 0,
})));
const meter = (u: number, radius = 153) => {
  const theta = Math.PI * (1 - Math.max(0, Math.min(1, u)));
  return { x: 210 + radius * Math.cos(theta), y: 179 - radius * Math.sin(theta) };
};
function arc(start: number, end: number) {
  const a = meter(start), b = meter(end);
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A 153 153 0 ${end - start > 0.5 ? 1 : 0} 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}
const ordinaryArc = computed(() => arc(zones.value.ordinaryStart, zones.value.ordinaryEnd));
const perfectArc = computed(() => arc(zones.value.perfectStart, zones.value.perfectEnd));
const needleEnd = computed(() => meter(needle.value, 136));
const marks = Array.from({ length: 11 }, (_, i) => ({ inner: meter(i / 10, 164), outer: meter(i / 10, 175) }));
const speedMs = computed(() => 1250 + (skill.value.level - 1) * 140);
function stopAnimation() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  playing.value = false;
}
function randomize() {
  center.value = drawCookingCenter(recipe.value.difficulty, Math.random());
  needle.value = 0;
}
function selectRecipe(id: string) {
  if (playing.value || saving.value) return;
  selectedId.value = id;
  outcome.value = null;
  error.value = '';
  randomize();
}
function animate(now: number) {
  if (!playing.value) return;
  const progress = (now - startedAt) / speedMs.value;
  needle.value = (1 - Math.cos(2 * Math.PI * progress)) / 2;
  raf = requestAnimationFrame(animate);
}
function startCooking() {
  if (props.model.busy || saving.value || playing.value || quote.value.blockedReason) return;
  error.value = '';
  outcome.value = null;
  randomize(); // Re-roll the target for each newly opened attempt.
  playing.value = true;
  startedAt = performance.now();
  raf = requestAnimationFrame(animate);
}
async function stopCooking() {
  if (!playing.value || saving.value || props.model.busy) return;
  stopAnimation();
  const value = needle.value, target = center.value, selected = recipe.value;
  saving.value = true;
  error.value = '';
  try {
    const saved = await runInteraction(props.model, props.actions, {
      type: 'cook_dish', recipeId: selected.id, dialCenter: target, needle: value,
    });
    if (saved) outcome.value = cookingQuality(selected.difficulty, target, value);
    else error.value = props.model.notice || '结果尚未保存，请确认食材与位置后重试。';
  } catch (e) {
    error.value = e instanceof Error ? e.message : '保存料理失败，请重试。';
  } finally { saving.value = false; }
}
function close() {
  if (saving.value) return;
  stopAnimation();
  emit('close');
}
onMounted(() => { randomize(); void nextTick(() => dialog.value?.focus()); });
onBeforeUnmount(stopAnimation);
</script>

<template>
  <div class="cooking-shade" data-cooking-panel @click.self="close">
    <section ref="dialog" class="cooking-dialog" tabindex="-1" role="dialog" aria-modal="true" aria-label="厨房烹饪" @keydown.esc.stop="close">
      <header class="cooking-header">
        <div><small>家常料理 · 手动烹饪</small><h2>厨房</h2><p>厨艺 Lv.{{ skill.level }} · {{ skill.label }} · 经验 {{ xp }}</p></div>
        <button type="button" aria-label="关闭厨房" :disabled="saving" @click="close">×</button>
      </header>
      <div class="cooking-recipes" role="group" aria-label="选择菜谱">
        <button v-for="item in COOKING_RECIPES" :key="item.id" type="button" :data-cooking-recipe="item.id"
          :aria-pressed="selectedId === item.id" :disabled="playing || saving" :class="{ selected: selectedId === item.id }"
          @click="selectRecipe(item.id)">
          <strong>{{ item.name }}</strong><small>{{ COOKING_DIFFICULTY[item.difficulty].label }} · {{ item.minutes }} 分钟</small>
        </button>
      </div>
      <div class="cooking-main">
        <section class="cooking-details">
          <div class="cooking-title"><h3>{{ recipe.name }}</h3><span>{{ COOKING_DIFFICULTY[recipe.difficulty].label }}</span></div>
          <p>{{ recipe.minutes }} 分钟 · 精力 −{{ recipe.energyCost }} · {{ recipe.servings }} 份</p>
          <p>所需食材</p>
          <ul>
            <li v-for="item in ingredients" :key="item.itemId" :class="{ missing: item.owned < item.quantity }">
              <span>{{ item.name }}</span><span>{{ item.owned }}/{{ item.quantity }}</span>
            </li>
          </ul>
          <p class="cooking-footnote">食材在便利店购买。失败也会消耗原料与时间，并留下失败料理。</p>
        </section>
        <section class="cooking-meter" aria-label="电压表指针烹饪判定">
          <div class="cooking-meter-labels"><span>失败</span><span>普通</span><span>完美</span></div>
          <svg viewBox="0 0 420 207" role="img" :aria-label="`判定表盘：当前指针位置约 ${Math.round(needle * 100)}%`">
            <path :d="arc(0, 1)" stroke="#82878c" stroke-width="18" stroke-linecap="round" fill="none"/>
            <path :d="ordinaryArc" stroke="#d6a23d" stroke-width="18" stroke-linecap="butt" fill="none"/>
            <path :d="perfectArc" stroke="#4ea46a" stroke-width="18" stroke-linecap="butt" fill="none"/>
            <line v-for="(mark, i) in marks" :key="i" :x1="mark.inner.x" :y1="mark.inner.y"
              :x2="mark.outer.x" :y2="mark.outer.y" stroke="#d0d4d4" stroke-width="2"/>
            <line x1="210" y1="179" :x2="needleEnd.x" :y2="needleEnd.y" stroke="#df665b" stroke-width="5" stroke-linecap="round"/>
            <circle cx="210" cy="179" r="13" fill="#df665b" stroke="#283a38" stroke-width="4"/>
            <text x="210" y="110" text-anchor="middle" class="cooking-gauge-word">COOKING</text>
            <text x="210" y="138" text-anchor="middle" class="cooking-gauge-number">{{ Math.round(needle * 100) }}</text>
          </svg>
          <p>难度越高，完美与普通判定区越窄。每次开始时随机改变判定区位置。</p>
          <p v-if="outcome" class="cooking-outcome" :data-cooking-outcome="outcome" role="status">{{ COOKING_QUALITY_LABEL[outcome] }}料理 · 已完成并存入背包</p>
          <p v-if="error || (quote.blockedReason && !playing)" class="cooking-error" role="status">{{ error || quote.blockedReason }}</p>
          <div class="cooking-buttons">
            <button v-if="playing" type="button" data-cooking-stop :disabled="saving || model.busy" @click="stopCooking">停止指针！</button>
            <button v-else type="button" data-cooking-start :disabled="saving || model.busy || !!quote.blockedReason"
              @click="startCooking">{{ saving ? '正在保存…' : outcome ? '再做一份' : '开始烹饪' }}</button>
            <button type="button" :disabled="saving" @click="close">{{ outcome ? '收好料理' : '取消' }}</button>
          </div>
        </section>
      </div>
      <p class="cooking-note">程序即时判定与结算；具体制作过程（尤其失败原因）留给下次正常剧情的主 LLM 描写，不额外发起请求。</p>
    </section>
  </div>
</template>

<style scoped>
.cooking-shade{position:fixed;inset:0;z-index:310;display:flex;align-items:center;justify-content:center;background:rgba(6,14,12,.84);padding:16px;overflow:auto}
.cooking-dialog{width:min(820px,100%);max-height:94vh;overflow:auto;border:1px solid #b4a77870;border-radius:17px;background:linear-gradient(150deg,#192b27,#101e1c);box-shadow:0 22px 70px #0009;color:#f1ebdb;padding:21px;outline:none}
.cooking-header{display:flex;justify-content:space-between;gap:15px;align-items:start}
.cooking-header small{font-size:12px;letter-spacing:.1em;color:#e4c88c}
.cooking-header h2{font-size:28px;margin:3px 0}
.cooking-header p,.cooking-main p{font-size:13px;color:#c9d1c6}
.cooking-header>button{width:40px;height:40px;border:1px solid #b9c5b84d;background:transparent;border-radius:8px;color:inherit;font-size:26px}
.cooking-recipes{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;margin:18px 0}
.cooking-recipes button{text-align:left;border:1px solid #7c927a55;background:#21352e;border-radius:8px;padding:10px;color:#f4eddb;min-height:58px}
.cooking-recipes button.selected{border-color:#f0cb7e;background:#344538}
.cooking-recipes strong,.cooking-recipes small{display:block}
.cooking-recipes strong{font-size:14px}.cooking-recipes small{font-size:11px;margin-top:4px;color:#c4cdbf}
.cooking-main{display:grid;grid-template-columns:minmax(175px,.8fr) minmax(250px,1.4fr);gap:20px}
.cooking-details{border:1px solid #c4cfb32c;background:#182923;border-radius:10px;padding:13px}
.cooking-title{display:flex;gap:8px;align-items:center;justify-content:space-between}
.cooking-title h3{font-size:18px;margin:0}.cooking-title span{font-size:12px;color:#f0cf8d}
.cooking-details ul{list-style:none;padding:0;margin:8px 0}.cooking-details li{display:flex;justify-content:space-between;gap:6px;border-bottom:1px solid #ffffff12;padding:8px 0;font-size:13px}
.cooking-details li.missing{color:#e8a093}.cooking-footnote{line-height:1.6}
.cooking-meter{text-align:center}
.cooking-meter svg{max-width:100%;display:block;margin:auto}
.cooking-meter-labels{display:flex;justify-content:space-around;gap:10px;font-size:11px;color:#e8e8dc}
.cooking-gauge-word{fill:#728d80;font-size:15px;letter-spacing:4px}.cooking-gauge-number{fill:#dde7df;font-size:24px;font-weight:bold}
.cooking-outcome{font-size:16px!important;color:#bfe7b4!important;font-weight:bold}
.cooking-error{font-size:12px!important;color:#f4a799!important}
.cooking-buttons{display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap;margin-top:14px}
.cooking-buttons button{border-radius:9px;padding:12px 18px;border:1px solid #aaae9b70;background:#253831;color:#f4eddb;font-weight:600}
.cooking-buttons button:first-child{background:#8f5b37;color:#fff;border-color:#d59b61}
.cooking-buttons button:disabled,.cooking-recipes button:disabled{opacity:.5;cursor:not-allowed}
.cooking-note{margin:16px 0 0;padding-top:10px;border-top:1px solid #ffffff24;color:#b8c7b6;font-size:12px;line-height:1.5}
@media(max-width:620px){.cooking-dialog{padding:13px}.cooking-recipes{grid-template-columns:repeat(2,minmax(0,1fr))}.cooking-main{grid-template-columns:1fr}.cooking-meter svg{max-width:340px}.cooking-details ul{display:grid;grid-template-columns:repeat(2,1fr);column-gap:13px}}
</style>
