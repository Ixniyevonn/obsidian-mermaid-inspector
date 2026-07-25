import { describe, expect, it } from "bun:test";
import { DEFAULT_SETTINGS } from "../src/settingsData";

describe("plugin settings", () => {
	it("uses a visible but responsive default transition duration", () => {
		expect(DEFAULT_SETTINGS.transitionDuration).toBeGreaterThanOrEqual(100);
		expect(DEFAULT_SETTINGS.transitionDuration).toBeLessThanOrEqual(1000);
		expect(DEFAULT_SETTINGS.embeddedStates).toEqual({});
	});
});
