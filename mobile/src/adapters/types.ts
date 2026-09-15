/** 适配器接口：UTS 原生实现（真机）与内存实现（单测）共用。 */
import type { Contact, NewContact } from '../types.js';

export interface DbAdapter {
  init(): Promise<void>;
  allByUpdatedDesc(): Promise<Contact[]>;
  allByCreatedAsc(): Promise<Contact[]>;
  insert(c: NewContact & { search_text: string; created_at: number; updated_at: number }): Promise<number>;
  /** 批量插入（原生端一次事务提交，导入用）。 */
  insertMany(rows: Array<NewContact & { search_text: string; created_at: number; updated_at: number }>): Promise<number[]>;
  update(id: number, patch: Partial<Contact> & { search_text?: string; updated_at?: number }): Promise<void>;
  remove(ids: number[]): Promise<void>;
  /** 事务：fn 抛错则整体回滚（导入/批量写用）。 */
  runTx<T>(fn: () => Promise<T>): Promise<T>;
}

export interface KvAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  del(key: string): Promise<void>;
}

/** Key 只进安全存储，不写日志、不进普通备份。 */
export interface SecureAdapter {
  save(key: string, value: string): Promise<void>;
  load(key: string): Promise<string | null>;
  clear(key: string): Promise<void>;
}
