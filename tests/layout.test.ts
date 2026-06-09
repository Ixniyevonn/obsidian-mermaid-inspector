import { describe, expect, it } from "bun:test";
import { parseFlowchart, DEMO_MERMAID } from "../src/parser";
import { computeLayout } from "../src/layout";

describe("computeLayout (compound dagre)", () => {
	it("produces a layout for the demo with all root nodes/clusters present when collapsed", () => {
		const model = parseFlowchart(DEMO_MERMAID);
		const expanded = new Set<string>();
		const res = computeLayout(model, expanded);

		expect(Object.keys(res.nodes).length).toBeGreaterThan(0);
		// At minimum the Outer cluster proxy + loose top nodes like Start, Decide, Finish should participate
		expect(res.nodes["cluster:Outer"] || res.collapsedClusters["Outer"]).toBeDefined();
		expect(res.nodes["Start"] || res.nodes["Decide"] || res.nodes["Finish"]).toBeDefined();
		expect(res.edges.length).toBeGreaterThan(0);
	});

	it("grows cluster box size when a scope is expanded (same cluster id, larger w/h)", () => {
		const model = parseFlowchart(DEMO_MERMAID);
		const collapsed = computeLayout(model, new Set());
		const expanded = computeLayout(model, new Set(["Outer"]));

		const cCollapsed = collapsed.nodes["cluster:Outer"] || collapsed.collapsedClusters["Outer"];
		const cExpanded = expanded.nodes["cluster:Outer"] || expanded.collapsedClusters["Outer"];

		expect(cCollapsed).toBeDefined();
		expect(cExpanded).toBeDefined();
		// Expanded should be meaningfully larger
		if (cCollapsed && cExpanded) {
			expect(cExpanded.width).toBeGreaterThan(cCollapsed.width + 10);
			expect(cExpanded.height).toBeGreaterThan(cCollapsed.height + 10);
		}
	});

	it("exposes direct child nodes inside expanded cluster in the nodes map", () => {
		const model = parseFlowchart(DEMO_MERMAID);
		const res = computeLayout(model, new Set(["Outer"]));
		// A and B are direct children of Outer
		expect(res.nodes["A"]).toBeDefined();
		expect(res.nodes["B"]).toBeDefined();
		// X Y are inside Inner which is child; when Outer expanded but Inner not, they may be represented via cluster:Inner
		expect(res.nodes["X"] || res.nodes["cluster:Inner"]).toBeDefined();
	});

	it("projects edges involving scopes to the cluster representative", () => {
		const model = parseFlowchart(DEMO_MERMAID);
		const res = computeLayout(model, new Set());
		// e.g. Outer --> Finish becomes cluster:Outer -> Finish
		const hasProjected = res.edges.some((e) => e.from === "cluster:Outer" || e.to === "cluster:Outer");
		expect(hasProjected).toBe(true);
	});

	it("returns stable numeric positions and sizes (no NaN)", () => {
		const model = parseFlowchart(DEMO_MERMAID);
		const res = computeLayout(model, new Set(["Outer", "Inner"]));
		for (const n of Object.values(res.nodes)) {
			expect(isFinite(n.x)).toBe(true);
			expect(isFinite(n.y)).toBe(true);
			expect(isFinite(n.width) && n.width > 0).toBe(true);
			expect(isFinite(n.height) && n.height > 0).toBe(true);
		}
		for (const e of res.edges) {
			expect(e.points.length).toBeGreaterThanOrEqual(2);
			for (const pt of e.points) {
				expect(isFinite(pt.x)).toBe(true);
				expect(isFinite(pt.y)).toBe(true);
			}
		}
	});
});
