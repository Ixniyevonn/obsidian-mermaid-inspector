export interface MermaidTemplate {
	id: string;
	name: string;
	description: string;
	fileName: string;
	source: string;
	expectValid: boolean;
}

export const MERMAID_TEMPLATES: readonly MermaidTemplate[] = [
	{
		id: "simple",
		name: "Simple flowchart",
		description: "A minimal graph without subgraphs",
		fileName: "Simple flowchart.mmd",
		expectValid: true,
		source: `flowchart LR
  Start([Start]) --> Work["Do work"]
  Work --> Done([Done])
`,
	},
	{
		id: "nested",
		name: "Nested subgraphs",
		description: "Two levels with edges crossing both boundaries",
		fileName: "Nested subgraphs.mmd",
		expectValid: true,
		source: `flowchart TB
  Request["Request"] --> Validate
  subgraph Pipeline["Processing Pipeline"]
    Validate{"Valid?"}
    subgraph Worker["Background Worker"]
      Queue[(Queue)] --> Execute["Execute Job"]
      Execute --> Result["Store Result"]
    end
    Validate -->|yes| Worker
    Worker --> Publish["Publish"]
  end
  Validate -->|no| Rejected["Rejected"]
  Publish --> Complete["Complete"]
`,
	},
	{
		id: "deep",
		name: "Deep hierarchy",
		description: "Four nested scopes for focus and fade testing",
		fileName: "Deep hierarchy.mmd",
		expectValid: true,
		source: `flowchart TB
  Input --> L1
  subgraph L1["Level One"]
    One["One"]
    subgraph L2["Level Two"]
      Two["Two"]
      subgraph L3["Level Three"]
        Three["Three"]
        subgraph L4["Level Four"]
          Four["Four"]
          Four --> DeepDone["Deep Done"]
        end
        Three --> L4
      end
      Two --> L3
    end
    One --> L2
  end
  L1 --> Output
`,
	},
	{
		id: "boundary",
		name: "Boundary edge stress",
		description: "Many incoming and outgoing edges plus parallel labels",
		fileName: "Boundary edge stress.mmd",
		expectValid: true,
		source: `flowchart LR
  A --> Inside1
  B -.->|optional| Inside2
  C ==>|priority| Inside1
  subgraph Scope["Busy Boundary"]
    Inside1 --> Shared
    Inside2 --> Shared
    Shared --> Exit1
    Shared --> Exit2
  end
  Exit1 --> X
  Exit2 --> Y
  Inside1 --> Z
`,
	},
	{
		id: "labels",
		name: "Labels and shapes",
		description: "Spaces, punctuation, Unicode labels, and varied shapes",
		fileName: "Labels and shapes.mmd",
		expectValid: true,
		source: `flowchart LR
  Customer(["Customer / API"])
  subgraph Checkout["Checkout - EU"]
    Validate{"Total >= EUR 50?"}
    Cache[("Cache: orders")]
    Note["Quoted: \\"ready\\""]
    Validate -->|yes| Cache --> Note
  end
  Customer --> Validate
  Note --> Finish[["Finish & notify"]]
`,
	},
	{
		id: "empty",
		name: "Empty and disconnected scopes",
		description: "Empty, disconnected, and single-node subgraphs",
		fileName: "Empty and disconnected scopes.mmd",
		expectValid: true,
		source: `flowchart TB
  Alone["Disconnected node"]
  subgraph Empty["Empty Scope"]
  end
  subgraph Single["Single Node Scope"]
    Only["Only child"]
  end
  Start --> Single
`,
	},
	{
		id: "comprehensive",
		name: "Comprehensive edge cases",
		description:
			"Nine sibling and nested scopes with boundary, shape, label, and edge-style cases",
		fileName: "Comprehensive edge cases.mmd",
		expectValid: true,
		source: `flowchart TB
  Start(["Start / API"]) --> Gateway
  Priority["Priority input"] ==>|urgent| DeepWorker
  Optional["Optional input"] -.->|retry| Validate
  Disconnected["Disconnected node"]
  subgraph Frontend["Frontend - Public"]
    direction LR
    Gateway{"Route >= v2?"}
    Browser["Browser & mobile"]
    Gateway -->|web| Browser
    subgraph ClientCache["Client Cache"]
      Cache[("Indexed DB")]
      CacheNote["Quoted: \\"fresh\\""]
      Cache --> CacheNote
    end
    Browser --> ClientCache
  end
  subgraph Backend["Backend Services"]
    direction TB
    Validate{"Payload valid?"}
    subgraph Processing["Processing Pipeline"]
      Normalize[["Normalize"]]
      subgraph Workers["Worker Pool"]
        Queue[("Queue: jobs")]
        subgraph DeepWorker["Deep Worker - L4"]
          Execute["Execute job"]
          Audit{{"Audit event"}}
          Execute --> Audit
        end
        Queue --> DeepWorker
      end
      Normalize --> Workers
    end
    subgraph Single["Single-node Scope"]
      Health(["Health check"])
    end
    subgraph Empty["Intentionally Empty Scope"]
    end
    Validate -->|yes| Processing
    Validate -->|health| Single
  end
  subgraph Observability["Observability"]
    Metrics[/"Metrics"/]
    Logs[\\"Logs"\\]
    Metrics --> Logs
  end
  Gateway --> Validate
  ClientCache --> Validate
  Validate -->|no| Rejected["Rejected"]
  DeepWorker --> Result["Result"]
  Audit --> Observability
  Processing --> Observability
  Single --> Observability
  Empty --> EmptyTarget["Empty scope target"]
  Result --> SharedDone(["Shared done"])
  Observability --> SharedDone
  Rejected --> SharedDone
`,
	},
	{
		id: "malformed",
		name: "Malformed source",
		description: "Intentionally invalid source for error-state testing",
		fileName: "Malformed source.mmd",
		expectValid: false,
		source: `flowchart TB
  subgraph Broken["Missing end"]
    A --> B
`,
	},
];
export async function firstAvailableFileName(
	baseName: string,
	exists: (candidate: string) => Promise<boolean>,
): Promise<string> {
	const dot = baseName.lastIndexOf(".");
	const stem = dot > 0 ? baseName.slice(0, dot) : baseName;
	const extension = dot > 0 ? baseName.slice(dot) : "";
	let index = 0;
	while (true) {
		const suffix = index === 0 ? "" : ` ${index}`;
		const candidate = `${stem}${suffix}${extension}`;
		if (!(await exists(candidate))) return candidate;
		index += 1;
	}
}
