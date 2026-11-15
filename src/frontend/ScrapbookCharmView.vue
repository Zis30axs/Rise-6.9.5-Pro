<script setup lang="ts">
import { computed } from 'vue';
import {
  EXTENDED_CHARM_PRESETS,
  STICKER_DATA_URLS,
  resolveCharmAnchor,
} from '../runtime/notebook-scrapbook';

const props = defineProps<{
  charmId: string;
  mountId: string;
  angle: number;
  tilt: number;
}>();

const emit = defineEmits<{ nudge: [event: PointerEvent] }>();

const charm = computed(() => EXTENDED_CHARM_PRESETS.find(c => c.id === props.charmId) ?? EXTENDED_CHARM_PRESETS[0]);
const anchor = computed(() => resolveCharmAnchor(props.mountId));
const stickerUrl = computed(() => charm.value.stickerId ? STICKER_DATA_URLS[charm.value.stickerId] ?? '' : '');
</script>

<template>
  <div
    v-if="charm.id !== 'none'"
    class="nb-book-charm-mount"
    :style="{
      transform: `translate3d(${anchor.x}px, ${anchor.y}px, ${anchor.z}px)`,
      '--charm-metal': charm.metal,
      '--charm-accent': charm.accent,
    } as Record<string, string>"
  >
    <div class="nb-charm-grommet" />
    <div
      class="nb-charm-swing-arm"
      :title="`点击轻拨 · ${charm.label}`"
      :style="{ transform: `rotateZ(${angle}deg) rotateX(${tilt}deg)` }"
      @pointerdown.stop="emit('nudge', $event)"
    >
      <div class="nb-charm-chain">
        <span class="nb-charm-bead" />
        <span class="nb-charm-bead" />
        <span class="nb-charm-bead" />
      </div>
      <div class="nb-charm-clasp" />
      <div class="nb-charm-body">
        <div class="nb-charm-face nb-charm-face-front">
          <div v-if="charm.kind === 'acrylic'" class="nb-acrylic-shell">
            <img :src="stickerUrl" :alt="charm.label" draggable="false" />
          </div>
          <svg v-else viewBox="0 0 60 64" width="56" height="60" aria-hidden="true">
            <g v-if="charm.id === 'charm-bass'">
              <path d="M18 12 C34 8 46 22 40 38 C36 48 24 52 18 44 C12 36 12 18 18 12 Z" :fill="charm.accent" :stroke="charm.metal" stroke-width="2.5" />
              <circle cx="28" cy="28" r="4" fill="#fff7e2" />
            </g>
            <g v-else-if="charm.id === 'charm-moon'">
              <circle cx="30" cy="34" r="20" :fill="charm.accent" :stroke="charm.metal" stroke-width="3" />
              <path d="M35 20 A12 12 0 1 0 38 44 A9 10 0 1 1 35 20 Z" fill="#f7e29c" />
            </g>
            <g v-else-if="charm.id === 'charm-sakura'">
              <circle cx="30" cy="20" r="9" :fill="charm.accent" />
              <circle cx="42" cy="30" r="9" :fill="charm.accent" />
              <circle cx="37" cy="43" r="9" :fill="charm.accent" />
              <circle cx="23" cy="43" r="9" :fill="charm.accent" />
              <circle cx="18" cy="30" r="9" :fill="charm.accent" />
              <circle cx="30" cy="32" r="5" :fill="charm.metal" />
            </g>
            <g v-else-if="charm.id === 'charm-star'">
              <polygon points="30,8 36,24 52,24 39,34 44,50 30,40 16,50 21,34 8,24 24,24" :fill="charm.accent" :stroke="charm.metal" stroke-width="2" />
            </g>
            <g v-else-if="charm.id === 'charm-cat'">
              <rect x="14" y="24" width="32" height="26" rx="7" :fill="charm.accent" :stroke="charm.metal" stroke-width="2.5" />
              <polygon points="18,24 22,13 28,24" :fill="charm.accent" :stroke="charm.metal" stroke-width="2" />
              <polygon points="32,24 38,13 42,24" :fill="charm.accent" :stroke="charm.metal" stroke-width="2" />
              <circle cx="24" cy="36" r="2.2" fill="#ffd97d" />
              <circle cx="36" cy="36" r="2.2" fill="#ffd97d" />
            </g>
            <g v-else>
              <rect x="14" y="14" width="32" height="36" rx="10" :fill="charm.accent" :stroke="charm.metal" stroke-width="3" />
              <circle cx="26" cy="28" r="5" fill="#d9efcc" />
              <circle cx="34" cy="28" r="5" fill="#d9efcc" />
              <circle cx="26" cy="36" r="5" fill="#d9efcc" />
              <circle cx="34" cy="36" r="5" fill="#d9efcc" />
            </g>
          </svg>
        </div>
        <div class="nb-charm-face nb-charm-face-back">
          <div v-if="charm.kind === 'acrylic'" class="nb-acrylic-shell">
            <img :src="stickerUrl" alt="" draggable="false" style="transform:scaleX(-1);opacity:.85" />
          </div>
          <svg v-else viewBox="0 0 60 64" width="56" height="60" aria-hidden="true">
            <circle cx="30" cy="34" r="18" :fill="charm.metal" fill-opacity="0.88" />
          </svg>
        </div>
      </div>
    </div>
  </div>
</template>
