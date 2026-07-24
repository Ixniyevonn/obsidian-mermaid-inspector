export type ScopePaths = Record<string, readonly string[]>;

export function isInFocusedScope(
	elementId: string,
	focusedScopeId: string | undefined,
	scopePaths: ScopePaths,
): boolean {
	if (!focusedScopeId) return true;
	return (
		elementId === focusedScopeId ||
		(scopePaths[elementId] ?? []).includes(focusedScopeId)
	);
}

export interface ScreenPoint {
	x: number;
	y: number;
}

export function edgeEndpointsInsideRect(
	start: ScreenPoint,
	end: ScreenPoint,
	rect: { left: number; top: number; right: number; bottom: number },
): boolean {
	const contains = (point: ScreenPoint) =>
		point.x >= rect.left - 1 &&
		point.x <= rect.right + 1 &&
		point.y >= rect.top - 1 &&
		point.y <= rect.bottom + 1;
	return contains(start) && contains(end);
}

function renderedEdgeIsInside(
	edge: SVGPathElement,
	focusedRect: DOMRect,
): boolean | null {
	try {
		const length = edge.getTotalLength();
		const matrix = edge.getScreenCTM();
		if (!matrix || !Number.isFinite(length)) return null;
		const transform = (point: DOMPoint): ScreenPoint => ({
			x: matrix.a * point.x + matrix.c * point.y + matrix.e,
			y: matrix.b * point.x + matrix.d * point.y + matrix.f,
		});
		return edgeEndpointsInsideRect(
			transform(edge.getPointAtLength(0)),
			transform(edge.getPointAtLength(length)),
			focusedRect,
		);
	} catch {
		return null;
	}
}
function closestRenderedEdge(
	label: SVGGraphicsElement,
	edges: readonly SVGPathElement[],
): SVGPathElement | null {
	const rect = label.getBoundingClientRect();
	const center = {
		x: rect.left + rect.width / 2,
		y: rect.top + rect.height / 2,
	};
	let closest: SVGPathElement | null = null;
	let closestDistance = Number.POSITIVE_INFINITY;
	for (const edge of edges) {
		try {
			const length = edge.getTotalLength();
			const matrix = edge.getScreenCTM();
			if (!matrix || !Number.isFinite(length)) continue;
			for (let index = 0; index <= 24; index += 1) {
				const point = edge.getPointAtLength((length * index) / 24);
				const x = matrix.a * point.x + matrix.c * point.y + matrix.e;
				const y = matrix.b * point.x + matrix.d * point.y + matrix.f;
				const distance = Math.hypot(x - center.x, y - center.y);
				if (distance < closestDistance) {
					closestDistance = distance;
					closest = edge;
				}
			}
		} catch {
			// Ignore paths whose geometry is unavailable.
		}
	}
	return closest;
}
export function groupBackgroundElements(
	svg: SVGSVGElement,
	focusedScopeId: string | undefined,
	scopePaths: ScopePaths,
): void {
	if (!focusedScopeId) return;
	const background: SVGElement[] = [];
	for (const element of svg.querySelectorAll<SVGElement>(
		"[data-node-id], [data-cluster-id]",
	)) {
		const id =
			element.getAttribute("data-node-id") ??
			element.getAttribute("data-cluster-id");
		if (id && !isInFocusedScope(id, focusedScopeId, scopePaths)) {
			background.push(element);
		}
	}
	const focusedElement = Array.from(
		svg.querySelectorAll<SVGGraphicsElement>("[data-cluster-id]"),
	).find(
		(element) => element.getAttribute("data-cluster-id") === focusedScopeId,
	);
	const focusedRect = focusedElement?.getBoundingClientRect();
	const edges = Array.from(
		svg.querySelectorAll<SVGPathElement>("[data-edge-id]"),
	);
	const backgroundEdges = new Set<SVGPathElement>();
	for (const edge of edges) {
		const geometricResult = focusedRect
			? renderedEdgeIsInside(edge, focusedRect)
			: null;
		if (geometricResult === false) {
			background.push(edge);
			backgroundEdges.add(edge);
			continue;
		}
		if (geometricResult === true) continue;
		const id = edge.getAttribute("data-edge-id");
		if (!id) continue;
		const separator = id.indexOf("--");
		if (separator < 0) continue;
		const source = id.slice(0, separator);
		const target = id.slice(separator + 2);
		if (
			!isInFocusedScope(source, focusedScopeId, scopePaths) ||
			!isInFocusedScope(target, focusedScopeId, scopePaths)
		) {
			background.push(edge);
			backgroundEdges.add(edge);
		}
	}
	for (const label of svg.querySelectorAll<SVGGraphicsElement>(".edgeLabel")) {
		const edge = closestRenderedEdge(label, edges);
		if (edge && backgroundEdges.has(edge)) background.push(label);
	}

	const groups = new Map<Element, SVGGElement>();
	for (const element of background) {
		const parent = element.parentElement;
		if (!parent || element.closest("[data-mi-context-layer]")) continue;
		let group = groups.get(parent);
		if (!group) {
			group = document.createElementNS("http://www.w3.org/2000/svg", "g");
			group.setAttribute("data-mi-context-layer", "");
			group.classList.add("mi-context-layer");
			parent.insertBefore(group, element);
			groups.set(parent, group);
		}
		group.appendChild(element);
	}
}
