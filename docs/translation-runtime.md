# 页面汉化运行时

授权后在 GitHub 页面注入 `runtime.js`，页面规则随后通过
`githubLocalizerRuntime.register(name, translate)` 注册。回调按当前路径选择规则，
通过 `matches(selector, scope)` 查找完整页面或本次受影响的区域，通过
`source(node, attribute)` 读取当前原文。依赖整个容器上下文的规则可用
`recheckScope(scope)` 在容器受影响时重新验证其内所有控件。通过
`replace(node, attribute, value)` 应用、记录并恢复可安全改动的值。传入
`null` 属性名时改动文本节点本身。

`configure({ enabled, mode, original })` 接收部分设置。档位用
`beginner` 或 `professional`，`original` 是当前文档的临时原文覆盖。
`getState()` 返回当前设置的副本，并在读取前处理待更新的路径变化。
路径或查询参数变化会清除临时覆盖。设置的存储与跨标签同步由调用方负责。
规则中的单一字符串适用两个档位，具有 `beginner` 和 `professional` 两个字段
的词条由 `word(value)` 选取当前档位。

相对时间规则使用 GitHub 的 `relative-time` 元素的 `lang` 属性。
组件负责格式化与定时更新，暂停时只撤销扩展记录的语言属性。
