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

## T03-OT-01 · 返回窗口交接回归（2026-11-15）

USB 更新测试包后，S23 Ultra 已从真实预览入口触发系统睡眠权限页，成功授予读取睡眠。返回 Chrome 新标签页出现「另一窗口正在使用训练卡」，故此前桌面全绿不能证明实机验收通过。旧测试的成功结果可能由原标签页写入，再广播给只读返回页；继续点击也一直在原标签页，遗漏了用户实际停留的返回页。

- **需求**：返回页 MUST 能独立完成保存并继续操作；原页 MUST NOT 在交接后继续写入旧快照。不同窗口仍使用独占编辑锁。此项澄清一键流程的连续可用性，没有扩展为后台自动导入。
- **触发条件**：原页持有编辑锁，Android 打开返回新标签页；原页后台事件延迟时返回页无法保存。不能仅凭此现象判定手机确实进入 Chrome frozen 状态。
- **红灯**：`node tests/browser-one-tap-handoff.mjs` 在原页不接收 storage 事件的可复现环境中，返回页等待保存结果超时；不是依赖或语法错误。
- **修复**：发起跳转前交出编辑锁并停止该页同步。正在同步或填写时阻止交接。返回新页取得锁；同页回传先重新载入最新缓存再取得锁。原页旧快照保持不可写，需刷新后继续。
- **绿灯**：同命令通过，覆盖延迟跨页事件、返回页可编辑、旧页不能重复发起、同页回传查重及刷新保全。另以模拟认证／网络和实际同步代码验证进行中的同步阻止跳转、账号摘要同步及已有反馈保留，不能代替正式账号实测。
- **保留原测试**：`tests/browser-one-tap-sleep.mjs` 改为始终在 Android 返回页继续操作，原来的离线、重放、冷启动、错误和数据空间隔离断言保留并通过。

Chrome 对页面生命周期和释放 Web Locks 的说明见[官方文档](https://developer.chrome.com/docs/web-platform/page-lifecycle-api)。本次只处理显式睡眠交接，不更改其他页面的通用后台策略。修复后的手机完整验收与正式发布仍待完成。
