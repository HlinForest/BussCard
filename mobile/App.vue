<script setup lang="ts">
import { onLaunch } from '@dcloudio/uni-app';
import { UtsDb } from './src/adapters/uts';

onLaunch(() => {
  new UtsDb().init().catch((e) => console.error('db init failed', e));
});
</script>

<style>
page { background: #e9ebed; color: #1d2126; font-size: 15px; }
.kicker { font-size: 11px; letter-spacing: 4px; color: #8b939c; margin: 22px 16px 6px; }
.acard { background: #fafbfb; border: 1px solid #d3d8dd; border-left: 3px solid #002fa7;
  border-radius: 10px; padding: 13px 15px; margin: 0 16px 12px; }
.aname { font-size: 21px; font-weight: 700; }
.aco { color: #5c6670; font-size: 13px; margin-bottom: 6px; }
.arow { font-size: 14px; }
.primary { background: #002fa7; color: #fff; border-radius: 10px; padding: 10px 18px; font-weight: 600; }
.rowbtn { background: #fafbfb; border: 1px solid #d3d8dd; border-radius: 10px; padding: 8px 14px; margin-right: 8px; }
.searchbar { display: flex; gap: 8px; padding: 8px 16px; }
.searchbar input { flex: 1; background: #fafbfb; border: 1px solid #d3d8dd; border-radius: 8px; padding: 9px 12px; }
.toolbar { display: flex; flex-wrap: wrap; gap: 8px; padding: 8px 16px; }
.muted { color: #8b939c; font-size: 13px; padding: 0 16px; }
.field { margin: 0 16px 10px; }
.field text { display: block; color: #5c6670; font-size: 13px; margin-bottom: 4px; }
.field input, .field textarea, .field picker { width: 100%; background: #fafbfb;
  border: 1px solid #d3d8dd; border-radius: 8px; padding: 8px 10px; }
</style>
