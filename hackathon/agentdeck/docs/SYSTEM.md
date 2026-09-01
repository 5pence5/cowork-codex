# AgentDeck System Architecture

**Status:** canonical target architecture for AgentDeck v2  
**Audience:** implementers, reviewing agents and future maintainers  
**Companion documents:** [Protocol](PROTOCOL.md) · [Accretion](ACCRETION.md) · [Decisions](DECISIONS.md) · [Roadmap](ROADMAP.md)

## 1. Mission

AgentDeck should let an agent understand, present, adapt and improve a deck with the situational awareness of a skilled human presenter, while spending fewer tool calls and less context.

The system succeeds when an agent can answer, cheaply and accurately:

1. What is the presentation trying to achieve?
2. What is on screen now?
3. What did the audience merely see, and what was actually delivered or remains uncertain?
4. What is the next intended beat, and why?
5. What actions are valid from here, and what will each one change?
6. Who is currently driving: agent, human or both?
7. How can I recover if the user, agent, browser or renderer diverges?
8. Which live material is canonical, provisional or merely proposed?
9. What did this session teach us that should improve future sessions?

This is not a slide editor with AI controls attached. It is a closed-loop control system whose human-visible and agent-visible outputs are generated from one explicit state transition.

## 2. The foundational model

```text
presentation intent + deck artefact + live audience context
                           │
                           ▼
                     Agent observes
                           │
                           ▼
                    Command proposed
                           │
                           ▼
                 Deterministic controller
                           │
                           ▼
                     Event committed
                           │
             ┌─────────────┴─────────────┐
             ▼                           ▼
       Rendered projection         Agent result projection
             │                           │
             └─────────────┬─────────────┘
                           ▼
                    Next observation
```

The controller state—not the DOM and not an agent's memory—is authoritative. The renderer and tool result are sibling projections of the same committed event. The tool completes only after the renderer acknowledges the visual commit.

Every keyboard action, console action, UI control and WebMCP call enters the same command bus. Human takeover therefore creates an observable event rather than hidden state.

### 2.1 Visibility is not delivery

A point may be visible before the agent has narrated it. AgentDeck therefore maintains two related but distinct ledgers:

- **visual state:** which beat and elements have been committed to the audience stage;
- **delivery state:** whether the active beat is `pending`, `delivered`, `skipped`, `partial` or `unknown`.

When a beat becomes visible, its delivery state begins as `pending`. The next presentation command normally acknowledges the previous beat as delivered in the same command envelope, so ordinary presenting remains one tool call per beat. If the user interrupts, the pending state remains explicit and a resumed agent can finish, skip or mark it uncertain rather than pretending the audience heard it.

### 2.2 Live adaptation is not authorship

A live-generated answer slide may be useful on stage without being reliable or reusable. AgentDeck stages such material in the session plane:

```text
question → provisional staged slide → present → return to route
                              │
                              ▼
                     learning candidate
                              │
                       review / promote
                              ▼
                     new deck revision
```

Staged material increments the session revision only. It has a stable session-scoped ID, explicit origin and epistemic status, and a return location. It becomes canonical only through a reviewed deck transaction.

## 3. The abstraction tower

AgentDeck is organised as a tower. Each layer depends only on the layers below it and presents a smaller, more meaningful interface to the layer above.

### L0 — Identity, revisions and provenance

Primitive types used everywhere:

- `DeckId`, `RouteId`, `SlideId`, `BeatId`, `ElementId`, `ClaimId`, `AssetId`, `SessionId`, `StagedSlideId`, `EventId`;
- monotonic `DeckRevision` and `SessionRevision`;
- content hashes for unchanged-block elision and deduplication;
- `OriginRef` and `SourceRef` for authorship, generated material and evidence;
- `IdempotencyKey` and `ExpectedRevision` for retry and concurrency control.

IDs are stable. Ordinal numbers are derived views and never durable references.

### L1 — Semantic elements, claims and assets

An element is the smallest addressable unit an agent can reason about, narrate, query or focus:

```ts
interface ElementSpec {
  id: ElementId;
  kind: 'title' | 'subtitle' | 'text' | 'bullet' | 'fact' | 'quote' |
        'code' | 'image' | 'diagram-node' | 'diagram-edge' | 'caption';
  role: string;                 // thesis, evidence, example, caveat, instruction…
  content: unknown;
  accessibleLabel?: string;
  tags?: string[];
  claimRefs?: ClaimId[];
  sourceRefs?: SourceRef[];
  origin?: OriginRef;
  epistemicStatus?: 'authored' | 'verified' | 'provisional' | 'disputed';
}
```

