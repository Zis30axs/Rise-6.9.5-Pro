<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import crychicBranchIcon from './assets/focus/crychic-branch.webp';
import mygoBranchIcon from './assets/focus/mygo-branch.webp';
import type { WorldState } from './types';
import { activeProtagonist, protagonistNames } from '../runtime/protagonist-world';
import {
  FOCUS_CATALOG, MODIFIER_TARGET_LABELS, SPIRIT_CATALOG, TRAIT_CATALOG,
  type StrategyModifier,
} from '../runtime/strategy';
import { resolveProtagonistPhonePose } from './protagonist-phone-art';
import { resolveSakikoOutfit } from './sakiko-art-policy';
import { resolveSakikoIndoorPortrait } from './sakiko-indoor-art';
import { resolveSakikoUniformPortrait } from './sakiko-uniform-art';

const props = defineProps<{ state: WorldState }>();
const who = computed(() => activeProtagonist(props.state));
const heroName = computed(() => protagonistNames[who.value]);
const pose = computed(() => {
  if (who.value === 'sakiko') {
    const art = resolveSakikoOutfit('auto', props.state.locationId) === 'home'
      ? resolveSakikoIndoorPortrait('平静')
      : resolveSakikoUniformPortrait('平静');
    return { src: art.src, width: art.width, height: art.height };
  }
  return resolveProtagonistPhonePose(who.value, { locationId: props.state.locationId });
});
const failed = ref(false);
watch(() => pose.value?.src, () => { failed.value = false; });

const profile = computed(() => props.state.protagonists?.strategy?.people[who.value]);
const traits = computed(() => (profile.value?.traits ?? []).flatMap(id => {
  const item = TRAIT_CATALOG.find(row => row.id === id);
  return item ? [item] : [];
}));
const spirits = computed(() => (profile.value?.spirits ?? []).flatMap(instance => {
  const item = SPIRIT_CATALOG.find(row => row.id === instance.id);
  return item ? [{ ...item, expiresAt: instance.expiresAt }] : [];
}));
const focus = computed(() => FOCUS_CATALOG.find(row => row.id === profile.value?.active?.id));
const completedCount = computed(() => profile.value?.completed.length ?? 0);
const totalFocusCount = computed(() => FOCUS_CATALOG.filter(row => row.owner === who.value).length);
const progress = computed(() => focus.value && profile.value?.active
  ? Math.max(0, Math.min(100, Math.round(profile.value.active.progress / focus.value.durationMinutes * 100))) : 0);
const progressDays = computed(() => {
  if (!focus.value || !profile.value?.active) return null;
  const currentDays = (profile.value.active.progress / 1440).toFixed(1);
  const totalDays = (focus.value.durationMinutes / 1440).toFixed(0);
  return `${currentDays} / ${totalDays} 日`;
});

const focusArtwork: Readonly<Record<string, string>> = {
  soyo_rebuild_crychic: crychicBranchIcon,
  soyo_mygo_future: mygoBranchIcon,
};
const activeFocusIcon = computed(() => (focus.value ? focusArtwork[focus.value.id] ?? null : null));

const modifierTitle: Readonly<Record<StrategyModifier['target'], string>> = MODIFIER_TARGET_LABELS;
function modifierText(item: StrategyModifier): string {
  const value = item.operation === 'multiply' ? `× ${item.amount}` : `${item.amount >= 0 ? '+' : ''}${item.amount}`;
  return `${modifierTitle[item.target]} ${value}`;
}
</script>

