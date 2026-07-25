# Obsidian Mermaid Inspector

An Obsidian plugin that opens `.mmd` Mermaid flowcharts as interactive, hierarchical diagrams.

> [!WARNING]
> This project is completely vibe-coded. Review the source and use it at your own risk.

## Features

- Subgraphs start as visually distinct collapsed nodes.
- Click a subgraph to expand or collapse it inline.
- Right-click a subgraph to focus it; right-click ancestors or press Escape to move up.
- Focusing fades and softly blurs everything outside the active scope.
- Fit smoothly frames the focused subgraph, or the whole diagram when no scope is focused.
- Drag to pan and use the wheel to zoom without rasterization.
- Nested visibility, recursive collapse, edge labels, empty scopes, and interrupted transitions are handled consistently.
- Transition duration is configurable in Obsidian settings.
- The folder context menu can create test diagrams of several complexity levels.

## Markdown embeds

Use Obsidian's standard embed syntax:

```md
![[Diagrams/Example.mmd]]
```

In Reading View this renders a compact interactive inspector with a Fit icon. Its expansion, focus, pan, and zoom state is stored separately for each host Markdown file and embedded diagram. In edit mode Obsidian shows its normal file embed control.

## Architecture

- `src/diagram/` contains the Obsidian-independent diagram model, rendering metadata, focus classification, navigation state, camera math, and SVG transitions.
- `src/components/` contains the Svelte inspector and pan/zoom canvas.
- `src/obsidian/` contains Obsidian views, Markdown rendering, settings, and modals.
- `src/main.ts` owns plugin registration and persistence.
- `tests/fixtures/` contains test-only Mermaid sources; production code contains no demo graph.

Mermaid remains responsible for layout. Each expansion state is rendered into a new SVG, tagged with stable logical identifiers, and animated from the previous visual geometry.

## Development

Use Bun for every command:

```sh
bun test
bun run check
bun run build
```

A production build is written to `build/` and copied to the plugin directory in `test-vault`.

For the complete manual commit and BRAT release process, see [GIT_WORKFLOW.md](GIT_WORKFLOW.md).
