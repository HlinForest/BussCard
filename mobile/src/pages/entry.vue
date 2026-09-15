<!-- 录入：拍照/相册 → 自动框选/手动补框 → 整图或逐框识别 → 草稿核对 → 批量保存。
拍照后立即落草稿到 KV，杀进程重启可继续（spec）。 -->
<template>
  <view>
    <view class="kicker">CAPTURE</view>
    <view class="toolbar">
      <button class="primary" @tap="shoot('camera')">拍照识别</button>
      <button class="rowbtn" @tap="shoot('album')">相册选图</button>
    </view>
    <view v-if="photo" class="muted">已选照片，框可拖动调整；识别失败/漏卡时补框后按框重识别</view>
    <BoxEditor v-if="photo" :src="photo" v-model="boxes" @remove="boxes.splice($event, 1)" />
    <view v-if="photo" class="toolbar">
      <button class="rowbtn" @tap="addBox">补框</button>
      <button class="rowbtn" @tap="recognizeAll">整图识别</button>
      <button class="rowbtn" @tap="recognizeByBoxes">按框逐张识别</button>
    </view>
    <view v-if="busy" class="muted">识别中，请稍候…</view>
    <view v-for="(d, i) in drafts" :key="i" class="draft">
      <view class="aname">{{ d.fields.name || '（待核对）' }} <text class="muted">#{{ i + 1 }}</text></view>
      <view class="field" v-for="k in textKeys" :key="k">
        <text>{{ k }}</text>
        <input v-model="d.fields[k]" @input="autosave" />
      </view>
      <view v-if="d.issues.length" class="issues">{{ d.issues.join('；') }}</view>
      <view v-if="d.duplicates.length" class="dups">
        疑似重复：{{ d.duplicates.map((x) => `${x.name}@${x.company}（${x.reason}）`).join('；') }}
      </view>
    </view>
    <view v-if="drafts.length" class="toolbar"><button class="primary" @tap="saveAll">批量保存</button></view>
    <canvas canvas-id="entryCanvas" style="position:fixed;left:-9999px;width:300px;height:300px;" />
    <canvas canvas-id="cropCanvas" style="position:fixed;left:-9999px;width:300px;height:300px;" />
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import BoxEditor from '../components/BoxEditor.vue';
import type { Box, ContactDraft, ContactFields } from '../types';
import { db, kv, sec, http, cardFiles, nativeDetect } from '../services/app';
import { recognizePhotoMulti, recognizeCrop, emptyFields } from '../services/llm';
import { validateFields } from '../services/validate';
import { createContact, findDupCandidates } from '../services/contacts';
import { loadLlmConfig } from '../services/settings';
import { DRAFT_KEY, photoName, cropName } from '../services/images';

const textKeys = ['name', 'company', 'title', 'phone1', 'phone2', 'email', 'address',
  'business', 'event', 'met_at', 'notes'] as Array<keyof ContactFields>;
const photo = ref('');
const photoAbs = ref('');
const boxes = ref<Box[]>([]);
const drafts = ref<ContactDraft[]>([]);
const busy = ref(false);

function rand() { return Math.random().toString(36).slice(2, 8); }

async function shoot(source: 'camera' | 'album') {
  uni.chooseImage({
    count: 1, sourceType: [source === 'camera' ? 'camera' : 'album'],
    success: async (r: any) => {
      const tmp: string = r.tempFilePaths[0];
      // 落私有目录 + 立即存草稿占位（杀进程可恢复）
      const rel = photoName(Date.now(), rand());
      const saved = await copyToPrivate(tmp, rel);
      photoAbs.value = saved.abs;
      photo.value = saved.abs;
      boxes.value = nativeDetect(saved.abs, 10);
      if (!boxes.value.length) boxes.value = [{ x: 10, y: 10, w: 980, h: 980 }];
      autosave();
      recognizeAll();
    },
    fail: () => uni.showToast({ title: '未选择照片', icon: 'none' }),
  });
}

async function copyToPrivate(tmp: string, rel: string): Promise<{ abs: string }> {
  return new Promise((resolve, reject) => {
    uni.getFileSystemManager().saveFile({
      tempFilePath: tmp,
      success: (r: any) => resolve({ abs: r.savedFilePath as string }),
      fail: reject,
    });
    void rel;
  });
}

async function dataUrlOf(absPath: string, maxSide = 1400): Promise<string> {
  // canvas 等比缩放后转 base64（真机）；失败抛错由调用方保留草稿
  const info: any = await new Promise((res, rej) => uni.getImageInfo({ src: absPath, success: res, fail: rej }));
  const scale = Math.min(1, maxSide / Math.max(info.width, info.height));
  const w = Math.round(info.width * scale), h = Math.round(info.height * scale);
  const ctx: any = uni.createCanvasContext('entryCanvas');
  ctx.drawImage(absPath, 0, 0, w, h);
  await new Promise<void>((res) => { ctx.draw(false, () => res()); });
  const out: any = await new Promise((res, rej) =>
    uni.canvasToTempFilePath({ canvasId: 'entryCanvas', destWidth: w, destHeight: h, fileType: 'jpg', quality: 0.88, success: res, fail: rej }));
  const b64: any = await new Promise((res, rej) =>
    uni.getFileSystemManager().readFile({ filePath: out.tempFilePath, encoding: 'base64', success: res, fail: rej }));
  return 'data:image/jpeg;base64,' + (b64.data as string);
}

function toDraft(fields: ContactFields, box: Box | null, crop: string): ContactDraft {
  return { box, crop_path: crop, fields: { ...fields, status: '' }, issues: [], duplicates: [] };
}

