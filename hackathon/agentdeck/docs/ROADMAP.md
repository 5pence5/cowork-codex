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

The main structural gaps are mixed state/rendering concerns, incomplete slide-entry reporting, no distinction between visibility and delivery, ad hoc result strings, unversioned commands, always-on tools, blended persistence and live-generated material that mutates the deck directly.

## Phase 0 — Canonical design and custody

**Status:** established by the architecture-document pass.

Deliverables:

- canonical system, protocol, accretion and decision documents;
- local `AGENTS.md` with source order and invariants;
- implementation phases and acceptance gates;
- README links and an honest current-versus-target status.

Gate:

- future changes have one canonical design source and cannot plausibly interpret the tool set as unrelated utilities.

## Phase 1 — Transport and test foundation

Objective: make the current demo standards-facing and observable before refactoring behaviour.

Work:

1. Use `document.modelContext` as the primary API.
2. Await registration promises and report per-tool failures.
3. Register with `AbortController` lifecycle management.
4. Add current annotations and concise titles/descriptions.
5. Add AgentDeck modules to syntax checking.
6. Add Playwright/browser tests with a fake `document.modelContext`.
7. Add an adapter that normalises command results for WebMCP and console use.
8. Expose a registration manifest and a deterministic demo-reset action.

Acceptance:

- the status chip turns green only after every expected tool registers;
- rejected registration is visible and actionable;
- all current tools can be invoked through the simulator and fake WebMCP path;
- CI exercises AgentDeck JavaScript and at least one end-to-end presentation flow;
- the static, dependency-light run path remains available.

## Phase 2 — Explicit state, delivery and one command bus

Objective: eliminate split-brain behaviour before adding new capability.

Work:

1. Define separate deck and session state modules.
2. Introduce stable slide, beat and element IDs.
3. Convert each slide's initial visible state into an entry beat.
4. Introduce one pure reducer/controller and event types.
5. Route WebMCP, keyboard, progress dots, reset and console through dispatch.
6. Separate deck revision from session revision.
7. Add minimal expected-revision and idempotency handling, beginning with `advance`.
8. Track command source and driver policy.
9. Add a delivery ledger distinct from visibility.
10. Let the next presentation command acknowledge the previous beat without an extra call.
11. Restore the saved cursor deliberately or start a new session explicitly.
12. Replace timer-based semantic spotlight with explicit focus state.

Acceptance:

- the same command from keyboard and WebMCP produces equal semantic events;
- slide entry returns every element that became visible, including fact value and diagram summary;
- current visible IDs are reconstructible without DOM inspection;
- a newly visible beat is `pending`, not falsely recorded as delivered;
- interruption preserves pending/partial delivery and allows accurate resumption;
- no UI handler directly mutates presentation state;
- focus and question overlays clear only by event;
- snapshot plus event replay reconstructs the same session;
- concurrent stale human/agent input fails without duplicate progression.

## Phase 3 — Protocol envelope and efficient observation

Objective: give the agent complete near-field awareness at low context cost.

Work:

1. Implement the complete `agentdeck/2` command and result envelopes.
2. Standardise request IDs, adapter-generated idempotency keys and expected revisions across every mutating tool.
3. Cache recent command results for bounded retry safety.
4. Implement `deck.observe` views and `sinceRevision` deltas.
5. Include narration purpose/cue, delivery state, epistemic status and valid next actions in results.
6. Add stable error codes and one-call recovery observations.
7. Remove multi-step narrated `advance`; use explicit `navigate` for skips.
8. Add output bounds and content-hash elision for unchanged blocks.

Acceptance:

- duplicate `advance` idempotency keys do not double-advance;
- stale revisions fail without mutation;
- a normal beat requires one call and no immediate orientation call;
- a resumed agent can act correctly from one brief observation;
- brief observations distinguish visible, delivered and provisional material;
- large-deck observations remain bounded;
- tool result delta and post-render DOM are exactly equivalent.

## Phase 4 — Provisional adaptation and transactional authoring

Objective: let the presentation adapt live without confusing improvisation with authorship.

Work:

1. Implement explicit session modes and driver policy.
2. Register always, presentation and authoring bundles with separate abort controllers.
3. Implement `deck.question` as a session object with bounded approved-material retrieval.
4. Implement `deck.stage` for provisional session slides and detours.
5. Maintain a return stack so a staged answer can return to the planned route.
6. Create a learning candidate whenever material is staged.
7. Add `deck.query` over semantic IDs, tags, claims and approved learning.
8. Add atomic `deck.transact` with dry-run, expected revision and checkpoint.
9. Separate patch schema from full slide schema.
10. Add undo, restore and export/import preview.
11. Distinguish session-only theme/view changes from durable deck defaults.

Acceptance:

