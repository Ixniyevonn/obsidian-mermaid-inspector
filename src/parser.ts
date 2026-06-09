import type { GraphModel, MEdge, MNode, Scope } from "./types";

/**
 * Minimal parser for Mermaid flowchart with nested subgraphs.
 * Supports only the syntax used by the demo diagram (no mermaid lib).
 * - flowchart TD/TB/LR/...
 * - Nodes: ID[Label], ID(Label), ID{Label}, ID
 * - Edges: A --> B, A -->|label| B, A --- B (treated as -->)
 * - subgraph ID [Label] ... end   (also supports subgraph ID "Label")
 * - Nested subgraphs via stack
 */

const SUBGRAPH_START_RE =
	/^subgraph\s+([A-Za-z0-9_]+)(?:\s+(?:\[([^\]]*)\]|"([^"]*)"|(.+)))?\s*$/i;

// Parse a "node reference" that may include shape syntax: ID , ID[lab] , ID(lab) , ID{lab}
// Returns the bare id and an optional label from inside the shape.
function parseNodeRef(token: string): { id: string; label?: string } {
	const t = token.trim();
	const m = t.match(/^([A-Za-z0-9_]+)(?:\s*(?:\[([^\]]*)\]|\(([^\)]*)\)|\{([^}]*)\}))?$/);
	if (m) {
		const id = m[1];
		const lab = cleanLabel(m[2] || m[3] || m[4]);
		return { id, label: lab || undefined };
	}
	// Fallback: treat whole as id
	const id = t.replace(/[^A-Za-z0-9_].*$/, "");
	return { id: id || t, label: undefined };
}

// Match an edge line that may contain shaped node refs on left and/or right.
// Examples: A[foo] --> B , C -->|lab| D[bar] , X --> Y[with space? but we keep simple]
const EDGE_LINE_RE =
	/^(.+?)\s*(-->|==>|-.->|---)\s*(?:\|([^|]+)\|)?\s*(.+?)\s*$/;

