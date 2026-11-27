<script setup lang="ts" generic="Panel extends string">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch, type CSSProperties } from 'vue';

const PRIMARY_IDS = new Set(['story', 'map', 'phone', 'route', 'me', 'notebook', 'stock']);

const props = defineProps<{
  items: readonly { id: Panel; title: string; path: string; badge?: number }[];
  active: Panel | null;
  unread: number;
  editing: boolean;
}>();
const emit = defineEmits<{ select: [panel: Panel] }>();
const primary = computed(() => props.items.filter(item => PRIMARY_IDS.has(item.id)));
const secondary = computed(() => props.items.filter(item => !PRIMARY_IDS.has(item.id)));
const expanded = ref(false);
const dock = ref<HTMLElement>();
const menu = ref<HTMLElement>();
const toggle = ref<HTMLButtonElement>();
const menuId = useId();
const menuStyle = ref<CSSProperties>({});
let resize: ResizeObserver | undefined;
let doc: Document | undefined;

function close(restoreFocus = false) {
  if (!expanded.value) return false;
  expanded.value = false;
  if (restoreFocus) toggle.value?.focus({ preventScroll: true });
  return true;
}
function select(panel: Panel) {
  close(true);
  emit('select', panel);
}
function positionMenu() {
  const shell = dock.value?.closest<HTMLElement>('.uc-shell');
  if (!expanded.value || !shell || !dock.value || !menu.value) return;
  const bounds = shell.getBoundingClientRect();
  const anchor = dock.value.getBoundingClientRect();
  const width = Math.min(288, bounds.width - 24);
  const leftSpace = anchor.left - bounds.left - 24;
  const rightSpace = bounds.right - anchor.right - 24;
  const beside = bounds.width > 760 && Math.max(leftSpace, rightSpace) >= width;
  const above = anchor.top - bounds.top - 24;
  const below = bounds.bottom - anchor.bottom - 24;
  const upwards = above >= below;
  const maxHeight = Math.max(44, Math.min(360, beside ? bounds.height - 24 : upwards ? above : below));
  const height = Math.min(menu.value.scrollHeight, maxHeight);
  const x = beside ? (leftSpace >= width ? anchor.left - bounds.left - width - 12 : anchor.right - bounds.left + 12)
    : anchor.left - bounds.left + (anchor.width - width) / 2;
  const y = beside ? anchor.top - bounds.top + (anchor.height - height) / 2
    : upwards ? anchor.top - bounds.top - height - 12 : anchor.bottom - bounds.top + 12;
  menuStyle.value = {
    width: `${width}px`, maxHeight: `${maxHeight}px`,
    left: `${Math.max(12, Math.min(x, bounds.width - width - 12)) - (anchor.left - bounds.left)}px`,
    top: `${Math.max(12, Math.min(y, bounds.height - height - 12)) - (anchor.top - bounds.top)}px`,
  };
}
async function toggleMenu() {
  if (close()) return;
  expanded.value = true;
  await nextTick();
  positionMenu();
}
function dismissOutside(event: Event) {
  if (dock.value && !event.composedPath().includes(dock.value)) close();
}
function dismissWithEscape(event: KeyboardEvent) {
  if (expanded.value && event.key === 'Escape' && !event.isComposing) {
    close(true);
    event.preventDefault();
    event.stopPropagation();
  }
}
watch(() => props.active, () => close());
watch(() => props.editing, () => close());
onMounted(() => {
  doc = dock.value?.ownerDocument;
  doc?.addEventListener('pointerdown', dismissOutside, true);
  doc?.addEventListener('focusin', dismissOutside, true);
  doc?.defaultView?.addEventListener('keydown', dismissWithEscape, true);
  const shell = dock.value?.closest('.uc-shell');
  if (shell) {
    resize = new ResizeObserver(positionMenu);
    resize.observe(shell);
    resize.observe(dock.value!);
  }
});
onBeforeUnmount(() => {
  resize?.disconnect();
  doc?.removeEventListener('pointerdown', dismissOutside, true);
  doc?.removeEventListener('focusin', dismissOutside, true);
  doc?.defaultView?.removeEventListener('keydown', dismissWithEscape, true);
});
defineExpose({ close });
</script>

