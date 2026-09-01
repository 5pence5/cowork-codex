# AgentDeck Accretion Model

**Purpose:** make each presentation improve the system without allowing live improvisation to corrupt the canonical deck  
**Depends on:** [System Architecture](SYSTEM.md) · [Protocol](PROTOCOL.md)

## 1. Accretion, not uncontrolled memory

A useful presentation system should learn:

- which questions recur;
- where audiences become confused;
- which explanations consistently work;
- which slides are skipped or overrun;
- which generated answers deserve a permanent slide;
- which factual claims were corrected;
- which visual targets and transitions help comprehension.

But a system that automatically writes every live answer back into the deck will compound mistakes. AgentDeck therefore separates **capture**, **synthesis**, **review** and **promotion**.

```text
session events
     │
     ▼
raw observations ──> learning candidates ──> review ──> promotion
                           │                    │
                           └──── reject/archive┘
```

## 2. Four stores

### 2.1 Session journal

Append-only command and event history for a single run. It records what actually happened, not a retrospective summary.

Examples:

- beat committed;
- navigation jump;
- audience question shown;
- human correction;
- generated slide proposed;
- registration failure and fallback;
- timing observation;
- undo or recovery action.

### 2.2 Observation store

Derived, compact observations extracted from the journal:

```ts
interface SessionObservation {
  id: string;
  kind: 'question' | 'confusion' | 'correction' | 'timing' |
        'successful-explanation' | 'generated-material' | 'recovery';
  sourceEventIds: EventId[];
  slideIds?: SlideId[];
  elementIds?: ElementId[];
  summary: string;
  evidence?: unknown;
  confidence?: number;
}
```

These are session-local and may contain noise.

### 2.3 Candidate store

A candidate is a proposed reusable improvement with explicit provenance:

```ts
interface LearningCandidate {
  id: string;
  kind: 'faq' | 'narration-patch' | 'slide-patch' | 'new-slide' |
        'claim-correction' | 'route-branch' | 'visual-pattern';
  status: 'proposed' | 'needs-evidence' | 'approved' | 'rejected' | 'superseded';
  sourceSessionIds: SessionId[];
  sourceObservationIds: string[];
  summary: string;
  proposedOperations: unknown[];
  rationale: string;
  confidence: number;
  impact: 'low' | 'medium' | 'high';
  sourceRefs?: SourceRef[];
  createdBy: OriginRef;
  reviewedBy?: OriginRef;
}
```

Factual candidates can be marked `needs-evidence`; generated material remains visibly provisional until reviewed.

### 2.4 Approved library

Approved reusable objects, content-addressed and queryable:

- frequently asked question and approved answer pairs;
- claims with sources and confidence;
- narration patterns;
- slide and route fragments;
- diagram primitives;
- accessibility descriptions;
- recovery patterns;
- audience-specific variants.

The library is not injected wholesale into every session. `deck.query` retrieves relevant approved objects on demand.

## 3. Promotion ladder

Knowledge moves through explicit levels:

1. **Ephemeral:** live question, generated explanation or temporary slide.
2. **Captured:** journalled with source event and session context.
3. **Candidate:** normalised proposal with confidence, rationale and patch.
4. **Approved deck change:** applied in one versioned transaction.
5. **Reusable library object:** available across decks after separate approval.

Skipping levels requires an explicit user action and is recorded.

## 4. What should be captured automatically

Low-cost, objective signals:

- beat and slide dwell time;
- route taken and slides skipped;
- question text and linked slide/element;
- repeated navigation backwards;
- tool errors, retries and recovery paths;
- human overrides and corrections;
- generated content hashes;
- whether proposed material was accepted, edited or discarded.

The system should not infer audience emotion or comprehension as fact. Such interpretations may become low-confidence observations, clearly labelled as inference.

## 5. End-of-session synthesis

At session close or rehearsal review, generate a bounded digest:

```json
{
  "session": "session-7",
  "deck_revision": 12,
  "route": "main",
  "duration_minutes": 7.8,
  "objective_outcome": "completed",
  "signals": {
    "questions": 3,
    "corrections": 1,
    "generated_slides": 1,
    "recoveries": 0
  },
  "candidate_ids": ["cand-faq-clicker", "cand-fix-webmcp-api"],
  "recommended_review_order": [
    { "candidate_id": "cand-fix-webmcp-api", "reason": "high-impact factual correction" },
    { "candidate_id": "cand-faq-clicker", "reason": "recurred in two sessions" }
  ]
}
```

Synthesis references the journal rather than replacing it.

## 6. Promotion policy

Default policy:

- presentation timing and non-factual narration tweaks may be approved with lightweight review;
- a factual correction requires a source or explicit author confirmation;
- a generated slide remains a candidate until its claims, layout and route position are reviewed;
- cross-deck promotion requires stronger review than promotion into one deck;
- a candidate derived from one session should normally remain deck-local unless obviously generic;
- rejected candidates remain archived to prevent repeated rediscovery of the same bad idea.

`deck.transact` is the only mechanism that changes the canonical artifact. Promotion is one transaction operation and creates one new deck revision.

## 7. Deduplication and compounding

Candidates are grouped by semantic target and content hash. The system should distinguish:

- repeated evidence for the same improvement;
- a genuinely different answer to the same question;
- a candidate already applied in a newer revision;
- a candidate invalidated by a later factual correction.

Confidence can increase with independent repeated sessions, but recurrence is not correctness. Source quality and explicit author review remain separate dimensions.

## 8. Accretive agent experience

A future agent should be able to ask cheaply:

- “What questions recur on this slide?”
- “Which candidate improvements are high impact and unresolved?”
- “Has this generated answer been approved before?”
- “What changed between the last two rehearsals?”
- “Which narration works best for a technical audience?”

The answer should return approved summaries and stable references first, with raw session detail only on request.

## 9. Privacy and retention

Audience questions and attribution are session data. The deck should support:

- anonymous attribution by default;
- configurable retention;
- export and deletion by session;
- redaction before cross-deck promotion;
- a clear distinction between locally stored data and published deck content.

No audience data should become public merely because a generated slide is promoted.

## 10. Accretion invariants

1. Every candidate identifies source sessions and observations.
2. Every factual candidate carries sources, explicit confirmation or `needs-evidence` status.
3. Session capture never increments deck revision.
4. Promotion always occurs through an atomic deck transaction.
5. Rejected and superseded candidates are retained as decisions, not silently deleted.
6. Approved library objects are content-addressed and deduplicated.
7. Raw audience attribution is removed or explicitly approved before cross-deck reuse.
8. An agent can distinguish authored, generated, provisional and approved content at observation time.
