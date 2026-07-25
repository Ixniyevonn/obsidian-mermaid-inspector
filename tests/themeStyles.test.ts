import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

const styles = readFileSync("styles.css", "utf8");

describe("theme-safe Mermaid styles", () => {
	it("overrides generated SVG, node, and edge-label colors with Obsidian tokens", () => {
		expect(styles).toContain(".mi-diagram-host svg");
		expect(styles).toContain(".edgeLabel rect");
		expect(styles).toContain("foreignObject");
		expect(styles).toContain("var(--text-normal, #1f2328)");
		expect(styles).toContain("var(--background-primary, #ffffff)");
	});
});
