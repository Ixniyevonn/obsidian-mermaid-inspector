import dagre from "dagre";
import type {
	GraphModel,
	LayoutEdge,
	LayoutNode,
	LayoutResult,
} from "./types";
import { measureCluster, measureNode } from "./utils/measure";

/**
 * Layout wrapper using only dagre (no mermaid).
 * Given the parsed model and the set of *expanded* scope ids,
 * produces a layout where every exposed scope is represented by a persistent
 * `cluster:xxx` node (so the "expanded block" is the *same node*, just bigger).
 *
 * We use dagre compound graphs (setParent) so that when a scope is expanded its
 * direct children are laid out *inside* the cluster node's bounds. The cluster
 * node itself grows to contain them.
 */

function getDirectOwnerScope(
	nodeId: string,
	model: GraphModel,
): string | null {
	for (const sc of Object.values(model.scopes)) {
		if (sc.nodeIds.includes(nodeId)) return sc.id;
	}
	return null;
}

/**
 * Resolve which layout entity (node id or `cluster:xxx`) currently represents
 * the given original node id, given the expanded state.
 * Returns null if the representative is not part of the current visible set.
 *
 * Important: exposed scopes are *always* represented by their `cluster:xxx` node
 * in the (compound) graph, whether the scope is currently collapsed or expanded.
 * This is what keeps "the expanded block the same node, just bigger".
 */
function getVisibleRepresentative(
	originalNodeId: string,
	model: GraphModel,
	expanded: Set<string>,
	visibleIds: Set<string>,
): string | null {
	// Direct reference to a scope (e.g. edge going to a subgraph name).
	// If the scope is exposed at all, its cluster node is the representative.
	if (model.scopes[originalNodeId]) {
		const cid = `cluster:${originalNodeId}`;
		return visibleIds.has(cid) ? cid : null;
	}

	const owner = getDirectOwnerScope(originalNodeId, model);
	if (!owner) {
		// loose / top-level node
		return visibleIds.has(originalNodeId) ? originalNodeId : null;
	}

	// walk upward while scopes are expanded → map the node up to the first
	// collapsed ancestor cluster (or the node itself if everything on the path is open).
	let cur: string | null = owner;
	while (cur) {
		if (!expanded.has(cur)) {
			const cid = `cluster:${cur}`;
			return visibleIds.has(cid) ? cid : null;
		}
		cur = model.scopes[cur]?.parentId ?? null;
	}
	// fully expanded chain -> the node itself participates directly
	return visibleIds.has(originalNodeId) ? originalNodeId : null;
}

interface VisibleEntity {
	id: string; // layout id (node id or cluster:scopeId)
	label: string;
	isCluster: boolean;
	scopeId?: string;
}

