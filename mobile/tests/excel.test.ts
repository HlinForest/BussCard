import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { exportXlsx, readXlsx } from '../src/services/excel.js';
import { sampleContacts } from '../fixtures/fixtures.js';
import { EXCEL_HEADERS } from '../src/types.js';

describe('excel', () => {
  it('表头/行数/电话文本格式与桌面版一致', () => {
    const rows = sampleContacts().slice(0, 3);
    const back = readXlsx(exportXlsx(rows));
    assert.deepEqual(back.headers, EXCEL_HEADERS);
    assert.equal(back.rows.length, 3);
    // +86 与纯数字电话原样保留，且单元格为文本类型（t:'s'）
    assert.equal(back.rows[0][3], '+86 13800138000');
    assert.equal(back.rows[1][3], '13800138001');
    assert.ok(back.phoneTypes.every((t) => t === 's'), `phone types: ${JSON.stringify(back.phoneTypes)}`);
    // 标签用顿号连接
    assert.equal(back.rows[0][11], '机器人');
    assert.equal(back.rows[1][11], '');
  });
});
