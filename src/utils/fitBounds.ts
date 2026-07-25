import type { CameraBounds } from "./camera";

function numericAttribute(element: Element, name: string): number | undefined {
	const value = Number(element.getAttribute(name));
	return Number.isFinite(value) ? value : undefined;
}

export function focusedFitBounds(
	svg: SVGSVGElement,
	focusedScopeId?: string,
): CameraBounds | SVGRect | undefined {
	if (!focusedScopeId) return svg.viewBox?.baseVal;
	const scope = Array.from(
		svg.querySelectorAll<SVGGraphicsElement>("[data-cluster-id]"),
	).find(
		(element) => element.getAttribute("data-cluster-id") === focusedScopeId,
	);
	const outline = scope?.querySelector<SVGRectElement>("rect");
	if (!outline) return svg.viewBox?.baseVal;
	const x = numericAttribute(outline, "x");
	const y = numericAttribute(outline, "y");
	const width = numericAttribute(outline, "width");
	const height = numericAttribute(outline, "height");
	if (
		x === undefined ||
		y === undefined ||
		width === undefined ||
		height === undefined ||
		width <= 0 ||
		height <= 0
	) {
		return svg.viewBox?.baseVal;
	}
	return { x, y, width, height };
}
