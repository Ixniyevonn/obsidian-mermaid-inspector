import { describe, expect, it } from "bun:test";
import { openDiagramFile } from "../src/obsidian/openDiagramFile";

describe("open embedded diagram", () => {
	it("opens the source file in a new tab", async () => {
		const file = { path: "Diagrams/Example.mmd" };
		const opened: unknown[] = [];
		const requestedModes: string[] = [];
		await openDiagramFile(
			{
				getLeaf(mode) {
					requestedModes.push(mode);
					return {
						async openFile(target) {
							opened.push(target);
						},
					};
				},
			},
			file,
		);
		expect(requestedModes).toEqual(["tab"]);
		expect(opened).toEqual([file]);
	});
});
