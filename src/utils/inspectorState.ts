import type { CameraState } from "./camera";

export interface InspectorState {
	expanded: string[];
	focusPath: string[];
	camera: CameraState;
}

export const DEFAULT_CAMERA: CameraState = {
	panX: 0,
	panY: 0,
	zoom: 1,
};

export function embeddedStateKey(
	markdownPath: string,
	diagramPath: string,
): string {
	return `${markdownPath}\0${diagramPath}`;
}

export function normalizeInspectorState(
	state?: Partial<InspectorState>,
): InspectorState {
	const finite = (value: unknown, fallback: number) =>
		typeof value === "number" && Number.isFinite(value) ? value : fallback;
	return {
		expanded: [...new Set(state?.expanded ?? [])],
		focusPath: [...(state?.focusPath ?? [])],
		camera: {
			panX: finite(state?.camera?.panX, DEFAULT_CAMERA.panX),
			panY: finite(state?.camera?.panY, DEFAULT_CAMERA.panY),
			zoom: Math.min(
				12,
				Math.max(0.15, finite(state?.camera?.zoom, DEFAULT_CAMERA.zoom)),
			),
		},
	};
}
