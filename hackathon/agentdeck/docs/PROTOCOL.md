# AgentDeck Control Protocol

**Status:** target protocol contract for AgentDeck v2  
**Depends on:** [System Architecture](SYSTEM.md)  
**Related:** [Accretion](ACCRETION.md) · [Roadmap](ROADMAP.md)

## 1. Design objective

The protocol should make the correct next action obvious, cheap and safe to retry. An agent should not need to reconstruct state from earlier prose, scrape the DOM or load the full deck after every action.

The protocol is transport-neutral. WebMCP is the first adapter; keyboard, console, tests and future remote controllers dispatch the same internal commands.

## 2. Current WebMCP adapter contract

The current standards-facing adapter should:

- feature-detect `document.modelContext` first and retain older surfaces only as compatibility fallbacks;
- await each `registerTool()` promise before reporting success;
- register tools with an `AbortSignal` so mode changes and teardown remove obsolete tools;
- provide `readOnlyHint` and `untrustedContentHint` annotations accurately;
- expose a concise title, a decision-oriented description and a valid JSON Schema;
- convert the internal result envelope into the richest result the host supports, with a compact text fallback;
- never let transport exceptions bypass controller error handling.

Registration status is itself explicit state:

```ts
interface ToolRegistrationState {
  adapter: 'webmcp';
  apiSurface: 'document.modelContext' | 'legacy-navigator' | 'legacy-provide-context';
  requested: string[];
  registered: string[];
  failed: Array<{ name: string; code: string; message: string }>;
}
```

The UI turns green only when the intended bundle has registered successfully.

## 3. Tool strategy: small bundles, strong verbs

Too many tools increase selection cost; one giant polymorphic tool obscures affordances. AgentDeck uses small mode-scoped bundles over a shared command vocabulary.

### Always available

| Tool | Purpose |
| --- | --- |
| `deck.observe` | Obtain a bounded, versioned view of current state. |
| `deck.set_mode` | Switch the autonomy/activity contract and active tool bundle. |
| `deck.recover` | Checkpoint, restore, undo or export the current state; recovery remains discoverable in every mode. |

### Presentation bundle

| Tool | Purpose |
| --- | --- |
| `deck.advance` | Commit exactly one presentation beat, or a named beat when supplied. |
| `deck.navigate` | Move deliberately to a slide, beat or route without pretending it was ordinary narration. |
| `deck.focus` | Set, change or clear persistent visual focus. |
| `deck.question` | Show, queue, answer-state or clear audience questions. |

### Authoring bundle

| Tool | Purpose |
| --- | --- |
| `deck.query` | Search semantic content, claims, evidence, elements and prior approved learning. |
| `deck.transact` | Preview or atomically apply durable deck operations. |

Compatibility wrappers may retain the prototype's old names temporarily, but they must dispatch the same internal command and return the same envelope. They are not separate implementations.

## 4. Progressive observation

`deck.observe` replaces the ambiguous “dump the deck and orient yourself” pattern.

### Input

```ts
interface ObserveInput {
  view?: 'brief' | 'current' | 'outline' | 'slide' | 'route' | 'full';
  targetId?: string;
  sinceSessionRevision?: number;
  sinceDeckRevision?: number;
  include?: Array<'notes' | 'evidence' | 'sources' | 'view-spec' | 'raw-assets' | 'history'>;
  maxChars?: number;
}
```

Defaults:

- `view: 'brief'`;
- current slide plus one next beat;
- no raw SVG, code body, binary asset or full event history;
- bounded output with an explicit truncation marker.

### Brief observation

```json
{
  "deck": {
    "id": "agentdeck-demo",
    "revision": 12,
    "objective": "Show why a closed-loop WebMCP deck beats a clicker",
    "audience": "WebMCP challenge judges"
  },
  "session": {
    "id": "session-7",
    "revision": 41,
    "mode": "agent-presenting",
    "route_id": "main",
    "location": {
      "slide_id": "how",
      "slide_number": 3,
      "beat_id": "how-registers-tools"
    }
  },
  "current": {
    "slide_purpose": "Explain the closed loop",
    "visible": [
      { "id": "how-title", "role": "thesis", "text": "The page hands your agent the remote" },
      { "id": "how-bullet-1", "role": "mechanism", "text": "The deck registers WebMCP tools" }
    ],
    "focus": null,
    "overlay": null
  },
  "last_event": {
    "type": "beat-committed",
    "appeared": ["how-bullet-1"]
  },
  "next": {
    "action": "advance",
    "beat_id": "how-result-loop",
    "purpose": "Explain that the result reports what appeared",
    "preview": "Each command returns the committed state delta"
  },
  "warnings": [],
  "allowed_actions": ["advance", "navigate", "focus", "question", "set-mode"]
}
```

The observation is self-contained enough to resume after context loss.

## 5. Command envelope

