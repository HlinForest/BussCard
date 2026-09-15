/**
 * 混合检索：与桌面版 carddeck/search.py逐行对应。
 * 精确命中优先 → 模糊（difflib 级 ratio/partial_ratio，对标 RapidFuzz）→
 * 字符 bigram TF-IDF 余弦 → 标签筛选。附命中依据。
 * 与桌面版差异仅两处（spec 要求）：不截断 2000 条，支持 offset 分页。
 */
import type { Contact, SearchHit } from '../types.js';
import { normPhone } from './validate.js';

const TOKEN_RE = /[\u4e00-\u9fffA-Za-z0-9]+/g;
const CJK_RE = /[\u4e00-\u9fff]/;

export function tokenize(text: string): string[] {
  const toks: string[] = [];
  for (const m of (text ?? '').matchAll(TOKEN_RE)) {
    const frag = m[0].toLowerCase();
    toks.push(frag);
    if (CJK_RE.test(frag)) {
      const chars = [...frag];
      toks.push(...chars);
      for (let i = 0; i < chars.length - 1; i++) toks.push(chars[i] + chars[i + 1]);
    }
  }
  return toks;
}

/** Python format(x, '.0f') 的银行家舍入移植（桌面版 reasons 文案逐字一致用）。 */
export function pyRound0(x: number): number {
  const f = Math.floor(x);
  const d = x - f;
  if (d < 0.5) return f;
  if (d > 0.5) return f + 1;
  return f % 2 === 0 ? f : f + 1;
}

/** Python round(x, 2) 移植。 */
export function pyRound2(x: number): number {
  const n = x * 100;
  const f = Math.floor(n);
  const d = n - f;
  let r: number;
  if (d < 0.5) r = f;
  else if (d > 0.5) r = f + 1;
  else r = f % 2 === 0 ? f : f + 1;
  return r / 100;
}

// ---------- difflib 对等（difflib.SequenceMatcher 无 junk 版） ----------

type Triple = [number, number, number];

function buildB2j(b: string): Map<string, number[]> {
  const m = new Map<string, number[]>();
  for (let j = 0; j < b.length; j++) {
    const arr = m.get(b[j]);
    if (arr) arr.push(j);
    else m.set(b[j], [j]);
  }
  return m;
}

function findLongestMatch(a: string, b: string, b2j: Map<string, number[]>,
  alo: number, ahi: number, blo: number, bhi: number): Triple {
  let besti = alo, bestj = blo, bestsize = 0;
  let j2len = new Map<number, number>();
  for (let i = alo; i < ahi; i++) {
    const newj2len = new Map<number, number>();
    const js = b2j.get(a[i]) ?? [];
    for (const j of js) {
      if (j < blo) continue;
      if (j >= bhi) break;
      const k = (j2len.get(j - 1) ?? 0) + 1;
      newj2len.set(j, k);
      if (k > bestsize) { besti = i - k + 1; bestj = j - k + 1; bestsize = k; }
    }
    j2len = newj2len;
  }
  return [besti, bestj, bestsize];
}

function getMatchingBlocks(a: string, b: string): Triple[] {
  const b2j = buildB2j(b);
  const queue: Array<[number, number, number, number]> = [[0, a.length, 0, b.length]];
  const blocks: Triple[] = [];
  while (queue.length) {
    const [alo, ahi, blo, bhi] = queue.pop()!;
    const [i, j, k] = findLongestMatch(a, b, b2j, alo, ahi, blo, bhi);
    if (k) {
      blocks.push([i, j, k]);
      if (alo < i && blo < j) queue.push([alo, i, blo, j]);
      if (i + k < ahi && j + k < bhi) queue.push([i + k, ahi, j + k, bhi]);
    }
  }
  blocks.sort((x, y) => (x[0] - y[0]) || (x[1] - y[1]));
  // 合并相邻块 + 哨兵（与 difflib 一致）
  const merged: Triple[] = [];
  let i1 = 0, j1 = 0, k1 = 0;
  for (const [i2, j2, k2] of blocks) {
    if (i1 + k1 === i2 && j1 + k1 === j2) {
      k1 += k2;
    } else {
      if (k1) merged.push([i1, j1, k1]);
      i1 = i2; j1 = j2; k1 = k2;
    }
  }
  if (k1) merged.push([i1, j1, k1]);
  merged.push([a.length, b.length, 0]);
  return merged;
}

/** 对标 rapidfuzz.fuzz.ratio：2*M/T*100。 */
export function fuzzRatio(s1: string, s2: string): number {
  const T = s1.length + s2.length;
  if (T === 0) return 100;
  let M = 0;
  for (const [, , k] of getMatchingBlocks(s1, s2)) M += k;
  return (200 * M) / T;
}

/** 对标 rapidfuzz.fuzz.partial_ratio：短串在长串上滑动取最大 ratio，子串包含直接 100。 */
export function fuzzPartialRatio(s1: string, s2: string): number {
  if (!s1.length || !s2.length) return 0;
  let short = s1, long = s2;
  if (short.length > long.length) [short, long] = [long, short];
  if (long.includes(short)) return 100;
  let best = 0;
  for (let i = 0; i <= long.length - short.length; i++) {
    const r = fuzzRatio(short, long.slice(i, i + short.length));
    if (r > best) best = r;
    if (best === 100) break;
  }
  return best;
}

