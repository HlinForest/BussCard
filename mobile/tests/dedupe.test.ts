import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dupeGroups } from '../src/services/dedupe.js';
import { loadExpected, sampleContacts } from '../fixtures/fixtures.js';

describe('dedupe parity with desktop', () => {
  it('分组与依据一致（含传递闭包）', async () => {
    const exp = (await loadExpected('dupes.json')) as unknown as Array<{ reason: string; names: string[] }>;
    const rows = sampleContacts();
    const byCreated = [...rows].sort((a, b) => a.created_at - b.created_at);
    const got = dupeGroups(byCreated);
    assert.equal(got.length, exp.length, '组数');
    got.forEach((g, i) => {
      assert.equal(g.reason, exp[i].reason, `group[${i}].reason`);
      assert.deepEqual(g.contacts.map((c) => c.name).sort(), exp[i].names, `group[${i}].names`);
    });
  });

  it('无重复返回空', () => {
    const rows = sampleContacts().filter((c) => c.id >= 6);
    assert.deepEqual(dupeGroups(rows), []);
  });
});
