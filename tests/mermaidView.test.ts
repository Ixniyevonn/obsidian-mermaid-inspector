import { describe, expect, it } from "bun:test";
import { getViewSource, getViewSourceWithMeta } from "../src/utils/mermaidView";

// Helper: collect "A --> B" style edges from rendered mermaid source.
// Returns a Set of "src --> dst" strings (ignores edge labels and arrow styles).
// The mermaid-ast renderer inlines node shape annotations on the first occurrence
// of each node (e.g. `Inventory["Reserve Stock"] --> Analytics["Analytics"]`).
// We strip those annotations first so the edge regex stays simple.
function edges(source: string): Set<string> {
  // Strip shape annotations that immediately follow a word char: ["..."], {...}, (...)
  const stripped = source.replace(
    /(?<=\w)(?:\[{1,3}[^\]\n]*\]{1,3}|\{{1,2}[^}\n]*\}{1,2}|\([^)\n]*\))/g,
    ""
  );
  const result = new Set<string>();
  const re = /(\w+)\s*(?:-->|-\.->|==>|---)(?:\|[^|\n]*\|)?\s*(\w+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stripped)) !== null) {
    result.add(`${m[1]} --> ${m[2]}`);
  }
  return result;
}

describe("getViewSource — edge connectivity", () => {
  it("fully collapsed: Outer is connected to top-level nodes", () => {
    const src = getViewSource(new Set());
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
    const src = getViewSource(new Set());
    const e = edges(src);

    // Interior nodes should not appear as edge endpoints
    expect(e.has("Catalog --> Validate")).toBe(false);
    expect(e.has("Validate --> Build")).toBe(false);
    expect(e.has("ShipPrep --> Notify")).toBe(false);
    expect(e.has("Enter --> ValidateCard")).toBe(false);
  });

  it("fully collapsed: no self-loops on Outer", () => {
    const src = getViewSource(new Set());
    const e = edges(src);
    expect(e.has("Outer --> Outer")).toBe(false);
    expect(e.has("Inner --> Inner")).toBe(false);
  });

  it("Outer expanded, Inner collapsed: cross-boundary edges to Inner are kept", () => {
    const src = getViewSource(new Set(["Outer"]));
    const e = edges(src);

    // Review -->|toPayment| Inner stays (Inner is visible as a collapsed block)
    expect(e.has("Review --> Inner")).toBe(true);
    // Inner -->|paid| Discounts stays
    expect(e.has("Inner --> Discounts")).toBe(true);
    // Receipt -->|done| ShipPrep should redirect to Inner --> ShipPrep
    expect(e.has("Inner --> ShipPrep")).toBe(true);
  });

  it("Outer expanded, Inner collapsed: internal Inner edges are gone", () => {
    const src = getViewSource(new Set(["Outer"]));
    const e = edges(src);

    expect(e.has("Enter --> ValidateCard")).toBe(false);
    expect(e.has("Auth --> Capture")).toBe(false);
    expect(e.has("Receipt --> ShipPrep")).toBe(false);
  });

  it("Outer expanded, Inner collapsed: no self-loops on Inner", () => {
    const src = getViewSource(new Set(["Outer"]));
    const e = edges(src);
    expect(e.has("Inner --> Inner")).toBe(false);
  });

  it("both expanded: all original edges are present", () => {
    const src = getViewSource(new Set(["Outer", "Inner"]));
    const e = edges(src);

    expect(e.has("Catalog --> Validate")).toBe(true);
    expect(e.has("User --> Validate")).toBe(true);
    expect(e.has("Enter --> ValidateCard")).toBe(true);
    expect(e.has("Receipt --> ShipPrep")).toBe(true);
    expect(e.has("ShipPrep --> Notify")).toBe(true);
    expect(e.has("Inventory --> Analytics")).toBe(true);
  });

  it("both expanded: no redirected edges present", () => {
    const src = getViewSource(new Set(["Outer", "Inner"]));
    const e = edges(src);

    expect(e.has("Catalog --> Outer")).toBe(false);
    expect(e.has("Outer --> Notify")).toBe(false);
    expect(e.has("Inner --> ShipPrep")).toBe(false);
  });

  it("deduplicated redirects: only one edge per unique src/dst pair", () => {
    // When collapsed, multiple internal edges can redirect to the same pair.
    // Verify no duplicates appear by checking the raw source text.
    const src = getViewSource(new Set());
    // Count occurrences of "Outer --> Notify" — should be exactly 1
    const matches = src.match(/Outer\s*-->\s*Notify/g);
    expect(matches?.length ?? 0).toBe(1);
  });
});

describe("getViewSourceWithMeta — content-based edge keys", () => {
  it("produces edgeKeys using source node ids (including proxies) for stable matching", () => {
    const { edgeKeys } = getViewSourceWithMeta(new Set());
    // Should contain the redirected boundary connections using the cluster ids
    expect(edgeKeys).toContain("Catalog--Outer");
    expect(edgeKeys).toContain("Outer--Notify");
    expect(edgeKeys).toContain("Outer--Inventory");
    // No internal node ids in keys when fully collapsed
    expect(edgeKeys.some((k) => k.includes("Validate"))).toBe(false);
    expect(edgeKeys.some((k) => k.includes("Enter"))).toBe(false);
  });

  it("when partially expanded, includes keys for both proxy and internal edges", () => {
    const { edgeKeys } = getViewSourceWithMeta(new Set(["Outer"]));
    expect(edgeKeys).toContain("Review--Inner");
    expect(edgeKeys).toContain("Inner--ShipPrep");
    // Inner still collapsed so its internals are stripped; an Outer-level internal edge is present
    expect(edgeKeys).toContain("Validate--Build");
    expect(edgeKeys.some((k) => k.includes("Enter"))).toBe(false);
  });
});
