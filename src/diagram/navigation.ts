import type { ScopeInfo } from "./model";

export interface ScopeNavigationState {
	expanded: Set<string>;
	focusPath: string[];
}

export function collapseScope(
	state: ScopeNavigationState,
	scopes: readonly ScopeInfo[],
	scopeId: string,
): ScopeNavigationState {
	const descendants = new Set<string>([scopeId]);
	let changed = true;
	while (changed) {
		changed = false;
		for (const scope of scopes) {
			if (
				scope.parentId &&
				descendants.has(scope.parentId) &&
				!descendants.has(scope.id)
			) {
				descendants.add(scope.id);
				changed = true;
			}
		}
	}
	const expanded = new Set(
		[...state.expanded].filter((id) => !descendants.has(id)),
	);
	const focusedIndex = state.focusPath.indexOf(scopeId);
	const focusPath =
		focusedIndex >= 0
			? state.focusPath.slice(0, focusedIndex)
			: [...state.focusPath];
	return { expanded, focusPath };
}
export function changeFocus(
	state: ScopeNavigationState,
	focusPath: readonly string[],
): ScopeNavigationState {
	return {
		expanded: new Set([...state.expanded, ...focusPath]),
		focusPath: [...focusPath],
	};
}
