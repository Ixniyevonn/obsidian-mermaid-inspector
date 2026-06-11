import { Plugin } from "obsidian";
import "../styles.css";
import { InspectorView, VIEW_TYPE } from "./views/InspectorView";

export default class MermaidInspectorPlugin extends Plugin {
	async onload() {
		this.registerView(VIEW_TYPE, (leaf) => new InspectorView(leaf));

		this.addRibbonIcon("git-branch", "Mermaid Inspector (prototype)", () => {
			this.activateView();
		});

		this.addCommand({
			id: "open-mermaid-inspector",
			name: "Open Mermaid Inspector (prototype)",
			callback: () => this.activateView(),
		});
	}

	onunload() {
		this.app.workspace.detachLeavesOfType(VIEW_TYPE);
	}

	async activateView() {
		const { workspace } = this.app;
		const existing = workspace.getLeavesOfType(VIEW_TYPE);
		if (existing.length > 0) {
			workspace.revealLeaf(existing[0]);
			return;
		}
		const leaf = workspace.getLeaf("tab");
		await leaf.setViewState({ type: VIEW_TYPE, active: true });
		workspace.revealLeaf(leaf);
	}
}
