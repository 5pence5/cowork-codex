# AgentDeck

Presentations that listen. AgentDeck is a web slide deck that hands your AI agent the remote: through [WebMCP](https://webmcp.devpost.com/), the page registers tools that let an agent present slide by slide, trigger reveals and spotlights in sync with its own narration, and build brand-new slides mid-conversation when the audience asks a question the deck did not anticipate.

Built for the OpenAI WebMCP Challenge.

## Why it works

The core trick is the reveal-sync loop:

1. The agent calls the `advance` tool.
2. The tool reveals the next element with an animation and **returns the text of what just appeared**, plus the speaker notes and what the next reveal will be.
3. The agent narrates exactly that, then advances again.

Narration and on-screen motion cannot drift apart, because the screen is the source of truth for what to say next. In voice mode this plays like a live explainer video; in text mode it reads like a guided tour.

Because slides are structured JSON specs rather than markup, `add_slide` lets the agent create a polished, animated slide from a single tool call — fast enough to do live, mid-sentence.

## Tools

| Tool | What it does |
| --- | --- |
| `get_deck` | Deck outline, current position, speaker notes, next reveal. Call first. |
| `advance` | Reveal the next element (or move to the next slide); returns what appeared. |
| `back` | Hide the last reveal or return to the previous slide. |
| `goto_slide` | Jump to a slide by number or id, optionally pre-revealed. |
| `add_slide` | Create a slide from a JSON spec (layouts: title, bullets, split, code, fact, quote). |
| `update_slide` | Patch an existing slide; re-renders live if on screen. |
| `remove_slide` | Delete a slide. |
| `spotlight` | Dim the slide and emphasise one element for a few seconds. |
| `set_theme` | Switch theme: midnight, paper, aurora. |

## Run it

No build step, no dependencies:

```bash
cd hackathon/agentdeck
npx serve .        # or: python3 -m http.server 8080
```

Then open the printed URL.

- **With an agent:** open the page in the ChatGPT desktop app's in-app browser (WebMCP enabled), or Chrome with the WebMCP flag (`chrome://flags/#enable-webmcp-testing`) / origin trial. The header chip shows how many tools registered. Then say: *"Get the deck and present it to me."*
- **Without an agent:** press `Console` and run any tool by hand with JSON args — the simulator drives the exact same handlers. Arrow keys also work.

Deck edits persist in `localStorage`; `Reset` restores the starter deck.

## Demo script (for the submission video)

1. Open the deck in the ChatGPT in-app browser; point at the "9 tools live" chip.
2. Say "get the deck and present it to me" — let the agent narrate through the starter deck, reveals landing as it speaks (open the console panel so tool calls are visible).
3. Mid-presentation, ask an off-script question ("wait — how does this compare to screen-reading agents?").
4. The agent answers by **creating a new slide live** (`add_slide` with `present: true`) and presenting it.
5. Ask it to "make it feel warmer" → `set_theme paper`. Close on the "Try it" slide.

## Known constraints

- WebMCP is experimental: it currently requires the ChatGPT desktop in-app browser or Chrome behind a flag/origin trial. The page detects availability and falls back cleanly (keyboard + simulator), so the app is fully demoable everywhere.
- Voice-mode tool calling should be verified early on your own setup; the text-chat flow is the guaranteed path and the demo works in either.
- The page registers via `navigator.modelContext.registerTool` and falls back to the older `provideContext` shape if that is what the browser exposes.
