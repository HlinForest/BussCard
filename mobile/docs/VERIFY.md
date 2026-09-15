# 验证记录（按 spec 第 3/4 步逐项登记；未验证项明确标注）

## A. 数据正确性（本机已验证 ✅）

| 项 | 方法 | 结果 |
|---|---|---|
| 字段校验与桌面一致 | tests/validate.test.ts 对拍 fixtures/expected/validate.json | ✅ 通过 |
| 搜索排序/分数/依据与桌面一致 | tests/search.test.ts 对拍 11 queries（含精确/尾号/模糊/语义/空/标签） | ✅ 通过（分数 1e-6，依据逐字） |
| 查重分组/依据/传递闭包一致 | tests/dedupe.test.ts 对拍 dupes.json | ✅ 通过 |
| 提示词/URL 规则/解析一致 | tests/llm.test.ts（含与 carddeck/llm.py 逐字对读） | ✅ 通过 |
| 电话 +86/前导零 | tests/excel.test.ts 回读（文本类型 t:'s'，值原样） | ✅ 通过 |
| 旧备份导入（SQLite+图片，忽略旧 Key） | tests/backup.test.ts 用 fixtures/desktop-backup.zip（sql.js 读取） | ✅ 通过 |
| v2 往返/损坏回滚/版本拒绝 | tests/backup.test.ts + importer.test.ts | ✅ 通过 |
| 导入事务回滚 | importer.test.ts（写失败库 untouched） | ✅ 通过 |
| 透视校正数学 | tests/photo.test.ts（恒等还原误差<2/像素，尺寸等比，越界钳制） | ✅ 通过 |
| 类型检查 | tsc --noEmit tsconfig.test.json | ✅ 干净 |
| 合计 | `node --import tsx --test tests/*.test.ts` | ✅ 38/38 |

对照期望生成器：`fixtures/generate_expected.py`（桌面版实现直出，7 样本）。

## B. 平台能力（待 HBuilderX，真机/模拟器）

| 项 | Android | iOS | 鸿蒙 |
|---|---|---|---|
| 数据库读写/迁移 | ⬜ 待验证 | ⬜ 待验证 | ⬜ 待验证 |
| 图片持久化/相对路径 | ⬜ | ⬜ | ⬜ |
| 接口请求/模型列表/连通测试 | ⬜ | ⬜ | ⬜ |
| 文件导入导出/系统分享 | ⬜ | ⬜ | ⬜ |
| 相机/相册权限 | ⬜ | ⬜ | ⬜ |
| 自动框选（OpenCV/Vision/回退） | ⬜ | ⬜ | ⬜（预期回退手动） |
| 编译通过 | ⬜ | ⬜ | ⬜ |
| 模拟器跑通 | ⬜（本机 Android SDK 现成） | N/A | N/A |
| 真机跑通 | ⬜ | ⬜（需 Mac+签名） | ⬜（需 DevEco+签名） |

## C. 手机使用项（待真机）

断网/拒权限/识别中断/重复点击/杀进程重启/图片旋转/长字段/万条分页，不阻塞操作。
（杀进程恢复已有 KV 草稿机制；重复点击已有 busy/loading 拦截；其余待真机登记。）

## D. 构建产物

- Android 测试 APK：⬜ 未出（待 HBuilderX，见下）
- iOS/鸿蒙工程与签名说明：✅ 代码与 UTS 就绪，签名安装待账号（符合 spec 默认条件）
