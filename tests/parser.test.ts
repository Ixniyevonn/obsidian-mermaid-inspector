import { describe, expect, it } from "bun:test";
import { parseFlowchart, DEMO_MERMAID } from "../src/parser";

describe("parseFlowchart", () => {
	it("parses the demo diagram without throwing and produces expected structure", () => {
		const model = parseFlowchart(DEMO_MERMAID);
		expect(model).toBeDefined();
		expect(Object.keys(model.nodes).length).toBeGreaterThan(5);
		expect(model.edges.length).toBeGreaterThan(5);
		expect(Object.keys(model.scopes).length).toBeGreaterThan(0);
		expect(model.rootScopeIds.length).toBeGreaterThan(0);
	});

	it("recognizes top level scopes and nested scopes", () => {
		const model = parseFlowchart(DEMO_MERMAID);
		expect(model.scopes["Outer"]).toBeDefined();
		expect(model.scopes["Inner"]).toBeDefined();
		expect(model.scopes["Outer"].parentId).toBeNull();
		expect(model.scopes["Inner"].parentId).toBe("Outer");
		expect(model.scopes["Outer"].subscopeIds).toContain("Inner");
	});

	it("attaches nodes to correct scopes (direct members)", () => {
		const model = parseFlowchart(DEMO_MERMAID);
		const outer = model.scopes["Outer"];
		expect(outer.nodeIds).toContain("A");
		expect(outer.nodeIds).toContain("B");
		expect(outer.nodeIds).toContain("EndA");
		// Inner members not direct on outer
		expect(outer.nodeIds).not.toContain("X");
		const inner = model.scopes["Inner"];
		expect(inner.nodeIds).toContain("X");
		expect(inner.nodeIds).toContain("Y");
	});

	it("does not create node entries for scope ids", () => {
		const model = parseFlowchart(DEMO_MERMAID);
		expect(model.nodes["Outer"]).toBeUndefined();
		expect(model.nodes["Inner"]).toBeUndefined();
	});

	it("parses edges with and without labels", () => {
		const model = parseFlowchart(DEMO_MERMAID);
		const decideToOuter = model.edges.find((e) => e.from === "Decide" && e.to === "Outer");
		expect(decideToOuter?.label).toBe("Outer");
		const startToFinish = model.edges.find((e) => e.from === "Start" && e.to === "Finish");
		expect(startToFinish?.label).toBeUndefined();
	});

	it("handles shaped node syntax in edge lines (e.g. Decide{Choose Path})", () => {
		const model = parseFlowchart(DEMO_MERMAID);
		expect(model.nodes["Decide"]).toBeDefined();
		expect(model.nodes["Decide"].label).toBe("Choose Path");
	});

	it("ignores comments and non-relevant lines", () => {
		const src = `
			flowchart TD
			%% comment
			A[Node] --> B
			classDef foo fill:#f00;
		`;
		const model = parseFlowchart(src);
		expect(model.nodes["A"]).toBeDefined();
		expect(model.nodes["B"]).toBeDefined();
	});

	it("supports loose nodes at root level", () => {
		const src = `
			flowchart TD
			Standalone[Loose] --> Other
		`;
		const model = parseFlowchart(src);
		expect(model.looseNodeIds).toContain("Standalone");
		expect(model.looseNodeIds).toContain("Other");
		expect(model.rootScopeIds.length).toBe(0);
	});
});
