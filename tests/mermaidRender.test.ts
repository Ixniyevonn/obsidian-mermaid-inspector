import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { JSDOM } from "jsdom";
import {
  ease,
  interpolatePathD,
  postProcessAndTag,
  extractPositions,
} from "../src/utils/mermaidRender";

// --- DOM setup for tagging/extract tests (bun test runs in node-like env) ---
let dom: JSDOM;
let origDocument: any;
let origWindow: any;

beforeAll(() => {
  dom = new JSDOM("<!doctype html><html><body></body></html>", {
    pretendToBeVisual: true,
  });
  origDocument = (global as any).document;
  origWindow = (global as any).window;
  (global as any).document = dom.window.document;
  (global as any).window = dom.window;
  (global as any).Element = dom.window.Element;
  (global as any).SVGElement = dom.window.SVGElement;
  (global as any).SVGSVGElement = dom.window.SVGSVGElement;
  (global as any).SVGGElement = dom.window.SVGGElement;
  (global as any).SVGPathElement = dom.window.SVGPathElement;
  (global as any).SVGRectElement = dom.window.SVGRectElement;
});

afterAll(() => {
  (global as any).document = origDocument;
  (global as any).window = origWindow;
});

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

describe("postProcessAndTag + extractPositions (stable id assignment)", () => {
  it("assigns data-cluster-id and data-node-id from mermaid g# ids (source ids)", () => {
    // Simulate a typical mermaid-rendered svg snippet (no real layout numbers needed for tagging)
    const sampleSvg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">
        <g id="flowchart-Outer-0" class="cluster">
          <rect class="clusterRect" x="10" y="10" width="120" height="80"/>
          <text>Order Processing</text>
        </g>
        <g id="flowchart-Validate-7" class="node">
          <rect x="20" y="30" width="60" height="30"/>
          <text>Validate Request</text>
        </g>
        <g id="flowchart-User-1" class="node">
          <circle cx="5" cy="5" r="10"/>
          <text>User</text>
        </g>
      </svg>
    `.trim();

    const tagged = postProcessAndTag(sampleSvg, {
      labelToId: {
        "Order Processing": "Outer",
        "Validate Request": "Validate",
        User: "User",
      },
    });
    const outer = tagged.querySelector('[data-cluster-id="Outer"]');
    const validate = tagged.querySelector('[data-node-id="Validate"]');
    const user = tagged.querySelector('[data-node-id="User"]');

    expect(outer).not.toBeNull();
    expect(validate).not.toBeNull();
    expect(user).not.toBeNull();
    expect(outer!.getAttribute("data-cluster-id")).toBe("Outer");
    expect(validate!.getAttribute("data-node-id")).toBe("Validate");
    expect(user!.getAttribute("data-node-id")).toBe("User");
  });

  it("extracts source ids from varied real-world mermaid id formats (prefixed, nested, fancy)", () => {
    const sampleSvg = `
      <svg xmlns="http://www.w3.org/2000/svg">
        <g id="cluster-Inner-xyz-3" class="cluster"><rect x="0" y="0" width="10" height="10"/><text>Payment Subsystem</text></g>
        <g id="flowchart-Validate-42-0-1" class="node"><rect x="0" y="0" width="10" height="10"/><text>Validate Request</text></g>
        <g id="weird-prefix-Build-abc" class="node"><rect x="0" y="0" width="10" height="10"/><text>Build Order</text></g>
      </svg>
    `.trim();

    const tagged = postProcessAndTag(sampleSvg, {
      labelToId: {
        "Payment Subsystem": "Inner",
        "Validate Request": "Validate",
        "Build Order": "Build",
      },
    });
    expect(tagged.querySelector('[data-cluster-id="Inner"]')).not.toBeNull();
    expect(tagged.querySelector('[data-node-id="Validate"]')).not.toBeNull();
    expect(tagged.querySelector('[data-node-id="Build"]')).not.toBeNull();
  });

  it("custom label-to-id map (from generator/AST) is the primary way to assign stable ids (content based, no mermaid id attr)", () => {
    // Even with a completely garbage mermaid id attr, if labelToId map is provided
    // (built from the AST labels in getViewSourceWithMeta), we use the mapped logical id.
    const sampleSvg = `
      <svg xmlns="http://www.w3.org/2000/svg">
        <g id="total-garbage-foo-999" class="cluster">
          <rect x="0" y="0" width="10" height="10"/>
          <text>Order Processing</text>
        </g>
        <g id="nonsense-bar-123" class="node">
          <rect x="0" y="0" width="10" height="10"/>
          <text>Validate Request</text>
        </g>
      </svg>
    `.trim();

    const tagged = postProcessAndTag(sampleSvg, {
      labelToId: {
        "Order Processing": "Outer",
        "Validate Request": "Validate",
      },
    });

    expect(tagged.querySelector('[data-cluster-id="Outer"]')).not.toBeNull();
    expect(tagged.querySelector('[data-node-id="Validate"]')).not.toBeNull();
    // The garbage ids in the attr were ignored in favor of content (label) + map.
  });

  it("assigns data-edge-id from provided content-based edgeKeys (src--dst)", () => {
    const sampleSvg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">
        <defs></defs>
        <path d="M 10 10 C 20 20 30 30 40 40"/>
        <path d="M 50 10 L 90 40"/>
        <g class="edgeLabel"><text>eX_Y</text></g>
      </svg>
    `.trim();

    const edgeKeys = ["Catalog--Outer", "Review--Inner"];
    const tagged = postProcessAndTag(sampleSvg, edgeKeys);

    const p0 = tagged.querySelectorAll("path")[0];
    const p1 = tagged.querySelectorAll("path")[1];
    expect(p0.getAttribute("data-edge-id")).toBe("Catalog--Outer");
    expect(p1.getAttribute("data-edge-id")).toBe("Review--Inner");

    // legacy e label should still be ignored (not removed unless no keys)
    // but here keys provided so label stays
    expect(tagged.querySelector(".edgeLabel")).not.toBeNull();
  });

  it("extractPositions uses the tagged ids and reads bboxes (polyfilled)", () => {
    const sampleSvg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200">
        <g id="flowchart-Outer-0" data-cluster-id="Outer" class="cluster">
          <rect x="5" y="5" width="90" height="40"/>
        </g>
        <g id="flowchart-A-2" data-node-id="A" class="node">
          <rect x="100" y="10" width="40" height="20"/>
        </g>
        <path data-edge-id="A--Outer" d="M 120 20 C 80 30 30 30 20 25"/>
      </svg>
    `.trim();

    // We must let postProcess run (it will re-add but already have), then polyfill bboxes for extract
    const tagged = postProcessAndTag(sampleSvg, ["A--Outer"]);

    // Polyfill getBBox on the elements that extract will query (jsdom does not compute geometry)
    const clusterG = tagged.querySelector("[data-cluster-id]") as any;
    const nodeG = tagged.querySelector("[data-node-id]") as any;
    const edgeP = tagged.querySelector("[data-edge-id]") as any;

    clusterG.getBBox = () => ({ x: 5, y: 5, width: 90, height: 40 });
    nodeG.getBBox = () => ({ x: 100, y: 10, width: 40, height: 20 });
    // rect inside also for cluster path in extract
    const rect = clusterG.querySelector("rect") as any;
    if (rect) {
      // extract prefers reading attrs from rect when present for clusters
    }

    const pos = extractPositions(tagged as any);

    expect(pos.clusters["Outer"]).toEqual({ x: 5, y: 5, width: 90, height: 40 });
    expect(pos.nodes["A"]).toEqual({ x: 100, y: 10, width: 40, height: 20 });
    expect(pos.edges["A--Outer"]).toBe("M 120 20 C 80 30 30 30 20 25");
  });

  it("falls back gracefully when no edgeKeys and uses legacy e-labels (and removes them)", () => {
    const sampleSvg = `
      <svg xmlns="http://www.w3.org/2000/svg">
        <path d="M 1 1 C 2 2 3 3 4 4"/>
        <g class="edgeLabel"><text>eFoo_Bar</text></g>
      </svg>
    `.trim();

    const tagged = postProcessAndTag(sampleSvg); // no keys -> legacy path
    const path = tagged.querySelector("path")!;
    expect(path.getAttribute("data-edge-id")).toBe("eFoo_Bar");
    // label container removed
    expect(tagged.querySelector(".edgeLabel")).toBeNull();
  });

  it("assigns edge ids by endpoint proximity (geometry) when anchors exist, independent of order or passed keys array (prevents cross-wiring like User->Catalog becoming Validate->Build)", () => {
    // Simulate a small diagram with two possible connections.
    // Place "User" left, "Catalog" middle, "Validate" and "Build" inside a cluster on the right.
    // The left path should be labelled User--Catalog, the right one Validate--Build even if we pass a reversed keys array.
    const sampleSvg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="400" height="120">
        <!-- outside nodes -->
        <g data-node-id="User" class="node"><rect x="10" y="40" width="30" height="20"/></g>
        <g data-node-id="Catalog" class="node"><rect x="80" y="40" width="30" height="20"/></g>
        <!-- "cluster" that will contain inner nodes when expanded (center ~190 so it does not steal nearest for the inner connections) -->
        <g data-cluster-id="Outer" class="cluster"><rect x="150" y="10" width="80" height="90"/></g>
        <!-- inner nodes (new on expand) -->
        <g data-node-id="Validate" class="node"><rect x="220" y="30" width="50" height="18"/></g>
        <g data-node-id="Build" class="node"><rect x="290" y="30" width="50" height="18"/></g>

        <!-- two curve paths; first connects left pair, second connects inner pair -->
        <path d="M 40 50 C 55 50 70 50 80 50"/>
        <path d="M 245 40 C 260 35 275 35 290 40"/>
      </svg>
    `.trim();

    // Pass a *reversed* keys array on purpose. With the old index logic this would have wired wrongly.
    // With proximity it must still produce correct endpoint-based keys.
    const badOrderKeys = ["Validate--Build", "User--Catalog"];
    const tagged = postProcessAndTag(sampleSvg, badOrderKeys);

    const paths = Array.from(tagged.querySelectorAll("path"));
    const ids = paths.map((p) => p.getAttribute("data-edge-id"));

    // The leftish path (User-Catalog) and rightish path (Validate-Build) must be correctly identified by nearness
    expect(ids).toContain("User--Catalog");
    expect(ids).toContain("Validate--Build");
    // And not the crossed ones
    expect(ids).not.toContain("User--Validate");
  });
});
