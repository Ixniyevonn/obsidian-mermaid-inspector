import { describe, expect, it } from "bun:test";
import type { CanvasData } from "obsidian/canvas";

const vaultRoot = "test-vault";
const fixtureDirectory = `${vaultRoot}/Mermaid Inspector Tests`;
const canvasFixtures = [
	"10 Single Mermaid file node.canvas",
	"11 Multiple Mermaid file nodes.canvas",
	"12 Mixed Canvas nodes.canvas",
];

describe("Canvas fixture file resolution", () => {
	for (const fixture of canvasFixtures) {
		it(`resolves every file node in ${fixture} from the vault root`, async () => {
			const canvas = JSON.parse(
				await Bun.file(`${fixtureDirectory}/${fixture}`).text(),
			) as CanvasData;
			const filePaths = canvas.nodes
				.filter((node) => node.type === "file")
				.map((node) => node.file);

			expect(filePaths.length).toBeGreaterThan(0);
			for (const filePath of filePaths) {
				expect(await Bun.file(`${vaultRoot}/${filePath}`).exists()).toBe(true);
			}
		});
	}
});
