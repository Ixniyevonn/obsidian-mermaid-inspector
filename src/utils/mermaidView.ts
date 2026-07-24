import { Flowchart, type FlowchartSubgraph } from "mermaid-ast";

export const FULL_MERMAID = `flowchart TB
  User["User"]
  Catalog["Catalog"]
  Promo["Promo"]
  subgraph Outer["Order Processing"]
    Validate["Validate Request"]
    Build["Build Order"]
    Review["Review Items"]
    Audit["Audit Log"]
    subgraph Inner["Payment Subsystem"]
      Enter["Enter Payment"]
      ValidateCard["Validate Card"]
      Fraud{"Fraud Check"}
      Auth["Authorize"]
      Capture["Capture Funds"]
      Receipt["Issue Receipt"]
    end
    Discounts["Apply Discounts"]
    Confirm["Confirm Order"]
    ShipPrep["Prepare Shipment"]
  end
  Notify["Notify Customer"]
  Inventory["Reserve Stock"]
  Analytics["Analytics"]
  Done["Done"]
  User --> Catalog
  Promo --> Catalog
  Catalog --> Validate
  User -.->|express| Validate
  Validate --> Build
  Build --> Review
  Review -->|toPayment| Inner
  Inner -->|paid| Discounts
  Discounts --> Confirm
  Confirm --> ShipPrep
  Review --> Audit
  Inner -->|paymentEvent| Audit
  ShipPrep --> Notify
  ShipPrep --> Inventory
  Inventory --> Analytics
  Notify --> Done
  Analytics --> Done
  Enter --> ValidateCard
  ValidateCard --> Fraud
  Fraud -->|ok| Auth
  Fraud -->|fraud| Receipt
  Auth --> Capture
  Capture --> Receipt
  Receipt -->|done| ShipPrep
  Enter -.->|retry| ValidateCard`;

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
	scopePathByElementId: Record<string, string[]>;
	scopes: ScopeInfo[];
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

export function getViewSource(
	expanded: Set<string>,
	fullSource = FULL_MERMAID,
): string {
	return getViewSourceWithMeta(expanded, fullSource).source;
}

export function getViewSourceWithMeta(
	expanded: Set<string>,
	fullSource = FULL_MERMAID,
): ViewSourceMeta {
	const diagram = Flowchart.parse(fullSource);
	const liveSubgraphs = diagram.subgraphs as FlowchartSubgraph[];
	const originalSubgraphs = liveSubgraphs.map((scope) => ({
		...scope,
		nodes: [...scope.nodes],
	}));
	const subgraphsById = new Map(
		originalSubgraphs.map((scope) => [scope.id, scope]),
	);
	const parent = new Map<string, string>();
	for (const scope of originalSubgraphs) {
		for (const memberId of scope.nodes) parent.set(memberId, scope.id);
	}

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
	const redirects: Array<[string, string]> = [];
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
			redirects.push([source, target]);
		}
	}
	for (const [source, target] of redirects) {
		const key = `${source}--${target}`;
		if (
			diagram.links.some((link) => `${link.source}--${link.target}` === key)
		) {
			continue;
		}
		diagram.addLink(source, target);
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
	const collapsedScopeIds = originalSubgraphs
		.filter(
			(scope) => isVisibleScope(scope.id) && !isEffectivelyExpanded(scope.id),
		)
		.map((scope) => scope.id);
	for (const id of collapsedScopeIds) {
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
		scopePathByElementId,
		scopes,
	};
}
