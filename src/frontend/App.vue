<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, provide, ref, shallowRef, watch } from 'vue';
import NovelLive2DPortrait from './NovelLive2DPortrait.vue';
import { live2dContext } from './live2d-context';
import { live2dIdentity } from '../runtime/live2d-identity';
import { createSandboxCache, sandboxCacheKey } from './CitySandboxScene.vue';
import InteractiveScene from './InteractiveScene.vue';
import InteriorScene from './InteriorScene.vue';
import NovelBackdrop from './NovelBackdrop.vue';
import NovelDialogue from './NovelDialogue.vue';
import StoryEntryContent from './StoryEntryContent.vue';
import PhonePerspectiveReader from './PhonePerspectiveReader.vue';
import NovelNpcPortrait from './NovelNpcPortrait.vue';
import NovelInvitationPortraits from './NovelInvitationPortraits.vue';
import SoyoLive2D from './SoyoLive2D.vue';
import ProtagonistPhonePose from './ProtagonistPhonePose.vue';
import ProtagonistSwitchOverlay from './ProtagonistSwitchOverlay.vue';
import type { ProtagonistSwitchLease } from './protagonist-switch';
import type { SwitchSceneHandle } from './switch-camera';
import { resolveNovelNpcPortrait, standingSpeaker } from './novel-npc-portraits';
import { isSoyoSpeaker } from './live2d-soyo-assets';
import { mainStoryEntries, PHONE_SCENE_PREFIX } from '../runtime/phone-scene';
import { isSakikoSpeaker } from './sakiko-art-policy';
import { isAnonSpeaker } from './anon-art-policy';
import { isMutsumiSpeaker } from './mutsumi-art-policy';
import { isRaanaSpeaker } from './raana-art-policy';
import { isTakiSpeaker } from './taki-art-policy';
import { isTomoriSpeaker } from './tomori-art-policy';
import { isNagasakiMotherSpeaker } from './nagasaki-mother-art-policy';
import { resolveMajoSpeaker } from './majo-art';
import { resolveWatanareSpeaker } from './watanare-art';
import { resolveFengjinSpeaker } from './fengjin-art';
import { isMarinaSpeaker } from './marina-art';
import { isUikaSpeaker } from './uika-art';
import { isUmiriSpeaker } from './umiri-art';
import { isNyamuSpeaker } from './nyamu-art';
import { hasProtagonistPhonePose } from './protagonist-phone-art';
import { type NovelSegment } from './novel-dialogue';
import { resolveNovelInvitationPortraitPair, type NovelInvitationPortraitFocus } from './novel-invitation-portraits';
import { readPresentationMode, savePresentationMode, type PresentationMode } from './presentation-mode';
import { bindShellLayout, type ShellLayoutLease } from './shell-layout';
import WorldPanels from './WorldPanels.vue';
import ToolDock from './ToolDock.vue';
import InvitationBook from './InvitationBook.vue';
import { invitationCards } from './invitation-book';
import TransitPanel from './TransitPanel.vue';
import ConvenienceStore from './ConvenienceStore.vue';
import StationeryStore from './StationeryStore.vue';
import InventoryPanel from './InventoryPanel.vue';
import LocationServices from './LocationServices.vue';
import LawCareerPanel from './LawCareerPanel.vue';
import PlaceActions from './PlaceActions.vue';
import CookingMinigame from './CookingMinigame.vue';
import LivehousePanel from './LivehousePanel.vue';
import IdentityCardPanel from './IdentityCardPanel.vue';
import InteractionOverlay from './InteractionOverlay.vue';
import { runInteraction } from './interaction-action';
import { completeLocationService, packageLocationService } from './location-service-action';
import { CONSTRUCTION_BACKEND_JOB_ID } from '../runtime/location-services';
import AcademicSetup from './AcademicSetup.vue';
import { academicMajors, getAcademicOverview, getAcademicProgress, getAcademicStudyQuote, getAcademicSubjectById } from '../runtime/academics';
import { getStoreAvailability } from '../runtime/convenience-store';
import { r27et1Equipped, studyPointsWithEquipment } from '../runtime/equipment';
import { getActivityEffects } from '../runtime/activity-effects';
import { getNovelTravelQuote, locations } from '../runtime/model';
import { isInternationalLocation } from '../runtime/california';
import { MYSTERY_VISITOR_ID, MYSTERY_VISITOR_NAME, SECOND_MYSTERY_VISITOR_ID, SECOND_MYSTERY_VISITOR_NAME, mysteryVisitorPresent, secondMysteryVisitorPresent } from '../runtime/mystery-visitor';
import mysteryVisitorPortrait from '../../assets/npc-portraits/mystery-visitor.webp?inline';
import secondMysteryVisitorPortrait from '../../assets/npc-portraits/mystery-visitor-anthropic.webp?inline';
import { activeProtagonist, protagonistNames } from '../runtime/protagonist-world';
import { agendaTargetProtagonist, agreedMinute, socialMinute } from '../runtime/social-agenda';
import type { SocialInvitation } from '../runtime/natural-interactions';
import { isCourtInSession } from '../runtime/courtroom';
import { formatGameDate, gameCalendar } from '../runtime/game-calendar';
import { resolveWeather, WEATHER_EFFECTS } from '../runtime/weather';
import { gameCalendarOccasions } from '../runtime/japan-calendar-events';
import { getAdjacentLocations } from '../runtime/location-links';
import { getScenePeople, hiddenProtagonistPersons, scenePersonLabel, SCENE_ENCOUNTER_DISTANCE } from '../runtime/scene-context';
import { worldScenePeople, worldScenePosition, worldSceneRoster, type WorldScenePerson } from '../runtime/world-presence';
import type { PlayerState, ShellActions, ShellModel } from './types';
import { PROTAGONISTS, type ProtagonistId } from '../runtime/dual-protagonists';
import { bedRestOptions, campusInteriors, getCampusInterior, getInteriorActivity, studyDurationOptions, isStudyInteraction, getStudyEnergyCost } from '../runtime/campus-interiors';
import { kitchenAt } from '../runtime/cooking';
import { streetRoutes } from './scene-world';
import { getNearbyTransitStop, transitStops, transitVehicles } from '../runtime/transit';