Semantic role and content are separate from layout. This lets an agent search, narrate, rearrange and validate material without parsing markup.

### L2 — Beats

A beat is one intentional audience-state transition. Slide entry is always an explicit beat.

```ts
interface BeatSpec {
  id: BeatId;
  kind: 'entry' | 'reveal' | 'hide' | 'emphasis' | 'transition';
  show?: ElementId[];
  hide?: ElementId[];
  narration: {
    purpose: string;            // what the audience should understand
    cue?: string;               // concise suggested wording
    detail?: string;            // optional fuller treatment
    delivery?: string[];        // pause, contrast, invite question…
  };
  evidenceRefs?: SourceRef[];
  estimatedSeconds?: number;
}
```

A beat is the unit committed by `advance`. It makes “what appeared” complete and deterministic, including everything visible when entering a slide.

### L3 — Slides

A slide is a visual canvas containing elements and an ordered local beat sequence:

```ts
interface SlideSpec {
  id: SlideId;
  title?: string;
  purpose: string;
  elements: ElementSpec[];
  beats: BeatSpec[];            // first beat must be kind: entry
  view: ViewSpec;               // layout, slots and theme references
  notes?: {
    caveats?: string[];
    likelyQuestions?: string[];
    fallback?: string;
  };
}
```

The slide has no mutable “current reveal” field. Reveal and delivery position belong to the live session.

### L4 — Routes and deck artefact

A deck is a durable, versioned knowledge and narrative artefact. A route is an intended traversal through slides. A simple linear deck has one route; short, detailed and audience-specific treatments can reuse the same slides through different routes.

```ts
interface DeckArtifact {
  id: DeckId;
  revision: DeckRevision;
  metadata: {
    title: string;
    objective: string;
    audience: string;
    tone?: string;
    durationMinutes?: number;
    constraints?: string[];
  };
  routes: RouteSpec[];
  slides: Record<SlideId, SlideSpec>;
  claims?: Record<ClaimId, ClaimSpec>;
  assets?: Record<AssetId, AssetSpec>;
  defaultTheme: string;
}
```

The deck artefact does not contain live zoom, question overlays, presenter mode, delivery status or provisional session slides.

### L5 — Live session

A session is one traversal of one deck revision:

```ts
interface SessionState {
  id: SessionId;
  revision: SessionRevision;
  deckId: DeckId;
  deckRevision: DeckRevision;

  mode: 'agent-presenting' | 'human-presenting' | 'authoring' | 'rehearsal';
  driver: {
    policy: 'agent' | 'human' | 'shared';
    lastCommandSource: 'webmcp' | 'keyboard' | 'console' | 'ui';
  };

  routeId: RouteId;
  cursor: { slideId: SlideId | StagedSlideId; beatIndex: number };
  visibleElementIds: ElementId[];
  delivery: {
    beatId: BeatId;
    status: 'pending' | 'delivered' | 'skipped' | 'partial' | 'unknown';
    note?: string;
  };

  focus: FocusState | null;
  overlays: OverlayState[];
  questionQueue: AudienceQuestion[];

  stagedSlides: Record<StagedSlideId, StagedSlide>;
  returnStack: Array<{ routeId: RouteId; slideId: SlideId; beatIndex: number }>;

  pacing: {
    elapsedSeconds?: number;
    remainingSeconds?: number;
  };

  pendingCandidateIds: string[];
  lastEventId: EventId;
}
```

Session state is ephemeral but journalled. It can be reset without changing the deck and replayed without consulting the DOM.

### L6 — Controller and event journal

The controller validates a command against revisions, mode, authority and allowed transitions; commits one event; derives new state; requests rendering; then constructs the result from the same event.

The journal records command source, delivery acknowledgement, state delta, render acknowledgement and provenance. A snapshot plus subsequent events reconstructs the session.

### L7 — Control protocol and adapters

The protocol supplies:

- progressive-disclosure observations;
- mode-appropriate tool bundles;
- semantic targeting and explicit affordances;
- retry-safe commands and optimistic concurrency;
- complete visual, delivery and epistemic deltas;
- persistent focus and question state;
- provisional session adaptation;
- atomic durable authoring;
- stable errors and one-call recovery context.

