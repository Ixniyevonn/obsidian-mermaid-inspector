import { describe, expect, it } from "bun:test";
import { fitCamera, interpolateCamera } from "../src/diagram/camera";

describe("diagram camera", () => {
	it("centers and fits bounds with viewport padding", () => {
		expect(
			fitCamera(
				{ width: 1000, height: 700 },
				{ x: 100, y: 50, width: 800, height: 500 },
			),
		).toEqual({
			zoom: 1.19,
			panX: -95,
			panY: -7,
		});
	});

	it("eases smoothly between the current and fitted camera", () => {
		const from = { panX: 0, panY: 0, zoom: 1 };
		const to = { panX: 100, panY: -50, zoom: 0.5 };
		const middle = interpolateCamera(from, to, 0.5);
		expect(middle.panX).toBeGreaterThan(50);
		expect(middle.panX).toBeLessThan(100);
		expect(middle.panY).toBeLessThan(-25);
		expect(middle.zoom).toBeGreaterThan(0.5);
		expect(interpolateCamera(from, to, 1)).toEqual(to);
	});

	it("returns the default camera when no diagram bounds exist", () => {
		expect(fitCamera({ width: 800, height: 600 })).toEqual({
			panX: 0,
			panY: 0,
			zoom: 1,
		});
	});
});
