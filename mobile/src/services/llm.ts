/**
 * 大模型适配：与桌面版 carddeck/llm.py 同提示词、同 URL 规则、同解析逻辑。
 * 网络调用经注入的 HttpAdapter 发起（uni.request 适配 / 单测 stub）， Key 由调用方从安全存储传入。
 */
import type { ContactFields, LlmConfig, LlmProviderId } from '../types.js';
import { PROVIDERS } from '../types.js';

export const FIELDS = ['name', 'company', 'title', 'phone1', 'phone2', 'email', 'address',
  'business', 'event', 'met_at', 'notes', 'tags_printed', 'tags_inferred'] as const;

export type FieldKey = (typeof FIELDS)[number];

export const PROMPT = `你是名片信息提取器。看这张已裁切校正的单张名片图，只提取图上明确可见的信息。
规则：
1. 看不清或没有的信息留空字符串（标签留空数组），不要编造、不要补全号码。
2. 电话保留原始写法（含 +86、空格、连字符）；邮箱原样抄录。
3. tags_printed 只收录名片上明确印出的行业/业务词；模型推断的一律放 tags_inferred，不要混入事实字段。
4. business/event/met_at/notes 若图上没有就留空，等人工在表格里补充背景信息。
只返回 JSON，不要 markdown：
{"name":"","company":"","title":"","phone1":"","phone2":"","email":"","address":"","business":"","event":"","met_at":"","notes":"","tags_printed":[],"tags_inferred":[]}`;

export const MULTI_PROMPT = `这张照片里有多张名片（2～10 张）。请逐张提取每张名片上明确可见的信息，不要把 A 的电话填给 B。
规则：
1. 看不清或没有的信息留空字符串（标签留空数组），不要编造、不要补全号码。
2. 电话保留原始写法（含 +86、空格、连字符）；邮箱原样抄录。
3. tags_printed 只收录名片上明确印出的行业/业务词；模型推断的一律放 tags_inferred。
4. 按从左到右、从上到下的顺序排列。
只返回 JSON，不要 markdown：
{"cards": [{"name":"","company":"","title":"","phone1":"","phone2":"","email":"","address":"","business":"","event":"","met_at":"","notes":"","tags_printed":[],"tags_inferred":[]}]}`;

export function normalizeChatUrl(apiUrl: string): string {
  const u = (apiUrl ?? '').trim().replace(/\/+$/, '');
  if (u.endsWith('/chat/completions')) return u;
  if (u.endsWith('/completions')) return u;
  if (u.endsWith('/v1')) {
    return u.includes('deepseek') ? u.replace('/v1', '') + '/chat/completions' : u + '/chat/completions';
  }
  return u + '/chat/completions';
}

export function modelsUrl(apiUrl: string): string {
  const u = (apiUrl ?? '').trim().replace(/\/+$/, '');
  if (u.includes('/chat/completions')) return u.replace('/chat/completions', '/models');
  if (u.endsWith('/completions')) return u.slice(0, -'/completions'.length) + '/models';
  return u + '/models';
}

export function modelsCandidates(apiUrl: string): string[] {
  const first = modelsUrl(apiUrl);
  const cands = [first];
  if (first.includes('/v1/models')) {
    const alt = first.replace('/v1/models', '/models');
    if (!cands.includes(alt)) cands.push(alt);
  } else if (first.replace(/\/+$/, '').endsWith('/models')) {
    const alt = first.replace(/\/+$/, '').slice(0, -'/models'.length) + '/v1/models';
    if (!cands.includes(alt)) cands.push(alt);
  }
  return cands;
}

export function matchProvider(apiUrl: string): LlmProviderId {
  const u = (apiUrl ?? '').replace(/\/+$/, '');
  for (const k of ['deepseek', 'dashscope', 'openai', 'megmeet'] as const) {
    const p = PROVIDERS[k].replace(/\/+$/, '');
    if (u === p || u.startsWith(p.replace('/chat/completions', ''))) return k;
  }
  return 'custom';
}

export function emptyFields(mock = false): ContactFields & { _mock?: boolean } {
  const d = {} as ContactFields & { _mock?: boolean };
  for (const k of FIELDS) (d as unknown as Record<string, unknown>)[k] = k.startsWith('tags') ? [] : '';
  if (mock) d._mock = true;
  return d;
}

export function sanitizeFields(data: unknown): ContactFields {
  const out = emptyFields();
  if (typeof data !== 'object' || data === null) return out;
  const rec = data as Record<string, unknown>;
  for (const k of FIELDS) {
    if (k in rec) {
      const v = rec[k];
      (out as unknown as Record<string, unknown>)[k] = v == null ? (k.startsWith('tags') ? [] : '') : v;
    }
  }
  for (const k of ['tags_printed', 'tags_inferred'] as const) {
    const v = out[k] as unknown;
    if (typeof v === 'string') out[k] = v ? [v] : [];
    else if (!Array.isArray(v)) out[k] = [];
  }
  return out;
}

