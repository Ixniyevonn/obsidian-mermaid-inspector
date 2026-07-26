import { Component, TFile, type WorkspaceLeaf } from "obsidian";
import type MermaidInspectorPlugin from "../main";
import { isMermaidCanvasFile } from "./canvasNode";
import { EmbeddedInspector } from "./EmbeddedInspector";

interface CanvasNode {
	id: string;
	file?: TFile;
	contentEl: HTMLElement;
}

interface Canvas {
	nodes: Map<string, CanvasNode>;
	wrapperEl: HTMLElement;
	view: { file?: TFile };
}

interface CanvasView {
	canvas: Canvas;
	getViewType(): string;
}

interface MountedNode {
	child: EmbeddedInspector;
	container: HTMLElement;
}

function canvasFromLeaf(leaf: WorkspaceLeaf): Canvas | null {
	const view = leaf.view as Partial<CanvasView>;
	if (
		view.getViewType?.() !== "canvas" ||
		!view.canvas ||
		!(view.canvas.nodes instanceof Map) ||
		!(view.canvas.wrapperEl instanceof HTMLElement)
	) {
		return null;
	}
	return view.canvas;
}

export class CanvasInlineRenderer extends Component {
	private readonly observers = new Map<Canvas, MutationObserver>();
	private readonly mounted = new Map<CanvasNode, MountedNode>();

	constructor(private readonly plugin: MermaidInspectorPlugin) {
		super();
	}

	onload(): void {
		this.registerEvent(
			this.plugin.app.workspace.on("layout-change", () => this.scanLeaves()),
		);
		this.scanLeaves();
	}

	onunload(): void {
		for (const observer of this.observers.values()) observer.disconnect();
		this.observers.clear();
		this.mounted.clear();
	}

	private scanLeaves(): void {
		const activeCanvases = new Set<Canvas>();
		this.plugin.app.workspace.iterateAllLeaves((leaf) => {
			const canvas = canvasFromLeaf(leaf);
			if (!canvas) return;
			activeCanvases.add(canvas);
			this.observe(canvas);
			this.scanCanvas(canvas);
		});

		for (const [canvas, observer] of this.observers) {
			if (activeCanvases.has(canvas)) continue;
			observer.disconnect();
			this.observers.delete(canvas);
			for (const [node, mount] of this.mounted) {
				if (!canvas.nodes.has(node.id)) continue;
				this.removeChild(mount.child);
				this.mounted.delete(node);
			}
		}
	}

	private observe(canvas: Canvas): void {
		if (this.observers.has(canvas)) return;
		const Observer =
			canvas.wrapperEl.ownerDocument.defaultView?.MutationObserver;
		if (!Observer) return;
		const observer = new Observer(() => this.scanCanvas(canvas));
		observer.observe(canvas.wrapperEl, { childList: true, subtree: true });
		this.observers.set(canvas, observer);
	}

	private scanCanvas(canvas: Canvas): void {
		const activeNodes = new Set(canvas.nodes.values());
		for (const [node, mount] of this.mounted) {
			if (
				activeNodes.has(node) &&
				node.file instanceof TFile &&
				isMermaidCanvasFile(node.file) &&
				mount.container.isConnected &&
				node.contentEl.contains(mount.container)
			) {
				continue;
			}
			this.removeChild(mount.child);
			this.mounted.delete(node);
		}

		for (const node of activeNodes) {
			const file = node.file;
			if (
				!(file instanceof TFile) ||
				!isMermaidCanvasFile(file) ||
				!node.contentEl.isConnected
			) {
				continue;
			}
			const current = this.mounted.get(node);
			if (
				current?.container.isConnected &&
				node.contentEl.contains(current.container)
			) {
				continue;
			}
			if (current) this.removeChild(current.child);

			const container = node.contentEl.ownerDocument.createElement("div");
			container.addClass("mermaid-inspector-canvas-node");
			node.contentEl.replaceChildren(container);
			const canvasPath = canvas.view.file?.path ?? "";
			const child = new EmbeddedInspector(
				container,
				file,
				`${canvasPath}\0${node.id}\0${file.path}`,
				this.plugin,
			);
			this.addChild(child);
			this.mounted.set(node, { child, container });
		}
	}
}

export function registerCanvasInlineRenderer(
	plugin: MermaidInspectorPlugin,
): void {
	plugin.addChild(new CanvasInlineRenderer(plugin));
}
