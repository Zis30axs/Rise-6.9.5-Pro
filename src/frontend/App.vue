<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import InteractiveScene from './InteractiveScene.vue';
import InteriorScene from './InteriorScene.vue';
import NovelBackdrop from './NovelBackdrop.vue';
import NovelDialogue from './NovelDialogue.vue';
import StoryEntryContent from './StoryEntryContent.vue';
import NovelNpcPortrait from './NovelNpcPortrait.vue';
import SoyoLive2D from './SoyoLive2D.vue';
import ProtagonistPhonePose from './ProtagonistPhonePose.vue';
import ProtagonistSwitchOverlay from './ProtagonistSwitchOverlay.vue';
import type { ProtagonistSwitchLease } from './protagonist-switch';
import type { SwitchSceneHandle } from './switch-camera';
import { resolveNovelNpcPortrait, standingSpeaker } from './novel-npc-portraits';
import { isSoyoSpeaker } from './live2d-soyo-assets';
import { isSakikoSpeaker } from './sakiko-art-policy';
import { resolveMajoSpeaker } from './majo-art';
import { resolveWatanareSpeaker } from './watanare-art';
import { resolveFengjinSpeaker } from './fengjin-art';
import { hasProtagonistPhonePose } from './protagonist-phone-art';
import { type NovelSegment } from './novel-dialogue';
import { readPresentationMode, savePresentationMode, type PresentationMode } from './presentation-mode';
import { bindShellLayout, type ShellLayoutLease } from './shell-layout';
import WorldPanels from './WorldPanels.vue';
import TransitPanel from './TransitPanel.vue';
import ConvenienceStore from './ConvenienceStore.vue';
import InventoryPanel from './InventoryPanel.vue';
import LocationServices from './LocationServices.vue';
import LawCareerPanel from './LawCareerPanel.vue';
import PlaceActions from './PlaceActions.vue';
import LivehousePanel from './LivehousePanel.vue';
import InteractionOverlay from './InteractionOverlay.vue';
import { runInteraction } from './interaction-action';
import { completeLocationService, packageLocationService } from './location-service-action';
import { CONSTRUCTION_BACKEND_JOB_ID } from '../runtime/location-services';
import AcademicSetup from './AcademicSetup.vue';
import { academicMajors, getAcademicOverview, getAcademicProgress, getAcademicStudyQuote, getAcademicSubjectById } from '../runtime/academics';
import { getStoreAvailability } from '../runtime/convenience-store';
import { getActivityEffects } from '../runtime/activity-effects';
import { getNovelTravelQuote, locations } from '../runtime/model';
import { activeProtagonist, protagonistNames } from '../runtime/protagonist-world';
import { agreedMinute, socialMinute } from '../runtime/social-agenda';
import type { SocialInvitation } from '../runtime/natural-interactions';
import { isCourtInSession } from '../runtime/courtroom';
import { formatGameDate, gameCalendar } from '../runtime/game-calendar';
import { gameCalendarOccasions } from '../runtime/japan-calendar-events';
import { getAdjacentLocations } from '../runtime/location-links';
import { getScenePeople, hiddenProtagonistPersons, SCENE_ENCOUNTER_DISTANCE } from '../runtime/scene-context';
import { worldScenePeople, worldScenePosition, type WorldScenePerson } from '../runtime/world-presence';
import type { PlayerState, ShellActions, ShellModel } from './types';
import { PROTAGONISTS, type ProtagonistId } from '../runtime/dual-protagonists';
import { bedRestOptions, campusInteriors, getCampusInterior, getInteriorActivity, studyDurationOptions, isStudyInteraction, getStudyEnergyCost } from '../runtime/campus-interiors';
import { streetRoutes } from './scene-world';
import { getNearbyTransitStop, transitStops, transitVehicles } from '../runtime/transit';

