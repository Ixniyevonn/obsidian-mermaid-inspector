// Core model types for parsed Mermaid flowchart (subgraphs only)

export interface MNode {
	id: string;
	label: string;
}

export interface MEdge {
	from: string;
	to: string;
	label?: string;
}

export interface Scope {
	id: string;
	label: string;
	nodeIds: string[]; // direct member nodes
	subscopeIds: string[]; // direct child scopes
	parentId: string | null;
}

export interface GraphModel {
	nodes: Record<string, MNode>;
	edges: MEdge[];
	scopes: Record<string, Scope>;
	// Top-level scopes (parentId === null)
	rootScopeIds: string[];
	// Nodes that are not inside any explicit scope (top level loose nodes)
	looseNodeIds: string[];
}

export interface LayoutNode {
	id: string; // node id or `cluster:${scopeId}` for collapsed clusters
	label: string;
	x: number;
	y: number;
	width: number;
	height: number;
	isCluster: boolean;
	scopeId?: string; // for clusters
}

export interface LayoutEdge {
	from: string;
	to: string;
	label?: string;
	points: Array<{ x: number; y: number }>; // at least start + end, possibly more from dagre
}

export interface ClusterBox {
	scopeId: string;
	label: string;
	x: number;
	y: number;
	width: number;
	height: number;
	// members are the *current* visible direct children node ids (for hit/bbox during anim)
	memberNodeIds: string[];
}

export interface LayoutResult {
	nodes: Record<string, LayoutNode>; // visible normal nodes + visible cluster proxies (keyed by layout id)
	edges: LayoutEdge[];
	// For expanded scopes we compute dynamic boxes from member positions at render time.
	// This holds the collapsed clusters that are present as first-class nodes in the layout.
	collapsedClusters: Record<string, LayoutNode>; // scopeId -> the cluster node
}
