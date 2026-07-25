export function mermaidEmbedLinks(markdown: string): string[] {
	const links: string[] = [];
	const pattern =
		/!\[\[\s*([^\]|#]+?\.mmd)(?:#[^\]|]*)?(?:\|[^\]]*)?\s*\]\]/giu;
	for (const match of markdown.matchAll(pattern)) {
		const link = match[1]?.trim();
		if (link) links.push(link);
	}
	return links;
}

export function isOnlyMermaidEmbed(markdown: string): boolean {
	const withoutEmbed = markdown.replace(
		/!\[\[\s*[^\]|#]+?\.mmd(?:#[^\]|]*)?(?:\|[^\]]*)?\s*\]\]/giu,
		"",
	);
	return (
		withoutEmbed.trim().length === 0 && mermaidEmbedLinks(markdown).length === 1
	);
}
