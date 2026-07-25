export interface CameraState {
	panX: number;
	panY: number;
	zoom: number;
}

export interface CameraBounds {
	x: number;
	y: number;
	width: number;
	height: number;
}

export function fitCamera(
	viewport: Pick<DOMRect, "width" | "height">,
	bounds?: CameraBounds,
): CameraState {
	if (!bounds?.width || !bounds.height) {
		return { panX: 0, panY: 0, zoom: 1 };
	}
	const zoom = Math.min(
		1.5,
		Math.max(
			0.15,
			Math.min(
				(viewport.width - 48) / bounds.width,
				(viewport.height - 48) / bounds.height,
			),
		),
	);
	return {
		zoom,
		panX: viewport.width / 2 - (bounds.x + bounds.width / 2) * zoom,
		panY: viewport.height / 2 - (bounds.y + bounds.height / 2) * zoom,
	};
}

export function interpolateCamera(
	from: CameraState,
	to: CameraState,
	progress: number,
): CameraState {
	const clamped = Math.max(0, Math.min(1, progress));
	const eased = 1 - (1 - clamped) ** 3;
	const lerp = (start: number, end: number) => start + (end - start) * eased;
	return {
		panX: lerp(from.panX, to.panX),
		panY: lerp(from.panY, to.panY),
		zoom: lerp(from.zoom, to.zoom),
	};
}
