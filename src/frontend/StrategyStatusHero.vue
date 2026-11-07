<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { WorldState } from './types';
import { activeProtagonist, protagonistNames } from '../runtime/protagonist-world';
import { FOCUS_CATALOG, TRAIT_CATALOG, type StrategyModifier } from '../runtime/strategy';
import { resolveProtagonistPhonePose } from './protagonist-phone-art';

const props = defineProps<{ state: WorldState }>();
const who = computed(() => activeProtagonist(props.state));
const heroName = computed(() => protagonistNames[who.value]);
const pose = computed(() => resolveProtagonistPhonePose(who.value, { locationId: props.state.locationId }));
const failed = ref(false);
watch(() => pose.value?.src, () => { failed.value = false; });
const profile = computed(() => props.state.protagonists?.strategy?.people[who.value]);
const traits = computed(() => (profile.value?.traits ?? []).flatMap(id => {
  const item = TRAIT_CATALOG.find(row => row.id === id);
  return item ? [item] : [];
}));
const focus = computed(() => FOCUS_CATALOG.find(row => row.id === profile.value?.active?.id));
const progress = computed(() => focus.value && profile.value?.active
  ? Math.max(0, Math.min(100, Math.round(profile.value.active.progress / focus.value.durationMinutes * 100))) : 0);
const modifierTitle: Readonly<Record<StrategyModifier['target'],string>> = {
  focus_ai_weight: '国策 AI 选择权重',
  focus_progress_rate: '国策推进效率',
  social_xp_rate: '社交经验获取',
};
function modifierText(item: StrategyModifier): string {
  const value = item.operation === 'multiply' ? `× ${item.amount}` : `${item.amount >= 0 ? '+' : ''}${item.amount}`;
  return `${modifierTitle[item.target]} ${value}`;
}
</script>

<template>
  <section class="uc-status-hero" aria-label="人物肖像与国策" data-testid="strategy-status-hero">
    <div class="uc-hero-portrait">
      <img v-if="pose && !failed" :src="pose.src" :alt="`${heroName}的肖像`" draggable="false" @error="failed = true" />
      <div v-else class="uc-hero-placeholder" aria-hidden="true">{{ heroName.slice(-2) }}</div>
    </div>
    <div class="uc-hero-details">
      <div class="uc-hero-heading">
        <div>
          <small>人物状态</small>
          <h2>{{ heroName }}</h2>
        </div>
        <span class="uc-hero-control">{{ profile?.controller === 'auto' ? 'AI 托管' : '手动操作' }}</span>
      </div>
      <details class="uc-hero-traits" :open="traits.length > 0">
        <summary>领导者特质 <span>{{ traits.length }}</span></summary>
        <div v-if="traits.length" class="uc-hero-trait-items">
          <article v-for="trait in traits" :key="trait.id">
            <strong>{{ trait.title }}</strong>
            <small v-for="(modifier, index) in trait.modifiers" :key="index">{{ modifierText(modifier) }}</small>
          </article>
        </div>
        <p v-else>目前没有已记录的领导者特质。</p>
      </details>
      <section class="uc-hero-focus" aria-label="当前个人国策">
        <div class="uc-hero-focus-line">
          <span>当前个人国策</span>
          <strong>{{ focus?.title ?? '尚未选择' }}</strong>
        </div>
        <template v-if="focus && profile?.active">
          <div class="uc-hero-progress" role="progressbar" :aria-label="focus.title" :aria-valuenow="progress" aria-valuemin="0" aria-valuemax="100">
            <span :style="{ width: progress + '%' }"></span>
          </div>
          <small>已推进 {{ progress }}%</small>
        </template>
        <p v-else>国策可以由人物手动选择，或在启用托管后由本地 AI 推进。</p>
      </section>
    </div>
  </section>
</template>

<style scoped>
.uc-status-hero { display: grid; grid-template-columns: minmax(140px, 34%) minmax(0,1fr); gap: 18px; align-items: stretch; padding: 16px; margin: 0 0 16px; border: 1px solid rgba(120,130,154,.22); border-radius: 16px; background: linear-gradient(145deg,rgba(93,105,137,.12),rgba(136,129,162,.05)); }
.uc-hero-portrait { min-height: 250px; max-height: 340px; border-radius: 13px; overflow: hidden; display: grid; place-items: end center; background: radial-gradient(ellipse at 50% 90%,rgba(180,167,202,.34),rgba(120,130,154,.07) 65%); }
.uc-hero-portrait img { width: 100%; height: 100%; max-height: 340px; object-fit: contain; object-position: center bottom; }
.uc-hero-placeholder { margin: auto; font-size: 2rem; opacity: .65; }
.uc-hero-details { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.uc-hero-heading { display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 6px; }
.uc-hero-heading small { font-size: .72rem; opacity: .65; }
.uc-hero-heading h2 { font-size: 1.25rem; line-height: 1.4; margin: 4px 0 0; }
.uc-hero-control { font-size: .7rem; padding: 5px 9px; border-radius: 999px; background: rgba(120,130,154,.15); white-space: nowrap; }
.uc-hero-traits { border: 1px solid rgba(120,130,154,.18); border-radius: 10px; padding: 10px 12px; }
.uc-hero-traits summary { cursor: pointer; font-weight: 700; font-size: .86rem; }
.uc-hero-traits summary span { opacity: .6; font-weight: 400; padding-left: 4px; }
.uc-hero-trait-items { display: grid; gap: 10px; padding-top: 11px; }
.uc-hero-trait-items article { display: grid; gap: 4px; }
.uc-hero-trait-items strong { font-size: .86rem; }
.uc-hero-trait-items small, .uc-hero-traits p { font-size: .75rem; opacity: .75; margin: 0; }
.uc-hero-focus { margin-top: auto; border: 1px solid rgba(120,130,154,.18); border-radius: 10px; padding: 11px 12px; }
.uc-hero-focus-line { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; font-size: .79rem; }
.uc-hero-focus-line strong { text-align: right; font-size: .82rem; }
.uc-hero-progress { height: 8px; border-radius: 999px; margin-top: 11px; background: rgba(120,130,154,.18); overflow: hidden; }
.uc-hero-progress span { display: block; height: 100%; border-radius: inherit; background: #729bc3; transition: width .2s ease; }
.uc-hero-focus small, .uc-hero-focus p { display: block; margin: 7px 0 0; opacity: .7; font-size: .75rem; }
@media (max-width: 550px) { .uc-status-hero { grid-template-columns: minmax(104px,35%) minmax(0,1fr); gap: 10px; padding: 10px; } .uc-hero-portrait { min-height: 200px; max-height: 280px; } .uc-hero-heading h2 { font-size: 1.05rem; } .uc-hero-control { font-size: .64rem; } }
</style>