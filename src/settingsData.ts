import type { InspectorState } from "./utils/inspectorState";

export interface MermaidInspectorSettings {
	transitionDuration: number;
	embeddedStates: Record<string, InspectorState>;
}

export const DEFAULT_SETTINGS: MermaidInspectorSettings = {
	transitionDuration: 320,
	embeddedStates: {},
};
