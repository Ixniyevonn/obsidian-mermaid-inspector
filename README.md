# Obsidian Mermaid Inspector

Custom view for `.mmd` Mermaid files that makes **subgraphs first-class, inspectable containers**.

Subgraphs render as distinct collapsed blocks by default. Click to expand a block in place; it becomes the focused scope. Ancestor scopes stay visible with progressive fade + depth. Nested subgraphs remain collapsed until inspected. The interaction is liquid, animated, non-destructive navigation of the hierarchy. No source mutation.

## Features
- Dedicated inspector view for `.mmd` (via registerExtensions + custom View)
- Stable collapsed shell render + separately rendered interiors composited into clusters
- Focus path (breadcrumb, left-click mode) + inline expand (right-click) modes
- Progressive fade on non-focused regions; click faded area or Esc to ascend
- Pan/zoom viewport (SVG group transform or svg-pan-zoom)
- Theme-aware via Obsidian CSS vars + mermaid config sync
- Supports deeply nested flowchart `subgraph ... end` and stateDiagram-v2 `state X { ... }`
- Boundary ports (`ScopeId__in` / `ScopeId__out`) for clean scope crossing; external edges terminate on containers

## Design Principles
- Expanding a scope always produces a correct non-overlapping layout: Mermaid re-renders from updated source so surrounding nodes and edges move to accommodate the larger cluster. Incoming/outgoing arrows never overlap expanded blocks. The collapsed render is only the initial position template.
- All layout changes are accompanied by smooth position and path tweens so elements visibly move out of the way.
- Focus + context with progressive fade on non-focused regions.
- Recursive scope rules for nested subgraphs and state composites.
- Explicit in/out ports on collapsed blocks; generators keep wiring level-correct.

## Implementation Architecture

### Re-render + Tween Animation Approach

This is the simplest way to get correct layouts + smooth "everything moves" animation while still using Mermaid for all visuals.

**Core idea**
- For any focus/expand state, **generate the full Mermaid source** with the appropriate scopes expanded or collapsed.
- Render it with `mermaid.render()` → get a complete, correctly laid-out SVG.
- To expand a subgraph: render the *old* state and the *new* state, extract positions of every element (nodes, edges, cluster rects), then **tween** matching elements from old coordinates to new coordinates.
- This gives perfect non-overlapping layouts (Mermaid's strength) + liquid movement.

**Why previous attempts failed**
Previous implementations usually:
- Tried to patch a single live SVG (brittle).
- Replaced the whole SVG without mapping elements (causes jumps).
- Did not add stable identifiers before rendering.
- Did not handle cluster rect growth + interior fade-in properly.
- Had no good path morphing for edges.

**How to make it succeed (critical requirements)**
1. **Stable IDs across renders**:
   - After `mermaid.render()`, post-process the SVG and add `data-node-id`, `data-edge-id`, `data-cluster-id` attributes using the original Mermaid node/edge/cluster names.
   - Use a consistent naming scheme (never rely on Mermaid's internal `id` attributes).

2. **Before/After mapping**:
   - Keep the previous SVG (or extract positions into a Map before replacing).
   - Build a map: `stableId → {bbox, transform, path d, element}` for old and new.

3. **Tween logic (FLIP-style or manual)**:
   - For matching elements: set the new element's initial transform so it starts at the old position/size.
   - Animate (Svelte transition or rAF (CSS will fail when there's a lot of elements)) to the natural final position.
   - Cluster rects: animate `x, y, width, height`.
   - Edges: morph the `d` attribute (simple point lerp or use a small path interpolator).
   - New elements (interior nodes when expanding): fade in + scale from 0.8.
   - Removed elements: fade out.

4. **Performance**:
   - Memoize renders by (source hash + focus state).
   - Only re-render when focusPath actually changes the expanded set.

**Implementation flow for expand**
1. Current source (with target subgraph collapsed) → render → add stable data-* attrs → extract positions map (old).
2. Generate new source (target subgraph now expanded/inlined) → render → add stable data-* attrs.
3. Mount the new SVG (or replace content).
4. For every element that exists in both maps: apply initial transform from old position → animate to final.
5. Handle cluster rect growth and interior content fade-in/scale.
6. After animation completes, clean up any temporary old groups.

This approach lets Mermaid do 100% of the layout work while you only add the animation layer on top. It is generally easier to implement than a full custom node/edge renderer for the first working prototype.

### Svelte 5 Integration (runes)
- The view owns the reactive model (`nodes`, `edges`, `scopes` with current positions and expanded state).
- On focus change: update model → (optionally) request new layout snapshot from Mermaid → tween model coordinates → Svelte renders updated SVG elements.
- All clicks, fades, and state live in the Svelte component and act directly on the model.
- The rendered SVG is always produced by the app from the model, never by keeping a Mermaid-generated tree alive after snapshot extraction.

### Obsidian View Glue
Mirror your `obsidian-viewpoint` example exactly:
- `main.ts`: `registerView(VIEW_TYPE, leaf => new MermaidInspectorView(leaf))`; `registerExtensions(['mmd'], VIEW_TYPE)`.
- View extends `TextFileView` (or ItemView + manual file watch) so it can react to external edits of the .mmd.
- Load file content → feed to model → first compose with empty focusPath (all collapsed).
- Save is no-op or delegates to source mode leaf (inspector is primarily read/visual navigation).

### Risks & Mitigations
- Mermaid cluster id naming may change across versions: `extractScopeIdFromClusterId` must be tolerant (regex on id + fallback to label text match).
- Re-render cost grows with diagram size and focus depth: generators and renders are memoized by content hash; only changed scopes trigger re-render.
- Viewport must support pan and zoom so the diagram remains usable after layout shifts.
- Parser must correctly classify boundary-crossing edges so generators can attach them to ports.
- stateDiagram-v2 composites use identical scope model and generator rules as flowchart subgraphs.
## Embed in a Markdown note

Embed an `.mmd` diagram with Obsidian's standard internal-embed syntax:

```md
![[Diagrams/Example.mmd]]
```

Embedded inspectors use a compact view with only a Fit icon. Expansion, focus, pan, and zoom are persisted separately for each host Markdown file and embedded diagram.