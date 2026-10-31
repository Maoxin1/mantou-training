# 睡眠辅助应用｜第一阶段

状态：数据转换原型完成；尚无Android安装包，尚未接入生产自动同步。用户已确认只先接睡眠，接受S23 Ultra安装辅助应用。Android版本与Health Connect中是否已有三星睡眠待确认。

## 路径与范围

Watch 6 → 三星健康手机App → Health Connect → Android辅助应用 → 本人训练卡账号 → 手机/平板同一记录。

首版只申请睡眠读取；后台读取作为单独可选授权，先探测平台是否支持。打开应用触发同步与后台周期执行分别验收，不能以手动触发替代后台自动同步。后台任务按系统调度，不保证实时或固定分钟到达。无权限或来源无数据时显示具体状态，不写零小时。

本机当前没有可用Java、Gradle、ADB和默认路径Android SDK。下一阶段需搭建构建环境，再编译原生App；当前不得标记APK已就绪。

## 已实现的转换合同

`dist/health-connect-core.mjs`接受三星来源com.sec.android.app.shealth的记录：id、origin、startMs、endMs、endOffsetMinutes、updatedMs、stages。阶段类型由原生端根据Health Connect常量映射为语义字符串；未知保持unknown。非三星来源过滤，单次最多500条，每条阶段最多2000段。

输出与现有Samsung睡眠结构兼容的独立片段；以醒来时区决定日期，完整阶段才能算设备估计实际睡眠。缺段或未知不以区间时长代替。相同ID采用较新版本，等版本矛盾拒绝。夜间分段、午睡不凭同一天自动合并，后续需明确夜间聚类与确认机制。

原型尚未从界面调用，也没有写入账号。后续必须覆盖：设备配对和可撤销的最小权限凭据；拒绝跨账号写入；只更新睡眠，不覆盖训练/饮食；同ID修订；ZIP与Health Connect重复来源；来源删除；断网补传和分页；时区变化；撤销权限；后台延迟可见性。正式接入前不新增读写生产端点。

## 三条工作的当前状态

1. 托管认证：Google提供方回读仍为空，邮箱配置保留；服务端修复状态仍未知。用户已提供Neon AI回复，官方10月16日说明1.7.6不足以证明当前实例的补丁状态。不得以本地升级推定服务端修复。
2. 自动睡眠同步：6项转换测试通过；还需原生读取、权限、账号配对、后台任务与真实设备验收。
3. 效果评估：重新读取云端仍revision62，两场完成训练、一场草稿；未有新执行记录。中途判断沿用私人Obsidian复盘，不将两周试行报告标记完成，不把稀少饮食反馈当作营养达标。

## 验收终点

S23实际获得一晚三星睡眠数据；明确同意后同步至正确账号；手机和平板一致；重复执行不重复计数；断网恢复后补传；现有训练、饮食和ZIP记录保留；撤销授权立即停止读取。背景任务至少有一次系统实际执行证据后，才宣称后台同步可用。

来源：
- https://developer.android.com/health-and-fitness/health-connect/get-started
- https://developer.android.com/health-and-fitness/health-connect/read-data
- https://developer.samsung.com/health/health-connect-faq.html