<template>
  <section class="uc-status-hero tno-status-hero" aria-label="人物肖像与国策" data-testid="strategy-status-hero">
    <div class="tno-scanline-overlay" aria-hidden="true"></div>

    <!-- Left: TNO Framed Leader Portrait & Designation Plate -->
    <div class="uc-hero-portrait-col">
      <div class="uc-hero-portrait">
        <span class="tno-corner tno-corner-tl" aria-hidden="true"></span>
        <span class="tno-corner tno-corner-tr" aria-hidden="true"></span>
        <span class="tno-corner tno-corner-bl" aria-hidden="true"></span>
        <span class="tno-corner tno-corner-br" aria-hidden="true"></span>
        <img v-if="pose && !failed" :src="pose.src" :alt="`${heroName}的肖像`" draggable="false" @error="failed = true" />
        <div v-else class="uc-hero-placeholder" aria-hidden="true">{{ heroName.slice(-2) }}</div>
        <div class="tno-portrait-plate">
          <small>LEADER // 当前视角</small>
          <strong>{{ heroName }}</strong>
        </div>
      </div>
    </div>

    <!-- Right: TNO Political & National Focus Readout -->
    <div class="uc-hero-details">
      <div class="uc-hero-heading">
        <div class="tno-title-block">
          <small class="tno-kicker">STRATEGIC DOSSIER // 人物状态与战略路线</small>
          <h2>{{ heroName }}</h2>
        </div>
        <div class="tno-heading-badges">
          <span class="tno-metric-chip">已成国策 {{ completedCount }}/{{ totalFocusCount }}</span>
          <span class="uc-hero-control" :class="{ auto: profile?.controller === 'auto' }">
            <i class="tno-led" aria-hidden="true"></i>
            {{ profile?.controller === 'auto' ? 'AI 托管' : '手动操作' }}
          </span>
        </div>
      </div>

      <!-- TNO Active National Focus Slot -->
      <section class="uc-hero-focus" :class="{ active: !!(focus && profile?.active) }" aria-label="当前个人国策">
        <div class="tno-focus-slot">
          <div class="tno-focus-emblem" aria-hidden="true">
            <img v-if="activeFocusIcon" :src="activeFocusIcon" alt="" />
            <span v-else class="tno-focus-glyph">◈</span>
          </div>
          <div class="tno-focus-body">
            <div class="uc-hero-focus-line">
              <span class="tno-focus-label">当前个人国策</span>
              <strong>{{ focus?.title ?? '尚未选择' }}</strong>
            </div>
            <template v-if="focus && profile?.active">
              <div class="uc-hero-progress" role="progressbar" :aria-label="focus.title" :aria-valuenow="progress" aria-valuemin="0" aria-valuemax="100">
                <span :style="{ width: progress + '%' }"></span>
              </div>
              <div class="tno-focus-meta">
                <small>已推进 {{ progress }}%</small>
                <small v-if="progressDays">{{ progressDays }}</small>
              </div>
            </template>
            <p v-else>选择一项国策，或交由人物自主决定。</p>
          </div>
        </div>
      </section>

      <!-- TNO National Spirits & Leader Traits Rack -->
      <details class="uc-hero-traits" :open="traits.length > 0 || spirits.length > 0">
        <summary>
          <span>领导者特质与个人精神</span>
          <span class="tno-count-pill">{{ traits.length + spirits.length }}</span>
        </summary>
        <div v-if="traits.length || spirits.length" class="uc-hero-trait-items">
          <article v-for="trait in traits" :key="trait.id" class="tno-spirit-badge trait">
            <div class="tno-spirit-icon" aria-hidden="true">★</div>
            <div class="tno-spirit-info">
              <strong>{{ trait.title }} <ins>特质</ins></strong>
              <small v-for="(modifier, index) in trait.modifiers" :key="index">{{ modifierText(modifier) }}</small>
            </div>
          </article>
          <article v-for="spirit in spirits" :key="spirit.id" class="tno-spirit-badge spirit">
            <div class="tno-spirit-icon" aria-hidden="true">❖</div>
            <div class="tno-spirit-info">
              <strong>{{ spirit.title }} <ins>精神</ins></strong>
              <small v-for="(modifier, index) in spirit.modifiers" :key="index">{{ modifierText(modifier) }}</small>
            </div>
          </article>
        </div>
        <p v-else>目前没有已记录的领导者特质。</p>
      </details>
    </div>
  </section>
</template>
