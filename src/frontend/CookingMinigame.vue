<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { COOK_TRACK_END, cookingLlmPayload, cookingRecipeOptions, openCookingSession } from '../runtime/cooking';
import type { ShellActions, ShellModel } from './types';

const props = defineProps<{ model: ShellModel; actions: ShellActions }>();
const emit = defineEmits<{ close: [] }>();

const position = ref(0);
const sweeping = ref(false);
const readyOnly = ref(false);
const finished = ref<{ tierLabel: string; dishName: string } | null>(null);
let frame = 0;
let origin = 0;
let alive = true;

const session = computed(() => openCookingSession(props.model.state));
const recipes = computed(() => cookingRecipeOptions(props.model.state));
const readyRecipes = computed(() => recipes.value.filter(recipe => !recipe.blockedReason));
const visibleRecipes = computed(() => readyOnly.value ? readyRecipes.value : recipes.value);
const active = computed(() => session.value);

function point(pos: number, radius = 86) {
  const angle = Math.PI * (1 + pos / COOK_TRACK_END);
  return { x: 110 + radius * Math.cos(angle), y: 118 + radius * Math.sin(angle) };
}
function arc(from: number, to: number) {
  const start = point(from);
  const end = point(to);
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A 86 86 0 0 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}
const needle = computed(() => point(position.value, 86));
const dial = computed(() => {
  const zones = active.value;
  if (!zones) return null;
  return {
    fail: arc(0, COOK_TRACK_END),
    normal: arc(zones.normalLo, zones.normalHi),
    perfect: arc(zones.perfectLo, zones.perfectHi),
  };
});

function loop(now: number) {
  if (!alive || !sweeping.value || !active.value) return;
  if (!origin) origin = now;
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const period = reduced ? 4800 : 2400;
  const phase = ((now - origin) % period) / period;
  const tri = phase < 0.5 ? phase * 2 : 2 - phase * 2;
  position.value = Math.round(tri * COOK_TRACK_END);
  frame = requestAnimationFrame(loop);
}
function startSweep() {
  cancelAnimationFrame(frame);
  origin = 0;
  sweeping.value = true;
  frame = requestAnimationFrame(loop);
}
watch(active, value => {
  if (value && !finished.value) startSweep();
  else cancelAnimationFrame(frame);
}, { immediate: true });
onBeforeUnmount(() => { alive = false; cancelAnimationFrame(frame); });

function begin(recipeId: string) {
  if (props.model.busy) return;
  props.actions.dispatch({ type: 'cook_begin', recipeId });
}
function stop() {
  const current = active.value;
  if (!current || !sweeping.value || props.model.busy) return;
  sweeping.value = false;
  cancelAnimationFrame(frame);
  const at = position.value;
  props.actions.dispatch({ type: 'cook_settle', sessionId: current.id, position: at });
  if (openCookingSession(props.model.state)?.id === current.id) {
    startSweep();
    return;
  }
  const facts = cookingLlmPayload(props.model.state);
  if (facts?.status === 'settled') finished.value = { tierLabel: facts.tierLabel, dishName: facts.dishName };
}
function leave() {
  const current = active.value;
  if (current && !finished.value && !props.model.busy) props.actions.dispatch({ type: 'cook_cancel', sessionId: current.id });
  emit('close');
}
</script>

<template>
  <div class="bed-rest-overlay" @click.self="emit('close')">
    <section class="bed-rest-dialog cook-dialog" role="dialog" aria-modal="true" aria-label="下厨" data-cooking @click.stop>
      <header><small>厨房</small><h2>下厨</h2><p v-if="active">指针来回摆。看准了再停。</p></header>
      <div v-if="finished" class="cook-result" data-cook-result>
        <h3>{{ finished.tierLabel }}</h3>
        <p>{{ finished.dishName }}已经放进背包。</p>
        <button type="button" class="bed-rest-cancel" data-cook-close @click="emit('close')">好</button>
      </div>
      <template v-else-if="active && dial">
        <div class="cook-meter-wrap">
          <svg class="cook-meter" viewBox="0 0 220 132" data-cook-meter role="img" aria-label="料理指针">
            <path :d="dial.fail" class="cook-zone-fail" fill="none" stroke-width="14" />
            <path :d="dial.normal" class="cook-zone-normal" fill="none" stroke-width="14" />
            <path :d="dial.perfect" class="cook-zone-perfect" fill="none" stroke-width="14" />
            <line data-cook-needle :x1="110" :y1="118" :x2="needle.x" :y2="needle.y" class="cook-needle" stroke-width="3" />
            <circle class="cook-pivot" cx="110" cy="118" r="5" />
          </svg>
          <p class="cook-legend"><span><i class="cook-swatch-perfect"></i>完美</span><span><i class="cook-swatch-normal"></i>普通</span><span><i class="cook-swatch-fail"></i>失败料理</span></p>
          <button type="button" class="cook-stop" data-cook-stop :disabled="model.busy" @click="stop">停下</button>
        </div>
        <button type="button" class="bed-rest-cancel" data-cook-cancel @click="leave">先不煮了</button>
      </template>
      <template v-else>
        <div class="cook-filter" role="group" aria-label="菜谱筛选">
          <button type="button" :aria-pressed="!readyOnly" @click="readyOnly = false">全部菜谱</button>
          <button type="button" :aria-pressed="readyOnly" @click="readyOnly = true">现在能做（{{ readyRecipes.length }}）</button>
        </div>
        <div class="cook-recipes">
          <button v-for="recipe in visibleRecipes" :key="recipe.id" type="button" class="cook-recipe" :data-cook-recipe="recipe.id" :disabled="model.busy || !!recipe.blockedReason" :title="recipe.blurb" @click="begin(recipe.id)">
            <strong>{{ recipe.name }}</strong>
            <span>难度 {{ recipe.difficulty }} · {{ recipe.minutes }} 分钟 · 精力 −{{ recipe.energyCost }}</span>
            <small>食材折合 ¥{{ recipe.ingredientCost }}</small>
            <small class="cook-ingredients" aria-label="食材库存和所需份数">
              <span v-for="item in recipe.ingredients" :key="item.id" :class="{ 'cook-missing': item.owned < item.needed }">{{ item.name }} {{ item.owned }}/{{ item.needed }}</span>
            </small>
            <small v-if="recipe.blockedReason">{{ recipe.blockedReason }}</small>
          </button>
          <p v-if="!visibleRecipes.length" role="status">现在没有能做的菜。</p>
        </div>
        <button type="button" class="bed-rest-cancel" data-cook-close @click="emit('close')">离开</button>
      </template>
    </section>
  </div>
</template>
