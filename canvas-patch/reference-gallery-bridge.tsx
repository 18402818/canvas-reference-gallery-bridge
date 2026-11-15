import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { App, Button, Modal, Tooltip } from "antd";
import { Images } from "lucide-react";
import { nanoid } from "nanoid";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { useAgentStore } from "@/stores/use-agent-store";
import type { CanvasAgentOp } from "@/lib/canvas/canvas-agent-ops";

/**
 * Lightweight, reversible bridge between the locally deployed pose reference
 * gallery (port 3001) and this canvas. The gallery is opened in an iframe;
 * its embed script posts a `pose-gallery:apply` message which we translate
 * into the canvas' own `CanvasAgentOp` batch via `useAgentStore`.
 *
 * Rollback: remove this file, its import, and its one JSX mount in
 * src/pages/canvas/project.tsx.
 */

const GALLERY_PORT = 3001;
const APPLY_MESSAGE = "pose-gallery:apply";
const APPLIED_MESSAGE = "pose-gallery:applied";

type ApplyImage = { url?: string; title?: string };
type ApplyPayload = {
    type?: string;
    images?: ApplyImage[];
    prompt?: string;
    source?: string;
    requestId?: string;
};

type ReferenceGalleryBridgeProps = {
    getCanvasCenter: () => { x: number; y: number };
};

export function ReferenceGalleryBridge({ getCanvasCenter }: ReferenceGalleryBridgeProps) {
    const [open, setOpen] = useState(false);
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const colorTheme = useThemeStore((state) => state.theme);
    const theme = canvasThemes[colorTheme];
    const { message } = App.useApp();

    // Derive the gallery origin from the canvas page so LAN access (same host,
    // port 3001) works too, instead of hardcoding 127.0.0.1.
    const galleryUrl = useMemo(() => `${window.location.protocol}//${window.location.hostname}:${GALLERY_PORT}/?embed=1`, []);
    const dockStyle = {
        background: theme.toolbar.panel,
        borderColor: theme.toolbar.border,
        color: theme.toolbar.item,
        boxShadow: colorTheme === "dark" ? "0 18px 45px rgba(0,0,0,.32)" : "0 16px 40px rgba(28,25,23,.12)",
    };

    const applyToCanvas = useCallback(
        (payload: ApplyPayload) => {
            const images = (Array.isArray(payload.images) ? payload.images : []).filter(
                (item): item is { url: string; title?: string } => Boolean(item && typeof item.url === "string" && item.url.trim()),
            );
            const prompt = typeof payload.prompt === "string" ? payload.prompt.trim() : "";
            if (!images.length && !prompt) {
                message.warning("图库配方为空：请先在参考图库里点「加入配方」");
                return;
            }

            const context = useAgentStore.getState().canvasContext;
            if (!context?.applyOps) {
                message.error("画布尚未就绪，请稍后重试");
                return;
            }

            let center = { x: 0, y: 0 };
            try {
                center = getCanvasCenter();
            } catch {
                // Fall back to origin if the canvas container is not measured yet.
            }

            const ops: CanvasAgentOp[] = [];
            const createdIds: string[] = [];
            const columns = Math.max(1, Math.min(3, images.length || 1));
            const stepX = 380;
            const stepY = 280;
            const startX = center.x - ((columns - 1) * stepX) / 2 - 170;
            const startY = center.y - 120;

            images.forEach((image, index) => {
                const id = `gallery-image-${nanoid(10)}`;
                createdIds.push(id);
                ops.push({
                    type: "add_node",
                    id,
                    nodeType: "image",
                    title: (image.title || `参考图 ${index + 1}`).slice(0, 80),
                    position: {
                        x: startX + (index % columns) * stepX,
                        y: startY + Math.floor(index / columns) * stepY,
                    },
                    metadata: { content: image.url },
                });
            });

            if (prompt) {
                const id = `gallery-prompt-${nanoid(10)}`;
                createdIds.push(id);
                ops.push({
                    type: "add_node",
                    id,
                    nodeType: "text",
                    title: "图库组合提示词",
                    position: { x: startX, y: startY + (Math.ceil(images.length / columns) || 1) * stepY },
                    metadata: { content: prompt },
                });
            }

            // Reference edges point FROM the reference node TO the consuming node
            // (see src/lib/canvas/canvas-resource-references.ts getContextInputNodes).
            const selectedIds = context.snapshot?.selectedNodeIds?.filter(Boolean) || [];
            if (selectedIds.length) {
                const targetId = selectedIds[selectedIds.length - 1];
                createdIds.forEach((fromId) => ops.push({ type: "connect_nodes", fromNodeId: fromId, toNodeId: targetId }));
            }

            try {
                context.applyOps(ops);
                message.success(
                    `已加入 ${images.length} 张参考图${prompt ? " 与组合提示词" : ""}${selectedIds.length ? "，并连到选中节点" : ""}`,
                );
                // Ack first, then close: the gallery iframe needs to be alive
                // long enough to show its "已加入无限画布 ✓" confirmation.
                iframeRef.current?.contentWindow?.postMessage(
                    { type: APPLIED_MESSAGE, requestId: payload.requestId, ok: true },
                    "*",
                );
                window.setTimeout(() => setOpen(false), 900);
            } catch (error) {
                message.error(`加入画布失败：${error instanceof Error ? error.message : String(error)}`);
                iframeRef.current?.contentWindow?.postMessage(
                    { type: APPLIED_MESSAGE, requestId: payload.requestId, ok: false },
                    "*",
                );
            }
        },
        [getCanvasCenter, message],
    );

    useEffect(() => {
        const onMessage = (event: MessageEvent) => {
            // Only trust messages coming from our own gallery iframe.
            if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) return;
            const data = event.data as ApplyPayload | undefined;
            if (!data || data.type !== APPLY_MESSAGE) return;
            void applyToCanvas(data);
        };
        window.addEventListener("message", onMessage);
        return () => window.removeEventListener("message", onMessage);
    }, [applyToCanvas]);

    return (
        <>
            <div
                data-canvas-no-zoom
                className="absolute bottom-5 right-5 z-50"
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
            >
                <Tooltip title="打开参考图库（姿势 / 服装 / 人像）">
                    <Button
                        type="text"
                        className="!h-10 !w-10 !min-w-10 !p-0"
                        style={{ ...dockStyle, borderRadius: 12 }}
                        icon={<Images className="size-5" />}
                        onClick={() => setOpen(true)}
                        aria-label="打开参考图库"
                    />
                </Tooltip>
            </div>

            <Modal
                title="参考图库 · 姿势 / 服装 / 人像"
                open={open}
                onCancel={() => setOpen(false)}
                width={1600}
                centered
                destroyOnHidden
                styles={{ body: { padding: 0, height: "min(82vh, 900px)", overflow: "hidden" } }}
                footer={
                    <div style={{ textAlign: "left", fontSize: 12, opacity: 0.72 }}>
                        在图库中点「加入配方」选好人像 / 服装 / 姿势，再点右下角「加入无限画布」。图片与组合提示词会插入画布；若当前有选中节点，会自动建立参考连线。
                    </div>
                }
            >
                <iframe
                    ref={iframeRef}
                    title="参考图库"
                    src={open ? galleryUrl : undefined}
                    style={{ width: "100%", height: "100%", border: 0, display: "block", background: "#fff" }}
                />
            </Modal>
        </>
    );
}
