/** 内存适配器：单测用，与 UTS 原生实现同接口语义（含事务回滚）。 */
import type { Contact, NewContact } from '../types.js';
import type { DbAdapter, KvAdapter, SecureAdapter } from './types.js';

export class MemDb implements DbAdapter {
  private rows = new Map<number, Contact>();
  private nextId = 1;

  async init(): Promise<void> { /* 无 */ }

  async allByUpdatedDesc(): Promise<Contact[]> {
    return [...this.rows.values()].sort((a, b) => b.updated_at - a.updated_at || b.id - a.id);
  }

  async allByCreatedAsc(): Promise<Contact[]> {
    return [...this.rows.values()].sort((a, b) => a.created_at - b.created_at || a.id - b.id);
  }

  async insert(c: NewContact & { search_text: string; created_at: number; updated_at: number }): Promise<number> {
    const id = this.nextId++;
    const row: Contact = {
      ...c, id,
      status: c.status ?? '待核对',
      photo_path: c.photo_path ?? '',
      crop_path: c.crop_path ?? '',
      embedding: c.embedding ?? '',
    };
    this.rows.set(id, row);
    return id;
  }

  async insertMany(rows: Array<NewContact & { search_text: string; created_at: number; updated_at: number }>): Promise<number[]> {
    return this.runTx(async () => {
      const ids: number[] = [];
      for (const c of rows) ids.push(await this.insert(c));
      return ids;
    });
  }
  async update(id: number, patch: Partial<Contact>): Promise<void> {
    const cur = this.rows.get(id);
    if (!cur) throw new Error('不存在');
    this.rows.set(id, { ...cur, ...patch, id });
  }

  async remove(ids: number[]): Promise<void> {
    for (const id of ids) this.rows.delete(id);
  }

  async runTx<T>(fn: () => Promise<T>): Promise<T> {
    const snapRows = new Map(this.rows);
    const snapNext = this.nextId;
    try {
      return await fn();
    } catch (e) {
      this.rows = snapRows;
      this.nextId = snapNext;
      throw e;
    }
  }
}

export class MemKv implements KvAdapter {
  private m = new Map<string, string>();
  async get(k: string): Promise<string | null> { return this.m.has(k) ? this.m.get(k)! : null; }
  async set(k: string, v: string): Promise<void> { this.m.set(k, v); }
  async del(k: string): Promise<void> { this.m.delete(k); }
}

export class MemSecure implements SecureAdapter {
  private m = new Map<string, string>();
  async save(k: string, v: string): Promise<void> { this.m.set(k, v); }
  async load(k: string): Promise<string | null> { return this.m.has(k) ? this.m.get(k)! : null; }
  async clear(k: string): Promise<void> { this.m.delete(k); }
}
