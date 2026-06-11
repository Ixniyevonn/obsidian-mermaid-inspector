<script lang="ts">
  import { onMount, tick } from "svelte";
  import {
    renderMermaidToSvg,
    postProcessAndTag,
    extractPositions,
    interpolatePathD,
    ease,
    type Positions,
    type Rect,
  } from "../utils/mermaidRender";

  // De-hardcoded: single Mermaid source string (FULL_MERMAID) + @emily/mermaid-ast
  // (the "mermaid-ast" package) to derive collapsed/expanded views via AST.
  // Collapsed subgraphs are emitted as empty nested containers so they render
  // as the expected styled blocks instead of plain nodes.
  import { getViewSource } from "../utils/mermaidView";

  // Steal the whole Canvas from the viewpoint demo project for correct, working panning and zooming.
  import Canvas from "./Canvas.svelte";

  // Current expansion state (drives source generation)
  let expanded = $state(new Set<string>());

  // diagramHost is the content container (inside the Canvas world layer)
  let diagramHost: HTMLDivElement | undefined = $state();

  // The currently mounted <svg> element (for click delegation + position reads)
  let currentSvg: SVGSVGElement | null = null;

  // Reference to the stolen Canvas (from viewpoint demo) for pan/zoom control and pinning.
  let canvasRef: any = $state();

  // To prevent overlapping animations
  let animating = $state(false);

  // For display / debug
  let _status = $state("Click a subgraph block to expand/collapse with liquid tween");

  async function renderCurrent() {
    if (!diagramHost) return;

    const source = getViewSource(expanded);
    const svgString = await renderMermaidToSvg(source, `mi-${Date.now()}`);
    const taggedSvg = postProcessAndTag(svgString);

    // Replace previous diagram (keep the pan/zoom transform on the parent)
    diagramHost.innerHTML = "";
    diagramHost.appendChild(taggedSvg);

    currentSvg = taggedSvg;

    // Make svg fill its container (the pannable host handles view)
    taggedSvg.setAttribute("width", "100%");
    taggedSvg.setAttribute("height", "100%");
    taggedSvg.style.maxWidth = "100%";
    taggedSvg.style.maxHeight = "100%";

    // Delegate clicks for cluster expansion (on the svg itself)
    taggedSvg.addEventListener("click", onSvgClick, { passive: true });
  }

  function onSvgClick(ev: MouseEvent) {
    if (animating || !currentSvg) return;

    const target = (ev.target as Element).closest("[data-cluster-id]") as SVGGElement | null;
    if (!target) return;

    const clusterId = target.getAttribute("data-cluster-id");
    if (!clusterId) return;

    // Toggle
    const wasExpanded = expanded.has(clusterId);
    const next = new Set(expanded);
    if (wasExpanded) {
      next.delete(clusterId);
    } else {
      next.add(clusterId);
    }

    // Capture the current screen position (relative to viewport) of the cluster's center.
    // During the transition we continuously adjust the camera (via cameraAnimX/Y driven
    // in the rAF) + the final committed pan so that this point on screen corresponds to
    // the (moving) center of the subgraph in diagram space. This keeps the expansion
    // "in place" relative to the clicked cluster instead of the whole diagram jumping.
    let anchorMx: number | null = null;
    let anchorMy: number | null = null;
    if (currentSvg && canvasRef) {
      const clusterG = currentSvg.querySelector(`[data-cluster-id="${clusterId}"]`) as SVGGElement | null;
      if (clusterG) {
        const crect = clusterG.getBoundingClientRect();
        const cRect = canvasRef.getContainerRect?.();
        if (cRect) {
          anchorMx = (crect.left + crect.right) / 2 - cRect.left;
          anchorMy = (crect.top + crect.bottom) / 2 - cRect.top;
        }
      }
    }

    // Trigger the animated transition.
    void animateTo(next, clusterId, anchorMx, anchorMy);
  }

  function resetView(animate = false) {
    if (!canvasRef) return;
    const vb = currentSvg?.viewBox?.baseVal;
    if (vb && vb.width > 0 && vb.height > 0) {
      const cx = vb.x + vb.width / 2;
      const cy = vb.y + vb.height / 2;
      const containerRect = canvasRef.getContainerRect?.();
      if (containerRect && containerRect.width > 0 && containerRect.height > 0) {
        const fitZoom = Math.min(
          containerRect.width / (vb.width + 40),
          containerRect.height / (vb.height + 40),
          1
        );
        canvasRef.panTo(cx, cy, fitZoom, animate ? 300 : 0);
      } else {
        canvasRef.panTo(cx, cy, 1, 0);
      }
    } else {
      canvasRef.panTo(0, 0, 1, 0);
    }
  }

  /**
   * Core of the milestone: tween between two full Mermaid renders.
   */
  async function animateTo(nextExpanded: Set<string>, toggledId?: string, anchorMx?: number | null, anchorMy?: number | null) {
    if (animating || !diagramHost) return;
    animating = true;
    _status = "Animating...";

    try {
      // 1. Capture old state from currently mounted SVG
      const oldSvg = currentSvg;
      let oldPositions: Positions = { clusters: {}, nodes: {}, edges: {} };
      if (oldSvg) {
        oldPositions = extractPositions(oldSvg);
      }

      // 2. Update logical state and produce new source
      expanded = nextExpanded;
      const newSource = getViewSource(expanded);

      // 3. Render the new full diagram
      const newSvgString = await renderMermaidToSvg(newSource, `mi-${Date.now()}`);
      const newTagged = postProcessAndTag(newSvgString);

      // 4. Mount / replace into the pannable host (pan/zoom transform stays on ancestor)
      // Remove listeners from old if present
      if (currentSvg) {
        currentSvg.removeEventListener("click", onSvgClick);
      }
      if (diagramHost) {
        diagramHost.innerHTML = "";
        diagramHost.appendChild(newTagged);
      }

      currentSvg = newTagged;
      newTagged.setAttribute("width", "100%");
      newTagged.setAttribute("height", "100%");
      newTagged.style.maxWidth = "100%";
      newTagged.style.maxHeight = "100%";
      newTagged.addEventListener("click", onSvgClick, { passive: true });

      // 5. Extract natural positions from the freshly mounted new SVG
      const newPositions = extractPositions(newTagged);

      const hasAnchor = toggledId && anchorMx != null && anchorMy != null;

      // Pin the toggled cluster's center to where the user clicked.
      // After mounting the new SVG, adjust the pan so that the cluster's new
      // world-space center maps to the same viewport position (anchorMx/Y) as before.
      // Formula: panX = anchorMx - newCx * zoom  (from: panX + wx*zoom = viewportX)
      if (hasAnchor && canvasRef && toggledId) {
        const newR = newPositions.clusters[toggledId];
        if (newR) {
          const { zoom } = canvasRef.getViewport();
          const newCx = newR.x + newR.width / 2;
          const newCy = newR.y + newR.height / 2;
          canvasRef.setPan(anchorMx! - newCx * zoom, anchorMy! - newCy * zoom);
        }
      }

      // 6. Prepare start state for matching elements + collect tween descriptors
      type Tween =
        | { kind: "clusterRect"; el: SVGRectElement; from: Rect; to: Rect }
        | { kind: "nodeWrap"; wrapper: SVGGElement; node: SVGGElement; fromX: number; fromY: number }
        | { kind: "enterNode"; el: SVGGElement; centerX: number; centerY: number } // will drive opacity + scale via wrapper
        | { kind: "edgePath"; el: SVGPathElement; fromD: string; toD: string };

      const tweens: Tween[] = [];

      // --- Clusters: drive rect from old to natural new, growing from center ---
      // This makes the clicked block "inflate" outward from its center instead of
      // anchored to its old top-left corner.
      for (const [id, oldR] of Object.entries(oldPositions.clusters)) {
        const newR = newPositions.clusters[id];
        if (!newR) continue;

        const g = newTagged.querySelector(`[data-cluster-id="${id}"]`) as SVGGElement | null;
        if (!g) continue;

        const rect = g.querySelector("rect") as SVGRectElement | null;
        if (rect) {
          const oldCx = oldR.x + oldR.width / 2;
          const oldCy = oldR.y + oldR.height / 2;

          // Initial rect: same *size* as old, but centered at the old visual center
          // (in the new render's coordinate system). The camera correction we computed
          // above will make this land visually where the old cluster was.
          const startX = oldCx - oldR.width / 2;
          const startY = oldCy - oldR.height / 2;

          rect.setAttribute("x", String(startX));
          rect.setAttribute("y", String(startY));
          rect.setAttribute("width", String(oldR.width));
          rect.setAttribute("height", String(oldR.height));

          tweens.push({ kind: "clusterRect", el: rect, from: oldR, to: newR });
        }
      }

      // --- Nodes that existed in both: wrap + start with translate so they begin at old pos ---
      for (const [id, oldR] of Object.entries(oldPositions.nodes)) {
        const newR = newPositions.nodes[id];
        if (!newR) continue;

        const g = newTagged.querySelector(`[data-node-id="${id}"]`) as SVGGElement | null;
        if (!g) continue;

        const natX = newR.x;
        const natY = newR.y;
        const dx = oldR.x - natX;
        const dy = oldR.y - natY;

        // Insert a wrapper g to carry the initial offset
        const parent = g.parentNode as SVGGElement | null;
        if (!parent) continue;

        const wrapper = document.createElementNS("http://www.w3.org/2000/svg", "g");
        wrapper.setAttribute("data-anim-wrapper", "1");
        parent.insertBefore(wrapper, g);
        wrapper.appendChild(g);

        if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
          wrapper.setAttribute("transform", `translate(${dx.toFixed(3)} ${dy.toFixed(3)})`);
        }
        tweens.push({ kind: "nodeWrap", wrapper, node: g, fromX: dx, fromY: dy });
      }

      // --- New interior nodes (in new but not in old): start faded + slightly scaled from the
      // center of the *specific cluster the user clicked*. This + the center-based rect growth
      // makes the subgraph "open up" from its own center.
      const newlyAppearing: string[] = [];
      for (const id of Object.keys(newPositions.nodes)) {
        if (!oldPositions.nodes[id]) newlyAppearing.push(id);
      }

      // Prefer the explicitly toggled cluster's old center.
      let appearOriginX = 0;
      let appearOriginY = 0;
      let usedToggledCenter = false;

      if (toggledId && oldPositions.clusters[toggledId]) {
        const c = oldPositions.clusters[toggledId];
        appearOriginX = c.x + c.width / 2;
        appearOriginY = c.y + c.height / 2;
        usedToggledCenter = true;
      }

      if (!usedToggledCenter) {
        // Fallback to any visible cluster center or origin
        if (Object.keys(oldPositions.clusters).length > 0) {
          const any = Object.values(oldPositions.clusters)[0];
          appearOriginX = any.x + any.width / 2;
          appearOriginY = any.y + any.height / 2;
        }
      }

      for (const id of newlyAppearing) {
        const g = newTagged.querySelector(`[data-node-id="${id}"]`) as SVGGElement | null;
        if (!g) continue;

        const nat = newPositions.nodes[id];
        const cX = nat.x + nat.width / 2;
        const cY = nat.y + nat.height / 2;

        // Wrap for scale + translate from origin
        const parent = g.parentNode as SVGGElement | null;
        if (!parent) continue;

        const wrapper = document.createElementNS("http://www.w3.org/2000/svg", "g");
        wrapper.setAttribute("data-anim-wrapper", "enter");
        wrapper.setAttribute("data-enter-id", id);
        parent.insertBefore(wrapper, g);
        wrapper.appendChild(g);

        // Initial: translate so center is at appearOrigin, + scale(0.35), opacity 0 on the inner g
        const initDx = appearOriginX - cX;
        const initDy = appearOriginY - cY;
        wrapper.setAttribute("transform", `translate(${initDx.toFixed(3)} ${initDy.toFixed(3)}) scale(0.35)`);
        g.style.opacity = "0";

        tweens.push({ kind: "enterNode", el: g, centerX: cX, centerY: cY });
      }

      // --- Edges present in both: prepare for d morph (start at old d) ---
      for (const [id, oldD] of Object.entries(oldPositions.edges)) {
        const newD = newPositions.edges[id];
        if (!newD) continue;

        const path = newTagged.querySelector(`[data-edge-id="${id}"]`) as SVGPathElement | null;
        if (path) {
          path.setAttribute("d", oldD);
          tweens.push({ kind: "edgePath", el: path, fromD: oldD, toD: newD });
        }
      }

      // 7. Run the rAF tween (~320ms)
      const DURATION = 320;
      const start = performance.now();

      await new Promise<void>((resolve) => {
        function frame(now: number) {
          const raw = Math.min(1, (now - start) / DURATION);
          const t = ease(raw);

          for (const tw of tweens) {
            if (tw.kind === "clusterRect") {
              const { el, from, to } = tw;

              // Center-based growth: the box inflates around a moving center.
              // This feels like the cluster is expanding "from its center".
              const oldCx = from.x + from.width / 2;
              const oldCy = from.y + from.height / 2;
              const newCx = to.x + to.width / 2;
              const newCy = to.y + to.height / 2;

              const cx = lerp(oldCx, newCx, t);
              const cy = lerp(oldCy, newCy, t);
              const w = lerp(from.width, to.width, t);
              const h = lerp(from.height, to.height, t);

              const x = cx - w / 2;
              const y = cy - h / 2;

              el.setAttribute("x", String(x));
              el.setAttribute("y", String(y));
              el.setAttribute("width", String(w));
              el.setAttribute("height", String(h));
            } else if (tw.kind === "nodeWrap") {
              const { wrapper, fromX, fromY } = tw;
              const cx = lerp(fromX, 0, t);
              const cy = lerp(fromY, 0, t);
              if (Math.abs(cx) > 0.1 || Math.abs(cy) > 0.1) {
                wrapper.setAttribute("transform", `translate(${cx.toFixed(3)} ${cy.toFixed(3)})`);
              } else {
                wrapper.removeAttribute("transform");
              }
            } else if (tw.kind === "enterNode") {
              const { el } = tw;
              // We stored initial transform on the wrapper; find it
              const w = el.parentNode as SVGGElement | null;
              if (w?.hasAttribute("transform")) {
                // Lerp from the initial (origin + small scale) to identity
                // We don't have the exact numbers here; recompute a smooth toward (0,0) scale(1)
                // Since we set it once, we can drive a fresh wrapper transform each frame for enter nodes.
                // For simplicity we approximate by lerping the whole transform toward identity.
                const cur = w.getAttribute("transform") || "";
                // Parse rough tx ty from current (very small parser)
                const m = /translate\(([^)\s]+)\s+([^)\s]+)\)/.exec(cur);
                let tx = 0, ty = 0;
                if (m) {
                  tx = parseFloat(m[1]) || 0;
                  ty = parseFloat(m[2]) || 0;
                }
                const ntx = lerp(tx, 0, t);
                const nty = lerp(ty, 0, t);
                const ns = lerp(0.35, 1, t);
                w.setAttribute("transform", `translate(${ntx.toFixed(3)} ${nty.toFixed(3)}) scale(${ns.toFixed(3)})`);
              }
              // Fade
              el.style.opacity = String(lerp(0, 1, t));
            } else if (tw.kind === "edgePath") {
              const { el, fromD, toD } = tw;
              const nd = interpolatePathD(fromD, toD, t);
              el.setAttribute("d", nd);
            }
          }

          if (raw < 1) {
            requestAnimationFrame(frame);
          } else {
            // 8. Cleanup: unwrap, restore natural state, remove temp styles
            cleanupAfterTween(newTagged);

            resolve();
          }
        }
        requestAnimationFrame(frame);
      });

      _status = "Done. Click blocks to toggle (repeatable).";
    } catch (e) {
      console.error(e);
      _status = "Animation error (see console)";
      // Fallback: just render the target state cleanly
      await renderCurrent();
    } finally {
      animating = false;
    }
  }

  function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  function cleanupAfterTween(svgEl: SVGSVGElement) {
    // Unwrap any anim wrappers, move children back, clear forced styles/attrs
    svgEl.querySelectorAll("[data-anim-wrapper]").forEach((w) => {
      const wrapper = w as SVGGElement;
      const parent = wrapper.parentNode as SVGGElement | null;
      if (!parent) return;

      // Move all children (the original node g or content) back to parent
      while (wrapper.firstChild) {
        parent.insertBefore(wrapper.firstChild, wrapper);
      }
      parent.removeChild(wrapper);
    });

    // Ensure enter nodes are fully visible and have no leftover scale
    svgEl.querySelectorAll("[data-enter-id]").forEach((g) => {
      (g as SVGGElement).style.opacity = "";
      const w = g.parentNode as SVGGElement | null;
      if (w) w.removeAttribute("transform");
    });

    // For any cluster rects we may have left at final values; set them once more from current getBBox to be sure
    // (no-op in practice because at t=1 they match)
    svgEl.querySelectorAll("[data-cluster-id]").forEach((g) => {
      const rect = g.querySelector("rect") as SVGRectElement | null;
      if (!rect) return;
      // Nothing to force; the last frame already set the final numbers.
    });

    // Edges are already at their final d from last frame or natural.
  }

  // Initial render
  onMount(async () => {
    // Start fully collapsed (two nested blocks)
    expanded = new Set<string>();
    await tick();
    await renderCurrent();
    // Modest initial offset so the (now more complex) diagram isn't jammed in the corner on first load.
    // After this the user's pan/zoom is never automatically changed on expansions.
    resetView(false);
    _status = "Ready. Drag to pan • Ctrl+Wheel to zoom • Click cluster blocks";
  });
