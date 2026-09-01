# AgentDeck

**Presentations that listen.** AgentDeck is a web presentation system that gives an AI agent an explicit, structured remote through WebMCP. The agent can present beat by beat, keep narration aligned with what appears, focus the audience's attention and adapt the deck when the conversation changes.

Built for the OpenAI WebMCP Challenge.

## The product idea

A normal deck is a static file controlled by a human clicker. AgentDeck turns the presentation into a shared control loop:

1. the agent observes the current presentation state;
2. it commits one meaningful presentation action;
3. the controller updates one canonical state;
4. the screen and the agent both receive projections of that same transition;
5. the next decision begins from an explicit, versioned observation.

That architecture is stronger than asking an agent to infer slide state from memory or the DOM. The presenter, audience, agent and browser remain synchronised even when the route changes.

## Current prototype

The branch currently contains a dependency-free prototype with:

- slide navigation and incremental reveals;
- live slide creation, updating and removal;
- spotlight and cinematic zoom;
- an audience-question overlay;
- three themes;
- keyboard navigation and a tool-call simulator;
- local persistence;
- a self-explaining starter deck.

The current implementation exposes eleven tools and demonstrates the core interaction. The v2 documents below define the coherent target architecture and the migration path; they should not be read as claims that every v2 contract is already implemented.

## Canonical design documents

Read these in order:

1. [System Architecture](docs/SYSTEM.md) — the closed loop, abstraction tower, planes and invariants.
2. [Control Protocol](docs/PROTOCOL.md) — observations, commands, result envelopes and mode-scoped tool bundles.
3. [Accretion Model](docs/ACCRETION.md) — how sessions improve future decks without uncontrolled self-modification.
4. [Architectural Decisions](docs/DECISIONS.md) — settled choices and rejected alternatives.
5. [Implementation Roadmap](docs/ROADMAP.md) — dependency-ordered migration and acceptance gates.
6. [Demo Runbook](docs/DEMO_RUNBOOK.md) — deterministic rehearsal, stage operation and fallback.

Agents modifying this folder should begin with [AGENTS.md](AGENTS.md).

## Why the current reveal loop works

In the prototype:

1. the agent calls `advance`;
2. the page reveals the next fragment or enters the next slide;
3. the tool returns a report of the new position, speaker notes and the next reveal;
4. the agent narrates and advances again.

The target architecture generalises this into explicit beats and structured state deltas. In particular, slide entry becomes a beat so facts, diagrams and quotations visible on arrival are reported completely.

## Current prototype tools

| Tool | What it does |
| --- | --- |
| `get_deck` | Returns the outline, current position, notes and next reveal; optional full specs. |
| `advance` | Reveals the next fragment or enters the next slide. |
| `back` | Hides the last reveal or returns to the previous slide. |
| `goto_slide` | Jumps to a slide by number or ID. |
| `add_slide` | Creates a slide from a JSON spec. |
| `update_slide` | Patches an existing slide. |
| `remove_slide` | Deletes a slide. |
| `spotlight` | Temporarily emphasises an element. |
| `zoom_to` | Moves the camera onto an element or diagram region. |
| `show_question` | Displays or clears an audience question. |
| `set_theme` | Changes the visual theme. |

The v2 protocol replaces the always-on set with small mode-scoped bundles over one command bus. Compatibility wrappers can preserve these names during migration.

## Run it

No build step is required for the current prototype:

```bash
cd hackathon/agentdeck
npx serve .
# or
python3 -m http.server 8080
```

Open the printed URL.

- **With a WebMCP-capable agent:** open the page in a supported in-app browser or an experimental WebMCP browser environment, then ask the agent to inspect and present the deck.
- **Without WebMCP:** press `Console` and run the same handlers manually, or use the arrow keys.

Deck edits persist in `localStorage`; `Reset` restores the starter deck.

## Demonstration path

The recommended demo proves one coherent idea rather than enumerating features:

1. show why frozen slides conflict with live conversation;
2. explain the human–agent–browser loop;
3. reveal points while the console makes the calls visible;
4. focus on the state/result loop;
5. take a controlled audience question;
6. create a relevant comparison slide live;
7. return to the planned route and close.

See the full [Demo Runbook](docs/DEMO_RUNBOOK.md).

## Design principles

- One authoritative controller state.
- One command bus for agent and human controls.
- One explicit beat per audience-state transition.
- Stable semantic IDs and separate deck/session revisions.
- Complete deltas and post-state observations after every action.
- Retry-safe, atomic and reversible mutation.
- Progressive disclosure rather than repeated full-deck dumps.
- Reviewed accretion rather than silent self-modification.
- Transport-neutral core with WebMCP as an adapter.
- A working static fallback throughout migration.

## Immediate implementation priority

The first code slice is deliberately narrow:

1. register through the current `document.modelContext` surface and await results;
2. wrap all controls in one minimal controller/command path;
3. introduce a structured result envelope;
4. report complete slide-entry content;
5. test registration, keyboard parity, retry safety and DOM/result equivalence.

See [ROADMAP.md](docs/ROADMAP.md) for the full sequence.
