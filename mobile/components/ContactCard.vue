<!-- Anki 式文本小卡：与桌面版同字段呈现，不贴原图 -->
<template>
  <view class="acard" @tap="$emit('open', contact.id)">
    <view class="aname">{{ contact.name || '（待核对）' }}</view>
    <view class="aco">{{ [contact.company, contact.title].filter(Boolean).join(' · ') }}</view>
    <view class="arow" v-if="contact.phone1">电话 {{ contact.phone1 }}{{ contact.phone2 ? ' / ' + contact.phone2 : '' }}</view>
    <view class="arow" v-if="contact.email">邮箱 {{ contact.email }}</view>
    <view class="abiz" v-if="contact.business">{{ contact.business }}</view>
    <view class="atags" v-if="tagLine">{{ tagLine }}</view>
    <view class="astatus" :class="{ ok: contact.status === '已确认' }">{{ contact.status }}</view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Contact } from '../src/types';

const props = defineProps<{ contact: Contact }>();
defineEmits<{ (e: 'open', id: number): void }>();
const tagLine = computed(() => {
  const p = props.contact.tags_printed.join('、');
  const i = props.contact.tags_inferred.join('、');
  return [p ? '印:' + p : '', i ? '推:' + i : ''].filter(Boolean).join(' ');
});
</script>

<style scoped>
.abiz { font-size: 13px; color: #5c6670; margin-top: 7px; border-top: 1px dashed #d3d8dd; padding-top: 6px; }
.atags { font-size: 12px; color: #8b939c; margin-top: 5px; }
.astatus { display: inline-block; font-size: 12px; color: #002fa7; border: 1px solid #002fa7;
  border-radius: 6px; padding: 0 8px; margin-top: 9px; }
.astatus.ok { color: #1d2126; border-color: #1d2126; }
</style>
