# 参与贡献

欢迎通过 Issue 报告问题，通过 Pull Request 提交改进。

1. Fork 仓库，使用 Node.js 22 或以上版本，运行 `npm ci`。
2. 在功能分支修改；`npm test` 构建并运行测试，`npm start` 启动本地静态预览。
3. 修改界面时检查手机和平板布局；修改存储或同步时覆盖离线、重复同步、冲突与旧备份场景。
4. 在 PR 中说明触发问题、修改后的行为和验证结果。

默认本机模式不连接作者的登录服务或数据库。测试云端功能请使用自己的服务。

## 测试入口

| 命令 | 范围 | 前提 |
| --- | --- | --- |
| `npm test` | 构建与单元／模块回归 | 无需账号和数据库；默认 CI 使用此命令 |
| `npm run test:browser` | 照片上传、双浏览器、离线与 ZIP 集成流程 | 默认使用内存存储，无需数据库；明确设置 `MEAL_TEST_DATABASE=1` 才使用 `DATABASE_URL`，必须指向已迁移的隔离测试库 |
| `npm run smoke:online` | 站点资源、未登录 API 拒绝、未登录本地照片和离线恢复 | 默认检查正式站，也可用 `TRAINING_BASE_URL` 指定预览；使用隔离浏览器资料 |
| `npm run test:update` | 更新入口及本地文字、照片保留 | 同上；本地 `package.json` 的版本应与目标站点一致 |

浏览器脚本在 Windows 默认使用已安装的 Edge；其他平台默认使用 Playwright Chromium。可用 `BROWSER_CHANNEL` 指定浏览器通道；没有安装 Chromium 时先执行 `npx playwright install chromium`。

浏览器集成测试模拟认证，不证明真实邮箱登录或 JWT 校验正确。测试账号、真实设备和上线前后验收应分别记录。不要给集成脚本传入生产数据库；测试输出写入 `test-output/`，不提交到仓库。

## 源码与构建产物

当前 `dist/` 包含手写源码，仅 `auth-sdk.mjs`、`cloud-config.mjs`、`meal-zip.mjs` 为忽略跟踪的生成文件。不要将整个 `dist/` 当作可删除的构建目录；修改这些生成文件对应的入口时，编辑 `src/` 或 `scripts/build.mjs`。

请使用虚构数据复现问题；不要提交真实训练备份、邮箱验证码、数据库密码、访问令牌或浏览器配置。涉及实际训练记录的破坏性变更应提供迁移及恢复方式。

贡献代码按本仓库 MIT 许可证提供；新增依赖和资源需保留相应版权及许可证。
