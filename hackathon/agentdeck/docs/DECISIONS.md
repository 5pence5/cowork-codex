# AgentDeck Architectural Decisions

This is the compact decision ledger for AgentDeck. Update it when a change would otherwise force future agents to reconstruct why the architecture looks the way it does.

## AD-001 — Controller state is authoritative

**Decision:** The canonical deck/session state is the source of truth. The DOM and agent result are projections of the same committed event.

**Why:** Treating the screen itself as authority requires DOM interpretation and allows the renderer, tool result and controller to diverge.

**Rejected:** “The screen is the source of truth” as a literal architectural rule. It remains a useful product intuition, but the stronger implementation is one transition with two guaranteed-consistent projections.

## AD-002 — One command bus for every controller

**Decision:** WebMCP, keyboard, console and UI controls dispatch identical internal commands.

**Why:** Direct UI mutation creates state an agent may not observe and makes parity testing impossible.

**Rejected:** Keeping keyboard handlers as a separate fast path.

## AD-003 — Deck artefact and live session are separate planes

**Decision:** Authored content and live cursor/focus/question state use separate stores and revisions.

**Why:** Presentation actions should not rewrite the deck; durable edits should not be confused with temporary stage state.

**Rejected:** One localStorage object as the conceptual model, even if a compatibility serializer temporarily stores both.

## AD-004 — Entry is an explicit beat

**Decision:** Every slide has exactly one entry beat describing all content visible on arrival.

**Why:** A tool result that reports only a slide title misses facts, diagrams, quotations and other immediately visible content.

**Rejected:** Treating slide transitions as a special case outside the reveal model.

## AD-005 — Stable semantic IDs, not ordinal references

**Decision:** Durable commands target route, slide, beat and element IDs. Numbers are display conveniences.

**Why:** Inserting or moving slides must not invalidate future commands, candidate patches or session provenance.

**Rejected:** Using 1-based slide numbers as primary references.

## AD-006 — Small mode-scoped tool bundles

**Decision:** Expose a small always-on bundle and register presentation or authoring tools according to mode.

**Why:** Eleven or more always-visible tools increase model selection cost; one giant action tool hides affordances. Mode bundles preserve strong verbs while reducing choice.

**Rejected:** A single `deck_action` mega-tool and a permanently registered tool for every operation.

## AD-007 — Structured result envelope

**Decision:** Every command returns revisions, event, delta, current observation, narration cue, epistemic status and recovery information in one stable envelope.

**Why:** Free prose is hard to reconcile, diff and replay, and usually forces another observation call.

**Rejected:** Tool-specific ad hoc strings as the authoritative protocol.

## AD-008 — Retry safety and optimistic concurrency

**Decision:** Mutating commands carry an idempotency key and expected revision.

**Why:** Agents and transports may retry; humans may act concurrently. `advance` must never occur twice accidentally.

**Rejected:** Assuming browser tool calls execute exactly once and in isolation.

## AD-009 — No unreported semantic timers

**Decision:** Focus and overlays persist until an explicit event clears or supersedes them.

**Why:** Timer expiry silently makes the agent's state stale.

**Rejected:** The prototype's fixed-duration spotlight as canonical behaviour. A temporary visual pulse may exist, but semantic focus remains explicit.

## AD-010 — Event journal plus snapshots

**Decision:** Sessions are replayable from a snapshot and append-only events; deck edits create versioned parent-linked revisions.

**Why:** This enables deterministic recovery, undo, parity tests, session review and accretion provenance.

**Rejected:** Relying only on the latest serialised state.

## AD-011 — Accretion requires reviewed promotion

**Decision:** Live questions, generated answers and corrections create candidates. Only an explicit transaction promotes them into a deck or reusable library.

**Why:** Automatic self-modification compounds hallucinations and transient audience-specific material.

**Rejected:** Saving every live generated slide directly into the canonical deck as the default.

## AD-012 — Progressive disclosure is the default read path

**Decision:** `deck.observe` returns current-neighbourhood state by default; full artefact and raw assets are opt-in and bounded.

**Why:** Most presentation decisions need only current, previous and next context. Full dumps waste tokens and crowd out live reasoning.

**Rejected:** Calling `get_deck(include_specs: true)` as the normal orientation step.

## AD-013 — Content semantics precede visual markup

**Decision:** Elements, claims and diagram parts have semantic models; view/layout is a projection. Raw SVG remains an escape hatch.

**Why:** Agents cannot reliably search, edit, narrate or make accessible an opaque markup string.

**Rejected:** Raw HTML/SVG as the sole canonical content representation.

## AD-014 — Core is transport-neutral

**Decision:** The controller has no dependency on WebMCP or the DOM. Adapters translate transport calls into commands and results.

**Why:** The WebMCP draft is evolving, and the same system should be testable and controllable without a particular browser host.

**Rejected:** Encoding browser API assumptions in the deck engine.

## AD-015 — Preserve the dependency-free demo during migration

**Decision:** The architecture may become modular, but the challenge demo must remain easy to serve statically and must keep keyboard/console fallback throughout migration.

**Why:** Demonstrability and recovery are product features. A framework rewrite would add risk without solving the control-plane problems.

**Rejected:** Rebuilding the prototype in React before protocol hardening.

## AD-016 — Visibility and delivery are separate facts

**Decision:** The session records both the beat visible on screen and whether its narration was delivered, skipped, partial, pending or unknown.

**Why:** A tool result appears before the agent speaks. Equating visual commitment with audience delivery makes interruption recovery inaccurate.

**Rejected:** Assuming every successful `advance` means the audience has already heard the associated narration.

## AD-017 — Delivery acknowledgement piggybacks on the next command

**Decision:** A presentation command may acknowledge the previous beat while committing the next transition.

**Why:** This preserves accurate delivery state without doubling the number of ordinary presentation calls. If interrupted, no later command arrives and the previous beat remains visibly pending.

**Rejected:** Requiring a separate acknowledgement call after every narration, and silently inferring delivery from elapsed time.

## AD-018 — Live-generated slides are staged session material

**Decision:** A generated slide used in a live answer is session-scoped, provisional and linked to a learning candidate. It can be presented and returned from without incrementing deck revision.

**Why:** Live adaptation is valuable, but it is not equivalent to reviewed authorship. The system needs both spontaneity and epistemic custody.

**Rejected:** Using durable `add_slide` as the default live-Q&A operation, or forbidding live slides until they have completed an authoring review.