function cleanLabel(raw: string | undefined | null): string {
	if (!raw) return "";
	return raw.trim().replace(/^["']|["']$/g, "");
}

function ensureNode(
	nodes: Record<string, MNode>,
	id: string,
	label?: string,
) {
	if (!nodes[id]) {
		nodes[id] = { id, label: label && label.length ? label : id };
	} else if (label && label.length && nodes[id].label === id) {
		nodes[id].label = label;
	}
}

export function parseFlowchart(src: string): GraphModel {
	const lines = src.split(/\r?\n/);
	const nodes: Record<string, MNode> = {};
	const edges: MEdge[] = [];
	const scopes: Record<string, Scope> = {};
	const rootScopeIds: string[] = [];
	const looseNodeIds: string[] = [];

	const scopeStack: string[] = []; // scope ids, top is current

	let sawFlow = false;

	for (let raw of lines) {
		let line = raw.trim();
		if (!line) continue;
		if (line.startsWith("%%")) continue;
		if (line.startsWith("flowchart") || line.startsWith("graph")) {
			sawFlow = true;
			continue;
		}
		// direction line or other headers we ignore for this milestone

		// subgraph start
		const sg = line.match(SUBGRAPH_START_RE);
		if (sg) {
			const id = sg[1];
			let label = cleanLabel(sg[2] || sg[3] || sg[4]);
			if (!label) label = id;
			const parentId = scopeStack.length ? scopeStack[scopeStack.length - 1] : null;

			const scope: Scope = {
				id,
				label,
				nodeIds: [],
				subscopeIds: [],
				parentId,
			};
			scopes[id] = scope;

			if (parentId) {
				scopes[parentId].subscopeIds.push(id);
			} else {
				rootScopeIds.push(id);
			}
			scopeStack.push(id);
			continue;
		}

		if (/^end\s*$/i.test(line)) {
			if (scopeStack.length) scopeStack.pop();
			continue;
		}

		// edge line? (supports shaped refs inline like A[Task] --> B[Other])
		const em = line.match(EDGE_LINE_RE);
		if (em) {
			const left = em[1].trim();
			const rawLabel = em[3];
			const right = em[4].trim();
			const label = rawLabel ? cleanLabel(rawLabel) : undefined;

			const f = parseNodeRef(left);
			const t = parseNodeRef(right);

			// Do not create real nodes for scope ids (they are clusters)
			const createdF = !scopes[f.id] && !nodes[f.id];
			const createdT = !scopes[t.id] && !nodes[t.id];
			if (!scopes[f.id]) ensureNode(nodes, f.id, f.label);
			if (!scopes[t.id]) ensureNode(nodes, t.id, t.label);

			// If we are inside a subgraph, newly seen nodes via edges belong to it
			const curScope = scopeStack.length ? scopeStack[scopeStack.length - 1] : null;
			if (curScope) {
				if (!scopes[f.id] && !scopes[curScope].nodeIds.includes(f.id)) scopes[curScope].nodeIds.push(f.id);
				if (!scopes[t.id] && !scopes[curScope].nodeIds.includes(t.id)) scopes[curScope].nodeIds.push(t.id);
			} else {
				if (!scopes[f.id] && !looseNodeIds.includes(f.id)) looseNodeIds.push(f.id);
				if (!scopes[t.id] && !looseNodeIds.includes(t.id)) looseNodeIds.push(t.id);
			}

			edges.push({ from: f.id, to: t.id, label });
			continue;
		}

		// standalone node decl (or just id) at root or inside subgraph
		const nm = line.match(/^([A-Za-z0-9_]+)\s*(?:\[([^\]]*)\]|\(([^\)]*)\)|\{([^}]*)\})?\s*$/);
		if (nm) {
			const id = nm[1];
			const label = cleanLabel(nm[2] || nm[3] || nm[4]) || id;

			// scopes take precedence over nodes of same id
			if (scopes[id]) {
				// ignore, this id is a cluster
			} else {
				ensureNode(nodes, id, label);

				const cur = scopeStack.length ? scopeStack[scopeStack.length - 1] : null;
				if (cur) {
					if (!scopes[cur].nodeIds.includes(id)) scopes[cur].nodeIds.push(id);
				} else {
					if (!looseNodeIds.includes(id)) looseNodeIds.push(id);
				}
			}
			continue;
		}

		// ignore other lines (styles, classDef, etc) for milestone
	}

	// Any edge-referenced nodes that never got a label get id as label (already ensured)

	// Ensure all scope member nodes exist
	for (const sc of Object.values(scopes)) {
		for (const nid of sc.nodeIds) ensureNode(nodes, nid);
		for (const sid of sc.subscopeIds) {
			// scopes already created
		}
	}

	// Cleanup: a scope id may have been seen first as an edge target (loose node)
	// before its subgraph declaration. Remove conflicting node entries and loose refs.
	for (const sid of Object.keys(scopes)) {
		if (nodes[sid]) delete nodes[sid];
	}
	const cleanLoose = looseNodeIds.filter((id) => !scopes[id]);
	// also remove any loose that are actually scopes (safety)
	while (looseNodeIds.length) looseNodeIds.pop();
	for (const id of cleanLoose) looseNodeIds.push(id);

	return {
		nodes,
		edges,
		scopes,
		rootScopeIds,
		looseNodeIds,
	};
}

// The hardcoded demo diagram (has nested subgraph)
export const DEMO_MERMAID = `flowchart TD
    Start[Start] --> Decide{Choose Path}

    Decide -->|Outer| Outer

    subgraph Outer [Outer Scope]
        A[Task A] --> B[Task B]
        B --> InnerCheck{Go Inner?}

        subgraph Inner [Inner Scope]
            X[Deep Work X] --> Y[Deep Work Y]
        end

        InnerCheck -->|Yes| Inner
        Inner --> B
        A --> EndA[Local End]
    end

    Outer --> Finish[Finish]
    Decide -->|Direct| Finish
    Start --> Finish
`;
