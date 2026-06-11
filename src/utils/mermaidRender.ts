import mermaid from "mermaid";

export interface Rect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface Positions {
	clusters: Record<string, Rect>;
	nodes: Record<string, Rect>;
	edges: Record<string, string>; // data-edge-id -> d
}

let initialized = false;

export function ensureMermaidInitialized() {
	if (initialized) return;
	mermaid.initialize({
		startOnLoad: false,
		securityLevel: "strict",
		flowchart: {
			curve: "basis",
			htmlLabels: false,
		},
		theme: "default",
	});
	initialized = true;
}

export async function renderMermaidToSvg(
	source: string,
	containerId: string,
): Promise<string> {
	ensureMermaidInitialized();
	// mermaid.render returns { svg, bindFunctions }
	const { svg } = await mermaid.render(containerId, source);
	return svg;
}

/**
 * Parse a temp SVG string into a live SVGSVGElement, post-process in place to add
 * stable data-* ids based on labels / structure, return the element.
 * The container is used only for parsing; not attached yet.
 */
export function postProcessAndTag(svgString: string): SVGSVGElement {
	const wrapper = document.createElement("div");
	wrapper.innerHTML = svgString.trim();
	const svgEl = wrapper.querySelector("svg") as SVGSVGElement | null;
	if (!svgEl) throw new Error("No SVG in mermaid render output");

	// Make sure it has namespace etc (it does from mermaid)
	addStableDataAttributes(svgEl);
	return svgEl;
}

function addStableDataAttributes(svgEl: SVGSVGElement) {
	// --- Clusters: g.cluster ---
	const clusters = svgEl.querySelectorAll("g.cluster");
	clusters.forEach((g) => {
		// Label text is usually in .cluster-label or descendant text
		const labelText = extractLabelText(g);
		if (labelText) {
			const id = sanitizeId(labelText);
			if (id) {
				(g as SVGGElement).setAttribute("data-cluster-id", id);
			}
		}
	});

	// --- Nodes: g.node ---
	const nodes = svgEl.querySelectorAll("g.node");
	nodes.forEach((g) => {
		const labelText = extractLabelText(g);
		if (labelText) {
			const id = sanitizeId(labelText);
			if (id) {
				(g as SVGGElement).setAttribute("data-node-id", id);
			}
		}
	});

	// --- Edges: pair curve paths with edgeLabel texts that carry our eXXX ids ---
	tagEdgesWithStableIds(svgEl);
}

function extractLabelText(el: Element): string | null {
	// Try direct text nodes under label groups, or any text
	const textEl = el.querySelector("text, tspan");
	if (textEl) {
		const t = (textEl.textContent || "").trim();
		if (t) return t;
	}
	// Sometimes label is in foreignObject or title
	const title = el.querySelector("title");
	if (title?.textContent) return title.textContent.trim();
	// Fallback: the element's own text if it's a text
	if (el.textContent) {
		const t = el.textContent.trim();
		if (t && t.length < 40) return t;
	}
	return null;
}

