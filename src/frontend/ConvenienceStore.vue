<script setup lang="ts">
import { computed, ref } from 'vue';
import InventoryPanel from './InventoryPanel.vue';
import StoreProductImage from './StoreProductImage.vue';
import { formatGameNumber } from './format-game-number';
import { runInteraction } from './interaction-action';
import { getPackItemQuote, getPurchaseQuote, getStoreAvailability, PACKAGING_FEE, storeCatalog, type StoreItem } from '../runtime/convenience-store';
import type { ShellActions, ShellModel } from './types';

const props = defineProps<{ model: ShellModel; actions: ShellActions }>();
const categories: { id: StoreItem['category']; label: string; description: string }[] = [
  { id: 'meal', label: '饭食', description: '带上一份热量，继续今天的行程。' },
  { id: 'snack', label: '零食', description: '课间与路上的小小补给。' },
  { id: 'drink', label: '饮品', description: '在货架前挑一瓶喜欢的饮品。' },
  { id: 'cigarette', label: '香烟', description: '按盒购买，按支使用；效果包含健康损失。' },
  { id: 'medicine', label: '医药', description: '常备非处方药与急救调理品。' },
  { id: 'ingredient', label: '食材', description: '买回去，在有厨房的住处自己做。' },
];
const tiers: Record<StoreItem['tier'], string> = { basic: '基础款', standard: '标准款', premium: '精选款' };
const selectedCategory = ref<StoreItem['category']>('meal');
const quantity = ref(1);
const receipt = ref('');
const availability = computed(() => getStoreAvailability(props.model.state));
const currentStats = computed(() => [
  { id: 'energy', label: '精力', value: props.model.state.player.energy, unit: '/ 100' },
  { id: 'morale', label: '精神', value: props.model.state.player.morale, unit: '/ 100' },
  { id: 'health', label: '健康', value: props.model.state.player.health, unit: '/ 100' },
  { id: 'stress', label: '压力', value: props.model.state.player.stress, unit: '/ 100' },
  { id: 'satiety', label: '饱腹', value: props.model.state.player.satiety, unit: '/ 100' },
  { id: 'foodEnergy', label: '食物能量储备', value: props.model.state.player.foodEnergy, unit: 'kcal' },
]);
const currentCategory = computed(() => categories.find(category => category.id === selectedCategory.value)!);
const products = computed(() => storeCatalog.filter(item => item.category === selectedCategory.value)
  .map(item => ({ item, quote: getPurchaseQuote(props.model.state, item.id, quantity.value), packQuote: getPackItemQuote(props.model.state, item.id, quantity.value) })));
const effectLabels: Record<keyof StoreItem['effects'], string> = {
  energy: '精力', morale: '精神', satiety: '饱腹', stress: '压力', health: '健康',
};
function effects(item: StoreItem) {
  return (Object.keys(effectLabels) as (keyof StoreItem['effects'])[])
    .filter(key => (item.effects[key] ?? 0) !== 0)
    .map(key => ({ key, label: effectLabels[key], value: item.effects[key] ?? 0, harmful: key === 'stress' ? (item.effects[key] ?? 0) > 0 : (item.effects[key] ?? 0) < 0 }));
}
async function buy(itemId: string) {
  const quote = getPurchaseQuote(props.model.state, itemId, quantity.value);
  if (props.model.busy || quote.blockedReason || !quote.item) return;
  receipt.value = '';
  if (!await runInteraction(props.model, props.actions, { type: 'buy_item', itemId, quantity: quantity.value })) return;
  receipt.value = `已购买 ${quote.quantity} ${quote.item.purchaseUnit}${quote.item.name}（商品费用 ¥${quote.totalPrice.toFixed(2)}）；已保存，当前携带物品与后续事件见背包、正文及状态。`;
}
async function pack(itemId: string) {
  const quote = getPackItemQuote(props.model.state, itemId, quantity.value);
  if (props.model.busy || quote.blockedReason || !quote.item) return;
  receipt.value = '';
  if (!await runInteraction(props.model, props.actions, { type: 'pack_item', itemId, quantity: quantity.value })) return;
  receipt.value = `已打包 ${quote.quantity} ${quote.item.purchaseUnit}${quote.item.name}（商品及包装费 ¥${quote.totalPrice.toFixed(2)}）；已保存，当前携带物品与后续事件见背包、正文及状态。`;
}
</script>

