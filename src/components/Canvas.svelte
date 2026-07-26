<script lang="ts">
import { onDestroy, type Snippet, untrack } from "svelte";
import {
	type CameraBounds,
	type CameraState,
	fitCamera,
	hasUsableViewport,
	interpolateCamera,
} from "../diagram/camera";

let {
	children,
	transitionDuration = 320,
	initialCamera = { panX: 0, panY: 0, zoom: 1 },
	onCameraChange,
}: {
	children: Snippet;
	transitionDuration?: number;
	initialCamera?: CameraState;
	onCameraChange?: (camera: CameraState) => void;
} = $props();
const restoredCamera = untrack(() => ({ ...initialCamera }));
let viewport: HTMLDivElement;
let panX = $state(restoredCamera.panX),
	panY = $state(restoredCamera.panY),
	zoom = $state(restoredCamera.zoom);
let pointerId = $state<number | null>(null);
let origin = { x: 0, y: 0, panX: 0, panY: 0 };
let cameraFrame: number | null = null;
let initialFitObserver: ResizeObserver | null = null;
function cancelCameraAnimation() {
	if (cameraFrame !== null) cancelAnimationFrame(cameraFrame);
	cameraFrame = null;
}
function reportCamera() {
	onCameraChange?.({ panX, panY, zoom });
}
function down(event: PointerEvent) {
	event.stopPropagation();
	if (
		event.button !== 1 &&
		(event.button !== 0 ||
			(event.target as Element).closest("[data-cluster-id],button"))
	)
		return;
	event.preventDefault();
	cancelCameraAnimation();
	pointerId = event.pointerId;
	origin = { x: event.clientX, y: event.clientY, panX, panY };
	viewport.setPointerCapture(event.pointerId);
}
function move(event: PointerEvent) {
	event.stopPropagation();
	if (pointerId !== event.pointerId) return;
	panX = origin.panX + event.clientX - origin.x;
	panY = origin.panY + event.clientY - origin.y;
}
function up(event: PointerEvent) {
	event.stopPropagation();
	if (pointerId !== event.pointerId) return;
	viewport.releasePointerCapture(event.pointerId);
	pointerId = null;
	reportCamera();
}
function wheel(event: WheelEvent) {
	event.stopPropagation();
	event.preventDefault();
	cancelCameraAnimation();
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
	reportCamera();
}
function cameraInput(node: HTMLElement) {
	const blockNavigation = (event: MouseEvent) => {
		event.preventDefault();
		event.stopPropagation();
	};
	node.addEventListener("click", blockNavigation);
	node.addEventListener("pointerdown", down);
	node.addEventListener("pointermove", move);
	node.addEventListener("pointerup", up);
	node.addEventListener("pointercancel", up);
	node.addEventListener("wheel", wheel, { passive: false });
	return {
		destroy() {
			node.removeEventListener("click", blockNavigation);
			node.removeEventListener("pointerdown", down);
			node.removeEventListener("pointermove", move);
			node.removeEventListener("pointerup", up);
			node.removeEventListener("pointercancel", up);
			node.removeEventListener("wheel", wheel);
		},
	};
}
export function fitWhenReady(bounds?: CameraBounds, animate = false): void {
	initialFitObserver?.disconnect();
	initialFitObserver = null;
	const attempt = () => {
		if (!hasUsableViewport(viewport.getBoundingClientRect())) return;
		initialFitObserver?.disconnect();
		initialFitObserver = null;
		fit(bounds, animate);
	};
	if (hasUsableViewport(viewport.getBoundingClientRect())) {
		attempt();
		return;
	}
	initialFitObserver = new ResizeObserver(attempt);
	initialFitObserver.observe(viewport);
}
export function fit(bounds?: CameraBounds, animate = true) {
	const target = fitCamera(viewport.getBoundingClientRect(), bounds);
	cancelCameraAnimation();
	if (!animate || transitionDuration <= 0) {
		({ panX, panY, zoom } = target);
		reportCamera();
		return;
	}
	const start = performance.now();
	const from = { panX, panY, zoom };
	const frame = (now: number) => {
		({ panX, panY, zoom } = interpolateCamera(
			from,
			target,
			(now - start) / Math.max(1, transitionDuration),
		));
		if (now - start < transitionDuration)
			cameraFrame = requestAnimationFrame(frame);
		else {
			cameraFrame = null;
			reportCamera();
		}
	};
	cameraFrame = requestAnimationFrame(frame);
}
onDestroy(() => {
	initialFitObserver?.disconnect();
	cancelCameraAnimation();
});
</script>
<div
	class:dragging={pointerId !== null}
	class="mi-viewport"
	bind:this={viewport}
	use:cameraInput
	role="application"
	aria-label="Mermaid diagram canvas"
>
	<div class="mi-world" style:zoom={zoom} style:translate={`${panX / zoom}px ${panY / zoom}px`}>{@render children()}</div>
</div>