<!-- 手动框选编辑器：拖动移动、右下角手柄缩放、补框删框；失败回退整图由调用方处理 -->
<template>
  <view class="wrap">
    <image :src="src" mode="widthFix" class="photo" @load="onLoad" />
    <view class="layer">
      <view v-for="(b, i) in modelValue" :key="i" class="box"
        :style="{ left: b.x / 10 + '%', top: b.y / 10 + '%', width: b.w / 10 + '%', height: b.h / 10 + '%' }"
        @touchstart.stop="startMove($event, i)" @touchmove.stop="onMove" @touchend="endTouch">
        <text class="tag">#{{ i + 1 }}</text>
        <text class="del" @tap.stop="$emit('remove', i)">×</text>
        <text class="rs" @touchstart.stop="startResize($event, i)"></text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { Box } from '../src/types';

const props = defineProps<{ src: string; modelValue: Box[] }>();
const emit = defineEmits<{
  (e: 'update:modelValue', v: Box[]): void;
  (e: 'remove', i: number): void;
}>();

const wrapW = ref(1000);
function onLoad(e: any) { wrapW.value = e.detail?.width || 1000; }

let drag: null | { mode: 'move' | 'resize'; i: number; sx: number; sy: number; box: Box } = null;
function pt(e: any) {
  const t = e.touches[0];
  return { x: (t.clientX / wrapW.value) * 1000, y: (t.clientY / wrapW.value) * 1000 };
}
function startMove(e: any, i: number) {
  const p = pt(e);
  drag = { mode: 'move', i, sx: p.x, sy: p.y, box: { ...props.modelValue[i] } };
}
function startResize(e: any, i: number) {
  const p = pt(e);
  drag = { mode: 'resize', i, sx: p.x, sy: p.y, box: { ...props.modelValue[i] } };
}
function onMove(e: any) {
  if (!drag) return;
  const p = pt(e);
  const dx = p.x - drag.sx, dy = p.y - drag.sy;
  const next = props.modelValue.map((b) => ({ ...b }));
  const b = next[drag.i];
  if (drag.mode === 'move') {
    b.x = Math.min(950, Math.max(0, Math.round(drag.box.x + dx)));
    b.y = Math.min(950, Math.max(0, Math.round(drag.box.y + dy)));
  } else {
    b.w = Math.min(1000 - b.x, Math.max(30, Math.round(drag.box.w + dx)));
    b.h = Math.min(1000 - b.y, Math.max(30, Math.round(drag.box.h + dy)));
  }
  emit('update:modelValue', next);
}
function endTouch() { drag = null; }
</script>

<style scoped>
.wrap { position: relative; margin: 12px 16px; background: #fafbfb;
  border: 1px solid #d3d8dd; border-radius: 12px; overflow: hidden; }
.photo { width: 100%; display: block; }
.layer { position: absolute; left: 0; top: 0; right: 0; bottom: 0; }
.box { position: absolute; border: 2px solid #1d2126; background: rgba(29,33,38,.08); }
.tag { position: absolute; top: -22px; left: 0; background: #1d2126; color: #f2f4f5;
  font-size: 12px; padding: 1px 7px; border-radius: 6px; }
.del { position: absolute; top: -24px; right: 0; background: #002fa7; color: #fff;
  font-size: 12px; padding: 1px 8px; border-radius: 6px; }
.rs { position: absolute; right: -8px; bottom: -8px; width: 16px; height: 16px;
  background: #fafbfb; border: 2px solid #1d2126; border-radius: 50%; }
</style>
