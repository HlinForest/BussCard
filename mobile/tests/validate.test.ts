import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateFields, normPhone } from '../src/services/validate.js';
import { loadExpected } from '../fixtures/fixtures.js';
import samples from '../fixtures/samples.json' with { type: 'json' };

describe('validate parity with desktop', () => {
  it('样本逐条 issues/status 一致', async () => {
    const exp = (await loadExpected('validate.json')) as unknown as Array<{
      name: string; issues: string[]; status: string;
    }>;
    (samples as Array<Record<string, unknown>>).forEach((s, i) => {
      const v = validateFields(s as never);
      assert.deepEqual(v.issues, exp[i].issues, `sample[${i}] issues`);
      assert.equal(v.status, exp[i].status, `sample[${i}] status`);
    });
    const badPhone = validateFields({ phone1: 'abc' });
    assert.deepEqual(badPhone.issues, (exp[7] as { issues: string[] }).issues);
    const badMail = validateFields({ email: 'a@b' });
    assert.deepEqual(badMail.issues, (exp[8] as { issues: string[] }).issues);
  });

  it('电话归一化', () => {
    assert.equal(normPhone('+86 13800138000'), '13800138000');
    assert.equal(normPhone('13800138000'), '13800138000');
    assert.equal(normPhone('010-88886666'), '01088886666');
    assert.equal(normPhone(''), '');
  });
});
