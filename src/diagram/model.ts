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

function modernNodeDeclarations(source: string): Map<string, string> {
	const declarations = new Map<string, string>();
	for (
		let at = source.indexOf("@{");
		at >= 0;
		at = source.indexOf("@{", at + 2)
	) {
		let idEnd = at;
		while (idEnd > 0 && /\s/.test(source[idEnd - 1] ?? "")) idEnd -= 1;
		let idStart = idEnd;
		while (idStart > 0 && /[\w-]/u.test(source[idStart - 1] ?? ""))
			idStart -= 1;
		const id = source.slice(idStart, idEnd);
		if (!/^[A-Za-z_][\w-]*$/u.test(id)) continue;

		let quote: '"' | "'" | null = null;
		let escaped = false;
		let depth = 0;
		let end = at;
		for (; end < source.length; end += 1) {
			const char = source[end];
			if (escaped) {
				escaped = false;
				continue;
			}
			if (char === "\\" && quote) {
				escaped = true;
				continue;
			}
			if (quote) {
				if (char === quote) quote = null;
				continue;
			}
			if (char === '"' || char === "'") {
				quote = char;
				continue;
			}
			if (char === "{") depth += 1;
			if (char === "}") {
				depth -= 1;
				if (depth === 0) break;
			}
		}
		if (depth === 0 && end < source.length) {
			declarations.set(id, source.slice(at, end + 1));
			at = end;
		}
	}
	return declarations;
}

function restoreModernNodeDeclarations(
	source: string,
	declarations: Map<string, string>,
): string {
	const lines = source.split(/\r?\n/);
	const directive =
		/^(?:subgraph|classDef|class|style|linkStyle|click|direction)\b/;
	for (const [id, declaration] of declarations) {
		const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, (char) => `\\${char}`);
		const reference = new RegExp(`(^|[^\\w-])(${escapedId})(?![\\w-])`);
		for (let index = 0; index < lines.length; index += 1) {
			const trimmed = lines[index]?.trimStart() ?? "";
			if (directive.test(trimmed)) continue;
			if (!reference.test(lines[index] ?? "")) continue;
			lines[index] = (lines[index] ?? "").replace(
				reference,
				`$1$2${declaration}`,
			);
			break;
		}
	}
	return lines.join("\n");
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

interface RenderedSubgraphBlock {
	id: string;
	lines: string[];
}

function nestRenderedSubgraphs(
	source: string,
	scopeIds: Set<string>,
	parent: Map<string, string>,
): string {
	const lines = source.split(/\r?\n/);
	const blocks = new Map<string, RenderedSubgraphBlock>();
	const rootParts: Array<string | RenderedSubgraphBlock> = [];

	for (let index = 0; index < lines.length; ) {
		const trimmed = lines[index]?.trim() ?? "";
		const id = [...scopeIds].find((candidate) => {
			const prefix = `subgraph ${candidate}`;
			if (!trimmed.startsWith(prefix)) return false;
			const next = trimmed[prefix.length];
			return next === undefined || next === "[";
		});
		if (!id) {
			rootParts.push(lines[index] ?? "");
			index += 1;
			continue;
		}

		let depth = 0;
		let end = index;
		for (; end < lines.length; end += 1) {
			const line = lines[end]?.trim() ?? "";
			if (line.startsWith("subgraph ")) depth += 1;
			if (line === "end") {
				depth -= 1;
				if (depth === 0) break;
			}
		}
		if (end >= lines.length) return source;

		const block = { id, lines: lines.slice(index, end + 1) };
		blocks.set(id, block);
		rootParts.push(block);
		index = end + 1;
	}

	const children = new Map<string, string[]>();
	for (const id of scopeIds) {
		const parentId = parent.get(id);
		if (!parentId || !scopeIds.has(parentId)) continue;
		const ids = children.get(parentId) ?? [];
		ids.push(id);
		children.set(parentId, ids);
	}

	const emit = (block: RenderedSubgraphBlock, indent: string): string[] => {
		const header = block.lines[0]?.trim() ?? "";
		const body = block.lines
			.slice(1, -1)
			.map((line) => `${indent}    ${line.trimStart()}`);
		for (const childId of children.get(block.id) ?? []) {
			const child = blocks.get(childId);
			if (child) body.push(...emit(child, `${indent}    `));
		}
		return [`${indent}${header}`, ...body, `${indent}end`];
	};

	const nestedIds = new Set(
		[...blocks.keys()].filter((id) => {
			const parentId = parent.get(id);
			return parentId !== undefined && blocks.has(parentId);
		}),
	);
	const output: string[] = [];
	for (const part of rootParts) {
		if (typeof part === "string") output.push(part);
		else if (!nestedIds.has(part.id)) output.push(...emit(part, "    "));
	}
	return output.join("\n");
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
	const renderedSource = restoreModernNodeDeclarations(
		nestRenderedSubgraphs(
			diagram.render(),
			new Set(
				originalSubgraphs
					.filter(
						(scope) =>
							isVisibleScope(scope.id) && isEffectivelyExpanded(scope.id),
					)
					.map((scope) => scope.id),
			),
			parent,
		),
		new Map(
			[...modernNodeDeclarations(fullSource)].filter(([id]) =>
				diagram.hasNode(id),
			),
		),
	);
	return {
		source: renderedSource,
		edgeKeys,
		labelToId,
		collapsedScopeIds,
		emptyScopeIds,
		scopePathByElementId,
		scopes,
	};
}
