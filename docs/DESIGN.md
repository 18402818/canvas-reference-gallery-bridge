# 设计思路：为什么这样做

> 这一页解释「为什么」，不是操作手册。操作见 [../README.md](../README.md)。

## 1. 问题

用户手上已经有：
- 一个能跑的 **无限画布**（infinite-canvas，本地 `:3000`）；
- 一个能跑的 **参考图库**（POSE & CHARACTER Atlas，姿势 / 服装 / 人像，本地 `:3001`）。

想要的是「在图库里选好参考图，一键送到画布上」，并且**能不能挂到无限画布底下**。

## 2. 先排除的几条路

**A. 做成 infinite-canvas 的「插件」？——否。**
调研过上游的插件机制（`plugin-loader.ts` 的 `Blob` + 动态 `import`、`/plugins/index.json`、`installPluginFromUrl`）：其 `emit/on` 事件总线在画布里没有内置订阅者；构建期 `dist/plugins/index.json` 是空的 `[]`；插件 UI 被限制在节点内部，撑不起一个全屏图库选择器。走插件市场 = 依赖一套并不稳定的内部契约，回滚也麻烦。

**B. 改上游把图库整个塞进画布？——否。**
中转站 `juzi.aionline.fun` 那种「参考图库弹窗」是编译进 bundle 的**定制 fork**，没有公开源码，等于把两个项目焊死。我们要的是可逆、能跟上游各自升级的胶水。

**C. iframe 直接 `src` 到官方站？——否。**
官方站是 https 且非 localhost，跨域；而且它的图片解析函数在 localhost/http 下会把相对路径外链到若干 `*.pages.dev` 分站 CDN，其中服装 / 人像路径已经失效（返回 `text/html` 而非图片）。直接嵌 = 一堆裂图 + CORS 污染 canvas。

## 3. 选中的方案：同源代理 + postMessage + applyOps

四个部件，各司其职：

| 部件 | 放在哪 | 关键职责 |
| --- | --- | --- |
| `server.js` | 图库侧 | 本地静态服务；把 `/img/*`、`/thumbs/*` 同源请求反代到官方站并注入 `Access-Control-Allow-Origin: *`；顺带代理 `/api/proxy`、`/comfy` |
| `patch.js` | 图库侧 | 一次性、幂等地把上游编译产物里的 `function lr(e){...}` 改写成「相对路径 → 同源 `/...`」，并注入 `embed-bridge.js`、去掉第三方统计脚本 |
| `embed-bridge.js` | 图库侧 iframe 内 | 仅在 `?embed=1` 或 `self !== top` 时激活；读图库自己的 `localStorage`（键 `pose_atlas_recipe_v3` 的 portrait/costume/pose 三槽）→ 拼图片 URL 列表 + 含「画风预设」的组合提示词 → `window.parent.postMessage` |
| `reference-gallery-bridge.tsx` | 画布侧 | 右下角浮动按钮 → antd Modal 内嵌 `:3001/?embed=1` → 监听并校验 `event.source === iframe.contentWindow` → 调 `useAgentStore.getState().canvasContext.applyOps(ops)` 建节点 |

**为什么用 `applyOps`**：这是画布自己暴露给 Agent 的现成能力，`add_node` 支持 `nodeType` / `metadata` / `position`；`image` 节点只要 `metadata.content` 是图片 URL 就能显示（`pickImageSource` 在无 `storageKey` 时直接用 `originalUrl`），`text` 节点用 `metadata.content`。不用自己去碰画布的内部 store，耦合最小。

**为什么 postMessage 要校验来源**：消息来自 iframe，必须同时校验 `event.source` 与消息 `type`，避免别的框架/页面误触发建节点。

**为什么成功后先回执再关弹窗**：antd Modal 用了 `destroyOnHidden`，关闭会销毁 iframe；先把 `applied` 回执发出去、延时约 900ms 再关，图库浮条才能显示「已加入无限画布 ✓」。

**为什么图片一定要走同源代理**：
1. 绕开失效的分站 CDN，服装 / 人像 / 深度图 / shisei 全覆盖；
2. 同源不污染 canvas，无 CORS 报错；
3. 本地零存储第三方素材——图片按需从官方站转发，本仓库不落任何图库图片。

## 4. 可逆性（核心约束）

- 画布侧：只新增 1 个组件文件 + `project.tsx` 两行（1 个 import、1 个 JSX）。`git apply -R` + 删文件 + 重新构建即完全回滚。
- 图库侧：所有改写都由 `patch.js` 在**本地部署副本**上做且幂等，原始主 bundle 备份为 `*.orig.js`；`embed-bridge.js` 在独立访问时直接 `return`，零影响。不想用桥接就不注入这个 script 即可。
- 两个上游仓库都可以各自独立 `git pull` 升级；升级后若上游换了 bundle 文件名，`patch.js` 会从 `index.html` 动态发现主 bundle，不会写死哈希。

## 5. 取舍与已知边界

- **不是公网服务**：默认 `HOST=0.0.0.0` 只适合本机 / 局域网；发链接给别人要用局域网 IP（不能用 `127.0.0.1`），跨网需自行做内网穿透，且图库素材不得商用。
- **依赖官方站在线**：图片是运行时反代，官方站不可用时图片会挂（但画布节点与提示词仍在）。这是「不分发第三方素材」的代价，刻意保留。
- **配方是图库自己的 localStorage**：桥接只读不算，不与画布共享状态；换浏览器 / 清缓存要重新选图。
- **连线是可选增强**：仅当画布当前有选中节点时才 `connect_nodes`（参考图 → 使用方），没有选中就只建节点。
- **不依赖 Canvas Agent**：实测去掉 `agentUrl` 参数、纯 `:3000` + `:3001` 也能跑通全链路。

## 6. 验证策略（不是「你试试」）

用真实 Edge + CDP 驱动真实点击，断言：
1. 桥接按钮挂载；2. iframe `src` 指向 `:3001/?embed=1`；
3. 在 iframe 自己的 localStorage 播种真实配方并点真实「加入无限画布 →」；
4. 画布 `[data-node-id]` 节点数 0 → 4（3 图 + 1 文本）；
5. 图库浮条出现「已加入无限画布 ✓」回执；
6. 图片 `<img src>` 指向 `:3001/img/...` 同源代理、提示词节点含「画风预设」；
7. 独立访问 `:3001/` 时无浮条、无 `window.__poseGalleryBridge`。

外加网关四类资源：入口 HTML、静态 JS/CSS、懒加载 chunk、接口/图片代理，全部实测 200。
