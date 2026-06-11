import { Flowchart, type FlowchartSubgraph } from "mermaid-ast";

/**
 * SINGLE SOURCE OF TRUTH
 * The complete, fully-expanded Mermaid diagram as a plain string.
 * All "collapsed" and "expanded" views for the UI are derived from this
 * by parsing to AST, pruning hidden interiors of non-expanded subgraphs,
 * and re-rendering to source text.
 */
export const FULL_MERMAID = `flowchart TB
  User["User"]
  Catalog["Catalog"]
  Promo["Promo"]

  subgraph Outer["Order Processing"]
    Validate["Validate Request"]
    Build["Build Order"]
    Review["Review Items"]
    Audit["Audit Log"]

    subgraph Inner["Payment Subsystem"]
      Enter["Enter Payment"]
      ValidateCard["Validate Card"]
      Fraud{"Fraud Check"}
      Auth["Authorize"]
      Capture["Capture Funds"]
      Receipt["Issue Receipt"]
    end

    Discounts["Apply Discounts"]
    Confirm["Confirm Order"]
    ShipPrep["Prepare Shipment"]
  end

  Notify["Notify Customer"]
  Inventory["Reserve Stock"]
  Analytics["Analytics"]
  Done["Done"]

  User --> Catalog
  Promo --> Catalog
  Catalog --> Validate
  User -.->|express| Validate
  Validate --> Build
  Build --> Review
  Review -->|toPayment| Inner
  Inner -->|paid| Discounts
  Discounts --> Confirm
  Confirm --> ShipPrep

  Review --> Audit
  Inner -->|paymentEvent| Audit
  ShipPrep --> Notify
  ShipPrep --> Inventory
  Inventory --> Analytics
  Notify --> Done
  Analytics --> Done

  Enter --> ValidateCard
  ValidateCard --> Fraud
  Fraud -->|ok| Auth
  Fraud -->|fraud| Receipt
  Auth --> Capture
  Capture --> Receipt
  Receipt -->|done| ShipPrep
  Enter -.->|retry| ValidateCard
`;

/**
 * Given the current set of expanded subgraph IDs, return a Mermaid source
 * string suitable for mermaid.render().
 *
 * For collapsed subgraphs, edges crossing their boundary are redirected to
 * the collapsed container ID so the subgraph block is properly connected.
 */
export function getViewSource(expanded: Set<string>): string {
  const diagram = Flowchart.parse(FULL_MERMAID);

  const subgraphsById = new Map<string, FlowchartSubgraph>();
  for (const sg of diagram.subgraphs) {
    subgraphsById.set(sg.id, sg);
  }

  // parentSg: maps every member ID (regular node OR nested subgraph ID) to its
  // direct containing subgraph ID.
  const parentSg = new Map<string, string>();
  for (const sg of diagram.subgraphs) {
    for (const memberId of (sg.nodes ?? [])) {
      parentSg.set(memberId, sg.id);
    }
  }

  // For a given node/subgraph id, return the outermost collapsed container
  // that visually represents it in the current view, or `id` itself if it is
  // not inside any collapsed subgraph.
  function collapsedProxy(id: string): string {
    let cur = id;
    let result = id;
    while (parentSg.has(cur)) {
      const parentId = parentSg.get(cur)!;
      if (!expanded.has(parentId)) {
        result = parentId;
      }
      cur = parentId;
    }
    return result;
  }

  // Collect cross-boundary edge redirections BEFORE removing any nodes.
  // We add the redirected edges first, then removeNode() cleans up the
  // originals (it strips all edges incident to the removed node).
  const seen = new Set<string>();
  const redirects: Array<[string, string]> = [];

  for (const link of diagram.links) {
    const srcProxy = collapsedProxy(link.source);
    const dstProxy = collapsedProxy(link.target);
    // Skip: both endpoints unchanged (no redirect needed)
    if (srcProxy === link.source && dstProxy === link.target) continue;
    // Skip: both endpoints collapse to the same container (internal edge)
    if (srcProxy === dstProxy) continue;
    const key = `${srcProxy}|||${dstProxy}`;
    if (!seen.has(key)) {
      seen.add(key);
      redirects.push([srcProxy, dstProxy]);
    }
  }

  for (const [src, dst] of redirects) {
    diagram.addLink(src, dst);
  }

  // Remove interior regular nodes from each collapsed subgraph.
  // removeNode({reconnect:false}) also strips all their incident edges,
  // which removes the original (un-redirected) copies of cross-boundary links.
  for (const sg of diagram.subgraphs) {
    if (!expanded.has(sg.id)) {
      for (const memberId of [...(sg.nodes ?? [])]) {
        if (!subgraphsById.has(memberId) && diagram.hasNode(memberId)) {
          diagram.removeNode(memberId, { reconnect: false });
        }
      }
    }
  }

  // Strip regular-node entries from collapsed subgraph member lists so the
  // renderer doesn't re-declare them inside the subgraph body.
  for (const sg of diagram.subgraphs) {
    if (!expanded.has(sg.id)) {
      sg.nodes = (sg.nodes ?? []).filter((id: string) => subgraphsById.has(id));
    }
  }

  return diagram.render();
}
