# AgentDeck Agent Instructions

This file applies to `hackathon/agentdeck/**`.

AgentDeck is an agent-operated presentation control system. Treat it as one closed-loop system, not as a set of unrelated slide utilities.

## Read Order

Before changing AgentDeck, read these sources in order:

1. [`docs/SYSTEM.md`](docs/SYSTEM.md) — canonical architecture, abstraction tower and invariants.
2. [`docs/PROTOCOL.md`](docs/PROTOCOL.md) — commands, observations, tool bundles and response envelopes.
3. [`docs/ACCRETION.md`](docs/ACCRETION.md) — how live-session learning becomes reviewed reusable knowledge.
4. [`docs/DECISIONS.md`](docs/DECISIONS.md) — settled design decisions and rejected alternatives.
5. [`docs/ROADMAP.md`](docs/ROADMAP.md) — implementation sequence and acceptance gates.
6. [`docs/DEMO_RUNBOOK.md`](docs/DEMO_RUNBOOK.md) — deterministic stage and recording procedure.

The current code is a prototype implementing part of this design. Do not infer the target architecture from the present file layout where the documents say otherwise.

## Non-negotiable Invariants

Preserve these across every change:

- **One transition, two projections.** The DOM and the agent result must be produced from the same committed state transition.
- **One command bus.** Agent tools, keyboard controls, console controls and future remote controls all dispatch through the same controller.
- **Visibility is not delivery.** A visible beat begins pending; delivery is acknowledged or classified separately.
- **No invisible semantic changes.** Presentation state never changes because an unreported timer expired.
- **Stable semantic references.** Durable operations target deck, route, slide, beat and element IDs. Ordinal slide numbers are display conveniences only.
- **Version every mutable plane.** Deck revisions and session revisions are separate and returned after every command.
- **Retry-safe commands.** Mutating commands carry an idempotency key and expected revision.
- **Delta by default.** Return the current neighbourhood and changed state, not the whole deck, unless full detail is requested.
- **Entry is a beat.** Everything visible when a slide appears is represented and returned explicitly.
- **Live adaptation is provisional.** Generated session slides do not alter deck revision and retain origin, evidence status and a candidate ID.
- **Reversible by default.** Durable edits are atomic, previewable and checkpointed.
- **Accretion is reviewed.** Live questions, corrections and generated slides become candidates; they do not silently rewrite the canonical deck.
- **Provenance survives presentation.** Claims and generated material retain source and origin references.
- **Transport is an adapter.** The controller must not depend on WebMCP, DOM events or a particular host agent.

## Change Discipline

- Update the canonical design document before or with a change that alters a public contract.
- Add or update an entry in `docs/DECISIONS.md` when choosing between materially different architectures.
- Add a roadmap acceptance criterion for every new runtime capability.
- Route all state changes through the reducer/controller; do not mutate `Deck` state directly from UI handlers.
- Keep authored deck state separate from ephemeral session state.
- Do not mark a beat delivered merely because it is visible or because time passed.
- Treat live-generated factual content as provisional until evidence or explicit author confirmation permits promotion.
- Prefer structured semantic models over opaque markup. Raw SVG is an escape hatch, not the long-term diagram model.
- Tool descriptions should state when to use the tool, what changes, what does not change and what result the agent receives.
- Errors must have stable machine-readable codes and a concise recovery action.
- Use British English in documentation and interface copy.

## Validation Minimum

Before claiming a behaviour works, verify:

1. the command is valid against the protocol schema;
2. the controller emits exactly one committed event;
3. the DOM reflects that event;
4. the tool result reports the same appeared, disappeared and focused elements;
5. visual and delivery state remain distinct under interruption;
6. a duplicate idempotency key does not repeat the effect;
7. a stale expected revision fails without mutation;
8. refresh/replay reconstructs the same state;
9. keyboard and WebMCP paths produce equivalent events;
10. provisional staging does not increment deck revision.

A passing syntax check is not sufficient for a presentation-state change.
