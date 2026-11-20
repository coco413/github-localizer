# 固定样例集成测试与性能基准

`npm test` 由 PR CI 运行。集成测试安装构建后的 Chromium 候选扩展，通过仓库页、里程碑以及实际弹窗操作，验证相同的 Open 在里程碑筛选器和标题中的不同处理、动态补译、撤权后的原文与可点击链接、重新授权后采用已保存的专业档及最新控件内容。其他固定样例覆盖 Issue、PR、Actions 和 Releases，验证受保护区域、定位语境、属性、设置持久化和恢复。

## 复跑

先安装 Google Chrome、Microsoft Edge 和 Node.js 24，再执行：

```sh
npm ci
npx playwright install firefox
npm run benchmark
```

也可传入单个浏览器，例如 `npm run benchmark -- firefox`。如 Chrome 或 Edge 未安装在默认位置，使用 `CHROME_EXECUTABLE` 或 `EDGE_EXECUTABLE` 指向真实浏览器的可执行文件。基准校验浏览器身份，任一浏览器无法启动都会使命令失败。Firefox 使用 Playwright 提供的 Juggler 兼容 Nightly 构建，并由 Firefox 远程调试协议临时安装候选扩展。

每个浏览器使用新的无头浏览器配置。候选扩展的临时副本将可选 GitHub 主机权限设为已授予，性能测试从已授权状态开始。浏览器将仓库网址拦截为固定样例，阻止其他网络请求。样例在仓库主页渲染「拉取请求（PR）」标签，浏览器端使用 `performance.now()` 计时：

1. 首屏从带有仓库语境的控件插入文档开始，在第一轮观察到目标节点的译文写入时结束。
2. 动态补译从 GitHub 模拟写入英文标签开始，在第一轮观察到译文写入时结束。
3. 每次导航产生一组数据。排除一次暖机导航后，取 30 组。使用最近秩法，排序后第 29 个样本是 P95。
4. 最后一组动态补译结束后，观察整页 5 秒并统计全部 DOM 变更。固定样例在此期间不会更新页面。
5. 每个阶段上限为 200 毫秒，静置时变更数必须为零。命令输出环境、浏览器版本和各次原始数据。CI 固定样例功能检查与约定机器的性能采样分别执行。

## 采样记录

2026-11-21（北京时间），macOS 27.3（26C5047e），Apple M5 Pro arm64，48 GiB 内存，Node.js 24.15.0，Playwright 1.65.1。

| 浏览器 | 版本 | 首屏 P95 | 动态补译 P95 | 静置 5 秒变更 |
| --- | --- | ---: | ---: | ---: |
| Google Chrome | 158.0.8127.36 | 18.4 ms | 0.3 ms | 0 |
| Microsoft Edge | 158.0.4370.33 | 30.4 ms | 0.3 ms | 0 |
| Mozilla Firefox Nightly（Playwright 构建 1572） | 159.0 | 7 ms | 1 ms | 0 |

以上为固定样例开发候选包记录。普通 Firefox 发行版、真实 GitHub 页面及各商店安装包的验收证据需单独记录。
