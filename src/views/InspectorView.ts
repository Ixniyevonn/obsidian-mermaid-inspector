import { ItemView } from "obsidian";
import { mount, unmount } from "svelte";
import MermaidInspector from "../components/MermaidInspector.svelte";

export const VIEW_TYPE = "mermaid-inspector-proto";

export class InspectorView extends ItemView {
    component: ReturnType<typeof mount> | null = null;

    getViewType(): string {
        return VIEW_TYPE;
    }

    getDisplayText(): string {
        return "Mermaid Inspector";
    }

    getIcon(): string {
        return "git-branch";
    }

    async onOpen(): Promise<void> {
        this.contentEl.empty();
        this.contentEl.addClass("mermaid-inspector-container");

        this.component = mount(MermaidInspector, {
            target: this.contentEl,
        });
    }

    async onClose(): Promise<void> {
        if (this.component) {
            unmount(this.component);
            this.component = null;
        }
    }
}
