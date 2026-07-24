export interface VisualRect {
	left: number;
	top: number;
	width: number;
	height: number;
}

export type VisualRects = Record<string, VisualRect>;

export function captureVisualRects(svg: SVGSVGElement): VisualRects {
	const result: VisualRects = {};
	for (const element of svg.querySelectorAll<SVGGraphicsElement>(
		"[data-node-id], [data-cluster-id]",
	)) {
		const id =
			element.getAttribute("data-node-id") ??
			element.getAttribute("data-cluster-id");
		if (!id) continue;
		const rect = element.getBoundingClientRect();
		result[id] = {
			left: rect.left,
			top: rect.top,
			width: rect.width,
			height: rect.height,
		};
	}
	return result;
}

export function screenDeltaToLocal(
	deltaX: number,
	deltaY: number,
	matrix: Pick<DOMMatrix, "a" | "b" | "c" | "d">,
): { x: number; y: number } {
	const determinant = matrix.a * matrix.d - matrix.b * matrix.c;
	if (Math.abs(determinant) < 1e-8) return { x: 0, y: 0 };
	return {
		x: (matrix.d * deltaX - matrix.c * deltaY) / determinant,
		y: (-matrix.b * deltaX + matrix.a * deltaY) / determinant,
	};
}

export function centerDelta(before: VisualRect, after: VisualRect) {
	return {
		x: before.left + before.width / 2 - (after.left + after.width / 2),
		y: before.top + before.height / 2 - (after.top + after.height / 2),
	};
}
export function screenRectToLocalBounds(
	rect: VisualRect,
	matrix: Pick<DOMMatrix, "a" | "b" | "c" | "d" | "e" | "f">,
): { x: number; y: number; width: number; height: number } | null {
	const determinant = matrix.a * matrix.d - matrix.b * matrix.c;
	if (Math.abs(determinant) < 1e-8) return null;
	const convert = (x: number, y: number) => ({
		x: (matrix.d * (x - matrix.e) - matrix.c * (y - matrix.f)) / determinant,
		y: (-matrix.b * (x - matrix.e) + matrix.a * (y - matrix.f)) / determinant,
	});
	const points = [
		convert(rect.left, rect.top),
		convert(rect.left + rect.width, rect.top),
		convert(rect.left, rect.top + rect.height),
		convert(rect.left + rect.width, rect.top + rect.height),
	];
	const xs = points.map((point) => point.x);
	const ys = points.map((point) => point.y);
	const x = Math.min(...xs);
	const y = Math.min(...ys);
	return {
		x,
		y,
		width: Math.max(...xs) - x,
		height: Math.max(...ys) - y,
	};
}
interface FrameLoopOptions {
	now?: () => number;
	requestFrame?: (callback: FrameRequestCallback) => number;
	cancelFrame?: (handle: number) => void;
}

export async function runCancelableTransition(
	duration: number,
	signal: AbortSignal,
	onFrame: (progress: number) => void,
	options: FrameLoopOptions = {},
): Promise<boolean> {
	if (signal.aborted) return false;
	const now = options.now ?? (() => performance.now());
	const requestFrame = options.requestFrame ?? requestAnimationFrame;
	const cancelFrame = options.cancelFrame ?? cancelAnimationFrame;
	const start = now();
	return new Promise<boolean>((resolve) => {
		let handle = 0;
		let settled = false;
		const abort = () => {
			if (settled) return;
			settled = true;
			cancelFrame(handle);
			resolve(false);
		};
		const frame = (timestamp: number) => {
			if (settled || signal.aborted) return;
			const progress = Math.max(
				0,
				Math.min(1, (timestamp - start) / Math.max(1, duration)),
			);
			onFrame(progress);
			if (progress < 1) handle = requestFrame(frame);
			else {
				settled = true;
				signal.removeEventListener("abort", abort);
				resolve(true);
			}
		};
		signal.addEventListener("abort", abort, { once: true });
		handle = requestFrame(frame);
	});
}
