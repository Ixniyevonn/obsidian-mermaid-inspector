<script lang="ts">
  interface Props {
    children?: any;
    minZoom?: number;
    maxZoom?: number;
    zoomSpeed?: number;
    onEmptyDblClick?: (worldX: number, worldY: number) => void;
    onEmptyClick?: () => void;
  }
  const {
    children,
    minZoom = 0.1,
    maxZoom = 5,
    zoomSpeed = 0.002,
    onEmptyDblClick,
    onEmptyClick,
  }: Props = $props();

  let containerEl: HTMLDivElement | undefined = $state();
  let panX = $state(0);
  let panY = $state(0);
  let zoom = $state(1);

  // Pan state
  let isPanning = false;
  let panButton = -1;
  let panStartX = 0;
  let panStartY = 0;
  let panOriginX = 0;
  let panOriginY = 0;
  let didMove = false;

  function toWorld(clientX: number, clientY: number) {
    if (!containerEl) return { x: 0, y: 0 };
    const rect = containerEl.getBoundingClientRect();
    return {
      x: (clientX - rect.left - panX) / zoom,
      y: (clientY - rect.top - panY) / zoom,
    };
  }

  function isEmptySpace(target: EventTarget | null): boolean {
    if (!containerEl) return false;
    const el = target as Element | null;
    // Do not pan when the user is interacting with a cluster (expand/collapse should win)
    if (el?.closest?.('[data-cluster-id]')) return false;
    // Allow panning on the background / diagram (including SVG areas that are not clusters)
    return true;
  }

  function onPointerDown(e: PointerEvent) {
    const isMiddle = e.button === 1;
    const isLeftOnEmpty = e.button === 0 && isEmptySpace(e.target);

    if (!isMiddle && !isLeftOnEmpty) return;

    if (isMiddle) {
      e.preventDefault();
      containerEl?.setPointerCapture(e.pointerId);
    }

    // CRITICAL: left-click on empty background does NOT start panning yet
    // This lets the browser properly synthesize the native dblclick event
    isPanning = false;
    panButton = e.button;
    didMove = false;
    panStartX = e.clientX;
    panStartY = e.clientY;
    panOriginX = panX;
    panOriginY = panY;
  }

  function onPointerMove(e: PointerEvent) {
    if (panButton === -1) return;

    const dx = e.clientX - panStartX;
    const dy = e.clientY - panStartY;

    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
      didMove = true;
      isPanning = true; // only become a drag after small movement threshold
    }

    if (isPanning) {
      panX = panOriginX + dx;
      panY = panOriginY + dy;
    }
  }

  function onPointerUp(e: PointerEvent) {
    if (panButton === -1) return;

    if (panButton === 1 && containerEl) {
      containerEl.releasePointerCapture(e.pointerId);
    }

    // Single-click on empty space (no movement happened)
    if (panButton === 0 && !didMove && !isPanning && isEmptySpace(e.target)) {
      onEmptyClick?.();
    }

    isPanning = false;
    panButton = -1;
  }

  function onDblClick(e: MouseEvent) {
    const world = toWorld(e.clientX, e.clientY);
    onEmptyDblClick?.(world.x, world.y);
  }

  function onWheel(e: WheelEvent) {
    if (!e.ctrlKey) return;
    e.preventDefault();
    if (!containerEl) return;
    const rect = containerEl.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const oldZoom = zoom;
    const delta = -e.deltaY * zoomSpeed;
    const newZoom = Math.min(maxZoom, Math.max(minZoom, oldZoom * (1 + delta)));
    const scale = newZoom / oldZoom;
    panX = cx - scale * (cx - panX);
    panY = cy - scale * (cy - panY);
    zoom = newZoom;
  }

  function onAuxClick(e: MouseEvent) {
    if (e.button === 1) e.preventDefault();
  }

  /** Programmatic: smoothly pan so world-space (wx, wy) is at container center */
  export function panTo(
    wx: number,
    wy: number,
    targetZoom?: number,
    durationMs = 300,
  ) {
    if (!containerEl) return;
    const rect = containerEl.getBoundingClientRect();
    const z = targetZoom ?? zoom;
    const targetPanX = rect.width / 2 - wx * z;
    const targetPanY = rect.height / 2 - wy * z;
    if (durationMs <= 0) {
      panX = targetPanX;
      panY = targetPanY;
      zoom = z;
      return;
    }
    const startPanX = panX;
    const startPanY = panY;
    const startZoom = zoom;
    const start = performance.now();
    function tick(now: number) {
      const t = Math.min(1, (now - start) / durationMs);
      const ease = 1 - (1 - t) * (1 - t);
      panX = startPanX + (targetPanX - startPanX) * ease;
      panY = startPanY + (targetPanY - startPanY) * ease;
      zoom = startZoom + (z - startZoom) * ease;
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  export function getViewport() {
    return { panX, panY, zoom };
  }

  export function clientToWorld(clientX: number, clientY: number) {
    return toWorld(clientX, clientY);
  }

  /** Direct set for pinning the view during transitions (e.g. keep cluster center fixed on screen) */
  export function setPan(newPanX: number, newPanY: number) {
    panX = newPanX;
    panY = newPanY;
  }

  export function getContainerRect() {
    return containerEl ? containerEl.getBoundingClientRect() : null;
  }
</script>

<div
  class="canvas-viewport"
  bind:this={containerEl}
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointercancel={onPointerUp}
  onwheel={onWheel}
  ondblclick={onDblClick}
  onauxclick={onAuxClick}
  oncontextmenu={(e) => e.preventDefault()}
  role="application"
  style:--px={panX}
  style:--py={panY}
  style:--zoom={zoom}
>
  <div
    class="canvas-world"
    style:zoom={zoom}
    style:translate="{panX / zoom}px {panY / zoom}px"
  >
    {@render children?.()}
  </div>
</div>

<style>
  .canvas-viewport {
    width: 100%;
    height: 100%;
    overflow: hidden;
    position: relative;
    cursor: grab;
    touch-action: none;
    user-select: none;
    background-color: var(--background-primary);
  }
  .canvas-viewport:active {
    cursor: grabbing;
  }
  .canvas-world {
    position: absolute;
    top: 0;
    left: 0;
    will-change: transform;
  }
</style>
