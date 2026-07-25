import { TFile } from "obsidian";
import { embeddedStateKey } from "../diagram/state";
import type MermaidInspectorPlugin from "../main";
import { EmbeddedInspector } from "./EmbeddedInspector";
import { isOnlyMermaidEmbed, mermaidEmbedLinks } from "./markdownEmbed";

const EMBED_SELECTOR = ".internal-embed, .file-embed";
const LINK_SELECTOR = "[data-href], a[href]";

function linkText(element: HTMLElement): string {
	const nested = element.querySelector<HTMLElement>(LINK_SELECTOR);
	return (
		element.getAttribute("src") ??
		element.getAttribute("data-href") ??
		element.getAttribute("href") ??
		nested?.getAttribute("data-href") ??
		nested?.getAttribute("href") ??
		""
	);
}

export function registerMarkdownEmbeds(plugin: MermaidInspectorPlugin): void {
	plugin.registerMarkdownPostProcessor((element, context) => {
		const mountedPaths = new Set<string>();
		const resolve = (linktext: string) =>
			plugin.app.metadataCache.getFirstLinkpathDest(
				linktext.split("#", 1)[0],
				context.sourcePath,
			);
		const mount = (target: HTMLElement, file: TFile) => {
			const container = document.createElement("div");
			if (target === element) target.replaceChildren(container);
			else target.replaceWith(container);
			context.addChild(
				new EmbeddedInspector(
					container,
					file,
					embeddedStateKey(context.sourcePath, file.path),
					plugin,
				),
			);
			mountedPaths.add(file.path);
		};
		const mountResolved = (target: HTMLElement, candidate: string): boolean => {
			const file = resolve(candidate);
			if (
				!(file instanceof TFile) ||
				file.extension.toLowerCase() !== "mmd" ||
				mountedPaths.has(file.path)
			) {
				return false;
			}
			mount(target, file);
			return true;
		};

		for (const embed of element.querySelectorAll<HTMLElement>(EMBED_SELECTOR)) {
			mountResolved(embed, linkText(embed));
		}

		const markdown = context.getSectionInfo(element)?.text ?? "";
		for (const candidate of mermaidEmbedLinks(markdown)) {
			const file = resolve(candidate);
			if (
				!(file instanceof TFile) ||
				file.extension.toLowerCase() !== "mmd" ||
				mountedPaths.has(file.path)
			) {
				continue;
			}
			if (isOnlyMermaidEmbed(markdown)) {
				mount(element, file);
				continue;
			}
			const fallback = Array.from(
				element.querySelectorAll<HTMLElement>(
					`${EMBED_SELECTOR}, ${LINK_SELECTOR}`,
				),
			).find((item) => resolve(linkText(item))?.path === file.path);
			if (fallback)
				mount(fallback.closest<HTMLElement>(EMBED_SELECTOR) ?? fallback, file);
		}
	});
}
