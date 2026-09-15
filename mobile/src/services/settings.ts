/** 设置服务：地址/模型放普通 KV，Key 只进安全存储（不写日志、不进备份）。 */
import type { KvAdapter, SecureAdapter } from '../adapters/types.js';
import type { LlmConfig } from '../types.js';

const K_URL = 'busscard.llm.apiUrl';
const K_MODEL = 'busscard.llm.model';
const K_KEY = 'busscard.llm.apiKey';

export async function loadLlmConfig(kv: KvAdapter, sec: SecureAdapter): Promise<LlmConfig> {
  const [api_url, model, api_key] = await Promise.all([
    kv.get(K_URL), kv.get(K_MODEL), sec.load(K_KEY),
  ]);
  return { api_url: api_url ?? '', model: model ?? 'gpt-4o-mini', api_key: api_key ?? '' };
}

export async function saveLlmConfig(kv: KvAdapter, sec: SecureAdapter, cfg: LlmConfig): Promise<void> {
  await kv.set(K_URL, cfg.api_url.trim());
  await kv.set(K_MODEL, (cfg.model || 'gpt-4o-mini').trim());
  if (cfg.api_key.trim()) await sec.save(K_KEY, cfg.api_key.trim());
  // Key 留空 = 沿用旧 Key（与桌面版一致）
}

export async function clearLlmKey(sec: SecureAdapter): Promise<void> {
  await sec.clear(K_KEY);
}

export function maskKey(key: string): string {
  if (!key) return '';
  return key.length > 8 ? '•••' + key.slice(-4) : '已填';
}
