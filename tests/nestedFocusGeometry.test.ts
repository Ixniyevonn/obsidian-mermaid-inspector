import { describe, expect, it } from "bun:test";
import { edgeEndpointsInsideRect } from "../src/diagram/focus";
import { screenRectToLocalBounds } from "../src/diagram/transition";

describe("nested focus edge geometry", () => {
	const focused = { left: 100, top: 100, right: 500, bottom: 400 };

	it("keeps an edge whose rendered endpoints are both inside the focus", () => {
		expect(
			edgeEndpointsInsideRect({ x: 150, y: 180 }, { x: 420, y: 330 }, focused),
		).toBe(true);
	});

	it("fades an edge crossing from the parent scope to the outside", () => {
		expect(
			edgeEndpointsInsideRect({ x: 80, y: 180 }, { x: 550, y: 330 }, focused),
		).toBe(false);
	});
});

describe("collapsed proxy to expanded cluster morph", () => {
	it("converts the old screen rectangle into the new outline coordinates", () => {
		expect(
			screenRectToLocalBounds(
				{ left: 120, top: 80, width: 200, height: 100 },
				{ a: 2, b: 0, c: 0, d: 2, e: 20, f: 10 },
			),
		).toEqual({ x: 50, y: 35, width: 100, height: 50 });
	});
});
