import { describe, expect, it } from "bun:test";

describe("Canvas inspector interaction isolation", () => {
	it("reserves a border drag zone and disables the Canvas content blocker", async () => {
		const styles = await Bun.file("styles.css").text();

		expect(styles).toContain("width: calc(100% - 16px)");
		expect(styles).toContain("height: calc(100% - 16px)");
		expect(styles).toContain("margin: 8px");
		expect(styles).toMatch(
			/\.canvas-node:has\(\.mermaid-inspector-canvas-node\)[\s\S]*?\.canvas-node-content-blocker\s*\{[\s\S]*?pointer-events:\s*none/,
		);
	});

	it("stops compact inspector input from bubbling to the Canvas node", async () => {
		const component = await Bun.file(
			"src/components/MermaidInspector.svelte",
		).text();

		expect(component).toContain("function isolatedButton(");
		expect(component).toContain("event.stopPropagation()");
		expect(component).not.toContain("use:isolateCanvasEvents");

		const renderer = await Bun.file(
			"src/obsidian/CanvasInlineRenderer.ts",
		).text();
		expect(renderer).toContain(
			'contentEl.addEventListener("click", stopNavigation)',
		);
		expect(renderer).toContain(
			'contentEl.removeEventListener("click", mount.stopNavigation)',
		);
		expect(renderer).toContain("node.setIsEditing(true)");
		expect(renderer).toContain("node.setIsEditing?.(false)");

		const canvas = await Bun.file("src/components/Canvas.svelte").text();
		expect(canvas).toContain("use:cameraInput");
		expect(canvas).toContain('addEventListener("click", blockNavigation)');
		expect(canvas).toContain("event.preventDefault()");
		for (const event of ["pointerdown", "pointermove", "pointerup", "wheel"]) {
			expect(canvas).toContain(`event.stopPropagation()`);
			expect(canvas).toContain(`addEventListener("${event}"`);
		}
	});
});