Every mutating command uses the same outer contract:

```ts
interface CommandEnvelope<T> {
  protocolVersion: 'agentdeck/2';
  requestId: string;
  idempotencyKey: string;
  expected: {
    deckRevision?: number;
    sessionRevision?: number;
  };
  payload: T;
}
```

Rules:

- `requestId` correlates logs; `idempotencyKey` defines retry identity.
- presentation actions require `expected.sessionRevision`;
- durable deck edits require both expected revisions unless no live session is attached;
- a duplicate idempotency key returns the original result;
- a mismatched expected revision returns `REVISION_CONFLICT` and a fresh brief observation without mutation.

The WebMCP schemas may make `requestId` and `idempotencyKey` optional for convenience, but the adapter must generate them before dispatch.

## 6. Result envelope

Every command returns one stable internal shape:

```ts
interface CommandResult {
  protocolVersion: 'agentdeck/2';
  ok: boolean;
  requestId: string;
  commandId: string;
  eventId?: string;
  deckRevision: number;
  sessionRevision: number;
  event?: {
    type: string;
    action: string;
    targetIds: string[];
  };
  delta?: {
    appeared: ElementSummary[];
    disappeared: ElementSummary[];
    focusBefore?: FocusSummary | null;
    focusAfter?: FocusSummary | null;
    overlayBefore?: OverlaySummary | null;
    overlayAfter?: OverlaySummary | null;
    deckOperations?: OperationSummary[];
  };
  observation: BriefObservation;
  narration?: {
    purpose: string;
    cue?: string;
    detail?: string;
    delivery?: string[];
    shouldSpeak: boolean;
  };
  animation?: {
    kind: string;
    expectedMs: number;
    visuallyCommitted: boolean;
  };
  recovery?: {
    code: string;
    message: string;
    suggestedAction?: string;
  };
}
```

The concise human-readable text block should summarise the same fields, not introduce additional state.

### Presentation result example

```json
{
  "protocolVersion": "agentdeck/2",
  "ok": true,
  "requestId": "req-104",
  "commandId": "cmd-104",
  "eventId": "event-42",
  "deckRevision": 12,
  "sessionRevision": 42,
  "event": {
    "type": "beat-committed",
    "action": "advance",
    "targetIds": ["how-result-loop"]
  },
  "delta": {
    "appeared": [
      {
        "id": "how-bullet-2",
        "role": "mechanism",
        "text": "Each command returns the committed state delta"
      }
    ],
    "disappeared": []
  },
  "narration": {
    "purpose": "Explain why narration and screen state cannot drift",
    "cue": "The page does not merely move forward; it tells me exactly what changed.",
    "shouldSpeak": true
  },
  "animation": {
    "kind": "reveal",
    "expectedMs": 500,
    "visuallyCommitted": true
  },
  "observation": {
    "session_revision": 42,
    "current_slide_id": "how",
    "next_action": "advance",
    "next_beat_id": "how-code"
  }
}
```

## 7. Presentation commands

### `deck.advance`

Commits exactly one beat by default.

```ts
interface AdvanceInput extends CommandEnvelope<{
  beatId?: BeatId;
}> {}
```

If `beatId` is supplied, it must be the current allowed next beat. Skipping several narrated beats is not part of `advance`; use `navigate` for deliberate jumps.

On slide transition, the entry beat's complete visible set is returned. A fact value, diagram summary or quotation can never appear without being included in `delta.appeared`.

### `deck.navigate`

```ts
interface NavigatePayload {
  target: { routeId?: RouteId; slideId?: SlideId; beatId?: BeatId };
  revealPolicy?: 'entry-only' | 'through-target' | 'fully-revealed';
  reason?: 'user-request' | 'question-branch' | 'time-skip' | 'recovery';
}
```

Navigation is semantically distinct from normal progression and appears as such in the journal.

### `deck.focus`

```ts
interface FocusPayload {
  action: 'set' | 'clear';
  targetId?: ElementId;
  style?: 'spotlight' | 'zoom' | 'outline';
}
```

Focus persists until cleared or superseded. No invisible timer changes it. A renderer may animate focus, but semantic focus state remains explicit.

### `deck.question`

```ts
interface QuestionPayload {
  action: 'show' | 'queue' | 'mark-answered' | 'clear';
  questionId?: string;
  text?: string;
  attribution?: string;
  relatedElementIds?: ElementId[];
}
```

Questions are session objects, not merely DOM cards. They can later generate accretion candidates.

## 8. Authoring commands

### `deck.query`

Searches semantic content without loading the artifact:

```ts
interface QueryInput {
  query: string;
  scope?: Array<'slides' | 'elements' | 'claims' | 'sources' | 'assets' | 'approved-learning'>;
  routeId?: RouteId;
  limit?: number;
  include?: Array<'excerpt' | 'notes' | 'evidence' | 'provenance'>;
}
```

