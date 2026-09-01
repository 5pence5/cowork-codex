# AgentDeck System Architecture

**Status:** canonical target architecture for AgentDeck v2  
**Audience:** implementers, reviewing agents and future maintainers  
**Companion documents:** [Protocol](PROTOCOL.md) · [Accretion](ACCRETION.md) · [Decisions](DECISIONS.md) · [Roadmap](ROADMAP.md)

## 1. Mission

AgentDeck should let an agent understand, present, adapt and improve a deck with the same situational awareness a skilled human presenter has, but with less cognitive and context overhead.

The system succeeds when an agent can answer, cheaply and accurately:

1. What is the presentation trying to achieve?
2. What is on screen now?
3. What has the audience already seen and heard?
4. What is the next intended beat, and why?
5. What actions are valid from here?
6. What will each action change?
7. How can I recover if the user, the agent or the environment diverges?
8. What did this session teach us that should improve future sessions?

This is not a slide editor with AI controls attached. It is a closed-loop control system whose human-visible and agent-visible outputs are generated from one explicit state transition.

## 2. The closed loop

```text
presentation intent + deck artifact + live audience context
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
             ┌─────────────┴─────────────┐
             ▼                           ▼
       Rendered projection         Agent result projection
             │                           │
             └─────────────┬─────────────┘
                           ▼
                    Next observation
```

The controller state—not the DOM and not an agent's memory—is authoritative. The renderer and tool result are sibling projections of the same committed event. This eliminates narration drift and split-brain state.

Every keyboard click, console action and WebMCP call enters the same command bus. A human can take over without creating hidden state the agent cannot observe.

## 3. The abstraction tower

AgentDeck is organised as a tower. Each layer depends only on the layers below it and presents a smaller, more meaningful interface to the layer above.

### L0 — Identity, revisions and provenance

Primitive types used everywhere:

- `DeckId`, `RouteId`, `SlideId`, `BeatId`, `ElementId`, `ClaimId`, `AssetId`, `SessionId`, `EventId`;
- monotonic `DeckRevision` and `SessionRevision`;
- content hashes for unchanged-block elision;
- `OriginRef` and `SourceRef` for authorship, generated content and evidence;
- `IdempotencyKey` and `ExpectedRevision` for retry and concurrency control.

IDs are stable. Ordinal numbers are derived views and never durable references.

### L1 — Semantic elements

An element is the smallest addressable unit an agent can reason about or focus:

```ts
interface ElementSpec {
  id: ElementId;
  kind: 'title' | 'subtitle' | 'text' | 'bullet' | 'fact' | 'quote' |
        'code' | 'image' | 'diagram-node' | 'diagram-edge' | 'caption';
  role: string;                 // e.g. thesis, evidence, example, caveat
  content: unknown;
  accessibleLabel?: string;
  tags?: string[];
  claimRefs?: ClaimId[];
  sourceRefs?: SourceRef[];
  origin?: OriginRef;
}
```

