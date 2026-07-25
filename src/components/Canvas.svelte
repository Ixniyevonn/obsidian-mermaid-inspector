<script lang="ts">
import { type Snippet, untrack } from "svelte";
import {
	type CameraBounds,
	type CameraState,
	fitCamera,
	interpolateCamera,
} from "../utils/camera";

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
function cancelCameraAnimation() {
	if (cameraFrame !== null) cancelAnimationFrame(cameraFrame);
	cameraFrame = null;
}
function reportCamera() {
	onCameraChange?.({ panX, panY, zoom });
}
function down(event: PointerEvent) {
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
	if (pointerId !== event.pointerId) return;
	panX = origin.panX + event.clientX - origin.x;
	panY = origin.panY + event.clientY - origin.y;
}
function up(event: PointerEvent) {
	if (pointerId !== event.pointerId) return;
	viewport.releasePointerCapture(event.pointerId);
	pointerId = null;
	reportCamera();
}
function wheel(event: WheelEvent) {
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
</script>
<div class:dragging={pointerId !== null} class="mi-viewport" bind:this={viewport}
	onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up}
	onwheel={wheel} role="application" aria-label="Mermaid diagram canvas">
	<div class="mi-world" style:zoom={zoom} style:translate={`${panX / zoom}px ${panY / zoom}px`}>{@render children()}</div>
</div>