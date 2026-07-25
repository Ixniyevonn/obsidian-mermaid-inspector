import { describe, expect, it } from "bun:test";
import {
	isOnlyMermaidEmbed,
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

	it("recognizes a section containing only one embed", () => {
		expect(isOnlyMermaidEmbed("  ![[Flow.mmd|Flow]]  ")).toBe(true);
		expect(isOnlyMermaidEmbed("Before\n![[Flow.mmd]]")).toBe(false);
	});
});
