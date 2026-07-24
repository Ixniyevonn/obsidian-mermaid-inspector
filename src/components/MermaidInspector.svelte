<script lang="ts">
import { tick } from "svelte";
import { postProcessAndTag, renderMermaidToSvg } from "../utils/mermaidRender";
import {
	captureVisualRects,
	centerDelta,
	screenDeltaToLocal,
	screenRectToLocalBounds,
	runCancelableTransition,
	type VisualRects,
} from "../utils/svgAnimation";
import { groupBackgroundElements } from "../utils/focusContext";
import { changeFocus, collapseScope } from "../utils/scopeState";
import { getViewSourceWithMeta, isBlankMermaidSource, type ScopeInfo } from "../utils/mermaidView";
import Canvas from "./Canvas.svelte";

let { source = "", transitionDuration = 320 }: { source: string; transitionDuration: number } = $props();
let host: HTMLDivElement, canvas: Canvas;
let currentSvg: SVGSVGElement | null = null,
	expanded = new Set<string>();
let focusPath = $state<string[]>([]),
	scopes = $state<ScopeInfo[]>([]),
	scopePaths = $state<Record<string, string[]>>({});
let error = $state(""),
	empty = $derived(isBlankMermaidSource(source)),
	busy = $state(false),
	revision = 0;
