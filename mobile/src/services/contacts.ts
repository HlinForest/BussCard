/** 联系人服务：与桌面版 carddeck/db.py + app.py.save/update/delete 同语义。 */
import type { Contact, ContactFields, DupeCandidate, NewContact } from '../types.js';
import type { DbAdapter } from '../adapters/types.js';
import { buildSearchText } from './search.js';
import { validateFields } from './validate.js';

export async function createContact(db: DbAdapter, d: NewContact): Promise<number> {
  const now = Date.now() / 1000;
  const full: ContactFields = {
    name: d.name ?? '', company: d.company ?? '', title: d.title ?? '',
    phone1: d.phone1 ?? '', phone2: d.phone2 ?? '', email: d.email ?? '',
    address: d.address ?? '', business: d.business ?? '', event: d.event ?? '',
    met_at: d.met_at ?? '', notes: d.notes ?? '',
    tags_printed: d.tags_printed ?? [], tags_inferred: d.tags_inferred ?? [],
  };
  const v = validateFields(full);
  return db.insert({
    ...full,
    status: d.status ?? v.status,
    photo_path: d.photo_path ?? '', crop_path: d.crop_path ?? '',
    embedding: d.embedding ?? '',
    search_text: buildSearchText(full),
    created_at: now, updated_at: now,
  });
}

export async function updateContact(db: DbAdapter, id: number, patch: Partial<Contact>): Promise<void> {
  const all = await db.allByUpdatedDesc();
  const cur = all.find((c) => c.id === id);
  if (!cur) throw new Error('不存在');
  const merged = { ...cur, ...patch };
  await db.update(id, {
    ...patch,
    search_text: buildSearchText(merged),
    updated_at: Date.now() / 1000,
  });
}

export async function deleteContacts(db: DbAdapter, ids: number[]): Promise<void> {
  if (!ids.length) throw new Error('缺少 ids');
  await db.remove(ids);
}

/** 批量导入（备份恢复用）：逐条校验补 search_text，一次事务提交，失败整体回滚。 */
export async function importContacts(db: DbAdapter, rows: NewContact[]): Promise<number[]> {
  const now = Date.now() / 1000;
  const prepared = rows.map((d) => {
    const full: ContactFields = {
      name: d.name ?? '', company: d.company ?? '', title: d.title ?? '',
      phone1: d.phone1 ?? '', phone2: d.phone2 ?? '', email: d.email ?? '',
      address: d.address ?? '', business: d.business ?? '', event: d.event ?? '',
      met_at: d.met_at ?? '', notes: d.notes ?? '',
      tags_printed: d.tags_printed ?? [], tags_inferred: d.tags_inferred ?? [],
    };
    const v = validateFields(full);
    return {
      ...full,
      status: d.status ?? v.status,
      photo_path: d.photo_path ?? '', crop_path: d.crop_path ?? '',
      embedding: d.embedding ?? '',
      search_text: buildSearchText(full),
      created_at: now, updated_at: now,
    };
  });
  return db.insertMany(prepared);
}

/** 疑似重复提示（桌面版 find_duplicates 同语义，limit 5，只提示不合并）。 */
export async function findDupCandidates(
  db: DbAdapter, d: Partial<ContactFields>, limit = 5,
): Promise<DupeCandidate[]> {
  const all = await db.allByUpdatedDesc();
  const out: DupeCandidate[] = [];
  const seen = new Set<number>();
  const phones = [(d.phone1 ?? '').trim(), (d.phone2 ?? '').trim()].filter(Boolean);
  const push = (c: Contact, reason: string) => {
    if (seen.has(c.id)) return;
    seen.add(c.id);
    out.push({ id: c.id, name: c.name, company: c.company, phone1: c.phone1, email: c.email, reason });
  };
  if (phones.length) for (const c of all) {
    if (phones.includes(c.phone1) || (c.phone2 && phones.includes(c.phone2))) push(c, '电话相同');
  }
  const email = (d.email ?? '').trim();
  if (email) for (const c of all) if (c.email === email) push(c, '邮箱相同');
  const name = (d.name ?? '').trim(), company = (d.company ?? '').trim();
  if (name && company) for (const c of all) {
    if (c.name === name && c.company === company) push(c, '姓名+公司相同');
  }
  return out.slice(0, limit);
}
