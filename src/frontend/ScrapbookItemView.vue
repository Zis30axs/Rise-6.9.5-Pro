<script setup lang="ts">
import { computed } from 'vue';
import {
  CLIPPING_PRESETS,
  DOODLE_PRESETS,
  PEN_MARK_PRESETS,
  PRESSED_PRESETS,
  STAMP_PRESETS,
  STICKER_DATA_URLS,
  STICKER_DEFS,
  STICKY_NOTE_PRESETS,
  WASHI_TAPES,
  WAX_SEAL_PRESETS,
  type PlacedScrapItem,
} from '../runtime/notebook-scrapbook';

const props = defineProps<{ item: PlacedScrapItem }>();

const stickerUrl = computed(() => STICKER_DATA_URLS[props.item.presetId] ?? '');
const stickerLabel = computed(() => STICKER_DEFS.find(s => s.id === props.item.presetId)?.label ?? props.item.caption ?? '贴纸');
const tape = computed(() => WASHI_TAPES.find(t => t.id === props.item.presetId) ?? WASHI_TAPES[0]);
const stamp = computed(() => STAMP_PRESETS.find(s => s.id === props.item.presetId) ?? STAMP_PRESETS[0]);
const clipping = computed(() => CLIPPING_PRESETS.find(c => c.id === props.item.presetId) ?? CLIPPING_PRESETS[0]);
const note = computed(() => STICKY_NOTE_PRESETS.find(n => n.id === props.item.presetId) ?? STICKY_NOTE_PRESETS[0]);
const wax = computed(() => WAX_SEAL_PRESETS.find(w => w.id === props.item.presetId) ?? WAX_SEAL_PRESETS[0]);
const pressed = computed(() => PRESSED_PRESETS.find(p => p.id === props.item.presetId) ?? PRESSED_PRESETS[0]);
const doodle = computed(() => DOODLE_PRESETS.find(d => d.id === props.item.presetId) ?? DOODLE_PRESETS[0]);
const penMark = computed(() => PEN_MARK_PRESETS.find(m => m.id === props.item.presetId) ?? PEN_MARK_PRESETS[0]);
const markCaption = computed(() => {
  const cap = props.item.caption?.trim();
  if (cap) return cap;
  return penMark.value.editable ? penMark.value.defaultText : '';
});

const payload = computed(() => (props.item.dataPayload ?? {}) as Record<string, unknown>);
const chatAvatar = computed(() => {
  const stickerId = typeof payload.value.stickerId === 'string' ? payload.value.stickerId : '';
  return STICKER_DATA_URLS[stickerId] ?? '';
});
</script>

