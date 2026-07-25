import { describe, expect, it } from "bun:test";
import {
	embeddedStateKey,
	normalizeInspectorState,
} from "../src/utils/inspectorState";

describe("embedded inspector state", () => {
	it("isolates the same diagram state by its host Markdown file", () => {
		expect(embeddedStateKey("Notes/A.md", "Diagrams/Flow.mmd")).not.toBe(
			embeddedStateKey("Notes/B.md", "Diagrams/Flow.mmd"),
		);
	});

	it("restores expansion, focus, and camera state safely", () => {
		expect(
			normalizeInspectorState({
				expanded: ["Outer", "Outer", "Inner"],
				focusPath: ["Outer", "Inner"],
				camera: { panX: 120, panY: -30, zoom: 50 },
			}),
		).toEqual({
			expanded: ["Outer", "Inner"],
			focusPath: ["Outer", "Inner"],
			camera: { panX: 120, panY: -30, zoom: 12 },
		});
	});

	it("falls back from corrupt persisted camera values", () => {
		expect(
			normalizeInspectorState({
				camera: {
					panX: Number.NaN,
					panY: Number.POSITIVE_INFINITY,
					zoom: -1,
				},
			}),
		).toEqual({
			expanded: [],
			focusPath: [],
			camera: { panX: 0, panY: 0, zoom: 0.15 },
		});
	});
});
