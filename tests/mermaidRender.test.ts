import { describe, expect, it } from "bun:test";
import {
  ease,
  interpolatePathD,
  // Note: postProcess/extract require real DOM + getBBox + mermaid, tested manually via the component in Obsidian.
} from "../src/utils/mermaidRender";

describe("mermaidRender pure helpers", () => {
  it("ease produces values in [0,1] and ends at 1", () => {
    expect(ease(0)).toBeCloseTo(0, 5);
    expect(ease(0.5)).toBeGreaterThan(0.4);
    expect(ease(1)).toBeCloseTo(1, 5);
  });

  it("interpolatePathD lerps numbers when command structure matches", () => {
    const from = "M 0 0 L 10 0 L 10 10";
    const to = "M 20 5 L 30 5 L 30 15";
    const mid = interpolatePathD(from, to, 0.5);
    // Should have lerped coords
    expect(mid).toContain("10"); // 0 + (20-0)*0.5
    expect(mid).toContain("2.5"); // 0 + (5-0)*0.5 approx
  });

  it("interpolatePathD falls back to target on structure mismatch", () => {
    const from = "M 0 0 L 10 10";
    const to = "M 0 0 C 1 1 2 2 3 3";
    const res = interpolatePathD(from, to, 0.3);
    expect(res).toBe(to);
  });

  it("rebuilds a simple path after number lerp", () => {
    // Indirectly covered by interpolate when structures match
    const a = "M 0,0 L 100,0";
    const b = "M 0,0 L 200,50";
    const r = interpolatePathD(a, b, 1);
    expect(r).toBe(b);
  });
});