// ---------- TF-IDF ----------

export function tfidfScores(query: string, docs: string[]): number[] {
  const qTokens = tokenize(query);
  if (!qTokens.length) return docs.map(() => 0);
  const counters = docs.map((d) => {
    const m = new Map<string, number>();
    for (const t of tokenize(d)) m.set(t, (m.get(t) ?? 0) + 1);
    return m;
  });
  const df = new Map<string, number>();
  for (const c of counters) for (const t of c.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  const N = Math.max(docs.length, 1);
  // 注意：与桌面版 idf.get(t, 1) 完全一致，未登录词 idf 取 1 而非公式值
  const idf = (t: string) => (df.has(t) ? Math.log((N + 1) / ((df.get(t) ?? 0) + 1)) + 1 : 1);
  const qVec = new Map<string, number>();
  for (const t of qTokens) qVec.set(t, (qVec.get(t) ?? 0) + 1);
  let qNorm = 0;
  for (const [t, v] of qVec) { const w = v * idf(t); qNorm += w * w; }
  qNorm = Math.sqrt(qNorm);
  return counters.map((c) => {
    let dot = 0;
    for (const [t, v] of qVec) dot += v * idf(t) * (c.get(t) ?? 0) * idf(t);
    let dNorm = 0;
    for (const [t, v] of c) { const w = v * idf(t); dNorm += w * w; }
    dNorm = Math.sqrt(dNorm);
    return qNorm && dNorm ? dot / (qNorm * dNorm) : 0;
  });
}

// ---------- 主入口 ----------

export interface SearchOptions {
  tagFilter?: string;
  limit?: number;
  offset?: number;
}

export function hybridSearch(allByUpdatedDesc: Contact[], query: string, opts: SearchOptions = {}): SearchHit[] {
  const { tagFilter = '', limit = 50, offset = 0 } = opts;
  const q = (query ?? '').trim();
  let contacts = allByUpdatedDesc;
  if (tagFilter) {
    contacts = contacts.filter((c) => c.tags_printed.includes(tagFilter) || c.tags_inferred.includes(tagFilter));
  }
  if (!q) return contacts.slice(offset, offset + limit).map((c) => ({ contact: c, score: 0, reasons: ['全部'] }));

  const qLow = q.toLowerCase();
  const isDigits = /^\d+$/.test(q);
  const sem = tfidfScores(q, contacts.map((c) => c.search_text));
  const scored: SearchHit[] = [];
  contacts.forEach((c, idx) => {
    const s = sem[idx];
    const reasons: string[] = [];
    let score = 0;
    const blob = `${c.name} ${c.company} ${c.phone1} ${c.phone2} ${c.email}`.toLowerCase();
    if (q && blob.includes(qLow)) {
      score += 100;
      reasons.push('精确命中');
    }
    if (isDigits && q.length >= 4 &&
      ((c.phone1 ?? '').replace(/ /g, '').endsWith(q) || (c.phone2 ?? '').replace(/ /g, '').endsWith(q))) {
      score += 50;
      reasons.push('电话尾号命中');
    }
    const fn = fuzzRatio(q, c.name ?? '');
    const fc = fuzzPartialRatio(q, c.company ?? '');
    if (fn >= 70) {
      score += fn * 0.4;
      reasons.push(`姓名相似${pyRound0(fn)}`);
    }
    if (fc >= 70) {
      score += fc * 0.3;
      reasons.push(`公司相似${pyRound0(fc)}`);
    }
    if (s > 0.05) {
      score += s * 60;
      reasons.push(`语义相关${s.toFixed(2)}`);
      const fields: Array<[string, string]> = [['title', '职位'], ['business', '业务'], ['notes', '备注'], ['event', '展会']];
      for (const [f, label] of fields) {
        const val = (c as unknown as Record<string, string>)[f] ?? '';
        if (val && tokenize(q).some((t) => t.length >= 2 && val.toLowerCase().includes(t))) {
          reasons.push(`${label}：${val.slice(0, 24)}`);
          break;
        }
      }
    }
    if (score > 0) scored.push({ contact: c, score: pyRound2(score), reasons });
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(offset, offset + limit);
}

/** 与桌面版 build_search_text 相同的拼接规则（tags 为数组）。 */
export function buildSearchText(d: {
  name?: string; company?: string; title?: string; phone1?: string; phone2?: string;
  email?: string; address?: string; business?: string; event?: string; met_at?: string;
  notes?: string; tags_printed?: string[]; tags_inferred?: string[];
}): string {
  const parts = [
    d.name ?? '', d.company ?? '', d.title ?? '', d.phone1 ?? '', d.phone2 ?? '', d.email ?? '',
    d.address ?? '', d.business ?? '', d.event ?? '', d.met_at ?? '', d.notes ?? '',
    ...(d.tags_printed ?? []), ...(d.tags_inferred ?? []),
  ];
  return parts.filter((p) => p).join('\n');
}

export { normPhone };
