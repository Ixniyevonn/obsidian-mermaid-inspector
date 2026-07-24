import { describe, expect, it } from "bun:test";
import { centerDelta, screenDeltaToLocal } from "../src/utils/svgAnimation";

describe("SVG FLIP coordinate conversion", () => {
	it("converts screen movement through the parent scale", () => {
		expect(screenDeltaToLocal(120, 60, { a: 2, b: 0, c: 0, d: 2 })).toEqual({
			x: 60,
			y: 30,
		});
	});

	it("handles a rotated parent transform", () => {
		const local = screenDeltaToLocal(0, 10, {
			a: 0,
			b: 1,
			c: -1,
			d: 0,
		});
		expect(local.x).toBe(10);
		expect(local.y).toBeCloseTo(0);
	});

	it("uses element centers rather than top-left corners", () => {
		expect(
			centerDelta(
				{ left: 10, top: 20, width: 100, height: 40 },
				{ left: 30, top: 50, width: 60, height: 20 },
			),
		).toEqual({ x: 0, y: -20 });
	});
});