/** 去 markdown 围栏后取 JSON（与桌面版 _chat 后半段一致）。 */
export function parseChatContent(content: string): unknown {
  const t = content.trim().replace(/^```(?:json)?|```$/gm, '').trim();
  try {
    return JSON.parse(t);
  } catch {
    const m = /\{.*\}/s.exec(t);
    return m ? JSON.parse(m[0]) : {};
  }
}

export interface ChatMessage {
  role: 'user';
  content: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;
}

export function buildChatPayload(model: string, text: string, dataUrl: string): object {
  const content: ChatMessage['content'] = [
    { type: 'text', text },
    { type: 'image_url', image_url: { url: dataUrl } },
  ];
  const messages: ChatMessage[] = [{ role: 'user', content }];
  return {
    model,
    temperature: 0,
    response_format: { type: 'json_object' },
    messages,
  };
}

export function extractCards(data: unknown): ContactFields[] {
  let cards: unknown = [];
  if (Array.isArray(data)) cards = data;
  else if (typeof data === 'object' && data !== null) cards = (data as Record<string, unknown>).cards ?? [];
  if (!Array.isArray(cards)) return [];
  return (cards as unknown[]).slice(0, 10).map(sanitizeFields);
}

export function httpErrorDetail(status: number | null, body: string, errText: string): string {
  if (status == null) return errText.slice(0, 300);
  let hint = '';
  if (status === 401) hint = '（Key 未通过：检查是否复制完整、有无多余空格、是否过期、是否有该模型调用权限）';
  else if (status === 403) hint = '（无权限：Key 可能无此模型/地域权限）';
  else if (status === 404) hint = '（地址可能不对：检查 URL 路径）';
  return `HTTP ${status} ${(body ?? '').slice(0, 300)}${hint}`;
}

export interface HttpAdapter {
  postJson(url: string, apiKey: string, payload: object, timeoutMs: number): Promise<{ status: number; bodyText: string }>;
  get(url: string, apiKey: string, timeoutMs: number): Promise<{ status: number; bodyText: string }>;
}

function choicesText(bodyText: string): string {
  try {
    return (JSON.parse(bodyText) as { choices: Array<{ message: { content: string } }> }).choices[0].message.content;
  } catch {
    return bodyText.slice(0, 200);
  }
}

export async function recognizePhotoMulti(
  http: HttpAdapter, imageDataUrl: string, cfg: LlmConfig, timeoutMs = 120000,
): Promise<ContactFields[]> {
  const url = normalizeChatUrl(cfg.api_url);
  if (!url || !cfg.api_key) return [];
  const r = await http.postJson(url, cfg.api_key, buildChatPayload(cfg.model, MULTI_PROMPT, imageDataUrl), timeoutMs);
  if (r.status < 200 || r.status >= 300) throw new Error(httpErrorDetail(r.status, r.bodyText, '识别失败'));
  return extractCards(parseChatContent(choicesText(r.bodyText)));
}

export async function recognizeCrop(
  http: HttpAdapter, imageDataUrl: string, cfg: LlmConfig, timeoutMs = 90000,
): Promise<ContactFields & { _mock?: boolean; _error?: string }> {
  const url = normalizeChatUrl(cfg.api_url);
  if (!url || !cfg.api_key) return emptyFields(true);
  const r = await http.postJson(url, cfg.api_key, buildChatPayload(cfg.model, PROMPT, imageDataUrl), timeoutMs);
  if (r.status < 200 || r.status >= 300) {
    const e = emptyFields();
    (e as ContactFields & { _error?: string })._error = `识别失败：${httpErrorDetail(r.status, r.bodyText, '')}`;
    return e;
  }
  return sanitizeFields(parseChatContent(choicesText(r.bodyText)));
}

export async function listModels(
  http: HttpAdapter, apiUrl: string, apiKey: string, timeoutMs = 30000,
): Promise<{ models: string[]; url: string }> {
  const errs: string[] = [];
  for (const url of modelsCandidates(normalizeChatUrl(apiUrl))) {
    const r = await http.get(url, apiKey, timeoutMs);
    if (r.status < 200 || r.status >= 300) {
      errs.push(`${url}：${httpErrorDetail(r.status, r.bodyText, '')}`);
      continue;
    }
    let items: unknown[] = [];
    try {
      const d = JSON.parse(r.bodyText) as { data?: unknown };
      if (d && Array.isArray(d.data)) items = d.data;
    } catch { /* 空列表 */ }
    const ids = [...new Set(items
      .filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null && 'id' in x)
      .map((x) => String(x.id)))].sort();
    return { models: ids, url };
  }
  throw new Error(errs.join('；').slice(0, 500) || '网关未提供模型列表接口，请手填模型名');
}

export async function testConnection(
  http: HttpAdapter, apiUrl: string, apiKey: string, model: string, timeoutMs = 30000,
): Promise<{ ok: true; reply: string }> {
  const url = normalizeChatUrl(apiUrl);
  const r = await http.postJson(url, apiKey, {
    model, temperature: 0, max_tokens: 16, messages: [{ role: 'user', content: '只回复 ok' }],
  }, timeoutMs);
  if (r.status < 200 || r.status >= 300) throw new Error(httpErrorDetail(r.status, r.bodyText, '连接失败'));
  return { ok: true, reply: choicesText(r.bodyText).slice(0, 200) };
}
