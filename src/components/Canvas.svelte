<script lang="ts">
import type { Snippet } from "svelte";

let { children }: { children: Snippet } = $props();
let viewport: HTMLDivElement;
let panX = $state(0),
	panY = $state(0),
	zoom = $state(1);
let pointerId = $state<number | null>(null);
let origin = { x: 0, y: 0, panX: 0, panY: 0 };
function down(event: PointerEvent) {
	if (
		event.button !== 1 &&
		(event.button !== 0 ||
			(event.target as Element).closest("[data-cluster-id],button"))
	)
		return;
	event.preventDefault();
	pointerId = event.pointerId;
	origin = { x: event.clientX, y: event.clientY, panX, panY };
	viewport.setPointerCapture(event.pointerId);
}
function move(event: PointerEvent) {
	if (pointerId !== event.pointerId) return;
	panX = origin.panX + event.clientX - origin.x;
	panY = origin.panY + event.clientY - origin.y;
}
function up(event: PointerEvent) {
	if (pointerId !== event.pointerId) return;
	viewport.releasePointerCapture(event.pointerId);
	pointerId = null;
}
function wheel(event: WheelEvent) {
	event.preventDefault();
	const rect = viewport.getBoundingClientRect(),
		x = event.clientX - rect.left,
		y = event.clientY - rect.top;
	const next = Math.min(
		12,
		Math.max(0.15, zoom * Math.exp(-event.deltaY * 0.0015)),
	);
	panX = x - ((x - panX) * next) / zoom;
	panY = y - ((y - panY) * next) / zoom;
	zoom = next;
}
export function fit(bounds?: DOMRect | SVGRect) {
	const rect = viewport.getBoundingClientRect();
	if (!bounds?.width || !bounds.height) {
		panX = 0;
		panY = 0;
		zoom = 1;
		return;
	}
	zoom = Math.min(
		1.5,
		Math.max(
			0.15,
			Math.min(
				(rect.width - 48) / bounds.width,
				(rect.height - 48) / bounds.height,
			),
		),
	);
	panX = rect.width / 2 - (bounds.x + bounds.width / 2) * zoom;
	panY = rect.height / 2 - (bounds.y + bounds.height / 2) * zoom;
}
</script>
<div class:dragging={pointerId !== null} class="mi-viewport" bind:this={viewport}
	onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up}
	onwheel={wheel} role="application" aria-label="Mermaid diagram canvas">
	<div class="mi-world" style:zoom={zoom} style:translate={`${panX / zoom}px ${panY / zoom}px`}>{@render children()}</div>
</div>
