# Obsidian Mermaid Inspector

Custom view for `.mmd` Mermaid files that makes **subgraphs first-class, inspectable containers**.

Instead of always rendering the fully expanded diagram (the classic behavior), subgraphs are shown as distinct, collapsed blocks. Clicking a block seamlessly expands it in place while higher levels remain visible but **fade into the background**, providing continuous context. Nested subgraphs stay collapsed until you inspect them too.

The interaction is designed to feel liquid, animated, and non-destructive — you are navigating a hierarchy, not mutating the source.

## Features

- Opens `.mmd` files in a dedicated inspector view (registerExtensions)
- Subgraphs render as styled, expandable blocks (never fully expanded by default)
- Click any subgraph block to dive in — it becomes the focused scope
- Higher/ancestor levels stay visible behind the current focus with progressive fade + depth
- Inner subgraphs follow exactly the same rule (recursive, natural)
- Breadcrumb navigation + click faded background layers or press Esc to go up
- Pan & zoom the entire composition (Canvas viewport, Ctrl+wheel, middle-drag or background-drag)
- **Compositor rendering**: stable collapsed shell + separately rendered interiors inserted into clusters with controlled animation
- Theme-aware (light/dark) with Obsidian CSS variables
- Works with deeply nested flowcharts and stateDiagram-v2 composites

## Design (detailed)

### Core Mental Model

A Mermaid diagram with subgraphs is a **tree of scopes**:

- The implicit root scope `""`
- Each `subgraph X ... end` (flowchart) or `state X { ... }` (stateDiagram-v2) defines a child scope
- Edges and nodes belong to the most specific scope that directly contains them

The inspector never shows the full expansion of a scope unless you explicitly expand it. At any moment:

- A **stable shell** renders the whole diagram with every scope collapsed
- **Interiors** of expanded scopes are rendered separately and **inserted** into the matching cluster in the shell
- Expansion animation grows the cluster frame and fades/scales the inserted interior — the compositor controls this, not a full-diagram Mermaid relayout

### Boundary / port rules

You **cannot** connect directly from outside a scope to a node inside it. External edges terminate on the **subgraph container** (or its port nodes). Each collapsed subgraph exposes **input/output port nodes** (`ScopeId__in`, `ScopeId__out`) inside the block; internal wiring stays inside the interior render.

If a statement inside scope `Eng` references `Eng --> Platform`, it is rewritten to `Eng__in --> Platform` in the interior source.

### Diagram kinds

| Kind | Syntax | Inspector support |
|------|--------|-------------------|
| **flowchart / graph** | `subgraph … end` | Primary, full support |
| **stateDiagram-v2** | `state X { … }` | Supported via same scope tree; collapsed composites use `state X <<choice>>` |

Other diagram types may open but are not yet optimized for subgraph inspection.

### Navigation modes

#### Focus expand (left-click collapsed block)

- Adds scope to **focus path** (breadcrumb updates)
- Inserts interior into the cluster
- **Progressive fade**: everything outside the focused scope fades; focusing deeper makes already-faded regions fade further
- Click **any faded outside** region → go up one focus level
- Click **expanded cluster background** (not a node) → go up one level
- **Esc** → go up one level

Example: focus block #1 → outside fades. Focus block #2 inside #1 → outside (including parts of #1 not inside #2) fades more. Click faded outside anywhere → up one level.

#### Inline expand (right-click collapsed block)

- Expands and inserts interior **without** changing breadcrumb / focus path
- **No fade** on outside — surroundings stay fully interactive
- Collapse **only** by clicking the **background inside** the inline-expanded block
- Outside clicks do not collapse inline expansions

### Breadcrumb

- Reflects **focus path only** (not inline expansions)
- Clicking a breadcrumb segment jumps to that ancestor and **collapses all scopes not on the remaining path** (both focus and inline)

## Installation (for development)

This repo is structured like the `obsidian-viewpoint` example (Svelte 5 + Vite CJS build).

```bash
bun install

# One-shot build into the test vault (process exits when done)
bun run build:dev

# Watch mode for active development (stays running, rebuilds on src changes)
bun dev
```

In Obsidian:
- Open the `test-vault`
- Enable community plugins + the "Mermaid Inspector" plugin
- Open any `.mmd` file

Note: `bun dev` uses Vite watch and intentionally keeps the process alive. Use `bun run build:dev` if you want a build that exits.

## Demo Vault

`test-vault/` contains several `.mmd` files under `demo/` plus `Getting-Started.mmd`:

- `Getting-Started.mmd` — minimal nested example
- `demo/Architecture.mmd` — multi-layer system
- `demo/StateMachine.mmd` — stateDiagram-v2 nested composites
- `demo/DeepNesting.mmd` — 4 levels deep
- `demo/OrgChart.mmd` — teams and sub-teams

(The detailed design is described in the sections above. The implementation has been removed to allow a clean restart in a future iteration while preserving the problem samples and design intent.)
