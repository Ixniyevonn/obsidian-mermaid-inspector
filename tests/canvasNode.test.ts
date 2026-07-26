import { describe, expect, it } from "bun:test";
import {
	hasConnectedCanvasContent,
	isMermaidCanvasFile,
} from "../src/obsidian/canvasNode";

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

	it("rejects Canvas nodes before their content element is initialized", () => {
		expect(hasConnectedCanvasContent()).toBe(false);
		expect(hasConnectedCanvasContent({ isConnected: false })).toBe(false);
		expect(hasConnectedCanvasContent({ isConnected: true })).toBe(true);
	});
});
