/** App 单例：UTS 适配器 + 服务装配（页面只调这里，不直连原生）。 */
import { UtsDb, UniKv, UtsSecure, UniHttp, cardFiles, nativeDetect } from '../adapters/uts.js';
import type { DbAdapter, KvAdapter, SecureAdapter } from '../adapters/types.js';
import type { HttpAdapter } from './llm.js';

let _db: DbAdapter | null = null;
let _kv: KvAdapter | null = null;
let _sec: SecureAdapter | null = null;
let _http: HttpAdapter | null = null;

export function db(): DbAdapter {
  if (!_db) _db = new UtsDb();
  return _db;
}
export function kv(): KvAdapter {
  if (!_kv) _kv = new UniKv();
  return _kv;
}
export function sec(): SecureAdapter {
  if (!_sec) _sec = new UtsSecure();
  return _sec;
}
export function http(): HttpAdapter {
  if (!_http) _http = new UniHttp();
  return _http;
}
export { cardFiles, nativeDetect };