Semantic role and content are separate from layout. This lets the agent search, narrate, rearrange and validate content without parsing markup.

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
    delivery?: string[];        // pause, contrast, invite question, etc.
  };
  evidenceRefs?: SourceRef[];
  estimatedSeconds?: number;
}
```

A beat is the unit returned by `advance`. It makes “what appeared” complete and deterministic, including everything visible when entering a slide.

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

The slide has no mutable “current reveal” field. Reveal position belongs to the live session.

### L4 — Routes and deck artifact

A deck is a durable, versioned knowledge and narrative artifact. A route is an intended traversal through slides. A simple linear deck is one route; branching and audience-specific paths use several routes over the same slide set.

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

The artifact does not contain live zoom, question overlays, presenter mode or cursor state.

### L5 — Live session

A session is one traversal of one deck revision:

```ts
interface SessionState {
  id: SessionId;
  revision: SessionRevision;
  deckId: DeckId;
  deckRevision: DeckRevision;
  mode: 'agent-presenting' | 'human-presenting' | 'authoring' | 'rehearsal';
  routeId: RouteId;
  cursor: { slideId: SlideId; beatIndex: number };
  visibleElementIds: ElementId[];
  focus: FocusState | null;
  overlays: OverlayState[];
  questionQueue: AudienceQuestion[];
  pendingCandidateIds: string[];
  lastEventId: EventId;
}
```

Session state is ephemeral but journalled. It can be reset without changing the deck and replayed without consulting the DOM.

### L6 — Control protocol

The protocol converts observations and commands into committed events. It supplies:

- progressive-disclosure observations;
- mode-appropriate tool bundles;
- semantic targeting;
- explicit preconditions;
- idempotent and atomic mutation;
- complete state deltas;
- narration cues and valid next actions;
- stable error codes and recovery instructions.

See [PROTOCOL.md](PROTOCOL.md).

### L7 — Accretion plane

Session events can produce reviewed learning candidates: frequently asked questions, corrected claims, better narration, useful generated slides and timing observations. Candidates are promoted deliberately into a deck revision or reusable library. Raw interaction never silently rewrites authored truth.

See [ACCRETION.md](ACCRETION.md).

## 4. Five coherent planes

The tower can also be viewed as five interacting planes:

| Plane | Owns | Must not own |
| --- | --- | --- |
| Artifact | deck, routes, slides, elements, claims, assets | live cursor or overlays |
| Session | current route, cursor, visible set, focus, questions | canonical slide content |
| Control | commands, validation, reducer, events, observations | rendering-specific DOM logic |
| Projection | DOM, animations, accessible output, WebMCP adapter | authoritative state |
| Accretion | journal, learning candidates, promotion history | unreviewed mutation of artifact |

Each plane has one owner. Cross-plane changes occur through typed commands and events, never direct mutation.

## 5. Agent ergonomics

### 5.1 Near-field awareness

The default observation should contain only what is needed to act well now:

- deck objective and active mode;
- current slide purpose;
- all currently visible semantic elements;
- what the audience has just seen;
- the next beat and its purpose;
- active focus or question overlay;
- remaining route/time budget and the next beat's estimated cost;
- registration/synchronisation health;
- warnings and valid next actions, including reversibility and expected result size.

A full deck dump is an explicit diagnostic or authoring request, not the default orientation step.

### 5.2 Semantic affordances

The agent should receive actions as meaningful affordances, not have to infer them from implementation details:

```json
{
  "allowed_actions": [
    {
      "action": "advance",
      "effect": "reveal beat-why-sync",
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
      "action": "show-question",
      "effect": "add session overlay",
      "plane": "session",
      "reversible": true
    },
    {
      "action": "navigate",
      "targets": ["slide-demo", "slide-close"],
      "plane": "session",
      "reversible": true
    }
  ]
}
```

### 5.3 Explicit autonomy contract

Mode tells the agent both what tools exist and how to behave:

- `agent-presenting`: narrate after each committed beat; control progression.
- `human-presenting`: remain silent unless addressed; synchronise slides with the speaker.
- `authoring`: edit and inspect; do not advance presentation state implicitly.
- `rehearsal`: present while recording timing, questions and recovery events.

Changing mode is an explicit command and event.

### 5.4 No hidden clocks

A four-second spotlight that disappears without an event makes the agent's model stale. Focus therefore remains until cleared, superseded or ended by a specified command. Animation timing is projection metadata, not an unreported state transition.

### 5.5 Fail closed, recover cheaply

A stale revision, missing target or invalid patch changes nothing. The result says exactly what failed and includes a compact current observation so the agent can recover in one call.

## 6. Resource economics

AgentDeck should spend tokens and tool calls in proportion to uncertainty.

- `observe` defaults to the current neighbourhood, not all slide specs.
- Every response can be requested `since_session_revision`; unchanged blocks are omitted by hash.
- Outline responses exclude raw SVG, code bodies and full notes unless requested.
- Search returns ranked semantic references and short excerpts.
- Slide and route summaries are cached by content hash.
- Mode-scoped registration keeps the discovered tool set small.
- Commands return the post-state observation, avoiding an immediate follow-up read.
- Durable edits accept several operations in one atomic transaction.
- The controller remembers recent idempotency keys, so retries cost no additional state transition.

A useful target is that a normal presentation beat requires one tool call and a response small enough to fit comfortably within a few hundred tokens.

## 7. Event-sourced controller

All inputs dispatch commands to one reducer:

```text
WebMCP ─┐
Keyboard ├──> validate command ──> reduce(state, command) ──> event + state
Console ┤                                                       │
UI      ┘                           ┌────────────────────────────┴────────────┐
                                    ▼                                         ▼
                                  render                              result envelope
