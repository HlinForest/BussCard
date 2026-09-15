# 构建说明（HBuilderX + 三端）

## 0. 前置（本机已就绪的可复用）

- Node：`D:/temp/opencode/node-v22.17.0-win-x64`（便携，`mobile/.npmrc` 已指 npmmirror；
  **已写入用户 PATH**，HBuilderX CLI 编译必需）
- JDK 17：`C:/Program Files/Eclipse Adoptium/jdk-17.0.20.101-hotspot`
- Android SDK：注意现 `ANDROID_HOME=D:/temp/opencode/android-sdk` 是临时目录（含 build-tools 35/36、
  platforms 34-37、ndk、cmake、platform-tools、emulator、android-34 镜像），
  **正式构建前请迁到固定目录并重设环境变量**。
- HBuilderX：标准版 5.24（`D:/temp/opencode/HBuilderX/HBuilderX/`，CLI 可用，TS 插件与
  `uniapp-uts-v1` 工具链已自动装好；自带模拟器 AVD `busscard` Pixel 7 Android 14 可复用）。
- 项目布局必须是**官方 CLI 全平铺**（根 `App.vue/main.ts/manifest.json/pages.json/pages/static`），
  之前 `src/` 布局会被注册为 type=1 而编译拒绝；改完以 `HBuilder X.ini` 里 type=32 为准。

## 1. 装 HBuilderX（Windows）

1. 官网下载 HBuilderX 标准版并安装（App 打包另需登录 DCloud 账号：云打包用）。
2. 用 HBuilderX 打开 `mobile/` 目录（cli 项目，HB 自动识别 uni-app vite 工程）。
3. `npm install`（已在 mobile/ 装过可跳过）。

## 2. Android：先跑通，再出测试 APK

1. HB 菜单 运行 → 运行到手机或模拟器 → 选 Android 模拟器/真机（需开 USB 调试），
   或 CLI：`cli launch app-android --project <mobile绝对路径> [--deviceId emulator-5554]`。
   纯编译验证：加 `--compile true`（本机已验证通过）。
2. **标准基座只能验 JS/UI 层**：UTS 原生能力（SQLite/安全存储/文件/检测）需自定义基座，
   否则内容空白且 logcat 报 `dcloud_uts.dat` 缺失（已实测确认）。
3. 自定义基座/APK：`cli user login` 登录 DCloud 账号后云打包（测试证书即可，不上架），
   或按 DCloud App离线SDK 文档用本机 Android SDK + gradle 离线出包。

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
