# Obsidian Mermaid Inspector

Custom view for `.mmd` Mermaid files that makes **subgraphs first-class, inspectable containers**.

Subgraphs render as distinct collapsed blocks by default. Click to expand a block in place; it becomes the focused scope. Ancestor scopes stay visible with progressive fade + depth. Nested subgraphs remain collapsed until inspected. The interaction is liquid, animated, non-destructive navigation of the hierarchy. No source mutation.

## Features
- Dedicated inspector view for `.mmd` (via registerExtensions + custom View)
- Stable collapsed shell render + separately rendered interiors composited into clusters
- Focus path (breadcrumb) + inline expand (right-click) modes
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
- **Strict subgraph boundary rule**: In source files, no edge may ever directly connect a node outside a subgraph to a node inside that subgraph (or vice-versa). All cross-boundary connections must be made *to the subgraph identifier itself*. If an author wants visible entry/exit points they must manually introduce explicit input/output nodes *inside* the subgraph and wire to those. The inspector never automates, rewrites, or "fixes" direct cross-boundary node edges — such diagrams are simply invalid for this tool. (This rule is enforced by authoring correct sources; the parser and layout do not synthesize ports for malformed crossings.)
- Explicit in/out ports on collapsed blocks; generators keep wiring level-correct.

## Implementation Architecture

### Pipeline (strict order)
```
.mmd source
  → Parser (stack-based scope tree + boundary edges)
  → Model (Scope[], Node[], Edge[] with scope membership)
  → Generators (produce full Mermaid source for current focus state:
       all scopes collapsed except those on focusPath, which are expanded/inlined)
  → Render (mermaid.render → correct layout for current state)
  → Position map (extract node/cluster/edge positions from SVG)
  → On focus change: new source → new render → tween animation
       (every element moves from old pos to new pos + path morph)
  → Svelte viewport (SVG mount + delegated clicks + pan/zoom + runes state)
```

### Data Model (reference)
```ts
interface Scope {
  id: string;           // stable, sanitized from source (e.g. "Eng", "Platform")
  title?: string;
  parentId: string | null;
  childIds: string[];
  directNodeIds: string[];
  directEdgeIds: string[];
  depth: number;
}

interface DiagramModel {
  type: 'flowchart' | 'stateDiagram-v2';
  scopes: Map<string, Scope>;
  nodes: Map<string, any>;   // id → {label, shape, ...}
  edges: Map<string, any>;   // id → {source, target, ...}
  rootScopeId: string;       // ""
}
```
All subsequent stages operate only on this model. No string regex after parsing.

### Parser
Stack-based extractor:
- Detect diagram type from first non-comment line.
- For flowchart: match `subgraph\s+(\S+)(?:\s*\[([^\]]+)\])?` … `end`, push/pop scope, collect direct statements.
- For stateDiagram-v2: match `state\s+(\S+)\s*\{` … `\}`, same nesting logic.
- Record raw spans for later interior extraction.
- Post-pass: classify every edge as internal or boundary; attach boundary edges to nearest port of the child scope.
- Id sanitization: keep original ids; ports become `${id}__in` / `${id}__out`.
- Error mode: on parse failure fall back to plain mermaid.render with warning banner.

Test vector: every file under `demo/` + `Getting-Started.mmd`. Parser must be 100% deterministic and round-trippable for the generators.

### Generators
Two pure functions.

**generateShell(model, focusPath)**  
Emits top-level source:
- All top-level nodes + every scope (even deep) declared as `subgraph id [title] ... end`.
- Inside each scope block: only the two port nodes (styled small/dotted, no label or special class).
- All boundary edges rewritten to terminate on the child scope's `__in` or `__out` port.
- Direction / theme directives preserved from original.
Result: minimal-size clusters, stable layout, ports visible inside collapsed blocks.

**generateInterior(scopeId, model, focusPath)**  
Emits standalone diagram for exactly that scope:
- Its direct nodes + direct edges.
- Its child scopes rendered as collapsed (their own ports only).
- Own `__in` / `__out` ports.
- Internal edges unchanged; edges that originally left the scope now attach to the scope's out-port (or in-port on the other side).
- Subgraph direction inherited or explicit.

Both generators are memoizable by (model hash + focusPath). Output is validated by rendering in mermaid.live.

### Animated Re-layout Renderer (core)

**Hard constraint:** The `mermaid` npm package must **never** be used for layout or rendering.

Mermaid syntax is accepted **only** as input file format. The system parses it into an internal model and then owns layout + rendering completely.

Flow for flowcharts:

1. Parser converts Mermaid flowchart source into model:
   - nodes (id, label, shape)
   - edges (source, target)
   - scopes/subgraphs (nesting, children, expanded flag)

2. Layout is computed by **dagre** directly on the current model state.

3. Renderer (Svelte component) draws everything from the model using its own SVG elements. No Mermaid SVG is ever kept or animated.

4. On expand/collapse:
   - Update model (toggle expanded scope, show/hide children)
   - Re-run dagre layout
   - Tween node positions, cluster bounds and edge paths in the model
   - Svelte reactivity updates the visual elements

All control and animation lives in the app-owned model. This is mandatory for reliable smooth movement.

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

### Phased Implementation Order
1. Parser + DiagramModel (pure, tested against all demo/*.mmd).
2. Generators (produce correct collapsed vs expanded-in-focusPath source). Validate output in mermaid.live.
3. Animated re-layout prototype (standalone): collapsed render → click expands via new source + position tween. No overlaps, smooth movement.
4. Add progressive fade, multi-level focusPath, caching, inline expand mode.
5. Svelte 5 integration (runes for focusPath, delegated events, breadcrumb).
6. Pan/zoom viewport + Obsidian custom view registration + theme sync.
7. Ports, stateDiagram-v2 specifics, error handling, performance.

### Risks & Mitigations
- Mermaid cluster id naming may change across versions: `extractScopeIdFromClusterId` must be tolerant (regex on id + fallback to label text match).
- Re-render cost grows with diagram size and focus depth: generators and renders are memoized by content hash; only changed scopes trigger re-render.
- Viewport must support pan and zoom so the diagram remains usable after layout shifts.
- Parser must correctly classify boundary-crossing edges so generators can attach them to ports.
- stateDiagram-v2 composites use identical scope model and generator rules as flowchart subgraphs.
