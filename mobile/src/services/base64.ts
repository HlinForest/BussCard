/** 可移植 base64（真机无 Buffer/Node API，uni-app 全端可用）。 */
const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1] ?? 0, c = bytes[i + 2] ?? 0;
    const n = (a << 16) | (b << 8) | c;
    out += ALPHA[(n >> 18) & 63] + ALPHA[(n >> 12) & 63]
      + (i + 1 < bytes.length ? ALPHA[(n >> 6) & 63] : '=')
      + (i + 2 < bytes.length ? ALPHA[n & 63] : '=');
  }
  return out;
}

export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/=]/g, '');
  const out: number[] = [];
  for (let i = 0; i < clean.length; i += 4) {
    const n = (ALPHA.indexOf(clean[i]) << 18) | (ALPHA.indexOf(clean[i + 1]) << 12)
      | ((clean[i + 2] === '=' ? 0 : ALPHA.indexOf(clean[i + 2])) << 6)
      | (clean[i + 3] === '=' ? 0 : ALPHA.indexOf(clean[i + 3]));
    out.push((n >> 16) & 255);
    if (clean[i + 2] !== '=') out.push((n >> 8) & 255);
    if (clean[i + 3] !== '=') out.push(n & 255);
  }
  return Uint8Array.from(out);
}
