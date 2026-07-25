import mermaid from "mermaid";

export interface TagMetadata {
	labelToId: Record<string, string>;
	edgeKeys?: string[];
	collapsedScopeIds?: string[];
	emptyScopeIds?: string[];
}

export const MERMAID_THEME_VARIABLES = {
	background: "#ffffff",
	primaryColor: "#f2f3f5",
	primaryTextColor: "#1f2328",
	lineColor: "#59636e",
	clusterBkg: "#f6f8fa",
	clusterBorder: "#6f42c1",
} as const;

let initialized = false;
let renderSequence = 0;

function ensureMermaidInitialized(): void {
	if (initialized) return;
	mermaid.initialize({
		startOnLoad: false,
		securityLevel: "strict",
		theme: "base",
		themeVariables: MERMAID_THEME_VARIABLES,
		flowchart: { curve: "basis", htmlLabels: false },
	});
	initialized = true;
}

export async function renderMermaidToSvg(source: string): Promise<string> {
	ensureMermaidInitialized();
	const { svg } = await mermaid.render(
		`mermaid-inspector-${++renderSequence}`,
		source,
	);
	return svg;
}

function textOf(element: Element): string {
	return (
		element.querySelector(".label, .cluster-label, text, foreignObject")
			?.textContent ?? ""
	)
		.replace(/\s+/g, " ")
		.trim();
}

function logicalId(
	element: Element,
	map: Record<string, string>,
): string | null {
	const label = textOf(element);
	if (map[label]) return map[label];
	const raw = element.id;
	for (const id of Object.values(map)) {
		if (raw === id || raw.includes(`-${id}-`) || raw.endsWith(`-${id}`))
			return id;
	}
	return /^[A-Za-z][\w.-]*$/.test(label) ? label : null;
}

function edgePaths(svg: SVGSVGElement): SVGPathElement[] {
	return Array.from(svg.querySelectorAll<SVGPathElement>("path")).filter(
		(path) => {
			if (path.closest("defs, marker")) return false;
			const d = path.getAttribute("d")?.trim() ?? "";
			return d.startsWith("M") && /[CLQ]/i.test(d);
		},
	);
}

function pathEndpoints(
	path: SVGPathElement,
): [number, number, number, number] | null {
	const numbers = (path.getAttribute("d") ?? "")
		.match(/-?\d+(?:\.\d+)?/g)
		?.map(Number);
	if (!numbers || numbers.length < 4) return null;
	return [
		numbers[0],
		numbers[1],
		numbers[numbers.length - 2],
		numbers[numbers.length - 1],
	];
}

function center(element: Element): [number, number] | null {
	const shape = element.querySelector(
		"rect, circle, ellipse, polygon",
	) as SVGGraphicsElement | null;
	const target = (shape ?? element) as SVGGraphicsElement;
	try {
		const box = target.getBBox();
		return [box.x + box.width / 2, box.y + box.height / 2];
	} catch {
		const rect = shape?.tagName === "rect" ? shape : null;
		if (!rect) return null;
		const x = Number(rect.getAttribute("x"));
		const y = Number(rect.getAttribute("y"));
		const width = Number(rect.getAttribute("width"));
		const height = Number(rect.getAttribute("height"));
		return [x + width / 2, y + height / 2];
	}
}

export function postProcessAndTag(
	svgString: string,
	metadata: TagMetadata,
): SVGSVGElement {
	const wrapper = document.createElement("div");
	wrapper.innerHTML = svgString.trim();
	const svg = wrapper.querySelector("svg") as SVGSVGElement | null;
	if (!svg) throw new Error("Mermaid returned no SVG element");
	for (const cluster of svg.querySelectorAll("g.cluster")) {
		const id = logicalId(cluster, metadata.labelToId);
		if (id) cluster.setAttribute("data-cluster-id", id);
	}
	const collapsedScopes = new Set(metadata.collapsedScopeIds ?? []);
	const emptyScopes = new Set(metadata.emptyScopeIds ?? []);
	for (const node of svg.querySelectorAll("g.node, g.statediagram-state")) {
		const id = logicalId(node, metadata.labelToId);
		if (!id) continue;
		if (emptyScopes.has(id)) {
			node.setAttribute("data-node-id", id);
			node.classList.add("mi-empty-scope");
		} else if (collapsedScopes.has(id)) {
			node.setAttribute("data-cluster-id", id);
			node.classList.add("mi-collapsed-scope");
		} else node.setAttribute("data-node-id", id);
	}

	const paths = edgePaths(svg);
	const keys = metadata.edgeKeys ?? [];
	const anchors = new Map<string, [number, number]>();
	for (const element of svg.querySelectorAll(
		"[data-node-id], [data-cluster-id]",
	)) {
		const id =
			element.getAttribute("data-node-id") ??
			element.getAttribute("data-cluster-id");
		const point = center(element);
		if (id && point) anchors.set(id, point);
	}
	const remaining = new Set(keys);
	for (const path of paths) {
		const ends = pathEndpoints(path);
		let best: string | undefined;
		let bestDistance = Number.POSITIVE_INFINITY;
		if (ends && anchors.size) {
			for (const key of remaining) {
				const split = key.indexOf("--");
				const from = anchors.get(key.slice(0, split));
				const to = anchors.get(key.slice(split + 2));
				if (!from || !to) continue;
				const direct =
					Math.hypot(ends[0] - from[0], ends[1] - from[1]) +
					Math.hypot(ends[2] - to[0], ends[3] - to[1]);
				const reverse =
					Math.hypot(ends[0] - to[0], ends[1] - to[1]) +
					Math.hypot(ends[2] - from[0], ends[3] - from[1]);
				const distance = Math.min(direct, reverse);
				if (distance < bestDistance) {
					bestDistance = distance;
					best = key;
				}
			}
		}
		best ??= remaining.values().next().value;
		if (best) {
			path.setAttribute("data-edge-id", best);
			remaining.delete(best);
		}
	}
	svg.removeAttribute("style");
	applyIntrinsicSvgSize(svg);
	return svg;
}

export function applyIntrinsicSvgSize(svg: SVGSVGElement): void {
	const values = (svg.getAttribute("viewBox") ?? "")
		.trim()
		.split(/[\s,]+/)
		.map(Number);
	if (
		values.length === 4 &&
		values.every(Number.isFinite) &&
		values[2] > 0 &&
		values[3] > 0
	) {
		svg.setAttribute("width", String(values[2]));
		svg.setAttribute("height", String(values[3]));
	} else {
		svg.removeAttribute("width");
		svg.removeAttribute("height");
	}
	svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
}
