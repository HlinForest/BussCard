# 验证记录（按 spec 第 3/4 步逐项登记；未验证项明确标注）

## A. 数据正确性（本机已验证 ✅，2026-09-16）

| 项 | 方法 | 结果 |
|---|---|---|
| 字段校验与桌面一致 | tests/validate.test.ts 对拍 fixtures/expected/validate.json | ✅ 通过 |
| 搜索排序/分数/依据与桌面一致 | tests/search.test.ts 对拍 11 queries（含精确/尾号/模糊/语义/空/标签） | ✅ 通过（分数 1e-6，依据逐字；修过一处真 bug：未登录词 idf 取 1） |
| 查重分组/依据/传递闭包一致 | tests/dedupe.test.ts 对拍 dupes.json | ✅ 通过 |
| 提示词/URL 规则/解析一致 | tests/llm.test.ts（含与 carddeck/llm.py 逐字对读） | ✅ 通过 |
| 电话 +86/前导零 | tests/excel.test.ts 回读（文本类型 t:'s'，值原样；社区版 SheetJS 不序列化 z='@'，已在 excel.ts 注明） | ✅ 通过 |
| 旧备份导入（SQLite+图片，忽略旧 Key） | tests/backup.test.ts 用 fixtures/desktop-backup.zip（sql.js 读取） | ✅ 通过 |
| v2 往返/损坏回滚/版本拒绝 | tests/backup.test.ts + importer.test.ts | ✅ 通过 |
| 导入事务回滚 | importer.test.ts（写失败库 untouched） | ✅ 通过 |
| 透视校正数学 | tests/photo.test.ts（恒等还原误差<2/像素，尺寸等比，越界钳制） | ✅ 通过 |
| 类型检查 | tsc --noEmit tsconfig.test.json | ✅ 干净 |
| base64 可移植实现 | tests/importer.test.ts（padding 边界） | ✅ 通过 |
| 合计 | `node --import tsx --test tests/*.test.ts`（Node v22.17.0 便携版） | ✅ 38/38 |

对照期望生成器：`fixtures/generate_expected.py`（桌面版实现直出，7 样本）。

## B. HBuilderX 编译（本机已验证 ✅，2026-09-16）

- HBuilderX 5.24 标准版（`D:/temp/opencode/` 下便携 Node v22 + JDK17 + Android SDK，见 BUILD.md）。
- **关键发现**：CLI 版 uni-app 项目必须用**根 manifest.json/pages.json 布局**
  （`getIsCli` 认 `src/manifest.json`，但工具链读根 manifest；混合布局注册为 type=1 被拒，
  标准布局注册为 type=32）。`mobile/` 已按官方 `uni-preset-vue/default-ts` 模板摆成全平铺。
- `cli launch app-android --compile true`：**编译成功**（编译器 5.24 vue3，含 4 个 UTS 插件）。
- UTS 安卓实现编成 Kotlin（`unpackage/.../app-android/index.kt` 已生成，
  `getAppContext()` 取自官方 `io.dcloud.uts.android`，替代隐藏 API）。
- 编译器自动安装了 TS 插件与 `uniapp-uts-v1` 工具链。

## C. 模拟器运行（部分验证 ⚠️，2026-09-16）

- 自建 AVD（Pixel 7, Android 14 x86_64, WHPX 加速）：启动成功，`launch app-android`
  同步成功（“同步手机端程序文件完成”“应用【mobile】已启动”），截图见
  `docs/screenshots/emulator-tabs.png`：底部名片/录入/表格/设置 Tab 渲染正常，可切换。
- **UTS 数据层在标准基座上跑不起来**：logcat 报
  `FileNotFoundException data/dcloud_uts.dat`，UTS 原生包只随自定义基座/离线包下发，
  标准基座同步只传 www。因此内容区空白（JS 层正常，db 调用抛错被吞）。
- 结论：完整数据链路需**自定义基座（云打包，需 DCloud 账号）或离线 APK**（见下）。

## D. 构建产物

- Android 测试 APK：⬜ 未出。两条路：① 云打包自定义基座/APK（需 DCloud 账号登录，
  `cli user login` 后按 BUILD.md 走）；② App离线SDK + 本机 gradle（SDK/JDK 现成，
  需下 ~1GB 离线包并接 HBuilderX 产物）。
- 测试真机/模拟器全链路：⬜ 待自定义基座或 APK 后补。
- iOS：⬜ 需 macOS + Apple 开发者账号（代码与 UTS 就绪，签名安装待账号）。
- 鸿蒙：⬜ 需 DevEco + 华为开发者账号（UTS relationalStore 契约实现就绪，真机待账号）。
- 断网/拒权限/杀进程/旋转/长字段/万条：⬜ 待真机（KV 草稿恢复与 busy 防重已实现）。
