<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import InteractiveScene from './InteractiveScene.vue';
import InteriorScene from './InteriorScene.vue';
import WorldPanels from './WorldPanels.vue';
import TransitPanel from './TransitPanel.vue';
import { locations } from '../runtime/model';
import { getScenePeople, type ScenePerson } from '../runtime/scene-context';
import type { ShellActions, ShellModel } from './types';
import { storyDisplayText } from './story-text';
import { bedRestOptions, campusInteriors, getCampusInterior, getInteriorActivity, studyDurationOptions, isStudyInteraction, getStudyEnergyCost } from '../runtime/campus-interiors';
import { streetRoutes } from './scene-world';
import { getNearbyTransitStop, transitStops, transitVehicles } from '../runtime/transit';

const props = defineProps<{ model: ShellModel; actions: ShellActions }>();
type WindowPanel = 'phone' | 'map' | 'schedule' | 'people' | 'status' | 'transit';
type ReadingMode = 'compact' | 'expanded' | 'hidden';
const activeWindow = ref<WindowPanel | null>(null);
const readingMode = ref<ReadingMode>('compact');
const shell = ref<HTMLElement>();
const scene = ref<{ focus(): void; flushPresence(): void }>();
const storyList = ref<HTMLElement>();
const composer = ref<HTMLTextAreaElement>();
const phoneSlot = ref<HTMLElement>();
const draft = ref('');
const composerError = ref('');
const walkSyncError = ref(false);
const bedRestPicker = ref(false);
const bedRestDialog = ref<HTMLElement>();
const studyInteractionId = ref('');
const studyDialog = ref<HTMLElement>();
const localActivityReceipt = ref('');
const walkSeed = props.model.state.scene?.seed ?? (globalThis.crypto?.randomUUID?.() || `walk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
let peopleSeed = '';
let cachedPeople: ScenePerson[] = [];
const scenePeople = computed(() => {
  if (props.model.state.interior) return [];
  const seed = props.model.state.scene?.seed ?? walkSeed;
  if (seed !== peopleSeed) {
    peopleSeed = seed;
    cachedPeople = getScenePeople({ x: 0, z: 18, yaw: 0, areaId: 'promenade', seed, encounterId: null });
  }
  return cachedPeople;
});
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
const currentRoom = computed(() => getCampusInterior(props.model.state.interior?.roomId));
function outdoorArrival() {
  const node = streetRoutes[props.model.state.locationId]?.[0];
  return node ? { x: node.position[0], z: node.position[2], yaw: node.yaw } : undefined;
}
const nearbyEntrance = computed(() => {
  const point = props.model.state.scene ?? outdoorArrival();
  if (props.model.state.interior || !point) return undefined;
  return campusInteriors.find(room => Math.hypot(room.entrance.x - point.x, room.entrance.z - point.z) <= 5);
});
const nearbyTransitStop = computed(() => {
  if (props.model.state.interior) return null;
  if (props.model.state.scene) return getNearbyTransitStop(props.model.state.scene, null);
  const point = outdoorArrival();
  return point ? transitStops.find(stop => Math.hypot(stop.x - point.x, stop.z - point.z) <= 6) ?? null : null;
});
const lastRoomActivity = computed(() => currentRoom.value ? getInteriorActivity(currentRoom.value, props.model.state.interior?.activityId, props.model.state.interior?.lastRest, props.model.state.interior?.lastStudy) : undefined);
const studyInteraction = computed(() => currentRoom.value?.interactions.find(item => item.id === studyInteractionId.value));
const lastWasTimedActivity = computed(() => (lastRoomActivity.value?.minutes ?? 0) > 0);
const time = computed(() => `${String(props.model.state.clock.hour).padStart(2, '0')}:${String(props.model.state.clock.minute).padStart(2, '0')}`);
const windowTitle = computed(() => activeWindow.value === 'transit' ? '公交站' : nav.find(item => item.id === activeWindow.value)?.title ?? '');
const demoPhone = computed(() => !props.model.externalPhoneAvailable && props.model.mode === 'demo');
const embeddedPhone = computed(() => activeWindow.value === 'phone' && !demoPhone.value);
const unread = computed(() => demoPhone.value ? props.model.state.phone.filter(item => !item.read).length : props.model.phoneUnread);
const storyEntries = computed(() => props.model.state.story.map(entry => ({ ...entry, paragraphs: storyDisplayText(entry.text).split(/\n\s*\n/).filter(Boolean) })));
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
  bedRestPicker.value = false;
  studyInteractionId.value = '';
  if (activeWindow.value === panel) { closeWindow(); return; }
  releasePhone(); windowPosition.value = undefined; activeWindow.value = panel;
}
function sceneHome() {
  bedRestPicker.value = false;
  studyInteractionId.value = '';
  closeWindow(false);
  if (readingMode.value !== 'compact') void setReadingMode('compact');
}
function approachTransitStop() {
  if (props.model.busy) return;
  scene.value?.flushPresence();
  if (walkSyncError.value) return;
  props.actions.dispatch({ type: 'travel', locationId: 'bus-stop' });
}
async function takeTransit(vehicleId: 'btr82a' | 'zbd04a', stopId: string) {
  if (props.model.busy) return;
  scene.value?.flushPresence();
  if (!props.model.state.scene && nearbyTransitStop.value) {
    const point = outdoorArrival();
    if (point) scenePresence(point);
  }
  if (walkSyncError.value) return;
  const sequence = props.model.state.transit.sequence;
  props.actions.dispatch({ type: 'ride_transit', vehicleId, stopId });
  const ride = props.model.state.transit.lastRide;
  if (props.model.notice || !ride || props.model.state.transit.sequence !== sequence + 1) return;
  const destination = transitStops.find(stop => stop.id === ride.toStopId);
  const vehicle = transitVehicles.find(vehicle => vehicle.id === ride.vehicleId);
  closeWindow(false);
  await setReadingMode('hidden');
  localActivityReceipt.value = `${vehicle?.label} 已到达${destination?.label} · ${ride.minutes} 分钟 · 车费 ¥${ride.fare} · 余额 ¥${props.model.state.player.balance.toFixed(2)}`;
  await nextTick(); scene.value?.focus();
}
async function startWalking() {
  closeWindow(false);
  await setReadingMode('hidden');
  scene.value?.focus();
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
  scene.value?.flushPresence();
  if (walkSyncError.value) { composerError.value = '当前位置尚未保存，请稍后重试；保存成功后再继续故事。'; return; }
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
  if (props.model.busy) return;
  if (action === 'phone' || action === 'map' || action === 'schedule') openWindow(action);
  else if (action === 'observe') void prepareAction('观察一下周围的环境。');
  else {
    scene.value?.flushPresence();
    if (walkSyncError.value) return;
    localActivityReceipt.value = '';
    const energyBefore = props.model.state.player.energy;
    props.actions.dispatch({ type: 'wait', minutes: 15 });
    if (!props.model.notice) showLocalActivity('长椅休息', 15, energyBefore);
  }
}
function showLocalActivity(label: string, minutes: number, energyBefore: number) {
  const energy = props.model.state.player.energy;
  const delta = energy - energyBefore;
  localActivityReceipt.value = `${label}完成 · 耗时 ${minutes} 分钟 · 第 ${props.model.state.clock.day} 天 ${time.value} · 精力 ${energy}（${delta > 0 ? `恢复 ${delta}` : delta < 0 ? `消耗 ${-delta}` : '未变化'}）`;
}
function scenePresence(position: { x: number; z: number; yaw: number }) {
  if (props.model.busy) return;
  if (props.model.state.interior) {
    props.actions.dispatch({ type: 'interior_walk', ...position });
    const saved = props.model.state.interior;
    walkSyncError.value = !saved || Math.hypot(saved.x - position.x, saved.z - position.z) > 0.2;
    return;
  }
  props.actions.dispatch({ type: 'walk', ...position, seed: walkSeed });
  const saved = props.model.state.scene;
  walkSyncError.value = !saved || Math.hypot(saved.x - position.x, saved.z - position.z) > 0.2;
}
async function enterInterior(roomId: string) {
  if (props.model.busy) return;
  scene.value?.flushPresence();
  // Map arrivals have a legal visible spawn before the first walking save.
  // Persist that exact point on the explicit enter action so exit can restore it.
  if (!props.model.state.scene) {
    const arrival = outdoorArrival();
    if (arrival) scenePresence(arrival);
  }
  if (walkSyncError.value) return;
  props.actions.dispatch({ type: 'enter_interior', roomId });
  if (props.model.state.interior?.roomId !== roomId) return;
  walkSyncError.value = false;
  closeWindow(false);
  await setReadingMode('hidden');
  await nextTick(); scene.value?.focus();
}
async function leaveInterior() {
  if (props.model.busy) return;
  scene.value?.flushPresence();
  props.actions.dispatch({ type: 'leave_interior' });
  if (props.model.state.interior) return;
  walkSyncError.value = false;
  await nextTick(); scene.value?.focus();
}
function roomInteract(interactionId: string) {
  if (props.model.busy) return;
  scene.value?.flushPresence();
  if (walkSyncError.value) return;
  const interaction = currentRoom.value?.interactions.find(item => item.id === interactionId);
  if (!interaction) return;
  if (interactionId === 'dorm-rest') {
    localActivityReceipt.value = '';
    bedRestPicker.value = true;
    void nextTick(() => bedRestDialog.value?.querySelector<HTMLButtonElement>('[data-rest-option]')?.focus({ preventScroll: true }));
    return;
  }
  if (isStudyInteraction(interactionId)) {
    localActivityReceipt.value = '';
    studyInteractionId.value = interactionId;
    void nextTick(() => (studyDialog.value?.querySelector<HTMLButtonElement>('[data-study-option]:not(:disabled)') ?? studyDialog.value?.querySelector<HTMLButtonElement>('.bed-rest-cancel'))?.focus({ preventScroll: true }));
    return;
  }
  localActivityReceipt.value = '';
  const energyBefore = props.model.state.player.energy;
  props.actions.dispatch({ type: 'interior_interact', interactionId });
  if (props.model.notice || props.model.state.interior?.activityId !== interactionId) return;
  if (interaction.minutes > 0) {
    showLocalActivity(interaction.label, interaction.minutes, energyBefore);
    return;
  }
  void prepareAction(interaction.prompt);
}
function closeBedRestPicker() {
  bedRestPicker.value = false;
  void nextTick(() => scene.value?.focus());
}
function chooseBedRest(optionId: string) {
  if (!bedRestPicker.value || props.model.busy) return;
  const option = bedRestOptions.find(item => item.id === optionId);
  if (!option) return;
  const energyBefore = props.model.state.player.energy;
  props.actions.dispatch({ type: 'interior_rest', optionId });
  const rest = props.model.state.interior?.lastRest;
  if (props.model.notice || props.model.state.interior?.activityId !== optionId || rest?.optionId !== optionId) return;
  showLocalActivity(option.label, rest.minutes, energyBefore);
  closeBedRestPicker();
}
function closeStudyPicker() {
  studyInteractionId.value = '';
  void nextTick(() => scene.value?.focus());
}
function chooseStudy(optionId: string) {
  if (!studyInteraction.value || props.model.busy) return;
  const option = studyDurationOptions.find(item => item.id === optionId);
  if (!option || props.model.state.player.energy < getStudyEnergyCost(option.maxMinutes)) return;
  const interaction = studyInteraction.value;
  const energyBefore = props.model.state.player.energy;
  props.actions.dispatch({ type: 'interior_study', interactionId: interaction.id, optionId });
  const study = props.model.state.interior?.lastStudy;
  if (props.model.notice || study?.interactionId !== interaction.id || study?.optionId !== optionId) return;
  showLocalActivity(`${interaction.label} · ${option.label}`, study.minutes, energyBefore);
  closeStudyPicker();
}
function durationPickerKeydown(event: KeyboardEvent) {
  if (event.key !== 'Tab') return;
  const buttons = Array.from((event.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
  if (!buttons.length) return;
  const first = buttons[0], last = buttons[buttons.length - 1];
  if (event.shiftKey && event.target === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && event.target === last) { event.preventDefault(); first.focus(); }
}
watch(() => props.model.state.locationId, () => { bedRestPicker.value = false; studyInteractionId.value = ''; localActivityReceipt.value = ''; });
function sceneEncounter(personId: string) {
  if (props.model.busy) return;
  scene.value?.flushPresence();
  if (walkSyncError.value) return;
  const person = scenePeople.value.find(item => item.id === personId);
  if (!person) return;
  props.actions.dispatch({ type: 'encounter', personId });
  if (props.model.state.scene?.encounterId !== personId) return;
  void prepareAction(`我向${person.name}（${person.identity}）打招呼，想和对方聊几句。请根据我们眼下所在的地方继续当面的对话，不要替我决定下一句话。`);
}
function dismissOverlay() {
  if (studyInteractionId.value) { closeStudyPicker(); return true; }
  if (bedRestPicker.value) { closeBedRestPicker(); return true; }
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
  <div ref="shell" class="uc-shell" :data-reading-mode="readingMode" :data-active-window="activeWindow ?? ''" :data-rest-picker="bedRestPicker || !!studyInteractionId" :data-phone-link-status="model.phoneLinkStatus">
    <InteriorScene v-if="model.state.interior" ref="scene" :interior="model.state.interior" :busy="model.busy" :hour="model.state.clock.hour" :free-walk="readingMode === 'hidden' && !activeWindow" :paused="model.busy || readingMode === 'expanded' || !!activeWindow || bedRestPicker || !!studyInteractionId" @presence="scenePresence" @interact="roomInteract" @leave="leaveInterior" />
    <InteractiveScene v-else ref="scene" :location-id="model.state.locationId" :presence="model.state.scene" :air-traffic="model.state.airTraffic" :people="scenePeople" :busy="model.busy" :hour="model.state.clock.hour" :free-walk="readingMode === 'hidden' && !activeWindow" :paused="model.busy || readingMode === 'expanded' || !!activeWindow" @hotspot="sceneHotspot" @presence="scenePresence" @encounter="sceneEncounter" />
    <div class="world-vignette" :class="{ 'reading-shade': readingMode === 'expanded' }" aria-hidden="true"></div>
    <header class="world-chrome"><div class="world-heading"><button class="wordmark" aria-label="场景" @click="sceneHome">未读之城<span>一段正在发生的日常</span></button><div class="topbar-world"><span>{{ currentLocation.name }}</span><span class="chrome-dot">·</span><span>第 {{ model.state.clock.day }} 天</span><time>{{ time }}</time></div></div><div class="host-actions"><button aria-label="切换聊天并恢复原生界面" @click="actions.switchChat()">切换聊天</button><button aria-label="退出沉浸界面，恢复酒馆原生界面" @click="actions.exit()">退出酒馆 <span aria-hidden="true">↗</span></button></div></header>
    <p v-if="model.notice" class="notice" role="status">{{ model.notice }}</p>
    <button v-if="readingMode === 'compact' && !activeWindow" class="walk-launcher" aria-label="自由行走" @click="startWalking"><span aria-hidden="true">↟</span> 自由行走</button>
    <button v-if="nearbyEntrance && !activeWindow && readingMode !== 'expanded'" class="campus-entrance" :disabled="model.busy" :aria-label="`进入${nearbyEntrance.label}`" @click="enterInterior(nearbyEntrance.id)"><span aria-hidden="true">⌂</span><span>进入{{ nearbyEntrance.label }}<small>室内探索 · 可随时返回</small></span><span aria-hidden="true">↗</span></button>
    <button v-if="nearbyTransitStop && !activeWindow && readingMode !== 'expanded'" class="campus-entrance" data-transit-entry aria-label="公交乘车" :disabled="model.busy" @click="openWindow('transit')"><span aria-hidden="true">▣</span><span>公交乘车<small>{{ nearbyTransitStop.label }} · BTR-82A / ZBD-04A</small></span><span aria-hidden="true">↗</span></button>
    <p v-if="localActivityReceipt && readingMode === 'hidden' && !activeWindow && !bedRestPicker && !studyInteractionId" class="bed-rest-receipt" data-bed-rest-receipt data-local-activity-receipt role="status">{{ localActivityReceipt }}<small>已保存，无需发送对话。</small></p>
    <div v-if="bedRestPicker" class="bed-rest-overlay" @click.self="closeBedRestPicker">
      <section ref="bedRestDialog" class="bed-rest-dialog" role="dialog" aria-modal="true" aria-label="选择休息时长" data-bed-rest-picker @keydown="durationPickerKeydown">
        <header><small>学生宿舍 · 床铺</small><h2>选择休息时长</h2><p>选定后直接休息，时间与精力自动保存。</p></header>
        <div class="bed-rest-options"><button v-for="option in bedRestOptions" :key="option.id" :data-rest-option="option.id" :disabled="model.busy" @click="chooseBedRest(option.id)"><strong>{{ option.label }}</strong><span>{{ option.minMinutes < 60 ? `${option.minMinutes}–${option.maxMinutes} 分钟` : `${option.minMinutes / 60}–${option.maxMinutes / 60} 小时` }}</span><small>{{ option.energyDelta === 100 ? '精力恢复至 100' : `恢复至多 ${Math.floor(option.minMinutes * 0.4)}–${Math.floor(option.maxMinutes * 0.4)} 点精力` }}</small></button></div>
        <p class="bed-rest-note">程序在区间内随机确定时长，只结算一次。精力最高 100；长休可能进入第二天。取消不会改变进度。</p>
        <button class="bed-rest-cancel" @click="closeBedRestPicker">取消</button>
      </section>
    </div>
    <div v-if="studyInteraction" class="bed-rest-overlay" @click.self="closeStudyPicker">
      <section ref="studyDialog" class="bed-rest-dialog" role="dialog" aria-modal="true" aria-label="选择学习时长" data-study-picker @keydown="durationPickerKeydown">
        <header><small>{{ currentRoom?.label }} · {{ studyInteraction.label }}</small><h2>选择学习时长</h2><p>选定后直接学习，实际时长与精力消耗自动保存。</p></header>
        <div class="bed-rest-options"><button v-for="option in studyDurationOptions" :key="option.id" :data-study-option="option.id" :disabled="model.busy || model.state.player.energy < getStudyEnergyCost(option.maxMinutes)" @click="chooseStudy(option.id)"><strong>{{ option.label }}</strong><span>{{ option.minMinutes < 60 ? `${option.minMinutes}–${option.maxMinutes} 分钟` : `${option.minMinutes / 60}–${option.maxMinutes / 60} 小时` }}</span><small>消耗 {{ getStudyEnergyCost(option.minMinutes) }}–{{ getStudyEnergyCost(option.maxMinutes) }} 点精力</small><small v-if="model.state.player.energy < getStudyEnergyCost(option.maxMinutes)">精力不足，需至少 {{ getStudyEnergyCost(option.maxMinutes) }} 点</small></button></div>
        <p class="bed-rest-note">程序在区间内随机确定时长，只结算一次。按实际时长消耗精力；精力须足够完成该档最长时间。取消不会改变进度。</p>
        <button class="bed-rest-cancel" @click="closeStudyPicker">取消</button>
      </section>
    </div>
    <nav class="tool-dock" aria-label="世界面板"><button v-for="item in nav" :key="item.id" :class="{ 'phone-launcher': item.id === 'phone' }" :aria-label="item.title" :aria-pressed="activeWindow === item.id" :title="item.id === 'phone' ? (unread ? `${unread} 条未读消息，点击打开手机` : activeWindow === 'phone' ? '收起手机' : '打开手机，阅读时也可使用') : undefined" @click="openWindow(item.id)"><span class="tool-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path :d="item.path" /></svg><span v-if="item.id === 'phone' && unread" class="phone-unread-badge" :data-phone-unread="unread">{{ unread > 99 ? '99+' : unread }}</span></span><span class="tool-label">{{ item.title }}<small v-if="item.id === 'phone'">{{ unread ? '有未读' : activeWindow === 'phone' ? '已打开' : '常驻' }}</small></span></button></nav>
    <span class="sr-only" role="status" aria-live="polite">{{ unread ? `手机有 ${unread} 条未读消息` : '手机没有未读消息' }}</span>
    <section v-show="readingMode !== 'hidden'" class="reading-layer" data-reading-layer aria-label="小说正文" :class="{ 'reading-expanded': readingMode === 'expanded' }">
      <header class="reading-heading"><div><span class="reading-caption">{{ model.busy ? '故事正在继续…' : '此刻的故事' }}</span><small v-if="model.mode === 'demo'">本地演示</small></div><div class="reading-actions"><button @click="readEarlier">往前读</button><button :aria-label="readingMode === 'expanded' ? '缩小正文' : '展开正文'" @click="setReadingMode(readingMode === 'expanded' ? 'compact' : 'expanded')">{{ readingMode === 'expanded' ? '回到场景' : '专注阅读' }}</button><button aria-label="收起正文" @click="setReadingMode('hidden')">收起</button></div></header>
      <p v-if="lastRoomActivity" class="room-activity-receipt" role="status">{{ lastRoomActivity.result }} <span>{{ lastWasTimedActivity ? '已完成活动，无需发送对话。' : '已记入状态，可继续故事。' }}</span></p>
      <div ref="storyList" class="story-list" role="log" :aria-live="followsLatest ? 'polite' : 'off'" aria-label="故事记录" :aria-busy="model.busy" @scroll="onStoryScroll"><article v-for="entry in storyEntries" :key="entry.id" class="story-entry" :class="{ 'story-user': entry.role === 'user' }" :data-story-id="entry.id"><span v-if="entry.role === 'user'" class="story-speaker">你的行动</span><p v-for="(paragraph, index) in entry.paragraphs" :key="index">{{ paragraph }}</p></article><p v-if="!storyEntries.length" class="empty-story">{{ currentLocation.description }} 你想从什么开始？</p></div>
      <button v-if="hasNewContent" class="new-content" @click="jumpToLatest">有新内容 <span aria-hidden="true">↓</span></button>
      <form class="composer" @submit.prevent="submit"><label class="sr-only" for="uc-action-input">接下来，你想做什么？</label><textarea id="uc-action-input" ref="composer" v-model="draft" aria-label="接下来，你想做什么？" rows="1" maxlength="2000" placeholder="写下你的行动，或说一句想说的话……" @keydown.ctrl.enter.prevent="submit"></textarea><button type="submit" :disabled="model.busy || !draft.trim()">{{ model.busy ? '叙事中…' : '继续故事' }} <span aria-hidden="true">↗</span></button></form>
      <p v-if="composerError" class="composer-error" role="alert">{{ composerError }}</p>
    </section>
    <button v-if="readingMode === 'hidden'" class="resume-reading" aria-label="继续阅读" @click="setReadingMode('compact')">继续阅读 <span v-if="hasNewContent" class="resume-dot">有新内容</span><span aria-hidden="true">↑</span></button>
    <section v-if="activeWindow" :key="activeWindow" class="floating-window" :class="{ 'phone-window': activeWindow === 'phone' }" :data-window="activeWindow" role="dialog" :aria-label="windowTitle + '窗口'" :style="windowStyle">
      <header class="window-heading" @pointerdown="startWindowDrag" @pointermove="moveWindow" @pointerup="endWindowDrag" @pointercancel="endWindowDrag"><h1>{{ windowTitle }}</h1><span v-if="activeWindow !== 'phone'" class="window-demo">演示内容</span><span v-else-if="!demoPhone" class="window-phone-label">{{ model.phoneSource === 'extension' ? '已连接手机' : '内置手机' }}</span><button v-if="activeWindow === 'map'" class="window-transit" data-transit-open @click="openWindow('transit')">公交线路 ↗</button><button :aria-label="'关闭' + windowTitle + '窗口'" @click="closeWindow()"><span aria-hidden="true">×</span></button></header>
      <template v-if="embeddedPhone"><div v-if="model.phoneLinkStatus === 'error'" class="phone-sync-error" role="status"><p>{{ model.phoneLinkError }}</p><button @click="actions.retryPhoneSync()">重试同步</button></div><div ref="phoneSlot" class="phone-slot" data-unread-city-phone-slot :data-phone-status="model.phoneStatus" aria-label="手机应用区域" :aria-busy="model.phoneStatus === 'loading'"><div v-if="!model.externalPhoneOpen" class="phone-waiting" :class="{ 'phone-load-error': model.phoneStatus === 'error' }" :role="model.phoneStatus === 'error' ? 'alert' : 'status'"><span class="phone-loading-icon" aria-hidden="true">▯</span><strong>{{ model.phoneStatus === 'error' ? '手机暂未打开' : '正在打开你的手机…' }}</strong><p>{{ model.phoneStatus === 'error' ? (model.phoneError || '手机加载未完成，请重试。') : '手机会在这里显示，你也可以先收起窗口继续阅读。' }}</p><button v-if="model.phoneStatus === 'error'" @click="openEmbeddedPhone">重试加载手机</button></div></div></template>
      <div v-else-if="activeWindow === 'transit'" class="window-content"><TransitPanel :model="model" :stop="nearbyTransitStop" @ride="takeTransit" @approach="approachTransitStop" /></div>
      <div v-else class="window-content"><WorldPanels :panel="activeWindow" :model="model" :actions="actions" @compose="name => prepareAction(`给${name}发消息：`)" @contact="openContact" @transit="openWindow('transit')" /></div>
    </section>
  </div>
</template>
