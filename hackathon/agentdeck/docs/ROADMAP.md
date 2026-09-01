# AgentDeck Implementation Roadmap

**Goal:** migrate the current prototype to the architecture in [SYSTEM.md](SYSTEM.md) without losing a working demonstration at any stage.

The sequence is dependency-driven. Each phase establishes an abstraction required by the next; later work must not bypass an earlier acceptance gate.

## Current baseline

The prototype already demonstrates the product insight:

- an agent can navigate and reveal a deck;
- tool results can report revealed text;
- slides can be created and edited live;
- focus, zoom, questions and themes are visible;
- keyboard and console fallback make the demo usable without WebMCP.

The main structural gaps are mixed state/rendering concerns, incomplete slide-entry reporting, ad hoc result strings, unversioned commands, always-on tools, blended persistence and unreviewed live mutation.

## Phase 0 — Canonical design and custody

**Status:** established by the architecture-document pass.

Deliverables:

- canonical system, protocol, accretion and decision documents;
- local `AGENTS.md` with source order and invariants;
- implementation phases and acceptance gates;
- README links and an honest current-versus-target status.

Gate:

- future changes have one canonical design source and cannot plausibly interpret the tool set as eleven unrelated utilities.

## Phase 1 — Transport and test foundation

Objective: make the current demo standards-facing and observable before refactoring behaviour.

Work:

1. Use `document.modelContext` as the primary API.
2. Await registration promises and report per-tool failures.
3. Register with `AbortController` lifecycle management.
4. Add current annotations and concise titles/descriptions.
5. Add AgentDeck modules to syntax checking.
6. Add Playwright/browser tests with a fake `document.modelContext`.
7. Add an internal adapter that normalises command results for WebMCP and console use.

Acceptance:

- the status chip turns green only after every expected tool registers;
- rejected registration is visible and actionable;
- all current tools can be invoked through the simulator and fake WebMCP path;
- CI exercises AgentDeck JavaScript and at least one end-to-end presentation flow;
- the static, dependency-light run path remains available.

## Phase 2 — Explicit state and command bus

Objective: eliminate split-brain behaviour.

Work:

1. Define typed deck artifact and session state modules.
2. Introduce stable slide, beat and element IDs.
3. Convert each slide's initial visible state into an entry beat.
4. Introduce one pure reducer/controller and event types.
5. Route WebMCP, keyboard, progress dots, reset and console through dispatch.
6. Separate deck revision from session revision.
7. Add minimal expected-revision and idempotency handling at the command bus, beginning with `advance`.
8. Restore the saved cursor deliberately or start a new session explicitly.
9. Replace timer-based semantic spotlight with explicit focus state.

Acceptance:

- the same command from keyboard and WebMCP produces equal events;
- slide entry returns every element that became visible, including fact value and diagram summary;
- current visible IDs are reconstructible without DOM inspection;
- no UI handler directly mutates presentation state;
- focus and question overlays survive observation and clear only by event;
- snapshot plus event replay reconstructs the same session.

## Phase 3 — Protocol envelope and efficient observation

Objective: give the agent complete near-field awareness at low context cost.

Work:

1. Implement the complete `agentdeck/2` command and result envelopes.
2. Standardise request IDs, adapter-generated idempotency keys and expected revisions across every mutating tool.
3. Cache recent command results for bounded retry safety.
4. Implement `deck.observe` views and `sinceRevision` deltas.
5. Include narration purpose/cue and valid next actions in results.
6. Add stable error codes and one-call recovery observations.
7. Remove multi-step narrated `advance`; use explicit `navigate` for skips.

Acceptance:

- duplicate `advance` idempotency keys do not double-advance;
- stale revisions fail without mutation;
- a normal beat requires one call and no immediate orientation call;
- a resumed agent can act correctly from one brief observation;
- large-deck brief observations remain bounded;
- tool result delta and post-render DOM are exactly equivalent.

## Phase 4 — Mode-scoped tools and transactional authoring

Objective: reduce tool-choice cost and make edits safe.

Work:

1. Implement explicit session modes.
2. Register always, presentation and authoring bundles with separate abort controllers.
3. Add `deck.query` over semantic IDs, tags, claims and summaries.
4. Add atomic `deck.transact` with dry-run, expected revision and checkpoint.
5. Separate patch schema from full slide schema.
6. Add undo, restore and export/import preview.
7. Distinguish session-only theme/view changes from durable deck defaults.

