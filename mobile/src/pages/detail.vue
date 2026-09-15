<!-- 详情：全部字段编辑、标签、保存、删除 -->
<template>
  <view v-if="c">
    <view class="kicker">DETAIL</view>
    <view class="field" v-for="k in textKeys" :key="k">
      <text>{{ labels[k] }}</text>
      <input v-model="(c as any)[k]" />
    </view>
    <view class="field">
      <text>印刷标签（逗号分隔）</text>
      <input v-model="tagsP" />
    </view>
    <view class="field">
      <text>推断标签（逗号分隔）</text>
      <input v-model="tagsI" />
    </view>
    <view class="field"><text>状态</text><input :value="c.status" disabled /></view>
    <view class="toolbar">
      <button class="primary" @tap="save">保存</button>
      <button class="rowbtn" @tap="remove">删除</button>
    </view>
  </view>
  <view v-else class="muted">加载中…</view>
</template>

<script setup lang="ts">
import { onLoad } from '@dcloudio/uni-app';
import { ref } from 'vue';
import type { Contact } from '../types';
import { db } from '../services/app';
import { updateContact, deleteContacts } from '../services/contacts';

const textKeys = ['name', 'company', 'title', 'phone1', 'phone2', 'email', 'address',
  'business', 'event', 'met_at', 'notes'] as const;
const labels: Record<string, string> = { name: '姓名', company: '公司', title: '职位',
  phone1: '电话1', phone2: '电话2', email: '邮箱', address: '地址', business: '业务',
  event: '展会', met_at: '结识时间', notes: '备注' };
const c = ref<Contact | null>(null);
const tagsP = ref('');
const tagsI = ref('');
let id = 0;

onLoad(async (q: any) => {
  id = Number(q?.id ?? 0);
  const all = await db().allByUpdatedDesc();
  const found = all.find((x) => x.id === id) ?? null;
  c.value = found ? { ...found, tags_printed: [...found.tags_printed], tags_inferred: [...found.tags_inferred] } : null;
  if (c.value) {
    tagsP.value = c.value.tags_printed.join(',');
    tagsI.value = c.value.tags_inferred.join(',');
  }
});

async function save() {
  if (!c.value) return;
  uni.showLoading({ title: '保存中' });
  try {
    const { tags_printed: _p, tags_inferred: _i, ...rest } = c.value;
    await updateContact(db(), id, {
      ...rest,
      tags_printed: tagsP.value.split(',').map((s) => s.trim()).filter(Boolean),
      tags_inferred: tagsI.value.split(',').map((s) => s.trim()).filter(Boolean),
    });
    uni.showToast({ title: '已保存' });
    uni.navigateBack();
  } finally {
    uni.hideLoading();
  }
}

async function remove() {
  uni.showModal({
    title: '确认', content: '删除这张名片？',
    success: async (r) => {
      if (!r.confirm) return;
      await deleteContacts(db(), [id]);
      uni.navigateBack();
    },
  });
}
</script>
