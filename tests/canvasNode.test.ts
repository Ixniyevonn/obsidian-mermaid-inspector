import { describe, expect, it } from "bun:test";
import { isMermaidCanvasFile } from "../src/obsidian/canvasNode";

describe("Canvas file-node selection", () => {
	it("selects .mmd files case-insensitively", () => {
		expect(isMermaidCanvasFile({ extension: "mmd" })).toBe(true);
		expect(isMermaidCanvasFile({ extension: "MMD" })).toBe(true);
	});

	it("leaves other file and text nodes unchanged", () => {
		expect(isMermaidCanvasFile({ extension: "md" })).toBe(false);
		expect(isMermaidCanvasFile({ extension: "png" })).toBe(false);
		expect(isMermaidCanvasFile()).toBe(false);
	});
});
