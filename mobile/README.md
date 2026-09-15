# BussCard Mobile（三端本地手机 App）

uni-app（Vue 3 + TypeScript）共用界面与业务逻辑，原生适配层实现数据库、相机、文件和密钥存储。
无需电脑运行，无需自建服务器；联系人和照片只存本机；仅主动识别/测试接口/拉模型列表时访问所配服务。

- 底部导航：名片、录入、表格、设置（中文名与桌面卡片风格一致，已做触控/键盘/安全区适配）
- 单机按一万条名片设计：搜索无截断分页、归一化查重索引、列表分页、耗时任务 busy 提示不阻塞
- 不做账号/云同步/广告/统计；不做离线 OCR；不上架商店

## 目录

```text
mobile/
  manifest.json / pages.json / vite.config.ts / src/main.ts / src/App.vue
  src/types.ts                 共用类型（与桌面 carddeck/db.py 字段一一对应）
  src/services/                纯逻辑（单测全覆盖，与桌面逐行对等）
    validate.ts                字段校验（与 validate.py 一致）
    search.ts                  混合检索（精确/尾号/模糊/TF-IDF，与 search.py 同分）
    dedupe.ts                  查重分组（归一化索引 + 并查集，与 /api/duplicates 同结果）
    llm.ts                     提示词/URL 规则/解析（与 llm.py 一致，网络经注入）
    excel.ts                   xlsx 导出（同表头，电话文本）
    backup.ts                  v2 备份 + 桌面旧备份导入
    importer.ts                导入编排（预览→备份→事务→查重提示→回滚）
    contacts.ts / images.ts / settings.ts / photo.ts / base64.ts / app.ts
  src/adapters/                types.ts（接口）/ memory.ts（单测）/ uts.ts（真机绑定）
  src/pages/                   cards / entry / table / detail / settings
  src/components/              ContactCard / BoxEditor
  utssdk/carddb                SQLite（Android/iOS）/ 鸿蒙 RDB，统一 NativeDb
  utssdk/cardstore             私有目录/备份/分享/文件选择
  utssdk/cardsecure            Key 进系统安全存储
  utssdk/carddetect            自动框选（Android-OpenCV / iOS-Vision / 鸿蒙回退手动）
  fixtures/                    samples.json（7 条固定样例）+ expected/（桌面生成）+ desktop-backup.zip
  tests/                       38 单测（node --test）
  docs/                        BUILD / VERIFY / PLATFORM / BACKUP-FORMAT
```

## 快速验证（本机可跑，不依赖 HBuilderX）

```powershell
cd mobile
D:/temp/opencode/node-v22.17.0-win-x64/npm.cmd install --legacy-peer-deps
D:/temp/opencode/node-v22.17.0-win-x64/node.exe node_modules/typescript/bin/tsc --noEmit -p tsconfig.test.json
node --import tsx --test "tests/*.test.ts"
python fixtures/generate_expected.py   # 用桌面版实现重算对照期望
```

## spec 符合度（实现位置）

| spec 条款 | 落点 |
|---|---|
| 底部导航名片/录入/表格/设置 | pages.json tabBar + 4 页 |
| 拍照/相册/整图十张/草稿核对/批量保存 | pages/entry.vue（拍照即落草稿 KV，杀进程可恢复） |
| 自动检测/手动补框/裁切校正/逐框重识别 | utssdk/carddetect + BoxEditor + photo.ts warpQuadRGBA |
| 卡片浏览/详情/全字段编辑/标签 | cards.vue / detail.vue |
| 搜索（精确/尾号/模糊/相关度+依据，无截断分页） | search.ts（limit/offset，默认 limit 由调用方定） |
| Excel 导出（全部/勾选/搜索结果，+86/前导零） | excel.ts + table.vue |
| 存储用量/导入导出/系统分享 | settings.vue + backup.ts + importer.ts |
| SQLite(Android/iOS)/鸿蒙 RDB，查询/事务/迁移 | utssdk/carddb（_info 版本表） |
| 图片私有目录相对路径 | images.ts + cardstore |
| Key 进安全存储，不进日志/备份 | settings.ts + cardsecure；backup.ts 不打包 Key |
| 失败保留图片草稿可重试；离线可手工录入 | entry.vue try/catch + 空 Key 空模板 |
| v2 ZIP（版本号+JSON+图片）三端互通 | BACKUP-FORMAT.md + backup.ts |
| 读桌面旧备份（SQLite+图片，忽略旧 Key） | importDesktopBackup + 真机 importDesktopOnDevice |
| 导入预览→备份→事务→重复提示→回滚 | importer.ts（plan/apply/rollback，单测覆盖） |
| 查重归一化索引+分组，保留传递关系与依据 | dedupe.ts（与桌面同结果，单测对拍） |
| 万条：分页/索引/耗时不阻塞 | limit/offset + idx_* 索引 + busy 遮罩/loading |
