<script setup lang="ts">
import SoyoLive2D from './SoyoLive2D.vue';
import NovelLive2DPortrait from './NovelLive2DPortrait.vue';
import NovelNpcPortrait from './NovelNpcPortrait.vue';
import type { NovelInvitationPortraitPair, NovelInvitationPortraitFocus } from './novel-invitation-portraits';

defineProps<{
  pair: NovelInvitationPortraitPair;
  focus: NovelInvitationPortraitFocus;
  locationId: string;
  active: boolean;
  refreshToken?: number;
}>();
</script>

<template>
  <div class="novel-invitation-portraits" :data-invitation-pair="pair.invitationId"
    :data-left-actor="pair.left.id" :data-right-actor="pair.right.id"
    :data-speaking-side="focus.speaking ?? 'narration'" aria-hidden="true">
    <div class="novel-invitation-portraits__side" data-invitation-side="left"
      :class="{ 'is-speaking': focus.speaking === 'left' }">
      <NovelLive2DPortrait v-if="pair.left.live2d" :speaker="pair.left.speaker" :emotion="focus.leftEmotion" :active="active" :dimmed="focus.speaking !== 'left'" :refresh-token="refreshToken">
      <SoyoLive2D :speaker="pair.left.speaker" :emotion="focus.leftEmotion"
        :refresh-token="refreshToken"
        :active="active" :dimmed="focus.speaking !== 'left'" />
      </NovelLive2DPortrait>
      <NovelNpcPortrait v-else :portrait-id="pair.left.portraitId" :speaker="pair.left.speaker"
        :emotion="focus.leftEmotion" :location-id="locationId"
        :active="active" :dimmed="focus.speaking !== 'left'" />
    </div>
    <div class="novel-invitation-portraits__side" data-invitation-side="right"
      :class="{ 'is-speaking': focus.speaking === 'right' }">
      <NovelLive2DPortrait v-if="pair.right.live2d" :speaker="pair.right.speaker" :emotion="focus.rightEmotion" :active="active" :dimmed="focus.speaking !== 'right'" :refresh-token="refreshToken">
      <SoyoLive2D :speaker="pair.right.speaker" :emotion="focus.rightEmotion"
        :refresh-token="refreshToken"
        :active="active" :dimmed="focus.speaking !== 'right'" />
      </NovelLive2DPortrait>
      <NovelNpcPortrait v-else :portrait-id="pair.right.portraitId" :speaker="pair.right.speaker"
        :emotion="focus.rightEmotion" :location-id="locationId"
        :active="active" :dimmed="focus.speaking !== 'right'" />
    </div>
  </div>
</template>
