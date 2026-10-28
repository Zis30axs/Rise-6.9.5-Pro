<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import LongTermMemorySettings from './LongTermMemorySettings.vue';
import { DEFAULT_STORY_API, loadStoryApiKey, loadStoryApiSettings, requestStoryFromCustomApi, saveStoryApiKey, saveStoryApiSettings } from '../runtime/story-api';
import type { StoryApiSettings } from '../runtime/story-api';

defineProps<{ memoryScope?: string }>();
const settings = ref<StoryApiSettings>(loadStoryApiSettings());
const secret = ref(loadStoryApiKey());
const notice = ref('');
const testing = ref(false);
let pendingTest: AbortController | undefined;
function message(error: unknown): string {
  return error instanceof Error ? error.message : '操作失败，请检查本机浏览器存储。';
}
function save(): boolean {
  notice.value = '';
  try {
    saveStoryApiSettings(settings.value);
    saveStoryApiKey(secret.value.trim());
    notice.value = '叙事引擎设置已保存；下一次生成开始生效。';
    return true;
  } catch (error) {
    notice.value = message(error);
    return false;
  }
}
async function test() {
  if (testing.value || settings.value.mode !== 'custom' || !save()) return;
  const controller = new AbortController();
  pendingTest = controller;
  testing.value = true;
  notice.value = '正在验证独立 API；这会产生一次模型请求。';
  try {
    const answer = await requestStoryFromCustomApi(
      settings.value, '请回复「连接成功」。', '这是一条独立 API 连通性测试，不需要剧情或游戏行动。请回复「连接成功」。',
      controller.signal,
    );
    if (!controller.signal.aborted) notice.value = answer.trim() ? '独立 API 已返回可读取的文本。' : '模型未返回文本。';
  } catch (error) { if (!controller.signal.aborted) notice.value = message(error); }
  finally { if (pendingTest === controller) pendingTest = undefined; testing.value = false; }
}
function reset() {
  pendingTest?.abort();
  settings.value = { ...DEFAULT_STORY_API };
  secret.value = '';
  save();
}
onBeforeUnmount(() => pendingTest?.abort());
</script>

<template>
  <section class="uc-narrative-settings" data-story-api-settings aria-label="独立叙事引擎">
    <div class="uc-narrative-heading"><h2>独立叙事引擎</h2><small>仅作用于《未读之城》，不更改酒馆主预设</small></div>
    <label>请求来源
      <select v-model="settings.mode" data-story-api-mode>
        <option value="tavern">使用酒馆当前模型（兼容模式）</option>
        <option value="custom">独立 API / 独立预设</option>
      </select>
    </label>
    <template v-if="settings.mode === 'custom'">
      <p class="uc-narrative-note">直接从当前设备请求接口，需要服务端允许跨域（CORS）；不会静默回退到主模型。</p>
      <label>接口格式
        <select v-model="settings.format" data-story-api-format>
          <option value="chat">OpenAI Chat Completions</option>
          <option value="responses">OpenAI Responses</option>
        </select>
      </label>
      <label>API 地址
        <input v-model="settings.endpoint" data-story-api-endpoint inputmode="url" autocomplete="off" spellcheck="false" placeholder="https://example.com/v1" />
      </label>
      <label>模型 ID
        <input v-model="settings.model" data-story-api-model autocomplete="off" spellcheck="false" placeholder="模型标识符" />
      </label>
      <label>API Key（仅在当前标签页会话中保存）
        <input v-model="secret" data-story-api-key type="password" autocomplete="off" spellcheck="false" placeholder="可留空（无需认证的接口）" />
      </label>
      <label>独立叙事预设（可选）
        <textarea v-model="settings.preset" data-story-api-preset rows="4" maxlength="4000" placeholder="角色性格、写作节奏、叙述风格等。格式与世界状态规则依然优先。" />
      </label>
      <p class="uc-narrative-note">自定义预设只加入角色卡自己的系统提示；场景、行动和手机消息仍由本地规则严格校验。</p>
    </template>
    <div class="uc-narrative-buttons">
      <button type="button" data-story-api-save @click="save">保存设置</button>
      <button v-if="settings.mode === 'custom'" type="button" data-story-api-test :disabled="testing" @click="test">{{ testing ? '测试中…' : '测试 API（消耗一次请求）' }}</button>
      <button type="button" data-story-api-reset :disabled="testing" @click="reset">恢复酒馆模型</button>
    </div>
    <p v-if="notice" class="uc-narrative-notice" role="status">{{ notice }}</p>
    <LongTermMemorySettings :scope="memoryScope || ''" />
  </section>
</template>