<template>
  <section class="convenience-store" data-convenience-store aria-label="便利店货架">
    <header class="store-heading"><div><small>街角的一点补给</small><h2>便利店</h2></div><div class="store-wallet"><span>可用余额</span><strong data-store-balance>¥{{ model.state.player.balance.toFixed(2) }}</strong></div></header>
    <p v-if="!availability.available" class="store-unavailable" role="status">{{ availability.blockedReason }}</p>
    <p v-if="receipt" class="store-receipt" role="status" data-purchase-receipt>{{ receipt }}</p>
    <nav class="store-categories" aria-label="商品分类"><button v-for="category in categories" :key="category.id" type="button" :data-store-category="category.id" :aria-pressed="selectedCategory === category.id" @click="selectedCategory = category.id">{{ category.label }}</button></nav>
    <div class="store-shelf-heading"><p>{{ currentCategory.description }}</p><fieldset class="store-quantity"><legend>每次购买数量</legend><button v-for="amount in [1, 3, 5]" :key="amount" type="button" :data-store-quantity="amount" :aria-pressed="quantity === amount" @click="quantity = amount">{{ amount }} 件</button></fieldset></div>
    <div class="store-products">
      <article v-for="{ item, quote, packQuote } in products" :key="item.id" class="store-product" :data-product-id="item.id">
        <header class="store-product-heading"><span class="store-brand">{{ item.brand }}</span><span class="store-tier">{{ tiers[item.tier] }}</span></header>
        <StoreProductImage :item-id="item.id" :name="item.name" class="store-shelf-image" />
        <h3>{{ item.name }}</h3>
        <div class="store-product-price"><strong>¥{{ item.price.toFixed(2) }}</strong><span>/ {{ item.purchaseUnit }}<template v-if="item.packSize > 1"> · {{ item.packSize }} {{ item.useUnit }}</template></span></div>
        <template v-if="item.category !== 'ingredient'">
          <p class="store-serving">每{{ item.useUnit }} {{ item.kcal }} kcal · 用时 {{ item.useMinutes }} 分钟</p>
          <ul class="store-effects" :aria-label="`${item.name}每${item.useUnit}效果`"><li v-for="effect in effects(item)" :key="effect.key" :class="{ harmful: effect.harmful }">{{ effect.label }} {{ effect.value > 0 ? '+' : '−' }}{{ Math.abs(effect.value) }}</li></ul>
        </template>
        <p class="store-owned" data-product-owned>背包库存 {{ quote.owned }} {{ item.useUnit }}</p>
        <button type="button" class="store-buy" :aria-label="`购买${item.name}，${quantity}${item.purchaseUnit}`" :disabled="model.busy || !!quote.blockedReason" @click="buy(item.id)"><span>购买 {{ quantity }} {{ item.purchaseUnit }}</span><strong>¥{{ quote.totalPrice.toFixed(2) }}</strong></button>
        <button v-if="item.category !== 'cigarette' && item.category !== 'ingredient'" type="button" class="store-pack" :data-package-item="item.id" :disabled="model.busy || !!packQuote.blockedReason" :title="packQuote.blockedReason ?? `每件加 ¥${PACKAGING_FEE} 打包费，放入背包后可使用或送人`" @click="pack(item.id)"><span>加包装带走 {{ quantity }} {{ item.purchaseUnit }}<small>每件打包费 ¥{{ PACKAGING_FEE }}</small></span><strong>¥{{ packQuote.totalPrice.toFixed(2) }}</strong></button>
        <p v-if="quote.blockedReason" class="store-blocked">{{ quote.blockedReason }}</p>
        <p v-else class="store-purchase-hint">放入背包 {{ quote.unitsAdded }} {{ item.useUnit }}</p>
      </article>
    </div>
    <p class="store-note">品牌为虚构设定，档位用于区分商品。标注为游戏中的基础效果；实际变化计入使用耗时与状态上下限。</p>
    <dl class="store-current-stats" aria-label="当前身体状态"><div v-for="stat in currentStats" :key="stat.id"><dt>{{ stat.label }}</dt><dd :data-store-player-stat="stat.id">{{ formatGameNumber(stat.value) }} <small>{{ stat.unit }}</small></dd></div></dl>
    <InventoryPanel :model="model" :actions="actions" />
  </section>
</template>
