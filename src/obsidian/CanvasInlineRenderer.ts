import { Component, TFile, type WorkspaceLeaf } from "obsidian";
import type MermaidInspectorPlugin from "../main";
import { hasConnectedCanvasContent, isMermaidCanvasFile } from "./canvasNode";
import { EmbeddedInspector } from "./EmbeddedInspector";

interface CanvasNode {
	id: string;
	file?: TFile;
	contentEl?: HTMLElement;
	isEditing?: boolean;
	setIsEditing?(editing: boolean): void;
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
	contentEl: HTMLElement;
	stopNavigation: (event: MouseEvent) => void;
	wasEditing: boolean;
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
	private readonly activatedNodes = new WeakSet<CanvasNode>();

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
		for (const [node, mount] of this.mounted) {
			mount.contentEl.removeEventListener("click", mount.stopNavigation);
			if (!mount.wasEditing) node.setIsEditing?.(false);
		}
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
				this.removeMount(node, mount);
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
				node.contentEl?.contains(mount.container) === true
			) {
				continue;
			}
			this.removeMount(node, mount);
		}

		for (const node of activeNodes) {
			const file = node.file;
			let contentEl = node.contentEl;
			if (
				!(file instanceof TFile) ||
				!isMermaidCanvasFile(file) ||
				!hasConnectedCanvasContent(contentEl)
			) {
				continue;
			}
			const wasEditing =
				node.isEditing === true && !this.activatedNodes.has(node);
			if (node.isEditing !== true && node.setIsEditing) {
				this.activatedNodes.add(node);
				node.setIsEditing(true);
				contentEl = node.contentEl;
				if (!hasConnectedCanvasContent(contentEl)) continue;
			}
			const current = this.mounted.get(node);
			if (
				current?.container.isConnected &&
				contentEl.contains(current.container)
			) {
				continue;
			}
			if (current) this.removeMount(node, current);

			const container = contentEl.ownerDocument.createElement("div");
			container.addClass("mermaid-inspector-canvas-node");
			contentEl.replaceChildren(container);
			const canvasPath = canvas.view.file?.path ?? "";
			const child = new EmbeddedInspector(
				container,
				file,
				`${canvasPath}\0${node.id}\0${file.path}`,
				this.plugin,
			);
			const stopNavigation = (event: MouseEvent) => event.stopPropagation();
			contentEl.addEventListener("click", stopNavigation);
			this.addChild(child);
			this.mounted.set(node, {
				child,
				container,
				contentEl,
				stopNavigation,
				wasEditing,
			});
		}
	}

	private removeMount(node: CanvasNode, mount: MountedNode): void {
		mount.contentEl.removeEventListener("click", mount.stopNavigation);
		if (!mount.wasEditing) node.setIsEditing?.(false);
		this.removeChild(mount.child);
		this.mounted.delete(node);
	}
}

export function registerCanvasInlineRenderer(
	plugin: MermaidInspectorPlugin,
): void {
	plugin.addChild(new CanvasInlineRenderer(plugin));
}
