<script setup lang="ts">
import { computed, ref } from 'vue';
import StoreProductImage from './StoreProductImage.vue';
import { formatGameNumber } from './format-game-number';
import { runInteraction } from './interaction-action';
import { getUseItemQuote, getInventoryCatalog } from '../runtime/convenience-store';
import { EQUIPMENT_SLOTS, equippedItem, type EquipmentSlot } from '../runtime/equipment';
import type { ShellActions, ShellModel } from './types';

const props = defineProps<{ model: ShellModel; actions: ShellActions }>();
const entries = computed(() => getInventoryCatalog().flatMap(item => {
  const quote = getUseItemQuote(props.model.state, item.id);
  return quote.owned > 0 ? [{ item, quote }] : [];
}));
const receipt = ref('');
const slotLabels: Record<EquipmentSlot, string> = {
  'permanent-1': '常驻道具一', 'permanent-2': '常驻道具二', special: '特殊道具',
};
const equipmentSlots = computed(() => EQUIPMENT_SLOTS.map(id => {
  const itemId = equippedItem(props.model.state, id);
  return { id, label: slotLabels[id], name: itemId ? getInventoryCatalog().find(item => item.id === itemId)?.name ?? itemId : '未装备' };
}));
function equippedSlot(itemId: string): EquipmentSlot | undefined {
  return props.model.state.inventory.find(row => row.itemId === itemId)?.equipped;
}
async function changeEquipment(itemId: string, slot: EquipmentSlot | null) {
  if (props.model.busy) return;
  const previous = equippedSlot(itemId);
  if (slot !== null && previous === slot) return;
  receipt.value = '';
  if (!await runInteraction(props.model, props.actions, { type: 'equip_item', itemId, slot })) return;
  receipt.value = slot === null ? '已卸下道具，物品仍留在背包。' : `已装备至${slotLabels[slot]}。`;
}
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
    <header class="inventory-heading"><div><h2>随身背包</h2><p>物品与装备属于当前主角。两格常驻道具与一格特殊道具可分别装备。</p></div><span class="inventory-count">{{ entries.length }} 种物品</span></header>
    <div class="equipment-slots" role="group" aria-label="装备栏">
      <div v-for="slot in equipmentSlots" :key="slot.id" class="equipment-slot" :data-equipment-slot="slot.id">
        <small>{{ slot.label }}</small><strong>{{ slot.name }}</strong>
      </div>
    </div>
    <p v-if="receipt" class="inventory-receipt" role="status" data-use-receipt>{{ receipt }}</p>
    <div v-if="entries.length" class="inventory-list">
      <article v-for="{ item, quote } in entries" :key="item.id" class="inventory-item" :data-inventory-product="item.id">
        <div class="inventory-item-heading"><StoreProductImage :item-id="item.id" :name="item.name" class="inventory-product-image" /><div class="inventory-item-title"><small>{{ item.brand }}</small><h3>{{ item.name }}</h3></div><span class="inventory-owned" data-inventory-quantity>{{ quote.owned }} {{ item.useUnit }}</span></div>
        <template v-if="item.equipmentKind">
          <p class="inventory-serving">{{ item.id === 'stationery-r27et1' ? '装备后学习点 +25% · 多支不叠加 · 不消耗' : '装备后生效 · 不消耗' }}</p>
          <div class="inventory-use-row equipment-actions">
            <button v-for="slotId in EQUIPMENT_SLOTS.filter(slot => item.equipmentKind === (slot === 'special' ? 'special' : 'permanent'))" :key="slotId"
              type="button" class="inventory-use" :data-equip-slot="slotId" :disabled="model.busy || equippedSlot(item.id) === slotId"
              @click="changeEquipment(item.id, slotId)">{{ equippedSlot(item.id) === slotId ? '使用中' : `装备至${slotLabels[slotId]}` }}</button>
            <button v-if="equippedSlot(item.id)" type="button" class="inventory-use" data-unequip-item :disabled="model.busy" @click="changeEquipment(item.id, null)">卸下</button>
          </div>
        </template>
        <template v-else>
          <p class="inventory-serving">每{{ item.useUnit }} {{ item.kcal }} kcal · 用时 {{ item.useMinutes }} 分钟</p>
          <p v-if="!quote.blockedReason" class="inventory-actual-effects" data-use-preview>此次实际变化：<template v-for="(effect, index) in actualChanges(quote)" :key="effect.key"><span :class="{ harmful: effect.harmful }">{{ effect.label }} {{ signed(effect.value) }}{{ effect.unit }}</span><template v-if="index < actualChanges(quote).length - 1"> · </template></template></p>
          <div class="inventory-use-row"><small v-if="quote.blockedReason" class="inventory-blocked">{{ quote.blockedReason }}</small><small v-else>使用 1 {{ item.useUnit }}</small><button type="button" class="inventory-use" :aria-label="`使用${item.name}`" :disabled="model.busy || !!quote.blockedReason" @click="useItem(item.id)">使用<span aria-hidden="true"> ↗</span></button></div>
        </template>
      </article>
    </div>
    <p v-else class="inventory-empty">背包还是空的。可以在便利店购买食物，或到街角书店旁的文具店选购学习文具。</p>
    <p v-if="entries.some(({ item }) => !item.equipmentKind)" class="inventory-effect-note">消耗品预览已计入使用耗时与状态上下限。</p>
  </section>
</template>
