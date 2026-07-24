import { type App, FuzzySuggestModal } from "obsidian";
import type { MermaidTemplate } from "./templates";

export class TemplatePickerModal extends FuzzySuggestModal<MermaidTemplate> {
	constructor(
		app: App,
		private readonly templates: readonly MermaidTemplate[],
		private readonly choose: (template: MermaidTemplate) => void,
	) {
		super(app);
		this.setPlaceholder("Choose a Mermaid test diagram...");
	}

	getItems(): MermaidTemplate[] {
		return [...this.templates];
	}

	getItemText(item: MermaidTemplate): string {
		return `${item.name} ${item.description}`;
	}

	renderSuggestion(
		item: { item: MermaidTemplate },
		element: HTMLElement,
	): void {
		element.createEl("div", { text: item.item.name, cls: "suggestion-title" });
		element.createEl("small", {
			text: item.item.description,
			cls: "suggestion-note",
		});
	}

	onChooseItem(item: MermaidTemplate): void {
		this.choose(item);
	}
}