- only mode-relevant tools are registered;
- mode change reports the exact new registration manifest;
- a generated live slide can be created and presented in one session command;
- staging increments session revision but never deck revision;
- every staged slide is visibly and structurally provisional, with origin and candidate ID;
- returning restores the exact canonical route location;
- a multi-operation durable edit creates one deck revision or none;
- dry-run reports affected IDs and warnings without mutation;
- failed operation rolls back the whole transaction;
- promotion preserves staged provenance;
- undo restores the previous content hash and route order;
- ordinal slide insertion does not invalidate durable references.

## Phase 5 — Semantic content and narrative graph

Objective: let agents reason about purpose and evidence rather than opaque markup.

Work:

1. Separate element semantics from view/layout specifications.
2. Add deck objective, audience, duration and constraints.
3. Add beat purpose, narration cue, detail and delivery metadata.
4. Add routes and explicit branch navigation.
5. Add claims, source references and epistemic status.
6. Introduce semantic diagram nodes/edges/groups and retain raw SVG as a bounded escape hatch.
7. Generate accessible descriptions and focus manifests from the same model.
8. Add audience/route fit metadata without treating inferred audience state as fact.

Acceptance:

- an agent can answer what each slide and beat is for without parsing notes;
- claims can be queried with their evidence, freshness and provenance;
- narration results warn when a claim is provisional or disputed;
- diagram regions can be narrated, focused and patched by semantic ID;
- one deck can support a short route and a detailed route without duplicating slides;
- route changes preserve session-journal clarity;
- content survives a layout/theme change without semantic loss.

## Phase 6 — Accretion pipeline

Objective: improve future sessions without self-corruption.

Work:

1. Persist append-only session journals separately from decks.
2. Capture objective timing, question, correction, delivery, override and recovery signals.
3. Synthesize bounded end-of-session observations.
4. Create learning candidates with source event IDs, confidence and proposed transactions.
5. Add review, approve, reject and supersede states.
6. Promote candidates through `deck.transact`.
7. Add an approved, content-addressed reusable library and deduplication.
8. Add retention, attribution and redaction controls.
9. Track candidate utility separately from factual confidence.

Acceptance:

- live questions and staged slides do not change deck revision;
- every candidate traces to source events and session context;
- factual candidates without evidence remain marked `needs-evidence`;
- recurrence may increase priority but not factual confidence by itself;
- promotion creates one explicit deck revision;
- rejected candidates are not repeatedly proposed as new;
- approved prior answers are retrievable without loading raw session logs;
- audience attribution cannot leak into public content by default.

## Phase 7 — Evaluation, deployment and stage reliability

Objective: make the system dependable under real model and presentation conditions.

Work:

1. Tool-selection and argument-accuracy eval corpus.
2. Long-deck context-budget tests.
3. Delivery-interruption and resumption tests.
4. Human takeover and concurrent-input tests.
5. Refresh, reconnect and registration-failure recovery tests.
6. Provisional staging and promotion-quality evals.
7. Accessibility audit and reduced-motion support.
8. Full-screen presentation mode and deterministic demo reset.
9. Dedicated public repository/deployment or an equally obvious judge-facing surface.
10. Rehearsal telemetry and stage preflight automation.

Acceptance:

- target prompts select the intended tool and valid arguments at a defined success rate;
- no tested retry or concurrent-input scenario double-applies a command;
- the system never equates visible and delivered state after a tested interruption;
- staged material cannot enter the canonical deck without promotion;
- the system recovers from refresh and tool-registration failure without losing the deck;
- the core flow works at desktop and mobile presentation viewports;
- the public link opens directly into a clean demo;
- the runbook can be completed from a fresh browser profile;
- a fallback path remains functional when WebMCP is unavailable.

## First implementation slice

The first code PR should remain narrow and load-bearing:

1. add a transport adapter using `document.modelContext` and awaited registration;
2. create a minimal controller that wraps the existing `Deck` behaviour;
3. route WebMCP, keyboard and console progression through that controller;
4. return one internal result envelope for `get_deck`/observe and `advance`;
5. represent slide entry as a complete appeared-content event;
6. introduce session revision, command source and minimal duplicate-command protection;
7. represent the active beat's delivery as `pending` and acknowledge it on the next advance;
8. add tests for registration, slide entry, keyboard parity, interruption and duplicate handling.

Do not begin route graphs, reusable libraries, staged-slide UI or a framework rewrite before this slice passes.

## Success metrics

Track metrics that reflect agent ergonomics rather than feature count:

| Metric | Direction |
| --- | --- |
| tool calls per ordinary beat | down, target 1 |
| tokens returned per ordinary beat | bounded and low |
| tool-selection accuracy | up |
| invalid-argument rate | down |
| state-recovery calls after interruption | down |
| beats falsely marked delivered | zero |
| duplicate side effects under retry | zero |
| DOM/result delta mismatches | zero |
| stale-state mutations | zero |
| staged slides that mutate deck revision | zero |
| generated material promoted without review | zero |
| recurrent-question coverage by approved material | up |
| successful fallback demonstrations | up |
