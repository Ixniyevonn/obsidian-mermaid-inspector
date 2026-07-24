import { describe, expect, it } from "bun:test";
import { JSDOM } from "jsdom";
import { applyIntrinsicSvgSize } from "../src/utils/mermaidRender";

describe("vector-preserving SVG sizing", () => {
	it("uses viewBox dimensions as the layout size", () => {
		const document = new JSDOM(
			'<svg viewBox="0 0 2400 1600" width="100%" height="100%"></svg>',
			{ contentType: "image/svg+xml" },
		).window.document;
		const svg = document.documentElement as unknown as SVGSVGElement;

		applyIntrinsicSvgSize(svg);

		expect(svg.getAttribute("width")).toBe("2400");
		expect(svg.getAttribute("height")).toBe("1600");
		expect(svg.getAttribute("preserveAspectRatio")).toBe("xMidYMid meet");
	});

	it("does not retain percentage dimensions without a valid viewBox", () => {
		const document = new JSDOM('<svg width="100%" height="100%"></svg>', {
			contentType: "image/svg+xml",
		}).window.document;
		const svg = document.documentElement as unknown as SVGSVGElement;

		applyIntrinsicSvgSize(svg);

		expect(svg.hasAttribute("width")).toBe(false);
		expect(svg.hasAttribute("height")).toBe(false);
	});
});
