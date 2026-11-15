# 本仓库只包含桥接「思路 + 脚本」，**不包含、不分发任何第三方图片或数据**

## 1. 这个仓库是什么

这是一个**最小、可逆的集成方案**：把本地部署的「POSE & CHARACTER Atlas 参考图库」（姿势 / 服装 / 人像）桥接到 [basketikun/infinite-canvas](https://github.com/basketikun/infinite-canvas) 无限画布里，在画布上直接插入选好的参考图与组合提示词节点。

仓库内**只有我们自己编写的桥接代码与文档**：

| 文件 | 作用 | 许可 |
| --- | --- | --- |
| `server.js`、`embed-bridge.js`、`patch.js`、`fetch-assets.js` | 图库侧的本地服务 / 桥接 / 一次性改写 / 部署期拉取 | 本项目 MIT（见 `LICENSE`） |
| `canvas-patch/reference-gallery-bridge.tsx`、`canvas-patch/project.tsx.patch` | 画布侧的浮层组件与两处挂载补丁 | 本项目 MIT |
| `tests/_cdp_test.js` | 真实浏览器全链路验证脚本 | 本项目 MIT |
| `README.md`、`NOTICE.md`、`docs/DESIGN.md`、`docs/COMPLIANCE.md` | 思路、合规、删除政策 | — |

**没有** `assets/`（上游编译产物）、`data/`（6 个数据 JSON）、`img/`、`thumbs/`、`*.png` 截图等第三方素材。这些由使用者在自己机器上通过 `fetch-assets.js` 拉取，仅用于本地、个人、非商业学习研究。

## 2. 素材与代码归属（重要）

| 内容 | 权利人 | 许可 / 限制 |
| --- | --- | --- |
| 无限画布 [basketikun/infinite-canvas](https://github.com/basketikun/infinite-canvas) | Copyright (c) 2026 basketikun | MIT（fork 需保留版权与许可声明） |
| 图库 [anhao/ai-pose-gallery-zh](https://github.com/anhao/ai-pose-gallery-zh) 的源代码 | Copyright (c) 2026 Anhao | MIT |
| 图库 `img/`、`thumbs/`、`data/` 下全部图片与原始数据 | **ギア（@giaaibusi）**，来源 [x.com/giaaibusi](https://x.com/giaaibusi) / [ai-pose-gallery.pages.dev](https://ai-pose-gallery.pages.dev/) | **不适用 MIT；不得用于商业用途；权利人提出异议将立即移除** |
| 官方站编译后的 HTML/JS/CSS 与数据 JSON | 同上（含上游代码） | 本仓库不分发；仅部署期由使用者自行拉取 |
| 本仓库 `canvas-patch/` 与根目录脚本 | 本仓库作者 | MIT |

> 上游 `LICENSE` 原文明确：「本协议仅适用于本仓库中的源代码……本仓库 img/、thumbs/ 目录下的全部图片，以及 data/ 目录下的原始数据……著作权归原作者所有……上述素材不适用本 MIT 协议，不得用于商业用途，如权利人提出异议将立即移除。」

## 3. 本仓库主动采取的合规措施

1. **零第三方素材**：`.gitignore` 排除 `assets/`、`data/`、`img/`、`thumbs/`、`*.png`、`*.orig.js`；仓库只存自有代码。
2. **部署期拉取，而非打包**：`fetch-assets.js` 让每个使用者从官方站自行获取，本仓库不复制、不镜像、不提供下载。
3. **不声称原创**：`README.md` 与 `docs/DESIGN.md` 明确标注两个上游项目及素材权利人。
4. **不商用、不收费**：纯个人学习/研究用途，无广告、无商用授权、无付费。
5. **保留声明**：fork 无限画布时保留其 MIT `Copyright (c) 2026 basketikun`。

## 4. 权利人联系 / 删除政策（Takedown）

**若任何权利人（包括但不限于 ギア @giaaibusi、Anhao、basketikun）认为本项目或其中任何内容侵犯其权利，请通过本仓库 GitHub Issues 或仓库所有者预留的联系方式告知。我们承诺：**

- 收到通知后**立即下架 / 删除相关仓库、文件或代码**；
- 不要求权利人提供超出必要范围的材料，不作争辩；
- 如已产生 fork / 缓存，尽力通知下游一并删除。

本项目不提供任何图片、缩略图、数据文件或上游编译产物的下载；所有素材均由使用者自行从官方站获取，与权利人之间的关系由使用者自行负责。

## 5. 免责声明

本说明为一般性信息，不构成正式法律意见书，不建立律师—客户关系；涉及重大或商业事务请咨询执业律师。法条与许可状态以官方发布与权利人声明为准；作者不对使用本方案产生的任何结果作承诺，亦不承担相应责任。

相关法条依据见 `docs/COMPLIANCE.md`（《中华人民共和国著作权法》第十条、第十二条、第十三条、第二十四条、第五十三条、第五十四条，经 flk.npc.gov.cn 核验，基线日期 2026-11-09）。
