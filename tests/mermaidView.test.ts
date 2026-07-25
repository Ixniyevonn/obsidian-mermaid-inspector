import { describe, expect, it } from "bun:test";
import { getViewSource, getViewSourceWithMeta } from "../src/diagram/model";
import { ORDER_FLOW_SOURCE } from "./fixtures/orderFlow";

// Helper: collect "A --> B" style edges from rendered mermaid source.
// Returns a Set of "src --> dst" strings (ignores edge labels and arrow styles).
// The mermaid-ast renderer inlines node shape annotations on the first occurrence
// of each node (e.g. `Inventory["Reserve Stock"] --> Analytics["Analytics"]`).
// We strip those annotations first so the edge regex stays simple.
function edges(source: string): Set<string> {
	// Strip shape annotations that immediately follow a word char: ["..."], {...}, (...)
	const stripped = source.replace(
		/(?<=\w)(?:\[{1,3}[^\]\n]*\]{1,3}|\{{1,2}[^}\n]*\}{1,2}|\([^)\n]*\))/g,
		"",
	);
	const result = new Set<string>();
	const re = /(\w+)\s*(?:-->|-\.->|==>|---)(?:\|[^|\n]*\|)?\s*(\w+)/g;
	for (const match of stripped.matchAll(re)) {
		result.add(`${match[1]} --> ${match[2]}`);
	}
	return result;
}

describe("getViewSource — edge connectivity", () => {
	it("fully collapsed: Outer is connected to top-level nodes", () => {
		const src = getViewSource(new Set(), ORDER_FLOW_SOURCE);
		const e = edges(src);

		// Catalog --> Validate should redirect to Catalog --> Outer
		expect(e.has("Catalog --> Outer")).toBe(true);
		// User --> Validate should redirect to User --> Outer
		expect(e.has("User --> Outer")).toBe(true);
		// ShipPrep --> Notify should redirect to Outer --> Notify
		expect(e.has("Outer --> Notify")).toBe(true);
		// ShipPrep --> Inventory should redirect to Outer --> Inventory
		expect(e.has("Outer --> Inventory")).toBe(true);
	});

	it("fully collapsed: original internal edges are gone", () => {
		const src = getViewSource(new Set(), ORDER_FLOW_SOURCE);
		const e = edges(src);

		// Interior nodes should not appear as edge endpoints
		expect(e.has("Catalog --> Validate")).toBe(false);
		expect(e.has("Validate --> Build")).toBe(false);
		expect(e.has("ShipPrep --> Notify")).toBe(false);
		expect(e.has("Enter --> ValidateCard")).toBe(false);
	});

	it("fully collapsed: no self-loops on Outer", () => {
		const src = getViewSource(new Set(), ORDER_FLOW_SOURCE);
		const e = edges(src);
		expect(e.has("Outer --> Outer")).toBe(false);
		expect(e.has("Inner --> Inner")).toBe(false);
	});

	it("Outer expanded, Inner collapsed: cross-boundary edges to Inner are kept", () => {
		const src = getViewSource(new Set(["Outer"]), ORDER_FLOW_SOURCE);
		const e = edges(src);

		// Review -->|toPayment| Inner stays (Inner is visible as a collapsed block)
		expect(e.has("Review --> Inner")).toBe(true);
		// Inner -->|paid| Discounts stays
		expect(e.has("Inner --> Discounts")).toBe(true);
		// Receipt -->|done| ShipPrep should redirect to Inner --> ShipPrep
		expect(e.has("Inner --> ShipPrep")).toBe(true);
	});

	it("redirects an internal node endpoint through its collapsed nested scope", () => {
		const source = `flowchart TB
  subgraph World_State
    Landscapes
    subgraph Ethnic_Units
      Traits
      EthnicAggregations
      Traits --> EthnicAggregations
    end
    Landscapes --> Ethnic_Units
    EthnicAggregations --> Landscapes
  end
`;

		const src = getViewSource(new Set(["World_State"]), source);
		const e = edges(src);

		expect(e.has("Ethnic_Units --> Landscapes")).toBe(true);
		expect(e.has("EthnicAggregations --> Landscapes")).toBe(false);
		expect(src).not.toContain("EthnicAggregations");
	});

	it("preserves the type and label of an edge redirected to a collapsed scope", () => {
		const source = `flowchart LR
  Priority ==>|urgent| Worker
  Optional -.->|retry| Worker
  subgraph Pool["Worker Pool"]
    Worker["Deep Worker"]
  end
`;

		const src = getViewSource(new Set(), source);

		expect(src).toContain("Priority ==>|urgent| Pool");
		expect(src).toContain("Optional -.->|retry| Pool");
		expect(src).not.toContain("Priority --> Pool");
	});
	it("Outer expanded, Inner collapsed: internal Inner edges are gone", () => {
		const src = getViewSource(new Set(["Outer"]), ORDER_FLOW_SOURCE);
		const e = edges(src);

		expect(e.has("Enter --> ValidateCard")).toBe(false);
		expect(e.has("Auth --> Capture")).toBe(false);
		expect(e.has("Receipt --> ShipPrep")).toBe(false);
	});

	it("Outer expanded, Inner collapsed: no self-loops on Inner", () => {
		const src = getViewSource(new Set(["Outer"]), ORDER_FLOW_SOURCE);
		const e = edges(src);
		expect(e.has("Inner --> Inner")).toBe(false);
	});

	it("both expanded: all original edges are present", () => {
		const src = getViewSource(new Set(["Outer", "Inner"]), ORDER_FLOW_SOURCE);
		const e = edges(src);

		expect(e.has("Catalog --> Validate")).toBe(true);
		expect(e.has("User --> Validate")).toBe(true);
		expect(e.has("Enter --> ValidateCard")).toBe(true);
		expect(e.has("Receipt --> ShipPrep")).toBe(true);
		expect(e.has("ShipPrep --> Notify")).toBe(true);
		expect(e.has("Inventory --> Analytics")).toBe(true);
	});

	it("both expanded: no redirected edges present", () => {
		const src = getViewSource(new Set(["Outer", "Inner"]), ORDER_FLOW_SOURCE);
		const e = edges(src);

		expect(e.has("Catalog --> Outer")).toBe(false);
		expect(e.has("Outer --> Notify")).toBe(false);
		expect(e.has("Inner --> ShipPrep")).toBe(false);
	});

	it("deduplicated redirects: only one edge per unique src/dst pair", () => {
		// When collapsed, multiple internal edges can redirect to the same pair.
		// Verify no duplicates appear by checking the raw source text.
		const src = getViewSource(new Set(), ORDER_FLOW_SOURCE);
		// Count occurrences of "Outer --> Notify" — should be exactly 1
		const matches = src.match(/Outer\s*-->\s*Notify/g);
		expect(matches?.length ?? 0).toBe(1);
	});
});

