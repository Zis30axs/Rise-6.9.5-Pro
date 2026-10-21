<script setup lang="ts">
import { computed, ref } from 'vue';
import { getAcademicTimetable } from '../runtime/academics';
import { formatGameDate, gameCalendar, gameWeekday, hasStartedAcademicWeek, registrationNotice } from '../runtime/game-calendar';
const props = defineProps<{ majorId: string; day: number; hour?: number; minute?: number; preview?: boolean; busy?: boolean; currentLocationId?: string; travelLabel?: string; blockedReason?: (locationId: string) => string | null }>();
const emit = defineEmits<{ travel: [locationId: string] }>();
const view = ref<'today' | 'week'>(props.preview ? 'week' : 'today');
const weekday = computed(() => gameWeekday(props.day));
const calendar = computed(() => gameCalendar(props.day));
const beforeLectures = computed(() => !hasStartedAcademicWeek(props.day));
const reporting = computed(() => registrationNotice(props.day));
const weekdayLabel = computed(() => calendar.value.weekdayLabel);
const timetable = computed(() => getAcademicTimetable(props.majorId));
const lessons = computed(() => view.value === 'week' ? timetable.value : beforeLectures.value ? [] : timetable.value.filter(item => item.weekday === weekday.value));
function slotStatus(lesson: (typeof timetable.value)[number]) {
  if (props.preview || beforeLectures.value || lesson.weekday !== weekday.value || props.hour === undefined) return '';
  const now = props.hour * 60 + (props.minute ?? 0);
  const toMinute = (value: string) => { const [hour,minute] = value.split(':').map(Number); return hour * 60 + minute; };
  return now < toMinute(lesson.start) ? '稍后' : now >= toMinute(lesson.end) ? '已过时段' : '当前时段';
}
</script>

<template>
  <section class="academic-timetable" data-academic-timetable aria-label="专业周课程表">
    <header><div><h2>{{ preview ? '每周课程安排' : '专业课程表' }}</h2><p>{{ formatGameDate(day) }} · {{ weekdayLabel }} · 第 {{ day }} 天</p></div><div v-if="!preview" class="academic-timetable-tabs" aria-label="课表范围"><button type="button" data-academic-timetable-view="today" :aria-pressed="view === 'today'" @click="view = 'today'">今天</button><button type="button" data-academic-timetable-view="week" :aria-pressed="view === 'week'" @click="view = 'week'">整周</button></div></header>
    <p v-if="reporting" class="academic-rule">{{ reporting }} · 正式课程尚未开始。</p>
    <div class="academic-lesson-list"><article v-for="lesson in lessons" :key="lesson.id" class="academic-lesson" :data-academic-lesson="lesson.id" :data-academic-lesson-subject="lesson.subjectId"><div class="academic-lesson-time"><strong>{{ lesson.weekdayLabel }}</strong><span>{{ lesson.start }}–{{ lesson.end }}</span><small v-if="slotStatus(lesson)">{{ slotStatus(lesson) }}</small></div><div class="academic-lesson-content"><h3>{{ lesson.subjectName }}</h3><p>{{ lesson.locationName }}</p><button v-if="!preview" type="button" :data-academic-course-travel="lesson.locationId" :disabled="busy || lesson.locationId === currentLocationId || !!blockedReason?.(lesson.locationId)" @click="emit('travel',lesson.locationId)">{{ lesson.locationId === currentLocationId ? '已在课程地点' : travelLabel ?? '前往课程地点' }} <span aria-hidden="true">↗</span></button><small v-if="!preview && blockedReason?.(lesson.locationId)" class="academic-course-blocked">{{ blockedReason(lesson.locationId) }}</small></div></article><p v-if="!lessons.length" class="academic-empty">{{ beforeLectures ? '报到前没有固定专业课，可以自由探索或准备入学。' : '今天没有固定课程，可以自主安排学习或阅读。' }}</p></div>
    <p class="academic-rule">{{ beforeLectures ? '开学后的每周课表仅供预览，不会在报到前自动执行。' : '专业课按真实星期循环，每周 6 节，每科 2 节。' }}课表只提示时间与地点；到达后选择科目和学习时长，才会结算实际学习。</p>
  </section>
</template>
