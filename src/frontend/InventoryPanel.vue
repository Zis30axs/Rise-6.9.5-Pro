<script setup lang="ts">
import { computed, ref } from 'vue';
import StoreProductImage from './StoreProductImage.vue';
import { formatGameNumber } from './format-game-number';
import { runInteraction } from './interaction-action';
import { getUseItemQuote, getInventoryCatalog } from '../runtime/convenience-store';
import type { ShellActions, ShellModel } from './types';

const props = defineProps<{ model: ShellModel; actions: ShellActions }>();
const entries = computed(() => getInventoryCatalog().flatMap(item => {
  const quote = getUseItemQuote(props.model.state, item.id);
  return quote.owned > 0 ? [{ item, quote }] : [];
}));
const receipt = ref('');
type UseQuote = ReturnType<typeof getUseItemQuote>;
type ChangeKey = keyof UseQuote['changes'];
const effectLabels: Record<ChangeKey, string> = {
  energy: '精力', morale: '精神', satiety: '饱腹', stress: '压力', health: '健康', foodEnergy: '食物能量储备',
};
function actualChanges(quote: UseQuote) {
  return (Object.keys(effectLabels) as ChangeKey[])
    .filter(key => (quote.changes[key] ?? 0) !== 0 || (key === 'foodEnergy' ? quote.item?.kcal : quote.item?.effects[key]))
    .map(key => ({ key, label: effectLabels[key], value: quote.changes[key] ?? 0, unit: key === 'foodEnergy' ? ' kcal' : '', harmful: key === 'stress' ? (quote.changes[key] ?? 0) > 0 : (quote.changes[key] ?? 0) < 0 }));
}
function signed(value: number) { return `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatGameNumber(Math.abs(value))}`; }
async function useItem(itemId: string) {
  const quote = getUseItemQuote(props.model.state, itemId);
  if (props.model.busy || quote.blockedReason || !quote.item) return;
  receipt.value = '';
  if (!await runInteraction(props.model, props.actions, { type: 'use_item', itemId })) return;
  receipt.value = `已使用 1 ${quote.item.useUnit}${quote.item.name}，已保存；实际变化与后续事件见正文和状态。`;
}
</script>

<template>
  <section class="inventory-panel" data-inventory-panel aria-label="随身背包">
    <header class="inventory-heading"><div><h2>随身背包</h2><p>购买和打包的物品放在这里，使用时才结算效果。也可以在故事中提出送给某位联系人。</p></div><span class="inventory-count">{{ entries.length }} 种物品</span></header>
    <p v-if="receipt" class="inventory-receipt" role="status" data-use-receipt>{{ receipt }}</p>
    <div v-if="entries.length" class="inventory-list">
      <article v-for="{ item, quote } in entries" :key="item.id" class="inventory-item" :data-inventory-product="item.id">
        <div class="inventory-item-heading"><StoreProductImage :item-id="item.id" :name="item.name" class="inventory-product-image" /><div class="inventory-item-title"><small>{{ item.brand }}</small><h3>{{ item.name }}</h3></div><span class="inventory-owned" data-inventory-quantity>{{ quote.owned }} {{ item.useUnit }}</span></div>
        <p class="inventory-serving">每{{ item.useUnit }} {{ item.kcal }} kcal · 用时 {{ item.useMinutes }} 分钟</p>
        <p v-if="!quote.blockedReason" class="inventory-actual-effects" data-use-preview>此次实际变化：<template v-for="(effect, index) in actualChanges(quote)" :key="effect.key"><span :class="{ harmful: effect.harmful }">{{ effect.label }} {{ signed(effect.value) }}{{ effect.unit }}</span><template v-if="index < actualChanges(quote).length - 1"> · </template></template></p>
        <div class="inventory-use-row"><small v-if="quote.blockedReason" class="inventory-blocked">{{ quote.blockedReason }}</small><small v-else>使用 1 {{ item.useUnit }}</small><button type="button" class="inventory-use" :aria-label="`使用${item.name}`" :disabled="model.busy || !!quote.blockedReason" @click="useItem(item.id)">使用<span aria-hidden="true"> ↗</span></button></div>
      </article>
    </div>
    <p v-else class="inventory-empty">背包还是空的。可以在便利店购买，或把咖啡、甜点与餐食打包带走。</p>
    <p v-if="entries.length" class="inventory-effect-note">预览已计入使用耗时与状态上下限；数值为 0 时，本次该项状态不变。</p>
  </section>
</template>
