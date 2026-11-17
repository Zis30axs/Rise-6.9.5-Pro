<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { live2dPack, type Live2dOutfit } from '../runtime/live2d-pack';
import { chooseLive2dOutfit } from '../runtime/live2d-wardrobe';
import { activeProtagonist, protagonistNames } from '../runtime/protagonist-world';
import { WARDROBE_CATEGORIES, WARDROBE_DETAIL_LABELS, type WardrobeCategory, type WardrobeDetailKey } from '../runtime/wardrobe-state';
import type { ShellActions, ShellModel } from './types';

const props = defineProps<{ model: ShellModel; actions: ShellActions }>();
const revision = ref(0);
const filter = ref<WardrobeCategory | 'all'>('all');
let unsubscribe: (() => void) | undefined;
onMounted(() => { unsubscribe = live2dPack()?.subscribe(() => revision.value++); });
onBeforeUnmount(() => unsubscribe?.());
const person = computed(() => activeProtagonist(props.model.state));
const available = computed((): Live2dOutfit[] => {
  void revision.value;
  const state = live2dPack()?.status();
  if (!state?.enabled || (person.value !== 'soyo' && person.value !== 'sakiko')) return [];
  return state.models.filter(row => row.person === person.value).sort((a,b) => a.label.localeCompare(b.label, 'zh-CN'));
});
const categories = computed(() => WARDROBE_CATEGORIES.filter(category =>
  available.value.some(outfit => outfit.tags.includes(category.id))));
const visible = computed(() => filter.value === 'all' ? available.value :
  available.value.filter(outfit => outfit.tags.includes(filter.value)));
const selected = computed(() => {
  void revision.value;
  const id = person.value;
  if (id !== 'soyo' && id !== 'sakiko') return null;
  return chooseLive2dOutfit(props.model.memoryScope, props.model.state, id)?.outfit.id ?? null;
});
const details = computed(() => {
  const id = person.value;
  return id === 'soyo' || id === 'sakiko' ? props.model.state.wardrobe?.[id]?.details : undefined;
});
const detailRows = computed(() => Object.entries(WARDROBE_DETAIL_LABELS)
  .map(([key,label]) => ({ key, label, value: details.value?.[key as WardrobeDetailKey] ?? '未记录' })));
function wear(outfit: Live2dOutfit) {
  if (props.model.busy || outfit.id === selected.value) return;
  props.actions.dispatch({ type: 'wardrobe_choose', outfitId: outfit.id });
}
</script>

<template>
  <section class="uc-wardrobe" data-wardrobe-panel aria-label="衣柜">
    <div class="uc-wardrobe-heading"><h2>衣柜</h2><small>{{ protagonistNames[person] }}的衣装</small></div>
    <template v-if="available.length">
      <p class="uc-wardrobe-note">选择穿搭后会保留到下一次换装；故事里的衣着变化也会更新记录。</p>
      <label class="uc-wardrobe-filter">查看类别
        <select v-model="filter" aria-label="筛选衣装类别">
          <option value="all">全部衣装（{{ available.length }}）</option>
          <option v-for="category in categories" :key="category.id" :value="category.id">{{ category.label }}</option>
        </select>
      </label>
      <div class="uc-wardrobe-options">
        <article v-for="outfit in visible" :key="outfit.id" class="uc-wardrobe-item" :class="{ chosen: selected === outfit.id }">
          <div><strong>{{ outfit.label }}</strong><p>{{ outfit.description }}</p></div>
          <button type="button" :disabled="model.busy || selected === outfit.id" @click="wear(outfit)">
            {{ selected === outfit.id ? '当前穿着' : '换上这套' }}
          </button>
        </article>
      </div>
    </template>
    <p v-else class="uc-wardrobe-note">当前没有可用的 Live2D 换装资源。角色仍可在故事中更换衣着。</p>
    <details class="uc-wardrobe-details">
      <summary>衣着细节</summary>
      <dl>
        <div v-for="row in detailRows" :key="row.key">
          <dt>{{ row.label }}</dt><dd>{{ row.value }}</dd>
        </div>
      </dl>
    </details>
  </section>
</template>

<style scoped>
.uc-wardrobe { margin: 12px 0; border: 1px solid rgba(184,166,130,.35); border-radius: 12px; padding: 14px; color: inherit; }
.uc-wardrobe-heading { display: flex; gap: 10px; justify-content: space-between; align-items: baseline; }
.uc-wardrobe-heading h2 { margin: 0; font-size: 1.05rem; }
.uc-wardrobe-heading small, .uc-wardrobe-note { opacity: .8; }
.uc-wardrobe-note { margin: 8px 0 12px; font-size: .86rem; line-height: 1.6; }
.uc-wardrobe-filter { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; font-size: .9rem; }
.uc-wardrobe-filter select { min-width: 0; max-width: 100%; padding: 7px; color: inherit; background: transparent; border: 1px solid currentColor; border-radius: 8px; }
.uc-wardrobe-filter option { color: #222; }
.uc-wardrobe-options { max-height: 330px; overflow-y: auto; display: grid; gap: 8px; }
.uc-wardrobe-item { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px; border: 1px solid rgba(184,166,130,.35); border-radius: 10px; }
.uc-wardrobe-item.chosen { border-color: #c49a62; }
.uc-wardrobe-item div { min-width: 0; flex: 1; }
.uc-wardrobe-item strong { font-size: .9rem; }
.uc-wardrobe-item p { opacity: .78; font-size: .8rem; line-height: 1.5; margin: 5px 0 0; }
.uc-wardrobe-item button { flex-shrink: 0; border-radius: 8px; padding: 7px 10px; border: 1px solid rgba(184,166,130,.6); background: transparent; color: inherit; font-size: .85rem; }
.uc-wardrobe-item button:disabled { opacity: .58; }
.uc-wardrobe-details { margin-top: 12px; }
.uc-wardrobe-details summary { cursor: pointer; font-size: .9rem; }
.uc-wardrobe-details dl { margin: 10px 0 0; display: grid; gap: 6px; }
.uc-wardrobe-details dl div { display: grid; grid-template-columns: minmax(64px, 22%) 1fr; gap: 10px; font-size: .88rem; }
.uc-wardrobe-details dt { opacity: .72; } .uc-wardrobe-details dd { margin: 0; overflow-wrap: anywhere; }
@media (max-width: 440px) { .uc-wardrobe { padding: 10px; } .uc-wardrobe-item { align-items: flex-start; flex-direction: column; } }
</style>
