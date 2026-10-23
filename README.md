# mantou · 训练卡

[![Tests](https://github.com/Maoxin1/mantou-training/actions/workflows/test.yml/badge.svg)](https://github.com/Maoxin1/mantou-training/actions/workflows/test.yml)
[![MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

轻量、离线优先的个人训练 PWA。打开就能查看计划，需要时记录一个动作，依据预设规则调整训练目标，每周导出到 Obsidian。

原生 JavaScript，无前端框架。适配手机与平板，采用白灰界面和蓝色强调。

## 功能

- 单动作记录：实际组次、余力、动作状态和训练条件。
- 规则进阶：主动开启验证后，连续两次达标才推进；可撤销目标调整。
- 临时减量、动作暂停、当前阻力与下一档设置。
- 安装到桌面；首次联网准备完成后，可离线查看、记录和导出。
- Markdown 周报、完整 JSON 备份与恢复。
- 可选邮箱验证码登录与跨设备同步，离线修改在应用打开并联网后补传。
- 不同日期的记录合并；真实差异明确选择，双方版本保留本机档案。

## 快速开始：本机模式

需要 Node.js 22 或以上版本。

```sh
git clone https://github.com/Maoxin1/mantou-training.git
cd mantou-training
npm ci
npm run build
npm start
```

打开 <http://127.0.0.1:4173>。默认不配置登录服务，也不会连接作者的数据库。记录只保存在当前设备；可在设置中导出和恢复备份。

```sh
npm test
```

测试涵盖训练进阶、备份、离线外壳、账号隔离、并发合并及反复冲突回归。自动测试不能替代实际设备与真实邮箱验收。

## 自部署

### 只需离线与本机记录

执行 `npm ci` 和 `npm run build`，将 `dist/` 部署到 HTTPS 静态托管服务。应用使用域名根路径，不支持直接放到任意子目录，也不能双击 HTML 文件运行。

Vercel 可直接导入 Fork，保留仓库根目录与 `vercel.json`，不设置环境变量即可使用本机模式。未配置邮箱同步时，`/api/sync` 返回 503。

### 需要邮箱和多设备同步

部署到自己的 Vercel 项目，配置自己的 Neon Managed Auth 与数据库。步骤见 [ACCOUNT-SYNC.md](ACCOUNT-SYNC.md)。

| 环境变量 | 用途 | 是否公开给浏览器 |
| --- | --- | --- |
| `AUTH_URL` | 自己的 Neon Auth HTTPS 地址；构建时生成前端配置，服务端用于校验认证 | 是，仅服务地址 |
| `DATABASE_URL` | 自己的 Postgres 连接字符串 | 否，只在服务端使用 |

不要把数据库密码放进 `AUTH_URL`，也不要提交真实 `.env`、验证码或训练备份。`dist/cloud-config.mjs` 与 `dist/auth-sdk.mjs` 均由构建生成。

本地静态服务器不运行同步 API；本地验证完整云端链路需使用 Vercel 的开发环境或自己的部署。

## 安装与更新

- Android：Chrome／Edge 菜单 → 安装应用／添加到主屏幕。
- iPad：Safari → 分享 → 添加到主屏幕。
- 等待状态显示“可离线使用”，再断网测试。
- 更新：设置 → 检查应用更新 → 新版就绪后重新打开。无需清空浏览器数据。

## 数据边界

未登录记录保存在设备 localStorage；已配置并登录后，训练记录和计划同步到该部署的后端。不同站点域名的本机存储不互通。

手机和平板离线时各自保存，重新联网并打开应用后再汇合；不承诺关闭应用后的后台同步。共享设备退出账号仍会保留未加密的本机缓存。每周建议导出完整备份。

默认训练安排来自一个家庭弹力带与自重训练场景，需要按自己的能力、器械和恢复情况调整。工具执行预设规则，不根据训练数据预测体型，也不提供诊断。没有记录不会自动加码；组数和训练天数不会自动增加。

## 目录

```text
dist/             界面、训练规则、同步逻辑和 PWA 外壳
api/              Vercel 同步 API，校验认证并隔离账号数据
src/              认证 SDK 构建入口
scripts/          构建与本地静态服务器
migrations/       自部署数据库建表 SQL
tests/            自动测试
```

欢迎提交 Issue 和 Pull Request，见 [贡献说明](CONTRIBUTING.md)。安全问题见 [SECURITY.md](SECURITY.md)。

## 许可证

[MIT](LICENSE)。允许使用、修改、分发和商业使用，须保留版权及许可声明。第三方依赖适用各自的许可证。
