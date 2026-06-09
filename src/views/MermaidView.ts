import { ItemView, type WorkspaceLeaf } from "obsidian";
import { DEMO_MERMAID, parseFlowchart } from "../parser";
import { computeLayout } from "../layout";
import type { GraphModel, LayoutEdge, LayoutResult } from "../types";

export const VIEW_TYPE = "mermaid-inspector";

type Pos = { x: number; y: number; w: number; h: number };
interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}

const SVGNSS = "http://www.w3.org/2000/svg";

export class MermaidView extends ItemView {
	private rootEl: HTMLDivElement | null = null;
	private svg: SVGSVGElement | null = null;
	private expandedClustersLayer: SVGGElement | null = null;
	private edgesLayer: SVGGElement | null = null;
	private nodesLayer: SVGGElement | null = null;
	private collapsedClustersLayer: SVGGElement | null = null;

	// Core model (hardcoded for current milestone, same as before)
	private model: GraphModel;

	// State
	private expanded: Set<string> = new Set();
	private display: Record<string, Pos> = {};
	private previousTargetSnapshot: Record<string, Pos> = {};
	private lastClusterCenters: Record<string, { x: number; y: number }> = {};
	private animating = false;
	private rafId: number | null = null;
	private layout!: LayoutResult;

	// Live element maps for efficient position updates during animation
	private expandedClusterMap = new Map<
		string,
		{ g: SVGGElement; rect: SVGRectElement; label: SVGTextElement }
	>();
	private edgeMap = new Map<
		string,
		{
			path: SVGPathElement;
			labelGroup?: SVGGElement;
			labelRect?: SVGRectElement;
			labelText?: SVGTextElement;
		}
	>();
	private nodeMap = new Map<
		string,
		{ g: SVGGElement; rect: SVGRectElement; text: SVGTextElement }
	>();
	private collapsedClusterMap = new Map<
		string,
		{
			g: SVGGElement;
			rect: SVGRectElement;
			label: SVGTextElement;
			ellipsis: SVGTextElement;
		}
	>();

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
		this.model = parseFlowchart(DEMO_MERMAID);
	}

	getViewType(): string {
		return VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Mermaid Inspector";
	}

	getIcon(): string {
		return "git-branch";
	}

	async onOpen(): Promise<void> {
		this.contentEl.empty();
		this.contentEl.addClass("mermaid-inspector-container");

		this.buildDOM();
		this.resetState();
		this.layout = computeLayout(this.model, this.expanded);
		this.applyLayoutChange();
		this.syncFull();
	}

	async onClose(): Promise<void> {
		if (this.rafId !== null) {
			cancelAnimationFrame(this.rafId);
			this.rafId = null;
		}
		this.animating = false;
		this.clearElementMaps();
		if (this.rootEl) {
			this.rootEl.remove();
			this.rootEl = null;
		}
		this.svg = null;
		this.expandedClustersLayer = null;
		this.edgesLayer = null;
		this.nodesLayer = null;
		this.collapsedClustersLayer = null;
		this.contentEl.empty();
	}

	private resetState(): void {
		this.expanded = new Set();
		this.display = {};
		this.previousTargetSnapshot = {};
		this.lastClusterCenters = {};
		this.animating = false;
		this.rafId = null;
		this.clearElementMaps();
	}

	private clearElementMaps(): void {
		this.expandedClusterMap.clear();
		this.edgeMap.clear();
		this.nodeMap.clear();
		this.collapsedClusterMap.clear();
	}

	private buildDOM(): void {
		this.rootEl = this.contentEl.createDiv({ cls: "mi-root" });

		// Header
		const header = this.rootEl.createDiv({ cls: "mi-header" });
		header.createDiv({
			cls: "mi-title",
			text: "Mermaid Inspector — Milestone 1 (vanilla)",
		});
		header.createDiv({
			cls: "mi-sub",
			text: "Hardcoded nested flowchart • parsed locally • dagre layout • custom SVG • click clusters to expand/collapse",
		});

		// Canvas + SVG
		const canvas = this.rootEl.createDiv({ cls: "mi-canvas" });
		this.svg = document.createElementNS(SVGNSS, "svg") as SVGSVGElement;
		this.svg.setAttribute("class", "mi-svg");
		this.svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
		canvas.appendChild(this.svg);

		// Defs (arrow marker) - created once
		const defs = document.createElementNS(SVGNSS, "defs");
		const marker = document.createElementNS(SVGNSS, "marker");
		marker.setAttribute("id", "mi-arrow");
		marker.setAttribute("viewBox", "0 0 10 7");
		marker.setAttribute("refX", "9");
		marker.setAttribute("refY", "3.5");
		marker.setAttribute("markerWidth", "7");
		marker.setAttribute("markerHeight", "7");
		marker.setAttribute("orient", "auto");
		const arrowPath = document.createElementNS(SVGNSS, "path");
		arrowPath.setAttribute("d", "M0 0 L10 3.5 L0 7 Z");
		arrowPath.setAttribute("fill", "var(--text-faint)");
		marker.appendChild(arrowPath);
		defs.appendChild(marker);
		this.svg.appendChild(defs);

		// Layers (order: expanded bg containers, edges, nodes, collapsed proxies)
		this.expandedClustersLayer = document.createElementNS(SVGNSS, "g");
		this.expandedClustersLayer.setAttribute("class", "expanded-clusters");
		this.svg.appendChild(this.expandedClustersLayer);

		this.edgesLayer = document.createElementNS(SVGNSS, "g");
		this.edgesLayer.setAttribute("class", "edges");
		this.svg.appendChild(this.edgesLayer);

		this.nodesLayer = document.createElementNS(SVGNSS, "g");
		this.nodesLayer.setAttribute("class", "nodes");
		this.svg.appendChild(this.nodesLayer);

		this.collapsedClustersLayer = document.createElementNS(SVGNSS, "g");
		this.collapsedClustersLayer.setAttribute("class", "collapsed-clusters");
		this.svg.appendChild(this.collapsedClustersLayer);

		// Footer
		const footer = this.rootEl.createDiv({ cls: "mi-footer" });
		footer.appendChild(document.createTextNode("Click a "));
		const _hint = footer.createEl("span", {
			cls: "cluster-hint",
			text: "dashed cluster",
		});
		footer.appendChild(
			document.createTextNode(
				" to expand it. Click the background region of an expanded cluster to collapse it back. Animation uses position lerping + live cluster bounds. Pure custom SVG (no mermaid.render).",
			),
		);
	}

	private scheduleTick(): void {
		if (this.animating) return;
		this.animating = true;
		this.rafId = requestAnimationFrame(this.tick);
	}

	private tick = (): void => {
		let stillMoving = false;
		const L = this.layout;
		const next: Record<string, Pos> = { ...this.display };

		const k = 0.2;

		for (const [id, target] of Object.entries(L.nodes)) {
			let cur = next[id];
			if (!cur) {
				cur = {
					x: Number.isFinite(target.x) ? target.x : 0,
					y: Number.isFinite(target.y) ? target.y : 0,
					w: target.width,
					h: target.height,
				};
			}

			const tx = Number.isFinite(target.x) ? target.x : 0;
			const ty = Number.isFinite(target.y) ? target.y : 0;
			const nx = cur.x + (tx - cur.x) * k;
			const ny = cur.y + (ty - cur.y) * k;

			const moved = Math.abs(nx - tx) > 0.6 || Math.abs(ny - ty) > 0.6;

			if (moved) {
				stillMoving = true;
				next[id] = { x: nx, y: ny, w: target.width, h: target.height };
			} else {
				next[id] = { x: tx, y: ty, w: target.width, h: target.height };
			}
		}

		// Remove stale
		for (const k of Object.keys(next)) {
			if (!L.nodes[k]) delete next[k];
		}

		this.display = next;
		this.updatePositions();

		if (stillMoving) {
			this.rafId = requestAnimationFrame(this.tick);
		} else {
			this.animating = false;
			this.rafId = null;
		}
	};

	/** Recompute layout from current expanded, seed display for animation (birth/lerp from previous), then kick render + anim */
	private applyLayoutChange(): void {
		this.layout = computeLayout(this.model, this.expanded);
		const L = this.layout;
		const nextDisplay: Record<string, Pos> = {};
		const nowTargets: Record<string, Pos> = {};

		for (const [id, n] of Object.entries(L.nodes)) {
			nowTargets[id] = { x: n.x, y: n.y, w: n.width, h: n.height };
		}

		for (const [id, t] of Object.entries(nowTargets)) {
			const previous = this.previousTargetSnapshot[id];
			if (
				previous &&
				Number.isFinite(previous.x) &&
				Number.isFinite(previous.y)
			) {
				if (id.startsWith("cluster:")) {
					const oldCx = previous.x + previous.w / 2;
					const oldCy = previous.y + previous.h / 2;
					const initW = previous.w;
					const initH = previous.h;
					nextDisplay[id] = {
						x: oldCx - initW / 2,
						y: oldCy - initH / 2,
						w: initW,
						h: initH,
					};
				} else {
					nextDisplay[id] = { ...previous };
				}
			} else {
				// birth near last known center of owning cluster
				let birth: Pos | null = null;
				if (!id.startsWith("cluster:")) {
					for (const [sid, sc] of Object.entries(this.model.scopes)) {
						if (sc.nodeIds.includes(id)) {
							const c =
								this.lastClusterCenters[sid] ??
								this.previousTargetSnapshot[`cluster:${sid}`];
							if (c && Number.isFinite(c.x) && Number.isFinite(c.y)) {
								birth = {
									x: c.x - t.w / 2,
									y: c.y - t.h / 2,
									w: t.w,
									h: t.h,
								};
								break;
							}
						}
					}
				}
				nextDisplay[id] = birth ?? { ...t };
			}
		}

		// Update cluster centers from outgoing snapshot (plain)
		for (const [id, p] of Object.entries(this.previousTargetSnapshot)) {
			if (id.startsWith("cluster:")) {
				const sid = id.slice(8);
				if (Number.isFinite(p.x) && Number.isFinite(p.y)) {
					this.lastClusterCenters[sid] = { x: p.x + p.w / 2, y: p.y + p.h / 2 };
				}
			}
		}

		this.previousTargetSnapshot = nowTargets;
		this.display = nextDisplay;

		this.syncFull();
		this.scheduleTick();
	}

	private toggleCluster(scopeId: string): void {
		const next = new Set(this.expanded);
		if (next.has(scopeId)) {
			next.delete(scopeId);
		} else {
			next.add(scopeId);
		}
		this.expanded = next;
		this.applyLayoutChange();
	}

	private getActiveClusterIds(): string[] {
		const ids: string[] = [];
		for (const sid of Object.keys(this.model.scopes)) {
			const hasProxy = !!this.layout.collapsedClusters[sid];
			const hasMembers = this.getClusterMemberIds(sid).length > 0;
			if (hasProxy || hasMembers) ids.push(sid);
		}
		return ids;
	}

	private getClusterMemberIds(scopeId: string): string[] {
		const sc = this.model.scopes[scopeId];
		if (!sc) return [];
		const out: string[] = [...sc.nodeIds];
		function walk(childId: string, model: GraphModel, expanded: Set<string>) {
			const c = model.scopes[childId];
			if (!c) return;
			if (expanded.has(childId)) {
				out.push(...c.nodeIds);
				for (const g of c.subscopeIds) walk(g, model, expanded);
			}
		}
		for (const ch of sc.subscopeIds) walk(ch, this.model, this.expanded);
		return out.filter((nid) => this.display[nid] || this.layout.nodes[nid]);
	}

	private getLiveClusterBox(
		scopeId: string,
	): { x: number; y: number; w: number; h: number } | null {
		const sc = this.model.scopes[scopeId];
		if (!sc) return null;

		const cl =
			this.display[`cluster:${scopeId}`] ??
			this.layout.collapsedClusters[scopeId] ??
			this.layout.nodes[`cluster:${scopeId}`];

		if (cl) {
			const basePad = 6;
			const isExpanded = this.expanded.has(scopeId);
			const extra = isExpanded ? 18 : 0;
			const PAD = basePad + extra;
			return {
				x: cl.x - PAD,
				y: cl.y - PAD,
				w: cl.w + PAD * 2,
				h: cl.h + PAD * 2,
			};
		}

		// Fallback union
		const members = this.getClusterMemberIds(scopeId);
		if (members.length === 0) return null;

		let minX = Infinity;
		let minY = Infinity;
		let maxX = -Infinity;
		let maxY = -Infinity;

		for (const nid of members) {
			const p = this.display[nid] ?? this.layout.nodes[nid];
			if (!p) continue;
			const px = Number.isFinite(p.x) ? p.x : 0;
			const py = Number.isFinite(p.y) ? p.y : 0;
			const pw = Number.isFinite(p.w) ? p.w : 0;
			const ph = Number.isFinite(p.h) ? p.h : 0;
			minX = Math.min(minX, px);
			minY = Math.min(minY, py);
			maxX = Math.max(maxX, px + pw);
			maxY = Math.max(maxY, py + ph);
		}

		if (!Number.isFinite(minX)) return null;

		const PAD = 16;
		const LABEL = 18;
		return {
			x: minX - PAD,
			y: minY - PAD - LABEL,
			w: maxX - minX + PAD * 2,
			h: maxY - minY + PAD * 2 + LABEL,
		};
	}

	/** Side attachment for arrows (matches real flowchart aesthetics) */
	private getAttachmentPoint(
		rect: Rect,
		target: { x: number; y: number },
	): { x: number; y: number } {
		const cx = rect.x + rect.w / 2;
		const cy = rect.y + rect.h / 2;
		const dx = target.x - cx;
		const dy = target.y - cy;

		if (Math.abs(dx) > Math.abs(dy)) {
			if (dx >= 0) {
				return { x: rect.x + rect.w, y: cy };
			} else {
				return { x: rect.x, y: cy };
			}
		} else {
			if (dy >= 0) {
				return { x: cx, y: rect.y + rect.h };
			} else {
				return { x: cx, y: rect.y };
			}
		}
	}

	private edgePath(e: LayoutEdge): string | null {
		const aRaw = this.display[e.from] ?? this.layout.nodes[e.from];
		const bRaw = this.display[e.to] ?? this.layout.nodes[e.to];
		if (!aRaw || !bRaw) return null;

		const aRect: Rect = {
			x: Number.isFinite(aRaw.x) ? aRaw.x : 0,
			y: Number.isFinite(aRaw.y) ? aRaw.y : 0,
			w: Number.isFinite(aRaw.w) ? aRaw.w : 0,
			h: Number.isFinite(aRaw.h) ? aRaw.h : 0,
		};
		const bRect: Rect = {
			x: Number.isFinite(bRaw.x) ? bRaw.x : 0,
			y: Number.isFinite(bRaw.y) ? bRaw.y : 0,
			w: Number.isFinite(bRaw.w) ? bRaw.w : 0,
			h: Number.isFinite(bRaw.h) ? bRaw.h : 0,
		};

		const aCenter = { x: aRect.x + aRect.w / 2, y: aRect.y + aRect.h / 2 };
		const bCenter = { x: bRect.x + bRect.w / 2, y: bRect.y + bRect.h / 2 };

		const start = this.getAttachmentPoint(aRect, bCenter);
		const end = this.getAttachmentPoint(bRect, aCenter);

		const dx = end.x - start.x;
		const dy = end.y - start.y;
		const dist = Math.hypot(dx, dy) || 1;

		const out = Math.max(18, dist * 0.28);

		let c1x = start.x;
		let c1y = start.y;
		let c2x = end.x;
		let c2y = end.y;

		if (Math.abs(dx) >= Math.abs(dy)) {
			c1x = start.x + Math.sign(dx || 1) * out;
			c2x = end.x - Math.sign(dx || 1) * out;
			c1y = start.y + dy * 0.15;
			c2y = end.y - dy * 0.15;
		} else {
			c1y = start.y + Math.sign(dy || 1) * out;
			c2y = end.y - Math.sign(dy || 1) * out;
			c1x = start.x + dx * 0.15;
			c2x = end.x - dx * 0.15;
		}

		return `M ${start.x},${start.y} C ${c1x},${c1y} ${c2x},${c2y} ${end.x},${end.y}`;
	}

	private getNodeLabel(id: string): string {
		if (id.startsWith("cluster:")) {
			const sid = id.slice(8);
			return this.model.scopes[sid]?.label ?? sid;
		}
		return this.model.nodes[id]?.label ?? id;
	}

	/** Create all visual elements from current display + layout (used on layout/expand changes) */
	private syncFull(): void {
		this.clearLayers();
		this.createExpandedClusterElements();
		this.createEdgeElements();
		this.createNodeElements();
		this.createCollapsedClusterElements();
	}

	private clearLayers(): void {
		if (this.expandedClustersLayer)
			this.expandedClustersLayer.replaceChildren();
		if (this.edgesLayer) this.edgesLayer.replaceChildren();
		if (this.nodesLayer) this.nodesLayer.replaceChildren();
		if (this.collapsedClustersLayer)
			this.collapsedClustersLayer.replaceChildren();
		this.clearElementMaps();
	}

	private createExpandedClusterElements(): void {
		if (!this.expandedClustersLayer) return;
		const active = this.getActiveClusterIds();
		for (const sid of active) {
			if (!this.expanded.has(sid)) continue;
			const box = this.getLiveClusterBox(sid);
			if (!box) continue;

			const g = document.createElementNS(SVGNSS, "g");
			g.setAttribute("class", "cluster-container");
			g.addEventListener("click", () => this.toggleCluster(sid));

			const rect = document.createElementNS(SVGNSS, "rect");
			rect.setAttribute("x", String(box.x));
			rect.setAttribute("y", String(box.y));
			rect.setAttribute("width", String(box.w));
			rect.setAttribute("height", String(box.h));
			rect.setAttribute("rx", "10");
			rect.setAttribute("ry", "10");
			rect.setAttribute(
				"fill",
				"color-mix(in srgb, var(--background-secondary) 55%, transparent)",
			);
			rect.setAttribute("stroke", "var(--background-modifier-border)");
			rect.setAttribute("stroke-width", "1.5");
			g.appendChild(rect);

			const label = document.createElementNS(SVGNSS, "text");
			label.setAttribute("x", String(box.x + 10));
			label.setAttribute("y", String(box.y + 15));
			label.setAttribute("font-size", "11");
			label.setAttribute("font-weight", "600");
			label.setAttribute("fill", "var(--text-muted)");
			label.setAttribute("style", "pointer-events: none; user-select: none;");
			label.textContent = this.model.scopes[sid]?.label ?? sid;
			g.appendChild(label);

			this.expandedClustersLayer.appendChild(g);
			this.expandedClusterMap.set(sid, { g, rect, label });
		}
	}

	private createEdgeElements(): void {
		if (!this.edgesLayer) return;
		for (const e of this.layout.edges) {
			const key = `${e.from}::${e.to}`;
			const d = this.edgePath(e);
			if (!d) continue;

			const path = document.createElementNS(SVGNSS, "path");
			path.setAttribute("d", d);
			path.setAttribute("fill", "none");
			path.setAttribute("stroke", "var(--text-faint)");
			path.setAttribute("stroke-width", "1.75");
			path.setAttribute("marker-end", "url(#mi-arrow)");
			path.setAttribute("style", "pointer-events: none;");
			this.edgesLayer.appendChild(path);

			let labelGroup: SVGGElement | undefined;
			let labelRect: SVGRectElement | undefined;
			let labelText: SVGTextElement | undefined;

			if (e.label) {
				const aRaw = this.display[e.from] ?? this.layout.nodes[e.from];
				const bRaw = this.display[e.to] ?? this.layout.nodes[e.to];
				const a =
					aRaw && Number.isFinite(aRaw.x) && Number.isFinite(aRaw.y)
						? aRaw
						: null;
				const b =
					bRaw && Number.isFinite(bRaw.x) && Number.isFinite(bRaw.y)
						? bRaw
						: null;
				if (a && b) {
					labelGroup = document.createElementNS(SVGNSS, "g");
					labelGroup.setAttribute("style", "pointer-events: none;");

					const mx = (a.x + a.w / 2 + b.x + b.w / 2) / 2;
					const my = (a.y + a.h / 2 + b.y + b.h / 2) / 2;
					const lw = e.label.length * 6.4 + 12;

					labelRect = document.createElementNS(SVGNSS, "rect");
					labelRect.setAttribute("x", String(mx - (e.label.length * 3.2 + 6)));
					labelRect.setAttribute("y", String(my - 12));
					labelRect.setAttribute("width", String(lw));
					labelRect.setAttribute("height", "15");
					labelRect.setAttribute("rx", "3");
					labelRect.setAttribute("fill", "var(--background-primary)");
					labelRect.setAttribute("stroke", "var(--background-modifier-border)");
					labelRect.setAttribute("stroke-width", "0.5");
					labelRect.setAttribute("opacity", "0.9");
					labelGroup.appendChild(labelRect);

					labelText = document.createElementNS(SVGNSS, "text");
					labelText.setAttribute("x", String(mx));
					labelText.setAttribute("y", String(my - 1));
					labelText.setAttribute("font-size", "10");
					labelText.setAttribute("fill", "var(--text-muted)");
					labelText.setAttribute("text-anchor", "middle");
					labelText.textContent = e.label;
					labelGroup.appendChild(labelText);

					this.edgesLayer.appendChild(labelGroup);
				}
			}

			this.edgeMap.set(key, { path, labelGroup, labelRect, labelText });
		}
	}

	private createNodeElements(): void {
		if (!this.nodesLayer) return;
		for (const [id, p] of Object.entries(this.display)) {
			if (id.startsWith("cluster:")) continue;

			const g = document.createElementNS(SVGNSS, "g");
			g.setAttribute("class", "node");
			g.setAttribute("transform", `translate(${p.x} ${p.y})`);
			// stop click from bubbling in case
			g.addEventListener("click", (ev) => ev.stopPropagation());

			const rect = document.createElementNS(SVGNSS, "rect");
			rect.setAttribute("width", String(p.w));
			rect.setAttribute("height", String(p.h));
			rect.setAttribute("rx", "8");
			rect.setAttribute("ry", "8");
			rect.setAttribute("fill", "var(--background-primary)");
			rect.setAttribute("stroke", "var(--background-modifier-border)");
			rect.setAttribute("stroke-width", "1");
			g.appendChild(rect);

			const text = document.createElementNS(SVGNSS, "text");
			text.setAttribute("x", String(p.w / 2));
			text.setAttribute("y", String(p.h / 2));
			text.setAttribute("text-anchor", "middle");
			text.setAttribute("dominant-baseline", "middle");
			text.setAttribute("font-size", "13");
			text.setAttribute("fill", "var(--text-normal)");
			text.setAttribute("style", "pointer-events: none;");
			text.textContent = this.getNodeLabel(id);
			g.appendChild(text);

			this.nodesLayer.appendChild(g);
			this.nodeMap.set(id, { g, rect, text });
		}
	}

	private createCollapsedClusterElements(): void {
		if (!this.collapsedClustersLayer) return;
		for (const [id, p] of Object.entries(this.display)) {
			if (!id.startsWith("cluster:")) continue;
			const sid = id.slice(8);
			if (this.expanded.has(sid)) continue;

			const g = document.createElementNS(SVGNSS, "g");
			g.setAttribute("class", "cluster-collapsed");
			g.setAttribute("transform", `translate(${p.x} ${p.y})`);
			g.addEventListener("click", () => this.toggleCluster(sid));

			const rect = document.createElementNS(SVGNSS, "rect");
			rect.setAttribute("width", String(p.w));
			rect.setAttribute("height", String(p.h));
			rect.setAttribute("rx", "8");
			rect.setAttribute("ry", "8");
			rect.setAttribute("fill", "var(--background-secondary)");
			rect.setAttribute("stroke", "var(--interactive-accent)");
			rect.setAttribute("stroke-width", "2");
			rect.setAttribute("stroke-dasharray", "5 3");
			g.appendChild(rect);

			const label = document.createElementNS(SVGNSS, "text");
			label.setAttribute("x", String(p.w / 2));
			label.setAttribute("y", String(p.h / 2 + 4));
			label.setAttribute("text-anchor", "middle");
			label.setAttribute("font-size", "11");
			label.setAttribute("font-weight", "600");
			label.setAttribute("fill", "var(--text-muted)");
			label.setAttribute(
				"style",
				"pointer-events: none; dominant-baseline: middle;",
			);
			label.textContent = this.getNodeLabel(id);
			g.appendChild(label);

			const ellipsis = document.createElementNS(SVGNSS, "text");
			ellipsis.setAttribute("x", String(p.w - 8));
			ellipsis.setAttribute("y", String(p.h - 6));
			ellipsis.setAttribute("font-size", "10");
			ellipsis.setAttribute("fill", "var(--text-faint)");
			ellipsis.setAttribute("text-anchor", "end");
			ellipsis.setAttribute("style", "pointer-events: none;");
			ellipsis.textContent = "…";
			g.appendChild(ellipsis);

			this.collapsedClustersLayer.appendChild(g);
			this.collapsedClusterMap.set(sid, { g, rect, label, ellipsis });
		}
	}

	/** Update only positions/sizes on existing elements (called every animation frame) */
	private updatePositions(): void {
		this.updateExpandedClusterPositions();
		this.updateEdgePositions();
		this.updateNodePositions();
		this.updateCollapsedClusterPositions();
	}

	private updateExpandedClusterPositions(): void {
		if (!this.expandedClustersLayer) return;
		for (const sid of this.getActiveClusterIds()) {
			if (!this.expanded.has(sid)) continue;
			const box = this.getLiveClusterBox(sid);
			if (!box) continue;
			const entry = this.expandedClusterMap.get(sid);
			if (!entry) continue;

			entry.rect.setAttribute("x", String(box.x));
			entry.rect.setAttribute("y", String(box.y));
			entry.rect.setAttribute("width", String(box.w));
			entry.rect.setAttribute("height", String(box.h));

			entry.label.setAttribute("x", String(box.x + 10));
			entry.label.setAttribute("y", String(box.y + 15));
		}
	}

	private updateEdgePositions(): void {
		for (const e of this.layout.edges) {
			const key = `${e.from}::${e.to}`;
			const entry = this.edgeMap.get(key);
			if (!entry) continue;

			const d = this.edgePath(e);
			if (d) entry.path.setAttribute("d", d);

			if (e.label && entry.labelGroup && entry.labelRect && entry.labelText) {
				const aRaw = this.display[e.from] ?? this.layout.nodes[e.from];
				const bRaw = this.display[e.to] ?? this.layout.nodes[e.to];
				const a =
					aRaw && Number.isFinite(aRaw.x) && Number.isFinite(aRaw.y)
						? aRaw
						: null;
				const b =
					bRaw && Number.isFinite(bRaw.x) && Number.isFinite(bRaw.y)
						? bRaw
						: null;
				if (a && b) {
					const mx = (a.x + a.w / 2 + b.x + b.w / 2) / 2;
					const my = (a.y + a.h / 2 + b.y + b.h / 2) / 2;

					entry.labelRect.setAttribute(
						"x",
						String(mx - (e.label.length * 3.2 + 6)),
					);
					entry.labelRect.setAttribute("y", String(my - 12));
					entry.labelRect.setAttribute(
						"width",
						String(e.label.length * 6.4 + 12),
					);

					entry.labelText.setAttribute("x", String(mx));
					entry.labelText.setAttribute("y", String(my - 1));
				}
			}
		}
	}

	private updateNodePositions(): void {
		for (const [id, p] of Object.entries(this.display)) {
			if (id.startsWith("cluster:")) continue;
			const entry = this.nodeMap.get(id);
			if (!entry) continue;

			entry.g.setAttribute("transform", `translate(${p.x} ${p.y})`);
			entry.rect.setAttribute("width", String(p.w));
			entry.rect.setAttribute("height", String(p.h));
			// text position is relative + anchors, no need to touch
		}
	}

	private updateCollapsedClusterPositions(): void {
		for (const [id, p] of Object.entries(this.display)) {
			if (!id.startsWith("cluster:")) continue;
			const sid = id.slice(8);
			if (this.expanded.has(sid)) continue;
			const entry = this.collapsedClusterMap.get(sid);
			if (!entry) continue;

			entry.g.setAttribute("transform", `translate(${p.x} ${p.y})`);
			entry.rect.setAttribute("width", String(p.w));
			entry.rect.setAttribute("height", String(p.h));
			entry.label.setAttribute("x", String(p.w / 2));
			entry.label.setAttribute("y", String(p.h / 2 + 4));
			entry.ellipsis.setAttribute("x", String(p.w - 8));
			entry.ellipsis.setAttribute("y", String(p.h - 6));
		}
	}
}
