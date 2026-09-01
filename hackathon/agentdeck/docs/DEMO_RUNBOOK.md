# AgentDeck Demo and Rehearsal Runbook

This runbook treats the demonstration as a controlled live session, not an improvised tour of features.

## 1. Demonstration objective

Prove one claim:

> AgentDeck keeps a human, an agent and a live visual presentation in one shared, explicit control loop—and can adapt the presentation without losing state or confusing improvisation with authored truth.

Every beat should support that claim. Do not demonstrate a capability merely because it exists.

## 2. Preferred story

1. **Problem:** slides are frozen; conversation is not.
2. **Three worlds:** human/audience, agent and browser presentation.
3. **Closed loop:** one command commits state; both screen and agent receive the same delta.
4. **Visible proof:** reveal points while the console shows calls.
5. **Semantic focus:** zoom into the state/result loop, not an unrelated technical diagram.
6. **Adaptation:** take a controlled off-script question and stage a provisional answer slide.
7. **Return:** leave the provisional detour and resume the exact planned route position.
8. **Close:** invite the audience to try the live deck.

## 3. Controlled off-script question

Use a question that demonstrates adaptation without requiring external research:

> “Can you add a slide comparing AgentDeck with an ordinary clicker?”

Expected response:

- show the audience question;
- stage a concise comparison slide with `present: true`;
- explain that it is provisional session material, not a silent deck edit;
- present it;
- clear or mark the question answered;
- return to the planned route.

Avoid a factual question whose success depends on browsing, citation retrieval or model memory.

## 4. Preflight

From the exact machine, account, browser and network used on stage:

- open a clean session and reset the deck;
- confirm the current WebMCP surface is detected;
- confirm every intended tool registration resolves;
- inspect the registration manifest, not merely a green chip;
- observe and verify the correct opening state and pending delivery status;
- advance through every beat once;
- interrupt one narration and confirm the beat remains pending or partial;
- test focus/zoom and explicit reset;
- show and clear a question;
- stage, present, return from and dismiss a disposable provisional slide;
- verify that staging did not increment deck revision;
- create, update and remove a disposable durable slide in authoring mode;
- refresh and verify recovery behaviour;
- test keyboard fallback and cross-control revision conflict;
- test full-screen mode when implemented;
- confirm the live URL and repository are reachable without authentication;
- disable unrelated notifications and browser extensions;
- keep a local static copy available.

## 5. Agent operating contract

### Agent-presenting mode

- Observe once at the start.
- Narrate the committed beat returned by each advance result.
- Do not advance again until the current narration is complete or deliberately classified as partial/skipped.
- Acknowledge the previous beat in the next presentation command.
- Clear focus before navigating unless the target command explicitly supersedes it.
- Use navigation rather than multi-step advance for deliberate skips.
- Stage live generated material; do not mutate the canonical deck during Q&A.
- Do not add factual material without provenance or an explicit provisional warning.
- On error, use the returned recovery observation; do not guess from memory.

### Human-presenting mode

- Stay silent unless directly asked to speak.
- Use the speaker's words to infer only high-confidence delivery and slide actions.
- When uncertain, mark delivery `unknown` or preserve state rather than advancing speculatively.
- Record audience questions as session objects.

## 6. Failure ladder

Use the cheapest recovery that preserves the story:

1. Retry the same idempotent command.
2. Use the returned brief observation and expected revision.
3. Resolve pending delivery explicitly; do not advance from an uncertain assumption.
4. Clear focus/overlay and navigate to the known slide ID.
5. Return from provisional material to the saved canonical location.
6. Switch to keyboard control while keeping the agent narration.
7. Open the console simulator.
8. Reload and restore/reset the session.
9. Use the local static copy.

Do not troubleshoot experimental browser APIs in front of the audience for more than one recovery step.

## 7. Rehearsal capture

After each rehearsal, retain:

- duration by beat and slide;
- delivery states left pending, partial or unknown;
- questions asked;
- corrections or awkward claims;
- staged material and whether it should be promoted;
- tool errors and recoveries;
- human overrides and revision conflicts;
- points where narration and visual timing felt misaligned;
- whether the adaptation/return beat succeeded;
- candidate improvements, not automatic deck edits.

Review high-impact factual corrections first, then repeated questions, then delivery/timing refinements.

## 8. Stop conditions

Do not record or present the primary WebMCP path until:

- registration success is based on awaited results;
- the slide-entry result reports every immediately visible element;
- visible and delivered state remain separate under interruption;
- a duplicate advance cannot double-advance;
- keyboard and agent controls share the same command path;
- staged material cannot mutate the canonical deck without promotion;
- the provisional detour has a deterministic return path;
- the fallback flow has been rehearsed;
- the public surface points directly to AgentDeck rather than an unrelated repository homepage.
