import { Notice, normalizePath, Plugin, TFolder } from "obsidian";
import "../styles.css";
import { TemplatePickerModal } from "./TemplatePickerModal";
import { MERMAID_TEMPLATES, type MermaidTemplate } from "./templates";
import { InspectorView, VIEW_TYPE } from "./views/InspectorView";

export default class MermaidInspectorPlugin extends Plugin {
	async onload() {
		this.registerView(VIEW_TYPE, (leaf) => new InspectorView(leaf));
		this.registerExtensions(["mmd"], VIEW_TYPE);
		this.addRibbonIcon("git-branch", "Mermaid Inspector", () => {
			this.activateView();
		});
		this.addCommand({
			id: "open-mermaid-inspector",
			name: "Open Mermaid Inspector",
			callback: () => this.activateView(),
		});
		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				if (!(file instanceof TFolder)) return;
				menu.addItem((item) =>
					item
						.setTitle("New Mermaid test diagram...")
						.setIcon("git-branch")
						.setSection("action-primary")
						.onClick(() => this.openTemplatePicker(file)),
				);
			}),
		);
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

	private openTemplatePicker(folder: TFolder): void {
		new TemplatePickerModal(
			this.app,
			MERMAID_TEMPLATES,
			(template) => void this.createFromTemplate(folder, template),
		).open();
	}

	private async createFromTemplate(
		folder: TFolder,
		template: MermaidTemplate,
	): Promise<void> {
		try {
			const path = await this.availablePath(folder, template.fileName);
			const file = await this.app.vault.create(path, template.source);
			await this.app.workspace.getLeaf(false).openFile(file);
		} catch (error) {
			console.error("Failed to create Mermaid test diagram", error);
			new Notice("Failed to create Mermaid test diagram");
		}
	}

	private async availablePath(
		folder: TFolder,
		fileName: string,
	): Promise<string> {
		const dot = fileName.lastIndexOf(".");
		const stem = dot > 0 ? fileName.slice(0, dot) : fileName;
		const extension = dot > 0 ? fileName.slice(dot) : "";
		let index = 0;
		while (true) {
			const suffix = index === 0 ? "" : ` ${index}`;
			const path = normalizePath(`${folder.path}/${stem}${suffix}${extension}`);
			if (!(await this.app.vault.adapter.exists(path))) return path;
			index += 1;
		}
	}
}
