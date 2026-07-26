const CANVAS_NODE_SELECTOR = ".canvas-node, .canvas-node-content";
const CANVAS_IFRAME_BODY_CLASS = "canvas-node-iframe-body";

export function isCanvasEmbed(container: HTMLElement): boolean {
	if (container.closest(CANVAS_NODE_SELECTOR)) return true;
	return container.ownerDocument.body?.classList.contains(
		CANVAS_IFRAME_BODY_CLASS,
	);
}
