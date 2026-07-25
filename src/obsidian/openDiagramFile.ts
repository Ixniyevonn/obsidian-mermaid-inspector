interface FileLeaf<TFile> {
	openFile(file: TFile): Promise<void>;
}

interface TabWorkspace<TFile> {
	getLeaf(mode: "tab"): FileLeaf<TFile>;
}

export function openDiagramFile<TFile>(
	workspace: TabWorkspace<TFile>,
	file: TFile,
): Promise<void> {
	return workspace.getLeaf("tab").openFile(file);
}
