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

	it("places each arrow label in the same focus layer as its rendered edge", () => {
		const dom = new JSDOM(
			`<svg xmlns="http://www.w3.org/2000/svg">
				<g data-cluster-id="Outer"><rect/></g>
				<g class="edgePaths">
					<path data-edge-id="OuterNode--InnerNode"/>
					<path data-edge-id="TopNode--OuterNode"/>
				</g>
				<g class="edgeLabels">
					<g class="edgeLabel" data-label="inside"><text>inside</text></g>
					<g class="edgeLabel" data-label="outside"><text>outside</text></g>
				</g>
			</svg>`,
			{ contentType: "image/svg+xml" },
		);
		const previousDocument = globalThis.document;
		globalThis.document = dom.window.document;
		try {
			const svg = dom.window.document
				.documentElement as unknown as SVGSVGElement;
			const cluster = svg.querySelector(
				'[data-cluster-id="Outer"]',
			) as SVGGraphicsElement;
			cluster.getBoundingClientRect = () =>
				({ left: 0, top: 0, right: 100, bottom: 100 }) as DOMRect;
			const edgePaths = Array.from(svg.querySelectorAll("path"));
			for (const [index, path] of edgePaths.entries()) {
				const start = index === 0 ? 10 : 150;
				path.getTotalLength = () => 100;
				path.getPointAtLength = (length) =>
					({ x: start + length * 0.8, y: 50 }) as DOMPoint;
				path.getScreenCTM = () =>
					({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) as DOMMatrix;
			}
			const labels = Array.from(
				svg.querySelectorAll<SVGGraphicsElement>(".edgeLabel"),
			);
			labels[0].getBoundingClientRect = () =>
				({ left: 45, top: 45, width: 10, height: 10 }) as DOMRect;
			labels[1].getBoundingClientRect = () =>
				({ left: 195, top: 45, width: 10, height: 10 }) as DOMRect;

			groupBackgroundElements(svg, "Outer", paths);

			expect(labels[0].closest("[data-mi-context-layer]")).toBeNull();
			expect(labels[1].closest("[data-mi-context-layer]")).not.toBeNull();
		} finally {
			globalThis.document = previousDocument;
		}
	});
});
