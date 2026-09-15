/**
 * 导入编排（v2 备份 / 桌面旧备份），三端共用：
 * 1. 预览（先完整校验，损坏直接拒收，什么都不写）
 * 2. 先备份现有数据
 * 3. 事务导入，失败整体回滚
 * 4. 重复只提示，由用户手动处理（不自动删除/合并）
 */
import JSZip from 'jszip';
import type { Contact, NewContact } from '../types.js';
import { BACKUP_VERSION, type BackupV2 } from '../types.js';
import { parseBackupV2 } from './backup.js';
import { importContacts } from './contacts.js';
import { dupeGroups } from './dedupe.js';
import type { DbAdapter } from '../adapters/types.js';

export interface FsOps {
  readAbsFile(absPath: string): Uint8Array;
  writeImage(relPath: string, base64: string): Promise<void>;
  exportCurrent(): Promise<Uint8Array>;
  replaceDbFile(dbBytes: Uint8Array): Promise<void>;
  restoreDbFile(backupDbBytes: Uint8Array): Promise<void>;
  copyImageIntoPrivate(fileName: string, base64: string): Promise<string>; // 返回新相对路径
}

export interface ImportPreview {
  kind: 'v2' | 'desktop';
  contacts: number;
  images: number;
  dbBytes?: number;
}

const SQLITE_MAGIC = 'SQLite format 3\0';

export async function planImport(zipBytes: Uint8Array): Promise<ImportPreview> {
  // v2 优先
  try {
    const v2 = await parseBackupV2(zipBytes);
    return { kind: 'v2', contacts: v2.contacts.length, images: v2.images.length };
  } catch (e) {
    if (!String((e as Error)?.message ?? '').includes('缺少 backup.json')) throw e;
  }
  // 桌面旧备份
  let zip;
  try {
    zip = await JSZip.loadAsync(zipBytes);
  } catch {
    throw new Error('备份文件损坏：不是有效的 ZIP');
  }
  const dbFile = zip.file('carddeck.db');
  if (!dbFile) throw new Error('无法识别：既不是 v2 备份也不是桌面备份（缺少 backup.json/carddeck.db）');
  const head = await dbFile.async('string');
  if (!head.startsWith(SQLITE_MAGIC)) throw new Error('备份文件损坏：carddeck.db 不是 SQLite 文件');
  let images = 0;
  zip.folder('uploads')?.forEach((_, f) => { if (!f.dir) images++; });
  return { kind: 'desktop', contacts: -1, images, dbBytes: (await dbFile.async('uint8array')).length };
}

/** v2 应用：事务插入 + 图片落盘（先写图后入库，入库失败图为孤儿但数据一致，见 docs）。 */
export async function applyV2Import(
  db: DbAdapter, fs: Pick<FsOps, 'writeImage'>, backup: BackupV2,
): Promise<number[]> {
  for (const im of backup.images) {
    await fs.writeImage(`images/${im.kind === 'crop' ? 'crop' : 'photo'}/${im.path}`, im.data_base64);
  }
  const rows: NewContact[] = backup.contacts.map((c) => ({
    name: c.name, company: c.company, title: c.title, phone1: c.phone1, phone2: c.phone2,
    email: c.email, address: c.address, business: c.business, event: c.event, met_at: c.met_at,
    notes: c.notes, tags_printed: c.tags_printed, tags_inferred: c.tags_inferred,
    status: c.status, photo_path: c.photo_path, crop_path: c.crop_path, embedding: c.embedding,
  }));
  return importContacts(db, rows);
}

/** 导入后查重提示（文本摘要，UI 层转弹窗/分组页）。 */
export async function dupeSummaryAfterImport(db: DbAdapter): Promise<string> {
  const groups = dupeGroups(await db.allByCreatedAsc());
  if (!groups.length) return '无重复';
  const n = groups.reduce((a, g) => a + (g.contacts.length - 1), 0);
  return `发现 ${groups.length} 组、${n} 条疑似重复，请到“名片/表格-查找重复”手动处理（不会自动删除或合并）`;
}
