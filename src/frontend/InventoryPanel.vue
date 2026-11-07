<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { equipmentCatalog, equipmentQuote, EQUIPMENT_SLOTS, equippedItem, type EquipmentSlot } from '../runtime/equipment';
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
const owner = computed(() => props.model.state.protagonists?.accounts.active ?? 'soyo');
const equipmentEntries = computed(() => equipmentCatalog.flatMap(item => {
  const quote = equipmentQuote(props.model.state, owner.value, item.id);
  return props.model.state.inventory.some(row => row.itemId === item.id) ? [{ item, quote }] : [];
}));
const receipt = ref('');
const slotLabels: Record<EquipmentSlot, string> = { 'permanent-1': '常驻道具一', 'permanent-2': '常驻道具二', special: '特殊道具' };
const equipmentSlots = computed(() => EQUIPMENT_SLOTS.map(id => {
  const itemId = equippedItem(props.model.state, id);
  const name = itemId ? equipmentCatalog.find(item => item.id === itemId)?.name
    ?? getInventoryCatalog().find(item => item.id === itemId)?.name ?? itemId : '未装备';
  return { id, label: slotLabels[id], name };
}));
function equippedSlot(itemId: string): EquipmentSlot | undefined {
  const value = props.model.state.inventory.find(row => row.itemId === itemId)?.equipped;
  return typeof value === 'string' ? value as EquipmentSlot : value === true ? 'special' : undefined;
}
async function changeEquipment(itemId: string, slot: EquipmentSlot | null) {
  if (props.model.busy || props.model.switchingProtagonist || (slot !== null && equippedSlot(itemId) === slot)) return;
  receipt.value = '';
  if (!await runInteraction(props.model, props.actions, { type: 'equip_item', itemId, slot })) return;
  receipt.value = slot === null ? '道具已收起，仍保留在背包中。' : `已装备至${slotLabels[slot]}。`;
}
watch(owner, () => { receipt.value = ''; });
function equipItem(itemId: string) {
  const quote = equipmentQuote(props.model.state, owner.value, itemId);
  if (props.model.busy || props.model.switchingProtagonist || quote.blockedReason) return;
  receipt.value = '';
  props.actions.dispatch({ type: quote.equipped ? 'unequip_item' : 'equip_item', itemId });
  const after = equipmentQuote(props.model.state, owner.value, itemId);
  if (after.equipped !== quote.equipped)
    receipt.value = after.equipped ? `已装备${quote.item!.name}。` : `已收起${quote.item!.name}。`;
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
    <header class="inventory-heading"><div><h2>随身背包</h2><p>随身物品与珍藏都放在这里。珍藏可以装备或收起，也可以在故事中提出。</p></div><span class="inventory-count">{{ entries.length + equipmentEntries.length }} 种物品</span></header>
    <p v-if="receipt" class="inventory-receipt" role="status" data-use-receipt>{{ receipt }}</p>
    <div class="equipment-slots" role="group" aria-label="装备栏">
      <div v-for="slot in equipmentSlots" :key="slot.id" class="equipment-slot" :data-equipment-slot="slot.id">
        <small>{{ slot.label }}</small><strong>{{ slot.name }}</strong>
      </div>
    </div>
    <div v-if="entries.length || equipmentEntries.length" class="inventory-list" aria-label="背包物品">
      <article v-for="{ item, quote } in equipmentEntries" :key="item.id" class="inventory-item" :data-equipment-item="item.id">
        <div class="inventory-item-heading"><StoreProductImage :item-id="item.id" :name="item.name" class="inventory-product-image" /><div class="inventory-item-title"><small>随身珍藏</small><h3>{{ item.name }}</h3></div><span class="inventory-owned" data-equipment-status>{{ quote.equipped ? '使用中' : '已收起' }}</span></div>
        <p class="inventory-serving">{{ quote.profile?.description ?? item.description }}</p>
        <p v-if="quote.profile" class="inventory-actual-effects" data-equipment-effects>音乐学习经验 ×{{ quote.profile.music }}<template v-if="!quote.profile.musicMajor"> · 当前专业经验 ×{{ quote.profile.major }}</template> · 社交经验 ×{{ quote.profile.social }}</p>
        <p v-else class="inventory-serving">确认专业后，这份回忆对学习与交往的影响也会随之明确。</p>
        <div class="inventory-use-row"><small>{{ quote.blockedReason ?? '装备后生效 · 不会消耗' }}</small><button type="button" class="inventory-use" :disabled="model.busy || model.switchingProtagonist || !!quote.blockedReason" :aria-label="`${quote.equipped ? '卸下' : '装备'}${item.name}`" @click="equipItem(item.id)">{{ quote.equipped ? '卸下' : '装备' }}</button></div>
      </article>
      <article v-for="{ item, quote } in entries" :key="item.id" class="inventory-item" :data-inventory-product="item.id">
        <div class="inventory-item-heading"><StoreProductImage :item-id="item.id" :name="item.name" class="inventory-product-image" /><div class="inventory-item-title"><small>{{ item.brand }}</small><h3>{{ item.name }}</h3></div><span class="inventory-owned" data-inventory-quantity>{{ quote.owned }} {{ item.useUnit }}</span></div>
        <p v-if="item.equipmentKind" class="inventory-serving">常驻道具 · 装备后学习效率 +25% · 多支不叠加 · 不消耗</p>
        <p v-else-if="item.category !== 'collectible'" class="inventory-serving">每{{ item.useUnit }} {{ item.kcal }} kcal · 用时 {{ item.useMinutes }} 分钟</p>
        <p v-else-if="item.id === 'pro200-game-voucher'" class="inventory-serving">收藏券 · 可前往湾区二手交易市场出售</p>
        <p v-else class="inventory-serving">神秘访客赠送的珍藏道具</p>
        <p v-if="!quote.blockedReason" class="inventory-actual-effects" data-use-preview>此次实际变化：<template v-for="(effect, index) in actualChanges(quote)" :key="effect.key"><span :class="{ harmful: effect.harmful }">{{ effect.label }} {{ signed(effect.value) }}{{ effect.unit }}</span><template v-if="index < actualChanges(quote).length - 1"> · </template></template></p>
        <div v-if="item.equipmentKind" class="inventory-use-row equipment-actions">
          <button v-for="slotId in EQUIPMENT_SLOTS.filter(slot => item.equipmentKind === (slot === 'special' ? 'special' : 'permanent'))"
            :key="slotId" type="button" class="inventory-use" :data-equip-slot="slotId"
            :disabled="model.busy || model.switchingProtagonist || equippedSlot(item.id) === slotId"
            @click="changeEquipment(item.id, slotId)">{{ equippedSlot(item.id) === slotId ? '使用中' : `装备至${slotLabels[slotId]}` }}</button>
          <button v-if="equippedSlot(item.id)" type="button" class="inventory-use" data-unequip-item
            :disabled="model.busy || model.switchingProtagonist" @click="changeEquipment(item.id, null)">卸下</button>
        </div>
        <div v-else class="inventory-use-row"><small v-if="quote.blockedReason" class="inventory-blocked">{{ quote.blockedReason }}</small><small v-else>使用 1 {{ item.useUnit }}</small><button type="button" class="inventory-use" :aria-label="`使用${item.name}`" :disabled="model.busy || !!quote.blockedReason" @click="useItem(item.id)">使用<span aria-hidden="true"> ↗</span></button></div>
      </article>
    </div>
    <p v-if="!entries.length && !equipmentEntries.length" class="inventory-empty">背包还是空的。可以在便利店购买，在玛格咖啡馆买一杯带走，或把咖啡、甜点与餐食打包带走。</p>
    <p v-if="entries.length" class="inventory-effect-note">预览已计入使用耗时与状态上下限；数值为 0 时，本次该项状态不变。</p>
  </section>
</template>
