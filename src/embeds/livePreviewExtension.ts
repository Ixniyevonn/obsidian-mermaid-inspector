import type { Extension } from "@codemirror/state";
import {
	Decoration,
	type DecorationSet,
	EditorView,
	ViewPlugin,
	type ViewUpdate,
	WidgetType,
} from "@codemirror/view";
import { editorInfoField, editorLivePreviewField, TFile } from "obsidian";
import type MermaidInspectorPlugin from "../main";
import { embeddedStateKey } from "../utils/inspectorState";
import { mermaidEmbedMatches } from "../utils/markdownEmbed";
import { EmbeddedInspector } from "./EmbeddedInspector";

const mounts = new WeakMap<HTMLElement, EmbeddedInspector>();

class MermaidInspectorWidget extends WidgetType {
	constructor(
		private readonly plugin: MermaidInspectorPlugin,
		private readonly sourcePath: string,
		private readonly linktext: string,
	) {
		super();
	}

	eq(other: MermaidInspectorWidget): boolean {
		return (
			other.plugin === this.plugin &&
			other.sourcePath === this.sourcePath &&
			other.linktext === this.linktext
		);
	}

	toDOM(): HTMLElement {
		const container = document.createElement("div");
		const file = this.plugin.app.metadataCache.getFirstLinkpathDest(
			this.linktext,
			this.sourcePath,
		);
		if (!(file instanceof TFile) || file.extension.toLowerCase() !== "mmd") {
			container.addClass("mermaid-inspector-embed-error");
			container.setText(`Could not find Mermaid diagram: ${this.linktext}`);
			return container;
		}

		const mount = new EmbeddedInspector(
			container,
			file,
			embeddedStateKey(this.sourcePath, file.path),
			this.plugin,
		);
		mount.load();
		mounts.set(container, mount);
		return container;
	}

	destroy(dom: HTMLElement): void {
		const mount = mounts.get(dom);
		if (mount) {
			mount.unload();
			mounts.delete(dom);
		}
	}

	ignoreEvent(): boolean {
		return true;
	}
}

function buildDecorations(
	view: EditorView,
	plugin: MermaidInspectorPlugin,
): DecorationSet {
	if (!view.state.field(editorLivePreviewField, false)) return Decoration.none;
	const sourcePath = view.state.field(editorInfoField, false)?.file?.path;
	if (!sourcePath) return Decoration.none;

	const decorations = [];
	const markdown = view.state.doc.toString();
	for (const match of mermaidEmbedMatches(markdown)) {
		const selected = view.state.selection.ranges.some(
			(range) => range.from <= match.to && range.to >= match.from,
		);
		if (selected) continue;
		decorations.push(
			Decoration.replace({
				widget: new MermaidInspectorWidget(plugin, sourcePath, match.linktext),
			}).range(match.from, match.to),
		);
	}
	return Decoration.set(decorations, true);
}

export function createLivePreviewExtension(
	plugin: MermaidInspectorPlugin,
): Extension {
	return ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;

			constructor(view: EditorView) {
				this.decorations = buildDecorations(view, plugin);
			}

			update(update: ViewUpdate): void {
				if (
					update.docChanged ||
					update.selectionSet ||
					update.transactions.some((transaction) => transaction.reconfigured)
				) {
					this.decorations = buildDecorations(update.view, plugin);
				}
			}
		},
		{ decorations: (value) => value.decorations },
	);
}