<template>
  <nav ref="dock" class="tool-dock tool-dock-collapsible" aria-label="世界导航" :data-dock-expanded="expanded">
    <div class="tool-dock-shortcuts">
      <button v-for="item in primary" :key="item.id" type="button"
        :class="{
          'phone-launcher': item.id === 'phone',
          'notebook-launcher': item.id === 'notebook',
          'stock-launcher': item.id === 'stock',
          'is-active': active === item.id,
        }"
        :data-nav-item="item.id"
        :data-notebook-entry="item.id === 'notebook' ? '' : undefined"
        :data-stock-entry="item.id === 'stock' ? '' : undefined"
        :aria-label="item.title" :aria-pressed="active === item.id"
        :title="item.id === 'phone' ? (unread ? `${unread} 条未读消息` : active === 'phone' ? '收起手机' : '打开手机') : item.title"
        @click="select(item.id)">
        <span class="tool-icon">
          <svg v-if="item.id === 'notebook'" viewBox="0 0 24 24" aria-hidden="true" class="notebook-bespoke-svg">
            <path d="M13.2 19v3.6l1.7-1.15 1.7 1.15V19" fill="currentColor" fill-opacity="0.3" />
            <path d="M14.2 2.1 20.6 5.4l-1.1 2-6.4-3.3Z" fill="currentColor" fill-opacity="0.24" stroke="none" />
            <rect x="4.5" y="3" width="14.5" height="17.5" rx="2.4" />
            <path d="M8 3v17.5" />
            <circle cx="13.5" cy="11.5" r="2.5" />
            <path d="M13.5 9.6v3.8M11.6 11.5h3.8" />
          </svg>
          <svg v-else-if="item.id === 'stock'" viewBox="0 0 24 24" aria-hidden="true" class="stock-bespoke-svg">
            <path d="M3.5 19.5h17" />
            <path d="M7 5v3m0 5v3" />
            <rect x="5.4" y="8" width="3.2" height="5" rx="0.8" fill="currentColor" fill-opacity="0.28" />
            <path d="M12 3.5v2.5m0 6v4" />
            <rect x="10.4" y="6" width="3.2" height="6" rx="0.8" fill="currentColor" fill-opacity="0.12" />
            <path d="M17 7v2.5m0 5.5v2" />
            <rect x="15.4" y="9.5" width="3.2" height="5.5" rx="0.8" fill="currentColor" fill-opacity="0.36" />
          </svg>
          <svg v-else viewBox="0 0 24 24" aria-hidden="true"><path :d="item.path" /></svg>
          <span v-if="item.id === 'phone' && unread" class="phone-unread-badge" :data-phone-unread="unread">{{ unread > 99 ? '99+' : unread }}</span>
          <span v-else-if="item.badge" class="nav-count-badge" :data-nav-badge="item.id">{{ item.badge > 99 ? '99+' : item.badge }}</span>
        </span>
        <span class="tool-label">{{ item.id === 'stock' ? '证券' : item.title }}</span>
      </button>

      <button v-if="secondary.length" ref="toggle" type="button" class="tool-dock-toggle" :aria-expanded="expanded" :aria-controls="expanded ? menuId : undefined"
        :aria-label="expanded ? '收起菜单' : '展开菜单'" @click="toggleMenu">
        <span class="tool-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path :d="expanded ? 'm6 6 12 12M18 6 6 18' : 'M4 5h6v6H4ZM14 5h6v6h-6ZM4 15h6v6H4ZM14 15h6v6h-6Z'" /></svg></span>
        <span class="tool-label">{{ expanded ? '收起' : '展开' }}</span>
      </button>
    </div>

    <div v-if="expanded && secondary.length" :id="menuId" ref="menu" class="tool-dock-menu" :style="menuStyle" role="group" aria-label="更多功能">
      <button v-for="item in secondary" :key="item.id" type="button" :aria-label="item.title" :aria-pressed="active === item.id"
        :data-location-entry="item.id === 'location' ? '' : undefined" :data-invitation-entry="item.id === 'invitations' ? '' : undefined"
        :data-inventory-entry="item.id === 'inventory' ? '' : undefined" @click="select(item.id)">
        <span class="tool-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path :d="item.path" /></svg></span>
        <span class="tool-label">{{ item.title }}</span>
      </button>
    </div>
  </nav>
</template>