WebMCP, keyboard and console are adapters around this protocol. See [PROTOCOL.md](PROTOCOL.md).

### L8 — Accretion and evaluation

Session events can produce reviewed learning candidates: recurring questions, corrected claims, better narration, useful provisional slides and timing observations. Candidates are promoted deliberately into a deck revision or reusable library.

Evaluation measures tool choice, argument accuracy, state fidelity, recovery cost, context cost and promotion quality. See [ACCRETION.md](ACCRETION.md).

## 4. Five coherent planes

| Plane | Owns | Must not own |
| --- | --- | --- |
| Artefact | deck, routes, slides, elements, claims, assets | live cursor, delivery or overlays |
| Session | cursor, visibility, delivery, focus, questions, staged material, pacing | canonical slide content |
| Control | commands, validation, reducer, events, observations | rendering-specific DOM logic |
| Projection | DOM, animation, accessibility output, WebMCP adapter | authoritative state |
| Accretion | journal-derived observations, candidates, promotion history | unreviewed mutation of the artefact |

Each concept has one owner. Cross-plane changes occur through typed commands and events, never direct mutation.

## 5. Control semantics

### 5.1 Human–agent arbitration

Mode sets the default driver policy:

- `agent-presenting`: the agent controls progression and normally speaks after each beat;
- `human-presenting`: the agent follows silently and records delivery based on the speaker;
- `authoring`: deck edits are permitted; presentation progression is not implicit;
- `rehearsal`: presentation controls plus timing and learning capture are active.

In `shared` control, commands are serialised. The first valid command commits; a concurrent stale command receives `REVISION_CONFLICT` and a fresh brief observation. Human input does not bypass version checks or mutate the renderer directly.

### 5.2 Delivery acknowledgement without extra calls

Presentation commands carry an optional acknowledgement of the currently visible beat. A normal next `advance` can mean both “the previous beat was delivered” and “commit the next beat”. The journal stores both facts in one event.

No acknowledgement is inferred merely because time passed. An interrupted or abandoned beat remains `pending` or is marked `partial`, `skipped` or `unknown`.

### 5.3 Provisional material and return paths

Staging a live slide:

1. creates a session-scoped slide and candidate ID;
2. records its source question, origin and epistemic status;
3. optionally pushes the current route location onto `returnStack` and presents it;
4. never increments deck revision;
5. can be dismissed or returned from without deleting its journal history;
6. can later be promoted by a reviewed deck transaction.

The stage should visibly distinguish provisional factual material when appropriate.

### 5.4 No hidden clocks

A four-second spotlight that disappears without an event makes the agent's model stale. Semantic focus therefore remains until cleared, superseded or ended by an explicit command. Animation timing is projection metadata, not an unreported state transition.

### 5.5 Fail closed, recover cheaply

A stale revision, missing target, ambiguous authority or invalid patch changes nothing. The result says exactly what failed and includes a compact current observation so recovery normally needs no separate read.

## 6. Agent ergonomics

### 6.1 Near-field awareness

The default observation contains only what is needed to act well now:

- deck objective, audience and active mode;
- driver policy and last command source;
- current slide purpose;
- all currently visible semantic elements;
- the current beat's delivery status;
- what changed in the last event;
- the next beat and its purpose;
- active focus, question or provisional material;
- remaining route/time budget and next-beat cost;
- registration and synchronisation health;
- epistemic warnings;
- valid next actions, targets, reversibility and estimated result size.

A full deck dump is an explicit diagnostic or authoring request, not the default orientation step.

### 6.2 Semantic affordances

The agent receives meaningful affordances rather than reverse-engineering implementation details:

```json
{
  "allowed_actions": [
    {
      "action": "advance",
      "effect": "acknowledge beat-why-sync and reveal beat-result-loop",
      "plane": "session",
      "reversible": true,
      "estimated_result_chars": 900
    },
    {
      "action": "focus",
      "targets": ["element-state", "element-result"],
      "plane": "session",
      "reversible": true
    },
    {
      "action": "stage-slide",
      "effect": "create provisional session material and preserve return location",
      "plane": "session",
      "reversible": true
    }
  ]
}
```

### 6.3 Explicit epistemic state

The agent should never have to infer whether text is authored, verified, disputed or generated live. Claim and element summaries carry epistemic status and source references; result envelopes surface relevant warnings at the moment of narration or promotion.

## 7. Resource economics

AgentDeck spends tokens and tool calls in proportion to uncertainty:

