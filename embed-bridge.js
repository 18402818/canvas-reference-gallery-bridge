/* ============================================================================
 * pose-gallery embed bridge  (local deployment, port 3001)
 *
 * When the gallery is opened inside the Infinite Canvas (iframe with ?embed=1),
 * this script adds a compact "加入无限画布" bar. It reads the gallery's own
 * recipe from localStorage (key: pose_atlas_recipe_v3), resolves every image
 * to an absolute URL on THIS origin (which the local server reverse-proxies to
 * the upstream gallery), builds a combined prompt, and posts it to the parent
 * canvas page with window.parent.postMessage.
 *
 * The canvas side listens for { type: "pose-gallery:apply", images, prompt }
 * in src/components/canvas/reference-gallery-bridge.tsx and turns it into
 * CanvasAgentOp nodes via useAgentStore.canvasContext.applyOps().
 *
 * Standalone use (no iframe / no ?embed=1) is completely unaffected: no UI is
 * added and nothing is posted.
 * ========================================================================== */
(function () {
    "use strict";

    var params = new URLSearchParams(window.location.search);
    var embedded = params.get("embed") === "1" || window.self !== window.top;
    if (!embedded) return;

    var RECIPE_KEY = "pose_atlas_recipe_v3";
    var APPLY = "pose-gallery:apply";
    var APPLIED = "pose-gallery:applied";
    var ORIGIN = window.location.origin;

    var LABEL = { portrait: "人像", costume: "服装", pose: "姿势" };
    var ORDER = ["portrait", "costume", "pose"];
    var ROLE_HINT = { 人像: "面部特征与发型", 服装: "服装款式与配饰", 姿势: "身体姿势与拍摄角度" };
    var STYLE_PRESETS = {
        realistic: "写实人像写真",
        fashion: "时尚杂志摄影",
        film: "电影感光影人像",
        anime: "二次元插画",
    };
    var TITLE_KEYS = ["标题", "服装名称", "姿势名称", "发型名称", "名称", "姿势编号", "id"];

    function readRecipe() {
        try {
            var raw = window.localStorage.getItem(RECIPE_KEY);
            if (!raw) return null;
            var data = JSON.parse(raw);
            return data && typeof data === "object" ? data : null;
        } catch (_) {
            return null;
        }
    }

    function absolute(path) {
        if (!path || typeof path !== "string") return "";
        if (/^(data:|blob:|https?:\/\/)/i.test(path)) return path;
        return ORIGIN + "/" + path.replace(/^\/+/, "");
    }

    // Mirrors upstream Qn / $n depth-image path construction.
    function depthPath(path) {
        var p = String(path || "").replace(/^\/+/, "");
        if (p.indexOf("img/") === 0) return "img/depth/" + p.slice(4).replace(/\.(png|jpe?g|webp)$/i, ".webp");
        if (p.indexOf("thumbs/") === 0) return "thumbs/depth/" + p.slice(7).replace(/\.(png|jpe?g|webp)$/i, ".webp");
        return "";
    }

    function entryImage(entry) {
        if (!entry || entry.source === "upload") return "";
        var raw;
        if (entry.useDepth) {
            raw = depthPath(entry.原图 || entry.缩略图) || depthPath(entry.缩略图) || entry.原图 || entry.预览图 || entry.缩略图;
        } else {
            raw = entry.原图 || entry.预览图 || entry.缩略图;
        }
        return absolute(raw);
    }

    function entryTitle(entry, fallback) {
        for (var i = 0; i < TITLE_KEYS.length; i++) {
            var value = entry && entry[TITLE_KEYS[i]];
            if (value && typeof value === "string" && value.trim()) return value.trim().slice(0, 80);
        }
        return fallback;
    }

    function buildPayload(styleKey) {
        var recipe = readRecipe();
        if (!recipe) return null;

        var images = [];
        var specs = [];
        ORDER.forEach(function (kind) {
            var entry = recipe[kind];
            if (!entry) return;
            var url = entryImage(entry);
            if (!url) return;
            var label = LABEL[kind];
            var title = entryTitle(entry, label);
            images.push({ url: url, title: label + " · " + title });
            specs.push({ index: images.length, label: label, title: title });
        });

        (Array.isArray(recipe.extraImages) ? recipe.extraImages : []).forEach(function (extra) {
            if (!extra || !extra.url) return;
            var url = absolute(extra.url);
            if (!url) return;
            images.push({ url: url, title: "补充参考 · " + (extra.name || "图片") });
        });

        if (!images.length) return null;

        var preset = STYLE_PRESETS[styleKey] || STYLE_PRESETS.realistic;
        var lines = ["画风预设：" + preset + "。", "请严格参考下列参考图进行创作，保持人物与画面的一致性："];
        specs.forEach(function (spec) {
            lines.push("图" + spec.index + "（" + spec.label + "）：" + spec.title + "，以该图的" + ROLE_HINT[spec.label] + "为准。");
        });
        lines.push("输出高质量、细节丰富的完整人像作品，避免文字、水印与多余肢体。");

        return { images: images, prompt: lines.join("\n"), recipeCount: images.length };
    }

    function post() {
        var styleKey = select ? select.value : "realistic";
        var payload = buildPayload(styleKey);
        if (!payload) {
            flash("请先在图库里点「加入配方」选好人像 / 服装 / 姿势", true);
            return null;
        }
        var message = {
            type: APPLY,
            images: payload.images,
            prompt: payload.prompt,
            source: "pose-gallery-embed",
            requestId: String(Date.now()),
        };
        window.parent.postMessage(message, "*");
        flash("已发送 " + payload.recipeCount + " 张参考图与组合提示词，等待画布确认…");
        return message;
    }

    // ---- UI -----------------------------------------------------------------
    var style = document.createElement("style");
    style.textContent =
        "html.pg-embedded body{padding-bottom:76px!important}" +
        ".pg-bridge-bar{position:fixed;right:16px;bottom:16px;z-index:2147483647;display:flex;align-items:center;gap:10px;" +
        "padding:10px 14px;border-radius:14px;background:#18181b;color:#fafafa;font:13px/1.4 system-ui,-apple-system,'Segoe UI',sans-serif;" +
        "box-shadow:0 12px 36px rgba(0,0,0,.38);border:1px solid #3f3f46}" +
        ".pg-bridge-bar.pg-error{background:#7f1d1d;border-color:#b91c1c}" +
        ".pg-bridge-count{opacity:.8;white-space:nowrap}" +
        ".pg-bridge-select{background:#27272a;color:#fafafa;border:1px solid #52525b;border-radius:8px;padding:5px 8px;font:inherit;outline:none}" +
        ".pg-bridge-apply{background:#2563eb;color:#fff;border:0;border-radius:9px;padding:8px 14px;font:inherit;font-weight:600;cursor:pointer;white-space:nowrap}" +
        ".pg-bridge-apply:disabled{opacity:.45;cursor:not-allowed}" +
        ".pg-bridge-open{color:#a1a1aa;font-size:12px;text-decoration:none;white-space:nowrap}" +
        ".pg-bridge-open:hover{color:#fff}";
    document.head.appendChild(style);
    document.documentElement.classList.add("pg-embedded");

    var bar = document.createElement("div");
    bar.className = "pg-bridge-bar";
    bar.id = "pg-bridge-bar";
    bar.innerHTML =
        '<span class="pg-bridge-count" id="pg-bridge-count">已选 0 张</span>' +
        '<select class="pg-bridge-select" id="pg-bridge-style" aria-label="画风预设">' +
        '<option value="realistic">写实人像写真</option>' +
        '<option value="fashion">时尚杂志摄影</option>' +
        '<option value="film">电影感光影人像</option>' +
        '<option value="anime">二次元插画</option>' +
        "</select>" +
        '<button class="pg-bridge-apply" id="pg-bridge-apply" type="button">加入无限画布 →</button>' +
        '<a class="pg-bridge-open" href="/" target="_blank" rel="noopener">独立打开</a>';
    document.body.appendChild(bar);

    var countEl = document.getElementById("pg-bridge-count");
    var button = document.getElementById("pg-bridge-apply");
    var select = document.getElementById("pg-bridge-style");
    var flashTimer = null;

    function flash(text, isError) {
        if (!countEl) return;
        countEl.textContent = text;
        bar.classList.toggle("pg-error", Boolean(isError));
        window.clearTimeout(flashTimer);
        flashTimer = window.setTimeout(refresh, 2600);
    }

    function refresh() {
        var payload = buildPayload(select ? select.value : "realistic");
        if (countEl) countEl.textContent = payload ? "已选 " + payload.recipeCount + " 张参考图" : "已选 0 张（先点「加入配方」）";
        if (button) button.disabled = !payload;
        bar.classList.remove("pg-error");
    }

    button.addEventListener("click", function () {
        post();
    });
    select.addEventListener("change", refresh);
    window.setInterval(refresh, 600);

    window.addEventListener("message", function (event) {
        var data = event.data;
        if (!data || data.type !== APPLIED || event.source !== window.parent) return;
        flash(data.ok === false ? "画布加入失败，请查看画布提示" : "已加入无限画布 ✓");
    });

    refresh();

    // Small, documented hook for local smoke tests / automation.
    // READY signals that all UI listeners are wired.
    window.__poseGalleryBridge = {
        READY: true,
        buildPayload: buildPayload,
        apply: post,
        refresh: refresh,
    };
})();