export function computeLayout(
	model: GraphModel,
	expanded: Set<string>,
): LayoutResult {
	// 1. Collect currently visible entities (nodes + collapsed clusters)
	const entities: VisibleEntity[] = [];
	const visibleIds = new Set<string>();

	// loose nodes are always candidates (treated as root)
	for (const nid of model.looseNodeIds) {
		const n = model.nodes[nid];
		if (!n) continue;
		entities.push({ id: nid, label: n.label, isCluster: false });
		visibleIds.add(nid);
	}

	// We collect:
	// - entities (what will be nodes in dagre)
	// - parentMap: for compound layout, which children belong inside which cluster
	const parentMap: Record<string, string> = {};

	// depth-first visit from roots.
	// Every *exposed* scope gets a persistent `cluster:xxx` node in the layout.
	// If the scope is expanded, its direct contents (nodes + child clusters) are
	// added as children via setParent so dagre sizes the cluster to fit them.
	function visit(scopeId: string, parentIsOpen: boolean) {
		const sc = model.scopes[scopeId];
		if (!sc) return;
		const isOpen = expanded.has(scopeId);
		const exposed = parentIsOpen || model.rootScopeIds.includes(scopeId);
		if (!exposed) return;

		const cId = `cluster:${scopeId}`;

		// Always create the cluster entity for this exposed scope.
		// This is the "same node" that will just be small (collapsed) or big (expanded).
		if (!visibleIds.has(cId)) {
			entities.push({
				id: cId,
				label: sc.label,
				isCluster: true,
				scopeId,
			});
			visibleIds.add(cId);
		}

		const directKids: string[] = [];

		if (isOpen) {
			// Expanded: include direct child nodes as visible entities inside this cluster.
			for (const nid of sc.nodeIds) {
				const n = model.nodes[nid];
				if (!n) continue;
				if (!visibleIds.has(nid)) {
					entities.push({ id: nid, label: n.label, isCluster: false });
					visibleIds.add(nid);
				}
				directKids.push(nid);
			}

			// Recurse into child scopes. They will have created their own cluster entities.
			for (const child of sc.subscopeIds) {
				visit(child, /*parent open*/ true);
				const childCId = `cluster:${child}`;
				if (visibleIds.has(childCId)) {
					directKids.push(childCId);
				}
			}
		}

		// Record that these direct kids live inside this scope's cluster node.
		for (const kid of directKids) {
			parentMap[kid] = cId;
		}
	}

	for (const root of model.rootScopeIds) visit(root, true);

	// 2. Project edges onto visible representatives.
	// Because cluster nodes now persist for exposed scopes (even when expanded),
	// references to a scope id will resolve to its cluster id.
	const projEdges: Array<{ from: string; to: string; label?: string }> = [];
	for (const e of model.edges) {
		const vf = getVisibleRepresentative(e.from, model, expanded, visibleIds);
		const vt = getVisibleRepresentative(e.to, model, expanded, visibleIds);
		if (vf && vt && vf !== vt) {
			projEdges.push({ from: vf, to: vt, label: e.label });
		}
	}

	// When a cluster is *expanded*, avoid attaching cross-boundary edges directly
	// to the cluster node id itself. Project the end to a direct visible child
	// instead. This keeps the compound ranker happy in some dagre versions while
	// the cluster node still gets a correct large bounding box from setParent +
	// its children. The visual result is that edges land inside the grown box.
	for (let i = 0; i < projEdges.length; i++) {
		let { from, to, label } = projEdges[i];

		if (from.startsWith("cluster:")) {
			const sid = from.slice(8);
			if (expanded.has(sid)) {
				const sc = model.scopes[sid];
				const first = sc?.nodeIds?.find((nid) => visibleIds.has(nid)) ||
				              sc?.subscopeIds?.map((c) => `cluster:${c}`).find((c) => visibleIds.has(c));
				if (first) from = first;
			}
		}
		if (to.startsWith("cluster:")) {
			const sid = to.slice(8);
			if (expanded.has(sid)) {
				const sc = model.scopes[sid];
				const first = sc?.nodeIds?.find((nid) => visibleIds.has(nid)) ||
				              sc?.subscopeIds?.map((c) => `cluster:${c}`).find((c) => visibleIds.has(c));
				if (first) to = first;
			}
		}

		if (from !== projEdges[i].from || to !== projEdges[i].to) {
			projEdges[i] = { from, to, label };
		}
	}

	// 3. Dagre layout using compound graphs so clusters can contain children.
	const g = new dagre.graphlib.Graph({ compound: true });
	g.setGraph({
		rankdir: "TB",
		nodesep: 60,
		ranksep: 90,
		edgesep: 25,
		align: "UL", // more predictable top-left aligned layers
		marginx: 24,
		marginy: 24,
	});
	g.setDefaultEdgeLabel(() => ({}));

	for (const ent of entities) {
		const sz = ent.isCluster
			? measureCluster(ent.label)
			: measureNode(ent.label);
		g.setNode(ent.id, {
			width: sz.width,
			height: sz.height,
		});
	}

	// Wire the compound structure: children live inside their cluster.
	for (const [child, parent] of Object.entries(parentMap)) {
		g.setParent(child, parent);
	}

	for (const pe of projEdges) {
		g.setEdge(pe.from, pe.to);
	}

	dagre.layout(g);

	// 4. Extract results (store top-left for convenience).
	// Every exposed scope now has a persistent cluster entry in `nodes` (and in
	// collapsedClusters for compatibility with the view). When the scope is expanded
	// its cluster node will have a large width/height computed by dagre's compound
	// layout to contain the children.
	const nodes: Record<string, LayoutNode> = {};
	const collapsedClusters: Record<string, LayoutNode> = {};

	for (const ent of entities) {
		const dn = g.node(ent.id);
		if (!dn) continue;
		const w = (typeof dn.width === 'number' && isFinite(dn.width)) ? dn.width : 80;
		const h = (typeof dn.height === 'number' && isFinite(dn.height)) ? dn.height : 28;
		const rawX = dn.x;
		const rawY = dn.y;
		const cx = (typeof rawX === 'number' && isFinite(rawX)) ? rawX : 0;
		const cy = (typeof rawY === 'number' && isFinite(rawY)) ? rawY : 0;
		let ln: LayoutNode = {
			id: ent.id,
			label: ent.label,
			x: cx - w / 2,
			y: cy - h / 2,
			width: w,
			height: h,
			isCluster: ent.isCluster,
			scopeId: ent.scopeId,
		};

		// For expanded clusters, inflate the reported box so that the visual
		// container rect has breathing room. Nodes and especially outward-bulging
		// edges will then sit comfortably inside the drawn "bounding box".
		// We shift x/y and grow w/h so the center moves as little as possible.
		if (ent.isCluster && ent.scopeId && expanded.has(ent.scopeId)) {
			const pad = 28;
			const labelSpace = 16;
			ln = {
				...ln,
				x: ln.x - pad,
				y: ln.y - pad - labelSpace,
				width: ln.width + pad * 2,
				height: ln.height + pad * 2 + labelSpace,
			};
		}

		nodes[ent.id] = ln;
		if (ent.isCluster && ent.scopeId) {
			// Populated for *all* exposed scopes (collapsed or expanded).
			// The component uses this to know a cluster rep exists for the scope.
			collapsedClusters[ent.scopeId] = ln;
		}
	}

	// edges (use dagre points if present, else centers)
	const edges: LayoutEdge[] = [];
	for (const pe of projEdges) {
		const de: any = g.edge(pe.from, pe.to);
		let points: Array<{ x: number; y: number }> = [];
		if (de && Array.isArray(de.points) && de.points.length >= 2) {
			points = de.points
				.map((p: any) => ({
					x: (typeof p.x === 'number' && isFinite(p.x)) ? p.x : 0,
					y: (typeof p.y === 'number' && isFinite(p.y)) ? p.y : 0,
				}));
		} else {
			const a = nodes[pe.from];
			const b = nodes[pe.to];
			if (a && b) {
				const ax = (typeof a.x === 'number' && isFinite(a.x)) ? a.x : 0;
				const ay = (typeof a.y === 'number' && isFinite(a.y)) ? a.y : 0;
				const bx = (typeof b.x === 'number' && isFinite(b.x)) ? b.x : 0;
				const by = (typeof b.y === 'number' && isFinite(b.y)) ? b.y : 0;
				points = [
					{ x: ax + a.width / 2, y: ay + a.height / 2 },
					{ x: bx + b.width / 2, y: by + b.height / 2 },
				];
			}
		}
		edges.push({ from: pe.from, to: pe.to, label: pe.label, points });
	}

	return { nodes, edges, collapsedClusters };
}