describe("getViewSourceWithMeta — content-based edge keys", () => {
	it("produces edgeKeys using source node ids (including proxies) for stable matching", () => {
		const { edgeKeys } = getViewSourceWithMeta(new Set(), ORDER_FLOW_SOURCE);
		// Should contain the redirected boundary connections using the cluster ids
		expect(edgeKeys).toContain("Catalog--Outer");
		expect(edgeKeys).toContain("Outer--Notify");
		expect(edgeKeys).toContain("Outer--Inventory");
		// No internal node ids in keys when fully collapsed
		expect(edgeKeys.some((k) => k.includes("Validate"))).toBe(false);
		expect(edgeKeys.some((k) => k.includes("Enter"))).toBe(false);
	});

	it("when partially expanded, includes keys for both proxy and internal edges", () => {
		const { edgeKeys } = getViewSourceWithMeta(
			new Set(["Outer"]),
			ORDER_FLOW_SOURCE,
		);
		expect(edgeKeys).toContain("Review--Inner");
		expect(edgeKeys).toContain("Inner--ShipPrep");
		// Inner still collapsed so its internals are stripped; an Outer-level internal edge is present
		expect(edgeKeys).toContain("Validate--Build");
		expect(edgeKeys.some((k) => k.includes("Enter"))).toBe(false);
	});
});
describe("getViewSourceWithMeta — Mermaid syntax compatibility", () => {
	it("accepts Mermaid comment lines", () => {
		const source = `flowchart LR
  %% This is a valid Mermaid comment.
  A --> B
`;

		const meta = getViewSourceWithMeta(new Set(), source);

		expect(meta.source).toContain("A --> B");
	});

	it("keeps a commented subgraph collapsible", () => {
		const source = `flowchart LR
  Start --> A
  subgraph Group["Commented group"]
    %% Explain why these nodes belong together.
    A --> B
  end
  B --> Done
`;

		const meta = getViewSourceWithMeta(new Set(), source);

		expect(meta.scopes.map((scope) => scope.id)).toEqual(["Group"]);
		expect(meta.collapsedScopeIds).toEqual(["Group"]);
		expect(meta.source).toContain("Start --> Group");
		expect(meta.source).not.toContain("A --> B");
	});
	it("passes newer Mermaid syntax through unchanged when mermaid-ast lags behind", () => {
		const source = `flowchart LR
  A@{ shape: rounded, label: "Start" } --> B
`;

		const meta = getViewSourceWithMeta(new Set(), source);

		expect(meta.source).toBe(source);
		expect(meta.scopes).toEqual([]);
		expect(meta.edgeKeys).toEqual([]);
	});

	it("preserves modern node shape declarations inside expanded subgraphs", () => {
		const source = `flowchart TB
  subgraph Relations
    Relations_Vector_Comment@{shape: comment, label: "RRLL"}
  end`;

		const collapsed = getViewSourceWithMeta(new Set(), source);
		expect(collapsed.source).not.toContain("@{");

		const expanded = getViewSourceWithMeta(new Set(["Relations"]), source);
		expect(expanded.source).toContain(
			'Relations_Vector_Comment@{shape: comment, label: "RRLL"}',
		);
	});

	it("preserves a modern declaration when its first use is an edge endpoint", () => {
		const source = `flowchart LR
  subgraph Relations
    Source --> Relations_Vector_Comment@{
      shape: comment,
      label: "RRLL"
    }
  end`;

		const expanded = getViewSourceWithMeta(new Set(["Relations"]), source);
		expect(expanded.source).toContain(
			`Relations_Vector_Comment@{
      shape: comment,
      label: "RRLL"
    }`,
		);
	});
});
