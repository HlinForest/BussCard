# 构建说明（HBuilderX + 三端）

## 0. 前置（本机已就绪的可复用）

- Node：`D:/temp/opencode/node-v22.17.0-win-x64`（便携，`mobile/.npmrc` 已指 npmmirror）
- JDK 17：`C:/Program Files/Eclipse Adoptium/jdk-17.0.20.101-hotspot`
- Android SDK：注意现 `ANDROID_HOME=D:/temp/opencode/android-sdk` 是临时目录（含 build-tools 35/36、
  platforms 34-37、ndk、cmake），**正式构建前请迁到固定目录并重设环境变量**。
- HBuilderX：本机未装（见下）。

## 1. 装 HBuilderX（Windows）

1. 官网下载 HBuilderX 标准版并安装（App 打包另需登录 DCloud 账号：云打包用）。
2. 用 HBuilderX 打开 `mobile/` 目录（cli 项目，HB 自动识别 uni-app vite 工程）。
3. `npm install`（已在 mobile/ 装过可跳过）。

## 2. Android：先跑通，再出测试 APK

1. HB 菜单 运行 → 运行到手机或模拟器 → 选 Android 模拟器/真机（需开 USB 调试）。
2. 验证清单见 VERIFY.md（数据库/图片/接口/文件/分享/识别全链路）。
3. 发行 → 原生App-云打包 → 公开测试证书 → 得到 APK（spec：测试 APK 用云打包+测试证书即可，
   不上架、不注册开发者账号）。
4. 如需离线打包：按 DCloud App离线SDK 文档，用本机 Android SDK + `UniPlugin-Hello-AS` 模板，
   把 `unpackage` 产物套壳签名（debug key 走 `keytool -genkey`）。

## 3. iOS（需 macOS + Apple 开发者账号，本机 Windows 做不了）

1. 代码与 UTS 已就绪（含 Keychain/Photos 适配说明）。
2. 在 Mac 上用 HBuilderX 打开本目录 → 发行 → 原生App-云打包（iOS，需证书/描述文件）。
3. 真机验收后在 VERIFY.md 登记。**当前状态：未验证**（尚无苹果签名条件，符合 spec 默认条件）。

## 4. 原生鸿蒙（需 DevEco + 华为开发者账号，本机做不了）

1. HBuilderX 新建“uni-app x 鸿蒙项目”壳，把 `mobile/src + utssdk + manifest` 按 UTS 鸿蒙规范迁入；
   `utssdk/carddb/harmony.uts` 已按 relationalStore 写好契约实现。
2. module.json5 勾选 CAMERA/READ_IMAGEVIDEO/WRITE_IMAGEVIDEO/INTERNET。
3. DevEco 签名（需华为账号）→ 真机验收后登记。**当前状态：未验证**。

## 5. 日常开发循环（不经过 HBuilderX 也可跑）

```powershell
cd mobile
node --import tsx --test "tests/*.test.ts"   # 38 纯逻辑单测
python fixtures/generate_expected.py          # 用桌面版重算对照期望
```
