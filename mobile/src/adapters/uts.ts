/**
 * 真机绑定：UTS 原生能力 → services 用的适配器接口。
 * 仅在 App 端打包进包；单测用 adapters/memory.ts。
 * 说明：JS 单线程 + 单一原生连接，runTx 的 BEGIN/await/COMMIT 序列中间不会被插写，
 * App 内所有入库都走串行 UI 流，等价于原子事务。
 */
import type { Box, Contact, NewContact } from '../types.js';
import type { DbAdapter, KvAdapter, SecureAdapter } from './types.js';
import type { HttpAdapter } from '../services/llm.js';
import { ensureSchema, withTx } from '../../utssdk/carddb/index.uts.js';
import { nativeDb } from '../../utssdk/carddb/native.uts.js';
import { privateRoot, readAbsFile, readBytes, systemPickFile, systemShare, writeBytes } from '../../utssdk/cardstore/index.uts.js';
import { secureClear, secureLoad, secureSave } from '../../utssdk/cardsecure/index.uts.js';
import { detectCards } from '../../utssdk/carddetect/index.uts.js';

function rowToContact(row: Map<string, string | number | null>): Contact {
  const s = (k: string) => {
    const v = row.get(k);
    return v == null ? '' : String(v);
  };
  const n = (k: string) => {
    const v = row.get(k);
    return typeof v === 'number' ? v : Number(v ?? 0);
  };
  const tags = (k: string): string[] => {
    try {
      const p: unknown = JSON.parse(s(k) || '[]');
      return Array.isArray(p) ? p.map(String) : [];
    } catch {
      return [];
    }
  };
  return {
    id: n('id'), name: s('name'), company: s('company'), title: s('title'),
    phone1: s('phone1'), phone2: s('phone2'), email: s('email'), address: s('address'),
    business: s('business'), event: s('event'), met_at: s('met_at'), notes: s('notes'),
    tags_printed: tags('tags_printed'), tags_inferred: tags('tags_inferred'),
    status: s('status') || '待核对', photo_path: s('photo_path'), crop_path: s('crop_path'),
    search_text: s('search_text'), embedding: s('embedding'),
    created_at: n('created_at'), updated_at: n('updated_at'),
  };
}

const CONTACT_COLS = ['name', 'company', 'title', 'phone1', 'phone2', 'email', 'address',
  'business', 'event', 'met_at', 'notes', 'tags_printed', 'tags_inferred', 'status',
  'photo_path', 'crop_path', 'search_text', 'embedding', 'created_at', 'updated_at'];

type RowVals = NewContact & { search_text: string; created_at: number; updated_at: number };

function toVals(c: RowVals): Array<string | number> {
  return [c.name, c.company, c.title, c.phone1, c.phone2, c.email, c.address, c.business,
    c.event, c.met_at, c.notes, JSON.stringify(c.tags_printed), JSON.stringify(c.tags_inferred),
    c.status ?? '待核对', c.photo_path ?? '', c.crop_path ?? '', c.search_text, c.embedding ?? '',
    c.created_at, c.updated_at];
}

const HOLDERS = CONTACT_COLS.map(() => '?').join(',');

