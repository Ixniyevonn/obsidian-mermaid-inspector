import { describe, expect, it } from "bun:test";
import type { AllCanvasNodeData, CanvasData } from "obsidian/canvas";

const fixtureDirectory = "test-vault/Mermaid Inspector Tests";

async function readCanvas(name: string): Promise<CanvasData> {
	return JSON.parse(
		await Bun.file(`${fixtureDirectory}/${name}`).text(),
	) as CanvasData;
}

function mermaidFiles(canvas: CanvasData): string[] {
	return canvas.nodes
		.filter(
			(node): node is Extract<AllCanvasNodeData, { type: "file" }> =>
				node.type === "file" && node.file.toLowerCase().endsWith(".mmd"),
		)
		.map((node) => node.file);
}

describe("Obsidian Canvas Mermaid file-node fixtures", () => {
	it("contains a single .mmd file node", async () => {
		const canvas = await readCanvas("10 Single Mermaid file node.canvas");

		expect(mermaidFiles(canvas)).toEqual([
			"Mermaid Inspector Tests/01 Simple flowchart.mmd",
		]);
	});

	it("contains multiple independent .mmd file nodes in one Canvas", async () => {
		const canvas = await readCanvas("11 Multiple Mermaid file nodes.canvas");

		expect(mermaidFiles(canvas).sort()).toEqual([
			"Mermaid Inspector Tests/01 Simple flowchart.mmd",
			"Mermaid Inspector Tests/02 Nested subgraphs.mmd",
			"Mermaid Inspector Tests/03 Deep hierarchy.mmd",
		]);
		expect(new Set(canvas.nodes.map((node) => node.id)).size).toBe(
			canvas.nodes.length,
		);
	});

	it("keeps non-Mermaid nodes alongside a .mmd file node", async () => {
		const canvas = await readCanvas("12 Mixed Canvas nodes.canvas");

		expect(mermaidFiles(canvas)).toEqual([
			"Mermaid Inspector Tests/05 Labels and shapes.mmd",
		]);
		expect(canvas.nodes.some((node) => node.type === "text")).toBe(true);
		expect(
			canvas.nodes.some(
				(node) => node.type === "file" && node.file.endsWith(".md"),
			),
		).toBe(true);
	});
});
