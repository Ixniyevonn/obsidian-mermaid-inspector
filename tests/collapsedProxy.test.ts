import { describe, expect, it } from "bun:test";
import { JSDOM } from "jsdom";
import { postProcessAndTag } from "../src/utils/mermaidRender";
import { FULL_MERMAID, getViewSourceWithMeta } from "../src/utils/mermaidView";

describe("collapsed scope proxies", () => {
	it("reports only visible collapsed scopes", () => {
		const collapsed = getViewSourceWithMeta(new Set(), FULL_MERMAID);
		expect(collapsed.collapsedScopeIds).toEqual(["Outer"]);

		const outerOpen = getViewSourceWithMeta(new Set(["Outer"]), FULL_MERMAID);
		expect(outerOpen.collapsedScopeIds).toEqual(["Inner"]);
	});

	it("tags a collapsed proxy node as an interactive cluster", () => {
		const dom = new JSDOM("<!doctype html><html><body></body></html>");
		const previousDocument = globalThis.document;
		globalThis.document = dom.window.document;
		try {
			const svg = postProcessAndTag(
				'<svg><g class="node" id="flowchart-Outer-0"><rect/><text>Order Processing</text></g></svg>',
				{
					labelToId: { "Order Processing": "Outer" },
					collapsedScopeIds: ["Outer"],
				},
			);
			expect(svg.querySelector('[data-cluster-id="Outer"]')).not.toBeNull();
			expect(svg.querySelector('[data-node-id="Outer"]')).toBeNull();
		} finally {
			globalThis.document = previousDocument;
		}
	});
});
