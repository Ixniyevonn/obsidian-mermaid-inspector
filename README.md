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
- **Compositor, not mutator**: never re-run full Mermaid layout on expand. Shell provides stable coordinates; interiors are inserted locally with transform + cluster-frame animation.
- **Focus + context**: current scope at full detail/opacity; ancestors and siblings fade progressively with distance from focus.
- **Recursive by construction**: every scope (including nested) follows identical collapsed/expanded rules.
- **Ports as first-class**: collapsed blocks expose explicit in/out ports; wiring is level-correct in every render pass.

## Implementation Architecture

### Why previous single-render + DOM approaches fail
Mermaid layout (dagre) sizes every cluster rect to its *expanded* descendants and positions every node/edge in one global pass. Post-render `display:none` / `visibility` / removal of inner nodes leaves either oversized empty clusters or broken edge paths. You cannot obtain a true collapsed shell, independent interior layouts, or controlled in-place growth animation without violating the "no full relayout" rule. The compositor model solves this by construction.

### Pipeline (strict order)
```
.mmd source
  → Parser (stack-based scope tree + boundary edges)
  → Model (Scope[], Node[], Edge[] with scope membership)
  → Generators (shellCode + interiorCode per scope in focusPath)
  → Multi-render (mermaid.render for shell + each interior)
  → Compositor (DOMParser + locate cluster + insert transformed interior + tween rect + fade)
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

Both generators are memoizable by (model hash + focusPath slice). Paste their output into mermaid.live during development to validate layout before wiring the compositor.

### Compositor (core of custom rendering)
```ts
async function compose(
  shellCode: string,
  interiors: Map<string, string>,  // scopeId → interiorCode
  focusPath: string[]
): Promise<SVGSVGElement> {
  const shellSvgStr = (await mermaid.render('shell', shellCode)).svg;
  const doc = new DOMParser().parseFromString(shellSvgStr, 'image/svg+xml');
  const svg = doc.documentElement as unknown as SVGSVGElement;

  // 1. locate every cluster once (build id → g map)
  const clusters = new Map<string, SVGGElement>();
  svg.querySelectorAll('g.cluster').forEach(g => {
    const id = g.id; // e.g. flowchart-0-cluster-Eng or similar
    const scopeId = extractScopeIdFromClusterId(id); // tolerant regex or label-text fallback
    if (scopeId) clusters.set(scopeId, g as SVGGElement);
  });

  // 2. for each scope in focusPath (deepest → shallowest for z-order)
  for (const scopeId of [...focusPath].reverse()) {
    const cluster = clusters.get(scopeId);
    if (!cluster) continue;

    const interiorCode = interiors.get(scopeId)!;
    const intRes = await mermaid.render(`int-${scopeId}`, interiorCode);
    const intDoc = new DOMParser().parseFromString(intRes.svg, 'image/svg+xml');
    const intContent = intDoc.querySelector('svg > g')!; // the real diagram group

    // compute transform so interior bbox maps inside cluster rect + padding
    const clusterRect = cluster.querySelector('rect.cluster-rect') as SVGRectElement;
    const cBox = clusterRect.getBBox();
    const iBox = (intContent as SVGGElement).getBBox();

    const pad = 12;
    const scale = Math.min(
      (cBox.width - 2*pad) / iBox.width,
      (cBox.height - 2*pad) / iBox.height
    ) || 1; // or policy: grow cluster instead of fit
    const tx = cBox.x + pad;
    const ty = cBox.y + pad;

    const wrapper = doc.createElementNS('http://www.w3.org/2000/svg', 'g');
    wrapper.setAttribute('class', 'mermaid-interior');
    wrapper.setAttribute('data-scope', scopeId);
    wrapper.setAttribute('transform', `translate(${tx} ${ty}) scale(${scale})`);
    wrapper.append(...intContent.childNodes); // move nodes/edges

    cluster.appendChild(wrapper);

    // optional: grow cluster frame to natural interior size
    if (/* grow policy */) {
      const targetW = iBox.width * scale + 2*pad;
      const targetH = iBox.height * scale + 2*pad;
      tweenRect(clusterRect, {width: targetW, height: targetH}); // rAF
    }
  }

  // 3. progressive fade
  applyFades(svg, focusPath, clusters);

  // 4. attach delegated click handlers (or return and let Svelte do it)
  svg.addEventListener('click', handleClusterClick);

  return svg;
}
```

**Mermaid SVG structure notes (empirical)**
- `<svg><g>` (main)
  - nodes: `<g class="node" id="...">` (rect/circle/foreignObject + text)
  - edges: `<g class="edgePath">` (path + marker)
  - clusters: `<g class="cluster" id="...-cluster-${scopeId}">` containing `<rect class="cluster-rect">` + label text/foreignObject. **Nodes and edges of a subgraph are NOT DOM children of its cluster g**; they are siblings. Cluster rect is a post-layout bounding overlay. This is why insertion + local transform works; we never rely on cluster being a container.

**Animation**
- Cluster growth: rAF tween on `width`/`height`/`x`/`y` of the rect (and vertical label adjustment).
- Interior insert: CSS transition or Svelte transition on the wrapper g (opacity 0→1 + scale(0.9→1)).
- Fade changes: direct style.opacity or class toggle; re-compute on every focus change.

Cache: key renders by content hash; skip re-render if code unchanged.

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

### Phased Implementation Order (do not deviate)
1. Parser + DiagramModel (pure TS, vitest or plain node tests against all demo/*.mmd). 100% pass required before step 2.
2. Generators (shell + interior). For every test case, generate → paste to mermaid.live → visually confirm small clusters + correct ports + boundary edges. Fix generator until perfect.
3. Compositor prototype (plain HTML page or isolated Svelte route). Hardcoded focusPath, one level, static insert, no animation. Verify in browser devtools that interior appears inside correct cluster rect with right transform.
4. Add animation, progressive fade, multi-level nesting, cache.
5. Svelte runes state + event wiring + breadcrumb + inline mode.
6. Pan/zoom viewport + Obsidian registration + theme sync + error banner.
7. Polish (port styling, stateDiagram-v2 edge cases, perf on 4+ level deep, mobile tap handling).

Only after step 3 do you touch Obsidian plugin boilerplate or full UI.

### Risks & Mitigations
- Mermaid cluster id format drift across Obsidian versions: make `extractScopeIdFromClusterId` try `id.match(/-cluster-(.+)$/)?.[1]`, then fallback to scanning label text content against known scope titles. Log during dev.
- Large/deep diagrams: generators + renders are O(n) per focus change; memoize by hash, only re-render changed interiors.
- Overlap when growing clusters: by design under progressive fade; user can pan/zoom. Future option: "compact" vs "grow" policy toggle.
- Cross-boundary edges in original source: parser must detect and reroute; otherwise interiors will show dangling edges.
- stateDiagram-v2 composites: treat `state X { ... }` identically to subgraph; map `state` syntax in generator.

## Installation (development)
Same as before (bun). The `test-vault/demo/` files remain the canonical test corpus.

## Demo Vault
Unchanged: `Getting-Started.mmd`, `demo/Architecture.mmd`, `demo/StateMachine.mmd`, `demo/DeepNesting.mmd`, `demo/OrgChart.mmd`.

The implementation follows the compositor pipeline above. The previous "removed implementation" was discarded because it relied on the incompatible single-render model.

## References (internal)
- Your `obsidian-viewpoint` example for exact Svelte 5 + Vite CJS layout, view registration pattern, and CSS var usage.
- Mermaid source (for cluster class names and render pipeline) — inspect once in step 3.
