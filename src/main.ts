import { Notice, normalizePath, Plugin, TFolder } from "obsidian";
import "../styles.css";
import { type InspectorState, normalizeInspectorState } from "./diagram/state";
import { InspectorView, VIEW_TYPE } from "./obsidian/InspectorView";
import { registerMarkdownEmbeds } from "./obsidian/MarkdownEmbedRenderer";
import { MermaidInspectorSettingTab } from "./obsidian/SettingsTab";
import { TemplatePickerModal } from "./obsidian/TemplatePickerModal";
import {
	DEFAULT_SETTINGS,
	type MermaidInspectorSettings,
} from "./pluginSettings";
import {
	firstAvailableFileName,
	MERMAID_TEMPLATES,
	type MermaidTemplate,
} from "./templates";

export default class MermaidInspectorPlugin extends Plugin {
	settings: MermaidInspectorSettings = DEFAULT_SETTINGS;
	private stateSaveTimer: ReturnType<typeof setTimeout> | null = null;

	async onload() {
		await this.loadSettings();
		this.registerView(VIEW_TYPE, (leaf) => new InspectorView(leaf, this));
		this.addSettingTab(new MermaidInspectorSettingTab(this.app, this));
		this.registerExtensions(["mmd"], VIEW_TYPE);
		registerMarkdownEmbeds(this);
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
		if (this.stateSaveTimer !== null) clearTimeout(this.stateSaveTimer);
		void this.saveSettings();
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

	private async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		this.settings.embeddedStates ??= {};
	}

	getEmbeddedState(key: string): InspectorState | undefined {
		const state = this.settings.embeddedStates[key];
		return state ? normalizeInspectorState(state) : undefined;
	}

	setEmbeddedState(key: string, state: InspectorState): void {
		this.settings.embeddedStates[key] = normalizeInspectorState(state);
		if (this.stateSaveTimer !== null) clearTimeout(this.stateSaveTimer);
		this.stateSaveTimer = setTimeout(() => {
			this.stateSaveTimer = null;
			void this.saveSettings();
		}, 150);
	}
	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	refreshInspectorViews(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
			if (leaf.view instanceof InspectorView) leaf.view.refreshSettings();
		}
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
		const available = await firstAvailableFileName(fileName, (candidate) =>
			this.app.vault.adapter.exists(
				normalizePath(`${folder.path}/${candidate}`),
			),
		);
		return normalizePath(`${folder.path}/${available}`);
	}
}