const props = defineProps<{ model: ShellModel; actions: ShellActions }>();
const currentProtagonist = computed(() => activeProtagonist(props.model.state));
const switchingLease = shallowRef<ProtagonistSwitchLease | null>(null);
const switchOverlay = ref<{ skip(): Promise<void> }>();
const pendingCourtSwitch = ref<ProtagonistId | null>(null);
function commitProtagonistSwitch(target: ProtagonistId) {
  if (!PROTAGONISTS.includes(target) || currentProtagonist.value === target ||
    switchingLease.value || props.model.busy || props.model.interaction) return;
  scene.value?.flushPresence();
  if (walkSyncError.value) { props.model.notice = '当前位置尚未保存，请稍后重试。'; return; }
  if (!props.actions.beginProtagonistSwitch) {
    props.actions.dispatch({ type: 'switch_protagonist', target });
    return;
  }
  switchingLease.value = props.actions.beginProtagonistSwitch(target);
}
function requestProtagonistSwitch(target: ProtagonistId) {
  if (pendingCourtSwitch.value || !PROTAGONISTS.includes(target) || target === currentProtagonist.value ||
    switchingLease.value || props.model.busy || props.model.interaction) return;
  if (isCourtInSession(props.model.state)) {
    pendingCourtSwitch.value = target;
    void nextTick(() => shell.value?.querySelector<HTMLButtonElement>('[data-court-switch-cancel]')?.focus({preventScroll:true}));
    return;
  }
  commitProtagonistSwitch(target);
}
function confirmCourtSwitch() {
  const target = pendingCourtSwitch.value;
  pendingCourtSwitch.value = null;
  if (target) commitProtagonistSwitch(target);
}
function selectProtagonist(event: Event) {
  const input = event.target as HTMLSelectElement;
  const target = input.value as ProtagonistId;
  input.value = currentProtagonist.value;
  requestProtagonistSwitch(target);
}
/** Side-story viewpoints use the same active-trial warning as the main selector. */
function switchToOtherSide(target: ProtagonistId) {
  requestProtagonistSwitch(target);
}
watch(() => props.model.switchingProtagonist, pending => {
  if (pending === false && switchingLease.value) switchingLease.value = null;
});
watch(currentProtagonist, protagonist => { pendingCourtSwitch.value=null; closeWindow(false); draft.value = ''; localActivityReceipt.value = ''; novelHistory.value = false; historyPortrait.value = false; novelSegment.value = { speaker: protagonistNames[protagonist], emotion: '平静', text: '' }; }, { flush: 'post' });
type WindowPanel = 'phone' | 'map' | 'schedule' | 'inventory' | 'status' | 'transit' | 'store' | 'location' | 'law';
type ReadingMode = 'compact' | 'expanded' | 'hidden';
const activeWindow = ref<WindowPanel | null>(null);
const phoneExpanded = ref(false);
const readingMode = ref<ReadingMode>('compact');
const layoutEditing = ref(false);
let layoutLease: ShellLayoutLease | undefined;
function toggleLayoutEditing() {
  layoutEditing.value = !layoutEditing.value;
  layoutLease?.setEditing(layoutEditing.value);
}
function resetLayout() {
  layoutLease?.reset();
}
const presentationMode = ref<PresentationMode>(readPresentationMode());
const novelMode = computed(() => presentationMode.value === 'novel');
const novelHistory = ref(false);
const novelSegment = ref<NovelSegment>({ speaker: '', emotion: '平静', text: '' });
const segmentSpeaker = computed(() => standingSpeaker(novelSegment.value.speaker, protagonistNames[currentProtagonist.value]));
const historyPortrait = ref(false);
const heldPortrait = ref<{ speaker: string; emotion: string; dimmed: boolean } | null>(null);
let sceneReadingMode: ReadingMode = 'compact';
let sceneReadingPosition = { scroll: 0, follows: true, unread: false, storyId: '' };
const shell = ref<HTMLElement>();
const scene = ref<SwitchSceneHandle>();
const storyList = ref<HTMLElement>();
const composer = ref<HTMLTextAreaElement>();
const phoneSlot = ref<HTMLElement>();
const draft = ref('');
const composerError = ref('');
const walkSyncError = ref(false);
const bedRestPicker = ref(false);
const livehouseMode = ref<'register' | 'book' | null>(null);
const bedRestDialog = ref<HTMLElement>();
const studyInteractionId = ref('');
const bookReadingPicker = ref(false);
const studySubjectId = ref('');
const studyAttempted = ref(false);
const studyDialog = ref<HTMLElement>();
const localActivityReceipt = ref('');
const walkSeed = props.model.state.scene?.seed ?? (globalThis.crypto?.randomUUID?.() || `walk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
// Keep the complete saved population available when reading an earlier scene indoors.
const portraitPeople = computed(() => {
  const seed = props.model.state.scene?.seed ?? walkSeed;
  return getScenePeople({ x: 0, z: 18, yaw: 0, areaId: 'promenade', seed, encounterId: null }, props.model.state.contacts, props.model.state.clock, hiddenProtagonistPersons(props.model.state));
});
const scenePeople = computed(() => worldScenePeople(props.model.state));
const encounterPerson = computed(() => {
  const position = worldScenePosition(props.model.state);
  if (!position) return null;
  return scenePeople.value.find(person => person.id === props.model.state.scene?.encounterId && Math.hypot(person.x - position.x, person.z - position.z) <= SCENE_ENCOUNTER_DISTANCE) ?? null;
});
// Click-selected dialogue is authoritative in the novel reader; preserve scene
// encounters for 3D mode, including other protagonists actually present.
const useEncounterPortrait = computed(() => !novelMode.value && !!encounterPerson.value && !novelHistory.value && !historyPortrait.value);
const portraitSpeaker = computed(() => novelMode.value && heldPortrait.value ? heldPortrait.value.speaker : useEncounterPortrait.value && encounterPerson.value
  ? encounterPerson.value.protagonistId ? protagonistNames[encounterPerson.value.protagonistId] : encounterPerson.value.id
  : segmentSpeaker.value);
// Protagonists without an authored phone pose keep their standing portrait while the phone is open.
const portraitActive = computed(() => !activeWindow.value
  || (activeWindow.value === 'phone' && !hasProtagonistPhonePose(currentProtagonist.value)));
const npcPortraitId = computed(() => resolveNovelNpcPortrait(portraitSpeaker.value, {
  contacts: props.model.state.contacts,
  scenePeople: [...new Map([...portraitPeople.value, ...scenePeople.value].map(person => [person.id, person])).values()],
  encounterId: props.model.state.scene?.encounterId,
}));
function personLabel(person: WorldScenePerson) { return person.protagonistId ? protagonistNames[person.protagonistId] : person.contactId || person.identity === '咖啡馆店主' ? person.name : `陌生${person.identity}`; }
const portraitLabel = computed(() => novelMode.value && heldPortrait.value ? heldPortrait.value.speaker : useEncounterPortrait.value && encounterPerson.value ? personLabel(encounterPerson.value) : segmentSpeaker.value);
const portraitEmotion = computed(() => novelMode.value && heldPortrait.value ? heldPortrait.value.emotion : novelSegment.value.emotion);
const portraitDimmed = computed(() => novelMode.value && !!heldPortrait.value?.dimmed);
function recognizesNovelSpeaker(speaker: string): boolean {
  return isSoyoSpeaker(speaker) || isSakikoSpeaker(speaker) || !!resolveMajoSpeaker(speaker)
    || !!resolveWatanareSpeaker(speaker) || !!resolveFengjinSpeaker(speaker) || resolveNovelNpcPortrait(speaker, {
      contacts: props.model.state.contacts,
      scenePeople: [...new Map([...portraitPeople.value, ...scenePeople.value].map(person => [person.id, person])).values()],
      encounterId: props.model.state.scene?.encounterId,
    }) !== null;
}
function readDialogueSegment(segment: NovelSegment) { historyPortrait.value = true; novelSegment.value = segment; }
const followsLatest = ref(true);
const hasNewContent = ref(false);
let requestedPhoneSlot: HTMLElement | undefined;
let phoneMountRevision = 0;
let unmounting = false;
let drag: { id: number; x: number; y: number; left: number; top: number; width: number; height: number; element: HTMLElement } | undefined;
let savedReadingScroll = 0;
const nav: { id: WindowPanel; title: string; path: string }[] = [
  { id: 'phone', title: '手机', path: 'M7 2h10a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1ZM10 5h4M11 19h2' },
  { id: 'map', title: '地图', path: 'm3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2ZM9 3v16M15 5v16' },
  { id: 'location', title: '地点', path: 'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z' },
  { id: 'schedule', title: '日程', path: 'M4 5h16v16H4ZM4 10h16M8 3v4M16 3v4M8 14h2M14 14h2M8 18h2' },
  { id: 'inventory', title: '背包', path: 'M8 6V4a4 4 0 0 1 8 0v2M6 6h12a2 2 0 0 1 2 2v13H4V8a2 2 0 0 1 2-2ZM7 13h10v6H7ZM8 9h8' },
  { id: 'status', title: '状态', path: 'M5 3h14v18H5ZM9 7h6M9 11h6M9 15h3M3 7h4M3 15h4' },
];
const currentLocation = computed(() => locations.find(item => item.id === props.model.state.locationId) ?? locations[0]);
const currentRoom = computed(() => getCampusInterior(props.model.state.interior?.roomId));
const academicOverview = computed(() => getAcademicOverview(props.model.state.academics));
const academicProgress = computed(() => getAcademicProgress(props.model.state.academics, studySubjectId.value));
const bookReadingAvailable = computed(() => !props.model.state.interior && props.model.state.locationId === 'bookshop');
const storeAvailable = computed(() => getStoreAvailability(props.model.state).available);
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
const nearbyPeople = computed(() => {
  const position = worldScenePosition(props.model.state);
  if (!position) return [];
  return scenePeople.value.map(person => ({ person, distance: Math.hypot(person.x - position.x, person.z - position.z) }))
    .filter(item => item.distance <= SCENE_ENCOUNTER_DISTANCE).sort((a, b) => a.distance - b.distance);
});
const lastRoomActivity = computed(() => currentRoom.value ? getInteriorActivity(currentRoom.value, props.model.state.interior?.activityId, props.model.state.interior?.lastRest, props.model.state.interior?.lastStudy) : undefined);
const persistedRoomReceipt = computed(() => {
  const activity = lastRoomActivity.value;
  if (!activity) return '';
  const study = props.model.state.interior?.lastStudy;
  const gain = props.model.state.academics?.lastGain;
  const subject = gain ? getAcademicSubjectById(gain.subjectId) : undefined;
  // A legacy study has no saved gain: selecting a subject never re-awards it.
  return study && gain && subject && gain.channel === currentRoom.value?.id && gain.interactionId === study.interactionId && props.model.state.interior?.activityId === study.interactionId && gain.minutes === study.minutes
    ? `${activity.result} · ${subject.name} +${gain.points} 学习点（本次完成后累计 ${gain.totalPoints}） · ${studyOutcome(gain.outcome)}`
    : activity.result;
});
const persistedBookReceipt = computed(() => {
  const gain = props.model.state.academics?.lastGain;
  const subject = gain ? getAcademicSubjectById(gain.subjectId) : null;
  if (!bookReadingAvailable.value || gain?.channel !== 'bookshop' || !subject) return '';
  const signed = (value: number | null) => value === null ? '未记录' : `${value > 0 ? '+' : ''}${value}`;
  return `${gain.at} · 书店阅读 ${gain.minutes} 分钟 · ${studyOutcome(gain.outcome)} · ${subject.name} +${gain.points} 学习点（累计 ${gain.totalPoints}） · 精力消耗 ${gain.energyConsumed} · 精神 ${signed(gain.moraleChange)} · 压力 ${signed(gain.stressChange)}`;
});
const studyInteraction = computed(() => currentRoom.value?.interactions.find(item => item.id === studyInteractionId.value));
const studyPickerOpen = computed(() => !!studyInteraction.value || bookReadingPicker.value);
const studySubjectGroups = computed(() => currentRoom.value?.id === 'classroom' && !bookReadingPicker.value
  ? academicMajors.filter(major => major.id === academicOverview.value?.major.id) : academicMajors);
const studyQuotes = computed(() => studyDurationOptions.map(option => ({ option, quote: getAcademicStudyQuote(props.model.state, {
  subjectId: studySubjectId.value, optionId: option.id, ...(bookReadingPicker.value ? {} : { interactionId: studyInteractionId.value }),
}) })));
function studyOutcome(outcome: string | null) {
  return outcome === 'inspiration' ? '灵感涌现' : outcome === 'confusion' ? '理解受挫' : outcome === 'normal' ? '平稳学习' : '历史学习记录';
}
const lastWasTimedActivity = computed(() => (lastRoomActivity.value?.minutes ?? 0) > 0);
const time = computed(() => `${String(props.model.state.clock.hour).padStart(2, '0')}:${String(props.model.state.clock.minute).padStart(2, '0')}`);
const civilDateLabel = computed(() => {
  const day = props.model.state.clock.day;
  const occasions = gameCalendarOccasions(day);
  const occasion = occasions.find(item => item.dayOff) ?? occasions[0];
  return `${formatGameDate(day)} · ${gameCalendar(day).weekdayLabel}${occasion ? ' · ' + occasion.name : ''}`;
});
const windowTitle = computed(() => activeWindow.value === 'store' ? '便利店' : activeWindow.value === 'transit' ? '公交站' : activeWindow.value === 'law' ? (props.model.state.locationId==='court-hearing'?'法院 · 案件':'律师事务所 · 案件') : nav.find(item => item.id === activeWindow.value)?.title ?? '');
const demoPhone = computed(() => !props.model.externalPhoneAvailable && props.model.mode === 'demo');
const embeddedPhone = computed(() => activeWindow.value === 'phone' && !demoPhone.value);
// Phone presentation renders a static front view while all walking remains disabled.
const scenePaused = computed(() => switchingLease.value ? false : !props.model.state.academics || studyPickerOpen.value || (activeWindow.value === 'phone' ? false : props.model.busy || readingMode.value === 'expanded' || !!activeWindow.value));
const unread = computed(() => demoPhone.value ? props.model.state.phone.filter(item => !item.read).length : props.model.phoneUnread);
const storyEntries = computed(() => props.model.state.story);
const dismissedMeetingPrompts = ref<string[]>([]);
const meetingPrompt = computed(() => {
  const state=props.model.state, now=socialMinute(state);
  return (state.protagonists?.socialInvitations ?? []).slice().reverse().find(invite =>
    invite.owner===currentProtagonist.value && invite.status==='accepted' &&
    !dismissedMeetingPrompts.value.includes(invite.id) &&
    now>=agreedMinute(invite)-45 && now<=agreedMinute(invite)+180 && state.locationId!==invite.locationId) ?? null;
});
function hideMeetingPrompt(id:string){
  if(!dismissedMeetingPrompts.value.includes(id))dismissedMeetingPrompts.value.push(id);
}
async function travelToMeeting(invite:SocialInvitation){
  if(props.model.busy)return;
  const destination=novelMode.value?invite.locationId:getCampusInterior(invite.locationId)?.parentLocationId??invite.locationId;
  if(await runInteraction(props.model,props.actions,{type:novelMode.value?'novel_travel':'travel',locationId:destination}))
    hideMeetingPrompt(invite.id);
}

function releasePhone() {
  if (!requestedPhoneSlot) return;
  requestedPhoneSlot = undefined;
  props.actions.closePhone();
}
function closeWindow(restoreFocus = true) {
  const previous = activeWindow.value;
  releasePhone(); activeWindow.value = null; phoneExpanded.value = false; drag = undefined;
  if (restoreFocus && previous) nextTick(() => {
    const selector = previous === 'store' ? '[data-store-entry]' : `button[aria-label="${nav.find(item => item.id === previous)?.title}"]`;
    shell.value?.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true });
  });
}
function openStore() {
  if (props.model.busy) return;
  scene.value?.flushPresence();
  if (walkSyncError.value || !storeAvailable.value) return;
  openWindow('store');
}
function openBookReading() {
  if (props.model.busy || !props.model.state.academics) return;
  scene.value?.flushPresence();
  if (walkSyncError.value || !bookReadingAvailable.value) return;
  closeWindow(false);
  localActivityReceipt.value = '';
  studyInteractionId.value = '';
  studySubjectId.value = '';
  studyAttempted.value = false;
  bookReadingPicker.value = true;
  void nextTick(() => studyDialog.value?.querySelector<HTMLSelectElement>('select')?.focus({ preventScroll: true }));
}
function openWindow(panel: WindowPanel) {
  if (panel === 'location' && !props.model.busy) {
    scene.value?.flushPresence();
    if (walkSyncError.value) return;
  }
  bedRestPicker.value = false;
  bookReadingPicker.value = false;
  studyInteractionId.value = '';
  if (activeWindow.value === panel) { closeWindow(); return; }
  releasePhone(); phoneExpanded.value = novelMode.value && panel === 'phone'; activeWindow.value = panel;
}
async function openLocationActivities() {
  await nextTick();
  const activity = shell.value?.querySelector<HTMLElement>('[data-window="location"] [data-place-activity]');
  activity?.scrollIntoView({ block: 'nearest' });
  activity?.focus({ preventScroll: true });
}
async function quickLocationService(serviceId: string) {
  if (props.model.busy) return;
  scene.value?.flushPresence();
  if (walkSyncError.value) return;
  if (serviceId === CONSTRUCTION_BACKEND_JOB_ID) {
    await nextTick();
    const listing = shell.value?.querySelector<HTMLElement>(`[data-location-service="${CONSTRUCTION_BACKEND_JOB_ID}"]`);
    listing?.scrollIntoView({ block: 'center' });
    listing?.querySelector<HTMLButtonElement>('[data-use-location-service]')?.focus({ preventScroll: true });
    return;
  }
  localActivityReceipt.value = '';
  const receipt = await completeLocationService(props.model, props.actions, serviceId);
  if (receipt) localActivityReceipt.value = receipt;
}
async function quickPackageService(serviceId: string) {
  if (props.model.busy) return;
  scene.value?.flushPresence();
  if (walkSyncError.value) return;
  localActivityReceipt.value = '';
  const receipt = await packageLocationService(props.model, props.actions, serviceId);
  if (receipt) localActivityReceipt.value = receipt;
}
async function travelAdjacent(locationId: string) {
  if (props.model.busy) return;
  scene.value?.flushPresence();
  if (walkSyncError.value || !getAdjacentLocations(props.model.state).some(place => place.id === locationId)) return;
  const quote = getNovelTravelQuote(props.model.state, locationId);
  if (quote.blockedReason) return;
  if (!await runInteraction(props.model, props.actions, { type: 'novel_travel', locationId })) return;
  walkSyncError.value = false;
  closeWindow(false);
  if (readingMode.value === 'hidden') await setReadingMode('compact');
}
function quickRoomActivity(interactionId: string) {
  // Clicking a listed activity explicitly approaches it; physical 3D interactions retain proximity checks.
  roomInteract(interactionId, true);
}
async function switchPresentationMode(mode: PresentationMode) {
  if (props.model.busy || mode === presentationMode.value) return;
  scene.value?.flushPresence();
  if (walkSyncError.value) return;
  closeWindow(false);
  bedRestPicker.value = false;
  bookReadingPicker.value = false;
  studyInteractionId.value = '';
  if (mode === 'novel') {
    sceneReadingMode = readingMode.value;
    sceneReadingPosition = {
      scroll: readingMode.value === 'hidden' ? savedReadingScroll : storyList.value?.scrollTop ?? 0,
      follows: followsLatest.value, unread: hasNewContent.value, storyId: props.model.state.story.at(-1)?.id ?? '',
    };
  }
  novelHistory.value = false;
  presentationMode.value = mode;
  savePresentationMode(mode);
  readingMode.value = mode === 'novel' ? 'compact' : sceneReadingMode;
  await nextTick();
  if (mode === 'scene') {
    savedReadingScroll = sceneReadingPosition.scroll;
    followsLatest.value = sceneReadingPosition.follows;
    hasNewContent.value = sceneReadingPosition.unread || sceneReadingPosition.storyId !== (props.model.state.story.at(-1)?.id ?? '');
    if (sceneReadingMode !== 'hidden' && storyList.value) {
      if (followsLatest.value) jumpToLatest();
      else storyList.value.scrollTop = savedReadingScroll;
    }
  }
}
function mapTravelled() {
  walkSyncError.value = false;
  if (!novelMode.value) return;
  closeWindow(false);
}
function approachNovelActivity(interactionId: string, direct = false): boolean {
  if (!novelMode.value && !direct) return true;
  const roomId = props.model.state.interior?.roomId;
  const point = currentRoom.value?.interactions.find(item => item.id === interactionId);
  if (!point || !roomId) return false;
  props.actions.dispatch({ type: 'novel_approach', interactionId });
  const saved = props.model.state.interior;
  return !props.model.notice && saved?.roomId === roomId && Math.hypot(saved.x - point.x, saved.z - point.z) < .01;
}
async function togglePhoneSize() {
  phoneExpanded.value = !phoneExpanded.value;
  await nextTick();
  if (activeWindow.value === 'phone' && requestedPhoneSlot && props.model.externalPhoneOpen) props.actions.openPhone(requestedPhoneSlot);
}
function adjustPhoneView(command: 'front' | 'back') {
  phoneSlot.value?.dispatchEvent(new CustomEvent('unread-city-phone-view', { detail: command }));
}
function sceneHome() {
  bedRestPicker.value = false;
  bookReadingPicker.value = false;
  studyInteractionId.value = '';
  closeWindow(false);
  if (readingMode.value !== 'compact') void setReadingMode('compact');
}
async function approachTransitStop() {
  if (props.model.busy) return;
  scene.value?.flushPresence();
  if (walkSyncError.value) return;
  await runInteraction(props.model, props.actions, { type: novelMode.value ? 'novel_travel' : 'travel', locationId: 'bus-stop' });
}
async function takeTransit(vehicleId: 'btr82a' | 'zbd04a', stopId: string) {
  if (props.model.busy) return;
  scene.value?.flushPresence();
  if (!props.model.state.scene && nearbyTransitStop.value) {
    const point = outdoorArrival();
    if (point) scenePresence(point);
  }
  if (walkSyncError.value) return;
  const previousReplyId = latestAssistantId();
  if (!await runInteraction(props.model, props.actions, { type: 'ride_transit', vehicleId, stopId })) return;
  const hasEventStory = latestAssistantId() !== previousReplyId;
  const destination = transitStops.find(stop => stop.id === stopId);
  const vehicle = transitVehicles.find(vehicle => vehicle.id === vehicleId);
  closeWindow(false);
  await setReadingMode(hasEventStory || novelMode.value ? 'compact' : 'hidden');
  localActivityReceipt.value = `${vehicle?.label} 前往${destination?.label}的乘车已完成 · 当前余额 ¥${props.model.state.player.balance.toFixed(2)}。已保存，后续事件见正文与状态。`;
  if (!hasEventStory) { await nextTick(); if (!unmounting) scene.value?.focus(); }
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
async function saveEncounterContact(sourcePersonId: string) {
  if (props.model.busy || !nearbyPeople.value.some(item => item.person.id === sourcePersonId)) return;
  scene.value?.flushPresence();
  if (!props.model.state.scene && !props.model.state.interior) {
    const arrival = worldScenePosition(props.model.state);
    if (arrival) scenePresence(arrival);
  }
  if (walkSyncError.value || !nearbyPeople.value.some(item => item.person.id === sourcePersonId)) return;
  if (activeWindow.value !== 'phone') openWindow('phone');
  await nextTick();
  if (unmounting || activeWindow.value !== 'phone') return;
  openEmbeddedPhone();
  await props.actions.openPhoneContactEditor?.(sourcePersonId);
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
  if (!list || readingMode.value === 'hidden' || (novelMode.value && !novelHistory.value)) return;
  savedReadingScroll = list.scrollTop;
  followsLatest.value = list.scrollHeight - list.scrollTop - list.clientHeight < 44;
  if (followsLatest.value) hasNewContent.value = false;
}
watch(() => props.model.phoneSceneJump, async target => {
  if (!target) return;
  closeWindow(false);
  novelHistory.value = false;
  await setReadingMode(novelMode.value ? 'compact' : 'expanded');
  await nextTick();
  if (novelMode.value) return; // NovelDialogue selects the requested entry.
  const list = storyList.value;
  const entry = [...(list?.querySelectorAll<HTMLElement>('[data-story-id]') ?? [])]
    .find(node => node.dataset.storyId === target.id);
  if (!list || !entry) { jumpToLatest(); return; }
  list.scrollTop += entry.getBoundingClientRect().top - list.getBoundingClientRect().top;
  savedReadingScroll = list.scrollTop;
  followsLatest.value = list.scrollHeight - list.scrollTop - list.clientHeight < 44;
  hasNewContent.value = false;
}, { flush: 'post' });
function jumpToLatest() {
  const list = storyList.value;
  if (!list || (novelMode.value && !novelHistory.value)) return;
  list.scrollTop = list.scrollHeight;
  savedReadingScroll = list.scrollTop;
  followsLatest.value = true; hasNewContent.value = false;
}
async function setReadingMode(mode: ReadingMode) {
  const scroll = readingMode.value === 'hidden' || (novelMode.value && !novelHistory.value) ? savedReadingScroll : storyList.value?.scrollTop ?? 0;
  savedReadingScroll = scroll;
  const wasFollowing = followsLatest.value;
  if (novelMode.value && mode === 'compact') novelHistory.value = false;
  readingMode.value = mode;
  await nextTick();
  if (mode === 'hidden') return;
  if (wasFollowing && !hasNewContent.value) jumpToLatest();
  else if (storyList.value) storyList.value.scrollTop = scroll;
}
async function readEarlier() {
  if (novelMode.value) novelHistory.value = true;
  readingMode.value = 'expanded';
  await nextTick();
  if (storyList.value) storyList.value.scrollTop = 0;
  onStoryScroll();
}
watch(() => props.model.state.story.at(-1)?.id, async () => {
  historyPortrait.value = false;
  const follow = followsLatest.value && readingMode.value !== 'hidden' && (!novelMode.value || novelHistory.value);
  await nextTick();
  if (unmounting) return;
  if (follow) jumpToLatest(); else hasNewContent.value = true;
});
let interactionStoryId = '';
let interactionGenerated = false;
watch(() => props.model.interaction?.phase, async (phase, previous) => {
  if (phase && !previous) {
    interactionStoryId = props.model.state.story.at(-1)?.id ?? '';
    interactionGenerated = false;
  }
  if (phase === 'generating') interactionGenerated = true;
  if (phase || !previous) return;
  const latest = props.model.state.story.at(-1);
  const hasSavedEvent = interactionGenerated && latest?.role === 'assistant' && latest.id !== interactionStoryId;
  interactionStoryId = ''; interactionGenerated = false;
  if (!hasSavedEvent || unmounting) return;
  closeWindow(false);
  bedRestPicker.value = false;
  bookReadingPicker.value = false;
  studyInteractionId.value = '';
  novelHistory.value = false;
  followsLatest.value = true;
  await setReadingMode('compact');
  if (!unmounting) jumpToLatest();
});
async function sendText(text: string) {
  if (props.model.busy || !text.trim() || text.length > 2000) return;
  composerError.value = '';
  if (novelMode.value) { novelHistory.value = false; await setReadingMode('compact'); }
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
async function sceneHotspot(action: 'phone' | 'map' | 'observe' | 'rest' | 'schedule') {
  if (props.model.busy) return;
  if (action === 'phone' || action === 'map' || action === 'schedule') openWindow(action);
  else if (action === 'observe') void prepareAction('观察一下周围的环境。');
  else {
    scene.value?.flushPresence();
    if (walkSyncError.value) return;
    localActivityReceipt.value = '';
    const playerBefore = { ...props.model.state.player };
    const started = clockMinutes();
    if (await runInteraction(props.model, props.actions, { type: 'wait', minutes: 15 })) showLocalActivity('长椅休息', clockMinutes() - started, playerBefore);
  }
}
function clockMinutes() { const clock = props.model.state.clock; return clock.day * 1440 + clock.hour * 60 + clock.minute; }
function latestAssistantId() { return props.model.state.story.filter(entry => entry.role === 'assistant').at(-1)?.id ?? ''; }
function showLocalActivity(label: string, minutes: number, before: PlayerState) {
  const after = props.model.state.player;
  const delta = Number((after.energy - before.energy).toFixed(2));
  const changes = (['morale', 'stress', 'health'] as const).filter(key => after[key] !== before[key]).map(key => {
    const value = after[key] - before[key];
    return `${{ morale: '精神', stress: '压力', health: '健康' }[key]} ${value > 0 ? '+' : '−'}${Math.abs(value)}`;
  });
  localActivityReceipt.value = `${label}完成 · 耗时 ${minutes} 分钟 · ${civilDateLabel.value} ${time.value} · 精力 ${after.energy}（${delta > 0 ? `恢复 ${delta}` : delta < 0 ? `消耗 ${-delta}` : '未变化'}）${changes.length ? ` · ${changes.join(' · ')}` : ''}`;
}
function activityImpact(kind: 'study' | 'rest' | 'desk' | 'bookshelf', minMinutes: number, maxMinutes: number) {
  const low = getActivityEffects(kind, minMinutes), high = getActivityEffects(kind, maxMinutes);
  return (['morale', 'stress', 'health'] as const).filter(key => low[key] || high[key]).map(key => {
    const min = Math.abs(low[key]), max = Math.abs(high[key]);
    return `${{ morale: '精神', stress: '压力', health: '健康' }[key]} ${high[key] > 0 ? '+' : '−'}${min === max ? min : `${min}–${max}`}`;
  }).join(' · ');
}
function scenePresence(position: { x: number; z: number; yaw: number }) {
  if (props.model.busy || props.model.switchingProtagonist) return;
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
  const previousReplyId = latestAssistantId();
  if (!await runInteraction(props.model, props.actions, { type: 'enter_interior', roomId })) return;
  const hasEventStory = latestAssistantId() !== previousReplyId;
  walkSyncError.value = false;
  closeWindow(false);
  await setReadingMode(hasEventStory || novelMode.value ? 'compact' : 'hidden');
  if (!hasEventStory) { await nextTick(); if (!unmounting) scene.value?.focus(); }
}
async function leaveInterior() {
  if (props.model.busy) return;
  scene.value?.flushPresence();
  const previousReplyId = latestAssistantId();
  if (!await runInteraction(props.model, props.actions, { type: 'leave_interior' })) return;
  walkSyncError.value = false;
  if (latestAssistantId() !== previousReplyId) await setReadingMode('compact');
  else { await nextTick(); if (!unmounting) scene.value?.focus(); }
}
async function roomInteract(interactionId: string, direct = false) {
  if (props.model.busy || !props.model.state.academics) return;
  scene.value?.flushPresence();
  if (walkSyncError.value) return;
  const interaction = currentRoom.value?.interactions.find(item => item.id === interactionId);
  if (!interaction) return;
  if (!approachNovelActivity(interactionId, direct)) return;
  if (direct) closeWindow(false);
  if (interactionId === 'livehouse-create-band' || interactionId === 'livehouse-booking') {
    livehouseMode.value = interactionId === 'livehouse-create-band' ? 'register' : 'book';
    return;
  }
  if (interactionId === 'dorm-rest') {
    localActivityReceipt.value = '';
    bedRestPicker.value = true;
    void nextTick(() => bedRestDialog.value?.querySelector<HTMLButtonElement>('[data-rest-option]')?.focus({ preventScroll: true }));
    return;
  }
  if (isStudyInteraction(interactionId)) {
    localActivityReceipt.value = '';
    bookReadingPicker.value = false;
    studySubjectId.value = '';
    studyAttempted.value = false;
    studyInteractionId.value = interactionId;
    void nextTick(() => studyDialog.value?.querySelector<HTMLSelectElement>('select')?.focus({ preventScroll: true }));
    return;
  }
  localActivityReceipt.value = '';
  const playerBefore = { ...props.model.state.player };
  const started = clockMinutes();
  if (!await runInteraction(props.model, props.actions, { type: 'interior_interact', interactionId })) return;
  if (interaction.minutes > 0) {
    showLocalActivity(interaction.label, clockMinutes() - started, playerBefore);
    return;
  }
  localActivityReceipt.value = `${interaction.result} · 已保存，后续事件见正文与状态。`;
}
function closeBedRestPicker() {
  dismissBedRestPicker(true);
}
function dismissBedRestPicker(restoreFocus: boolean) {
  bedRestPicker.value = false;
  if (restoreFocus) void nextTick(() => { if (!unmounting) scene.value?.focus(); });
}
async function chooseBedRest(optionId: string) {
  if (!bedRestPicker.value || props.model.busy) return;
  const option = bedRestOptions.find(item => item.id === optionId);
  if (!option) return;
  const playerBefore = { ...props.model.state.player };
  const started = clockMinutes();
  const previousReplyId = latestAssistantId();
  if (!await runInteraction(props.model, props.actions, { type: 'interior_rest', optionId })) return;
  showLocalActivity(option.label, clockMinutes() - started, playerBefore);
  dismissBedRestPicker(latestAssistantId() === previousReplyId);
}
function closeStudyPicker() {
  dismissStudyPicker(true);
}
function dismissStudyPicker(restoreFocus: boolean) {
  studyInteractionId.value = '';
  bookReadingPicker.value = false;
  studySubjectId.value = '';
  if (restoreFocus) void nextTick(() => { if (!unmounting) scene.value?.focus(); });
}
async function chooseStudy(optionId: string) {
  if (!studyPickerOpen.value || props.model.busy || !academicProgress.value) return;
  const option = studyDurationOptions.find(item => item.id === optionId);
  const quote = studyQuotes.value.find(item => item.option.id === optionId)?.quote;
  if (!option || !quote || quote.blockedReason) return;
  const interaction = studyInteraction.value;
  const playerBefore = { ...props.model.state.player };
  const started = clockMinutes();
  const previousReplyId = latestAssistantId();
  studyAttempted.value = true;
  const subjectId = studySubjectId.value;
  const success = bookReadingPicker.value
    ? await runInteraction(props.model, props.actions, { type: 'read_subject', subjectId, optionId })
    : interaction ? await runInteraction(props.model, props.actions, { type: 'interior_study', interactionId: interaction.id, optionId, subjectId }) : false;
  if (!success) return;
  const gain = props.model.state.academics?.lastGain;
  showLocalActivity(`${interaction?.label ?? '书店阅读'} · ${option.label}`, clockMinutes() - started, playerBefore);
  if (gain?.subjectId === subjectId) localActivityReceipt.value += ` · ${getAcademicSubjectById(subjectId)?.name} +${gain.points} 学习点（累计 ${gain.totalPoints}） · ${studyOutcome(gain.outcome)}`;
  localActivityReceipt.value += '。已保存，后续事件见正文与状态。';
  dismissStudyPicker(latestAssistantId() === previousReplyId);
}
function durationPickerKeydown(event: KeyboardEvent) {
  if (event.key !== 'Tab') return;
  const buttons = Array.from((event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled)'));
  if (!buttons.length) return;
  const first = buttons[0], last = buttons[buttons.length - 1];
  if (event.shiftKey && event.target === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && event.target === last) { event.preventDefault(); first.focus(); }
}
watch([() => props.model.state.locationId, () => currentProtagonist.value], () => { livehouseMode.value = null; bedRestPicker.value = false; bookReadingPicker.value = false; studyInteractionId.value = ''; studySubjectId.value = ''; localActivityReceipt.value = ''; });
function sceneEncounter(personId: string) {
  if (props.model.busy) return;
  scene.value?.flushPresence();
  if (!props.model.state.scene && !props.model.state.interior) {
    const arrival = worldScenePosition(props.model.state);
    if (arrival) scenePresence(arrival);
  }
  if (walkSyncError.value) return;
  const person = scenePeople.value.find(item => item.id === personId);
  if (!person) return;
  props.actions.dispatch({ type: 'encounter', personId });
  if (props.model.state.scene?.encounterId !== personId) return;
  historyPortrait.value = false;
  void prepareAction(`我向${personLabel(person)}打招呼，想和对方聊几句。请根据我们眼下所在的地方继续当面的对话，不要替我决定下一句话。`);
}
function dismissOverlay() {
  if (pendingCourtSwitch.value) { pendingCourtSwitch.value=null; return true; }
  if (switchingLease.value) { void switchOverlay.value?.skip(); return true; }
  if (props.model.interaction) { props.actions.cancelInteraction?.(); return true; }
  if (studyPickerOpen.value) { closeStudyPicker(); return true; }
  if (livehouseMode.value) { livehouseMode.value = null; return true; }
  if (bedRestPicker.value) { closeBedRestPicker(); return true; }
  if (activeWindow.value) { closeWindow(); return true; }
  if (novelMode.value && novelHistory.value) { novelHistory.value = false; void setReadingMode('compact'); return true; }
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
  drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left - base.left, top: rect.top - base.top, width: rect.width, height: rect.height, element };
  handle.setPointerCapture(event.pointerId); event.preventDefault();
}
function moveWindow(event: PointerEvent) {
  if (!drag || event.pointerId !== drag.id || !shell.value) return;
  // Keep the persistent tool rail clear even when the phone surface is hosted
  // outside this shadow root and therefore paints above the Shell.
  const rightInset = shell.value.clientWidth > 760 ? 112 : 10;
  const left = Math.min(Math.max(10, drag.left + event.clientX - drag.x), Math.max(10, shell.value.clientWidth - drag.width - rightInset));
  const top = Math.min(Math.max(70, drag.top + event.clientY - drag.y), Math.max(70, shell.value.clientHeight - drag.height - 20));
  layoutLease?.place(drag.element, { left, top, width: drag.width, height: drag.height });
}
function endWindowDrag() {
  if (drag) layoutLease?.save(drag.element);
  drag = undefined;
}
onMounted(async () => {
  props.actions.setDismissHandler?.(dismissOverlay);
  if (shell.value) layoutLease = bindShellLayout(shell.value, () => {
    if (requestedPhoneSlot && props.model.externalPhoneOpen) {
      void nextTick(() => {
        if (requestedPhoneSlot?.isConnected && props.model.externalPhoneOpen) props.actions.openPhone(requestedPhoneSlot);
      });
    }
  });
  await nextTick(); jumpToLatest();
});
onBeforeUnmount(() => {
  switchingLease.value?.release();
  unmounting = true; phoneMountRevision++;
  props.actions.setDismissHandler?.(undefined);
  layoutLease?.dispose(); layoutLease = undefined;
  releasePhone();
});
</script>

<template>
  <div ref="shell" class="uc-shell" :data-presentation-mode="presentationMode" :data-reading-mode="readingMode" :data-active-window="activeWindow ?? ''" :data-phone-expanded="phoneExpanded" :data-rest-picker="bedRestPicker || studyPickerOpen" :data-phone-link-status="model.phoneLinkStatus" :data-current-protagonist="currentProtagonist">
    <div v-if="pendingCourtSwitch" class="court-switch-mask" data-court-switch-warning role="alertdialog" aria-modal="true" aria-label="重大事件">
      <section class="court-switch-dialog">
        <h2>当前正在进行重大事件，是否继续？</h2>
        <p v-if="model.state.courtroom?.active?.owner==='emma' && model.state.courtroom.active.source==='commission'">庭审尚未结束。确认切换后，橘雪莉将依据已核实的案卷继续完成委托；艾玛此次职业报酬为零。</p>
        <p v-else>庭审尚未结束。确认切换后，本次参与将中止，尚未裁决的争议不会自动判定胜负；已支付的费用不退还。</p>
        <div class="court-switch-actions">
          <button type="button" data-court-switch-cancel @click="pendingCourtSwitch=null">取消切换</button>
          <button type="button" data-court-switch-confirm @click="confirmCourtSwitch">继续切换</button>
        </div>
      </section>
    </div>
    <div :inert="!model.state.academics || !!model.interaction || !!switchingLease || !!pendingCourtSwitch" :aria-hidden="!model.state.academics || !!model.interaction || !!switchingLease || !!pendingCourtSwitch || undefined" style="display: contents">
    <NovelBackdrop v-if="novelMode" :location-id="model.state.locationId" :hour="model.state.clock.hour" :scene="model.state.scene" />
    <NovelNpcPortrait v-if="novelMode || encounterPerson" :portrait-id="npcPortraitId" :speaker="portraitLabel" :emotion="portraitEmotion" :dimmed="portraitDimmed" :active="portraitActive" :location-id="model.state.locationId" />
    <SoyoLive2D v-if="novelMode" :emotion="portraitEmotion" :speaker="portraitLabel" :dimmed="portraitDimmed" :active="!activeWindow && readingMode !== 'expanded'" />
    <InteriorScene :key="currentProtagonist" :protagonist="currentProtagonist" v-else-if="model.state.interior" ref="scene" :interior="model.state.interior" :stress="model.state.player.stress" :busy="model.busy || !!switchingLease" :hour="model.state.clock.hour" :phone-active="activeWindow === 'phone'" :free-walk="readingMode === 'hidden' && !activeWindow" :paused="scenePaused || bedRestPicker || !!studyInteractionId" @presence="scenePresence" @interact="roomInteract" @leave="leaveInterior" />
    <InteractiveScene :key="currentProtagonist" :protagonist="currentProtagonist" v-else ref="scene" :location-id="model.state.locationId" :presence="model.state.scene" :air-traffic="model.state.airTraffic" :people="scenePeople" :busy="model.busy || !!switchingLease" :hour="model.state.clock.hour" :phone-active="activeWindow === 'phone'" :free-walk="readingMode === 'hidden' && !activeWindow" :paused="scenePaused" @hotspot="sceneHotspot" @presence="scenePresence" @encounter="sceneEncounter" />
    <ProtagonistPhonePose v-if="novelMode && activeWindow === 'phone'" :protagonist="currentProtagonist" :location-id="model.state.locationId" />
    <div class="world-vignette" :class="{ 'reading-shade': readingMode === 'expanded' && activeWindow !== 'phone' }" aria-hidden="true"></div>
    <header class="world-chrome"><div class="world-heading"><button class="wordmark" aria-label="场景" @click="sceneHome">未读之城<span>一段正在发生的日常</span></button><div class="topbar-world"><span>{{ currentLocation.name }}</span><span class="chrome-dot">·</span><span>{{ civilDateLabel }}</span><time>{{ time }}</time></div></div><div class="host-actions"><button class="layout-mode-button" :aria-label="layoutEditing ? '完成界面布局编辑' : '编辑界面布局'" :aria-pressed="layoutEditing" @click="toggleLayoutEditing">{{ layoutEditing ? '完成' : '布局' }}</button><button v-if="layoutEditing" class="layout-reset-button" aria-label="重置界面布局" @click="resetLayout">重置</button><button aria-label="切换聊天并恢复原生界面" @click="actions.switchChat()">切换聊天</button></div></header>
    <p v-if="model.notice" class="notice" role="status">{{ model.notice }}</p>
    <nav v-if="!activeWindow" class="presentation-switch" aria-label="游玩模式"><button :aria-pressed="!novelMode" :disabled="model.busy" @click="switchPresentationMode('scene')">3D 漫游</button><button :aria-pressed="novelMode" :disabled="model.busy" @click="switchPresentationMode('novel')">纯小说</button><select aria-label="切换主角" data-protagonist-select :value="currentProtagonist" :disabled="!!model.interaction || !!switchingLease" @change="selectProtagonist"><option v-for="(name, id) in protagonistNames" :key="id" :value="id">{{ name }}</option></select></nav>
    <aside v-if="encounterPerson && !activeWindow && readingMode === 'compact'" class="encounter-caption" data-current-encounter :data-person-id="encounterPerson.id"><div><strong>{{ personLabel(encounterPerson) }}</strong><small>{{ encounterPerson.protagonistId ? '主角 · 正在当面交流' : encounterPerson.contactId ? '主要人物 · 已存入当前聊天' : '正在当面交流 · 尚未确认姓名' }}</small></div><button v-if="!encounterPerson.protagonistId" :disabled="model.busy" data-encounter-contact @click="saveEncounterContact(encounterPerson.id)">{{ encounterPerson.contactId ? '手机档案' : '手机建档' }} ↗</button></aside>
    <button v-if="model.state.locationId==='court-hearing' && !activeWindow" type="button"
      class="court-case-launcher" data-court-case-open @click="openWindow('law')">庭审案卷</button>
    <button v-if="!novelMode && readingMode === 'compact' && !activeWindow" class="walk-launcher" aria-label="自由行走" @click="startWalking"><span aria-hidden="true">↟</span> 自由行走</button>
    <button v-if="!novelMode && nearbyEntrance && !activeWindow && readingMode === 'hidden'" class="campus-entrance" :disabled="model.busy" :aria-label="`进入${nearbyEntrance.label}`" @click="enterInterior(nearbyEntrance.id)"><span aria-hidden="true">⌂</span><span>进入{{ nearbyEntrance.label }}<small>室内探索 · 可随时返回</small></span><span aria-hidden="true">↗</span></button>
    <button v-if="!novelMode && nearbyTransitStop && !activeWindow && readingMode === 'hidden'" class="campus-entrance" data-transit-entry aria-label="公交乘车" :disabled="model.busy" @click="openWindow('transit')"><span aria-hidden="true">▣</span><span>公交乘车<small>{{ nearbyTransitStop.label }} · BTR-82A / ZBD-04A</small></span><span aria-hidden="true">↗</span></button>
    <button v-if="!novelMode && storeAvailable && !activeWindow && readingMode === 'hidden'" class="campus-entrance" data-store-entry aria-label="逛便利店" :disabled="model.busy" @click="openStore"><span aria-hidden="true">▤</span><span>逛便利店<small>选购食物、饮品与日用品</small></span><span aria-hidden="true">↗</span></button>
    <button v-if="!novelMode && bookReadingAvailable && !activeWindow && readingMode === 'hidden'" class="campus-entrance" data-book-reading-entry :disabled="model.busy" @click="openBookReading"><span aria-hidden="true">▤</span><span>选书阅读<small>本专业巩固 · 跨专业探索</small></span><span aria-hidden="true">↗</span></button>
    <p v-if="localActivityReceipt && readingMode === 'hidden' && !activeWindow && !bedRestPicker && !studyPickerOpen" class="bed-rest-receipt" data-bed-rest-receipt data-local-activity-receipt role="status">{{ localActivityReceipt }}<small>已保存，无需发送对话。</small></p>
    <LivehousePanel v-if="livehouseMode" :key="currentProtagonist" :model="model" :actions="actions" :mode="livehouseMode" @close="livehouseMode = null" />
    <div v-if="bedRestPicker" class="bed-rest-overlay" @click.self="closeBedRestPicker">
      <section ref="bedRestDialog" class="bed-rest-dialog" role="dialog" aria-modal="true" aria-label="选择休息时长" data-bed-rest-picker @keydown="durationPickerKeydown">
        <header><small>学生宿舍 · 床铺</small><h2>选择休息时长</h2><p>休息恢复精力与精神，并缓解压力。</p></header>
        <div class="bed-rest-options"><button v-for="option in bedRestOptions" :key="option.id" :data-rest-option="option.id" :disabled="model.busy" @click="chooseBedRest(option.id)"><strong>{{ option.label }}</strong><span>{{ option.minMinutes < 60 ? `${option.minMinutes}–${option.maxMinutes} 分钟` : `${option.minMinutes / 60}–${option.maxMinutes / 60} 小时` }}</span><small>{{ option.energyDelta === 100 ? '精力恢复至 100' : `恢复至多 ${Math.floor(option.minMinutes * 0.4)}–${Math.floor(option.maxMinutes * 0.4)} 点精力` }}</small><small>{{ activityImpact('rest', option.minMinutes, option.maxMinutes) }}</small></button></div>
        <p class="bed-rest-note">程序在区间内随机确定时长，只结算一次。实际变化受状态上下限影响；长休可能进入第二天。取消不会改变进度。</p>
        <button class="bed-rest-cancel" @click="closeBedRestPicker">取消</button>
      </section>
    </div>
    <div v-if="studyPickerOpen" class="bed-rest-overlay academic-study-overlay" @click.self="closeStudyPicker">
      <section ref="studyDialog" class="bed-rest-dialog academic-study-dialog" role="dialog" aria-modal="true" aria-label="选择学习科目与时长" data-study-picker @keydown="durationPickerKeydown">
        <header><small>{{ bookReadingPicker ? '街角书店 · 选书阅读' : `${currentRoom?.label} · ${studyInteraction?.label}` }}</small><h2>选择这次学习的科目</h2></header>
        <label class="study-subject-label" for="academic-study-subject">学习科目</label>
        <select id="academic-study-subject" v-model="studySubjectId" data-study-subject :disabled="model.busy"><option disabled value="">请选择科目</option><optgroup v-for="major in studySubjectGroups" :key="major.id" :label="`${major.name}${major.id === academicOverview?.major.id ? ' · 本专业' : ' · 跨专业'}`"><option v-for="subject in major.subjects" :key="subject.id" :value="subject.id">{{ subject.name }}</option></optgroup></select>
        <p v-if="academicProgress" data-study-goal>当前目标：{{ academicProgress.goal }}<br>{{ academicProgress.stageLabel }} · 已积累 {{ academicProgress.points }} 学习点<template v-if="academicProgress.nextTarget !== null">，下一目标 {{ academicProgress.nextTarget }} 点</template></p>
        <details v-if="academicProgress && !academicProgress.isMajorSubject" class="study-cross-outcomes" data-cross-outcomes open><summary>跨专业阅读 · 可能的收获与代价</summary><p>以下变化叠加在常规学习的精力、精神和压力消耗上。</p><p v-for="outcome in studyQuotes[0].quote.outcomes" :key="outcome.id">{{ outcome.probability * 100 }}% {{ outcome.label }}：学习点 ×{{ outcome.pointsMultiplier }}<template v-if="outcome.extraEnergy">，额外精力 −{{ outcome.extraEnergy }}</template><template v-if="outcome.morale">，精神 {{ outcome.morale > 0 ? '+' : '−' }}{{ Math.abs(outcome.morale) }}</template><template v-if="outcome.stress">，压力 {{ outcome.stress > 0 ? '+' : '−' }}{{ Math.abs(outcome.stress) }}</template></p></details>
        <p v-else-if="academicProgress">本专业按实际学习分钟积累学习点，各科独立提升。</p>
        <div class="bed-rest-options"><button v-for="{ option, quote } in studyQuotes" :key="option.id" :data-study-option="option.id" :disabled="model.busy || !!quote.blockedReason" @click="chooseStudy(option.id)"><strong>{{ option.label }}</strong><span>{{ option.minMinutes < 60 ? `${option.minMinutes}–${option.maxMinutes} 分钟` : `${option.minMinutes / 60}–${option.maxMinutes / 60} 小时` }}</span><small>常规精力消耗 {{ getStudyEnergyCost(option.minMinutes) }}–{{ getStudyEnergyCost(option.maxMinutes) }} 点<template v-if="quote.isCrossMajor">，困惑时额外消耗 3 点</template></small><small>学科提升 +{{ option.minMinutes * (quote.isCrossMajor ? .5 : 1) }}–{{ option.maxMinutes * (quote.isCrossMajor ? 1.5 : 1) }} 点</small><small>{{ activityImpact('study', option.minMinutes, option.maxMinutes) }}</small><small v-if="quote.blockedReason">{{ quote.blockedReason }}</small></button></div>
        <p class="bed-rest-note">确认时一次抽取时长与跨科结果，保存后不重抽。精力须足够完成本档最长时间和可能的额外消耗；实际变化受状态上下限影响。取消不消耗。</p>
        <p v-if="studyAttempted && model.notice" class="academic-setup-error" data-study-error role="alert">{{ model.notice }}<span>学习结果尚未保存，已保留科目选择，可重试。</span></p>
        <button class="bed-rest-cancel" @click="closeStudyPicker">取消</button>
      </section>
    </div>
    <nav class="tool-dock" aria-label="世界面板"><button v-for="item in nav" :key="item.id" :class="{ 'phone-launcher': item.id === 'phone' }" :data-location-entry="item.id === 'location' ? '' : undefined" :data-inventory-entry="item.id === 'inventory' ? '' : undefined" :aria-label="item.title" :aria-pressed="activeWindow === item.id" :title="item.id === 'phone' ? (unread ? `${unread} 条未读消息，点击打开手机` : activeWindow === 'phone' ? '收起手机' : '打开手机，阅读时也可使用') : item.id === 'location' ? '查看此地服务与开放时间' : item.id === 'inventory' ? '打开随身背包，使用或查看携带物品' : undefined" @click="openWindow(item.id)"><span class="tool-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path :d="item.path" /></svg><span v-if="item.id === 'phone' && unread" class="phone-unread-badge" :data-phone-unread="unread">{{ unread > 99 ? '99+' : unread }}</span></span><span class="tool-label">{{ item.title }}<small v-if="item.id === 'phone'">{{ unread ? '有未读' : activeWindow === 'phone' ? '已打开' : '常驻' }}</small></span></button></nav>
    <span class="sr-only" role="status" aria-live="polite">{{ unread ? `手机有 ${unread} 条未读消息` : '手机没有未读消息' }}</span>
    <section v-show="readingMode !== 'hidden'" class="reading-layer" data-reading-layer aria-label="小说正文" :class="{ 'reading-expanded': readingMode === 'expanded' }">
      <button type="button" class="reading-resize-grip" data-layout-handle="reading-height" aria-label="上下拖动调整正文高度" title="拖动改变正文高度"><span aria-hidden="true"></span></button>
      <header class="reading-heading"><div v-if="encounterPerson && readingMode === 'expanded'" class="encounter-caption encounter-caption-inline" data-current-encounter :data-person-id="encounterPerson.id"><div><strong>{{ personLabel(encounterPerson) }}</strong><small>{{ encounterPerson.protagonistId ? '主角 · 正在当面交流' : encounterPerson.contactId ? '主要人物 · 已存入当前聊天' : '正在当面交流 · 尚未确认姓名' }}</small></div><button v-if="!encounterPerson.protagonistId" :disabled="model.busy" data-encounter-contact @click="saveEncounterContact(encounterPerson.id)">{{ encounterPerson.contactId ? '手机档案' : '手机建档' }} ↗</button></div><div v-else><span class="reading-caption">{{ model.busy ? '故事正在继续…' : '此刻的故事' }}</span><small v-if="model.mode === 'demo'">本地演示</small></div><div class="reading-actions"><button v-if="novelMode && novelHistory" @click="novelHistory = false; setReadingMode('compact')">逐句阅读</button><button v-if="!novelMode" @click="readEarlier">往前读</button><button v-if="!novelMode" :aria-label="readingMode === 'expanded' ? '缩小正文' : '展开正文'" @click="setReadingMode(readingMode === 'expanded' ? 'compact' : 'expanded')">{{ readingMode === 'expanded' ? (novelMode ? '显示背景' : '回到场景') : '专注阅读' }}</button><button v-if="!novelMode" aria-label="收起正文" @click="setReadingMode('hidden')">收起</button></div></header>
      <p v-if="lastRoomActivity" class="room-activity-receipt" data-room-activity-receipt role="status">{{ localActivityReceipt || persistedRoomReceipt }} <span>{{ lastWasTimedActivity ? '已完成活动，无需发送对话。' : '已记入状态，可继续故事。' }}</span></p>
      <p v-else-if="localActivityReceipt || persistedBookReceipt" class="room-activity-receipt" data-local-activity-receipt role="status">{{ localActivityReceipt || persistedBookReceipt }} <span>已保存，无需发送对话。</span></p>

      <section v-if="novelMode && !novelHistory && meetingPrompt" class="novel-appointment-prompt" :data-meeting-invite="meetingPrompt.id" aria-label="今日约定">
        <p>和{{ meetingPrompt.targetName }}约在{{ meetingPrompt.day === model.state.clock.day ? '今天' : '第'+meetingPrompt.day+'天' }} {{ meetingPrompt.time }}，地点是{{ getCampusInterior(meetingPrompt.locationId)?.label ?? locations.find(place => place.id === meetingPrompt.locationId)?.name ?? '约定地点' }}。</p>
        <div><button type="button" :disabled="model.busy" @click="travelToMeeting(meetingPrompt)">前往约定地点</button>
        <button type="button" :disabled="model.busy" @click="hideMeetingPrompt(meetingPrompt.id)">稍后再说</button></div>
      </section>
      <NovelDialogue v-show="novelMode && !novelHistory" :protagonist="protagonistNames[currentProtagonist]" :recognizes-speaker="recognizesNovelSpeaker" :focus-target="model.phoneSceneJump" @focus="heldPortrait = $event" :active="novelMode && !novelHistory" :entries="model.state.story" :busy="model.busy" @segment="novelSegment = $event" @history="readEarlier" @switch-side="switchToOtherSide" />
      <div v-show="!novelMode || novelHistory" ref="storyList" class="story-list" role="log" :aria-live="followsLatest ? 'polite' : 'off'" aria-label="故事记录" :aria-busy="model.busy" @scroll="onStoryScroll"><article v-for="entry in storyEntries" :key="entry.id" class="story-entry" :class="{ 'story-user': entry.role === 'user' }" :data-story-id="entry.id"><StoryEntryContent :text="entry.text" :role="entry.role" :protagonist="protagonistNames[currentProtagonist]"
  :other-side-beats="entry.otherSideBeats" :return-story="entry.returnStory"
  @segment="readDialogueSegment" @switch-side="switchToOtherSide" /></article><p v-if="!storyEntries.length" class="empty-story">{{ currentLocation.description }} 你想从什么开始？</p></div>
      <button v-if="hasNewContent && (!novelMode || novelHistory)" class="new-content" @click="jumpToLatest">有新内容 <span aria-hidden="true">↓</span></button>
      <form class="composer" @submit.prevent="submit"><label class="sr-only" for="uc-action-input">接下来，你想做什么？</label><textarea id="uc-action-input" ref="composer" v-model="draft" aria-label="接下来，你想做什么？" rows="1" maxlength="2000" placeholder="写下你的行动，或说一句想说的话……" @keydown.ctrl.enter.prevent="submit"></textarea><button type="submit" :disabled="model.busy || !draft.trim()">{{ model.busy ? '叙事中…' : '继续故事' }} <span aria-hidden="true">↗</span></button></form>
      <p v-if="composerError" class="composer-error" role="alert">{{ composerError }}</p>
    </section>
    <button v-if="readingMode === 'hidden'" class="resume-reading" aria-label="继续阅读" @click="setReadingMode('compact')">继续阅读 <span v-if="hasNewContent" class="resume-dot">有新内容</span><span aria-hidden="true">↑</span></button>
    <section v-if="activeWindow" :key="activeWindow" class="floating-window" :class="{ 'phone-window': activeWindow === 'phone' }" :data-window="activeWindow" role="dialog" :aria-label="windowTitle + '窗口'">
      <div v-if="activeWindow === 'phone'" class="phone-controls" aria-label="手机显示操作"><button type="button" class="phone-size-toggle" :aria-label="phoneExpanded ? (novelMode ? '缩小手机' : '人物同框') : '放大手机'" :title="phoneExpanded ? (novelMode ? '缩小手机' : '人物同框') : '放大手机'" :aria-expanded="phoneExpanded" @click="togglePhoneSize"><svg viewBox="0 0 24 24" aria-hidden="true"><path :d="phoneExpanded ? 'M3 8h5V3M21 8h-5V3M3 16h5v5M21 16h-5v5' : 'M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5'" /></svg></button><button type="button" aria-label="查看手机背面" title="查看背面；长按拖动旋转，双指缩放" @click="adjustPhoneView('back')"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="2" width="12" height="20" rx="3"/><circle cx="10" cy="6" r="1"/><circle cx="10" cy="10" r="1"/></svg></button><button type="button" aria-label="手机回正" title="回到正面并恢复大小" @click="adjustPhoneView('front')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10a8 8 0 1 1 1 7M4 4v6h6"/></svg></button><button type="button" aria-label="关闭手机窗口" title="收起手机" @click="closeWindow()"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button></div>
      <header v-else class="window-heading" @pointerdown="startWindowDrag" @pointermove="moveWindow" @pointerup="endWindowDrag" @pointercancel="endWindowDrag"><h1>{{ windowTitle }}</h1><span v-if="activeWindow!=='law'" class="window-demo">演示内容</span><button v-if="activeWindow === 'map'" class="window-transit" data-transit-open @click="openWindow('transit')">公交线路 ↗</button><button :aria-label="'关闭' + windowTitle + '窗口'" @click="closeWindow()"><span aria-hidden="true">×</span></button></header>
      <template v-if="embeddedPhone"><div v-if="model.phoneLinkStatus === 'error'" class="phone-sync-error" role="status"><p>{{ model.phoneLinkError }}</p><button @click="actions.retryPhoneSync()">重试同步</button></div><div ref="phoneSlot" class="phone-slot" data-unread-city-phone-slot :data-phone-status="model.phoneStatus" aria-label="手机应用区域" :aria-busy="model.phoneStatus === 'loading'"><div v-if="!model.externalPhoneOpen" class="phone-waiting" :class="{ 'phone-load-error': model.phoneStatus === 'error' }" :role="model.phoneStatus === 'error' ? 'alert' : 'status'"><span class="phone-loading-icon" aria-hidden="true">▯</span><strong>{{ model.phoneStatus === 'error' ? '手机暂未打开' : '正在打开你的手机…' }}</strong><p>{{ model.phoneStatus === 'error' ? (model.phoneError || '手机加载未完成，请重试。') : '手机会在这里显示，你也可以先收起窗口继续阅读。' }}</p><button v-if="model.phoneStatus === 'error'" @click="openEmbeddedPhone">重试加载手机</button></div></div></template>
      <div v-else-if="activeWindow === 'transit'" class="window-content"><TransitPanel :model="model" :stop="nearbyTransitStop" :novel-mode="novelMode" @ride="takeTransit" @approach="approachTransitStop" /></div>
      <div v-else-if="activeWindow === 'law'" class="window-content"><LawCareerPanel :model="model" :actions="actions" @close="closeWindow(false)" /></div>
      <div v-else-if="activeWindow === 'store'" class="window-content"><ConvenienceStore :model="model" :actions="actions" /></div>
      <div v-else-if="activeWindow === 'inventory'" class="window-content"><InventoryPanel :model="model" :actions="actions" /></div>
      <div v-else-if="activeWindow === 'location'" class="window-content"><PlaceActions :model="model" catalog @law="openWindow('law')" @travel="travelAdjacent" @service="quickLocationService" @package="quickPackageService" @activity="quickRoomActivity" @store="openStore" @books="openBookReading" @map="openWindow('map')" /><section class="nearby-people" data-nearby-people><h2>身边的人</h2><p v-if="!nearbyPeople.length">身边暂时没有可以搭话的人，换个地方走走吧。</p><div v-for="{person, distance} in nearbyPeople" :key="person.id"><span><strong>{{ personLabel(person) }}</strong><small>{{ Math.round(distance * 10) / 10 }} 米 · {{ person.contactId ? person.description : person.identity }}</small></span><button :disabled="model.busy" :data-talk-person="person.id" @click="sceneEncounter(person.id)">交流</button><button v-if="!person.protagonistId" :disabled="model.busy" :data-save-person="person.id" @click="saveEncounterContact(person.id)">{{ person.contactId ? '档案' : '建档' }}</button></div></section><p v-if="localActivityReceipt" class="location-service-receipt" role="status" data-quick-service-receipt>{{ localActivityReceipt }}</p><LocationServices :model="model" :actions="actions" :novel-mode="novelMode" @law="openWindow('law')" @map="openWindow('map')" @store="openStore" @books="openBookReading" @activities="openLocationActivities" /></div>
      <div v-else class="window-content"><WorldPanels :panel="activeWindow" :model="model" :actions="actions" :novel-mode="novelMode" @travelled="mapTravelled" @compose="name => prepareAction(`给${name}发消息：`)" @invite="name => prepareAction(`邀请${name}：`)" @transit="openWindow('transit')" @store="openStore" @inventory="openWindow('inventory')" @phone="openWindow('phone')" /></div>
    </section>
    </div>
    <ProtagonistSwitchOverlay v-if="switchingLease" ref="switchOverlay" :lease="switchingLease" :novel-mode="novelMode" :hour="model.state.clock.hour" :scene="scene" @finished="switchingLease = null; nextTick(() => shell?.querySelector<HTMLElement>('[data-protagonist-select]')?.focus({ preventScroll: true }))" @exit="actions.exit()" />
    <InteractionOverlay :model="model" :actions="actions" />
    <AcademicSetup v-if="!model.state.academics" :model="model" :actions="actions" />
  </div>
</template>



<style scoped>
.novel-appointment-prompt{margin:6px 12px 8px;padding:10px 14px;background:color-mix(in srgb,var(--card,#fff) 88%,#c6a65d);border:1px solid #9d8a6a66;border-radius:12px;box-shadow:0 3px 14px #0001;position:relative;z-index:1}
.novel-appointment-prompt p{margin:0 0 8px;font-size:13px;line-height:1.45;color:inherit}
.novel-appointment-prompt div{display:flex;flex-wrap:wrap;gap:9px}
.novel-appointment-prompt button{border:1px solid #987b5480;border-radius:8px;min-height:36px;padding:6px 12px;background:#b7976c26;color:inherit;cursor:pointer}
.novel-appointment-prompt button:disabled{opacity:.5;cursor:default}
</style>