let activeTransition: AbortController | null = null;
const cache = new Map<string, string>();
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
			await animateFrom(next, old, controller.signal);
			if (activeTransition === controller) activeTransition = null;
		}
		if (fit) {
			await tick();
			canvas.fit(next.viewBox?.baseVal);
		}
	} catch (cause) {
		error = cause instanceof Error ? cause.message : String(cause);
		console.error("Mermaid Inspector render failed", cause);
	} finally {
		if (request === revision) busy = false;
	}
}
async function animateFrom(
	svg: SVGSVGElement,
	old: VisualRects,
	signal: AbortSignal,
): Promise<void> {
	const duration = Math.max(1, transitionDuration);
	const after = captureVisualRects(svg);
	const wrappers: Array<{ element: SVGGElement; x: number; y: number }> = [];
	const rectMorphs: Array<{
		element: SVGRectElement;
		from: { x: number; y: number; width: number; height: number };
		to: { x: number; y: number; width: number; height: number };
	}> = [];
	for (const element of svg.querySelectorAll<SVGGElement>(
		"[data-node-id], [data-cluster-id]",
	)) {
		const id =
			element.getAttribute("data-node-id") ??
			element.getAttribute("data-cluster-id");
		if (!id) continue;
		const before = old[id];
		const finalRect = after[id];
		if (!before || !finalRect) {
			element.animate([{ opacity: 0 }, { opacity: 1 }], {
				duration: duration * 0.875,
				easing: "ease-out",
			});
			continue;
		}
		if (element.hasAttribute("data-cluster-id")) {
			const outline = element.querySelector<SVGRectElement>("rect");
			const matrix = outline?.getScreenCTM();
			if (outline && matrix) {
				const from = screenRectToLocalBounds(before, matrix);
				const to = {
					x: Number(outline.getAttribute("x")),
					y: Number(outline.getAttribute("y")),
					width: Number(outline.getAttribute("width")),
					height: Number(outline.getAttribute("height")),
				};
				if (from && Object.values(to).every(Number.isFinite)) {
					outline.setAttribute("x", String(from.x));
					outline.setAttribute("y", String(from.y));
					outline.setAttribute("width", String(from.width));
					outline.setAttribute("height", String(from.height));
					rectMorphs.push({ element: outline, from, to });
					element.querySelector(".label, .cluster-label, text")?.animate(
						[{ opacity: 0 }, { opacity: 1 }],
						{ duration, easing: "ease-out" },
					);
					continue;
				}
			}
		}
		const parent = element.parentElement as SVGGraphicsElement | null;
		const matrix = parent?.getScreenCTM();
		if (!parent || !matrix) continue;
		const screenDelta = centerDelta(before, finalRect);
		const local = screenDeltaToLocal(screenDelta.x, screenDelta.y, matrix);
		if (Math.abs(local.x) < 0.01 && Math.abs(local.y) < 0.01) continue;
		const wrapper = document.createElementNS("http://www.w3.org/2000/svg", "g");
		wrapper.setAttribute("data-mi-animation-wrapper", "");
		parent.insertBefore(wrapper, element);
		wrapper.appendChild(element);
		wrappers.push({ element: wrapper, x: local.x, y: local.y });
	}

	for (const path of svg.querySelectorAll<SVGPathElement>("[data-edge-id]")) {
		let length = 0;
		try {
			length = path.getTotalLength();
		} catch {
			// Opacity still provides a transition if path length is unavailable.
		}
		path.animate(
			[
				{ opacity: 0, strokeDasharray: `${length} ${length}`, strokeDashoffset: length },
				{ opacity: 1, strokeDasharray: `${length} ${length}`, strokeDashoffset: 0 },
			],
			{ duration, easing: "cubic-bezier(.22,1,.36,1)" },
		);
	}

	const cancelAnimations = () => {
		for (const animation of svg.getAnimations()) animation.cancel();
	};
	signal.addEventListener("abort", cancelAnimations, { once: true });
	await runCancelableTransition(duration, signal, (progress) => {
		const eased = 1 - (1 - progress) ** 3;
		const lerp = (from: number, to: number) => from + (to - from) * eased;
		for (const morph of rectMorphs) {
			morph.element.setAttribute("x", String(lerp(morph.from.x, morph.to.x)));
			morph.element.setAttribute("y", String(lerp(morph.from.y, morph.to.y)));
			morph.element.setAttribute(
				"width",
				String(lerp(morph.from.width, morph.to.width)),
			);
			morph.element.setAttribute(
				"height",
				String(lerp(morph.from.height, morph.to.height)),
			);
		}
		for (const item of wrappers) {
			item.element.setAttribute(
				"transform",
				`translate(${item.x * (1 - eased)} ${item.y * (1 - eased)})`,
			);
		}
	});
	signal.removeEventListener("abort", cancelAnimations);
	cancelAnimations();
	for (const item of wrappers) {
		const parent = item.element.parentNode;
		if (!parent) continue;
		while (item.element.firstChild) {
			parent.insertBefore(item.element.firstChild, item.element);
		}
		item.element.remove();
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
	void render(true);
}
function click(event: MouseEvent) {
	const id = target(event);
	if (!id) return;
	toggleInline(id);
}
function applyFocus(path: string[]): void {
	const next = changeFocus({ expanded, focusPath }, path);
	expanded = next.expanded;
	focusPath = next.focusPath;
	void render(true);
}
function contextMenu(event: MouseEvent) {
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
	expanded = new Set();
	focusPath = [];
	cache.clear();
	if (host) void render(false, true);
});
</script>
<svelte:window onkeydown={(event) => { if (event.key === "Escape") ascend(); }} />
<section class="mi-root" aria-busy={busy}>
	<header class="mi-header">
		<nav aria-label="Focused Mermaid scope">
			<button class="mi-breadcrumb" onclick={() => applyFocus([])}>Diagram</button>
			{#each focusPath as id}<span aria-hidden="true">&gt;</span><button class="mi-breadcrumb" onclick={() => applyFocus(focusPath.slice(0, focusPath.indexOf(id) + 1))}>{scopes.find((scope) => scope.id === id)?.label ?? id}</button>{/each}
		</nav>
		<div class="mi-actions"><span>Click: inline | Right-click: focus | Drag: pan | Wheel: zoom | Esc: up</span><button onclick={() => canvas.fit(currentSvg?.viewBox?.baseVal)}>Fit</button></div>
	</header>
	<div class="mi-canvas">
		{#if empty}<div class="mi-empty">Open or create a Mermaid .mmd file</div>{/if}
		{#if error}<div class="mi-error" role="alert"><strong>Could not render Mermaid</strong><pre>{error}</pre></div>{/if}
		<Canvas bind:this={canvas}><div class="mi-diagram-host" bind:this={host}></div></Canvas>
	</div>
</section>
