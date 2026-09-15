import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { exportBackupV2, parseBackupV2, importDesktopBackup } from '../src/services/backup.js';
import { sampleContacts } from '../fixtures/fixtures.js';
import { BACKUP_VERSION } from '../src/types.js';
import { MemDb } from '../src/adapters/memory.js';
import { createContact } from '../src/services/contacts.js';

const memFs = (files: Record<string, string>) => ({
  readImageBase64: async (p: string) => files[p] ?? null,
});

describe('backup v2', () => {
  it('导出往返：联系人/图片一致', async () => {
    const rows = sampleContacts().slice(0, 2);
    const files = { 'images/photo/a.jpg': 'QUJD' };
    const bytes = await exportBackupV2(
      rows.map((c) => ({ ...c, photo_path: 'images/photo/a.jpg' })), memFs(files), 1234567890000);
    const back = await parseBackupV2(bytes);
    assert.equal(back.version, BACKUP_VERSION);
    assert.equal(back.exported_at, 1234567890000);
    assert.equal(back.contacts.length, 2);
    assert.equal(back.contacts[0].name, '张伟');
    assert.equal(back.images.length, 2);
    assert.equal(back.images[0].data_base64, 'QUJD');
  });

  it('损坏 zip/缺文件/错版本都抛错', async () => {
    await assert.rejects(parseBackupV2(new Uint8Array([1, 2, 3])), /不是有效的 ZIP/);
    const JSZip = (await import('jszip')).default;
    const z1 = new JSZip();
    z1.file('other.txt', 'x');
    await assert.rejects(parseBackupV2(await z1.generateAsync({ type: 'uint8array' })), /缺少 backup.json/);
    const z2 = new JSZip();
    z2.file('backup.json', JSON.stringify({ version: 1 }));
    await assert.rejects(parseBackupV2(await z2.generateAsync({ type: 'uint8array' })), /不支持的备份版本/);
  });
});

describe('desktop 备份导入', () => {
  it('读 carddeck.db + uploads，忽略旧 Key', async () => {
    const { readFile } = await import('node:fs/promises');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const bytes = new Uint8Array(await readFile(
      join(dirname(fileURLToPath(import.meta.url)), '../fixtures/desktop-backup.zip')));
    const initSqlJs = (await import('sql.js')).default;
    const SQL = await initSqlJs({ locateFile: (f: string) => join(process.cwd(), 'node_modules/sql.js/dist', f) });
    const reader = {
      readContactsTable: async (dbBytes: Uint8Array) => {
        const db = new SQL.Database(dbBytes);
        try {
          const res = db.exec('SELECT * FROM contacts ORDER BY created_at ASC');
          if (!res.length) return [];
          const { columns, values } = res[0] as { columns: string[]; values: unknown[][] };
          return values.map((row) => Object.fromEntries(row.map((v, i) => [columns[i], v])));
        } finally {
          db.close();
        }
      },
    };
    const got = await importDesktopBackup(bytes, reader);
    assert.equal(got.contacts.length, 7);
    assert.equal(got.contacts[0].name, '张伟');
    assert.equal(got.contacts[0].phone1, '+86 13800138000');
    assert.deepEqual(got.contacts[0].tags_printed, ['机器人']);
    assert.equal(got.contacts[0].photo_path, '');
    assert.equal(got.images.length, 2);
    assert.ok(got.images.every((im) => im.data_base64.length > 0));
    // 事务导入内存库并可搜索
    const db = new MemDb();
    await db.runTx(async () => {
      for (const c of got.contacts) await createContact(db, c);
    });
    assert.equal((await db.allByCreatedAsc()).length, 7);
  });

  it('事务回滚：中途失败整体撤销', async () => {
    const db = new MemDb();
    await createContact(db, { name: 'keep', company: 'c', phone1: '1' } as never);
    await assert.rejects(db.runTx(async () => {
      await createContact(db, { name: 'tmp', company: 'c', phone1: '2' } as never);
      throw new Error('boom');
    }), /boom/);
    assert.deepEqual((await db.allByCreatedAsc()).map((c) => c.name), ['keep']);
  });
});