Results are stable references, scores and short excerpts. Opaque assets are returned as manifests unless raw content is requested.

### `deck.transact`

Applies one atomic list of operations:

```ts
interface DeckTransactionPayload {
  dryRun?: boolean;
  checkpointLabel?: string;
  operations: Array<
    | { op: 'add-slide'; routeId: RouteId; afterSlideId?: SlideId; slide: SlideSpec }
    | { op: 'patch-slide'; slideId: SlideId; patch: JsonPatchOperation[] }
    | { op: 'remove-slide'; slideId: SlideId }
    | { op: 'move-slide'; slideId: SlideId; routeId: RouteId; afterSlideId?: SlideId }
    | { op: 'patch-claim'; claimId: ClaimId; patch: JsonPatchOperation[] }
    | { op: 'set-default-theme'; themeId: string }
    | { op: 'promote-candidate'; candidateId: string }
  >;
}
```

Rules:

- `dryRun` validates, previews affected IDs and reports layout/provenance warnings.
- Successful application creates one deck revision, regardless of operation count.
- Every transaction records an inverse or checkpoint.
- Patch schemas do not require unrelated fields.
- The transaction can distinguish session-only theme/view changes from durable defaults.

### `deck.recover`

Supports `checkpoint`, `undo`, `restore`, `export`, `import-preview` and `import-apply`. The tool is always registered, but mode and scope control which operations are valid. Recovery commands never guess which state plane the user means.

## 9. Stable errors

Errors have a stable code and one cheap recovery path:

| Code | Meaning | Default recovery |
| --- | --- | --- |
| `REVISION_CONFLICT` | expected revision is stale | use returned observation and retry deliberately |
| `TARGET_NOT_FOUND` | semantic ID does not exist | query by text/tag or observe outline |
| `TARGET_NOT_VISIBLE` | focus target is hidden | advance or navigate through its beat |
| `MODE_MISMATCH` | tool/action is unavailable in current mode | call `deck.set_mode` |
| `INVALID_TRANSITION` | requested beat is not currently allowed | use returned `next` affordance |
| `SCHEMA_INVALID` | command or deck patch is malformed | correct listed paths |
| `PROVENANCE_REQUIRED` | durable factual material lacks required origin/source | attach provenance or keep as session candidate |
| `REGISTRATION_FAILED` | WebMCP tool did not register | inspect registration state; use fallback control path |
| `OUTPUT_TRUNCATED` | requested observation exceeded bound | query narrower target or raise explicit bound |

An error must not increment a revision or emit a semantic event.

## 10. Registration by mode

The adapter holds one `AbortController` per active bundle:

```text
always bundle        observe, set_mode, recover
presentation bundle  advance, navigate, focus, question
                       OR
authoring bundle     query, transact
```

On mode change:

1. validate the requested mode and prepare the target bundle;
2. register the target bundle and await every result while the old bundle remains usable;
3. if registration succeeds, commit one mode-change event;
4. abort the previous mode bundle;
5. return the new registration manifest and brief observation.

A registration failure leaves the prior mode and bundle intact, or enters a deliberately selected degraded mode. It never commits a mode the active adapter cannot support and never silently advertises absent tools.

## 11. Adapter-independent controller interface

```ts
interface AgentDeckController {
  observe(input: ObserveInput): ObservationResult;
  dispatch(command: InternalCommand): Promise<CommandResult>;
  subscribe(listener: (event: AgentDeckEvent) => void): () => void;
  snapshot(): ControllerSnapshot;
  restore(snapshot: ControllerSnapshot): void;
}
```

DOM, WebMCP and localStorage modules depend on this interface. The controller does not import them.

## 12. Evals implied by the protocol

The protocol is not complete until it passes:

- tool-choice evals for natural-language presentation and authoring requests;
- schema/argument accuracy evals;
- exact DOM/result delta equivalence tests;
- duplicate-call and stale-revision tests;
- cross-control equivalence tests;
- bounded-context tests on large decks;
- recovery after interruption, refresh and human takeover;
- generated-content provenance tests;
- mode-change registration lifecycle tests.

Detailed gates are staged in [ROADMAP.md](ROADMAP.md).

## 13. Standards references

The adapter boundary exists because WebMCP is experimental and the browser-facing API can evolve without changing AgentDeck's controller contract.

- Current WebMCP draft: https://webmachinelearning.github.io/webmcp/
- Chrome implementation guidance: https://developer.chrome.com/docs/ai/agents
- Chrome WebMCP evaluation guidance: https://developer.chrome.com/docs/ai/webmcp/evals

The protocol details above reflect the current `document.modelContext` / promise-based registration / `AbortSignal` lifecycle model as at 1 September 2026. Re-verify the adapter against the current draft before release; do not propagate transport changes into the controller or artifact model.
