// Quick verification of parser + generators contract using bun (pure, no DOM).
import { parseMermaid } from '../src/lib/parser';
import { generateCollapsedSource, generateExpandedSource } from '../src/lib/generators';

const HARDCODED = `flowchart TD
    Start[Start] --> Platform

    subgraph Platform["Platform Layer"]
        Init[Initialize] --> Auth[Authenticate]
        Auth --> DB[(Database)]

        subgraph Services["Services"]
            API[REST API]
            Cache[(Cache)]
            API --> Worker[Background Worker]
            Worker --> Cache
        end

        Auth --> Services
        DB --> Services
        Services --> Response[Response]
        Response --> Log[Log]
    end

    Log --> End[End]
`;

console.log('=== PARSING ===');
const model = parseMermaid(HARDCODED);
console.log('Scopes:', Array.from(model.scopes.keys()));
console.log('Nodes:', Array.from(model.nodes.keys()));
console.log('Edges count:', model.edges.size);
console.log('Root direct nodes:', model.scopes.get('')?.directNodeIds);

console.log('\n=== COLLAPSED SOURCE ===');
const collapsed = generateCollapsedSource(model);
console.log(collapsed);

console.log('\n=== EXPANDED "Services" SOURCE ===');
const expandedServices = generateExpandedSource(model, 'Services');
console.log(expandedServices);

console.log('\n=== EXPANDED "Platform" SOURCE ===');
const expandedPlatform = generateExpandedSource(model, 'Platform');
console.log(expandedPlatform);

// Basic contract assertions for milestone
const hasSubgraphPlatformCollapsed = /subgraph Platform/.test(collapsed);
const hasSubgraphServicesCollapsed = /subgraph Services/.test(collapsed);
const servicesInlined = /API/.test(expandedServices) && !/subgraph Services/.test(expandedServices);
const platformInlined = /Cache/.test(expandedPlatform) && /Response/.test(expandedPlatform) && !/subgraph Platform/.test(expandedPlatform);

console.log('\n=== CONTRACT CHECKS ===');
console.log('Collapsed contains Platform cluster:', hasSubgraphPlatformCollapsed);
console.log('Collapsed contains Services cluster:', hasSubgraphServicesCollapsed);
console.log('Expanded-Services inlines API node and removes Services wrapper:', servicesInlined);
console.log('Expanded-Platform inlines and removes Platform wrapper:', platformInlined);

if (hasSubgraphPlatformCollapsed && hasSubgraphServicesCollapsed && servicesInlined && platformInlined) {
  console.log('\n✅ All basic generator contract checks passed.');
  process.exit(0);
} else {
  console.error('\n❌ Generator contract checks FAILED.');
  process.exit(1);
}
