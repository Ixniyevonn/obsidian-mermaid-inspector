export type ScopePaths = Record<string, readonly string[]>;

export function isInFocusedScope(
	elementId: string,
	focusedScopeId: string | undefined,
	scopePaths: ScopePaths,
): boolean {
	if (!focusedScopeId) return true;
	return (
		elementId === focusedScopeId ||
		(scopePaths[elementId] ?? []).includes(focusedScopeId)
	);
}

export function groupBackgroundElements(
	svg: SVGSVGElement,
	focusedScopeId: string | undefined,
	scopePaths: ScopePaths,
): void {
	if (!focusedScopeId) return;
	const background: SVGElement[] = [];
	for (const element of svg.querySelectorAll<SVGElement>(
		"[data-node-id], [data-cluster-id]",
	)) {
		const id =
			element.getAttribute("data-node-id") ??
			element.getAttribute("data-cluster-id");
		if (id && !isInFocusedScope(id, focusedScopeId, scopePaths)) {
			background.push(element);
		}
	}
	for (const edge of svg.querySelectorAll<SVGPathElement>("[data-edge-id]")) {
		const id = edge.getAttribute("data-edge-id");
		if (!id) continue;
		const separator = id.indexOf("--");
		if (separator < 0) continue;
		const source = id.slice(0, separator);
		const target = id.slice(separator + 2);
		if (
			!isInFocusedScope(source, focusedScopeId, scopePaths) ||
			!isInFocusedScope(target, focusedScopeId, scopePaths)
		) {
			background.push(edge);
		}
	}

	const groups = new Map<Element, SVGGElement>();
	for (const element of background) {
		const parent = element.parentElement;
		if (!parent || element.closest("[data-mi-context-layer]")) continue;
		let group = groups.get(parent);
		if (!group) {
			group = document.createElementNS("http://www.w3.org/2000/svg", "g");
			group.setAttribute("data-mi-context-layer", "");
			group.classList.add("mi-context-layer");
			parent.insertBefore(group, element);
			groups.set(parent, group);
		}
		group.appendChild(element);
	}
}
