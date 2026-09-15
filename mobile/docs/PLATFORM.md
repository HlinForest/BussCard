# 平台适配说明（Android / iOS / 原生鸿蒙）

UTS 插件是唯一原生层（`utssdk/`），TS 业务经 `src/adapters/uts.ts` 绑定，单测用 `memory.ts`。

| 能力 | Android | iOS | 鸿蒙 |
|---|---|---|---|
| 联系人库 | SQLiteOpenHelper，`filesDir/busscard.db` | sqlite3 系统库，Documents | relationalStore RDB，沙箱 files（谓词查询） |
| 版本迁移 | `_info` 表 version，`ensureSchema` 逐版升 | 同左 | 同左（RDB 内同样建 `_info`） |
| 图片/文件 | filesDir 私有目录 | Documents（不进 iCloud 备份标记位由原生侧置） | files 沙箱 |
| 密钥 | EncryptedSharedPreferences | Keychain kSecClassGenericPassword | AssetStore 同步接口 |
| 分享/选择文件 | FileProvider + ACTION_SEND / SAF | UIActivityViewController / UIDocumentPicker | Picker + Share Kit |
| 相机/相册 | uni.chooseImage（权限 manifest 已声明） | 同左（info.plist 用途描述 HBuilderX 生成时补） | 同左（module.json5 权限见下） |
| 自动框选 | OpenCV findContours+approxPolyDP（gradle 依赖，BUILD.md） | Vision VNDetectRectanglesRequest | CoreVisionKit；不可用返回空走手动 |

权限（manifest.json 已声明相机/相册；鸿蒙 module.json5 在 HBuilderX 新建鸿蒙工程时按
`ohos.permission.CAMERA`、`ohos.permission.READ_IMAGEVIDEO`、`ohos.permission.WRITE_IMAGEVIDEO`、`ohos.permission.INTERNET` 勾选）。

## 万条设计

- 搜索/查重全表一次读入内存：1 万条 search_text 平均 <1KB，总量 ~10MB，低端机可接受；
  列表一律分页（limit/offset），不做无限制渲染。
- `idx_contacts_name/company/phone1/email` 四索引与桌面一致；查重走内存归一化索引 O(n)。
- 识别/导入/导出全程 busy/loading，失败保留现场可重试；重复点击由 busy 遮罩拦截。

## 已知平台差异（真机联调时确认）

1. `uni.canvasToTempFilePath` 的 drawImage 九参裁切在各端行为需真机确认，失败回退整图（entry.vue 已做）。
2. 鸿蒙 RDB 谓词排序与 SQLite ORDER BY 的 NULL/大小写语义差异：TS 层二次排序兜底（services 内排序比较器与 SQL 同序）。
3. iOS Documents 图片默认进 iCloud：原生侧置 `NSURLIsExcludedFromBackupKey`（cardstore 实现备注）。