const props = defineProps<{ model: ShellModel; actions: ShellActions }>();
const sandboxCache = createSandboxCache();
provide(sandboxCacheKey, sandboxCache);
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
watch(currentProtagonist, protagonist => { props.model.phoneSceneJump = undefined; cancelStoryEdit(); pendingCourtSwitch.value=null; cookOpen.value = false; closeWindow(false); draft.value = ''; localActivityReceipt.value = ''; novelHistory.value = false; historyPortrait.value = false; heldPortrait.value = null; invitationPortraitFocus.value = null; novelSegment.value = { speaker: protagonistNames[protagonist], emotion: '平静', text: '' }; });
type WindowPanel = 'phone' | 'map' | 'schedule' | 'inventory' | 'status' | 'abilities' | 'idcard' | 'transit' | 'store' | 'stationery' | 'location' | 'law' | 'invitations' | 'society' | 'focus' | 'decisions';
type ReadingMode = 'compact' | 'expanded' | 'hidden';
const activeWindow = ref<WindowPanel | null>(null);
const toolDock = ref<{ close(restoreFocus?: boolean): boolean }>();
const activeIdentityPersonId = ref<string>('bang-mutsumi');
function openIdentityCard(personId = 'bang-mutsumi') {
  activeIdentityPersonId.value = personId;
  activeWindow.value = 'idcard';
}
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
const graphicsRevision = ref(0);
const novelMode = computed(() => presentationMode.value === 'novel' || isInternationalLocation(props.model.state.locationId));
const novelHistory = ref(false);
provide(live2dContext,()=>({session:props.model.memoryScope,state:props.model.state,enabled:novelMode.value&&!novelHistory.value}));
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
const cookOpen = ref(false);
const livehouseMode = ref<'register' | 'book' | null>(null);
const bedRestDialog = ref<HTMLElement>();
const studyInteractionId = ref('');
const bookReadingPicker = ref(false);
const studySubjectId = ref('');
const studyAttempted = ref(false);
const studyDialog = ref<HTMLElement>();
const localActivityReceipt = ref('');
const mysteryDialog = ref<null | 'original' | 'second'>(null);
const mysteryGiftReceipt = ref('');
const walkSeed = props.model.state.scene?.seed ?? (globalThis.crypto?.randomUUID?.() || `walk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
// Keep the complete saved population available when reading an earlier scene indoors.
const portraitPeople = computed(() => {
  const seed = props.model.state.scene?.seed ?? walkSeed;
  return getScenePeople({ x: 0, z: 18, yaw: 0, areaId: 'promenade', seed, encounterId: null }, props.model.state.contacts, props.model.state.clock, hiddenProtagonistPersons(props.model.state));
});
const scenePeople = computed(() => worldScenePeople(props.model.state));
const invitationPortraitPair = computed(() => resolveNovelInvitationPortraitPair(props.model.state, scenePeople.value));
const invitationPortraitFocus = ref<NovelInvitationPortraitFocus | null>(null);
/** A saved invitation alone is not enough: the live scene and the currently read
 *  line must both concern the co-present pair. Older entries cannot borrow
 *  the future/current world's presence to display people in their past. */
const visibleInvitationStage = computed(() => {
  const pair = invitationPortraitPair.value, focus = invitationPortraitFocus.value;
  return novelMode.value && !novelHistory.value && !activeWindow.value &&
    pair && focus?.invitationId === pair.invitationId &&
    focus.entryId === (props.model.state.story.at(-1)?.id ?? '') &&
    focus.viewpoint === protagonistNames[currentProtagonist.value] &&
    !focus.unrelatedSpeaker ? { pair, focus } : null;
});
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
function personLabel(person: WorldScenePerson) { return person.id === MYSTERY_VISITOR_ID ? MYSTERY_VISITOR_NAME : person.id === SECOND_MYSTERY_VISITOR_ID ? SECOND_MYSTERY_VISITOR_NAME : person.protagonistId ? protagonistNames[person.protagonistId] : scenePersonLabel(person); }
const portraitLabel = computed(() => novelMode.value && heldPortrait.value ? heldPortrait.value.speaker : useEncounterPortrait.value && encounterPerson.value ? personLabel(encounterPerson.value) : segmentSpeaker.value);
const portraitEmotion = computed(() => novelMode.value && heldPortrait.value ? heldPortrait.value.emotion : novelSegment.value.emotion);
const portraitDimmed = computed(() => novelMode.value && !!heldPortrait.value?.dimmed);
function recognizesNovelSpeaker(speaker: string): boolean {
  return isSoyoSpeaker(speaker) || isSakikoSpeaker(speaker) || isMutsumiSpeaker(speaker) || isAnonSpeaker(speaker) || isRaanaSpeaker(speaker) || isTakiSpeaker(speaker) || isTomoriSpeaker(speaker) || isNagasakiMotherSpeaker(speaker) || !!resolveMajoSpeaker(speaker)
    || !!resolveWatanareSpeaker(speaker) || !!resolveFengjinSpeaker(speaker) || isUikaSpeaker(speaker) || isUmiriSpeaker(speaker) || isNyamuSpeaker(speaker) || isMarinaSpeaker(speaker) || resolveNovelNpcPortrait(speaker, {
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
  { id: 'invitations', title: '邀约簿', path: 'M3 9l9 6 9-6M3 9v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9M3 19l6-5M21 19l-6-5M5 9V5a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v4M9 7h6' },
  { id: 'inventory', title: '背包', path: 'M8 6V4a4 4 0 0 1 8 0v2M6 6h12a2 2 0 0 1 2 2v13H4V8a2 2 0 0 1 2-2ZM7 13h10v6H7ZM8 9h8' },
  { id: 'status', title: '状态', path: 'M5 3h14v18H5ZM9 7h6M9 11h6M9 15h3M3 7h4M3 15h4' },
  { id: 'society', title: '阵营', path: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 1 0 7.75' },
  { id: 'focus', title: '国策', path: 'M8 4h12v16H8M4 8h12M4 14h12M4 20h12M12 4v4' },
  { id: 'decisions', title: '决议', path: 'M14 3l7 7-4 4-7-7 4-4ZM11 8l-8 8v3h3l8-8M3 21h18' },
  { id: 'abilities', title: '能力', path: 'm12 2 8.7 5v10L12 22l-8.7-5V7ZM12 2v20M3.3 7l17.4 10M3.3 17 20.7 7m-13.9 2 5.2-3 5.2 3v6L12 18l-5.2-3Z' },
  { id: 'idcard', title: '证件', path: 'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5Zm5 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm-2 8c0-1.7 1.3-3 3-3h2c1.7 0 3 1.3 3 3m3-7h4m-4 4h3' },
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
const sceneRoster = computed(() => worldSceneRoster(props.model.state, scenePeople.value));
const nearbyPeople = computed<{ person: WorldScenePerson; distance: number }[]>(() => {
  const position = worldScenePosition(props.model.state);
  const ordinary = sceneRoster.value.filter(row => row.canTalk);
  // Rare outdoor visitor is computed locally, including overseas novel-only places.
  const rare: { person: WorldScenePerson; distance: number }[] = [];
  if (mysteryVisitorPresent(props.model.state)) {
    rare.push({ person: {
      id: MYSTERY_VISITOR_ID, name: MYSTERY_VISITOR_NAME, candidateName: MYSTERY_VISITOR_NAME,
      identity: '身份不明', tags: ['奇遇', '稀有'], description: '一位穿深色针织衫的陌生访客，似乎有话想说。',
      x: position?.x ?? 0, z: position?.z ?? 0, color: 0x363d50,
      portraitId: 'claude', contactId: null, isMain: false,
    }, distance: 2.5 });
  }
  if (secondMysteryVisitorPresent(props.model.state)) {
    rare.push({ person: {
      id: SECOND_MYSTERY_VISITOR_ID, name: SECOND_MYSTERY_VISITOR_NAME, candidateName: SECOND_MYSTERY_VISITOR_NAME,
      identity: '身份不明', tags: ['奇遇', '稀有'], description: '一位戴着眼镜、穿深蓝外套的神秘研究者，似乎正思考什么。',
      x: position?.x ?? 0, z: position?.z ?? 0, color: 0x42516a,
      portraitId: 'claude', contactId: null, isMain: false,
    }, distance: 3.0 });
  }
  return [...rare, ...ordinary];
});
const locationPeople = computed(() => [
  ...nearbyPeople.value.filter(row => !sceneRoster.value.some(item => item.person.id === row.person.id))
    .map(row => ({ ...row, kind: 'person' as const, canTalk: true })),
  ...sceneRoster.value,
]);
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
const weatherNow = computed(() => resolveWeather(props.model.state));
const weatherLabel = computed(() => WEATHER_EFFECTS[weatherNow.value.id].label);
const weatherIcon = computed(() => WEATHER_EFFECTS[weatherNow.value.id].icon);
const civilDateLabel = computed(() => {
  const day = props.model.state.clock.day;
  const occasions = gameCalendarOccasions(day);
  const occasion = occasions.find(item => item.dayOff) ?? occasions[0];
  return `${formatGameDate(day)} · ${gameCalendar(day).weekdayLabel}${occasion ? ' · ' + occasion.name : ''}`;
});
const windowTitle = computed(() => activeWindow.value === 'store' ? '便利店' : activeWindow.value === 'stationery' ? '文具店' : activeWindow.value === 'transit' ? '公交站' : activeWindow.value === 'idcard' ? '居民身份证与通行证' : activeWindow.value === 'law' ? (props.model.state.locationId==='court-hearing'?'法院 · 案件':'律师事务所 · 案件') : nav.find(item => item.id === activeWindow.value)?.title ?? '');
const demoPhone = computed(() => !props.model.externalPhoneAvailable && props.model.mode === 'demo');
const embeddedPhone = computed(() => activeWindow.value === 'phone' && !demoPhone.value);
// Phone presentation renders a static front view while all walking remains disabled.
const scenePaused = computed(() => switchingLease.value ? false : !props.model.state.academics || studyPickerOpen.value || (activeWindow.value === 'phone' ? false : props.model.busy || readingMode.value === 'expanded' || !!activeWindow.value));
const unread = computed(() => demoPhone.value ? props.model.state.phone.filter(item => !item.read).length : props.model.phoneUnread);
const storyEntries = computed(() => mainStoryEntries(props.model.state.story));
const phonePerspective = computed(() => {
  const target = props.model.phoneSceneJump;
  const entry = target && props.model.state.story.find(row =>
    row.role === 'assistant' && row.id === target.id && row.id.startsWith(PHONE_SCENE_PREFIX));
  return entry && target?.viewpoint ? { entry, viewpoint: target.viewpoint } : null;
});
function closePhonePerspective() { props.model.phoneSceneJump = undefined; }
const editingStoryId = ref<string | null>(null);
const editingStoryOriginal = ref('');
const editingStoryDraft = ref('');
const editingStoryRole = ref<'user' | 'assistant'>('assistant');
const editingStoryError = ref('');
function beginStoryEdit(entry: ShellModel['state']['story'][number]) {
  if (props.model.busy || props.model.switchingProtagonist || props.model.interaction || switchingLease.value) return;
  editingStoryId.value = entry.id;
  editingStoryOriginal.value = entry.text;
  editingStoryDraft.value = entry.text;
  editingStoryRole.value = entry.role;
  editingStoryError.value = '';
  void nextTick(() => shell.value?.querySelector<HTMLTextAreaElement>('[data-story-edit-input]')?.focus({ preventScroll: true }));
}
function beginStoryEditById(entryId: string) {
  const entry = storyEntries.value.find(row => row.id === entryId);
  if (entry) beginStoryEdit(entry);
}
function cancelStoryEdit() {
  editingStoryId.value = null;
  editingStoryOriginal.value = '';
  editingStoryDraft.value = '';
  editingStoryError.value = '';
}
function saveStoryEdit() {
  const id = editingStoryId.value;
  if (!id || props.model.busy || props.model.switchingProtagonist || props.model.interaction) return;
  if (props.actions.editStoryEntry?.(id, editingStoryOriginal.value, editingStoryDraft.value)) {
    cancelStoryEdit();
  } else {
    editingStoryError.value = props.model.notice || '保存失败，请重新打开编辑器重试。';
  }
}
const dismissedMeetingPrompts = ref<string[]>([]);
const meetingPrompt = computed(() => {
  const state=props.model.state, now=socialMinute(state);
  return (state.protagonists?.socialInvitations ?? []).slice().reverse().find(invite =>
    (invite.owner===currentProtagonist.value || agendaTargetProtagonist(state,invite)===currentProtagonist.value) && invite.status==='accepted' &&
    !dismissedMeetingPrompts.value.includes(invite.id) &&
    now>=agreedMinute(invite)-45 && now<=agreedMinute(invite)+180 && state.locationId!==invite.locationId) ?? null;
});
function hideMeetingPrompt(id:string){
  if(!dismissedMeetingPrompts.value.includes(id))dismissedMeetingPrompts.value.push(id);
}
async function travelToMeeting(invite:SocialInvitation){
  if(props.model.busy)return false;
  scene.value?.flushPresence();
  if(walkSyncError.value)return false;
  const destination=novelMode.value?invite.locationId:getCampusInterior(invite.locationId)?.parentLocationId??invite.locationId;
  if(await runInteraction(props.model,props.actions,{type:novelMode.value?'novel_travel':'travel',locationId:destination})) {
    hideMeetingPrompt(invite.id);
    return true;
  }
  return false;
}
async function travelFromInvitationBook(id: string) {
  const visible = invitationCards(props.model.state).find(item => item.id === id);
  const invite = props.model.state.protagonists?.socialInvitations?.find(item => item.id === id);
  if (!invite || visible?.status !== 'accepted' || visible.shelf !== 'upcoming') return;
  if (await travelToMeeting(invite)) closeWindow(false);
}
async function prepareInvitationAction(text: string) {
  const combined = [draft.value.trim(), text].filter(Boolean).join('\n');
  if (combined.length > 2000) { props.model.notice = '正文草稿太长，请先整理后再加入邀请。'; return; }
  await prepareAction(combined);
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
    const selector = previous === 'stationery' ? '[data-stationery-entry]' : previous === 'store' ? '[data-store-entry]' : `button[aria-label="${nav.find(item => item.id === previous)?.title}"]`;
    shell.value?.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true });
  });
}
function openStore() {
  if (props.model.busy) return;
  scene.value?.flushPresence();
  if (walkSyncError.value || !storeAvailable.value) return;
  openWindow('store');
}
function openStationery() {
  if (props.model.busy) return;
  scene.value?.flushPresence();
  if (walkSyncError.value || !bookReadingAvailable.value) return;
  openWindow('stationery');
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
  cookOpen.value = false;
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
function openCooking() {
  if (props.model.busy || props.model.interaction || !kitchenAt(props.model.state)) return;
  closeWindow(false);
  cookOpen.value = true;
}
function quickRoomActivity(interactionId: string) {
  // Clicking a listed activity explicitly approaches it; physical 3D interactions retain proximity checks.
  roomInteract(interactionId, true);
}
async function switchPresentationMode(mode: PresentationMode) {
  if (props.model.busy || mode === presentationMode.value || (mode === 'scene' && isInternationalLocation(props.model.state.locationId))) return;
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
      follows: followsLatest.value, unread: hasNewContent.value, storyId: storyEntries.value.at(-1)?.id ?? '',
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
    hasNewContent.value = sceneReadingPosition.unread || sceneReadingPosition.storyId !== (storyEntries.value.at(-1)?.id ?? '');
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
async function openPhoneStock(code: string) {
  if (!props.actions.openPhoneStock) return;
  if (activeWindow.value !== 'phone') openWindow('phone');
  await nextTick();
  if (unmounting || activeWindow.value !== 'phone') return;
  openEmbeddedPhone();
  props.actions.openPhoneStock(code);
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
watch(() => props.model.memoryScope, closePhonePerspective);
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
watch(() => storyEntries.value.at(-1)?.id, async () => {
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
watch([() => props.model.state.locationId, () => currentProtagonist.value], () => { mysteryDialog.value = null; mysteryGiftReceipt.value = ''; livehouseMode.value = null; bedRestPicker.value = false; cookOpen.value = false; bookReadingPicker.value = false; studyInteractionId.value = ''; studySubjectId.value = ''; localActivityReceipt.value = ''; });
watch(() => isInternationalLocation(props.model.state.locationId), overseas => {
  if (overseas && readingMode.value === 'hidden') readingMode.value = 'compact';
});
function sceneEncounter(personId: string) {
  if (props.model.busy) return;
  if (personId === MYSTERY_VISITOR_ID || personId === SECOND_MYSTERY_VISITOR_ID) {
    if (!(personId === MYSTERY_VISITOR_ID ? mysteryVisitorPresent(props.model.state) : secondMysteryVisitorPresent(props.model.state))) return;
    mysteryGiftReceipt.value = '';
    mysteryDialog.value = personId === MYSTERY_VISITOR_ID ? 'original' : 'second';
    return;
  }
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
function claimMysteryGift() {
  if (props.model.busy || !mysteryDialog.value) return;
  const second = mysteryDialog.value === 'second';
  const present = second ? secondMysteryVisitorPresent(props.model.state) : mysteryVisitorPresent(props.model.state);
  if (!present) return;
  props.actions.dispatch({ type: second ? 'claim_second_mystery_gift' : 'claim_mystery_gift' });
  const awarded = second ? props.model.state.anthropicVisitor : props.model.state.mysteryVisitor;
  if (awarded?.claimedBy[currentProtagonist.value]) {
    mysteryGiftReceipt.value = second
      ? '收到 Max 20x ×1、KYC ×1、Last Decision ×1。奖励已放入当前主角背包。'
      : '收到 Full Reset ×10、Pro 500 ×1。奖励已放入当前主角背包。';
  }
}
function dismissOverlay() {
  if (editingStoryId.value) { cancelStoryEdit(); return true; }
  if (toolDock.value?.close(true)) return true;
  if (mysteryDialog.value) { mysteryDialog.value = null; return true; }
  if (pendingCourtSwitch.value) { pendingCourtSwitch.value=null; return true; }
  if (switchingLease.value) { void switchOverlay.value?.skip(); return true; }
  if (props.model.interaction) { props.actions.cancelInteraction?.(); return true; }
  if (studyPickerOpen.value) { closeStudyPicker(); return true; }
  if (livehouseMode.value) { livehouseMode.value = null; return true; }
  if (cookOpen.value) { cookOpen.value = false; return true; }
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
function onShellWheel(event: WheelEvent) {
  if (event.defaultPrevented || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
  let node = event.target instanceof HTMLElement ? event.target : null;
  while (node && node !== shell.value) {
    if (node.tagName === 'TEXTAREA' || node.getAttribute('data-testid') === 'focus-tree-viewport') return;
    const style = window.getComputedStyle(node);
    const canScrollY = (style.overflowY === 'auto' || style.overflowY === 'scroll') && node.scrollHeight > node.clientHeight + 2;
    if (canScrollY) return;
    const canScrollX = (style.overflowX === 'auto' || style.overflowX === 'scroll') && node.scrollWidth > node.clientWidth + 2 && node.scrollHeight <= node.clientHeight + 6;
    if (canScrollX) {
      const canMoveLeft = event.deltaY < 0 && node.scrollLeft > 0;
      const canMoveRight = event.deltaY > 0 && node.scrollLeft + node.clientWidth < node.scrollWidth - 1;
      if (canMoveLeft || canMoveRight) {
        event.preventDefault();
        node.scrollLeft += event.deltaY;
        return;
      }
    }
    node = node.parentElement;
  }
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
  sandboxCache.close();
  switchingLease.value?.release();
  unmounting = true; phoneMountRevision++;
  props.actions.setDismissHandler?.(undefined);
  layoutLease?.dispose(); layoutLease = undefined;
  releasePhone();
});
</script>

<template>
  <div ref="shell" class="uc-shell" :data-presentation-mode="novelMode ? 'novel' : 'scene'" :data-reading-mode="readingMode" :data-active-window="activeWindow ?? ''" :data-phone-expanded="phoneExpanded" :data-rest-picker="bedRestPicker || studyPickerOpen || cookOpen" :data-phone-link-status="model.phoneLinkStatus" :data-current-protagonist="currentProtagonist" @wheel="onShellWheel">
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
    <NovelInvitationPortraits v-if="visibleInvitationStage"
      :refresh-token="graphicsRevision"
      :pair="visibleInvitationStage.pair" :focus="visibleInvitationStage.focus"
      :location-id="model.state.locationId" :active="portraitActive && readingMode !== 'expanded'" />
    <NovelNpcPortrait v-if="(novelMode || encounterPerson) && !visibleInvitationStage && live2dIdentity(portraitLabel) !== 'soyo'"
      :refresh-token="graphicsRevision"
      :portrait-id="npcPortraitId" :speaker="portraitLabel" :emotion="portraitEmotion"
      :dimmed="portraitDimmed" :active="portraitActive" :location-id="model.state.locationId" />
    <!-- Preserve the original v-if/v-else-if scene switch. An inactive
         single-person Live2D remains mounted while the paired stage is shown. -->
    <NovelLive2DPortrait v-if="novelMode" :speaker="live2dIdentity(portraitLabel) === 'soyo' ? portraitLabel : ''" :emotion="portraitEmotion"
      :refresh-token="graphicsRevision" :dimmed="portraitDimmed" :active="!visibleInvitationStage && !activeWindow && readingMode !== 'expanded'">
    <SoyoLive2D
      :refresh-token="graphicsRevision"
      :emotion="portraitEmotion" :speaker="portraitLabel" :dimmed="portraitDimmed"
      :active="!visibleInvitationStage && !activeWindow && readingMode !== 'expanded'" />
    </NovelLive2DPortrait>
    <InteriorScene :key="currentProtagonist" :protagonist="currentProtagonist" v-else-if="model.state.interior" ref="scene" :interior="model.state.interior" :stress="model.state.player.stress" :busy="model.busy || !!switchingLease" :hour="model.state.clock.hour" :phone-active="activeWindow === 'phone'" :free-walk="readingMode === 'hidden' && !activeWindow" :paused="scenePaused || bedRestPicker || !!studyInteractionId || cookOpen" @presence="scenePresence" @interact="roomInteract" @leave="leaveInterior" />
    <InteractiveScene :key="currentProtagonist" :protagonist="currentProtagonist" v-else ref="scene" :location-id="model.state.locationId" :presence="model.state.scene" :air-traffic="model.state.airTraffic" :people="scenePeople" :busy="model.busy || !!switchingLease" :hour="model.state.clock.hour" :phone-active="activeWindow === 'phone'" :free-walk="readingMode === 'hidden' && !activeWindow" :paused="scenePaused" @hotspot="sceneHotspot" @presence="scenePresence" @encounter="sceneEncounter" />
    <ProtagonistPhonePose v-if="novelMode && activeWindow === 'phone'" :protagonist="currentProtagonist" :location-id="model.state.locationId" />
    <div class="world-vignette" :class="{ 'reading-shade': readingMode === 'expanded' && activeWindow !== 'phone' }" aria-hidden="true"></div>
    <header class="world-chrome"><div class="world-heading"><button class="wordmark" aria-label="场景" @click="sceneHome">未读之城<span>一段正在发生的日常</span></button><div class="topbar-world"><span>{{ currentLocation.name }}</span><span class="chrome-dot">·</span><span>{{ civilDateLabel }}</span><span class="chrome-dot">·</span><span class="chrome-weather" :aria-label="weatherLabel">{{ weatherIcon }}{{ weatherLabel }}</span><time>{{ time }}</time></div></div><div class="host-actions"><button v-if="novelMode" class="graphics-refresh-button" aria-label="刷新画面" title="刷新画面" @click="graphicsRevision++">↻</button><button class="layout-mode-button" :aria-label="layoutEditing ? '完成界面布局编辑' : '编辑界面布局'" :aria-pressed="layoutEditing" @click="toggleLayoutEditing">{{ layoutEditing ? '完成' : '布局' }}</button><button v-if="layoutEditing" class="layout-reset-button" aria-label="重置界面布局" @click="resetLayout">重置</button><button aria-label="切换聊天并恢复原生界面" @click="actions.switchChat()">切换聊天</button></div></header>
    <p v-if="model.notice" class="notice" role="status">{{ model.notice }}</p>
    <nav v-if="!activeWindow" class="presentation-switch" aria-label="游玩模式"><button :aria-pressed="!novelMode" :disabled="model.busy || isInternationalLocation(model.state.locationId)" @click="switchPresentationMode('scene')">3D 漫游</button><button :aria-pressed="novelMode" :disabled="model.busy" @click="switchPresentationMode('novel')">纯小说</button><select aria-label="切换主角" data-protagonist-select :value="currentProtagonist" :disabled="!!model.interaction || !!switchingLease" @change="selectProtagonist"><option v-for="(name, id) in protagonistNames" :key="id" :value="id">{{ name }}</option></select></nav>
    <aside v-if="encounterPerson && !activeWindow && readingMode === 'compact'" class="encounter-caption" data-current-encounter :data-person-id="encounterPerson.id"><div><strong>{{ personLabel(encounterPerson) }}</strong><small>{{ encounterPerson.protagonistId ? '主角 · 正在当面交流' : encounterPerson.contactId ? '主要人物 · 已存入当前聊天' : '正在当面交流 · 尚未确认姓名' }}</small></div><button v-if="!encounterPerson.protagonistId" :disabled="model.busy" data-encounter-contact @click="saveEncounterContact(encounterPerson.id)">{{ encounterPerson.contactId ? '手机档案' : '手机建档' }} ↗</button></aside>
    <button v-if="model.state.locationId==='court-hearing' && !!model.state.courtroom?.active && !activeWindow" type="button"
      class="court-case-launcher" data-court-case-open @click="openWindow('law')">庭审案卷</button>
    <button v-if="!novelMode && readingMode === 'compact' && !activeWindow" class="walk-launcher" aria-label="自由行走" @click="startWalking"><span aria-hidden="true">↟</span> 自由行走</button>
    <button v-if="!novelMode && nearbyEntrance && !activeWindow && readingMode === 'hidden'" class="campus-entrance" :disabled="model.busy" :aria-label="`进入${nearbyEntrance.label}`" @click="enterInterior(nearbyEntrance.id)"><span aria-hidden="true">⌂</span><span>进入{{ nearbyEntrance.label }}<small>室内探索 · 可随时返回</small></span><span aria-hidden="true">↗</span></button>
    <button v-if="!novelMode && nearbyTransitStop && !activeWindow && readingMode === 'hidden'" class="campus-entrance" data-transit-entry aria-label="公交乘车" :disabled="model.busy" @click="openWindow('transit')"><span aria-hidden="true">▣</span><span>公交乘车<small>{{ nearbyTransitStop.label }} · BTR-82A / ZBD-04A</small></span><span aria-hidden="true">↗</span></button>
    <button v-if="!novelMode && storeAvailable && !activeWindow && readingMode === 'hidden'" class="campus-entrance" data-store-entry aria-label="逛便利店" :disabled="model.busy" @click="openStore"><span aria-hidden="true">▤</span><span>逛便利店<small>选购食物、饮品与日用品</small></span><span aria-hidden="true">↗</span></button>
    <button v-if="!novelMode && bookReadingAvailable && !activeWindow && readingMode === 'hidden'" class="campus-entrance" data-stationery-entry aria-label="逛文具店" :disabled="model.busy" @click="openStationery"><span aria-hidden="true">✒</span><span>逛文具店<small>R-27ET1 · 500 日元一支</small></span><span aria-hidden="true">↗</span></button>
    <button v-if="!novelMode && bookReadingAvailable && !activeWindow && readingMode === 'hidden'" class="campus-entrance" data-book-reading-entry :disabled="model.busy" @click="openBookReading"><span aria-hidden="true">▤</span><span>选书阅读<small>本专业巩固 · 跨专业探索</small></span><span aria-hidden="true">↗</span></button>
    <p v-if="localActivityReceipt && readingMode === 'hidden' && !activeWindow && !bedRestPicker && !studyPickerOpen" class="bed-rest-receipt" data-bed-rest-receipt data-local-activity-receipt role="status">{{ localActivityReceipt }}<small>已保存，无需发送对话。</small></p>
    <LivehousePanel v-if="livehouseMode" :key="currentProtagonist" :model="model" :actions="actions" :mode="livehouseMode" @close="livehouseMode = null" />
    <CookingMinigame v-if="cookOpen" :model="model" :actions="actions" @close="cookOpen = false" />
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
        <p v-else-if="academicProgress">本专业按实际学习分钟积累学习点，各科独立提升。<template v-if="r27et1Equipped(model.state)"> 当前 R-27ET1 学习点 +25%。</template></p>
        <div class="bed-rest-options"><button v-for="{ option, quote } in studyQuotes" :key="option.id" :data-study-option="option.id" :disabled="model.busy || !!quote.blockedReason" @click="chooseStudy(option.id)"><strong>{{ option.label }}</strong><span>{{ option.minMinutes < 60 ? `${option.minMinutes}–${option.maxMinutes} 分钟` : `${option.minMinutes / 60}–${option.maxMinutes / 60} 小时` }}</span><small>常规精力消耗 {{ getStudyEnergyCost(option.minMinutes) }}–{{ getStudyEnergyCost(option.maxMinutes) }} 点<template v-if="quote.isCrossMajor">，困惑时额外消耗 3 点</template></small><small>学科提升 +{{ studyPointsWithEquipment(model.state, option.minMinutes * (quote.isCrossMajor ? .5 : 1)) }}–{{ studyPointsWithEquipment(model.state, option.maxMinutes * (quote.isCrossMajor ? 1.5 : 1)) }} 点</small><small>{{ activityImpact('study', option.minMinutes, option.maxMinutes) }}</small><small v-if="quote.blockedReason">{{ quote.blockedReason }}</small></button></div>
        <p class="bed-rest-note">确认时一次抽取时长与跨科结果，保存后不重抽。精力须足够完成本档最长时间和可能的额外消耗；实际变化受状态上下限影响。取消不消耗。</p>
        <p v-if="studyAttempted && model.notice" class="academic-setup-error" data-study-error role="alert">{{ model.notice }}<span>学习结果尚未保存，已保留科目选择，可重试。</span></p>
        <button class="bed-rest-cancel" @click="closeStudyPicker">取消</button>
      </section>
    </div>
    <ToolDock ref="toolDock" :items="nav" :active="activeWindow" :unread="unread" :editing="layoutEditing" @select="openWindow" />
    <span class="sr-only" role="status" aria-live="polite">{{ unread ? `手机有 ${unread} 条未读消息` : '手机没有未读消息' }}</span>
    <section v-show="readingMode !== 'hidden'" class="reading-layer" data-reading-layer aria-label="小说正文" :class="{ 'reading-expanded': readingMode === 'expanded' }">
      <button type="button" class="reading-resize-grip" data-layout-handle="reading-height" aria-label="上下拖动调整正文高度" title="拖动改变正文高度"><span aria-hidden="true"></span></button>
      <header class="reading-heading"><div v-if="encounterPerson && readingMode === 'expanded'" class="encounter-caption encounter-caption-inline" data-current-encounter :data-person-id="encounterPerson.id"><div><strong>{{ personLabel(encounterPerson) }}</strong><small>{{ encounterPerson.protagonistId ? '主角 · 正在当面交流' : encounterPerson.contactId ? '主要人物 · 已存入当前聊天' : '正在当面交流 · 尚未确认姓名' }}</small></div><button v-if="!encounterPerson.protagonistId" :disabled="model.busy" data-encounter-contact @click="saveEncounterContact(encounterPerson.id)">{{ encounterPerson.contactId ? '手机档案' : '手机建档' }} ↗</button></div><div v-else><span class="reading-caption">{{ model.busy ? '故事正在继续…' : '此刻的故事' }}</span><small v-if="model.mode === 'demo'">本地演示</small></div><div class="reading-actions"><button v-if="novelMode && novelHistory" @click="novelHistory = false; setReadingMode('compact')">逐句阅读</button><button v-if="!novelMode" @click="readEarlier">往前读</button><button v-if="!novelMode" :aria-label="readingMode === 'expanded' ? '缩小正文' : '展开正文'" @click="setReadingMode(readingMode === 'expanded' ? 'compact' : 'expanded')">{{ readingMode === 'expanded' ? (novelMode ? '显示背景' : '回到场景') : '专注阅读' }}</button><button v-if="!novelMode" aria-label="收起正文" @click="setReadingMode('hidden')">收起</button></div></header>
      <p v-if="lastRoomActivity" class="room-activity-receipt" data-room-activity-receipt role="status">{{ localActivityReceipt || persistedRoomReceipt }} <span>{{ lastWasTimedActivity ? '已完成活动，无需发送对话。' : '已记入状态，可继续故事。' }}</span></p>
      <p v-else-if="localActivityReceipt || persistedBookReceipt" class="room-activity-receipt" data-local-activity-receipt role="status">{{ localActivityReceipt || persistedBookReceipt }} <span>已保存，无需发送对话。</span></p>

      <section v-if="novelMode && !novelHistory && meetingPrompt" class="novel-appointment-prompt" :data-meeting-invite="meetingPrompt.id" aria-label="今日约定">
        <p>和{{ meetingPrompt.owner === currentProtagonist ? meetingPrompt.targetName : protagonistNames[meetingPrompt.owner] }}约在{{ meetingPrompt.day === model.state.clock.day ? '今天' : '第'+meetingPrompt.day+'天' }} {{ meetingPrompt.time }}，地点是{{ getCampusInterior(meetingPrompt.locationId)?.label ?? locations.find(place => place.id === meetingPrompt?.locationId)?.name ?? '约定地点' }}。</p>
        <div><button type="button" :disabled="model.busy" @click="travelToMeeting(meetingPrompt)">前往约定地点</button>
        <button type="button" :disabled="model.busy" @click="hideMeetingPrompt(meetingPrompt.id)">稍后再说</button></div>
      </section>
      <NovelDialogue v-show="novelMode && !novelHistory" :protagonist="protagonistNames[currentProtagonist]" :protagonist-id="currentProtagonist" :memory-scope="model.memoryScope"
        :recognizes-speaker="recognizesNovelSpeaker" :invitation-pair="invitationPortraitPair"
        @focus="heldPortrait = $event"
        @invitation-focus="invitationPortraitFocus = $event"
        :active="novelMode && !novelHistory" :entries="storyEntries"
        :busy="model.busy" @segment="novelSegment = $event"
        @history="readEarlier" @edit="beginStoryEditById" @switch-side="switchToOtherSide" />
      <div v-show="!novelMode || novelHistory" ref="storyList" class="story-list" role="log" :aria-live="followsLatest ? 'polite' : 'off'" aria-label="故事记录" :aria-busy="model.busy" @scroll="onStoryScroll"><article v-for="entry in storyEntries" :key="entry.id" class="story-entry" :class="{ 'story-user': entry.role === 'user' }" :data-story-id="entry.id"><div class="story-entry-toolbar"><span>{{ entry.role === 'user' ? '你的行动' : '剧情回复' }}</span><button type="button" class="story-edit-button" :disabled="model.busy || !!model.interaction || !!switchingLease" :aria-label="`编辑${entry.role === 'user' ? '行动' : '剧情'}消息`" @click="beginStoryEdit(entry)">编辑</button></div><StoryEntryContent :text="entry.text" :role="entry.role" :protagonist="protagonistNames[currentProtagonist]"
  :other-side-beats="entry.otherSideBeats" :return-story="entry.returnStory"
  @segment="readDialogueSegment" @switch-side="switchToOtherSide" /></article><p v-if="!storyEntries.length" class="empty-story">{{ currentLocation.description }} 你想从什么开始？</p></div>
      <button v-if="hasNewContent && (!novelMode || novelHistory)" class="new-content" @click="jumpToLatest">有新内容 <span aria-hidden="true">↓</span></button>
      <form class="composer" @submit.prevent="submit"><label class="sr-only" for="uc-action-input">接下来，你想做什么？</label><textarea id="uc-action-input" ref="composer" v-model="draft" aria-label="接下来，你想做什么？" rows="1" maxlength="2000" placeholder="写下你的行动，或说一句想说的话……" @keydown.ctrl.enter.prevent="submit"></textarea><button type="submit" :disabled="model.busy || !draft.trim()">{{ model.busy ? '叙事中…' : '继续故事' }} <span aria-hidden="true">↗</span></button></form>
      <p v-if="composerError" class="composer-error" role="alert">{{ composerError }}</p>
    </section>
    <button v-if="readingMode === 'hidden'" class="resume-reading" aria-label="继续阅读" @click="setReadingMode('compact')">继续阅读 <span v-if="hasNewContent" class="resume-dot">有新内容</span><span aria-hidden="true">↑</span></button>
    <section v-if="activeWindow" :key="activeWindow" class="floating-window" :class="{ 'phone-window': activeWindow === 'phone' }" :data-window="activeWindow" role="dialog" :aria-label="windowTitle + '窗口'">
      <div v-if="activeWindow === 'phone'" class="phone-controls" aria-label="手机显示操作"><button type="button" class="phone-size-toggle" :aria-label="phoneExpanded ? (novelMode ? '缩小手机' : '人物同框') : '放大手机'" :title="phoneExpanded ? (novelMode ? '缩小手机' : '人物同框') : '放大手机'" :aria-expanded="phoneExpanded" @click="togglePhoneSize"><svg viewBox="0 0 24 24" aria-hidden="true"><path :d="phoneExpanded ? 'M3 8h5V3M21 8h-5V3M3 16h5v5M21 16h-5v5' : 'M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5'" /></svg></button><button type="button" aria-label="查看手机背面" title="查看背面；长按拖动旋转，双指缩放" @click="adjustPhoneView('back')"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="2" width="12" height="20" rx="3"/><circle cx="10" cy="6" r="1"/><circle cx="10" cy="10" r="1"/></svg></button><button type="button" aria-label="手机回正" title="回到正面并恢复大小" @click="adjustPhoneView('front')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10a8 8 0 1 1 1 7M4 4v6h6"/></svg></button><button type="button" aria-label="关闭手机窗口" title="收起手机" @click="closeWindow()"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button></div>
      <header v-else class="window-heading" @pointerdown="startWindowDrag" @pointermove="moveWindow" @pointerup="endWindowDrag" @pointercancel="endWindowDrag"><h1>{{ windowTitle }}</h1><span v-if="activeWindow!=='law' && activeWindow!=='invitations' && activeWindow!=='abilities' && activeWindow!=='idcard' && activeWindow!=='society' && activeWindow!=='focus' && activeWindow!=='decisions'" class="window-demo">演示内容</span><button v-if="activeWindow === 'map'" class="window-transit" data-transit-open @click="openWindow('transit')">公交线路 ↗</button><button :aria-label="'关闭' + windowTitle + '窗口'" @click="closeWindow()"><span aria-hidden="true">×</span></button></header>
      <template v-if="embeddedPhone"><div v-if="model.phoneLinkStatus === 'error'" class="phone-sync-error" role="status"><p>{{ model.phoneLinkError }}</p><button @click="actions.retryPhoneSync()">重试同步</button></div><div ref="phoneSlot" class="phone-slot" :data-phone-presentation="novelMode ? 'novel' : 'scene'" data-unread-city-phone-slot :data-phone-status="model.phoneStatus" aria-label="手机应用区域" :aria-busy="model.phoneStatus === 'loading'"><div v-if="!model.externalPhoneOpen" class="phone-waiting" :class="{ 'phone-load-error': model.phoneStatus === 'error' }" :role="model.phoneStatus === 'error' ? 'alert' : 'status'"><span class="phone-loading-icon" aria-hidden="true">▯</span><strong>{{ model.phoneStatus === 'error' ? '手机暂未打开' : '正在打开你的手机…' }}</strong><p>{{ model.phoneStatus === 'error' ? (model.phoneError || '手机加载未完成，请重试。') : '手机会在这里显示，你也可以先收起窗口继续阅读。' }}</p><button v-if="model.phoneStatus === 'error'" @click="openEmbeddedPhone">重试加载手机</button></div></div></template>
      <div v-else-if="activeWindow === 'transit'" class="window-content"><TransitPanel :model="model" :stop="nearbyTransitStop" :novel-mode="novelMode" @ride="takeTransit" @approach="approachTransitStop" /></div>
      <div v-else-if="activeWindow === 'invitations'" class="window-content"><InvitationBook :key="currentProtagonist" :model="model" :novel-mode="novelMode" :nearby-person-ids="nearbyPeople.flatMap(({ person }) => [person.id, person.contactId ?? ''])" @compose="prepareInvitationAction" @travel="travelFromInvitationBook" /></div>
      <div v-else-if="activeWindow === 'law'" class="window-content"><LawCareerPanel :model="model" :actions="actions" @close="closeWindow(false)" /></div>
      <div v-else-if="activeWindow === 'store'" class="window-content"><ConvenienceStore :model="model" :actions="actions" /></div>
      <div v-else-if="activeWindow === 'stationery'" class="window-content"><StationeryStore :model="model" :actions="actions" /></div>
      <div v-else-if="activeWindow === 'inventory'" class="window-content"><InventoryPanel :model="model" :actions="actions" /></div>
      <div v-else-if="activeWindow === 'idcard'" class="window-content"><IdentityCardPanel :model="model" :actions="actions" :initial-person-id="activeIdentityPersonId" @fill-composer="text => { closeWindow(false); void prepareAction(text); }" @close-panel="closeWindow()" @open-social-panel="openWindow('location')" /></div>
      <div v-else-if="activeWindow === 'location'" class="window-content"><PlaceActions :model="model" catalog @enter="enterInterior" @law="openWindow('law')" @travel="travelAdjacent" @service="quickLocationService" @package="quickPackageService" @activity="quickRoomActivity" @store="openStore" @stationery="openStationery" @books="openBookReading" @map="openWindow('map')" @cook="openCooking" />
        <section class="nearby-people" data-nearby-people>
          <h2>附近的人</h2><p v-if="!locationPeople.length">附近暂时没有人。</p>
          <template v-for="({person, distance, kind, canTalk}, index) in locationPeople" :key="person.id">
            <h3 v-if="index === 0 || kind !== locationPeople[index - 1]?.kind">{{ kind === 'person' ? '人物' : '过往行人' }}</h3>
            <div :data-visible-person="person.id" :data-person-kind="kind">
              <span><strong>{{ personLabel(person) }}</strong><small>{{ Math.round(distance * 10) / 10 }} 米 · {{ canTalk ? '身边' : '远处' }} · {{ person.contactId ? person.description : person.identity }}</small></span>
              <button :disabled="model.busy || !canTalk" :data-talk-person="person.id" @click="sceneEncounter(person.id)">交流</button>
              <button v-if="canTalk && person.id !== MYSTERY_VISITOR_ID && person.id !== SECOND_MYSTERY_VISITOR_ID" :disabled="model.busy" :data-idcard-person="person.id" @click="openIdentityCard(person.id)">证件</button>
              <button v-if="canTalk && !person.protagonistId && person.id !== MYSTERY_VISITOR_ID && person.id !== SECOND_MYSTERY_VISITOR_ID" :disabled="model.busy" :data-save-person="person.id" @click="saveEncounterContact(person.id)">{{ person.contactId ? '档案' : '建档' }}</button>
            </div>
          </template>
        </section>
        <p v-if="localActivityReceipt" class="location-service-receipt" role="status" data-quick-service-receipt>{{ localActivityReceipt }}</p><LocationServices :model="model" :actions="actions" :novel-mode="novelMode" @enter="enterInterior" @law="openWindow('law')" @map="openWindow('map')" @store="openStore" @stationery="openStationery" @books="openBookReading" @activities="openLocationActivities" /></div>
      <div v-else class="window-content"><WorldPanels :panel="activeWindow" :model="model" :actions="actions" :novel-mode="novelMode" :refresh-token="graphicsRevision" @travelled="mapTravelled" @compose="name => prepareAction(`给${name}发消息：`)" @invitations="openWindow('invitations')" @transit="openWindow('transit')" @store="openStore" @inventory="openWindow('inventory')" @phone="openWindow('phone')" @stock="openPhoneStock" /></div>
    </section>
    </div>
    <ProtagonistSwitchOverlay v-if="switchingLease" ref="switchOverlay" :lease="switchingLease" :novel-mode="novelMode" :hour="model.state.clock.hour" :scene="scene" @finished="switchingLease = null; nextTick(() => shell?.querySelector<HTMLElement>('[data-protagonist-select]')?.focus({ preventScroll: true }))" @exit="actions.exit()" />
    <div v-if="mysteryDialog" class="mystery-visitor-mask" data-mystery-visitor-dialog role="dialog" aria-modal="true" :aria-label="mysteryDialog === 'second' ? SECOND_MYSTERY_VISITOR_NAME : MYSTERY_VISITOR_NAME">
      <section class="mystery-visitor-panel">
        <img :src="mysteryDialog === 'second' ? secondMysteryVisitorPortrait : mysteryVisitorPortrait" alt="神秘访客的全身形象" draggable="false" />
        <div class="mystery-visitor-copy">
          <small>极其罕见的相遇</small>
          <h2>{{ mysteryDialog === 'second' ? SECOND_MYSTERY_VISITOR_NAME : MYSTERY_VISITOR_NAME }}</h2>
          <p v-if="mysteryDialog === 'second'">“Max 20x、KYC、Last Decision。今天它们是你的了。”</p>
          <p v-else>“我这里有一些特别的东西。你愿意收下吗？”</p>
          <p v-if="mysteryGiftReceipt" data-mystery-gift-receipt role="status">{{ mysteryGiftReceipt }}</p>
          <div class="mystery-visitor-actions">
            <button v-if="!mysteryGiftReceipt" type="button" data-claim-mystery-gift :disabled="model.busy" @click="claimMysteryGift">收下礼物</button>
            <button v-if="mysteryGiftReceipt" type="button" @click="mysteryDialog=null; openWindow('inventory')">查看背包</button>
            <button type="button" data-close-mystery-visitor @click="mysteryDialog=null">{{ mysteryGiftReceipt ? '离开' : '暂时告别' }}</button>
          </div>
        </div>
      </section>
    </div>
    <div v-if="editingStoryId" class="story-editor-mask" data-story-editor @click.self="cancelStoryEdit">
      <section class="story-editor-dialog" role="dialog" aria-modal="true" aria-label="编辑剧情消息" @keydown.ctrl.enter.prevent="saveStoryEdit">
        <header><h2>编辑{{ editingStoryRole === 'user' ? '你的行动' : '剧情回复' }}</h2><button type="button" aria-label="关闭剧情编辑" @click="cancelStoryEdit">×</button></header>
        <label for="uc-story-edit-input">正文</label>
        <textarea id="uc-story-edit-input" data-story-edit-input v-model="editingStoryDraft"
          :maxlength="editingStoryRole === 'user' ? 2000 : 6000" rows="10"
          aria-label="编辑剧情正文"></textarea>
        <p class="story-editor-advice">修改仅影响这条消息的文字。已经发生的事情及其他记录会保留原样。</p>
        <p v-if="editingStoryError" class="story-editor-error" role="alert">{{ editingStoryError }}</p>
        <footer><span>{{ editingStoryDraft.length }} / {{ editingStoryRole === 'user' ? 2000 : 6000 }} 字</span><button type="button" @click="cancelStoryEdit">取消</button><button type="button" class="story-editor-save" :disabled="model.busy || !editingStoryDraft.trim()" @click="saveStoryEdit">保存修改</button></footer>
      </section>
    </div>
    <InteractionOverlay :model="model" :actions="actions" />
    <AcademicSetup v-if="!model.state.academics" :model="model" :actions="actions" />
    <PhonePerspectiveReader v-if="phonePerspective" :key="phonePerspective.entry.id + ':' + model.phoneSceneJump?.token"
      :text="phonePerspective.entry.text" :viewpoint="phonePerspective.viewpoint" @close="closePhonePerspective" />
  </div>
</template>



<style scoped>
 .mystery-visitor-mask{position:fixed;inset:0;z-index:160;display:flex;align-items:center;justify-content:center;background:#070911c9;padding:16px}
.mystery-visitor-panel{display:flex;align-items:stretch;gap:22px;max-width:min(680px,95vw);max-height:88vh;overflow:auto;padding:20px;background:linear-gradient(140deg,#1c2439,#131823);border:1px solid #79839a75;border-radius:18px;color:#f2f4fc;box-shadow:0 12px 70px #000a}
.mystery-visitor-panel img{height:clamp(200px,48vh,480px);width:auto;max-width:45%;object-fit:contain;align-self:center}
.mystery-visitor-copy{flex:1;min-width:170px;display:flex;flex-direction:column;justify-content:center;gap:14px}
.mystery-visitor-copy h2{font-size:23px;margin:0}
.mystery-visitor-copy p{font-size:14px;line-height:1.65;margin:0}
.mystery-visitor-copy small{letter-spacing:.12em;color:#becbe9}
.mystery-visitor-actions{display:flex;flex-wrap:wrap;gap:8px}
.mystery-visitor-actions button{padding:9px 14px;border-radius:9px;border:1px solid #a7b6d7;color:#fff;background:#455578;cursor:pointer}
.mystery-visitor-actions button:last-child{background:#ffffff10}
@media(max-width:450px){.mystery-visitor-panel{gap:8px;padding:12px}.mystery-visitor-panel img{max-width:42%;max-height:40vh}.mystery-visitor-copy{min-width:0}.mystery-visitor-copy h2{font-size:18px}}
.novel-appointment-prompt{margin:6px 12px 8px;padding:10px 14px;background:color-mix(in srgb,var(--card,#fff) 88%,#c6a65d);border:1px solid #9d8a6a66;border-radius:12px;box-shadow:0 3px 14px #0001;position:relative;z-index:1}
.novel-appointment-prompt p{margin:0 0 8px;font-size:13px;line-height:1.45;color:inherit}
.novel-appointment-prompt div{display:flex;flex-wrap:wrap;gap:9px}
.novel-appointment-prompt button{border:1px solid #987b5480;border-radius:8px;min-height:36px;padding:6px 12px;background:#b7976c26;color:inherit;cursor:pointer}
.novel-appointment-prompt button:disabled{opacity:.5;cursor:default}
</style>

