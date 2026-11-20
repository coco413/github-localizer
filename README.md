# GitHub 译伴

面向中文用户的非官方 GitHub 浏览器扩展。首个切片在授权后使用随安装包提供的词库汉化仓库首页导航。

## 构建与安装候选包

运行 `npm ci` 和 `npm run build`。构建需要 Node.js 和 `zip`，输出位于 `dist/`。

- Chrome 在 `chrome://extensions` 开启开发者模式，加载 `dist/chrome`。
- Edge 在 `edge://extensions` 开启开发人员模式，加载 `dist/edge`。
- Firefox 在 `about:debugging#/runtime/this-firefox` 选择临时载入附加组件，打开 `dist/firefox/manifest.json`。

打开扩展弹窗，选择「授权 GitHub」，然后访问仓库首页。

首个切片处理完整加载的仓库首页和授权时已经打开的仓库首页。站内切页和异步更新由 #5 实现。

## 固定样例回归

运行 `npx playwright install chromium` 和 `npm test`。CI 会在每个 PR 运行同一组测试。
