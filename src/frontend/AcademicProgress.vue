<script setup lang="ts">
import { computed } from 'vue';
import { crossMajorOutcomes, getAcademicOverview, getAcademicSubjectById } from '../runtime/academics';
import { formatGameNumber } from './format-game-number';
import type { WorldState } from './types';
const props = defineProps<{ academics: WorldState['academics'] }>();
const overview = computed(() => getAcademicOverview(props.academics));
const groups = computed(() => overview.value ? [
  { id: 'major', name: '专业课程', items: overview.value.subjects.filter(item => item.isMajorSubject) },
  { id: 'explored', name: '跨专业探索', items: overview.value.subjects.filter(item => !item.isMajorSubject) },
] : []);
const lastGain = computed(() => overview.value?.lastGain);
const lastSubject = computed(() => lastGain.value ? getAcademicSubjectById(lastGain.value.subjectId) : null);
const outcomeLabel = computed(() => lastGain.value?.outcome ? crossMajorOutcomes.find(item => item.id === lastGain.value!.outcome)?.label ?? '普通' : '历史学习');
const channelLabels: Record<string,string> = { classroom: '教室', 'study-room': '图书馆', bookshop: '书店' };
const channelLabel = computed(() => channelLabels[lastGain.value?.channel ?? ''] ?? '已保存记录');
function signed(value: number) { return `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatGameNumber(Math.abs(value))}`; }
</script>

<template>
  <section v-if="overview" class="academic-overview" data-academic-progress aria-label="学业进度">
    <header class="academic-overview-heading"><div><small>主修专业</small><h2 data-academic-major-name>{{ overview.major.name }}</h2></div><p><strong data-academic-total-points>{{ formatGameNumber(overview.totalPoints) }}</strong><small>累计学习点</small></p></header>
    <section v-for="group in groups.filter(item => item.items.length)" :key="group.id" class="academic-progress-group" :data-academic-group="group.id"><h3>{{ group.name }}</h3><div class="academic-progress-grid">
      <article v-for="progress in group.items" :key="progress.subject.id" class="academic-progress" :data-academic-subject="progress.subject.id"><header><div><small v-if="!progress.isMajorSubject">{{ progress.major.name }}</small><h2 data-academic-subject-name>{{ progress.subject.name }}</h2></div><span class="academic-stage" data-academic-stage>{{ progress.stageLabel }}</span></header><p class="academic-points"><strong data-academic-points>{{ formatGameNumber(progress.points) }}</strong><span>学习点<template v-if="progress.nextTarget !== null"> / 下一阶段 {{ progress.nextTarget }}</template></span></p><div class="academic-progress-track" role="progressbar" :aria-label="progress.subject.name + '阶段进度'" :aria-valuenow="progress.percent" aria-valuemin="0" aria-valuemax="100"><span :style="{ width: progress.percent + '%' }"></span></div><p class="academic-goal" data-academic-goal>{{ progress.goal }}</p><p class="academic-remaining">{{ progress.nextTarget === null ? '已完成阶段目标，仍可继续积累。' : `还需 ${formatGameNumber(progress.remaining)} 点进入下一阶段。` }}</p></article>
    </div></section>
    <article v-if="lastGain && lastSubject" class="academic-recent-result" :data-academic-outcome="lastGain.outcome ?? 'historical'" data-academic-last-gain><header><h3>最近一次 · {{ outcomeLabel }}</h3><small>{{ channelLabel }} · {{ lastGain.at }}</small></header><p>{{ lastSubject.name }} · {{ lastGain.minutes }} 分钟 · 获得 {{ formatGameNumber(lastGain.points) }} 点 · 该科累计 {{ formatGameNumber(lastGain.totalPoints) }} 点</p><p v-if="lastGain.energyConsumed !== null" class="academic-result-effects">精力 −{{ formatGameNumber(lastGain.energyConsumed) }}<template v-if="lastGain.moraleChange !== null"> · 精神 {{ signed(lastGain.moraleChange) }}</template><template v-if="lastGain.stressChange !== null"> · 压力 {{ signed(lastGain.stressChange) }}</template></p><small v-else>旧记录未保存随机结果与身心变化，不作补算。</small></article>
    <p class="academic-rule">各科进度分别保存；专业课程每分钟获得 1 点，跨专业阅读按当次结果结算。查看课表、前往课程地点和完成日程都不自动增加学习点。</p>
  </section>
</template>
