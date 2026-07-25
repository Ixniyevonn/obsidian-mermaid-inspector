import { describe, expect, it } from "bun:test";
import {
	centerDelta,
	runCancelableTransition,
	screenDeltaToLocal,
} from "../src/diagram/transition";

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
describe("cancelable SVG transitions", () => {
	it("resolves immediately without applying another frame after cancellation", async () => {
		const controller = new AbortController();
		const frames: number[] = [];
		const canceled: number[] = [];
		let scheduled: FrameRequestCallback | undefined;
		const transition = runCancelableTransition(
			320,
			controller.signal,
			(progress) => frames.push(progress),
			{
				now: () => 100,
				requestFrame: (callback) => {
					scheduled = callback;
					return 7;
				},
				cancelFrame: (handle) => canceled.push(handle),
			},
		);
		expect(scheduled).toBeDefined();
		controller.abort();
		expect(await transition).toBe(false);
		expect(canceled).toEqual([7]);
		scheduled?.(200);
		expect(frames).toEqual([]);
	});

	it("reports completion when the final frame is reached", async () => {
		const controller = new AbortController();
		const frames: number[] = [];
		let scheduled: FrameRequestCallback | undefined;
		const transition = runCancelableTransition(
			200,
			controller.signal,
			(progress) => frames.push(progress),
			{
				now: () => 100,
				requestFrame: (callback) => {
					scheduled = callback;
					return 1;
				},
				cancelFrame: () => {},
			},
		);
		scheduled?.(300);
		expect(await transition).toBe(true);
		expect(frames).toEqual([1]);
	});

	it("clamps a stale queued frame timestamp instead of extrapolating negative sizes", async () => {
		const controller = new AbortController();
		const frames: number[] = [];
		let scheduled: FrameRequestCallback | undefined;
		const transition = runCancelableTransition(
			200,
			controller.signal,
			(progress) => frames.push(progress),
			{
				now: () => 100,
				requestFrame: (callback) => {
					scheduled = callback;
					return 1;
				},
				cancelFrame: () => {},
			},
		);
		scheduled?.(90);
		expect(frames).toEqual([0]);
		scheduled?.(300);
		expect(await transition).toBe(true);
		expect(frames).toEqual([0, 1]);
	});
});