Acceptance:

- only mode-relevant tools are registered;
- mode change reports the exact new registration manifest;
- a multi-operation edit creates one deck revision or none;
- dry-run reports affected IDs and warnings without mutation;
- failed operation rolls back the whole transaction;
- undo restores the previous content hash and route order;
- ordinal slide insertion does not invalidate durable references.

## Phase 5 — Semantic content and narrative graph

Objective: let agents reason about purpose and evidence rather than opaque markup.

Work:

1. Separate element semantics from view/layout specifications.
2. Add deck objective, audience, duration and constraints.
3. Add beat purpose, narration cue, detail and delivery metadata.
4. Add routes and explicit branch navigation.
5. Add claims and source references.
6. Introduce semantic diagram nodes/edges/groups and retain raw SVG as a bounded escape hatch.
7. Generate accessible descriptions and focus manifests from the same model.

Acceptance:

- an agent can answer what each slide and beat is for without parsing notes;
- claims can be queried with their evidence and provenance;
- diagram regions can be narrated, focused and patched by semantic ID;
- one deck can support a short route and a detailed route without duplicating slides;
- route changes preserve session journal clarity;
- content survives a layout/theme change without semantic loss.

## Phase 6 — Accretion pipeline

Objective: improve future sessions without self-corruption.

Work:

1. Persist append-only session journals separately from decks.
2. Capture objective timing, question, correction, override and recovery signals.
3. Synthesize bounded end-of-session observations.
4. Create learning candidates with source event IDs, confidence and proposed transaction.
5. Add review, approve, reject and supersede states.
6. Promote candidates through `deck.transact`.
7. Add an approved, content-addressed reusable library and deduplication.
8. Add retention, attribution and redaction controls.

Acceptance:

- live questions do not change deck revision;
- every candidate traces to source events;
- factual candidates without evidence remain marked `needs-evidence`;
- promotion creates one explicit deck revision;
- rejected candidates are not repeatedly proposed as new;
- approved prior answers are retrievable without loading raw session logs;
- audience attribution cannot leak into public content by default.

## Phase 7 — Evaluation, deployment and stage reliability

Objective: make the system dependable under real model and presentation conditions.

Work:

1. Tool-selection and argument-accuracy eval corpus.
2. Long-deck context-budget tests.
3. Human takeover and concurrent-input tests.
4. Refresh, reconnect and registration-failure recovery tests.
5. Accessibility audit and reduced-motion support.
6. Full-screen presentation mode and deterministic demo reset.
7. Dedicated public repository/deployment or an equally obvious judge-facing surface.
8. Rehearsal telemetry and stage preflight automation.

Acceptance:

- target prompts select the intended tool and valid arguments at a defined success rate;
- no tested retry or concurrent-input scenario double-applies a command;
- the system recovers from refresh and tool-registration failure without losing the deck;
- the core flow works at desktop and mobile presentation viewports;
- the public link opens directly into a clean demo;
- the runbook can be completed from a fresh browser profile;
- a fallback path remains functional when WebMCP is unavailable.

## First implementation slice

The first code PR should remain narrow and load-bearing:

1. add a transport adapter using `document.modelContext` and awaited registration;
2. create a minimal controller that wraps the existing `Deck` behaviour;
3. return one internal result envelope for `get_deck`, `advance` and keyboard commands;
4. represent slide entry as a complete appeared-content event;
5. add tests for registration, slide entry, keyboard parity and duplicate command handling.

Do not begin route graphs, reusable libraries or a framework rewrite before this slice passes.

## Success metrics

Track metrics that reflect agent ergonomics rather than feature count:

| Metric | Direction |
| --- | --- |
| tool calls per ordinary beat | down, target 1 |
| tokens returned per ordinary beat | bounded and low |
| tool-selection accuracy | up |
| invalid-argument rate | down |
| state-recovery calls after interruption | down |
| duplicate side effects under retry | zero |
| DOM/result delta mismatches | zero |
| stale-state mutations | zero |
| generated material promoted without review | zero |
| recurrent question coverage by approved material | up |
| successful fallback demonstrations | up |
