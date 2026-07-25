import { Notice, normalizePath, Plugin, TFile, TFolder } from "obsidian";
import "../styles.css";
import { EmbeddedInspector } from "./embeds/EmbeddedInspector";
import {
	DEFAULT_SETTINGS,
	type MermaidInspectorSettings,
	MermaidInspectorSettingTab,
} from "./settings";
import { TemplatePickerModal } from "./TemplatePickerModal";
import { MERMAID_TEMPLATES, type MermaidTemplate } from "./templates";
import {
	embeddedStateKey,
	type InspectorState,
	normalizeInspectorState,
} from "./utils/inspectorState";
import { isOnlyMermaidEmbed, mermaidEmbedLinks } from "./utils/markdownEmbed";
import { InspectorView, VIEW_TYPE } from "./views/InspectorView";

export default class MermaidInspectorPlugin extends Plugin {
	settings: MermaidInspectorSettings = DEFAULT_SETTINGS;
	private stateSaveTimer: ReturnType<typeof setTimeout> | null = null;

	async onload() {
		await this.loadSettings();
		this.registerView(VIEW_TYPE, (leaf) => new InspectorView(leaf, this));
		this.addSettingTab(new MermaidInspectorSettingTab(this.app, this));
		this.registerExtensions(["mmd"], VIEW_TYPE);
		this.registerMarkdownPostProcessor((element, context) => {
			const mountedPaths = new Set<string>();
			const mountEmbed = (target: HTMLElement, file: TFile) => {
				const container = document.createElement("div");
				container.dataset.mermaidInspectorProcessed = "true";
				if (target === element) target.replaceChildren(container);
				else target.replaceWith(container);
				context.addChild(
					new EmbeddedInspector(
						container,
						file,
						embeddedStateKey(context.sourcePath, file.path),
						this,
					),
				);
				mountedPaths.add(file.path);
			};
			const resolve = (linktext: string) =>
				this.app.metadataCache.getFirstLinkpathDest(
					linktext.split("#", 1)[0],
					context.sourcePath,
				);

			for (const embed of element.querySelectorAll<HTMLElement>(
				".internal-embed[src]",
			)) {
				const file = resolve(embed.getAttribute("src") ?? "");
				if (file instanceof TFile && file.extension.toLowerCase() === "mmd") {
					mountEmbed(embed, file);
				}
			}

			for (const shell of element.querySelectorAll<HTMLElement>(
				".internal-embed:not([src]), .file-embed",
			)) {
				const nested = shell.querySelector<HTMLElement>("[data-href], a[href]");
				const linktext =
					shell.getAttribute("data-href") ??
					nested?.getAttribute("data-href") ??
					nested?.getAttribute("href") ??
					"";
				const file = resolve(linktext);
				if (
					file instanceof TFile &&
					file.extension.toLowerCase() === "mmd" &&
					!mountedPaths.has(file.path)
				) {
					mountEmbed(shell, file);
				}
			}
			const markdown = context.getSectionInfo(element)?.text ?? "";
			for (const linktext of mermaidEmbedLinks(markdown)) {
				const file = resolve(linktext);
				if (
					!(file instanceof TFile) ||
					file.extension.toLowerCase() !== "mmd" ||
					mountedPaths.has(file.path)
				)
					continue;
				if (isOnlyMermaidEmbed(markdown)) {
					mountEmbed(element, file);
					continue;
				}
				const fallback = Array.from(
					element.querySelectorAll<HTMLElement>(
						".internal-embed, .file-embed, [data-href], a[href]",
					),
				).find((candidate) => {
					const nested = candidate.querySelector<HTMLElement>(
						"[data-href], a[href]",
					);
					const candidateLink =
						candidate.getAttribute("src") ??
						candidate.getAttribute("data-href") ??
						candidate.getAttribute("href") ??
						nested?.getAttribute("data-href") ??
						nested?.getAttribute("href") ??
						"";
					return resolve(candidateLink)?.path === file.path;
				});
				if (fallback) {
					mountEmbed(
						fallback.closest<HTMLElement>(".internal-embed, .file-embed") ??
							fallback,
						file,
					);
				}
			}
		});
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
