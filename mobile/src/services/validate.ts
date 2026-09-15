/** 字段校验：与桌面版 carddeck/validate.py 逐行对应（正则、文案、状态规则完全一致）。 */
import type { ContactFields } from '../types.js';

const PHONE_RE = /^\+?[\d][\d\s\-()]{5,20}$/;
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

export interface Validation {
  issues: string[];
  status: string;
}

export function validateFields(d: Partial<ContactFields>): Validation {
  const issues: string[] = [];
  for (const key of ['phone1', 'phone2'] as const) {
    const v = (d[key] ?? '').trim();
    if (v && !PHONE_RE.test(v)) issues.push(`${key} 格式可疑：${v}`);
  }
  const email = (d.email ?? '').trim();
  if (email && !EMAIL_RE.test(email)) issues.push(`邮箱格式可疑：${email}`);
  const criticalEmpty = (['name', 'company', 'phone1'] as const)
    .filter((k) => !(d[k] ?? '').trim());
  if (criticalEmpty.length) issues.push(`待核对：${criticalEmpty.join('、')}为空`);
  return { issues, status: issues.length ? '待核对' : '已确认' };
}

/** 电话归一化：只留数字；+86 前缀avatares。查重与尾号匹配共用。 */
export function normPhone(p: string): string {
  let d = (p ?? '').replace(/\D/g, '');
  if (d.length > 11 && d.startsWith('86')) d = d.slice(2);
  return d;
}
