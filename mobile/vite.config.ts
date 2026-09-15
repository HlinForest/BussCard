import { defineConfig } from 'vite';
import uniPlugin from '@dcloudio/vite-plugin-uni';

// 兼容包版本间的 default 导出形态漂移（对象套 fn 或直出 fn）
const uni: (options?: unknown) => unknown[] =
  ((uniPlugin as unknown as { default?: unknown }).default ?? uniPlugin) as (options?: unknown) => unknown[];

export default defineConfig({
  plugins: [uni()],
});
