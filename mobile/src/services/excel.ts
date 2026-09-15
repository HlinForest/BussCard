/**
 * Excel 导出：与桌面版 carddeck/excel_export.py 同表头、同列、同电话文本格式。
 * 电话列按文本写入（+86/前导零不丢失）；首行为表头；冻结首行；自动筛选。
 */
import * as XLSX from 'xlsx';
import type { Contact } from '../types.js';
import { EXCEL_HEADERS, EXCEL_KEYS } from '../types.js';

const TEXT_COLS = new Set(['电话1', '电话2']);
const WIDTHS = [12, 22, 16, 18, 18, 24, 26, 22, 16, 14, 26, 18, 18, 10];

export function contactsToSheet(contacts: Contact[]): XLSX.WorkSheet {
  const rows: string[][] = [EXCEL_HEADERS];
  for (const c of contacts) {
    rows.push(EXCEL_KEYS.map((k) => {
      const v = c[k];
      if (Array.isArray(v)) return v.join('、');
      return (v as string) ?? '';
    }));
  }
  const ws = XLSX.utils.aoa_to_sheet(rows);
  // 电话列按文本写入（t:'s'，+86/前导零不丢失，这是关键保证）。
  // z:'@' 为尽力而为的文本格式标记（与桌面版 openpyxl number_format='@' 同意图；
  // 社区版 SheetJS 写字符串单元格时不序列化该标记，不影响显示值）。
  const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
  EXCEL_HEADERS.forEach((h, ci) => {
    if (!TEXT_COLS.has(h)) return;
    for (let r = range.s.r + 1; r <= range.e.r; r++) {
      const addr = XLSX.utils.encode_cell({ r, c: ci });
      const cell = ws[addr];
      if (cell) {
        cell.t = 's';
        cell.z = '@';
      }
    }
  });
  ws['!cols'] = WIDTHS.map((wch) => ({ wch }));
  ws['!freeze_panes'] = { xSplit: 0, ySplit: 1 };
  ws['!autofilter'] = { ref: ws['!ref'] ?? 'A1' };
  return ws;
}

export function exportXlsx(contacts: Contact[]): Uint8Array {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, contactsToSheet(contacts), '联系人');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
}

/** 供单测回读校验：表头、行数、电话文本性（类型 s + 值原样）。 */
export function readXlsx(buf: Uint8Array): {
  headers: string[]; rows: string[][]; phoneTypes: Array<string | undefined>; phoneFmt: Array<string | undefined>;
} {
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const aoa = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: true }) as unknown[][];
  const headers = (aoa[0] ?? []).map(String);
  const rows = (aoa.slice(1) as unknown[][]).map((r) => r.map((v) => (v == null ? '' : String(v))));
  const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
  const phoneTypes: Array<string | undefined> = [];
  const phoneFmt: Array<string | undefined> = [];
  for (let r = range.s.r + 1; r <= range.e.r; r++) {
    const cell = ws[XLSX.utils.encode_cell({ r, c: 3 })];
    phoneTypes.push(cell?.t as string | undefined);
    phoneFmt.push(cell?.z as string | undefined);
  }
  return { headers, rows, phoneTypes, phoneFmt };
}
