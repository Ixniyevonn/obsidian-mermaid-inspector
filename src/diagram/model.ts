import { Flowchart, type FlowchartSubgraph } from "mermaid-ast";

export function isBlankMermaidSource(source: string): boolean {
	return source.trim().length === 0;
}

export interface ScopeInfo {
	id: string;
	label: string;
	parentId: string | null;
	depth: number;
}

export interface ViewSourceMeta {
	source: string;
	edgeKeys: string[];
	labelToId: Record<string, string>;
	collapsedScopeIds: string[];
	emptyScopeIds: string[];
	scopePathByElementId: Record<string, string[]>;
	scopes: ScopeInfo[];
}

function passthroughMeta(source: string): ViewSourceMeta {
	return {
		source,
		edgeKeys: [],
		labelToId: {},
		collapsedScopeIds: [],
		emptyScopeIds: [],
		scopePathByElementId: {},
		scopes: [],
	};
}
function sourceForHierarchyParser(source: string): string {
	return source.replace(/^[\t ]*%%(?!\{)[^\r\n]*(\r?\n|$)/gm, "$1");
}
function labelOf(value: unknown, fallback: string): string {
	if (typeof value === "string" && value.trim())
		return value.replace(/^["']|["']$/g, "");
	if (value && typeof value === "object") {
		const candidate =
			(value as { text?: unknown; label?: unknown }).text ??
			(value as { label?: unknown }).label;
		if (typeof candidate === "string" && candidate.trim()) return candidate;
	}
	return fallback;
}

function directParentByElement(
	subgraphs: Array<{ id: string; nodes: string[] }>,
): Map<string, string> {
	const subgraphIds = new Set(subgraphs.map((scope) => scope.id));
	const containingScopes = new Map<string, string[]>();
	for (const scope of subgraphs) {
		for (const memberId of scope.nodes) {
			const containers = containingScopes.get(memberId) ?? [];
			containers.push(scope.id);
			containingScopes.set(memberId, containers);
		}
	}

	const scopeParent = new Map<string, string>();
	for (const scope of subgraphs) {
		const candidates = containingScopes.get(scope.id) ?? [];
		const direct = candidates.find(
			(candidate) =>
				!candidates.some(
					(other) =>
						other !== candidate &&
						containingScopes.get(candidate)?.includes(other),
				),
		);
		if (direct) scopeParent.set(scope.id, direct);
	}

	const depthOfScope = (id: string): number => {
		let depth = 0;
		let cursor = id;
		const seen = new Set<string>();
		while (scopeParent.has(cursor) && !seen.has(cursor)) {
			seen.add(cursor);
			const parentId = scopeParent.get(cursor);
			if (!parentId) break;
			cursor = parentId;
			depth += 1;
		}
		return depth;
	};

	const parent = new Map(scopeParent);
	for (const [memberId, candidates] of containingScopes) {
		if (subgraphIds.has(memberId)) continue;
		let direct: string | undefined;
		for (const candidate of candidates) {
			if (
				direct === undefined ||
				depthOfScope(candidate) > depthOfScope(direct)
			) {
				direct = candidate;
			}
		}
		if (direct) parent.set(memberId, direct);
	}
	return parent;
}
export function getViewSource(
	expanded: Set<string>,
	fullSource: string,
): string {
	return getViewSourceWithMeta(expanded, fullSource).source;
}

export function getViewSourceWithMeta(
	expanded: Set<string>,
	fullSource: string,
): ViewSourceMeta {
	let diagram: Flowchart;
	try {
		diagram = Flowchart.parse(sourceForHierarchyParser(fullSource));
	} catch {
		// Mermaid is the rendering authority. mermaid-ast powers the optional
		// hierarchy controls, but it can lag behind Mermaid's evolving syntax.
		// Preserve the original source so supported diagrams still render.
		return passthroughMeta(fullSource);
	}
	const liveSubgraphs = diagram.subgraphs as FlowchartSubgraph[];
	if (liveSubgraphs.length === 0) return passthroughMeta(fullSource);
	const originalSubgraphs = liveSubgraphs.map((scope) => ({
		...scope,
		nodes: [...scope.nodes],
	}));
	const subgraphsById = new Map(
		originalSubgraphs.map((scope) => [scope.id, scope]),
	);
	const emptyScopeIdSet = new Set(
		originalSubgraphs
			.filter((scope) => scope.nodes.length === 0)
			.map((scope) => scope.id),
	);
	const parent = directParentByElement(originalSubgraphs);

	const isEffectivelyExpanded = (id: string): boolean => {
		if (!expanded.has(id)) return false;
		let cursor = id;
		while (parent.has(cursor)) {
			const parentId = parent.get(cursor);
			if (!parentId || !expanded.has(parentId)) return false;
			cursor = parentId;
		}
		return true;
	};
	const isVisibleScope = (id: string): boolean => {
		let cursor = id;
		while (parent.has(cursor)) {
			const parentId = parent.get(cursor);
			if (!parentId || !isEffectivelyExpanded(parentId)) return false;
			cursor = parentId;
		}
		return true;
	};
	const proxy = (id: string): string => {
		let current = id;
		let visible = id;
		const visited = new Set<string>();
		while (parent.has(current) && !visited.has(current)) {
			visited.add(current);
			const parentId = parent.get(current);
			if (!parentId) break;
			if (!isEffectivelyExpanded(parentId)) visible = parentId;
			current = parentId;
		}
		return visible;
	};

	const edgeKeys: string[] = [];
	const redirected = new Set<string>();
	const redirects: Array<{
		source: string;
		target: string;
		link: (typeof diagram.links)[number];
	}> = [];
	for (const link of [...diagram.links]) {
		const source = proxy(link.source);
		const target = proxy(link.target);
		if (source === target) continue;
		const key = `${source}--${target}`;
		if (!redirected.has(key)) {
			redirected.add(key);
			edgeKeys.push(key);
		}
		if (source !== link.source || target !== link.target) {
			redirects.push({ source, target, link });
		}
	}
	for (const { source, target, link } of redirects) {
		const key = `${source}--${target}`;
		if (
			diagram.links.some((link) => `${link.source}--${link.target}` === key)
		) {
			continue;
		}
		diagram.addLink(source, target, {
			text: link.text?.text,
			type: link.type,
			stroke: link.stroke,
			length: link.length,
		});
	}

	for (const scope of originalSubgraphs) {
		if (isEffectivelyExpanded(scope.id)) continue;
		for (const memberId of scope.nodes) {
			if (!subgraphsById.has(memberId) && diagram.hasNode(memberId)) {
				diagram.removeNode(memberId, { reconnect: false });
			}
		}
	}
	for (const scope of originalSubgraphs) {
		if (!isVisibleScope(scope.id) && diagram.hasNode(scope.id)) {
			diagram.removeNode(scope.id, { reconnect: false });
		}
	}
	const visibleProxyScopeIds = originalSubgraphs
		.filter(
			(scope) => isVisibleScope(scope.id) && !isEffectivelyExpanded(scope.id),
		)
		.map((scope) => scope.id);
	const emptyScopeIds = visibleProxyScopeIds.filter((id) =>
		emptyScopeIdSet.has(id),
	);
	const collapsedScopeIds = visibleProxyScopeIds.filter(
		(id) => !emptyScopeIdSet.has(id),
	);
	for (const id of visibleProxyScopeIds) {
		const scope = subgraphsById.get(id);
		if (!scope) continue;
		const label = labelOf(scope.title, scope.id);
		if (diagram.hasNode(id)) diagram.setNodeText(id, label);
		else diagram.addNode(id, label, { shape: "round" });
	}
	const liveById = new Map(liveSubgraphs.map((scope) => [scope.id, scope]));
	for (const scope of originalSubgraphs) {
		const live = liveById.get(scope.id);
		if (live) live.nodes = [...scope.nodes];
	}
	diagram.toAST().subgraphs = liveSubgraphs.filter(
		(scope) => isVisibleScope(scope.id) && isEffectivelyExpanded(scope.id),
	);

	const scopePathByElementId: Record<string, string[]> = {};
	for (const id of [
		...diagram.toAST().nodes.keys(),
		...originalSubgraphs.map((scope) => scope.id),
	]) {
		const path: string[] = [];
		let cursor = id;
		const seen = new Set<string>();
		while (parent.has(cursor) && !seen.has(cursor)) {
			seen.add(cursor);
			const parentId = parent.get(cursor);
			if (!parentId) break;
			path.unshift(parentId);
			cursor = parentId;
		}
		scopePathByElementId[id] = path;
	}
	const labelToId: Record<string, string> = {};
	for (const node of diagram.nodes) {
		labelToId[labelOf(node.text, node.id)] = node.id;
	}
	for (const scope of originalSubgraphs) {
		labelToId[labelOf(scope.title, scope.id)] = scope.id;
	}
	const scopes: ScopeInfo[] = originalSubgraphs.map((scope) => {
		let depth = 0;
		let cursor = scope.id;
		const seen = new Set<string>();
		while (parent.has(cursor) && !seen.has(cursor)) {
			seen.add(cursor);
			const parentId = parent.get(cursor);
			if (!parentId) break;
			cursor = parentId;
			depth += 1;
		}
		return {
			id: scope.id,
			label: labelOf(scope.title, scope.id),
			parentId: parent.get(scope.id) ?? null,
			depth,
		};
	});
	return {
		source: diagram.render(),
		edgeKeys,
		labelToId,
		collapsedScopeIds,
		emptyScopeIds,
		scopePathByElementId,
		scopes,
	};
}
