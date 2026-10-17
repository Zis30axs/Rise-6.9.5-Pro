<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import InteractiveScene from './InteractiveScene.vue';
import WorldPanels from './WorldPanels.vue';
import { locations } from '../runtime/model';
import type { ShellActions, ShellModel } from './types';

const props = defineProps<{ model: ShellModel; actions: ShellActions }>();
type WindowPanel = 'phone' | 'map' | 'schedule' | 'people' | 'status';
type ReadingMode = 'compact' | 'expanded' | 'hidden';
const activeWindow = ref<WindowPanel | null>(null);
const readingMode = ref<ReadingMode>('compact');
const shell = ref<HTMLElement>();
const storyList = ref<HTMLElement>();
const composer = ref<HTMLTextAreaElement>();
const phoneSlot = ref<HTMLElement>();
const draft = ref('');
const composerError = ref('');
const followsLatest = ref(true);
const hasNewContent = ref(false);
const windowPosition = ref<{ left: number; top: number }>();
let requestedPhoneSlot: HTMLElement | undefined;
let phoneMountRevision = 0;
let unmounting = false;
let drag: { id: number; x: number; y: number; left: number; top: number; width: number; height: number } | undefined;
let hostWindow: Window | null = null;
let savedReadingScroll = 0;
const nav: { id: WindowPanel; title: string; path: string }[] = [
  { id: 'phone', title: '手机', path: 'M7 2h10a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1ZM10 5h4M11 19h2' },
  { id: 'map', title: '地图', path: 'm3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2ZM9 3v16M15 5v16' },
  { id: 'schedule', title: '日程', path: 'M4 5h16v16H4ZM4 10h16M8 3v4M16 3v4M8 14h2M14 14h2M8 18h2' },
  { id: 'people', title: '人物', path: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2a7 7 0 0 1 14 0v2M19 5a3 3 0 0 1 0 6M21 21v-2a6 6 0 0 0-2-4' },
  { id: 'status', title: '状态', path: 'M5 3h14v18H5ZM9 7h6M9 11h6M9 15h3M3 7h4M3 15h4' },
];
const currentLocation = computed(() => locations.find(item => item.id === props.model.state.locationId) ?? locations[0]);
const time = computed(() => `${String(props.model.state.clock.hour).padStart(2, '0')}:${String(props.model.state.clock.minute).padStart(2, '0')}`);
const windowTitle = computed(() => nav.find(item => item.id === activeWindow.value)?.title ?? '');
const demoPhone = computed(() => !props.model.externalPhoneAvailable && props.model.mode === 'demo');
const embeddedPhone = computed(() => activeWindow.value === 'phone' && !demoPhone.value);
const unread = computed(() => demoPhone.value ? props.model.state.phone.filter(item => !item.read).length : props.model.phoneUnread);
const storyEntries = computed(() => props.model.state.story.map(entry => ({ ...entry, paragraphs: entry.text.split(/\n\s*\n/).filter(Boolean) })));
const windowStyle = computed(() => windowPosition.value ? { left: `${windowPosition.value.left}px`, top: `${windowPosition.value.top}px`, right: 'auto', bottom: 'auto', transform: 'none' } : undefined);

function releasePhone() {
  if (!requestedPhoneSlot) return;
  requestedPhoneSlot = undefined;
  props.actions.closePhone();
}
function closeWindow(restoreFocus = true) {
  const previous = activeWindow.value;
  releasePhone(); activeWindow.value = null; drag = undefined;
  if (restoreFocus && previous) nextTick(() => shell.value?.querySelector<HTMLElement>(`button[aria-label="${nav.find(item => item.id === previous)?.title}"]`)?.focus({ preventScroll: true }));
}
function openWindow(panel: WindowPanel) {
  if (activeWindow.value === panel) { closeWindow(); return; }
  releasePhone(); windowPosition.value = undefined; activeWindow.value = panel;
}
function sceneHome() {
  closeWindow(false);
  if (readingMode.value !== 'compact') void setReadingMode('compact');
}
function openEmbeddedPhone() {
  if (!phoneSlot.value || activeWindow.value !== 'phone') return;
  requestedPhoneSlot = phoneSlot.value;
  props.actions.openPhone(phoneSlot.value);
}
async function openContact(npcId: string) {
  if (activeWindow.value !== 'phone') openWindow('phone');
  await nextTick();
  if (unmounting || activeWindow.value !== 'phone') return;
  openEmbeddedPhone();
  await props.actions.openPhoneContact(npcId);
}
watch([activeWindow, phoneSlot, () => props.model.externalPhoneAvailable], async ([panel, anchor]) => {
  const revision = ++phoneMountRevision;
  if (panel !== 'phone' || !anchor) { releasePhone(); return; }
  await nextTick();
  if (unmounting || revision !== phoneMountRevision || anchor !== phoneSlot.value || requestedPhoneSlot === anchor) return;
  openEmbeddedPhone();
}, { flush: 'post' });
watch(() => props.model.externalPhoneOpen, (open, wasOpen) => {
  if (wasOpen && !open && activeWindow.value === 'phone') { requestedPhoneSlot = undefined; activeWindow.value = null; }
});

function onStoryScroll() {
  const list = storyList.value;
  if (!list || readingMode.value === 'hidden') return;
  savedReadingScroll = list.scrollTop;
  followsLatest.value = list.scrollHeight - list.scrollTop - list.clientHeight < 44;
  if (followsLatest.value) hasNewContent.value = false;
}
function jumpToLatest() {
  const list = storyList.value;
  if (!list) return;
  list.scrollTop = list.scrollHeight;
  savedReadingScroll = list.scrollTop;
  followsLatest.value = true; hasNewContent.value = false;
}
async function setReadingMode(mode: ReadingMode) {
  const scroll = readingMode.value === 'hidden' ? savedReadingScroll : storyList.value?.scrollTop ?? 0;
  savedReadingScroll = scroll;
  const wasFollowing = followsLatest.value;
  readingMode.value = mode;
  await nextTick();
  if (mode === 'hidden') return;
  if (wasFollowing && !hasNewContent.value) jumpToLatest();
  else if (storyList.value) storyList.value.scrollTop = scroll;
}
async function readEarlier() {
  readingMode.value = 'expanded';
  await nextTick();
  if (storyList.value) storyList.value.scrollTop = 0;
  onStoryScroll();
}
watch(() => props.model.state.story.at(-1)?.id, async () => {
  const follow = followsLatest.value && readingMode.value !== 'hidden';
  await nextTick();
  if (unmounting) return;
  if (follow) jumpToLatest(); else hasNewContent.value = true;
});
async function sendText(text: string) {
  if (props.model.busy || !text.trim() || text.length > 2000) return;
  composerError.value = '';
  try { await props.actions.send(text.trim()); }
  catch (error) { composerError.value = error instanceof Error ? error.message : '发送失败，请重试。'; }
}
async function submit() {
  const text = draft.value;
  if (props.model.busy || !text.trim()) return;
  await sendText(text);
  if (!composerError.value && !props.model.notice && draft.value === text) draft.value = '';
}
async function prepareAction(text: string) {
  draft.value = text;
  closeWindow(false);
  if (readingMode.value === 'hidden') await setReadingMode('compact');
  await nextTick(); composer.value?.focus({ preventScroll: true });
}
function sceneHotspot(action: 'phone' | 'map' | 'observe' | 'rest' | 'schedule') {
  if (action === 'phone' || action === 'map' || action === 'schedule') openWindow(action);
  else if (action === 'observe') void prepareAction('观察一下周围的环境。');
  else void prepareAction('在长椅上休息一会儿。');
}
function dismissOverlay() {
  if (activeWindow.value) { closeWindow(); return true; }
  if (readingMode.value === 'expanded') { void setReadingMode('compact'); return true; }
  return false;
}

function startWindowDrag(event: PointerEvent) {
  if (event.button !== 0 || !shell.value || shell.value.clientWidth <= 760 || (event.target as Element).closest('button')) return;
  const handle = event.currentTarget as HTMLElement;
  const element = handle.parentElement;
  if (!element) return;
  const rect = element.getBoundingClientRect();
  const base = shell.value.getBoundingClientRect();
  drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left - base.left, top: rect.top - base.top, width: rect.width, height: rect.height };
  handle.setPointerCapture(event.pointerId); event.preventDefault();
}
function moveWindow(event: PointerEvent) {
  if (!drag || event.pointerId !== drag.id || !shell.value) return;
  // Keep the persistent tool rail clear even when the phone surface is hosted
  // outside this shadow root and therefore paints above the Shell.
  const rightInset = shell.value.clientWidth > 760 ? 112 : 10;
  const left = Math.min(Math.max(10, drag.left + event.clientX - drag.x), Math.max(10, shell.value.clientWidth - drag.width - rightInset));
  const top = Math.min(Math.max(70, drag.top + event.clientY - drag.y), Math.max(70, shell.value.clientHeight - drag.height - 20));
  windowPosition.value = { left, top };
  nextTick(() => { if (requestedPhoneSlot && props.model.externalPhoneOpen) props.actions.openPhone(requestedPhoneSlot); });
}
function endWindowDrag() { drag = undefined; }
function resized() { windowPosition.value = undefined; }
onMounted(async () => {
  props.actions.setDismissHandler?.(dismissOverlay);
  hostWindow = shell.value?.ownerDocument.defaultView ?? null;
  hostWindow?.addEventListener('resize', resized);
  await nextTick(); jumpToLatest();
});
onBeforeUnmount(() => {
  unmounting = true; phoneMountRevision++;
  props.actions.setDismissHandler?.(undefined);
  hostWindow?.removeEventListener('resize', resized);
  releasePhone();
});
</script>

