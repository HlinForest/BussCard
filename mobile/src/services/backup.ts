/** 备份 v2（带版本号 ZIP，三端互通）+ 桌面版旧备份导入。纯逻辑，IO 经适配器注入。 */
import JSZip from 'jszip';
import type { BackupV2, Contact } from '../types.js';
import { BACKUP_VERSION } from '../types.js';

export interface ImageReader {
  readImageBase64(relPath: string): Promise<string | null>;
}

export interface ImageWriter {
  writeImageBase64(relPath: string, base64: string): Promise<void>;
}

/** 桌面备份(zip 内含 carddeck.db + uploads/* + llm_config.json)的 sqlite 读取器（真机走原生，单测走 sql.js）。 */
export interface SqliteReader {
  readContactsTable(dbBytes: Uint8Array): Promise<Array<Record<string, unknown>>>;
}

export async function exportBackupV2(
  contacts: Contact[], images: ImageReader, nowMs = Date.now(),
): Promise<Uint8Array> {
  const zip = new JSZip();
  const out: BackupV2 = { version: 2, app: 'busscard-mobile', exported_at: nowMs, contacts, images: [] };
  for (const c of contacts) {
    for (const [kind, rel] of [['photo', c.photo_path], ['crop', c.crop_path]] as const) {
      if (!rel) continue;
      const b64 = await images.readImageBase64(rel);
      if (b64 != null) out.images.push({ contact_id: c.id, kind, path: rel.split('/').pop() ?? rel, data_base64: b64 });
    }
  }
  zip.file('backup.json', JSON.stringify(out));
  return zip.generateAsync({ type: 'uint8array' });
}

export async function parseBackupV2(bytes: Uint8Array): Promise<BackupV2> {
  let zip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new Error('备份文件损坏：不是有效的 ZIP');
  }
  const f = zip.file('backup.json');
  if (!f) throw new Error('备份文件损坏：缺少 backup.json');
  let data: unknown;
  try {
    data = JSON.parse(await f.async('string'));
  } catch {
    throw new Error('备份文件损坏：backup.json 解析失败');
  }
  if (typeof data !== 'object' || data === null || (data as { version?: unknown }).version !== BACKUP_VERSION) {
    throw new Error(`不支持的备份版本（需要 v${BACKUP_VERSION}）`);
  }
  return data as BackupV2;
}

function asStr(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function asTags(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === 'string') {
    try {
      const p: unknown = JSON.parse(v);
      if (Array.isArray(p)) return p.map(String);
    } catch { /* fallthrough */ }
    return v ? [v] : [];
  }
  return [];
}

/**
 * 导入桌面版旧备份：读 zip 里的 carddeck.db（contacts 表）+ uploads 图片。
 * 路径重建为新相对路径；llm_config.json 里的旧 Key 直接忽略（spec）。
 */
export async function importDesktopBackup(
  bytes: Uint8Array, reader: SqliteReader,
): Promise<{ contacts: Array<Omit<Contact, 'id' | 'created_at' | 'updated_at'>>; images: BackupV2['images'] }> {
  let zip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new Error('备份文件损坏：不是有效的 ZIP');
  }
  const dbFile = zip.file('carddeck.db');
  if (!dbFile) throw new Error('不是桌面版备份：缺少 carddeck.db');
  const rows = await reader.readContactsTable(await dbFile.async('uint8array'));
  const contacts = rows.map((r) => ({
    name: asStr(r.name), company: asStr(r.company), title: asStr(r.title),
    phone1: asStr(r.phone1), phone2: asStr(r.phone2), email: asStr(r.email),
    address: asStr(r.address), business: asStr(r.business), event: asStr(r.event),
    met_at: asStr(r.met_at), notes: asStr(r.notes),
    tags_printed: asTags(r.tags_printed), tags_inferred: asTags(r.tags_inferred),
    status: asStr(r.status) || '待核对',
    photo_path: baseName(asStr(r.photo_path)),
    crop_path: baseName(asStr(r.crop_path)),
    search_text: asStr(r.search_text), embedding: asStr(r.embedding),
  }));
  // 取 uploads/ 下图片
  const images: BackupV2['images'] = [];
  const jobs: Promise<void>[] = [];
  zip.folder('uploads')?.forEach((rel, f) => {
    if (f.dir) return;
    jobs.push(f.async('base64').then((b64) => {
      images.push({ contact_id: 0, kind: 'photo', path: rel.split('/').pop() ?? rel, data_base64: b64 });
    }));
  });
  await Promise.all(jobs);
  return { contacts, images };
}

function baseName(p: string): string {
  if (!p) return '';
  const parts = p.split('/');
  return parts[parts.length - 1];
}
