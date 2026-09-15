# BussCard — 拍照名片管家：一键识别 → Anki 式卡片 → 表格/Excel → 混合检索

手机拍照，多张名片一次入库；Deck 为按提取字段生成的文本小卡（Anki 风格，不贴原图）；表格、搜索、Excel 导出读写同一份本地数据。

> Self-hosted business-card manager (Flask + SQLite). Snap multiple cards in one photo, get text-based Anki-style cards, editable table, xlsx export and hybrid search. Data stays on your machine.

## 功能

- **一键上传识别**：选照片点一下，整图多卡直接识别，一次返回多条草稿；框选只在漏卡/串卡时才需手动微调（折叠在“手动微调”里：重新检测框选、补框、按框逐张识别）。
- **Anki 式 Card Deck**：按姓名/公司/职位/电话/邮箱/业务/标签生成的文本小卡，手机左右滑、电脑网格；点卡片看大图详情；卡片右上角可删除。
- **可编辑表格 + Excel 导出**：与卡片同一份数据；导出全部/勾选/搜索结果，电话列为文本格式（保留 `+86` 与前导零），快照导出。
- **混合检索**：一个框，精确（含电话尾号）优先 → RapidFuzz 模糊 → 字符 bigram TF-IDF 语义，附命中依据；搜索结果可点开大卡。
- **查重删除**：Deck 和表格均有“查找重复”（电话归一化/邮箱/姓名+公司分组，标依据），每组默认保留最早一条，可改选，二次确认再删。
- **LLM 设置页**：OpenAI 兼容视觉接口（URL 到 `/chat/completions`），填 Key 自动拉模型列表；名片识别须用视觉模型（如 DeepSeek `deepseek-v4-flash-vision-exp`、百炼 `qwen-vl-max`）。
- **手机当 App 用**：响应式 + PWA（manifest/图标/全屏），手机浏览器“添加到主屏幕”即可。

## 一键启动（Windows）

```powershell
# 双击 start.bat：自动装依赖、显示电脑与手机地址、打开浏览器；关闭黑窗口即停止
```

- 电脑打开：`http://127.0.0.1:5000`
- 手机（同一 WiFi）：`http://<电脑IP>:5000`（多个地址时选 10.x/192.168.x 那个；打不开先放行防火墙 5000 端口）

手动启动：`pip install -r requirements.txt` 后 `python app.py`。未配 Key 也能跑全流程（识别返回空模板标“待核对”）。

## 数据位置（本地文件，重启不丢）

| 内容 | 路径 |
|---|---|
| 联系人库（SQLite） | `data/carddeck.db` |
| 原图 | `data/uploads/` |
| LLM 地址/Key/模型 | `data/llm_config.json` |

备份拷走 `data/` 文件夹即可。`data/`、`.env` 已在 `.gitignore` 中，不会随代码上传。

## 目录结构

```text
app.py                 Flask 服务 + API
carddeck/
  detector.py          一图多卡定位（OpenCV 找四边形 + 透视校正，手动模式用）
  llm.py               视觉模型适配（单张/整图多卡识别、模型列表、连通性测试）
  llm_config.py        页面配置存取（data/llm_config.json）
  validate.py          电话/邮箱校验、待核对标记、疑似重复提示
  search.py            精确 + RapidFuzz 模糊 + bigram TF-IDF 语义
  excel_export.py      xlsx 导出（电话文本格式）
  db.py                SQLite 存取
templates/index.html   单页前端（拍照/Deck/表格/搜索/LLM设置）
static/app.js          交互（含全局加载遮罩防重复点击）
start.bat              Windows 一键启动
```

## 识别规则

看不清留空 + `待核对`；电话邮箱单独校验；疑似重复只提示不自动合并；印刷标签与推断标签分开存。首版按每图 2～8 张、留空隙、无遮挡验证，上限 10 张/次。
