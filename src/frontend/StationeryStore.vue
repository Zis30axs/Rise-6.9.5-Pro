<script setup lang="ts">
import { computed, ref } from 'vue';
import { getPurchaseQuote, getStationeryAvailability, stationeryCatalog } from '../runtime/convenience-store';
import { runInteraction } from './interaction-action';
import type { ShellActions, ShellModel } from './types';

const props = defineProps<{ model: ShellModel; actions: ShellActions }>();
const availability = computed(() => getStationeryAvailability(props.model.state));
const quantity = ref(1);
const receipt = ref('');
const products = computed(() => stationeryCatalog.map(item => ({
  item, quote: getPurchaseQuote(props.model.state, item.id, quantity.value),
})));
async function buy(itemId: string) {
  const quote = getPurchaseQuote(props.model.state, itemId, quantity.value);
  if (props.model.busy || quote.blockedReason || !quote.item) return;
  receipt.value = '';
  if (!await runInteraction(props.model, props.actions, { type: 'buy_item', itemId, quantity: quantity.value })) return;
  receipt.value = `已购买 ${quote.quantity} 支${quote.item.name}，支付 ¥${quote.totalPrice.toFixed(2)}，已放入背包。`;
}
</script>

<template>
  <section class="convenience-store stationery-store" data-stationery-store aria-label="街角文具店">
    <header class="store-heading"><div><small>街角书店旁 · 文具柜台</small><h2>文具店</h2></div>
      <div class="store-wallet"><span>可用余额</span><strong>¥{{ model.state.player.balance.toFixed(2) }}</strong></div>
    </header>
    <p v-if="availability.blockedReason" class="store-blocked" role="status">{{ availability.blockedReason }}</p>
    <p v-if="receipt" class="store-receipt" role="status" data-stationery-receipt>{{ receipt }}</p>
    <div class="store-shelf-heading"><p>挑一支学习用笔，付款后放进背包，装备到常驻道具栏即可生效。</p>
      <fieldset class="store-quantity"><legend>购买数量</legend><button v-for="amount in [1, 3, 5]" :key="amount" type="button" :aria-pressed="quantity === amount" @click="quantity = amount">{{ amount }} 支</button></fieldset>
    </div>
    <div class="store-products">
      <article v-for="{ item, quote } in products" :key="item.id" class="store-product" :data-product-id="item.id">
        <header class="store-product-heading"><span class="store-brand">{{ item.brand }}</span><span class="store-tier">常驻道具</span></header>
        <div class="stationery-pen-illustration" aria-hidden="true">✒</div>
        <h3>{{ item.name }}</h3>
        <div class="store-product-price"><strong>¥{{ item.price }}</strong><span>/ 支</span></div>
        <p class="store-serving">导弹造型学习用笔 · 装备后学习点 +25% · 多支不叠加</p>
        <p class="store-owned">背包库存 {{ quote.owned }} 支</p>
        <button type="button" class="store-buy" :disabled="model.busy || !!quote.blockedReason" @click="buy(item.id)">
          <span>购买 {{ quantity }} 支</span><strong>¥{{ quote.totalPrice.toFixed(2) }}</strong>
        </button>
        <p v-if="quote.blockedReason" class="store-blocked">{{ quote.blockedReason }}</p>
      </article>
    </div>
  </section>
</template>
