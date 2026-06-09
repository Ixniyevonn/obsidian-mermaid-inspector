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
On focus/expand change:

1. Generators emit the source for the current focus state (all scopes collapsed to minimal clusters+ports except focusPath scopes, which are expanded/inlined).

2. `mermaid.render(currentSource)` produces SVG with correct non-overlapping layout.

3. Extract per-element positions (node `g.node`, cluster `g.cluster`, edge `g.edgePath`): id + bbox/transform + path `d`.

4. On next state change, repeat render, then tween:
   - Matching elements animate from previous to new position (transform delta or attribute interpolation).
   - Cluster rects grow/shrink as part of the tween.
   - Edge paths morph.
   - New elements fade in, disappearing ones fade out.
   - Transition duration 200-400 ms.

**Mermaid SVG notes**
Clusters (`g.cluster` containing `rect.cluster-rect` + label) are post-layout overlays. Nodes and edges are siblings at the root `<g>` level. Position extraction and per-element tweening use stable ids or added data attributes.

**Tween implementation**
- Record old positions before replacing SVG (or keep previous SVG off-DOM for reference).
- After mounting new SVG, initialize matching elements at old coordinates via `transform`, then transition to final layout.
- Path `d` interpolation for edges (linear or simple cubic point lerp).
- Cache by (source hash, focusPath). Re-render only affected scopes.

### Svelte 5 Integration (runes)
- View component owns:
  - `let focusPath = $state<string[]>([]);`
  - `let inlineExpanded = $state<Set<string>>(new Set());`
  - Derived `breadcrumb = $derived(focusPath.map(id => model.scopes.get(id)));`
- On content change or focusPath change (debounced 80ms): run parser → generators → compose → mount/replace SVG in viewport div.
- Breadcrumb: simple horizontal list of buttons; click splices the array.
- Delegated click on SVG: `e.target.closest('g.cluster')` → read `data-scope` or derive from id → update focusPath (push if not present, or set as new leaf).
- Right-click on cluster: toggle inlineExpanded, re-compose without touching focusPath (no fade, collapse only on inner background click).
- Esc / background click (outside any cluster): pop focusPath.
- Pan/zoom: wrapper div with `overflow:hidden`; inner SVG wrapped in `<g class="viewport">` whose `transform` matrix is mutated by wheel (scale around cursor) + pointer drag. Or drop in `svg-pan-zoom` if already present in your viewpoint template.
- Theme: listen `app.workspace.on('css-change')`, re-configure mermaid themeVariables from Obsidian vars, re-compose.

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
