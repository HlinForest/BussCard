<!-- 设置：大模型（地址/Key/模型列表/连通测试）+ 存储用量/导入导出备份 -->
<template>
  <scroll-view scroll-y style="height:100vh">
    <view class="kicker">MODEL</view>
    <view class="field">
      <text>服务商</text>
      <picker :range="providers" range-key="label" :value="provIdx" @change="onProv">
        <view class="pick">{{ providers[provIdx].label }}</view>
      </picker>
    </view>
    <view class="field"><text>API URL（/chat/completions）</text><input v-model="url" /></view>
    <view class="field"><text>API Key（只进安全存储）</text><input v-model="key" password /></view>
    <view class="field"><text>模型（可手填）</text><input v-model="model" /></view>
    <view class="field">
      <text>模型下拉选择</text>
      <picker :range="models" :value="modelIdx" @change="model = models[($event.detail as any).value] ?? model">
        <view class="pick">{{ models[modelIdx] ?? '先点获取模型列表' }}</view>
      </picker>
    </view>
    <view class="toolbar">
      <button class="rowbtn" @tap="fetchModels">获取模型列表</button>
      <button class="rowbtn" @tap="save">保存</button>
      <button class="rowbtn" @tap="test">测试连接</button>
    </view>
    <view class="muted">{{ status }}</view>

    <view class="kicker">STORAGE</view>
    <view class="muted">{{ usage }}</view>
    <view class="toolbar">
      <button class="rowbtn" @tap="exportBackup">导出备份</button>
      <button class="rowbtn" @tap="importBackup">导入备份</button>
    </view>
    <view class="muted">备份为带版本 v2 ZIP（三端互通）；可读取桌面版旧备份（SQLite+图片），忽略旧 Key；导入前预览并备份现有数据，失败整体回滚。</view>
  </scroll-view>
</template>

<script setup lang="ts">
import { onShow } from '@dcloudio/uni-app';
import { ref } from 'vue';
import { db, kv, sec, http, cardFiles } from '../services/app';
import { loadLlmConfig, saveLlmConfig, maskKey } from '../services/settings';
import { PROVIDERS, BACKUP_VERSION } from '../types';
import { listModels, testConnection, matchProvider } from '../services/llm';
import { exportBackupV2 } from '../services/backup';
import { applyV2Import, dupeSummaryAfterImport, planImport } from '../services/importer';
import { base64ToBytes, bytesToBase64 } from '../services/base64';

const providers = [
  { id: 'deepseek', label: 'DeepSeek' },
  { id: 'dashscope', label: '阿里百炼' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'megmeet', label: 'Megmeet（公司网关）' },
  { id: 'custom', label: '自定义网关' },
] as const;
const provIdx = ref(0);
const url = ref('');
const key = ref('');
const model = ref('gpt-4o-mini');
const models = ref<string[]>([]);
const modelIdx = ref(0);
const status = ref('');
const usage = ref('');

async function refresh() {
  const cfg = await loadLlmConfig(kv(), sec());
  url.value = cfg.api_url;
  model.value = cfg.model;
  const p = matchProvider(cfg.api_url);
  provIdx.value = Math.max(0, providers.findIndex((x) => x.id === p));
  status.value = cfg.api_url && cfg.api_key ? `已配置（${maskKey(cfg.api_key)}）` : '未配置，可手工录入';
  const all = await db().allByUpdatedDesc();
  usage.value = `${all.length} 条联系人，数据存本机私有目录`;
}

function onProv(e: any) {
  provIdx.value = Number(e.detail.value);
  const id = providers[provIdx.value].id;
  if (id !== 'custom') url.value = PROVIDERS[id as keyof typeof PROVIDERS];
}

async function save() {
  await saveLlmConfig(kv(), sec(), { api_url: url.value.trim(), api_key: key.value.trim(), model: model.value.trim() });
  key.value = '';
  uni.showToast({ title: '已保存' });
  refresh();
}

async function cfgOrWarn() {
  const cfg = await loadLlmConfig(kv(), sec());
  const filled = {
    api_url: url.value.trim() || cfg.api_url,
    api_key: key.value.trim() || cfg.api_key,
    model: model.value.trim() || cfg.model,
  };
  if (!filled.api_url || !filled.api_key) {
    uni.showToast({ title: '先填 URL 和 Key', icon: 'none' });
    return null;
  }
  return filled;
}

async function fetchModels() {
  const cfg = await cfgOrWarn();
  if (!cfg) return;
  uni.showLoading({ title: '获取中' });
  try {
    const r = await listModels(http(), cfg.api_url, cfg.api_key);
    models.value = r.models;
    modelIdx.value = 0;
    if (!model.value.trim() && r.models.length) model.value = r.models[0];
    const cur = model.value.trim();
    if (cur && !r.models.includes(cur)) model.value = r.models[0] ?? cur;
    status.value = r.models.length ? `共 ${r.models.length} 个模型` : '未取到，手填模型名';
  } catch (e: any) {
    status.value = `获取失败：${String(e?.message ?? e).slice(0, 200)}`;
  } finally {
    uni.hideLoading();
  }
}

async function test() {
  const cfg = await cfgOrWarn();
  if (!cfg) return;
  uni.showLoading({ title: '测试中' });
  try {
    const r = await testConnection(http(), cfg.api_url, cfg.api_key, cfg.model);
    status.value = `连接成功：${r.reply}`;
  } catch (e: any) {
    status.value = `失败：${String(e?.message ?? e).slice(0, 200)}`;
  } finally {
    uni.hideLoading();
  }
}

