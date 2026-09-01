# AgentDeck Demo and Rehearsal Runbook

This runbook treats the demonstration as a controlled live session, not an improvised tour of features.

## 1. Demonstration objective

Prove one claim:

> AgentDeck keeps a human, an agent and a live visual presentation in one shared, explicit control loop—and can adapt the presentation without losing that shared state.

Every beat should support that claim. Do not demonstrate a capability merely because it exists.

## 2. Preferred story

1. **Problem:** slides are frozen; conversation is not.
2. **Three worlds:** human/audience, agent and browser presentation.
3. **Closed loop:** one command commits state; both screen and agent receive the same delta.
4. **Visible proof:** reveal points while the console shows calls.
5. **Semantic focus:** zoom into the state/result loop, not an unrelated technical diagram.
6. **Adaptation:** take a controlled off-script question and propose or create a new slide.
7. **Recovery:** briefly show keyboard fallback or a clean reset only if useful.
8. **Close:** invite the audience to try the live deck.

## 3. Controlled off-script question

Use a question that demonstrates adaptation without requiring external research:

> “Can you add a slide comparing AgentDeck with an ordinary clicker?”

Expected response:

- show the audience question;
- create a concise comparison slide;
- present it;
- clear the question;
- return to the planned route.

Avoid a factual question whose success depends on browsing, citation retrieval or model memory.

## 4. Preflight

From the exact machine, account, browser and network used on stage:

- open a clean session and reset the deck;
- confirm the current WebMCP surface is detected;
- confirm every intended tool registration resolves;
- inspect the registration manifest, not merely a green chip;
- run `observe` or current `get_deck` and verify the correct opening state;
- advance through every beat once;
- test zoom/focus and explicit reset;
- show and clear a question;
- create, update and remove a disposable slide;
- refresh and verify recovery behaviour;
- test keyboard fallback;
- test full-screen mode when implemented;
- confirm the live URL and repository are reachable without authentication;
- disable unrelated notifications and browser extensions;
- keep a local static copy available.

## 5. Agent operating contract

### Agent-presenting mode

- Observe once at the start.
- Narrate the committed beat returned by each advance result.
- Do not advance again until the current narration is complete.
- Clear focus before navigating unless the target command explicitly supersedes it.
- Use navigation rather than multi-step advance for deliberate skips.
- Do not add factual material without provenance during the demonstration.
- On error, use the returned recovery observation; do not guess from memory.

### Human-presenting mode

- Stay silent unless directly asked to speak.
- Use the speaker's words to infer only high-confidence slide actions.
- When uncertain, preserve state rather than advancing speculatively.
- Record audience questions as session objects.

## 6. Failure ladder

Use the cheapest recovery that preserves the story:

1. Retry the same idempotent command.
2. Use the returned brief observation and expected revision.
3. Clear focus/overlay and navigate to the known slide ID.
4. Switch to keyboard control while keeping the agent narration.
5. Open the console simulator.
6. Reload and restore/reset the session.
7. Use the local static copy.

Do not troubleshoot experimental browser APIs in front of the audience for more than one recovery step.

## 7. Rehearsal capture

After each rehearsal, retain:

- duration by beat and slide;
- questions asked;
- corrections or awkward claims;
- tool errors and recoveries;
- points where narration and visual timing felt misaligned;
- whether the adaptation beat succeeded;
- candidate improvements, not automatic deck edits.

Review high-impact factual corrections first, then repeated questions, then delivery/timing refinements.

## 8. Stop conditions

Do not record or present the primary WebMCP path until:

- registration success is based on awaited results;
- the slide-entry result reports every immediately visible element;
- a duplicate advance cannot double-advance;
- keyboard and agent controls share the same command path;
- the fallback flow has been rehearsed;
- the public surface points directly to AgentDeck rather than an unrelated repository homepage.
