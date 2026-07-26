import { describe, expect, it } from "bun:test";
import { JSDOM } from "jsdom";
import { isCanvasEmbed } from "../src/obsidian/canvasEmbed";

describe("Canvas embedded file views", () => {
	it("recognizes a view mounted directly inside a Canvas node", () => {
		const document = new JSDOM(
			'<div class="canvas-node"><div class="canvas-node-content"><div id="view"></div></div></div>',
		).window.document;
		const view = document.querySelector<HTMLElement>("#view");

		expect(view).not.toBeNull();
		expect(isCanvasEmbed(view as HTMLElement)).toBe(true);
	});

	it("recognizes a view mounted in a Canvas node iframe", () => {
		const document = new JSDOM(
			'<!doctype html><body class="canvas-node-iframe-body"><div id="view"></div></body>',
		).window.document;
		const view = document.querySelector<HTMLElement>("#view");

		expect(view).not.toBeNull();
		expect(isCanvasEmbed(view as HTMLElement)).toBe(true);
	});

	it("does not compact a normal workspace view", () => {
		const document = new JSDOM(
			'<div class="workspace-leaf"><div id="view"></div></div>',
		).window.document;
		const view = document.querySelector<HTMLElement>("#view");

		expect(view).not.toBeNull();
		expect(isCanvasEmbed(view as HTMLElement)).toBe(false);
	});
});