async function fillDraft(d: ContactDraft) {
  const v = validateFields(d.fields);
  d.fields.status = v.status;
  d.issues = [...v.issues, ...(d.fields._error ? [d.fields._error as string] : [])];
  d.duplicates = await findDupCandidates(db(), d.fields);
}

async function recognizeAll() {
  if (!photoAbs.value || busy.value) return;
  busy.value = true;
  try {
    const cfg = await loadLlmConfig(kv(), sec());
    if (!cfg.api_key) {
      drafts.value = [toDraft({ ...emptyFields(true), notes: '未配接口：手工录入后保存' }, null, '')];
    } else {
      const cards = await recognizePhotoMulti(http(), await dataUrlOf(photoAbs.value), cfg);
      drafts.value = cards.length ? cards.map((f) => toDraft(f, null, '')) : [toDraft(emptyFields(true), null, '')];
    }
    for (const d of drafts.value) await fillDraft(d);
    autosave();
  } catch (e: any) {
    uni.showToast({ title: '识别失败，已保留草稿可重试', icon: 'none' });
    if (!drafts.value.length) drafts.value = [toDraft(emptyFields(true), null, '')];
    autosave();
  } finally {
    busy.value = false;
  }
}

async function recognizeByBoxes() {
  if (!photoAbs.value || busy.value || !boxes.value.length) return;
  busy.value = true;
  try {
    const cfg = await loadLlmConfig(kv(), sec());
    const out: ContactDraft[] = [];
    for (let i = 0; i < Math.min(boxes.value.length, 10); i++) {
      const b = boxes.value[i];
      try {
        // 包围盒裁切（canvas），失败回退整图
        const cropAbs = await cropBox(b, i);
        const fields = cfg.api_key
          ? await recognizeCrop(http(), await dataUrlOf(cropAbs), cfg)
          : emptyFields(true);
        out.push(toDraft(fields, b, cropAbs));
      } catch (e: any) {
        const f = emptyFields();
        (f as any)._error = `识别失败：${String(e?.message ?? e).slice(0, 200)}`;
        out.push(toDraft(f, b, ''));
      }
    }
    drafts.value = out;
    for (const d of drafts.value) await fillDraft(d);
    autosave();
  } finally {
    busy.value = false;
  }
}

async function cropBox(b: Box, i: number): Promise<string> {
  // 包围盒裁切：相对坐标换算像素后 canvas 裁出，存沙箱 crop 目录；失败抛错由调用方回退。
  const info: any = await new Promise((res, rej) => uni.getImageInfo({ src: photoAbs.value, success: res, fail: rej }));
  const sx = Math.round((b.x / 1000) * info.width);
  const sy = Math.round((b.y / 1000) * info.height);
  const sw = Math.round((b.w / 1000) * info.width);
  const sh = Math.round((b.h / 1000) * info.height);
  const ctx: any = uni.createCanvasContext('cropCanvas');
  ctx.drawImage(photoAbs.value, sx, sy, sw, sh, 0, 0, sw, sh);
  await new Promise<void>((res) => { ctx.draw(false, () => res()); });
  const out: any = await new Promise((res, rej) =>
    uni.canvasToTempFilePath({ canvasId: 'cropCanvas', fileType: 'jpg', quality: 0.9, success: res, fail: rej }));
  const rel = cropName(Date.now(), Math.random().toString(36).slice(2, 8), i);
  const saved: any = await new Promise((res, rej) =>
    uni.getFileSystemManager().saveFile({ tempFilePath: out.tempFilePath, success: res, fail: rej }));
  void rel;
  return saved.savedFilePath as string;
}

function addBox() {
  boxes.value = [...boxes.value, { x: 350, y: 350, w: 300, h: 180 }];
}

async function autosave() {
  try {
    await kv().set(DRAFT_KEY, JSON.stringify({ photo: photoAbs.value, boxes: boxes.value, drafts: drafts.value }));
  } catch { /* 草稿保存失败不打断主流程 */ }
}

async function restore() {
  try {
    const raw = await kv().get(DRAFT_KEY);
    if (!raw) return;
    const d = JSON.parse(raw);
    photoAbs.value = d.photo ?? '';
    photo.value = d.photo ?? '';
    boxes.value = d.boxes ?? [];
    drafts.value = d.drafts ?? [];
  } catch { /* 损坏草稿直接丢弃 */ }
}

async function saveAll() {
  if (!drafts.value.length) return;
  uni.showLoading({ title: '保存中' });
  try {
    for (const d of drafts.value) {
      await createContact(db(), { ...d.fields, photo_path: photoAbs.value, crop_path: d.crop_path });
    }
    drafts.value = [];
    boxes.value = [];
    await kv().del(DRAFT_KEY);
    uni.showToast({ title: '已保存' });
    uni.switchTab({ url: '/pages/cards' });
  } finally {
    uni.hideLoading();
  }
}

onShow(restore);
</script>

<style scoped>
.draft { background: #fafbfb; border: 1px solid #d3d8dd; border-radius: 12px;
  padding: 12px; margin: 12px 16px; }
.aname { font-size: 19px; font-weight: 700; margin-bottom: 6px; }
.issues { color: #9a5b12; font-size: 13px; margin-top: 6px; }
.dups { color: #002fa7; font-size: 13px; margin-top: 4px; }
</style>
<canvas canvas-id="entryCanvas" style="position:fixed;left:-9999px;width:300px;height:300px;" />
</template>
