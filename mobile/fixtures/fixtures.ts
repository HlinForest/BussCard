/** 单测桥：samples.json + TS 侧对象组装（id/时间戳规则与 generate_expected.py 一致）。 */
import type { Contact } from '../src/types.js';
import { buildSearchText } from '../src/services/search.js';
import samples from './samples.json' with { type: 'json' };

export interface SampleRow {
  name: string; company: string; title: string; phone1: string; phone2: string;
  email: string; address: string; business: string; event: string; met_at: string;
  notes: string; tags_printed: string[]; tags_inferred: string[];
}

export function sampleContacts(): Contact[] {
  return (samples as SampleRow[]).map((s, i) => ({
    id: i + 1,
    name: s.name, company: s.company, title: s.title,
    phone1: s.phone1, phone2: s.phone2, email: s.email,
    address: s.address, business: s.business, event: s.event,
    met_at: s.met_at, notes: s.notes,
    tags_printed: [...s.tags_printed], tags_inferred: [...s.tags_inferred],
    status: '待核对',
    photo_path: '', crop_path: '',
    search_text: buildSearchText(s),
    embedding: '',
    created_at: 1000 + i,
    updated_at: 2000 - i,
  }));
}

/** search.json 期望：query -> [{name, company?, score, reasons}] */
export async function loadExpected(name: string): Promise<Record<string, Array<Record<string, unknown>>>> {
  const { readFile } = await import('node:fs/promises');
  const { join, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const dir = join(dirname(fileURLToPath(import.meta.url)), 'expected');
  return JSON.parse(await readFile(join(dir, name), 'utf-8'));
}
