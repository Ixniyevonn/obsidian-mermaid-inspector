import { describe, expect, it } from "bun:test";
import {
	isOnlyMermaidEmbed,
	mermaidEmbedMatches,
	mermaidEmbedLinks,
} from "../src/utils/markdownEmbed";

describe("Markdown Mermaid embeds", () => {
	it("extracts embeds with aliases and subpaths", () => {
		expect(
			mermaidEmbedLinks(
				"![[Diagrams/Flow.mmd]]\n![[Other.mmd#Section|Diagram]]",
			),
		).toEqual(["Diagrams/Flow.mmd", "Other.mmd"]);
	});

	it("does not treat an ordinary wiki link as an embed", () => {
		expect(mermaidEmbedLinks("[[Diagrams/Flow.mmd]]")).toEqual([]);
	});

	it("returns exact editor ranges for Live Preview replacements", () => {
		const markdown = "Before\n![[Flow.mmd|Diagram]]\nAfter";
		expect(mermaidEmbedMatches(markdown)).toEqual([
			{ from: 7, to: 28, linktext: "Flow.mmd" },
		]);
	});

	it("recognizes a section containing only one embed", () => {
		expect(isOnlyMermaidEmbed("  ![[Flow.mmd|Flow]]  ")).toBe(true);
		expect(isOnlyMermaidEmbed("Before\n![[Flow.mmd]]")).toBe(false);
	});
});
