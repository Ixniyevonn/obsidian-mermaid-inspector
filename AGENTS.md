Here's path to the previous project I did as one of examples: `C:\Sync\Arc\Projects\obsidian-viewpoint`
Suggest adding packages if required.
I do reload Obsidian completely after each update, when I describe problem it was not caused by not applying updates, but rather by poor implementation or not building project correctly on your side.

## Imperatives
* Working code only. Finish the job. Plausibility is not correctness.
* Debug root causes, not symptoms. Fix the underlying issue — do not suppress errors.
* Stop when confused. If a task has two plausible interpretations, ask for clarification — do not guess.
* Never fabricate. Do not invent file paths, API names, test results, or code. Verify or admit ignorance.

## Don't
- Do not bypass errors,
- Do not guess or speculate when stuck — ask or propose a minimal plan instead.

## When stuck or facing missing pieces
- Do not hack around the problem or implement workarounds.
- Ask a clarifying question, propose the minimal real implementation plan, or implement the actual missing piece (e.g. the API endpoint or proper integration) if it is within scope.
- For frontend: implement real data flows, proper state management per project conventions (Zustand/Redux/Context/etc.), full interactivity, accessibility, and responsive behavior.

## Testing & verification
- Add or update tests for any code you change, even if nobody asked.
- Run relevant file-scoped checks (typecheck, lint, test) after edits and fix until green before considering the task done.
- Prefer running code/tests over plausible-looking output.
- For UI/frontend work: confirm functionality works end-to-end (real interactions, not just static render).
