import { describe, expect, it } from "bun:test";
import { Flowchart } from "mermaid-ast";

const comprehensiveFixture =
	"test-vault/Mermaid Inspector Tests/08 Comprehensive edge cases.mmd";

describe("test-vault Mermaid fixtures", () => {
	it("parses the comprehensive multi-level edge-case diagram", async () => {
		const source = await Bun.file(comprehensiveFixture).text();
		const diagram = Flowchart.parse(source);

		expect(diagram.subgraphs.length).toBe(9);
		expect(diagram.nodes.length).toBeGreaterThanOrEqual(25);
		expect(diagram.links.length).toBeGreaterThanOrEqual(20);
		expect(diagram.subgraphs.some((scope) => scope.id === "DeepWorker")).toBe(
			true,
		);
		expect(diagram.subgraphs.some((scope) => scope.id === "Empty")).toBe(true);
	});
});
