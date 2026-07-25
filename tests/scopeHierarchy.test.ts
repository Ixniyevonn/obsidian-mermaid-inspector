import { describe, expect, it } from "bun:test";
import { getViewSourceWithMeta, type ScopeInfo } from "../src/diagram/model";
import { changeFocus, collapseScope } from "../src/diagram/navigation";
import { ORDER_FLOW_SOURCE } from "./fixtures/orderFlow";

const scopes: ScopeInfo[] = [
	{ id: "Outer", label: "Outer", parentId: null, depth: 0 },
	{ id: "Inner", label: "Inner", parentId: "Outer", depth: 1 },
	{ id: "Deep", label: "Deep", parentId: "Inner", depth: 2 },
];

describe("hierarchical subgraph visibility", () => {
	it("does not emit a child subgraph while its parent is collapsed", () => {
		const { source } = getViewSourceWithMeta(new Set(), ORDER_FLOW_SOURCE);
		expect(source).toContain("Outer(Order Processing)");
		expect(source).not.toContain("subgraph Inner");
	});

	it("ignores stale child expansion when its parent is collapsed", () => {
		const { source } = getViewSourceWithMeta(
			new Set(["Inner"]),
			ORDER_FLOW_SOURCE,
		);
		expect(source).not.toContain("subgraph Inner");
		expect(source).not.toContain("Enter");
	});
});

describe("recursive scope collapse", () => {
	it("collapses all descendants and removes focus from the collapsed branch", () => {
		const result = collapseScope(
			{
				expanded: new Set(["Outer", "Inner", "Deep"]),
				focusPath: ["Outer", "Inner", "Deep"],
			},
			scopes,
			"Outer",
		);
		expect([...result.expanded]).toEqual([]);
		expect(result.focusPath).toEqual([]);
	});

	it("moves focus to the parent when the focused scope collapses", () => {
		const result = collapseScope(
			{
				expanded: new Set(["Outer", "Inner", "Deep"]),
				focusPath: ["Outer", "Inner"],
			},
			scopes,
			"Inner",
		);
		expect([...result.expanded]).toEqual(["Outer"]);
		expect(result.focusPath).toEqual(["Outer"]);
	});
});
describe("focus navigation", () => {
	it("keeps deeply nested children expanded when focus moves to a parent", () => {
		const result = changeFocus(
			{
				expanded: new Set(["Outer", "Inner", "Deep"]),
				focusPath: ["Outer", "Inner", "Deep"],
			},
			["Outer"],
		);
		expect([...result.expanded]).toEqual(["Outer", "Inner", "Deep"]);
		expect(result.focusPath).toEqual(["Outer"]);
	});

	it("keeps expanded scopes when focus returns to the whole diagram", () => {
		const result = changeFocus(
			{
				expanded: new Set(["Outer", "Inner"]),
				focusPath: ["Outer", "Inner"],
			},
			[],
		);
		expect([...result.expanded]).toEqual(["Outer", "Inner"]);
		expect(result.focusPath).toEqual([]);
	});
});
