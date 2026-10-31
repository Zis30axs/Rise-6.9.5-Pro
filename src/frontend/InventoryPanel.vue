<script setup lang="ts">
import { computed, ref } from 'vue';
import StoreProductImage from './StoreProductImage.vue';
import { formatGameNumber } from './format-game-number';
import { runInteraction } from './interaction-action';
import { getUseItemQuote, getInventoryCatalog } from '../runtime/convenience-store';
import { getCookingRecipe, COOKING_QUALITY_LABEL } from '../runtime/cooking-recipes';
import { cookedDishQuote, cookingSkill } from '../runtime/cooking';
import { activeProtagonist } from '../runtime/protagonist-world';
import { worldScenePeople, worldScenePosition } from '../runtime/world-presence';
import type { ShellActions, ShellModel } from './types';

const props = defineProps<{ model: ShellModel; actions: ShellActions }>();
const emit = defineEmits<{ inviteMeal: [dishId: string, npcId: string] }>();
const guestId = ref('');
const cooked = computed(() => (props.model.state.cooking?.dishes ?? [])
  .filter(row => row.owner === activeProtagonist(props.model.state))
  .map(dish => ({ dish, recipe: getCookingRecipe(dish.recipeId)!, quote: cookedDishQuote(props.model.state, dish.id) })));
const cookSkill = computed(() => cookingSkill(props.model.state.cooking?.experience[activeProtagonist(props.model.state)] ?? 0));
const possibleGuests = computed(() => {
  const pos = worldScenePosition(props.model.state);
  if (!pos) return [];
  return worldScenePeople(props.model.state).filter(person => !person.protagonistId &&
    Math.hypot(person.x - pos.x, person.z - pos.z) <= 7);
});
async function eatCooked(dishId: string) {
  if (props.model.busy || cookedDishQuote(props.model.state, dishId).blockedReason) return;
  receipt.value = '';
  if (!await runInteraction(props.model, props.actions, { type: 'eat_cooked', dishId })) return;
  receipt.value = '已享用 1 份自制料理；营养与精力已由程序结算，体验会在下次正常剧情中体现。';
}
function inviteCooked(dishId: string) {
  if (props.model.busy || !guestId.value || cookedDishQuote(props.model.state, dishId, guestId.value).blockedReason) return;
  emit('inviteMeal', dishId, guestId.value);
}
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
    <p v-else class="inventory-empty">普通物品背包为空。可以去便利店买食材与食品，或打包餐饮。</p>
    <section class="cooked-inventory" data-cooked-inventory aria-label="自制料理背包">
      <header class="inventory-heading"><div><h2>自制料理</h2><p>厨艺 {{ cookSkill.label }} · 自制料理按品质和批次分别保存。</p></div><span class="inventory-count">{{ cooked.reduce((n, item) => n + item.dish.servings, 0) }} 份</span></header>
      <div v-if="cooked.length" class="inventory-list">
        <article v-for="{ dish, recipe, quote } in cooked" :key="dish.id" class="inventory-item" :data-cooked-dish="dish.id">
          <div class="inventory-item-heading"><div class="inventory-item-title"><small>🍳 {{ COOKING_QUALITY_LABEL[dish.quality] }}品质</small><h3>{{ recipe.name }}</h3></div><span class="inventory-owned">{{ dish.servings }} 份</span></div>
          <p class="inventory-serving">每份约 {{ recipe.kcal }} kcal · 制作者：{{ dish.chef === 'emma' ? '樱羽艾玛' : dish.chef === 'soyo' ? '长崎素世' : dish.chef === 'sakiko' ? '丰川祥子' : '甘织玲奈子' }}</p>
          <div class="inventory-use-row"><small>{{ quote.blockedReason ?? '食用消耗一份，并结算营养效果。' }}</small><button type="button" class="inventory-use" :disabled="model.busy || !!quote.blockedReason" :data-eat-cooked="dish.id" @click="eatCooked(dish.id)">享用一份</button></div>
          <div v-if="dish.servings >= 2 && possibleGuests.length" class="cooked-share">
            <label>邀请在场 NPC 共餐
              <select v-model="guestId" aria-label="选择共餐 NPC"><option value="">选择人物</option><option v-for="person in possibleGuests" :key="person.id" :value="person.id">{{ person.name }}</option></select>
            </label>
            <button type="button" :disabled="model.busy || !guestId || !!cookedDishQuote(model.state, dish.id, guestId).blockedReason" :data-invite-cooked="dish.id" @click="inviteCooked(dish.id)">邀请共餐</button>
          </div>
        </article>
      </div>
      <p v-else class="inventory-empty">尚无自制料理。去厨房选择菜谱，使用指针小游戏制作。</p>
    </section>
    <p v-if="entries.length" class="inventory-effect-note">预览已计入使用耗时与状态上下限；数值为 0 时，本次该项状态不变。</p>
  </section>
</template>

<style scoped>
.cooked-inventory{margin-top:20px;padding-top:14px;border-top:1px solid #aab7a345}
.cooked-share{display:flex;align-items:end;gap:8px;flex-wrap:wrap;margin-top:10px}
.cooked-share label{display:flex;flex-direction:column;gap:4px;font-size:12px}
.cooked-share select{color:inherit;background:#183328;border:1px solid #aaad8b77;padding:8px;border-radius:7px;max-width:180px}
.cooked-share button{background:#4b6240;color:#fff;border:1px solid #bbcd9c88;padding:9px;border-radius:7px}
.cooked-share button:disabled{opacity:.4}
</style>
