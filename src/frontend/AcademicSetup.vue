<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import { academicMajors, getAcademicMajor } from '../runtime/academics';
import AcademicTimetable from './AcademicTimetable.vue';
import type { ShellActions, ShellModel } from './types';

const props = defineProps<{ model: ShellModel; actions: ShellActions }>();
const dialog = ref<HTMLElement>();
const majorId = ref('');
const attempted = ref(false);
const major = computed(() => getAcademicMajor(majorId.value));

function selectMajor(id: string) {
  if (props.model.busy || majorId.value === id) return;
  majorId.value = id;
  attempted.value = false;
}
function confirm() {
  if (props.model.busy || !major.value) return;
  attempted.value = true;
  props.actions.dispatch({ type: 'choose_academics', majorId: majorId.value });
}
function keydown(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); props.actions.exit(); return; }
  if (event.key !== 'Tab' || !dialog.value) return;
  const controls = [...dialog.value.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')].filter(node => node.getClientRects().length);
  if (!controls.length) { event.preventDefault(); return; }
  const active = (dialog.value.getRootNode() as Document | ShadowRoot).activeElement;
  const index = controls.indexOf(active as HTMLButtonElement);
  if ((event.shiftKey && index <= 0) || (!event.shiftKey && (index < 0 || index === controls.length - 1))) {
    event.preventDefault(); controls[event.shiftKey ? controls.length - 1 : 0].focus();
  }
  event.stopPropagation();
}
onMounted(async () => {
  await nextTick();
  dialog.value?.querySelector<HTMLButtonElement>('[data-academic-major]')?.focus({ preventScroll: true });
});
</script>

<template>
  <div class="academic-setup-overlay">
    <section ref="dialog" class="academic-setup" role="dialog" aria-modal="true" aria-labelledby="academic-setup-title" aria-describedby="academic-setup-description" data-academic-setup @keydown="keydown">
      <header class="academic-setup-heading">
        <small>入学档案 · 学业方向</small>
        <h1 id="academic-setup-title">选择你的专业</h1>
        <p id="academic-setup-description">每位主角独立选择专业，三门课程分别积累学习进度。确认后保存在当前主角档案中；旧存档误绑定可到个人状态页手动更正。</p>
      </header>
      <div class="academic-setup-scroll">
        <fieldset class="academic-choices">
          <legend><span>01</span> 选择专业</legend>
          <div class="academic-major-grid">
            <button v-for="item in academicMajors" :key="item.id" type="button" :data-academic-major="item.id" :aria-pressed="majorId === item.id" :disabled="model.busy" @click="selectMajor(item.id)"><strong>{{ item.name }}</strong><small>{{ item.description }}</small></button>
          </div>
        </fieldset>
        <section class="academic-curriculum-preview" aria-label="专业课程预览">
          <h2>本专业的三门课程</h2>
          <p v-if="!major" class="academic-empty">先选一个专业，查看课程与周课表。</p>
          <div v-else class="academic-subject-grid"><article v-for="item in major.subjects" :key="item.id" class="academic-preview-subject" :data-academic-preview-subject="item.id"><h3>{{ item.name }}</h3><p>{{ item.description }}</p><ol><li v-for="(goal,index) in item.stageGoals" :key="goal"><span>{{ item.stageTargets[index] }} 点</span>{{ goal }}</li></ol></article></div>
        </section>
        <AcademicTimetable v-if="major" :major-id="major.id" :day="model.state.clock.day" preview />
        <p class="academic-rule">本专业学习每完成 1 分钟获得 1 点，只增加当次所选科目的进度。在图书馆或书店也能阅读其他专业，可能获得灵感或遇到困惑；开始前会列出概率和影响。</p>
        <p v-if="attempted && model.notice" class="academic-setup-error" role="alert" data-academic-setup-error>{{ model.notice }}<span>已保留你的选择，可以重试。</span></p>
      </div>
      <footer class="academic-setup-footer">
        <button type="button" class="academic-exit" @click="actions.exit()">退出酒馆</button>
        <button type="button" class="academic-confirm" data-academic-confirm :disabled="model.busy || !major" @click="confirm">{{ attempted && model.notice ? '重试保存并开始' : '确认专业并开始' }} <span aria-hidden="true">↗</span></button>
      </footer>
    </section>
  </div>
</template>
