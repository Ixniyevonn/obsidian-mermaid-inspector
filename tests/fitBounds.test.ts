import { describe, expect, it } from "bun:test";
import { JSDOM } from "jsdom";
import { focusedFitBounds } from "../src/diagram/fitBounds";

function diagram(): SVGSVGElement {
	const document = new JSDOM(`
		<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 700">
			<g data-cluster-id="Outer"><rect x="100" y="80" width="420" height="300"/></g>
			<g data-cluster-id="Other"><rect x="600" y="50" width="300" height="500"/></g>
		</svg>
	`).window.document;
	return document.querySelector("svg") as unknown as SVGSVGElement;
}

describe("focused Fit bounds", () => {
	it("uses the focused subgraph outline", () => {
		expect(focusedFitBounds(diagram(), "Outer")).toEqual({
			x: 100,
			y: 80,
			width: 420,
			height: 300,
		});
	});

	it("falls back to the full diagram when nothing is focused", () => {
		const svg = diagram();
		Object.defineProperty(svg, "viewBox", {
			value: { baseVal: { x: 0, y: 0, width: 1000, height: 700 } },
		});
		expect(focusedFitBounds(svg)).toEqual({
			x: 0,
			y: 0,
			width: 1000,
			height: 700,
		});
	});
});