export class UtsDb implements DbAdapter {
  constructor() { ensureSchema(nativeDb); }
  async init(): Promise<void> { ensureSchema(nativeDb); }
  async allByUpdatedDesc(): Promise<Contact[]> {
    return nativeDb.query('SELECT * FROM contacts ORDER BY updated_at DESC, id DESC', []).map(rowToContact);
  }
  async allByCreatedAsc(): Promise<Contact[]> {
    return nativeDb.query('SELECT * FROM contacts ORDER BY created_at ASC, id ASC', []).map(rowToContact);
  }
  async insert(c: RowVals): Promise<number> {
    return nativeDb.exec(`INSERT INTO contacts (${CONTACT_COLS.join(',')}) VALUES (${HOLDERS})`, toVals(c));
  }
  async insertMany(rows: RowVals[]): Promise<number[]> {
    const ids: number[] = [];
    withTx(nativeDb, () => {
      for (const c of rows) {
        ids.push(nativeDb.exec(`INSERT INTO contacts (${CONTACT_COLS.join(',')}) VALUES (${HOLDERS})`, toVals(c)));
      }
    });
    return ids;
  }
  async update(id: number, patch: Partial<Contact>): Promise<void> {
    const keys = (Object.keys(patch) as Array<keyof Contact>).filter((k) => k !== 'id');
    if (!keys.length) return;
    const vals = keys.map((k) => {
      const v = patch[k];
      if (Array.isArray(v)) return JSON.stringify(v);
      return (v ?? '') as string | number;
    });
    nativeDb.execNoResult(
      `UPDATE contacts SET ${keys.map((k) => `${String(k)} = ?`).join(', ')} WHERE id = ?`,
      [...vals, id],
    );
  }
  async remove(ids: number[]): Promise<void> {
    if (!ids.length) return;
    nativeDb.execNoResult(`DELETE FROM contacts WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
  }
  async runTx<T>(fn: () => Promise<T>): Promise<T> {
    nativeDb.exec('BEGIN', []);
    try {
      const out = await fn();
      nativeDb.exec('COMMIT', []);
      return out;
    } catch (e) {
      try { nativeDb.exec('ROLLBACK', []); } catch { /* 忽略 */ }
      throw e;
    }
  }
  /** 桌面库文件整体替换（桌面备份导入用），随后重建 search_text。 */
  async replaceDbFile(srcAbsPath: string, rebuild: (db: DbAdapter) => Promise<void>): Promise<void> {
    nativeDb.reopenDbFile(srcAbsPath);
    ensureSchema(nativeDb);
    await rebuild(this);
  }
}

export class UniKv implements KvAdapter {

  async get(k: string): Promise<string | null> {
    try {
      const v: unknown = uni.getStorageSync('busscard.' + k);
      return typeof v === 'string' ? v : null;
    } catch {
      return null;
    }
  }
  async set(k: string, v: string): Promise<void> {
    uni.setStorageSync('busscard.' + k, v);
  }
  async del(k: string): Promise<void> {
    uni.removeStorageSync('busscard.' + k);
  }
}

export class UtsSecure implements SecureAdapter {
  async save(k: string, v: string): Promise<void> { secureSave('busscard.' + k, v); }
  async load(k: string): Promise<string | null> { return secureLoad('busscard.' + k); }
  async clear(k: string): Promise<void> { secureClear('busscard.' + k); }
}

export class UniHttp implements HttpAdapter {
  private call(method: 'GET' | 'POST', url: string, apiKey: string, payload: object | null, timeoutMs: number) {
    return new Promise<{ status: number; bodyText: string }>((resolve) => {
      uni.request({
        url, method, timeout: timeoutMs,
        header: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        ...(payload == null ? {} : { data: payload }),
        success: (r: any) => resolve({
          status: r.statusCode ?? 0,
          bodyText: typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? ''),
        }),
        fail: () => resolve({ status: 0, bodyText: '' }),
      });
    });
  }
  postJson(url: string, apiKey: string, payload: object, timeoutMs: number) {
    return this.call('POST', url, apiKey, payload, timeoutMs);
  }
  get(url: string, apiKey: string, timeoutMs: number) {
    return this.call('GET', url, apiKey, null, timeoutMs);
  }
}

export const cardFiles = {
  root(): string { return privateRoot(); },
  read(rel: string): Uint8Array | null { return readBytes(rel); },
  readAbs(abs: string): Uint8Array { return readAbsFile(abs); },
  write(rel: string, data: Uint8Array): string { return writeBytes(rel, data); },
  pick(mime: string): string { return systemPickFile(mime); },
  share(path: string, mime: string, filename: string): void { systemShare({ path, mime, filename }); },
};

export function nativeDetect(imageAbsPath: string, maxCards = 10): Box[] {
  return detectCards(imageAbsPath, maxCards).map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h, quad: b.quad }));
}
