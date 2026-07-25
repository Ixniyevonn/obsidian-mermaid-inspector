import { describe, expect, it } from "bun:test";
import { isBlankMermaidSource } from "../src/diagram/model";
import { MERMAID_THEME_VARIABLES } from "../src/diagram/render";

describe("Obsidian lifecycle regressions", () => {
	it("recognizes the temporary empty TextFileView buffer", () => {
		expect(isBlankMermaidSource("")).toBe(true);
		expect(isBlankMermaidSource(" \n\t")).toBe(true);
		expect(isBlankMermaidSource("flowchart LR\nA --> B")).toBe(false);
	});

	it("passes concrete colors to Mermaid's color parser", () => {
		for (const color of Object.values(MERMAID_THEME_VARIABLES)) {
			expect(color).toMatch(/^#[0-9a-f]{6}$/i);
			expect(color).not.toContain("var(");
		}
	});
});
