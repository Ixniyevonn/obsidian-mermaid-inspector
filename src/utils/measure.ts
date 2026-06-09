// Simple canvas-based text measurement for node/cluster sizing (no external deps)

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;

function ensureCtx(): CanvasRenderingContext2D | null {
	if (typeof document === "undefined") return null;
	if (!canvas) {
		canvas = document.createElement("canvas");
		ctx = canvas.getContext("2d", { willReadFrequently: true });
	}
	return ctx;
}

export interface Size {
	width: number;
	height: number;
}

const NODE_FONT = "14px sans-serif";
const NODE_BOLD = "bold 14px sans-serif";
const CLUSTER_FONT = "bold 13px sans-serif";
const PADDING_X = 20;
const PADDING_Y = 12;
const MIN_NODE_W = 78;
const MIN_NODE_H = 30;
const MIN_CLUSTER_W = 86;
const MIN_CLUSTER_H = 34;

export function measureNode(label: string): Size {
	const c = ensureCtx();
	if (!c) {
		// SSR / terminal fallback (rough but stable for layout)
		const approx = Math.max(MIN_NODE_W, (label?.length ?? 4) * 7.5 + PADDING_X * 2);
		return { width: approx, height: MIN_NODE_H };
	}
	c.font = NODE_FONT;
	const m = c.measureText(label || " ");
	const w = Math.max(MIN_NODE_W, Math.ceil(m.width) + PADDING_X * 2);
	const h = MIN_NODE_H;
	return { width: w, height: h };
}

export function measureCluster(label: string): Size {
	const c = ensureCtx();
	if (!c) {
		const approx = Math.max(MIN_CLUSTER_W, (label?.length ?? 6) * 8 + PADDING_X * 2 + 10);
		return { width: approx, height: MIN_CLUSTER_H };
	}
	c.font = CLUSTER_FONT;
	const m = c.measureText(label || "cluster");
	const w = Math.max(MIN_CLUSTER_W, Math.ceil(m.width) + PADDING_X * 2 + 8);
	const h = MIN_CLUSTER_H;
	return { width: w, height: h };
}

// For layout we only need width/height; actual rendering uses SVG <text> which is close enough.
