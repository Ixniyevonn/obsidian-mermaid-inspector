export interface MermaidEmbedMatch {
	from: number;
	to: number;
	linktext: string;
}

const MERMAID_EMBED_PATTERN =
	/!\[\[\s*([^\]|#]+?\.mmd)(?:#[^\]|]*)?(?:\|[^\]]*)?\s*\]\]/giu;

export function mermaidEmbedMatches(markdown: string): MermaidEmbedMatch[] {
	const matches: MermaidEmbedMatch[] = [];
	const pattern = new RegExp(
		MERMAID_EMBED_PATTERN.source,
		MERMAID_EMBED_PATTERN.flags,
	);
	for (const match of markdown.matchAll(pattern)) {
		const link = match[1]?.trim();
		if (link && match.index !== undefined) {
			matches.push({
				from: match.index,
				to: match.index + match[0].length,
				linktext: link,
			});
		}
	}
	return matches;
}

export function mermaidEmbedLinks(markdown: string): string[] {
	return mermaidEmbedMatches(markdown).map((match) => match.linktext);
}

export function isOnlyMermaidEmbed(markdown: string): boolean {
	const withoutEmbed = markdown.replace(MERMAID_EMBED_PATTERN, "");
	return (
		withoutEmbed.trim().length === 0 && mermaidEmbedLinks(markdown).length === 1
	);
}