```

The journal is append-only within a session. A snapshot plus subsequent events reconstructs state. Durable deck transactions create a new deck revision and record a parent revision.

This architecture gives:

- deterministic replay;
- equivalence tests between agent and keyboard paths;
- undo and checkpoints;
- auditability;
- recovery after refresh;
- learning-candidate provenance.

## 8. Rendering and operator surfaces

The renderer is a pure projection as far as practical:

```ts
render(deckArtifact, sessionState) -> DOM
```

Animation is applied after state commitment and does not alter semantic state. Tool completion waits until the visual commit has occurred; the result may include `animation_ms` so the presenting agent can pace narration.

The human interface has three projections over the same state rather than three separate products:

- **Audience stage:** the clean 16:9 presentation canvas, with no operational noise.
- **Operator cockpit:** mode, route, current/next beat, revisions, synchronisation health, question queue, focus and recovery controls. This is the human-readable twin of `deck.observe`.
- **Authoring inspector:** semantic element tree, claims/evidence, routes, candidate changes and transaction preview.

The cockpit should make disagreement visible: when human, agent and renderer are not at the same expected revision, it shows the conflict instead of pretending the system is synchronised.

Long term, diagrams should use a semantic node/edge model. Raw SVG remains a compatibility escape hatch and must be sanitised, size-limited and represented by an agent-readable summary and target manifest.

## 9. System invariants

These are testable architectural laws:

1. Every visible element has a stable `ElementId` and accessible label or semantic text.
2. Every slide has exactly one entry beat.
3. `visibleElementIds` is derivable from slide beats and cursor position.
4. One accepted command emits one event and increments the relevant revision once.
5. Duplicate idempotency keys return the original result without another event.
6. A stale expected revision emits no event and changes no state.
7. The result's appeared/disappeared/focused sets equal the renderer's post-commit DOM state.
8. Keyboard, console and WebMCP commands with equal inputs produce equal events.
9. Session changes do not alter the deck revision.
10. Deck transactions are atomic and create a recoverable checkpoint.
11. No timer changes semantic state without an event.
12. Accretion candidates identify their source events and require promotion.
13. Full-artifact reads are opt-in and bounded.
14. The WebMCP adapter can be replaced without changing controller tests.

## 10. Non-goals

AgentDeck v2 is not initially trying to become:

- a general-purpose PowerPoint replacement;
- a collaborative multiplayer editor;
- an autonomous factual research system;
- a free-form canvas with arbitrary HTML;
- a model-specific orchestration framework.

The narrow goal is a reliable, legible and adaptive live presentation substrate for humans and agents.

## 11. Mapping from the prototype

| Current prototype | Target owner |
| --- | --- |
| `Deck` class mixes state, rendering and persistence | controller + renderer + stores |
| direct keyboard calls to `deck.advance()` | command bus |
| `frag` index and text labels | stable beat and element IDs |
| `get_deck` full-outline text | progressive `deck.observe` |
| eleven always-registered tools | mode-scoped tool bundles |
| prose-only tool results | protocol result envelope |
| slide number or ID targeting | semantic IDs; number as convenience |
| localStorage deck/session blend | separate deck and session stores |
| raw SVG diagram | semantic diagram model plus escape hatch |
| generated slides immediately mutate deck | session proposal then reviewed promotion |

The migration is staged in [ROADMAP.md](ROADMAP.md); the current demo must remain usable throughout.
