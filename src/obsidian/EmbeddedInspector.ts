import { MarkdownRenderChild, type TFile } from "obsidian";
import { mount, unmount } from "svelte";
import MermaidInspector from "../components/MermaidInspector.svelte";
import type MermaidInspectorPlugin from "../main";
import { openDiagramFile } from "./openDiagramFile";

export class EmbeddedInspector extends MarkdownRenderChild {
	private component: ReturnType<typeof mount> | null = null;
	private revision = 0;

	constructor(
		containerEl: HTMLElement,
		private readonly file: TFile,
		private readonly stateKey: string,
		private readonly plugin: MermaidInspectorPlugin,
	) {
		super(containerEl);
	}

	onload(): void {
		this.containerEl.addClass("mermaid-inspector-embed");
		this.registerEvent(
			this.plugin.app.vault.on("modify", (file) => {
				if (file.path === this.file.path) void this.render();
			}),
		);
		void this.render();
	}

	onunload(): void {
		this.revision += 1;
		if (this.component) void unmount(this.component);
		this.component = null;
	}

	private async render(): Promise<void> {
		const request = ++this.revision;
		const source = await this.plugin.app.vault.cachedRead(this.file);
		if (request !== this.revision) return;
		if (this.component) await unmount(this.component);
		this.containerEl.empty();
		this.component = mount(MermaidInspector, {
			target: this.containerEl,
			props: {
				source,
				compact: true,
				transitionDuration: this.plugin.settings.transitionDuration,
				initialState: this.plugin.getEmbeddedState(this.stateKey),
				onStateChange: (state) =>
					this.plugin.setEmbeddedState(this.stateKey, state),
				onOpenFile: () => openDiagramFile(this.plugin.app.workspace, this.file),
			},
		});
	}
}
