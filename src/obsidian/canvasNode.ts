export interface CanvasFileLike {
	extension: string;
}

export function isMermaidCanvasFile(file?: CanvasFileLike): boolean {
	return file?.extension.toLowerCase() === "mmd";
}