<template>
  <img
    v-if="item.type === 'sticker'"
    class="nb-sticker-img"
    :src="stickerUrl"
    :alt="stickerLabel"
    draggable="false"
  />

  <div
    v-else-if="item.type === 'tape'"
    class="nb-washi-tape"
    :style="{
      background: `repeating-linear-gradient(-45deg, ${tape.bg} 0 8px, ${tape.stripe} 8px 10px)`,
      color: tape.ink,
    }"
  >
    {{ item.caption || tape.label.slice(0, 4) }}
  </div>

  <div v-else-if="item.type === 'stamp'" class="nb-ink-stamp" :style="{ color: stamp.color }">
    <strong>{{ item.caption || stamp.label }}</strong>
    <span>{{ stamp.sub }}</span>
  </div>

  <div
    v-else-if="item.type === 'clipping'"
    class="nb-clipping-card"
    :class="`kind-${clipping.kind}`"
    :style="{ '--clip-accent': clipping.accent } as Record<string, string>"
  >
    <div v-if="clipping.kind === 'polaroid'" class="nb-polaroid-photo" />
    <div class="nb-clip-head">{{ item.caption || clipping.title }}</div>
    <div class="nb-clip-sub">{{ clipping.subtitle }}</div>
    <div class="nb-clip-foot"><span>{{ clipping.meta }}</span><span>{{ clipping.price }}</span></div>
  </div>

  <div
    v-else-if="item.type === 'note'"
    class="nb-sticky-note"
    :style="{
      '--note-bg': note.bg,
      '--note-line': note.line,
      '--note-ink': note.ink,
      '--note-pin': note.pin,
    } as Record<string, string>"
  >
    {{ item.caption || '待写一点小事…' }}
  </div>

  <div
    v-else-if="item.type === 'wax'"
    class="nb-wax-seal"
    :style="{ '--wax-outer': wax.outer, '--wax-inner': wax.inner } as Record<string, string>"
  >
    <div class="nb-wax-seal-ring"><strong>{{ wax.glyph }}</strong><span>{{ wax.text }}</span></div>
  </div>

  <div
    v-else-if="item.type === 'pressed'"
    class="nb-pressed-specimen"
    :style="{ '--pressed-tint': pressed.tint } as Record<string, string>"
  >
    <svg viewBox="0 0 64 64" width="54" height="54" aria-hidden="true">
      <g v-if="pressed.kind === 'ginkgo'">
        <path d="M32 54 L32 34 M32 36 C16 28 12 13 24 11 C29 10 31 18 32 22 C33 18 35 10 40 11 C52 13 48 28 32 36 Z" :fill="pressed.accent" fill-opacity="0.86" stroke="#6f4d18" stroke-width="1.3" />
      </g>
      <g v-else-if="pressed.kind === 'sakura'">
        <circle cx="32" cy="18" r="10" :fill="pressed.accent" fill-opacity="0.72" />
        <circle cx="44" cy="28" r="10" :fill="pressed.accent" fill-opacity="0.76" />
        <circle cx="39" cy="42" r="10" :fill="pressed.accent" fill-opacity="0.68" />
        <circle cx="25" cy="42" r="10" :fill="pressed.accent" fill-opacity="0.72" />
        <circle cx="20" cy="28" r="10" :fill="pressed.accent" fill-opacity="0.78" />
        <circle cx="32" cy="31" r="4" fill="#ffe7a6" />
      </g>
      <g v-else-if="pressed.kind === 'lavender'">
        <path d="M32 54 L32 14" stroke="#4d6c4d" stroke-width="2" />
        <ellipse cx="28" cy="20" rx="4" ry="5.5" :fill="pressed.accent" />
        <ellipse cx="36" cy="24" rx="4" ry="5.5" :fill="pressed.accent" />
        <ellipse cx="28" cy="29" rx="4" ry="5.5" :fill="pressed.accent" />
        <ellipse cx="36" cy="34" rx="4" ry="5.5" :fill="pressed.accent" />
      </g>
      <g v-else>
        <path d="M32 54 C32 42 32 34 32 30" stroke="#365c3e" stroke-width="2" />
        <circle cx="25" cy="24" r="8" :fill="pressed.accent" />
        <circle cx="39" cy="24" r="8" :fill="pressed.accent" />
        <circle cx="25" cy="36" r="8" :fill="pressed.accent" />
        <circle cx="39" cy="36" r="8" :fill="pressed.accent" />
      </g>
    </svg>
  </div>

  <div
    v-else-if="item.type === 'doodle'"
    :class="doodle.kind === 'banner' ? 'nb-doodle-banner' : doodle.kind === 'bubble' ? 'nb-doodle-bubble' : ''"
    :style="{ '--doodle-accent': doodle.accent } as Record<string, string>"
  >
    <template v-if="doodle.kind === 'bubble' || doodle.kind === 'banner'">
      {{ item.caption || doodle.defaultText }}
    </template>
    <svg v-else-if="doodle.kind === 'coffee'" viewBox="0 0 80 80" width="66" height="66" aria-hidden="true">
      <circle cx="40" cy="40" r="24" fill="none" :stroke="doodle.accent" stroke-width="4" stroke-opacity="0.34" />
      <circle cx="42" cy="39" r="20" fill="none" :stroke="doodle.accent" stroke-width="2" stroke-opacity="0.22" />
    </svg>
    <svg v-else viewBox="0 0 80 80" width="66" height="66" aria-hidden="true">
      <circle cx="26" cy="48" r="6" :fill="doodle.accent" fill-opacity="0.72" />
      <circle cx="19" cy="37" r="3" :fill="doodle.accent" fill-opacity="0.72" />
      <circle cx="26" cy="34" r="3" :fill="doodle.accent" fill-opacity="0.72" />
      <circle cx="33" cy="37" r="3" :fill="doodle.accent" fill-opacity="0.72" />
      <circle cx="52" cy="30" r="6" :fill="doodle.accent" fill-opacity="0.72" />
      <circle cx="45" cy="19" r="3" :fill="doodle.accent" fill-opacity="0.72" />
      <circle cx="52" cy="16" r="3" :fill="doodle.accent" fill-opacity="0.72" />
      <circle cx="59" cy="19" r="3" :fill="doodle.accent" fill-opacity="0.72" />
    </svg>
  </div>

  <div
    v-else-if="item.type === 'mark'"
    class="nb-pen-mark"
    :class="`kind-${penMark.kind}`"
    :style="{ '--mark-color': item.tint || penMark.color } as Record<string, string>"
  >
    <svg
      v-if="penMark.kind === 'circle-single'"
      class="nb-mark-svg"
      viewBox="0 0 160 72"
      width="136"
      height="60"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M22 39 C18 19, 54 10, 92 12 C131 14, 150 28, 144 43 C138 58, 98 63, 56 60 C23 57, 13 42, 24 27 C34 15, 76 11, 118 15"
        stroke="currentColor"
        stroke-width="2.7"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-opacity="0.88"
      />
    </svg>
    <svg
      v-else-if="penMark.kind === 'circle-double'"
      class="nb-mark-svg"
      viewBox="0 0 160 72"
      width="138"
      height="62"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M20 38 C16 17, 52 9, 92 12 C132 15, 148 29, 142 44 C135 58, 95 63, 53 59 C21 56, 13 41, 25 27"
        stroke="currentColor"
        stroke-width="2.4"
        stroke-linecap="round"
        stroke-opacity="0.86"
      />
      <path
        d="M25 35 C23 19, 58 14, 96 16 C129 18, 142 30, 136 42 C130 53, 94 58, 57 54 C30 51, 20 38, 34 25"
        stroke="currentColor"
        stroke-width="1.65"
        stroke-linecap="round"
        stroke-opacity="0.72"
      />
    </svg>
    <svg
      v-else-if="penMark.kind === 'circle-dashed'"
      class="nb-mark-svg"
      viewBox="0 0 160 72"
      width="136"
      height="60"
      fill="none"
      aria-hidden="true"
    >
      <ellipse
        cx="80"
        cy="36"
        rx="63"
        ry="24"
        transform="rotate(-2 80 36)"
        stroke="currentColor"
        stroke-width="2.4"
        stroke-dasharray="7 5"
        stroke-linecap="round"
        stroke-opacity="0.88"
      />
      <path d="M138 14 L141 20 L147 22 L141 24 L138 30 L135 24 L129 22 L135 20 Z" fill="currentColor" fill-opacity="0.72" />
      <circle cx="22" cy="54" r="2.3" fill="currentColor" fill-opacity="0.7" />
    </svg>
    <svg
      v-else-if="penMark.kind === 'underline-wave'"
      class="nb-mark-svg"
      viewBox="0 0 180 32"
      width="148"
      height="26"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M8 17 Q20 9, 32 17 T56 17 T80 16 T104 17 T128 16 T152 17 T172 15"
        stroke="currentColor"
        stroke-width="2.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-opacity="0.9"
      />
    </svg>
    <svg
      v-else-if="penMark.kind === 'underline-double'"
      class="nb-mark-svg"
      viewBox="0 0 180 32"
      width="150"
      height="26"
      fill="none"
      aria-hidden="true"
    >
      <path d="M8 13 Q68 10, 172 12" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-opacity="0.9" />
      <path d="M14 21 Q86 19, 166 20" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-opacity="0.78" />
    </svg>
    <svg
      v-else-if="penMark.kind === 'underline-loop'"
      class="nb-mark-svg"
      viewBox="0 0 180 38"
      width="150"
      height="30"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M8 21 C18 8, 30 8, 28 21 C26 30, 18 28, 26 20 C36 9, 50 9, 48 21 C46 29, 38 28, 46 20 C56 9, 70 9, 68 21 C66 29, 58 28, 66 20 C76 9, 90 9, 88 21 C86 29, 78 28, 86 20 C96 9, 110 9, 108 21 C106 29, 98 28, 106 20 C116 9, 130 9, 128 21 C126 29, 118 28, 126 20 C138 10, 152 12, 172 18"
        stroke="currentColor"
        stroke-width="2.1"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-opacity="0.88"
      />
    </svg>
    <svg
      v-else-if="penMark.kind === 'highlight-sun' || penMark.kind === 'highlight-mint'"
      class="nb-mark-svg is-highlight"
      viewBox="0 0 180 36"
      width="154"
      height="30"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M11 20 Q92 14, 169 18"
        stroke="currentColor"
        stroke-width="16"
        stroke-linecap="round"
        stroke-opacity="0.38"
      />
      <path
        d="M18 17 Q96 13, 162 16"
        stroke="currentColor"
        stroke-width="7"
        stroke-linecap="round"
        stroke-opacity="0.22"
      />
    </svg>
    <svg
      v-else-if="penMark.kind === 'bracket-brace'"
      class="nb-mark-svg is-inline-icon"
      viewBox="0 0 42 72"
      width="32"
      height="54"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M32 8 C19 9, 20 26, 17 31 C14 35, 9 36, 9 36 C9 36, 15 38, 17 42 C20 48, 18 63, 32 64"
        stroke="currentColor"
        stroke-width="2.6"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-opacity="0.9"
      />
    </svg>
    <svg
      v-else-if="penMark.kind === 'arrow-curve'"
      class="nb-mark-svg is-inline-icon"
      viewBox="0 0 88 58"
      width="68"
      height="46"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M78 46 C52 46, 32 34, 15 15"
        stroke="currentColor"
        stroke-width="2.6"
        stroke-linecap="round"
        stroke-opacity="0.9"
      />
      <path
        d="M13 28 L13 13 L28 15"
        stroke="currentColor"
        stroke-width="2.6"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-opacity="0.9"
      />
    </svg>
    <svg
      v-else-if="penMark.kind === 'star-doodle'"
      class="nb-mark-svg is-inline-icon"
      viewBox="0 0 56 56"
      width="38"
      height="38"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M28 7 L33.6 19.6 L47 21.2 L36.8 30.2 L39.6 43.8 L28 36.8 L16.2 43.8 L19.2 30.2 L9 21.2 L22.4 19.6 Z"
        stroke="currentColor"
        stroke-width="2.4"
        stroke-linejoin="round"
        stroke-opacity="0.92"
      />
      <path d="M47 10 L50 7 M8 42 L5 45" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-opacity="0.72" />
    </svg>
    <svg
      v-else
      class="nb-mark-svg"
      viewBox="0 0 104 74"
      width="82"
      height="58"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M52 57 C34 45, 19 33, 21 20 C23 11, 35 10, 46 18 C49 21, 51 24, 52 26 C54 22, 57 18, 63 14 C75 9, 85 17, 81 29 C76 41, 61 50, 44 61 C36 66, 26 65, 22 61"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-opacity="0.88"
      />
    </svg>
    <span v-if="markCaption" class="nb-mark-caption">{{ markCaption }}</span>
  </div>

  <div
    v-else-if="item.type === 'receipt'"
    class="nb-paper-receipt"
    :style="{ '--rc-accent': String(payload.accent ?? '#4b6856') } as Record<string, string>"
  >
    <div class="nb-receipt-head"><span>{{ payload.shop || '生活消费记录' }}</span><span>PAY</span></div>
    <div class="nb-receipt-row">
      <span>{{ payload.itemLabel || item.caption || '消费凭证' }}</span>
      <span class="nb-receipt-price">{{ payload.amountYen ?? 0 }} 日元</span>
    </div>
    <div class="nb-receipt-meta"><span>{{ payload.timeText || '当日' }}</span><span>{{ payload.meta || '已结算' }}</span></div>
  </div>

  <div
    v-else-if="item.type === 'chat-snippet'"
    class="nb-chat-snippet-card"
    :style="{ '--chat-accent': String(payload.accent ?? '#4b6856') } as Record<string, string>"
  >
    <div class="nb-chat-snippet-head">
      <span class="nb-chat-snippet-sender">
        <img v-if="chatAvatar" :src="chatAvatar" alt="" draggable="false" />
        {{ payload.sender || '好友短信' }}
      </span>
      <span class="nb-chat-snippet-time">{{ payload.timeText || '' }}</span>
    </div>
    <div class="nb-chat-snippet-text">{{ item.caption || payload.text || '' }}</div>
  </div>
</template>
