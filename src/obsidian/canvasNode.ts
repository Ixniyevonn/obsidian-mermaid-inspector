export interface CanvasFileLike {
	extension: string;
}

export interface CanvasContentLike {
	isConnected: boolean;
}

export function isMermaidCanvasFile(file?: CanvasFileLike): boolean {
	return file?.extension.toLowerCase() === "mmd";
}

export function hasConnectedCanvasContent(
	content?: CanvasContentLike,
): content is CanvasContentLike {
	return content?.isConnected === true;
}
