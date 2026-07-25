import type { InspectorState } from "./diagram/state";

export interface MermaidInspectorSettings {
	transitionDuration: number;
	embeddedStates: Record<string, InspectorState>;
}

export const DEFAULT_SETTINGS: MermaidInspectorSettings = {
	transitionDuration: 320,
	embeddedStates: {},
};
