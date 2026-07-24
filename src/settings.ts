import { type App, PluginSettingTab, Setting } from "obsidian";
import type MermaidInspectorPlugin from "./main";

export {
	DEFAULT_SETTINGS,
	type MermaidInspectorSettings,
} from "./settingsData";

export class MermaidInspectorSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: MermaidInspectorPlugin,
	) {
		super(app, plugin);
	}

	display(): void {
		this.containerEl.empty();
		new Setting(this.containerEl)
			.setName("Transition duration")
			.setDesc("Duration of subgraph layout transitions in milliseconds.")
			.addSlider((slider) =>
				slider
					.setLimits(100, 1000, 50)
					.setDynamicTooltip()
					.setValue(this.plugin.settings.transitionDuration)
					.onChange(async (value) => {
						this.plugin.settings.transitionDuration = value;
						await this.plugin.saveSettings();
						this.plugin.refreshInspectorViews();
					}),
			);
	}
}
