<!-- 名片 Deck：搜索 + 卡片 + 详情 + 查重删除 -->
<template>
  <view>
    <view class="kicker">DECK</view>
    <view class="searchbar">
      <input v-model="q" placeholder="搜姓名 / 公司 / 尾号 / 业务，回车即搜" confirm-type="search" @confirm="reload" />
      <button class="rowbtn" @tap="reload">搜索</button>
    </view>
    <view class="toolbar"><button class="rowbtn" @tap="dupOpen = !dupOpen">查找重复</button></view>
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
    <ContactCard v-for="c in list" :key="c.id" :contact="c" @open="openDetail" />
    <view v-if="!list.length" class="muted">暂无数据，去录入页拍照</view>
  </view>
</template>

<script setup lang="ts">
import { onShow } from '@dcloudio/uni-app';
import { ref } from 'vue';
import ContactCard from '../components/ContactCard.vue';
import type { Contact, DupeGroup } from '../src/types';
import { db } from '../src/services/app';
import { hybridSearch } from '../src/services/search';
import { dupeGroups } from '../src/services/dedupe';
import { deleteContacts } from '../src/services/contacts';

const q = ref('');
const list = ref<Contact[]>([]);
const dupOpen = ref(false);
const dupes = ref<DupeGroup[]>([]);
const keep = ref<Record<number, string>>({});

async function reload() {
  const all = await db().allByUpdatedDesc();
  list.value = q.value.trim() ? hybridSearch(all, q.value, { limit: 200 }).map((h) => h.contact) : all;
  if (dupOpen.value) {
    const asc = await db().allByCreatedAsc();
    dupes.value = dupeGroups(asc);
  }
}
function openDetail(id: number) {
  uni.navigateTo({ url: '/pages/detail?id=' + id });
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
.dup { border: 1px solid #d3d8dd; border-left: 3px solid #002fa7; border-radius: 10px;
  padding: 10px 12px; margin: 8px 0; background: #fafbfb; }
.why { color: #002fa7; font-size: 13px; margin-bottom: 6px; }
label { display: block; font-size: 14px; padding: 3px 0; }
</style>
