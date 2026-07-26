<script lang="ts">
import { setIcon } from "obsidian";
import { tick, untrack } from "svelte";
import { focusedFitBounds } from "../diagram/fitBounds";
import { groupBackgroundElements } from "../diagram/focus";
import {
	type InspectorState,
	normalizeInspectorState,
} from "../diagram/state";
import { postProcessAndTag, renderMermaidToSvg } from "../diagram/render";
import {
	getViewSourceWithMeta,
	isBlankMermaidSource,
	type ScopeInfo,
} from "../diagram/model";
import { changeFocus, collapseScope } from "../diagram/navigation";
import {
	animateDiagramTransition,
	captureVisualRects,
} from "../diagram/transition";
import Canvas from "./Canvas.svelte";

let {
	source = "",
	transitionDuration = 320,
	compact = false,
	initialState,
	onStateChange,
	onOpenFile,
}: {
	source: string;
	transitionDuration: number;
	compact?: boolean;
	initialState?: InspectorState;
	onStateChange?: (state: InspectorState) => void;
	onOpenFile?: () => void;
} = $props();
const restoredState = untrack(() => normalizeInspectorState(initialState));
let host: HTMLDivElement, canvas: Canvas;
let currentSvg: SVGSVGElement | null = null,
	expanded = new Set<string>(restoredState.expanded);
let focusPath = $state<string[]>([...restoredState.focusPath]),
	scopes = $state<ScopeInfo[]>([]),
	scopePaths = $state<Record<string, string[]>>({});
let error = $state(""),
	empty = $derived(isBlankMermaidSource(source)),
	busy = $state(false),
	revision = 0;
let activeTransition: AbortController | null = null;
let cameraState = restoredState.camera;
let initializedSource = false;
const cache = new Map<string, string>();
function isolatedButton(
	node: HTMLElement,
	icon: string,
	activate: () => void,
) {
	setIcon(node, icon);
	const stopPointer = (event: PointerEvent) => event.stopPropagation();
	const click = (event: MouseEvent) => {
		event.stopPropagation();
		activate();
	};
	node.addEventListener("pointerdown", stopPointer);
	node.addEventListener("click", click);
	return {
		destroy() {
			node.removeEventListener("pointerdown", stopPointer);
			node.removeEventListener("click", click);
		},
	};
}
function fitIcon(node: HTMLElement) {
	return isolatedButton(node, "scan", () => canvas.fit(fitBounds()));
}
function externalLinkIcon(node: HTMLElement) {
	return isolatedButton(node, "external-link", () => onOpenFile?.());
}
function fitBounds(svg = currentSvg) {
	return svg ? focusedFitBounds(svg, focusPath.at(-1)) : undefined;
}
function emitState() {
	onStateChange?.({
		expanded: [...expanded],
		focusPath: [...focusPath],
		camera: { ...cameraState },
	});
}
function ancestors(id: string): string[] {
	const result: string[] = [];
	let scope = scopes.find((item) => item.id === id);
	while (scope) {
		result.unshift(scope.id);
		scope = scope.parentId
			? scopes.find((item) => item.id === scope!.parentId)
			: undefined;
	}
	return result;
}
async function build(): Promise<SVGSVGElement> {
	const meta = getViewSourceWithMeta(expanded, source);
	scopes = meta.scopes;
	scopePaths = meta.scopePathByElementId;
	const key = `${source}\0${[...expanded].sort().join(",")}`;
	let text = cache.get(key);
	if (!text) {
		text = await renderMermaidToSvg(meta.source);
		cache.set(key, text);
	}
	return postProcessAndTag(text, {
		labelToId: meta.labelToId,
		edgeKeys: meta.edgeKeys,
		collapsedScopeIds: meta.collapsedScopeIds,
		emptyScopeIds: meta.emptyScopeIds,
	});
}
async function render(animate: boolean, fit = false) {
	const request = ++revision;
	const old = currentSvg ? captureVisualRects(currentSvg) : null;
	activeTransition?.abort();
	activeTransition = null;
	busy = true;
	error = "";
	try {
		if (isBlankMermaidSource(source)) {
			host.replaceChildren();
			currentSvg = null;
			return;
		}
		const next = await build();
		if (request !== revision) return;
		host.replaceChildren(next);
		currentSvg = next;
		next.addEventListener("click", click);
		next.addEventListener("contextmenu", contextMenu);
		groupBackgroundElements(next, focusPath.at(-1), scopePaths);
		if (animate && old) {
			await tick();
			const controller = new AbortController();
			activeTransition = controller;
			await animateDiagramTransition(
			next,
			old,
			Math.max(1, transitionDuration),
			controller.signal,
		);
			if (activeTransition === controller) activeTransition = null;
		}
		if (fit) {
			await tick();
			canvas.fitWhenReady(fitBounds(next), false);
		}
	} catch (cause) {
		error = cause instanceof Error ? cause.message : String(cause);
		console.error("Mermaid Inspector render failed", cause);
	} finally {
		if (request === revision) busy = false;
	}
}
const target = (event: Event) =>
	(event.target as Element)
		.closest("[data-cluster-id]")
		?.getAttribute("data-cluster-id") ?? null;
