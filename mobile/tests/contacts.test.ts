import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MemDb, MemKv, MemSecure } from '../src/adapters/memory.js';
import { createContact, updateContact, deleteContacts, findDupCandidates } from '../src/services/contacts.js';
import { loadLlmConfig, saveLlmConfig, maskKey } from '../src/services/settings.js';
import { sampleContacts } from '../fixtures/fixtures.js';

describe('contacts', () => {
  it('增删改 + search_text 同步 + 状态规则', async () => {
    const db = new MemDb();
    const id = await createContact(db, {
      name: '张伟', company: 'XX机器人', title: '', phone1: '+86 13800138000', phone2: '',
      email: '', address: '', business: '', event: '', met_at: '', notes: '',
      tags_printed: [], tags_inferred: [],
    });
    const all = await db.allByCreatedAsc();
    assert.equal(all.length, 1);
    assert.equal(all[0].status, '已确认');
    assert.ok(all[0].search_text.includes('+86 13800138000'));
    await updateContact(db, id, { business: '工业机器人' });
    const after = await db.allByCreatedAsc();
    assert.ok(after[0].search_text.includes('工业机器人'));
    const id2 = await createContact(db, {
      name: '', company: '', title: '', phone1: '', phone2: '', email: '',
      address: '', business: '', event: '', met_at: '', notes: '',
      tags_printed: [], tags_inferred: [],
    });
    assert.equal((await db.allByCreatedAsc()).find((c) => c.id === id2)!.status, '待核对');
    await deleteContacts(db, [id, id2]);
    assert.equal((await db.allByCreatedAsc()).length, 0);
    await assert.rejects(deleteContacts(db, []), /缺少 ids/);
    await assert.rejects(updateContact(db, 999, {}), /不存在/);
  });

  it('疑似重复提示与桌面版同语义', async () => {
    const db = new MemDb();
    for (const c of sampleContacts()) {
      const { id: _drop, created_at: _c, updated_at: _u, search_text: _s, ...rest } = c;
      await createContact(db, rest);
    }
    const hits = await findDupCandidates(db, { phone1: '13800138000', email: 'zw@xxrobot.com', name: '张伟', company: 'XX机器人' });
    // 与桌面版同 seen 去重语义：id1 先被邮箱命中，姓名+公司不再重复报
    assert.deepEqual(hits.map((h) => h.reason), ['电话相同', '邮箱相同']);
    assert.ok(hits.length <= 5);
  });
});

describe('settings', () => {
  it('地址模型放KV，Key只进安全存储，留空沿用', async () => {
    const kv = new MemKv(), sec = new MemSecure();
    await saveLlmConfig(kv, sec, { api_url: 'https://a/b', api_key: 'sk-123456789', model: 'm' });
    assert.equal(await kv.get('busscard.llm.apiKey'), null);
    assert.equal(await sec.load('busscard.llm.apiKey'), 'sk-123456789');
    await saveLlmConfig(kv, sec, { api_url: 'https://a/c', api_key: '', model: 'm2' });
    assert.equal((await loadLlmConfig(kv, sec)).api_key, 'sk-123456789');
    assert.equal(maskKey('sk-123456789'), '•••6789');
  });
});