async function exportBackup() {
  uni.showLoading({ title: '打包中' });
  try {
    const all = await db().allByUpdatedDesc();
    const bytes = await exportBackupV2(all, {
      readImageBase64: async (rel) => {
        const b = cardFiles.read(rel);
        return b ? bytesToBase64(b) : null;
      },
    });
    const rel = `backup/busscard-backup-v${BACKUP_VERSION}.zip`;
    cardFiles.write(rel, bytes);
    cardFiles.share(cardFiles.root() + '/' + rel, 'application/zip', 'busscard-backup.zip');
  } finally {
    uni.hideLoading();
  }
}

async function importBackup() {
  const picked = cardFiles.pick('application/zip');
  if (!picked) return;
  let bytes: Uint8Array;
  try {
    bytes = cardFiles.readAbs(picked);
  } catch (e: any) {
    return uni.showToast({ title: '读取失败', icon: 'none' });
  }
  let plan;
  try {
    plan = await planImport(bytes);
  } catch (e: any) {
    return uni.showToast({ title: String(e?.message ?? e).slice(0, 60), icon: 'none' });
  }
  const preview = plan.kind === 'v2'
    ? `v2 备份：${plan.contacts} 条联系人，${plan.images} 张图片`
    : `桌面旧备份：数据库约 ${(plan.dbBytes ?? 0) / 1024 | 0}KB，${plan.images} 张图片（Key 不导入）`;
  uni.showModal({
    title: '导入前确认',
    content: `${preview}\n将先备份现有数据，失败整体回滚，重复只提示不自动处理。继续？`,
    success: async (r) => {
      if (!r.confirm) return;
      uni.showLoading({ title: '导入中' });
      try {
        if (plan.kind === 'v2') {
          const v2 = await parseBackupV2(bytes);
          await applyV2Import(db(), {
            writeImage: async (rel, b64) => {
              cardFiles.write(rel, base64ToBytes(b64));
            },
          }, v2);
        } else {
          await importDesktopOnDevice(bytes);
        }
        const tip = await dupeSummaryAfterImport(db());
        uni.showToast({ title: '导入完成，' + tip.slice(0, 24), icon: 'none' });
      } catch (e: any) {
        uni.showToast({ title: `导入失败已回滚：${String(e?.message ?? e).slice(0, 40)}`, icon: 'none' });
      } finally {
        uni.hideLoading();
      }
    },
  });
}

/** 桌面旧备份真机导入：文件级替换 db（同 schema）+ 图片加 imp- 前缀重建路径 + 重建 search_text。
 *  失败回滚 = 擦除后重导预备份（id 会变，数据不丢；图片同名碰撞以 imp- 前缀规避，见 docs）。 */
async function importDesktopOnDevice(bytes: Uint8Array) {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(bytes).catch(() => {
    throw new Error('备份文件损坏：不是有效的 ZIP');
  });
  const dbFile = zip.file('carddeck.db');
  if (!dbFile) throw new Error('不是桌面版备份：缺少 carddeck.db');
  const dbBytes = await dbFile.async('uint8array');
  const magic = Array.from(dbBytes.slice(0, 16)).map((b) => String.fromCharCode(b)).join('');
  if (magic !== 'SQLite format 3\0') throw new Error('备份文件损坏：carddeck.db 不是 SQLite 文件');
  const readB64 = async (rel: string) => {
    const b = cardFiles.read(rel);
    return b ? bytesToBase64(b) : null;
  };
  const fromB64 = (b64: string) => base64ToBytes(b64);
  // 预备份现有数据（内存，失败回滚用）
  const pre = await exportBackupV2(await db().allByUpdatedDesc(), { readImageBase64: readB64 });
  const rollback = async () => {
    const ids = (await db().allByCreatedAsc()).map((c) => c.id);
    if (ids.length) await db().remove(ids);
    await applyV2Import(db(), { writeImage: async (rel, b64) => { cardFiles.write(rel, fromB64(b64)); } }, pre);
  };
  const nameMap = new Map<string, string>();
  try {
    const jobs: Promise<void>[] = [];
    zip.folder('uploads')?.forEach((rel, f) => {
      if (f.dir) return;
      const base = rel.split('/').pop() ?? rel;
      jobs.push(f.async('base64').then((b64) => {
        const rel2 = `images/photo/imp-${base}`;
        cardFiles.write(rel2, fromB64(b64));
        nameMap.set(base, rel2);
      }));
    });
    await Promise.all(jobs);
    const tmpRel = `backup/in-desktop-${Date.now()}.db`;
    cardFiles.write(tmpRel, dbBytes);
    (db() as unknown as { reopenDbFile(p: string): void }).reopenDbFile(cardFiles.root() + '/' + tmpRel);
    const { buildSearchText } = await import('../services/search');
    for (const c of await db().allByCreatedAsc()) {
      const remap = (p: string) => (!p ? '' : (nameMap.get(p.split('/').pop() ?? p) ?? p));
      await db().update(c.id, {
        photo_path: remap(c.photo_path),
        crop_path: remap(c.crop_path),
        search_text: buildSearchText({ ...c, photo_path: remap(c.photo_path) }),
        updated_at: Date.now() / 1000,
      });
    }
  } catch (e) {
    await rollback();
    throw e;
  }
}

onShow(refresh);
</script>

<style scoped>
.pick { background: #fafbfb; border: 1px solid #d3d8dd; border-radius: 8px; padding: 8px 10px; }
</style>
