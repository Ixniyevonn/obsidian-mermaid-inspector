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

export async function animateDiagramTransition(
	svg: SVGSVGElement,
	old: VisualRects,
	duration: number,
	signal: AbortSignal,
): Promise<void> {
	const after = captureVisualRects(svg);
	const wrappers: Array<{ element: SVGGElement; x: number; y: number }> = [];
	const rectMorphs: Array<{
		element: SVGRectElement;
		from: { x: number; y: number; width: number; height: number };
		to: { x: number; y: number; width: number; height: number };
	}> = [];
	for (const element of svg.querySelectorAll<SVGGElement>(
		"[data-node-id], [data-cluster-id]",
	)) {
		const id =
			element.getAttribute("data-node-id") ??
			element.getAttribute("data-cluster-id");
		if (!id) continue;
		const before = old[id];
		const finalRect = after[id];
		if (!before || !finalRect) {
			element.animate([{ opacity: 0 }, { opacity: 1 }], {
				duration: duration * 0.875,
				easing: "ease-out",
			});
			continue;
		}
		if (element.hasAttribute("data-cluster-id")) {
			const outline = element.querySelector<SVGRectElement>("rect");
			const matrix = outline?.getScreenCTM();
			if (outline && matrix) {
				const from = screenRectToLocalBounds(before, matrix);
				const to = {
					x: Number(outline.getAttribute("x")),
					y: Number(outline.getAttribute("y")),
					width: Number(outline.getAttribute("width")),
					height: Number(outline.getAttribute("height")),
				};
				if (from && Object.values(to).every(Number.isFinite)) {
					outline.setAttribute("x", String(from.x));
					outline.setAttribute("y", String(from.y));
					outline.setAttribute("width", String(from.width));
					outline.setAttribute("height", String(from.height));
					rectMorphs.push({ element: outline, from, to });
					element
						.querySelector(".label, .cluster-label, text")
						?.animate([{ opacity: 0 }, { opacity: 1 }], {
							duration,
							easing: "ease-out",
						});
					continue;
				}
			}
		}
		const parent = element.parentElement as SVGGraphicsElement | null;
		const matrix = parent?.getScreenCTM();
		if (!parent || !matrix) continue;
		const screenDelta = centerDelta(before, finalRect);
		const local = screenDeltaToLocal(screenDelta.x, screenDelta.y, matrix);
		if (Math.abs(local.x) < 0.01 && Math.abs(local.y) < 0.01) continue;
		const wrapper = document.createElementNS("http://www.w3.org/2000/svg", "g");
		wrapper.setAttribute("data-mi-animation-wrapper", "");
		parent.insertBefore(wrapper, element);
		wrapper.appendChild(element);
		wrappers.push({ element: wrapper, x: local.x, y: local.y });
	}

	for (const path of svg.querySelectorAll<SVGPathElement>("[data-edge-id]")) {
		let length = 0;
		try {
			length = path.getTotalLength();
		} catch {
			// Opacity still provides a transition if path length is unavailable.
		}
		path.animate(
			[
				{
					opacity: 0,
					strokeDasharray: `${length} ${length}`,
					strokeDashoffset: length,
				},
				{
					opacity: 1,
					strokeDasharray: `${length} ${length}`,
					strokeDashoffset: 0,
				},
			],
			{ duration, easing: "cubic-bezier(.22,1,.36,1)" },
		);
	}

	const cancelAnimations = () => {
		for (const animation of svg.getAnimations()) animation.cancel();
	};
	signal.addEventListener("abort", cancelAnimations, { once: true });
	await runCancelableTransition(duration, signal, (progress) => {
		const eased = 1 - (1 - progress) ** 3;
		const lerp = (from: number, to: number) => from + (to - from) * eased;
		for (const morph of rectMorphs) {
			morph.element.setAttribute("x", String(lerp(morph.from.x, morph.to.x)));
			morph.element.setAttribute("y", String(lerp(morph.from.y, morph.to.y)));
			morph.element.setAttribute(
				"width",
				String(lerp(morph.from.width, morph.to.width)),
			);
			morph.element.setAttribute(
				"height",
				String(lerp(morph.from.height, morph.to.height)),
			);
		}
		for (const item of wrappers) {
			item.element.setAttribute(
				"transform",
				`translate(${item.x * (1 - eased)} ${item.y * (1 - eased)})`,
			);
		}
	});
	signal.removeEventListener("abort", cancelAnimations);
	cancelAnimations();
	for (const item of wrappers) {
		const parent = item.element.parentNode;
		if (!parent) continue;
		while (item.element.firstChild) {
			parent.insertBefore(item.element.firstChild, item.element);
		}
		item.element.remove();
	}
}