</script>

<div class="mi-root">
  <div class="mi-header">
    <div class="mi-title">Mermaid Inspector — Prototype</div>
    <div class="mi-sub">
      {_status} • Drag background to pan • Wheel to zoom • Click colored cluster blocks to expand/collapse
      <button class="mi-reset" onclick={() => resetView(true)}>Reset view</button>
    </div>
  </div>

  <div class="mi-canvas">
    <!-- Use the stolen whole Canvas from viewpoint demo.
         It provides the correct pannable/zoomable viewport + world transform.
         Our diagram-host (which receives the dynamic Mermaid SVG) goes inside as children.
         Re-check panning/zooming after this integration. -->
    <Canvas bind:this={canvasRef}>
      <!-- Host for mounting/replacing the Mermaid SVG on state changes (expand/collapse).
           The Canvas's world layer will apply the pan/zoom transform to it. -->
      <div
        class="mi-diagram-host"
        bind:this={diagramHost}
      ></div>
    </Canvas>
  </div>
</div>

<style>
  :global(.mi-canvas svg) {
    display: block;
    width: 100%;
    height: 100%;
  }

  /* Make cluster blocks look clearly clickable */
  :global(.mi-canvas g[data-cluster-id]) {
    cursor: pointer;
  }

  /* Subtle hover affordance on clusters (keeps Mermaid visuals otherwise) */
  :global(.mi-canvas g[data-cluster-id] rect) {
    transition: filter 80ms linear;
  }
  :global(.mi-canvas g[data-cluster-id]:hover rect) {
    filter: brightness(0.96) saturate(1.02);
  }

  /* Keep edge labels (if any non-internal) readable */
  :global(.mi-canvas .edgeLabel) {
    font-size: 10px;
  }
</style>
