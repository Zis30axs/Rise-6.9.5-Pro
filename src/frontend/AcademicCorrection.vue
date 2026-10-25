<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { academicMajors, getAcademicMajor } from '../runtime/academics';
import { activeProtagonist, protagonistNames } from '../runtime/protagonist-world';
import type { ShellActions, ShellModel } from './types';

const props = defineProps<{ model: ShellModel; actions: ShellActions }>();
const currentOwner = computed(() => activeProtagonist(props.model.state));
const currentMajorId = computed(() => props.model.state.academics?.majorId ?? '');
const selectedMajorId = ref(currentMajorId.value);
const keepProgress = ref(true);
const confirming = ref(false);
const currentMajor = computed(() => getAcademicMajor(currentMajorId.value));
const targetMajor = computed(() => getAcademicMajor(selectedMajorId.value));
const savedPoints = computed(() => props.model.state.academics?.subjects.reduce((sum, row) => sum + row.points, 0) ?? 0);
const unavailable = computed(() => props.model.busy || !!props.model.interaction || !!props.model.switchingProtagonist);
const canChange = computed(() => !!targetMajor.value && (!keepProgress.value || selectedMajorId.value !== currentMajorId.value));

watch([currentOwner, currentMajorId], () => {
  selectedMajorId.value = currentMajorId.value;
  keepProgress.value = true;
  confirming.value = false;
});
watch([selectedMajorId, keepProgress], () => { confirming.value = false; });

function submit() {
  if (unavailable.value || !props.model.state.academics || !canChange.value) return;
  if (!confirming.value) { confirming.value = true; return; }
  props.actions.dispatch({ type: 'correct_academics', majorId: selectedMajorId.value, keepProgress: keepProgress.value });
  confirming.value = false;
}
</script>

<template>
  <details v-if="model.state.academics" class="academic-correction" data-academic-correction>
    <summary>修正专业（旧存档）</summary>
    <div class="academic-correction-content">
      <p>早期版本可能错误地将一位主角的专业复制给其他人。这里只更正<strong>{{ protagonistNames[currentOwner] }}</strong>的专业，不修改其他主角的选择、故事或账户。更正前建议备份存档。</p>
      <label class="academic-correction-field">
        <span>更正为</span>
        <select v-model="selectedMajorId" data-academic-correction-major :disabled="unavailable">
          <option v-for="major in academicMajors" :key="major.id" :value="major.id">{{ major.name }}</option>
        </select>
      </label>
      <label class="academic-correction-keep">
        <input v-model="keepProgress" type="checkbox" data-academic-correction-keep :disabled="unavailable" />
        <span>保留已获得的学习点（旧专业学习点转为跨专业记录）</span>
      </label>
      <p>当前：{{ currentMajor?.name }}，累计 {{ savedPoints }} 点。{{ keepProgress ? '将保留有效的累计点数，但清除最近一次学习结果。' : '将清零此角色的全部学业进度和最近一次学习结果。' }}</p>
      <p v-if="confirming" class="academic-correction-warning" role="alert">请再次确认：仅更正{{ protagonistNames[currentOwner] }}，专业更改为{{ targetMajor?.name }}，{{ keepProgress ? '保留学习点' : '清零学习点' }}。保存后不能自动撤销。</p>
      <div class="academic-correction-buttons">
        <button type="button" data-academic-correction-confirm :disabled="unavailable || !canChange" @click="submit">{{ confirming ? '确认执行更正' : '检查更正内容' }}</button>
        <button v-if="confirming" type="button" data-academic-correction-cancel @click="confirming = false">取消</button>
      </div>
    </div>
  </details>
</template>
