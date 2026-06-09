<script lang="ts">
    import { onMount } from "svelte";
    import { DEMO_MERMAID, parseFlowchart } from "../parser";
    import { computeLayout } from "../layout";
    import type { GraphModel, LayoutEdge, LayoutResult } from "../types";

    // --- Model (hardcoded input string, parsed once) ---
    const model: GraphModel = parseFlowchart(DEMO_MERMAID);

    // Expanded scopes (start collapsed)
    let expanded = $state<Set<string>>(new Set());

    // Current target layout from dagre (recomputed when expanded changes)
    const layout = $derived(computeLayout(model, expanded));

    // Animated display positions (lerped). Keys are layout ids: nodeId or "cluster:scopeId"
    type Pos = { x: number; y: number; w: number; h: number };
    let display = $state<Record<string, Pos>>({});

    // Plain (non-rune) snapshots. These are only read/written inside the layout $effect (and onMount for init).
    // Using plain lets instead of $state prevents the effect from tracking them as dependencies.
    // This stops effect_update_depth_exceeded during the initial mount/onOpen when the effect
    // seeds display and snapshots while other mount-time work is happening.
    let previousTargetSnapshot: Record<string, Pos> = {};
    let lastClusterCenters: Record<string, { x: number; y: number }> = {};

    let animating = false;

    function scheduleTick() {
        if (animating) return;
        animating = true;
        requestAnimationFrame(tick);
    }

    function tick() {
        let stillMoving = false;
        const L = layout;
        const next: Record<string, Pos> = { ...display };

        // Linear-ish lerp factor per frame (tuned for ~300-400ms feel at 60fps)
        const k = 0.2;

        for (const [id, target] of Object.entries(L.nodes)) {
            let cur = next[id];
            if (!cur) {
                cur = {
                    x: isFinite(target.x) ? target.x : 0,
                    y: isFinite(target.y) ? target.y : 0,
                    w: target.width,
                    h: target.height,
                };
            }

            const tx = isFinite(target.x) ? target.x : 0;
            const ty = isFinite(target.y) ? target.y : 0;
            const nx = cur.x + (tx - cur.x) * k;
            const ny = cur.y + (ty - cur.y) * k;

            const moved = Math.abs(nx - tx) > 0.6 || Math.abs(ny - ty) > 0.6;

            if (moved) {
                stillMoving = true;
                next[id] = {
                    x: nx,
                    y: ny,
                    w: target.width,
                    h: target.height,
                };
            } else {
                next[id] = {
                    x: tx,
                    y: ty,
                    w: target.width,
                    h: target.height,
                };
            }
        }

        // Remove anything no longer present
        for (const k of Object.keys(next)) {
            if (!L.nodes[k]) delete next[k];
        }

        display = next;

        if (stillMoving) {
            requestAnimationFrame(tick);
        } else {
            animating = false;
        }
    }

    // React to every new layout: seed display for new items (birth from cluster) and kick anim.
    // IMPORTANT: We deliberately avoid reading the *animating* `display` rune inside this effect
    // (we use the plain previousTargetSnapshot instead). Reading + writing runes that an effect
    // depends on during mount is a common source of effect_update_depth_exceeded.
    $effect(() => {
        const L = layout;
        const nextDisplay: Record<string, Pos> = {};
        const nowTargets: Record<string, Pos> = {};

        for (const [id, n] of Object.entries(L.nodes)) {
            nowTargets[id] = { x: n.x, y: n.y, w: n.width, h: n.height };
        }

        for (const [id, t] of Object.entries(nowTargets)) {
            // Use only the plain previousTargetSnapshot (populated from prior layout targets).
            // Never read rune state for "previous" inside this effect.
            const previous = previousTargetSnapshot[id];
            if (previous && isFinite(previous.x) && isFinite(previous.y)) {
                if (id.startsWith("cluster:")) {
                    // Expand the cluster box from its previous center outwards instead of
                    // top-left corner. We initialize the display entry with the old size
                    // but positioned so its center matches the old center. The normal lerp
                    // will then grow w/h while the center drifts toward the final dagre
                    // position (as outer nodes react to the growth).
                    const oldCx = previous.x + previous.w / 2;
                    const oldCy = previous.y + previous.h / 2;
                    const initW = previous.w;
                    const initH = previous.h;
                    nextDisplay[id] = {
                        x: oldCx - initW / 2,
                        y: oldCy - initH / 2,
                        w: initW,
                        h: initH,
                    };
                } else {
                    nextDisplay[id] = { ...previous };
                }
            } else {
                // New item: birth near the last known center of its owning (now expanded) cluster.
                // lastClusterCenters is also a plain object, updated only from this effect.
                let birth: Pos | null = null;
                if (!id.startsWith("cluster:")) {
                    for (const [sid, sc] of Object.entries(model.scopes)) {
                        if (sc.nodeIds.includes(id)) {
                            const c =
                                lastClusterCenters[sid] ??
                                previousTargetSnapshot[`cluster:${sid}`];
                            if (c && isFinite(c.x) && isFinite(c.y)) {
                                birth = {
                                    x: c.x - t.w / 2,
                                    y: c.y - t.h / 2,
                                    w: t.w,
                                    h: t.h,
                                };
                                break;
                            }
                        }
                    }
                }
                nextDisplay[id] = birth ?? { ...t };
            }
        }

        // Update cluster centers for future births using the outgoing snapshot.
        // (plain object - no rune, no effect dependency)
        for (const [id, p] of Object.entries(previousTargetSnapshot)) {
            if (id.startsWith("cluster:")) {
                const sid = id.slice(8);
                if (isFinite(p.x) && isFinite(p.y)) {
                    lastClusterCenters[sid] = {
                        x: p.x + p.w / 2,
                        y: p.y + p.h / 2,
                    };
                }
            }
        }

        // Store the targets we just saw as the snapshot for the *next* layout change.
        previousTargetSnapshot = nowTargets;
        display = nextDisplay;

        scheduleTick();
    });

    // Toggle expand/collapse for a scope. Recomputes layout (derived) and triggers animation.
    function toggleCluster(scopeId: string) {
        const next = new Set(expanded);
        if (next.has(scopeId)) {
            next.delete(scopeId);
        } else {
            next.add(scopeId);
        }
        expanded = next;
    }

    // Which scopes currently participate in visual clusters (collapsed proxy or expanded container)
    const activeClusterIds = $derived.by(() => {
        const ids: string[] = [];
        for (const sid of Object.keys(model.scopes)) {
            const hasProxy = !!layout.collapsedClusters[sid];
            const hasMembers = getClusterMemberIds(sid).length > 0;
            if (hasProxy || hasMembers) ids.push(sid);
        }
        return ids;
    });

    function getClusterMemberIds(scopeId: string): string[] {
        const sc = model.scopes[scopeId];
        if (!sc) return [];
        const out: string[] = [...sc.nodeIds];
        function walk(childId: string) {
            const c = model.scopes[childId];
            if (!c) return;
            if (expanded.has(childId)) {
                out.push(...c.nodeIds);
                for (const g of c.subscopeIds) walk(g);
            }
        }
        for (const ch of sc.subscopeIds) walk(ch);
        return out.filter((nid) => display[nid] || layout.nodes[nid]);
    }

    function getLiveClusterBox(
        scopeId: string,
    ): { x: number; y: number; w: number; h: number } | null {
        const sc = model.scopes[scopeId];
        if (!sc) return null;

        // Prefer the cluster node's own geometry from the (compound) dagre layout.
        // This is the key fix: the expanded block is the *same* `cluster:xxx` node
        // in the graph, just with a bigger width/height that dagre computed to contain
        // its children. We draw "the node" using its own size instead of dissolving
        // the cluster and unioning children.
        const cl =
            display[`cluster:${scopeId}`] ??
            layout.collapsedClusters[scopeId] ??
            layout.nodes[`cluster:${scopeId}`];

        if (cl) {
            // Use the authoritative cluster box (small when collapsed, large when expanded).
            // For expanded scopes we add extra visual padding so that nodes near the
            // edge + outward-bulging edges (and arrowheads) stay inside the drawn
            // bounding container rect.
            const basePad = 6;
            const isExpanded = expanded.has(scopeId);
            const extra = isExpanded ? 18 : 0;
            const PAD = basePad + extra;
            return {
                x: cl.x - PAD,
                y: cl.y - PAD,
                w: cl.w + PAD * 2,
                h: cl.h + PAD * 2,
            };
        }

        // Fallback (should rarely be needed now): union of current member positions.
        const members = getClusterMemberIds(scopeId);
        if (members.length === 0) return null;

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        for (const nid of members) {
            const p = display[nid] ?? layout.nodes[nid];
            if (!p) continue;
            const px = isFinite(p.x) ? p.x : 0;
            const py = isFinite(p.y) ? p.y : 0;
            const pw = isFinite(p.w) ? p.w : 0;
            const ph = isFinite(p.h) ? p.h : 0;
            minX = Math.min(minX, px);
            minY = Math.min(minY, py);
            maxX = Math.max(maxX, px + pw);
            maxY = Math.max(maxY, py + ph);
        }

        if (!isFinite(minX)) return null;

        const PAD = 16;
        const LABEL = 18;
        return {
            x: minX - PAD,
            y: minY - PAD - LABEL,
            w: maxX - minX + PAD * 2,
            h: maxY - minY + PAD * 2 + LABEL,
        };
    }

    interface Rect {
        x: number;
        y: number;
        w: number;
        h: number;
    }

    /**
     * Compute a point on the boundary of the rectangle that faces toward the target point.
     * This makes arrows attach to the sides/edges of nodes instead of their centers,
     * which is how real Mermaid flowcharts look.
     */
    function getAttachmentPoint(rect: Rect, target: { x: number; y: number }): { x: number; y: number } {
        const cx = rect.x + rect.w / 2;
        const cy = rect.y + rect.h / 2;
        const dx = target.x - cx;
        const dy = target.y - cy;

        // Always attach to the exact middle of the dominant side.
        // This keeps arrows coming out of the middle of the edge instead of sliding toward corners.
        if (Math.abs(dx) > Math.abs(dy)) {
            // horizontal connection: use left or right middle
            if (dx >= 0) {
                return { x: rect.x + rect.w, y: cy }; // right middle
            } else {
                return { x: rect.x, y: cy }; // left middle
            }
        } else {
            // vertical connection: use top or bottom middle
            if (dy >= 0) {
                return { x: cx, y: rect.y + rect.h }; // bottom middle
            } else {
                return { x: cx, y: rect.y }; // top middle
            }
        }
    }

    function edgePath(e: LayoutEdge): string | null {
        const aRaw = display[e.from] ?? layout.nodes[e.from];
        const bRaw = display[e.to] ?? layout.nodes[e.to];
        if (!aRaw || !bRaw) return null;

        const aRect: Rect = {
            x: isFinite(aRaw.x) ? aRaw.x : 0,
            y: isFinite(aRaw.y) ? aRaw.y : 0,
            w: isFinite(aRaw.w) ? aRaw.w : 0,
            h: isFinite(aRaw.h) ? aRaw.h : 0,
        };
        const bRect: Rect = {
            x: isFinite(bRaw.x) ? bRaw.x : 0,
            y: isFinite(bRaw.y) ? bRaw.y : 0,
            w: isFinite(bRaw.w) ? bRaw.w : 0,
            h: isFinite(bRaw.h) ? bRaw.h : 0,
        };

        const aCenter = { x: aRect.x + aRect.w / 2, y: aRect.y + aRect.h / 2 };
        const bCenter = { x: bRect.x + bRect.w / 2, y: bRect.y + bRect.h / 2 };

        const start = getAttachmentPoint(aRect, bCenter);
        const end = getAttachmentPoint(bRect, aCenter);

        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const dist = Math.hypot(dx, dy) || 1;

        // More predictable control points: go outward from the attachment side
        // by a distance proportional to the edge length. This reduces the "wacky"
        // curves that always aimed at centers.
        const out = Math.max(18, dist * 0.28);

        let c1x = start.x;
        let c1y = start.y;
        let c2x = end.x;
        let c2y = end.y;

        // Determine primary direction from the attachment sides
        if (Math.abs(dx) >= Math.abs(dy)) {
            // mostly horizontal — push controls horizontally outward from sides
            c1x = start.x + Math.sign(dx || 1) * out;
            c2x = end.x - Math.sign(dx || 1) * out;
            // small vertical bias toward the target
            c1y = start.y + dy * 0.15;
            c2y = end.y - dy * 0.15;
        } else {
            // mostly vertical
            c1y = start.y + Math.sign(dy || 1) * out;
            c2y = end.y - Math.sign(dy || 1) * out;
            c1x = start.x + dx * 0.15;
            c2x = end.x - dx * 0.15;
        }

        return `M ${start.x},${start.y} C ${c1x},${c1y} ${c2x},${c2y} ${end.x},${end.y}`;
    }

    function getNodeLabel(id: string): string {
        if (id.startsWith("cluster:")) {
            const sid = id.slice(8);
            return model.scopes[sid]?.label ?? sid;
        }
        return model.nodes[id]?.label ?? id;
    }

    // Seed initial positions immediately (no fly-in from origin on first paint).
    // Only seed if we don't already have a display (the layout $effect usually populates first).
    // We only touch the rendering `display` rune and the plain snapshots here.
    onMount(() => {
        if (Object.keys(display).length > 0) return;
        const L = layout;
        const seed: Record<string, Pos> = {};
        for (const [id, n] of Object.entries(L.nodes)) {
            seed[id] = {
                x: isFinite(n.x) ? n.x : 0,
                y: isFinite(n.y) ? n.y : 0,
                w: n.width,
                h: n.height,
            };
        }
        display = seed;
        previousTargetSnapshot = { ...seed };
    });
