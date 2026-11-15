# 把参考图库桥接进无限画布：思路 + 最小脚本

一个**可逆、零插件市场依赖**的集成方案：把本地部署的「POSE & CHARACTER Atlas 参考图库」（姿势 / 服装 / 人像）挂到 [basketikun/infinite-canvas](https://github.com/basketikun/infinite-canvas) 无限画布里，选定参考图后一键在画布上生成图片节点与组合提示词节点。

> 本仓库**只提供思路和桥接两个项目的脚本**，不含也不分发任何第三方图片、数据或上游编译产物。素材由使用者在自己机器上通过 `fetch-assets.js` 拉取，仅供个人 / 本地 / 非商业学习研究。详见 [NOTICE.md](NOTICE.md) 与 [docs/COMPLIANCE.md](docs/COMPLIANCE.md)。

---

## 这是什么 / 不是什么

| | |
| --- | --- |
| ✅ 是 | 两个已有开源项目之间的「胶水」：一个画布侧浮层组件 + 一个图库侧 iframe 脚本 + 一个本地反向代理 |
| ✅ 是 | 只改上游各 1~2 处、删掉即可回滚的轻量补丁 |
| ❌ 不是 | 参考图库本体、图片/数据/模型的再分发 |
| ❌ 不是 | 一个功能完整的「插件」——它不依赖 infinite-canvas 的插件市场/插件加载器 |
| ❌ 不是 | 任何商用授权或素材授权 |

**两个上游项目（都需要你自己在本地准备）：**
- 无限画布：[basketikun/infinite-canvas](https://github.com/basketikun/infinite-canvas) — MIT, Copyright (c) 2026 basketikun
- 参考图库：[anhao/ai-pose-gallery-zh](https://github.com/anhao/ai-pose-gallery-zh) / 官方站 [ai-pose-gallery.anhao.app](https://ai-pose-gallery.anhao.app/) — 代码 MIT (c) 2026 Anhao；`img/`、`thumbs/`、`data/` 归 ギア(@giaaibusi)，**不得商用、异议即移除**

---

## 思路（30 秒版）

```
┌─ 无限画布 (localhost:3000) ──────────────┐   ┌─ 参考图库 (localhost:3001) ──────────┐
│                                          │   │                                      │
│  [打开参考图库] 浮层按钮                   │   │  embed-bridge.js (仅 iframe 内启用)   │
│        │ 点开 Modal                       │   │   读 localStorage 配方 → 拼图+提示词  │
│        ▼                                  │   │        │ postMessage                  │
│  <iframe src=":3001/?embed=1"> ──────────┼──▶│  「加入无限画布 →」按钮               │
│        ▲ postMessage(apply)               │   │        │                             │
│        │                                  │   │   server.js 同源反代 /img /thumbs   │
│  applyOps() 建 image/text 节点 + 连线 ────┘   │   → 官方站素材（本地代理，不落库分发） │
└──────────────────────────────────────────┘   └──────────────────────────────────────┘
```

1. **画布侧**：在页面右下角放一个浮动按钮 → 点开一个 antd Modal，里面嵌一个指向图库 `:3001/?embed=1` 的 iframe。
2. **图库侧**：`embed-bridge.js` 只在这个 iframe（或 `?embed=1`）里激活，从图库自己的 `localStorage` 配方里读出已选的「人像 / 服装 / 姿势」三张图，拼成 URL 列表 + 组合提示词，用 `window.parent.postMessage` 发给画布。
3. **画布侧**监听 message，校验来源后调用现成的 `canvasContext.applyOps()` 创建 `image` 节点（图）和 `text` 节点（提示词）；若画布有选中节点，再 `connect_nodes` 连一条线。成功后回发 `applied` 回执并自动关掉弹窗。
4. **本地反向代理**：`server.js` 把图库的 `/img/*`、`/thumbs/*` 同源请求转发到官方站并加 CORS 头。`patch.js` 把上游编译产物里「localhost 下把图片外链到已失效分站 CDN」的 `lr(e)` 函数改写成同源路径——这是本地能正常显示图片的关键。

完整设计、为什么不用插件机制、为什么这样最稳，见 [docs/DESIGN.md](docs/DESIGN.md)。

---

## 目录结构

```
canvas-reference-gallery-bridge/
├─ README.md                     本文件
├─ NOTICE.md                     归属、合规措施、删除政策（Takedown）
├─ LICENSE                       本仓库自有代码的 MIT
├─ .gitignore                    排除一切第三方素材与本地产物
├─ START.bat                     Windows 一键起服务
├─ server.js                     图库侧本地静态服务 + /img /thumbs 反代（零依赖）
├─ embed-bridge.js               图库侧 iframe 桥接脚本（独立访问时零影响）
├─ patch.js                      一次性幂等改写：图片路径 + 注入 bridge + 去统计
├─ fetch-assets.js               部署期从官方站拉取 SPA/数据（本仓库不含素材）
├─ canvas-patch/
│  ├─ reference-gallery-bridge.tsx   画布侧 React 浮层组件
│  └─ project.tsx.patch              infinite-canvas 的两处挂载补丁
├─ PUSH.md                       推送到你 GitHub 仓库所需条件与自检清单
├─ tests/
│  └─ _cdp_test.js               真实 Edge + CDP 全链路验证脚本
└─ docs/
   ├─ DESIGN.md                 设计思路、取舍、为什么可逆
   └─ COMPLIANCE.md             许可边界、法条依据、发布检查清单
```

**仓库里没有**：`assets/`、`data/`、`img/`、`thumbs/`、`index.html`、`og-cover.jpg`、任何 `.png`。这些都在 `.gitignore` 里，由使用者本地生成。

---

## 使用步骤（需要从零跑通时）

前置：Node.js ≥ 18（用到全局 `fetch`）、一个自己 fork 的 infinite-canvas、能连到官方图库站的网络。

**A. 图库侧（本目录）**
```bash
node fetch-assets.js            # 从官方站拉取 SPA + 数据到 ./assets ./data（本机、个人、非商用）
node patch.js                   # 幂等改写图片路径 / 注入 bridge / 去统计
node server.js                  # 或双击 START.bat，监听 0.0.0.0:3001
```
- 已有本地部署目录时可用离线模式：`node fetch-assets.js --from-local "路径"`
- 换上游 host：`node fetch-assets.js --base-url https://...`

**B. 画布侧（你的 infinite-canvas fork）**
```bash
# 把组件拷进源码树
cp canvas-patch/reference-gallery-bridge.tsx \
   web/src/components/canvas/reference-gallery-bridge.tsx
# 打两处补丁（在 infinite-canvas 仓库根目录）
git apply /绝对路径/canvas-patch/project.tsx.patch
# 正常重新构建并启动
npm run build && npm run preview -- --host 0.0.0.0 --port 3000
```

**C. 打开 & 用**
1. 打开画布 `http://127.0.0.1:3000/canvas?mode=new`
2. 点右下角「打开参考图库」→ 在图库里挑好人像 / 服装 / 姿势（加入配方）
3. 点浮条上的「加入无限画布 →」→ 画布自动多出 3 个图片节点 + 1 个「图库组合提示词」文本节点；若提前选中了画布节点，还会自动连线。
4. 独立访问图库 `http://127.0.0.1:3001/` 时桥接脚本不激活，图库照常用。

**回滚**：画布侧 `git apply -R canvas-patch/project.tsx.patch` 并删掉组件文件重新构建；图库侧不做 `patch.js` 或不注入 `embed-bridge.js` 即可。零残留。

---

## 验证

- `node --check` 每个 `.js`（含 `tests/_cdp_test.js`）。
- `fetch-assets.js` 在线拉取（28 个文件）与离线 `--from-local` 两条路径都实测通过；`patch.js` 连跑两次幂等；在线拉取 + 改写后的主 bundle 与已验证部署版 **SHA256 完全一致**。
- `.gitignore` 用真实 `git init` + `git add -A` 复核：`git status` 只列出 10 个自有文件，第三方素材 `git check-ignore` 全部为 `True`。
- 启动后 `_cdp_test.js` 用真实 Edge + CDP 跑全链路：按钮存在 → iframe → 播种真实配方 → 点真实按钮 → `applyOps` 建节点（0→4）→ 回执 → 独立访问不受影响 → **RESULT PASS**。
- 网关类改动验证四类资源：入口 HTML、静态 JS/CSS、懒加载 chunk、接口/图片代理，全部实测 200。
- `START.bat` 按工作区约定为 UTF-8 无 BOM + CRLF。

---

## 许可与合规（务必读）

- 本仓库自有代码：MIT（见 [LICENSE](LICENSE)）。
- fork infinite-canvas：**保留**其 MIT `Copyright (c) 2026 basketikun` 声明。
- 图库 `img/`、`thumbs/`、`data/`：**不适用 MIT、不得商用、权利人异议即移除**——本仓库不打包、不镜像、不提供下载。
- 详见 [NOTICE.md](NOTICE.md)；法条与发布检查清单见 [docs/COMPLIANCE.md](docs/COMPLIANCE.md)。
- **权利人认为侵权请通过 Issues 告知，我们立即删除、不争辩。**
