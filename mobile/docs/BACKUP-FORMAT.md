# 备份格式

## v2（mobile 导出，三端互通）

ZIP 内唯一必需文件 `backup.json`：

```jsonc
{
  "version": 2,
  "app": "busscard-mobile",
  "exported_at": 1234567890000,
  "contacts": [ { "id": 1, "name": "…", /* 全部 Contact 字段 */ } ],
  "images": [ { "contact_id": 1, "kind": "photo", "path": "a.jpg", "data_base64": "…" } ]
}
```

- `images[].path` 只取文件名；导入时写入 `images/photo/` 或 `images/crop/`，联系人 `photo_path`/`crop_path` 为新相对路径。
- **Key 不在备份里**（spec）。
- 解析失败分类：非 ZIP / 缺 backup.json / JSON 坏 / 版本号非 2，一律抛错且调用方不得写任何数据。

## 桌面旧备份（desktop，`carddeck-backup.zip`）

```text
carddeck.db            # SQLite，contacts 表与 mobile 同字段
uploads/<name>.jpg     # 原图
llm_config.json        # 有旧 Key：导入时必须忽略
```

导入映射：逐列同名拷贝（tags_* 按 JSON 解析，非法则按单标签/空处理），`photo_path`/`crop_path`
取文件名后加 `imp-` 前缀写入 `images/photo/`，`search_text` 重建（防版本漂移）。
桌面单测 `fixtures/desktop-backup.zip` 即此格式最小样例。

## 事务与回滚语义

- v2 导入：先完整解析 → 写图 → `insertMany` 单事务入库；写图失败先于入库抛错，库 untouched；
  入库失败整体回滚（DbAdapter.runTx）。
- 桌面导入（真机）：先内存预备份（v2 格式）→ 图片落盘 → 文件级替换 db → 逐条 remap+重建
  search_text；任一步失败则擦除后重导预备份（id 会变，数据不丢）。
- 重复：任何导入都不自动删除/合并，只输出分组与依据，由用户在查重页手动处理。
