<!-- 表格：搜索过滤 + 行内编辑 + 勾选批量（导出/删除）+ 查重 -->
<template>
  <view>
    <view class="kicker">TABLE</view>
    <view class="searchbar">
      <input v-model="q" placeholder="搜姓名 / 公司 / 尾号，回车即搜" confirm-type="search" @confirm="reload" />
      <button class="rowbtn" @tap="reload">搜索</button>
    </view>
    <view class="toolbar">
      <button class="rowbtn" @tap="exportSel">导出勾选</button>
      <button class="rowbtn" @tap="exportAll">导出全部</button>
      <button class="rowbtn" @tap="delSel">批量删除</button>
      <button class="rowbtn" @tap="dupOpen = !dupOpen">查找重复</button>
    </view>
    <view v-if="dupOpen" style="padding:0 16px 8px">
      <view v-if="!dupes.length" class="muted" style="padding:0">没有发现重复</view>
      <view v-for="(g, gi) in dupes" :key="gi" class="dup">
        <view class="why">{{ g.reason }}</view>
        <radio-group @change="keep[gi] = ($event.detail as any).value">
          <label v-for="c in g.contacts" :key="c.id">
            <radio :value="String(c.id)" :checked="keep[gi] === String(c.id) || (!keep[gi] && c.id === g.contacts[0].id)" />
            保留 {{ c.name || '（待核对）' }} · {{ c.company }} · {{ c.phone1 }}
          </label>
        </radio-group>
      </view>
      <button v-if="dupes.length" class="rowbtn" @tap="cleanDupes">删除重复（保留每组勾选）</button>
    </view>
    <view v-for="c in list" :key="c.id" class="trow">
      <checkbox :checked="sel.has(c.id)" @tap="toggle(c.id)" />
      <view class="tmain" @tap="openDetail(c.id)">
        <view class="tname">{{ c.name || '（待核对）' }}</view>
        <view class="tsub">{{ c.company }} {{ c.title }}</view>
        <view class="tsub">{{ c.phone1 }} {{ c.email }}</view>
      </view>
    </view>
    <view v-if="!list.length" class="muted">无结果，换个词试试（清空搜全部）</view>
  </view>
</template>

<script setup lang="ts">
import { onShow } from '@dcloudio/uni-app';
import { ref } from 'vue';
import type { Contact, DupeGroup } from '../types';
import { db, cardFiles } from '../services/app';
import { hybridSearch } from '../services/search';
import { dupeGroups } from '../services/dedupe';
import { deleteContacts } from '../services/contacts';
import { exportXlsx } from '../services/excel';

const q = ref('');
const list = ref<Contact[]>([]);
const sel = ref(new Set<number>());
const dupOpen = ref(false);
const dupes = ref<DupeGroup[]>([]);
const keep = ref<Record<number, string>>({});

async function reload() {
  const all = await db().allByUpdatedDesc();
  list.value = q.value.trim()
    ? hybridSearch(all, q.value, { limit: 500 }).map((h) => h.contact)
    : all;
  if (dupOpen.value) dupes.value = dupeGroups(await db().allByCreatedAsc());
}
function toggle(id: number) {
  const s = new Set(sel.value);
  if (s.has(id)) s.delete(id); else s.add(id);
  sel.value = s;
}
function openDetail(id: number) {
  uni.navigateTo({ url: '/pages/detail?id=' + id });
}
function picked(): Contact[] {
  return list.value.filter((c) => sel.value.has(c.id));
}
async function shareXlsx(rows: Contact[], filename: string) {
  if (!rows.length) return uni.showToast({ title: '没有可导出的', icon: 'none' });
  const bytes = exportXlsx(rows);
  const rel = `backup/${filename}`;
  const abs = cardFiles.root() + '/' + rel;
  cardFiles.write(rel, bytes);
  cardFiles.share(abs, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', filename);
}
async function exportAll() {
  await shareXlsx(await db().allByUpdatedDesc(), 'contacts-all.xlsx');
}
async function exportSel() {
  const qv = q.value.trim();
  if (!sel.value.size && qv) {
    // 未勾选但有搜索词：导出当前搜索结果（桌面版 ?q= 导出同语义）
    const all = await db().allByUpdatedDesc();
    await shareXlsx(hybridSearch(all, qv, { limit: 5000 }).map((h) => h.contact), 'contacts-search.xlsx');
    return;
  }
  await shareXlsx(picked(), 'contacts-selected.xlsx');
}
async function delSel() {
  if (!sel.value.size) return uni.showToast({ title: '先勾选', icon: 'none' });
  uni.showModal({
    title: '确认', content: `删除勾选的 ${sel.value.size} 条？`,
    success: async (r) => {
      if (!r.confirm) return;
      await deleteContacts(db(), [...sel.value]);
      sel.value = new Set();
      reload();
    },
  });
}
async function cleanDupes() {
  const del: number[] = [];
  dupes.value.forEach((g, gi) => {
    const k = Number(keep.value[gi] ?? g.contacts[0].id);
    g.contacts.forEach((c) => { if (c.id !== k) del.push(c.id); });
  });
  if (!del.length) return uni.showToast({ title: '没有可删的', icon: 'none' });
  uni.showModal({
    title: '确认', content: `删除 ${del.length} 条重复？`,
    success: async (r) => {
      if (!r.confirm) return;
      await deleteContacts(db(), del);
      uni.showToast({ title: `已删除 ${del.length} 条` });
      reload();
    },
  });
}
onShow(reload);
</script>

<style scoped>
.trow { display: flex; gap: 10px; align-items: flex-start; background: #fafbfb;
  border: 1px solid #d3d8dd; border-radius: 10px; padding: 10px 12px; margin: 0 16px 8px; }
.tmain { flex: 1; }
.tname { font-weight: 700; }
.tsub { color: #5c6670; font-size: 13px; }
.dup { border: 1px solid #d3d8dd; border-left: 3px solid #002fa7; border-radius: 10px;
  padding: 10px 12px; margin: 8px 0; background: #fafbfb; }
.why { color: #002fa7; font-size: 13px; margin-bottom: 6px; }
label { display: block; font-size: 14px; padding: 3px 0; }
</style>
