import { TextFileView } from "obsidian";
import { mount, unmount } from "svelte";
import MermaidInspector from "../components/MermaidInspector.svelte";
export const VIEW_TYPE = "mermaid-inspector-view";
export class InspectorView extends TextFileView {
	private component: ReturnType<typeof mount> | null = null;
	private source = "";
	getViewType(): string {
		return VIEW_TYPE;
	}
	getDisplayText(): string {
		return this.file?.basename ?? "Mermaid Inspector";
	}
	getIcon(): string {
		return "git-branch";
	}
	canAcceptExtension(extension: string): boolean {
		return extension === "mmd";
	}
	getViewData(): string {
		return this.source;
	}
	setViewData(data: string): void {
		this.source = data;
		this.mountInspector();
	}
	clear(): void {
		this.source = "";
		this.mountInspector();
	}
	async onOpen(): Promise<void> {
		this.contentEl.addClass("mermaid-inspector-container");
		this.mountInspector();
	}
	async onClose(): Promise<void> {
		if (this.component) await unmount(this.component);
		this.component = null;
	}
	private mountInspector(): void {
		if (!this.contentEl.isConnected) return;
		if (this.component) void unmount(this.component);
		this.contentEl.empty();
		this.component = mount(MermaidInspector, {
			target: this.contentEl,
			props: { source: this.source },
		});
	}
}
