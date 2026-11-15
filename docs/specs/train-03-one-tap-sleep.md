# TRAIN-03 · 一键导入近 7 天睡眠

2026-11-15。在讨论是否需要预览后再点确认时，mantou 选择 A。安装 Android 小工具且授予读取权限后，在安卓 Chrome 的训练卡「记录」页点击一次。读取当日及前六个醒来日的 Health Connect 睡眠，用原有规则查重。同日多段、跨来源冲突、变更版本和不完整日期显示为待核对。只把可新增的睡眠写进每日记录。文件导入仍可用于补更早日期。

| 验收项 | 结果 |
| --- | --- |
| 从训练卡触发 | 安卓 Chrome 用户手势发出指向小工具的 Intent。小工具依据构建时固定的 HTTPS 地址核对请求，只有读取睡眠权限。S23 Ultra 已安装测试构建，系统可解析入口 |
| 返回浏览器后自动保存 | 测试覆盖在相同浏览器中打开新标签和关闭原窗口后重新打开，复用已有单窗口编辑锁与保存事务。首次授权后只有一次触发。回传仅携带 AES-GCM 加密摘要，URL 去掉片段后由对应的账户或访客数据空间消费 |
| 去重与待核对 | 模块和浏览器均覆盖自动保存、重复触发、旧回传复用、完整睡眠阶段缺失、同日多段和错误处理。待核对明细留在本机记录页，下一次成功检查时更新 |
| 失败与隔离 | 测试覆盖无法打开小工具、拒绝权限、过期回传、请求不匹配和不同数据空间。确认状态取本机实际写入结果。已登录时已保存的摘要沿用账号同步 |
| 手机实机完整闭环 | 候选待验收。先前测试包已在 S23 Ultra 安装并解析 Intent。与独立 HTTPS 预览匹配的 APK 已传入手机「下载」，需在手机更新后实测点击、授权、读取与保存 |

构建使用 JDK 17、Android SDK 36、build-tools 35.0.0，运行最低版本 Android 14。

```powershell
./android/sleep-bridge/build.ps1 -Sdk <AndroidSDK> -Jdk <JDK17> -Origin <精确的HTTPS训练卡地址>
node --test tests/one-tap-sleep.test.mjs
node tests/browser-one-tap-sleep.mjs
```

Java 到浏览器互通测试在构建后编译 `tests/EnvelopeHarness.java`，以 `test-output/one-tap-android/classes` 为类路径，输出至 `test-output/one-tap-interoperability`。将 `TRAINING_SLEEP_JAVA` 设为 Java 可执行文件，再运行浏览器测试。生成的 APK 与本地签名密钥留在忽略目录，生产部署和正式签名尚未执行。

2026-11-15，提交 `95633c2` 的[独立预览](https://mantou-training-offline-go2y2miet-mantous-projects-af7e7067.vercel.app/)已上线。检查了空账号配置、同步接口返回 404，以及正式站页脚为 2.4.3。用真实部署地址、手机尺寸浏览器和 Java 生成的合成密文重跑回传测试，离线回传、跨标签页、冷启动、查重、防重放、切数据空间、拒绝权限均通过。设置 `TRAINING_ONE_TAP_PREVIEW` 可复跑此测试。它要求站点无账号及同步 API。

匹配的 APK 在设备下载目录，SHA-256 为 `1DF2B712026835CD4FC041EE7000A0725DEF7CCA7922E3B38BE46FF01B374F3B`。USB 远程安装并打开 Chrome 的命令被执行策略拦截。改为仅传输文件并校验，手机端安装和点击交给本人。

参考 [Chrome Android Intent](https://developer.chrome.com/docs/android/intents)、[Android HealthConnectManager](https://developer.android.com/reference/android/health/connect/HealthConnectManager)、[URL 片段](https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Fragment)。
