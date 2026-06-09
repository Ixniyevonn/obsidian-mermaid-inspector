import { Plugin } from "obsidian";
import "../styles.css";
import { VIEW_TYPE, MermaidView } from "./views/MermaidView";

export default class MermaidInspectorPlugin extends Plugin {
	async onload() {
		this.registerView(VIEW_TYPE, (leaf) => new MermaidView(leaf));

		this.addCommand({
			id: "open-mermaid-inspector",
			name: "Open Mermaid Inspector (demo)",
			callback: () => this.activateView(),
		});
	}

	onunload() {
		this.app.workspace.detachLeavesOfType(VIEW_TYPE);
	}

	private async activateView() {
		const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE);
		if (existing.length) {
			this.app.workspace.revealLeaf(existing[0]);
			return;
		}
		const leaf = this.app.workspace.getLeaf("tab");
		await leaf.setViewState({ type: VIEW_TYPE, active: true });
		this.app.workspace.revealLeaf(leaf);
	}
}
