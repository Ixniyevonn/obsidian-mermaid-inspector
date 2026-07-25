import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { JSDOM } from "jsdom";
import { postProcessAndTag } from "../src/diagram/render";

let dom: JSDOM;
let originalDocument: Document;

beforeAll(() => {
	dom = new JSDOM("<!doctype html><html><body></body></html>", {
		pretendToBeVisual: true,
	});
	originalDocument = globalThis.document;
	Object.defineProperty(globalThis, "document", {
		configurable: true,
		value: dom.window.document,
	});
});

afterAll(() => {
	Object.defineProperty(globalThis, "document", {
		configurable: true,
		value: originalDocument,
	});
});
describe("postProcessAndTag stable id assignment", () => {
	it("assigns data-cluster-id and data-node-id from mermaid g# ids (source ids)", () => {
		// Simulate a typical mermaid-rendered svg snippet (no real layout numbers needed for tagging)
		const sampleSvg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">
        <g id="flowchart-Outer-0" class="cluster">
          <rect class="clusterRect" x="10" y="10" width="120" height="80"/>
          <text>Order Processing</text>
        </g>
        <g id="flowchart-Validate-7" class="node">
          <rect x="20" y="30" width="60" height="30"/>
          <text>Validate Request</text>
        </g>
        <g id="flowchart-User-1" class="node">
          <circle cx="5" cy="5" r="10"/>
          <text>User</text>
        </g>
      </svg>
    `.trim();

		const tagged = postProcessAndTag(sampleSvg, {
			labelToId: {
				"Order Processing": "Outer",
				"Validate Request": "Validate",
				User: "User",
			},
		});
		const outer = tagged.querySelector('[data-cluster-id="Outer"]');
		const validate = tagged.querySelector('[data-node-id="Validate"]');
		const user = tagged.querySelector('[data-node-id="User"]');

		expect(outer).not.toBeNull();
		expect(validate).not.toBeNull();
		expect(user).not.toBeNull();
		expect(outer?.getAttribute("data-cluster-id")).toBe("Outer");
		expect(validate?.getAttribute("data-node-id")).toBe("Validate");
		expect(user?.getAttribute("data-node-id")).toBe("User");
	});

	it("extracts source ids from varied real-world mermaid id formats (prefixed, nested, fancy)", () => {
		const sampleSvg = `
      <svg xmlns="http://www.w3.org/2000/svg">
        <g id="cluster-Inner-xyz-3" class="cluster"><rect x="0" y="0" width="10" height="10"/><text>Payment Subsystem</text></g>
        <g id="flowchart-Validate-42-0-1" class="node"><rect x="0" y="0" width="10" height="10"/><text>Validate Request</text></g>
        <g id="weird-prefix-Build-abc" class="node"><rect x="0" y="0" width="10" height="10"/><text>Build Order</text></g>
      </svg>
    `.trim();

		const tagged = postProcessAndTag(sampleSvg, {
			labelToId: {
				"Payment Subsystem": "Inner",
				"Validate Request": "Validate",
				"Build Order": "Build",
			},
		});
		expect(tagged.querySelector('[data-cluster-id="Inner"]')).not.toBeNull();
		expect(tagged.querySelector('[data-node-id="Validate"]')).not.toBeNull();
		expect(tagged.querySelector('[data-node-id="Build"]')).not.toBeNull();
	});

	it("custom label-to-id map (from generator/AST) is the primary way to assign stable ids (content based, no mermaid id attr)", () => {
		// Even with a completely garbage mermaid id attr, if labelToId map is provided
		// (built from the AST labels in getViewSourceWithMeta), we use the mapped logical id.
		const sampleSvg = `
      <svg xmlns="http://www.w3.org/2000/svg">
        <g id="total-garbage-foo-999" class="cluster">
          <rect x="0" y="0" width="10" height="10"/>
          <text>Order Processing</text>
        </g>
        <g id="nonsense-bar-123" class="node">
          <rect x="0" y="0" width="10" height="10"/>
          <text>Validate Request</text>
        </g>
      </svg>
    `.trim();

		const tagged = postProcessAndTag(sampleSvg, {
			labelToId: {
				"Order Processing": "Outer",
				"Validate Request": "Validate",
			},
		});

		expect(tagged.querySelector('[data-cluster-id="Outer"]')).not.toBeNull();
		expect(tagged.querySelector('[data-node-id="Validate"]')).not.toBeNull();
		// The garbage ids in the attr were ignored in favor of content (label) + map.
	});

	it("assigns data-edge-id from provided content-based edgeKeys (src--dst)", () => {
		const sampleSvg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">
        <defs></defs>
        <path d="M 10 10 C 20 20 30 30 40 40"/>
        <path d="M 50 10 L 90 40"/>
        <g class="edgeLabel"><text>eX_Y</text></g>
      </svg>
    `.trim();

		const edgeKeys = ["Catalog--Outer", "Review--Inner"];
		const tagged = postProcessAndTag(sampleSvg, { labelToId: {}, edgeKeys });

		const p0 = tagged.querySelectorAll("path")[0];
		const p1 = tagged.querySelectorAll("path")[1];
		expect(p0.getAttribute("data-edge-id")).toBe("Catalog--Outer");
		expect(p1.getAttribute("data-edge-id")).toBe("Review--Inner");

		expect(tagged.querySelector(".edgeLabel")).not.toBeNull();
	});

	it("assigns edge ids by endpoint proximity (geometry) when anchors exist, independent of order or passed keys array (prevents cross-wiring like User->Catalog becoming Validate->Build)", () => {
		// Simulate a small diagram with two possible connections.
		// Place "User" left, "Catalog" middle, "Validate" and "Build" inside a cluster on the right.
		// The left path should be labelled User--Catalog, the right one Validate--Build even if we pass a reversed keys array.
		const sampleSvg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="400" height="120">
        <!-- outside nodes -->
        <g data-node-id="User" class="node"><rect x="10" y="40" width="30" height="20"/></g>
        <g data-node-id="Catalog" class="node"><rect x="80" y="40" width="30" height="20"/></g>
        <!-- "cluster" that will contain inner nodes when expanded (center ~190 so it does not steal nearest for the inner connections) -->
        <g data-cluster-id="Outer" class="cluster"><rect x="150" y="10" width="80" height="90"/></g>
        <!-- inner nodes (new on expand) -->
        <g data-node-id="Validate" class="node"><rect x="220" y="30" width="50" height="18"/></g>
        <g data-node-id="Build" class="node"><rect x="290" y="30" width="50" height="18"/></g>

        <!-- two curve paths; first connects left pair, second connects inner pair -->
        <path d="M 40 50 C 55 50 70 50 80 50"/>
        <path d="M 245 40 C 260 35 275 35 290 40"/>
      </svg>
    `.trim();

		// Pass a *reversed* keys array on purpose. With the old index logic this would have wired wrongly.
		// With proximity it must still produce correct endpoint-based keys.
		const badOrderKeys = ["Validate--Build", "User--Catalog"];
		const tagged = postProcessAndTag(sampleSvg, {
			labelToId: {},
			edgeKeys: badOrderKeys,
		});

		const paths = Array.from(tagged.querySelectorAll("path"));
		const ids = paths.map((p) => p.getAttribute("data-edge-id"));

		// The leftish path (User-Catalog) and rightish path (Validate-Build) must be correctly identified by nearness
		expect(ids).toContain("User--Catalog");
		expect(ids).toContain("Validate--Build");
		// And not the crossed ones
		expect(ids).not.toContain("User--Validate");
	});
});
