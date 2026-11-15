# 推送到你的 GitHub 仓库：需要什么

> 本仓库已经在本地建好、验证过，**但还没有 push**——因为这台机器上没有任何可用的 GitHub 身份 / 凭据。推之前先看这一页。

## 当前状态（诚实说明）

- 已创建本地目录与全部自有代码/文档：`canvas-reference-gallery-bridge/`
- 已完成语法检查与全链路验证（见下方「验证记录」）
- **未创建 git 仓库、未 commit、未 push、未改动本机 git 身份**
- 本机环境实测：`gh` CLI 不存在；`GITHUB_TOKEN` / `GH_TOKEN` / `GIT_ASKPASS` 均未设置；`git config --global user.name` / `user.email` 为空；Windows 凭据管理器无 github 条目；`~/.ssh/*.pub` 无 → **无法直接以你的账号推送**

## 你需要给我（二选一）

**方式 1：你自己推（最省事、最安全）**
我把目录打包/留在本地，你把它拷到自己的机器上：
```bash
cd canvas-reference-gallery-bridge
git init
git add .
git status                 # 复核：绝不能出现 assets/ data/ img/ thumbs/ *.png
git commit -m "Add infinite-canvas <-> reference gallery bridge (code + docs only)"
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main
```
或者把目录内容拷进你已有的空仓库直接 commit + push。

**方式 2：让我在这台机器上代推**
需要你提供：
1. GitHub **用户名** 与 **仓库名**（或完整的 `https://github.com/...git` 地址）；
2. 一个**只对该仓库有推送权限的 Personal Access Token (PAT)**，或先用 `gh auth login` / Git Credential Manager 完成浏览器授权；
3. `git config user.name` / `user.email` 用哪个身份（我会只在本仓库 `.git/config` 设置，不改全局）。

> ⚠️ 不要把 PAT 直接贴在聊天里给我、更不要提交进仓库。更安全的是你在本机 `gh auth login` 或让凭据管理器记住，我再用 `git push` 调用现成凭据。没有凭据我不会尝试任何推送，也不会去猜账号。

## 推送前强制自检（无论谁推）

```bash
# 1) 仓库里绝不能有第三方素材
git status --short
git ls-files | grep -E '^(assets/|data/|img/|thumbs/|.*\.png$|index.html$|og-cover\.jpg$)'
#    ↑ 这条应输出「空」。若非空，说明 .gitignore 没生效，立刻停。

# 2) 自有脚本语法
node --check server.js && node --check embed-bridge.js && \
node --check patch.js  && node --check fetch-assets.js && \
node --check tests/_cdp_test.js

# 3) 确认没有误把本地拉取的素材 add 进去
git check-ignore assets/index.html data/pose-zh.json index.html og-cover.jpg
```

## 建议的仓库设置

- **仓库描述**："思路 + 脚本：把 POSE & CHARACTER Atlas 参考图库桥接进 basketikun/infinite-canvas（仅自有代码，不含任何第三方素材）"
- **README 即本仓库 `README.md`**，`NOTICE.md` + `docs/COMPLIANCE.md` 保持可见。
- **License**：选 MIT（对应本仓库 `LICENSE`，仅覆盖自有代码）。
- **Topics**：`infinite-canvas`, `reference-gallery`, `bridge`, `postmessage`, `comfyui`（可选）。
- 建议开启 Issues —— [NOTICE.md](NOTICE.md) 的删除政策依赖它接收权利人通知。

## 验证记录（本地已做，2026-11-15）

- `node --check` 全部 5 个 `.js` 通过；`START.bat` UTF-8 无 BOM + CRLF。
- 在 `%TEMP%` 临时副本上实测 `fetch-assets.js`：在线从官方站拉到 28 个文件、离线 `--from-local` 拷到 29 个文件，均 `exit=0`。
- `patch.js` 在**原始上游 bundle** 上真实改写 `lr(e)`、注入 `embed-bridge.js`、去掉统计脚本；连跑两次幂等；改写后主 bundle 与已验证部署版 **SHA256 完全一致**（`844696F72DE30E7C2CAF665605B5E5022F05AAC1E040134F2796A432FF3C8303`）。
- 临时目录 `git init` + `git add -A`：`git status` 只列出 10 个自有文件；`assets/`、`data/`、`index.html`、`og-cover.jpg`、`*.png`、`*.orig.js` 经 `git check-ignore` 全部为 `True`，零第三方素材被暂存。
- 起 `:3002` 服务验证四类资源：入口 HTML / 静态 JS+CSS / 懒加载 chunk / 数据 JSON / 图片代理 / 接口，全部 200；静态响应带 `Access-Control-Allow-Origin: *`。
- 真实 Edge + CDP 全链路 `RESULT PASS`（节点 0→4、3 张图走 `:3001` 同源、提示词节点、回执、独立访问零影响）。
- 所有临时服务与目录已清理；真实发布目录保持「非 git 仓库」状态，未 commit / 未 push。

> 推送本身是**对外发布**动作，需你明确授权（用户名/仓库名/凭据）后我才执行。在你提供之前，仓库只停在本地。
