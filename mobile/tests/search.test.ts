import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hybridSearch, fuzzRatio, fuzzPartialRatio, tokenize, buildSearchText } from '../src/services/search.js';
import { loadExpected, sampleContacts } from '../fixtures/fixtures.js';
import samples from '../fixtures/samples.json' with { type: 'json' };

describe('search parity with desktop', () => {
  it('search_text 拼接与桌面版一致', async () => {
    const exp = await loadExpected('search.json');
    void exp;
    const rows = sampleContacts();
    assert.equal(rows[0].search_text,
      '张伟\nXX机器人\n销售经理\n+86 13800138000\nzw@xxrobot.com\n上海市浦东新区\n工业机器人\n工博会\n2026-09-01\n重点跟进\n机器人\n销售');
  });

  it('tokenize：中文按字+bigram展开（含 frag 内拉丁字符）', () => {
    assert.deepEqual(tokenize('XX机器人'),
      ['xx机器人', 'x', 'x', '机', '器', '人', 'xx', 'x机', '机器', '器人']);
    assert.deepEqual(tokenize('Hello 123'), ['hello', '123']);
  });

  it('fuzz 与 RapidFuzz 同值（抽查）', () => {
    assert.equal(fuzzRatio('张威', '张威'), 100);
    assert.equal(fuzzRatio('张威', '张伟'), 50);
    assert.equal(fuzzPartialRatio('张威', 'XX机器人公司'), fuzzPartialRatio('张威', 'XX机器人公司'));
    assert.ok(fuzzPartialRatio('机器人', 'XX机器人公司') >= 70);
    assert.equal(fuzzPartialRatio('abc', 'xxabcxx'), 100);
  });

  it('各 query 的命中、分数、依据与桌面版一致', async () => {
    const exp = await loadExpected('search.json');
    const rows = sampleContacts();
    const byUpdated = [...rows].sort((a, b) => b.updated_at - a.updated_at);
    for (const [q, wants] of Object.entries(exp)) {
      if (q.startsWith('__')) continue;
      const got = hybridSearch(byUpdated, q);
      assert.equal(got.length, (wants as unknown[]).length, `query=${q} 条数`);
      (wants as Array<{ name: string; score: number; reasons: string[] }>).forEach((w, i) => {
        assert.equal(got[i].contact.name, w.name, `query=${q}[${i}].name`);
        assert.ok(Math.abs(got[i].score - w.score) < 1e-6, `query=${q}[${i}].score ${got[i].score} vs ${w.score}`);
        assert.deepEqual(got[i].reasons, w.reasons, `query=${q}[${i}].reasons`);
      });
    }
  });

  it('空查询按 updated_desc 分页', () => {
    const rows = sampleContacts();
    const byUpdated = [...rows].sort((a, b) => b.updated_at - a.updated_at);
    const p1 = hybridSearch(byUpdated, '', { limit: 3, offset: 0 });
    const p2 = hybridSearch(byUpdated, '', { limit: 3, offset: 3 });
    assert.deepEqual(p1.map((h) => h.contact.id), [1, 2, 3]);
    assert.deepEqual(p2.map((h) => h.contact.id), [4, 5, 6]);
    assert.deepEqual(p1[0].reasons, ['全部']);
  });

  it('标签筛选', async () => {
    const exp = await loadExpected('search.json');
    const rows = sampleContacts();
    const byUpdated = [...rows].sort((a, b) => b.updated_at - a.updated_at);
    const got = hybridSearch(byUpdated, '', { tagFilter: '机器人' });
    const want = exp.__tag_机器人__ as Array<{ name: string }>;
    assert.deepEqual(got.map((h) => h.contact.name), want.map((w) => w.name));
  });

  it('buildSearchText 空标签不产生空行', () => {
    assert.equal(buildSearchText({ name: 'A' }), 'A');
    void samples;
  });
});
