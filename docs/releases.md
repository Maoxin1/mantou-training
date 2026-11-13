# 版本、部署与验收入口

核对日期：2026-11-13。版本号、源码提交、托管部署和 GitHub Release 分别记录；本页是带日期的快照，后续部署以平台元数据及对应提交的 CI 为准。

| 标识 | 本次核对结果 | 用途 |
|---|---|---|
| 应用版本 | `package.json` 为 `2.4.2` | 识别应用更新版本，不足以确定唯一源码提交 |
| 2.4.2 功能整合 | [491ab1922321a82dc8f48c38f0deb37c5e40b2f4](https://github.com/Maoxin1/mantou-training/commit/491ab1922321a82dc8f48c38f0deb37c5e40b2f4) | 功能发布的源码参考 |
| 核对时 main | [78fbab9597705987d6626ee34b051b5a6f4e9bb4](https://github.com/Maoxin1/mantou-training/commit/78fbab9597705987d6626ee34b051b5a6f4e9bb4) | 在功能提交之后整理文档；不是新应用版本 |
| 核对时生产部署 | `dpl_DXTMq41TmYh5rpbQr43NtgskYndb`，状态 `READY`，源提交 `78fbab9597705987d6626ee34b051b5a6f4e9bb4`，分支 `main` | Vercel 元数据与[正式域名](https://mantou-training-offline.vercel.app/)的对应关系；后续文档合并也可能生成新部署 |
| 最新 GitHub Release | [v2.0.0](https://github.com/Maoxin1/mantou-training/releases/tag/v2.0.0)，提交 `7231e140c6c1164f69fc9e0fddb54e033442f5ec` | 历史发行包，未包含当前 2.4.2 功能；不是正式站当前版本 |

在线使用从[正式域名](https://mantou-training-offline.vercel.app/)进入。安装更新按 [README](../README.md#安装与更新)，无需清空浏览器数据。自部署获取当前 main 时，先记下完整提交，再按 [README](../README.md#自部署)构建；下载历史 Release 不能得到最新应用。

## 验收证据的边界

- 2.4.1 的正式账号手机／平板更新、旧记录与餐照保留并同步、离线重开可见性，已有本人确认，见[维护记录](maintenance.md)。
- 2.4.2 的 106 项模块测试、8 组浏览器脚本、隔离账号升级演练，以及独立预览的手机／平板检查已有记录。隔离演练不能替代正式账号验证。
- 2026-11-13 本人明确确认 2.4.2 正式账号验收三项均通过：手机和平板均为 2.4.2，原训练记录和餐照保留并完成同步，离线重开仍可见记录。这是独立于预览和隔离演练的用户确认，不扩大为所有并发场景或 OTP 邮件投递重新测试。

逐项状态见[功能台账](feature-ledger.md)、[维护记录](maintenance.md)与[贡献说明](../CONTRIBUTING.md)。补充本页不会发送验证码、读取训练数据或改变认证与数据库配置。

## 后续发版与恢复

正式版本发布前，按[维护说明的发布检查](maintenance.md#发布检查)完成测试、部署提交与域名核对、适用的线上检查及真实账号确认，再明确版本号、标签和 Release 内容。本次仅补齐入口，不创建或移动标签，不修改历史 Release。

文档调整可用普通 revert 提交恢复。应用回退需同时核对当时的数据格式、未同步编辑、源码提交与部署域名；版本号相同也应核对完整提交。切回旧部署不会回滚数据库、云端照片或浏览器缓存，Git 备份也不包含这些数据。操作前分别备份并验证可恢复性，保留原始记录；不要通过清空浏览器数据回退应用。