- observations default to the current neighbourhood, not all slide specs;
- requests can use `sinceSessionRevision`; unchanged blocks are omitted by hash;
- outlines exclude raw SVG, code bodies and full notes unless requested;
- question handling returns ranked approved related material when available;
- slide, route and claim summaries are cached by content hash;
- mode-scoped registration keeps the discovered tool set small;
- commands return the post-state observation, avoiding an immediate read;
- delivery acknowledgement piggybacks on the next command;
- live adaptations can be created and presented in one session command;
- durable edits accept several operations in one atomic transaction;
- recent idempotency keys make retries side-effect-free.

A normal presentation beat should require one tool call and a response comfortably within a few hundred tokens.

## 8. Event-sourced controller

```text
WebMCP ─┐
Keyboard ├──> validate command ──> reduce(state, command) ──> event + state
Console ┤                                                       │
UI      ┘                                                       ▼
                                                            render + ack
                                                                  │
                                    ┌─────────────────────────────┴───────────┐
                                    ▼                                         ▼
                              audience projection                      result envelope
```

This gives deterministic replay, cross-control equivalence tests, optimistic concurrency, undo, checkpoints, refresh recovery and learning provenance.

## 9. Human-facing projections

The human interface has three projections over the same state:

- **Audience stage:** a clean 16:9 canvas with no operational noise except deliberate provisional/evidence signals.
- **Operator cockpit:** mode, driver, route, current and next beat, delivery status, revisions, synchronisation health, question queue, focus, staged material and recovery controls. It is the human-readable twin of the brief observation.
- **Authoring inspector:** semantic element tree, route graph, claims/evidence, candidates and transaction preview.

The cockpit makes disagreement visible. When human, agent and renderer do not share the expected revision or delivery status, it shows the conflict instead of pretending the system is synchronised.

Long term, diagrams use a semantic node/edge model. Raw SVG remains a compatibility escape hatch and must be sanitised, size-limited and represented by an agent-readable summary and target manifest.

## 10. System invariants

1. Every visible element has a stable ID and accessible semantic label.
2. Every slide, including a staged slide, has exactly one entry beat.
3. `visibleElementIds` is derivable from the active slide's beats and cursor.
4. Visual state and delivery state are represented separately.
5. A newly visible beat is `pending` until acknowledged or classified otherwise.
6. One accepted command emits one event and increments the relevant revision once.
7. Duplicate idempotency keys return the original result without another event.
8. A stale expected revision emits no event and changes no state.
9. The result's appeared, disappeared, focus and overlay sets equal the post-render DOM state.
10. Keyboard, console, UI and WebMCP commands with equal inputs produce equal semantic events.
11. Every event records command source and control mode.
12. Session changes do not alter deck revision.
13. Staged material is session-scoped, provisional and linked to a candidate.
14. Durable deck transactions are atomic and create a recoverable checkpoint.
15. No timer changes semantic state without an event.
16. Every factual narration or promotion can expose its claim and source status.
17. Accretion candidates identify their source events and require promotion.
18. Full-artefact reads are opt-in and bounded.
19. The WebMCP adapter can be replaced without changing controller tests.

## 11. Non-goals

AgentDeck v2 is not initially trying to become:

- a general-purpose PowerPoint replacement;
- a collaborative multiplayer editor;
- an autonomous factual research system;
- a free-form canvas with arbitrary HTML;
- a model-specific orchestration framework.

The narrow goal is a reliable, legible and adaptive live presentation substrate for humans and agents.

## 12. Mapping from the prototype

| Current prototype | Target owner |
| --- | --- |
| `Deck` class mixes state, rendering and persistence | controller + renderer + stores |
| direct keyboard calls to `deck.advance()` | command bus |
| `frag` index and text labels | stable beat and element IDs |
| slide transition reported only by title | complete entry beat |
| no distinction between visibility and narration | delivery ledger |
| `get_deck` full-outline text | progressive `deck.observe` |
| eleven always-registered tools | mode-scoped tool bundles |
| prose-only tool results | protocol result envelope |
| slide number or ID targeting | semantic IDs; number as convenience |
| localStorage deck/session blend | separate artefact and session stores |
| raw SVG diagram | semantic diagram model plus bounded escape hatch |
| generated slides immediately mutate deck | provisional staged slide then reviewed promotion |

The migration is staged in [ROADMAP.md](ROADMAP.md); the current demo must remain usable throughout.