</script>

<div class="mi-root">
    <div class="mi-header">
        <div class="mi-title">Mermaid Inspector — Milestone 1</div>
        <div class="mi-sub">
            Hardcoded nested flowchart • parsed locally • dagre layout • custom
            SVG • click clusters to expand/collapse
        </div>
    </div>

    <div class="mi-canvas">
        <svg class="mi-svg" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <marker
                    id="mi-arrow"
                    viewBox="0 0 10 7"
                    refX="9"
                    refY="3.5"
                    markerWidth="7"
                    markerHeight="7"
                    orient="auto"
                >
                    <path d="M0 0 L10 3.5 L0 7 Z" fill="var(--text-faint)" />
                </marker>
            </defs>

            <!-- Cluster container backgrounds for *expanded* scopes.
			     These use the persistent cluster node's own size/position from the
			     compound dagre layout ("the same node, just bigger"). Children are
			     drawn later and appear inside the grown box. -->
            {#each activeClusterIds as sid (sid)}
                {#if expanded.has(sid)}
                    {@const box = getLiveClusterBox(sid)}
                    {#if box}
                        <g
                            class="cluster-container"
                            onclick={() => toggleCluster(sid)}
                        >
                            <rect
                                x={box.x}
                                y={box.y}
                                width={box.w}
                                height={box.h}
                                rx="10"
                                ry="10"
                                fill="color-mix(in srgb, var(--background-secondary) 55%, transparent)"
                                stroke="var(--background-modifier-border)"
                                stroke-width="1.5"
                            />
                            <text
                                x={box.x + 10}
                                y={box.y + 15}
                                font-size="11"
                                font-weight="600"
                                fill="var(--text-muted)"
                                style="pointer-events: none; user-select: none;"
                            >
                                {model.scopes[sid]?.label ?? sid}
                            </text>
                        </g>
                    {/if}
                {/if}
            {/each}

            <!-- Edges (use current display positions) -->
            {#each layout.edges as e (e.from + "::" + e.to)}
                {@const d = edgePath(e)}
                {#if d}
                    <path
                        {d}
                        fill="none"
                        stroke="var(--text-faint)"
                        stroke-width="1.75"
                        marker-end="url(#mi-arrow)"
                        style="pointer-events: none;"
                    />
                    {#if e.label}
                        {@const aRaw = display[e.from] ?? layout.nodes[e.from]}
                        {@const bRaw = display[e.to] ?? layout.nodes[e.to]}
                        {@const a =
                            aRaw && isFinite(aRaw.x) && isFinite(aRaw.y)
                                ? aRaw
                                : null}
                        {@const b =
                            bRaw && isFinite(bRaw.x) && isFinite(bRaw.y)
                                ? bRaw
                                : null}
                        {#if a && b}
                            <g style="pointer-events: none;">
                                <rect
                                    x={(a.x + a.w / 2 + (b.x + b.w / 2)) / 2 -
                                        (e.label.length * 3.2 + 6)}
                                    y={(a.y + a.h / 2 + (b.y + b.h / 2)) / 2 -
                                        12}
                                    width={e.label.length * 6.4 + 12}
                                    height="15"
                                    rx="3"
                                    fill="var(--background-primary)"
                                    stroke="var(--background-modifier-border)"
                                    stroke-width="0.5"
                                    opacity="0.9"
                                />
                                <text
                                    x={(a.x + a.w / 2 + (b.x + b.w / 2)) / 2}
                                    y={(a.y + a.h / 2 + (b.y + b.h / 2)) / 2 -
                                        1}
                                    font-size="10"
                                    fill="var(--text-muted)"
                                    text-anchor="middle"
                                >
                                    {e.label}
                                </text>
                            </g>
                        {/if}
                    {/if}
                {/if}
            {/each}

            <!-- Regular nodes -->
            {#each Object.entries(display) as [id, p] (id)}
                {#if !id.startsWith("cluster:")}
                    <g
                        class="node"
                        transform="translate({p.x} {p.y})"
                        onclick={(e) => e.stopPropagation()}
                    >
                        <rect
                            width={p.w}
                            height={p.h}
                            rx="8"
                            ry="8"
                            fill="var(--background-primary)"
                            stroke="var(--background-modifier-border)"
                            stroke-width="1"
                        />
                        <text
                            x={p.w / 2}
                            y={p.h / 2}
                            text-anchor="middle"
                            dominant-baseline="middle"
                            font-size="13"
                            fill="var(--text-normal)"
                            style="pointer-events: none;"
                        >
                            {getNodeLabel(id)}
                        </text>
                    </g>
                {/if}
            {/each}

            <!-- Cluster boxes for collapsed scopes (dashed "proxy" style).
			     For expanded scopes the persistent cluster node is drawn earlier via
			     the activeClusterIds containers using its own (large) dagre size. -->
            {#each Object.entries(display) as [id, p] (id)}
                {#if id.startsWith("cluster:")}
                    {@const sid = id.slice(8)}
                    {#if !expanded.has(sid)}
                        <g
                            class="cluster-collapsed"
                            transform="translate({p.x} {p.y})"
                            onclick={() => toggleCluster(sid)}
                        >
                            <rect
                                width={p.w}
                                height={p.h}
                                rx="8"
                                ry="8"
                                fill="var(--background-secondary)"
                                stroke="var(--interactive-accent)"
                                stroke-width="2"
                                stroke-dasharray="5 3"
                            />
                            <text
                                x={p.w / 2}
                                y={p.h / 2 + 4}
                                text-anchor="middle"
                                font-size="11"
                                font-weight="600"
                                fill="var(--text-muted)"
                                style="pointer-events: none; dominant-baseline: middle;"
                            >
                                {getNodeLabel(id)}
                            </text>
                            <text
                                x={p.w - 8}
                                y={p.h - 6}
                                font-size="10"
                                fill="var(--text-faint)"
                                text-anchor="end"
                                style="pointer-events: none;">…</text
                            >
                        </g>
                    {/if}
                {/if}
            {/each}
        </svg>
    </div>

    <div class="mi-footer">
        Click a <span class="cluster-hint">dashed cluster</span> to expand it. Click
        the background region of an expanded cluster to collapse it back. Animation
        uses position lerping + live cluster bounds. Pure custom SVG (no mermaid.render).
    </div>
</div>

<style>
    .mi-root {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        background: var(--background-primary);
        overflow: hidden;
    }

    .mi-header {
        padding: 8px 14px 4px;
        border-bottom: 1px solid var(--background-modifier-border);
        flex-shrink: 0;
    }

    .mi-title {
        font-weight: 600;
        font-size: 13px;
        color: var(--text-normal);
    }

    .mi-sub {
        font-size: 11px;
        color: var(--text-muted);
        margin-top: 1px;
    }

    .mi-canvas {
        flex: 1;
        position: relative;
        overflow: auto;
        background: var(--background-primary);
    }

    .mi-svg {
        display: block;
        width: 100% !important;
        height: 100% !important;
        min-width: 0 !important;
        min-height: 0 !important;
    }

    /* Make sure the plugin view takes the full available space in Obsidian
	   (the "screen" size for the container of all nodes). The svelte-scoped
	   .mi-svg (which gets the extra svelte-xxx class) will now be the full
	   size of the canvas instead of a small fixed bounding box. */
    :global(.view-content) {
        padding: 0 !important;
    }

    /* Force the diagram container (mi-svg + its svelte hash) to be full available size.
       This overrides any stale min-width/min-height:980px/640px that may be emitted
       for .mi-svg.svelte-xxx from previous builds or other style blocks. */
    .mi-svg {
        min-width: 0 !important;
        min-height: 0 !important;
        width: 100% !important;
        height: 100% !important;
    }

    .mi-footer {
        padding: 6px 12px;
        font-size: 11px;
        color: var(--text-muted);
        border-top: 1px solid var(--background-modifier-border);
        flex-shrink: 0;
        background: var(--background-secondary);
    }

    .cluster-hint {
        padding: 1px 5px;
        border: 1px dashed var(--interactive-accent);
        border-radius: 3px;
        background: var(--background-secondary);
    }

    /* SVG element styles */
    :global(.cluster-container) {
        cursor: pointer;
    }
    :global(.cluster-container rect) {
        transition:
            x 120ms linear,
            y 120ms linear,
            width 120ms linear,
            height 120ms linear;
    }
    :global(.cluster-collapsed) {
        cursor: pointer;
    }
    :global(.node rect) {
        transition: fill 80ms ease;
    }
    :global(.node:hover rect) {
        fill: var(--background-modifier-hover);
    }
</style>
