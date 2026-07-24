import { describe, expect, it } from "bun:test";
import { JSDOM } from "jsdom";
import {
	groupBackgroundElements,
	isInFocusedScope,
} from "../src/utils/focusContext";

const paths = {
	TopNode: [],
	Outer: [],
	OuterNode: ["Outer"],
	Inner: ["Outer"],
	InnerNode: ["Outer", "Inner"],
};

describe("focused-scope context", () => {
	it("classifies both nodes and subgraphs by scope ancestry", () => {
		expect(isInFocusedScope("Outer", "Outer", paths)).toBe(true);
		expect(isInFocusedScope("OuterNode", "Outer", paths)).toBe(true);
		expect(isInFocusedScope("InnerNode", "Outer", paths)).toBe(true);
		expect(isInFocusedScope("TopNode", "Outer", paths)).toBe(false);
	});

	it("places background nodes in a shared group", () => {
		const dom = new JSDOM(
			'<svg><g class="nodes"><g data-node-id="TopNode"/><g data-node-id="OuterNode"/></g></svg>',
			{ contentType: "image/svg+xml" },
		);
		const previousDocument = globalThis.document;
		globalThis.document = dom.window.document;
		try {
			const svg = dom.window.document
				.documentElement as unknown as SVGSVGElement;
			groupBackgroundElements(svg, "Outer", paths);
			const layer = svg.querySelector("[data-mi-context-layer]");
			expect(layer?.querySelector('[data-node-id="TopNode"]')).not.toBeNull();
			expect(layer?.querySelector('[data-node-id="OuterNode"]')).toBeNull();
		} finally {
			globalThis.document = previousDocument;
		}
	});
});
