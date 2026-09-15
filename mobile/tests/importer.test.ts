import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bytesToBase64, base64ToBytes } from '../src/services/base64.js';
import { applyV2Import, dupeSummaryAfterImport, planImport } from '../src/services/importer.js';
import { parseBackupV2, exportBackupV2 } from '../src/services/backup.js';
import { MemDb } from '../src/adapters/memory.js';
import { createContact } from '../src/services/contacts.js';
import { sampleContacts } from '../fixtures/fixtures.js';

describe('base64 portable', () => {
  it('往返一致（含 padding 边界）', () => {
    for (const n of [0, 1, 2, 3, 4, 5, 255, 256]) {
      const b = Uint8Array.from({ length: n }, (_, i) => (i * 37) % 256);
      assert.deepEqual(base64ToBytes(bytesToBase64(b)), b);
    }
    assert.equal(bytesToBase64(new Uint8Array([77, 97, 110])), 'TWFu');
    assert.equal(Buffer.from(base64ToBytes('TWFu')).toString(), 'Man');
  });
});

describe('importer', () => {
  it('planImport：v2 与桌面旧备份', async () => {
    const { readFile } = await import('node:fs/promises');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const dir = join(dirname(fileURLToPath(import.meta.url)), '../fixtures');
    const desk = new Uint8Array(await readFile(join(dir, 'desktop-backup.zip')));
    const p1 = await planImport(desk);
    assert.equal(p1.kind, 'desktop');
    assert.equal(p1.images, 2);
    assert.ok((p1.dbBytes ?? 0) > 1000);
    const rows = sampleContacts().slice(0, 2);
    const v2bytes = await exportBackupV2(rows, { readImageBase64: async () => null });
    const p2 = await planImport(v2bytes);
    assert.equal(p2.kind, 'v2');
    assert.equal(p2.contacts, 2);
    await assert.rejects(planImport(new Uint8Array([9, 9])), /不是有效的 ZIP/);
  });

  it('applyV2Import 事务 + 查重摘要', async () => {
    const db = new MemDb();
    const rows = sampleContacts().slice(0, 3).map((c, i) => ({ ...c, photo_path: `images/photo/x${i}.jpg` }));
    const written: Record<string, string> = {};
    const v2bytes = await exportBackupV2(rows, { readImageBase64: async () => 'QUJD' });
    const v2 = await parseBackupV2(v2bytes);
    assert.equal(v2.images.length, 3);
    const ids = await applyV2Import(db, {
      writeImage: async (rel, b64) => { written[rel] = b64; },
    }, v2);
    assert.equal(ids.length, 3);
    assert.equal(Object.keys(written).length, 3);
    // 再导一次制造重复
    await applyV2Import(db, { writeImage: async () => { /* 已存在 */ } }, v2);
    const tip = await dupeSummaryAfterImport(db);
    assert.match(tip, /发现 3 组、3 条疑似重复/);
  });

  it('导入失败回滚（写一半抛错，库 untouched）', async () => {
    const db = new MemDb();
    await createContact(db, {
      name: 'keep', company: 'c', title: '', phone1: '1', phone2: '', email: '',
      address: '', business: '', event: '', met_at: '', notes: '',
      tags_printed: [], tags_inferred: [],
    });
    const rows = sampleContacts().slice(0, 2).map((c) => ({ ...c, photo_path: 'images/photo/x.jpg' }));
    const v2bytes = await exportBackupV2(rows, { readImageBase64: async () => 'QUJD' });
    const v2 = await parseBackupV2(v2bytes);
    let n = 0;
    await assert.rejects(applyV2Import(db, {
      writeImage: async () => {
        n++;
        if (n === 1) throw new Error('disk full');
      },
    }, v2), /disk full/);
    assert.equal(n, 1);
    assert.deepEqual((await db.allByCreatedAsc()).map((c) => c.name), ['keep']);
  });
});