function toggleInline(id: string): void {
	if (expanded.has(id)) {
		const collapsed = collapseScope({ expanded, focusPath }, scopes, id);
		expanded = collapsed.expanded;
		focusPath = collapsed.focusPath;
	} else {
		expanded = new Set(expanded).add(id);
	}
	emitState();
	void render(true);
}
function click(event: MouseEvent) {
	event.stopPropagation();
	const id = target(event);
	if (!id) return;
	toggleInline(id);
}
function applyFocus(path: string[]): void {
	const next = changeFocus({ expanded, focusPath }, path);
	expanded = next.expanded;
	focusPath = next.focusPath;
	emitState();
	void render(true);
}
function contextMenu(event: MouseEvent) {
	event.stopPropagation();
	const id = target(event);
	if (!id) return;
	event.preventDefault();
	applyFocus(ancestors(id));
}
function ascend() {
	if (!focusPath.length) return;
	applyFocus(focusPath.slice(0, -1));
}
$effect(() => {
	source;
	if (initializedSource) {
		expanded = new Set();
		focusPath = [];
		cameraState = { panX: 0, panY: 0, zoom: 1 };
	} else initializedSource = true;
	cache.clear();
	if (host) void render(false, !initialState);
});
</script>
<svelte:window onkeydown={(event) => { if (event.key === "Escape") ascend(); }} />
<section class:mi-compact={compact} class="mi-root" aria-busy={busy}>
	{#if !compact}
		<header class="mi-header">
			<nav class="mi-focus-path" aria-label="Focused Mermaid scope">
				<button class="mi-breadcrumb" aria-current={focusPath.length === 0 ? "page" : undefined} onclick={() => applyFocus([])}>Diagram</button>
				{#each focusPath as id, index}
					<span class="mi-breadcrumb-separator" aria-hidden="true">/</span>
					<button class="mi-breadcrumb" aria-current={index === focusPath.length - 1 ? "page" : undefined} title={scopes.find((scope) => scope.id === id)?.label ?? id} onclick={() => applyFocus(focusPath.slice(0, index + 1))}>{scopes.find((scope) => scope.id === id)?.label ?? id}</button>
				{/each}
			</nav>
			<div class="mi-header-actions">
				<button class="clickable-icon mi-fit-button" use:fitIcon aria-label="Fit diagram" title="Fit diagram"></button>
			</div>
		</header>
	{/if}
	<div class="mi-canvas">
		{#if compact}
		<div class="mi-compact-actions">
			{#if onOpenFile}<button class="clickable-icon" use:externalLinkIcon aria-label="Open diagram in inspector" title="Open diagram in inspector"></button>{/if}
			<button class="clickable-icon mi-fit-button" use:fitIcon aria-label="Fit diagram" title="Fit diagram"></button>
		</div>
	{/if}
		{#if empty}<div class="mi-empty">Open or create a Mermaid .mmd file</div>{/if}
		{#if error}<div class="mi-error" role="alert"><strong>Could not render Mermaid</strong><pre>{error}</pre></div>{/if}
		<Canvas bind:this={canvas} {transitionDuration} initialCamera={restoredState.camera} onCameraChange={(camera) => { cameraState = camera; emitState(); }}><div class="mi-diagram-host" bind:this={host}></div></Canvas>
	</div>
	{#if !compact}<footer class="mi-footer">Click: inline <span aria-hidden="true">&middot;</span> Right-click: focus <span aria-hidden="true">&middot;</span> Drag: pan <span aria-hidden="true">&middot;</span> Wheel: zoom <span aria-hidden="true">&middot;</span> Esc: up</footer>{/if}
</section>