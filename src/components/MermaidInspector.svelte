<script lang="ts">
import { tick } from "svelte";
import { postProcessAndTag, renderMermaidToSvg } from "../utils/mermaidRender";
import {
	captureVisualRects,
	centerDelta,
	screenDeltaToLocal,
	type VisualRects,
} from "../utils/svgAnimation";
import { collapseScope } from "../utils/scopeState";
import { getViewSourceWithMeta, isBlankMermaidSource, type ScopeInfo } from "../utils/mermaidView";
import Canvas from "./Canvas.svelte";

let { source = "" }: { source: string } = $props();
let host: HTMLDivElement, canvas: Canvas;
let currentSvg: SVGSVGElement | null = null,
	expanded = new Set<string>();
let focusPath = $state<string[]>([]),
	scopes = $state<ScopeInfo[]>([]);
let error = $state(""),
	empty = $derived(isBlankMermaidSource(source)),
	busy = $state(false),
	revision = 0;
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
	});
}
async function render(animate: boolean, fit = false) {
	const request = ++revision;
	busy = true;
	error = "";
	try {
		if (isBlankMermaidSource(source)) {
			host.replaceChildren();
			currentSvg = null;
			return;
		}
		const old = currentSvg ? captureVisualRects(currentSvg) : null,
			next = await build();
		if (request !== revision) return;
		host.replaceChildren(next);
		currentSvg = next;
		next.addEventListener("click", click);
		next.addEventListener("contextmenu", contextMenu);
		const focused = focusPath.at(-1);
		for (const el of next.querySelectorAll<SVGElement>("[data-cluster-id]")) {
			const id = el.dataset.clusterId!;
			el.classList.toggle(
				"mi-context",
				Boolean(
					focused &&
						!focusPath.includes(id) &&
						!ancestors(id).includes(focused),
				),
			);
		}
		if (animate && old) {
			await tick();
			await animateFrom(next, old);
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
async function animateFrom(svg: SVGSVGElement, old: VisualRects): Promise<void> {
	const after = captureVisualRects(svg);
	const wrappers: Array<{ element: SVGGElement; x: number; y: number }> = [];
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
				duration: 280,
				easing: "ease-out",
			});
			continue;
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
			{ duration: 320, easing: "cubic-bezier(.22,1,.36,1)" },
		);
	}

	const start = performance.now();
	await new Promise<void>((resolve) => {
		function frame(now: number) {
			const progress = Math.min(1, (now - start) / 320);
			const eased = 1 - (1 - progress) ** 3;
			for (const item of wrappers) {
				item.element.setAttribute(
					"transform",
					`translate(${item.x * (1 - eased)} ${item.y * (1 - eased)})`,
				);
			}
			if (progress < 1) requestAnimationFrame(frame);
			else resolve();
		}
		requestAnimationFrame(frame);
	});
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
function click(event: MouseEvent) {
	const id = target(event);
	if (!id || busy) return;
	focusPath = ancestors(id);
	expanded = new Set(focusPath);
	void render(true);
}
function contextMenu(event: MouseEvent) {
	const id = target(event);
	if (!id || busy) return;
	event.preventDefault();
	if (expanded.has(id)) {
		const collapsed = collapseScope({ expanded, focusPath }, scopes, id);
		expanded = collapsed.expanded;
		focusPath = collapsed.focusPath;
	} else {
		expanded = new Set(expanded).add(id);
	}
	void render(true);
}
function ascend() {
	if (!focusPath.length || busy) return;
	focusPath = focusPath.slice(0, -1);
	expanded = new Set([...expanded].filter((id) => focusPath.includes(id)));
	void render(true);
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
			<button class="mi-breadcrumb" onclick={() => { focusPath = []; expanded = new Set(); void render(true); }}>Diagram</button>
			{#each focusPath as id}<span aria-hidden="true">&gt;</span><button class="mi-breadcrumb" onclick={() => { focusPath = focusPath.slice(0, focusPath.indexOf(id) + 1); expanded = new Set(focusPath); void render(true); }}>{scopes.find((scope) => scope.id === id)?.label ?? id}</button>{/each}
		</nav>
		<div class="mi-actions"><span>Click: focus | Right-click: inline | Drag: pan | Wheel: zoom | Esc: up</span><button onclick={() => canvas.fit(currentSvg?.viewBox?.baseVal)}>Fit</button></div>
	</header>
	<div class="mi-canvas">
		{#if empty}<div class="mi-empty">Open or create a Mermaid .mmd file</div>{/if}
		{#if error}<div class="mi-error" role="alert"><strong>Could not render Mermaid</strong><pre>{error}</pre></div>{/if}
		<Canvas bind:this={canvas}><div class="mi-diagram-host" bind:this={host}></div></Canvas>
	</div>
</section>