function sanitizeId(raw: string): string | null {
	// Our labels are simple like "Outer Scope", "Inner Scope", "A", "X", or "eA_Inner"
	// We want "Outer", "Inner", "A", "X" or the eXXX as-is for edges.
	const trimmed = raw.trim();
	// If it is one of our edge markers like eA_Inner keep as edge id
	if (/^e[0-9A-Za-z_]+$/.test(trimmed)) return trimmed;

	// Map known display labels back to stable ids used in generator.
	// Keep in sync with the demo diagram in MermaidInspector.svelte.
	const map: Record<string, string> = {
		"Order Processing": "Outer",
		"Payment Subsystem": "Inner",
		User: "User",
		Catalog: "Catalog",
		Promo: "Promo",
		Validate: "Validate",
		Build: "Build",
		"Review Items": "Review",
		"Audit Log": "Audit",
		"Enter Payment": "Enter",
		"Validate Card": "ValidateCard",
		"Fraud Check": "Fraud",
		Authorize: "Auth",
		"Capture Funds": "Capture",
		"Issue Receipt": "Receipt",
		"Apply Discounts": "Discounts",
		"Confirm Order": "Confirm",
		"Prepare Shipment": "ShipPrep",
		"Notify Customer": "Notify",
		"Reserve Stock": "Inventory",
		Analytics: "Analytics",
		Done: "Done",
		// legacy fallbacks from earlier prototypes
		"Outer Scope": "Outer",
		"Inner Scope": "Inner",
		Start: "Start",
		"Load Cart": "Load",
		A: "A",
		B: "B",
		C: "C",
		D: "D",
		X: "X",
		Y: "Y",
		Z: "Z",
	};
	if (map[trimmed]) return map[trimmed];

	// Try to strip quotes/spaces for safety
	const cleaned = trimmed.replace(/["'`]/g, "").trim();
	if (map[cleaned]) return map[cleaned];

	// As last resort, if it looks like a simple token use it (for flexibility)
	if (/^[A-Za-z][A-Za-z0-9_]*$/.test(cleaned) && cleaned.length <= 20) {
		return cleaned;
	}
	return null;
}

function tagEdgesWithStableIds(svgEl: SVGSVGElement) {
	// Collect candidate edge paths (those with M.. and curves/lines, outside of <defs>)
	const allPaths = Array.from(svgEl.querySelectorAll("path"));
	const edgePaths: SVGPathElement[] = [];
	for (const p of allPaths) {
		// Skip anything inside defs or markers
		if (p.closest("defs, marker")) continue;
		const d = p.getAttribute("d") || "";
		if (
			d?.trim().startsWith("M") &&
			(d.includes("C") || d.includes("L") || d.includes("Q"))
		) {
			edgePaths.push(p);
		}
	}

	// Collect edge labels in DOM order
	const labelContainers = Array.from(
		svgEl.querySelectorAll("g.edgeLabel, .edgeLabel"),
	);
	const edgeLabelTexts: Element[] = [];
	for (const lc of labelContainers) {
		const t = lc.querySelector("text, tspan");
		if (t) edgeLabelTexts.push(t);
	}

	// Pair by index (Mermaid generates them in source order)
	const max = Math.min(edgePaths.length, edgeLabelTexts.length);
	for (let i = 0; i < max; i++) {
		const txt = (edgeLabelTexts[i].textContent || "").trim();
		if (/^e[0-9A-Za-z_]+$/.test(txt)) {
			const path = edgePaths[i];
			path.setAttribute("data-edge-id", txt);
			// Remove/hide the label group so it doesn't pollute the visual
			const container = edgeLabelTexts[i].closest("g.edgeLabel, .edgeLabel");
			if (container?.parentNode) {
				container.parentNode.removeChild(container);
			}
		}
	}
}

/**
 * Extract positions for all tagged elements.
 * Uses getBBox() which is in SVG local coordinates (good for our tweening).
 */
export function extractPositions(svgEl: SVGSVGElement): Positions {
	const clusters: Record<string, Rect> = {};
	const nodes: Record<string, Rect> = {};
	const edges: Record<string, string> = {};

	// Clusters: prefer the rect inside, else bbox of the g
	svgEl.querySelectorAll("[data-cluster-id]").forEach((g) => {
		const id = (g as SVGGElement).getAttribute("data-cluster-id") || "";
		if (!id) return;
		const rect = g.querySelector("rect");
		let r: Rect;
		if (rect) {
			const x = parseFloat(rect.getAttribute("x") || "0");
			const y = parseFloat(rect.getAttribute("y") || "0");
			const w = parseFloat(rect.getAttribute("width") || "0");
			const h = parseFloat(rect.getAttribute("height") || "0");
			r = { x, y, width: w, height: h };
		} else {
			const bb = (g as SVGGElement).getBBox();
			r = { x: bb.x, y: bb.y, width: bb.width, height: bb.height };
		}
		clusters[id] = r;
	});

	// Nodes: bbox of the node g (includes label + shape)
	svgEl.querySelectorAll("[data-node-id]").forEach((g) => {
		const id = (g as SVGGElement).getAttribute("data-node-id") || "";
		if (!id) return;
		const bb = (g as SVGGElement).getBBox();
		nodes[id] = { x: bb.x, y: bb.y, width: bb.width, height: bb.height };
	});

	// Edges: current d
	svgEl.querySelectorAll("[data-edge-id]").forEach((p) => {
		const id = (p as SVGPathElement).getAttribute("data-edge-id") || "";
		if (!id) return;
		const d = (p as SVGPathElement).getAttribute("d") || "";
		if (d) edges[id] = d;
	});

	return { clusters, nodes, edges };
}

/**
 * Simple path d interpolator.
 * Extracts numeric values in order, lerps them, rebuilds string.
 * Assumes the two paths have identical command letter sequence and value count.
 * If not, falls back to target d.
 */
export function interpolatePathD(
	dFrom: string,
	dTo: string,
	t: number,
): string {
	const numsFrom = extractNumbers(dFrom);
	const numsTo = extractNumbers(dTo);
	const cmdsFrom = extractCommands(dFrom);
	const cmdsTo = extractCommands(dTo);

	if (
		numsFrom.length !== numsTo.length ||
		cmdsFrom.join("") !== cmdsTo.join("")
	) {
		// Structure mismatch: snap to target (avoids garbage)
		return dTo;
	}

	const outNums = numsFrom.map((v, i) => lerp(v, numsTo[i], t));
	return rebuildPath(dTo, outNums); // use dTo as template for letters/spacing
}

function extractNumbers(d: string): number[] {
	const re = /-?\d*\.?\d+(?:e[-+]?\d+)?/gi;
	const out: number[] = [];
	let m: RegExpExecArray | null = re.exec(d);
	while (m !== null) {
		out.push(parseFloat(m[0]));
		m = re.exec(d);
	}
	return out;
}

function extractCommands(d: string): string[] {
	const re = /[A-Za-z]/g;
	const out: string[] = [];
	let m: RegExpExecArray | null = re.exec(d);
	while (m !== null) {
		out.push(m[0]);
		m = re.exec(d);
	}
	return out;
}

function rebuildPath(template: string, numbers: number[]): string {
	let i = 0;
	return template.replace(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi, () => {
		const v = numbers[i++];
		return v == null ? "0" : String(Number(v.toFixed(3)));
	});
}

function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

/**
 * Ease for liquid feel (easeOutCubic-ish)
 */
export function ease(t: number): number {
	// easeOutCubic
	const u = t - 1;
	return u * u * u + 1;
}
