import { describe, expect, it } from "bun:test";
import { JSDOM } from "jsdom";
import { getViewSourceWithMeta } from "../src/diagram/model";
import { postProcessAndTag } from "../src/diagram/render";

const source = `flowchart TB
  subgraph Empty["Empty Scope"]
  end
  subgraph NonEmpty["Non-empty Scope"]
    A["A"]
  end`;

describe("empty scopes", () => {
	it("classifies empty scopes separately from collapsible scopes", () => {
		const meta = getViewSourceWithMeta(new Set(), source);
		expect(meta.emptyScopeIds).toEqual(["Empty"]);
		expect(meta.collapsedScopeIds).toEqual(["NonEmpty"]);
	});

	it("tags an empty scope as a non-interactive node with scope styling", () => {
		const dom = new JSDOM("<!doctype html><html><body></body></html>");
		const previousDocument = globalThis.document;
		globalThis.document = dom.window.document;
		try {
			const svg = postProcessAndTag(
				'<svg><g class="node"><rect/><text>Empty Scope</text></g></svg>',
				{
					labelToId: { "Empty Scope": "Empty" },
					emptyScopeIds: ["Empty"],
				},
			);
			const empty = svg.querySelector('[data-node-id="Empty"]');
			expect(empty?.classList.contains("mi-empty-scope")).toBe(true);
			expect(svg.querySelector('[data-cluster-id="Empty"]')).toBeNull();
		} finally {
			globalThis.document = previousDocument;
		}
	});
});