<template>
  <div ref="shell" class="uc-shell" :data-reading-mode="readingMode" :data-active-window="activeWindow ?? ''" :data-phone-link-status="model.phoneLinkStatus">
    <InteractiveScene :location-id="model.state.locationId" :hour="model.state.clock.hour" :paused="readingMode === 'expanded' || !!activeWindow" @hotspot="sceneHotspot" />
    <div class="world-vignette" :class="{ 'reading-shade': readingMode === 'expanded' }" aria-hidden="true"></div>
    <header class="world-chrome"><div class="world-heading"><button class="wordmark" aria-label="场景" @click="sceneHome">未读之城<span>一段正在发生的日常</span></button><div class="topbar-world"><span>{{ currentLocation.name }}</span><span class="chrome-dot">·</span><span>第 {{ model.state.clock.day }} 天</span><time>{{ time }}</time></div></div><div class="host-actions"><button aria-label="切换聊天并恢复原生界面" @click="actions.switchChat()">切换聊天</button><button aria-label="退出沉浸界面，恢复酒馆原生界面" @click="actions.exit()">退出酒馆 <span aria-hidden="true">↗</span></button></div></header>
    <p v-if="model.notice" class="notice" role="status">{{ model.notice }}</p>
    <nav class="tool-dock" aria-label="世界面板"><button v-for="item in nav" :key="item.id" :class="{ 'phone-launcher': item.id === 'phone' }" :aria-label="item.title" :aria-pressed="activeWindow === item.id" :title="item.id === 'phone' ? (unread ? `${unread} 条未读消息，点击打开手机` : activeWindow === 'phone' ? '收起手机' : '打开手机，阅读时也可使用') : undefined" @click="openWindow(item.id)"><span class="tool-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path :d="item.path" /></svg><span v-if="item.id === 'phone' && unread" class="phone-unread-badge" :data-phone-unread="unread">{{ unread > 99 ? '99+' : unread }}</span></span><span class="tool-label">{{ item.title }}<small v-if="item.id === 'phone'">{{ unread ? '有未读' : activeWindow === 'phone' ? '已打开' : '常驻' }}</small></span></button></nav>
    <span class="sr-only" role="status" aria-live="polite">{{ unread ? `手机有 ${unread} 条未读消息` : '手机没有未读消息' }}</span>
    <section v-show="readingMode !== 'hidden'" class="reading-layer" data-reading-layer aria-label="小说正文" :class="{ 'reading-expanded': readingMode === 'expanded' }">
      <header class="reading-heading"><div><span class="reading-caption">{{ model.busy ? '故事正在继续…' : '此刻的故事' }}</span><small v-if="model.mode === 'demo'">本地演示</small></div><div class="reading-actions"><button @click="readEarlier">往前读</button><button :aria-label="readingMode === 'expanded' ? '缩小正文' : '展开正文'" @click="setReadingMode(readingMode === 'expanded' ? 'compact' : 'expanded')">{{ readingMode === 'expanded' ? '回到场景' : '专注阅读' }}</button><button aria-label="收起正文" @click="setReadingMode('hidden')">收起</button></div></header>
      <div ref="storyList" class="story-list" role="log" :aria-live="followsLatest ? 'polite' : 'off'" aria-label="故事记录" :aria-busy="model.busy" @scroll="onStoryScroll"><article v-for="entry in storyEntries" :key="entry.id" class="story-entry" :class="{ 'story-user': entry.role === 'user' }" :data-story-id="entry.id"><span v-if="entry.role === 'user'" class="story-speaker">你的行动</span><p v-for="(paragraph, index) in entry.paragraphs" :key="index">{{ paragraph }}</p></article><p v-if="!storyEntries.length" class="empty-story">{{ currentLocation.description }} 你想从什么开始？</p></div>
      <button v-if="hasNewContent" class="new-content" @click="jumpToLatest">有新内容 <span aria-hidden="true">↓</span></button>
      <form class="composer" @submit.prevent="submit"><label class="sr-only" for="uc-action-input">接下来，你想做什么？</label><textarea id="uc-action-input" ref="composer" v-model="draft" aria-label="接下来，你想做什么？" rows="1" maxlength="2000" placeholder="写下你的行动，或说一句想说的话……" @keydown.ctrl.enter.prevent="submit"></textarea><button type="submit" :disabled="model.busy || !draft.trim()">{{ model.busy ? '叙事中…' : '继续故事' }} <span aria-hidden="true">↗</span></button></form>
      <p v-if="composerError" class="composer-error" role="alert">{{ composerError }}</p>
    </section>
    <button v-if="readingMode === 'hidden'" class="resume-reading" aria-label="继续阅读" @click="setReadingMode('compact')">继续阅读 <span v-if="hasNewContent" class="resume-dot">有新内容</span><span aria-hidden="true">↑</span></button>
    <section v-if="activeWindow" :key="activeWindow" class="floating-window" :class="{ 'phone-window': activeWindow === 'phone' }" :data-window="activeWindow" role="dialog" :aria-label="windowTitle + '窗口'" :style="windowStyle">
      <header class="window-heading" @pointerdown="startWindowDrag" @pointermove="moveWindow" @pointerup="endWindowDrag" @pointercancel="endWindowDrag"><h1>{{ windowTitle }}</h1><span v-if="activeWindow !== 'phone'" class="window-demo">演示内容</span><span v-else-if="!demoPhone" class="window-phone-label">{{ model.phoneSource === 'extension' ? '已连接手机' : '内置手机' }}</span><button :aria-label="'关闭' + windowTitle + '窗口'" @click="closeWindow()"><span aria-hidden="true">×</span></button></header>
      <template v-if="embeddedPhone"><div v-if="model.phoneLinkStatus === 'error'" class="phone-sync-error" role="status"><p>{{ model.phoneLinkError }}</p><button @click="actions.retryPhoneSync()">重试同步</button></div><div ref="phoneSlot" class="phone-slot" data-unread-city-phone-slot :data-phone-status="model.phoneStatus" aria-label="手机应用区域" :aria-busy="model.phoneStatus === 'loading'"><div v-if="!model.externalPhoneOpen" class="phone-waiting" :class="{ 'phone-load-error': model.phoneStatus === 'error' }" :role="model.phoneStatus === 'error' ? 'alert' : 'status'"><span class="phone-loading-icon" aria-hidden="true">▯</span><strong>{{ model.phoneStatus === 'error' ? '手机暂未打开' : '正在打开你的手机…' }}</strong><p>{{ model.phoneStatus === 'error' ? (model.phoneError || '手机加载未完成，请重试。') : '手机会在这里显示，你也可以先收起窗口继续阅读。' }}</p><button v-if="model.phoneStatus === 'error'" @click="openEmbeddedPhone">重试加载手机</button></div></div></template>
      <div v-else class="window-content"><WorldPanels :panel="activeWindow" :model="model" :actions="actions" @compose="name => prepareAction(`给${name}发消息：`)" @contact="openContact" /></div>
    </section>
  </div>
</template>
