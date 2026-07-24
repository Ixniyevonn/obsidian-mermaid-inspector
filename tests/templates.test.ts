import { describe, expect, it } from "bun:test";
import { Flowchart } from "mermaid-ast";
import { availableFileName, MERMAID_TEMPLATES } from "../src/templates";

describe("Mermaid templates", () => {
	it("has unique ids and filenames", () => {
		expect(new Set(MERMAID_TEMPLATES.map((item) => item.id)).size).toBe(
			MERMAID_TEMPLATES.length,
		);
		expect(new Set(MERMAID_TEMPLATES.map((item) => item.fileName)).size).toBe(
			MERMAID_TEMPLATES.length,
		);
	});

	for (const template of MERMAID_TEMPLATES) {
		it(`${template.name} has the expected parse result`, () => {
			const parse = () => Flowchart.parse(template.source);
			if (template.expectValid) expect(parse).not.toThrow();
			else expect(parse).toThrow();
		});
	}
});

describe("availableFileName", () => {
	it("keeps an unused filename", () => {
		expect(availableFileName("Nested.mmd", () => false)).toBe("Nested.mmd");
	});

	it("adds the first available numeric suffix", () => {
		const used = new Set(["Nested.mmd", "Nested 1.mmd", "Nested 2.mmd"]);
		expect(availableFileName("Nested.mmd", (name) => used.has(name))).toBe(
			"Nested 3.mmd",
		);
	});
});
