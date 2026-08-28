// The deck AgentDeck ships with: a short self-explaining presentation.
// Speaker notes coach the presenting agent on what to say at each reveal.

export const starterDeck = [
  {
    id: 'intro',
    layout: 'title',
    emoji: '🎙️',
    title: 'AgentDeck',
    subtitle: 'Presentations that listen — your agent presents, builds, and animates slides while you talk.',
    notes:
      'Welcome the audience. Explain that this whole deck is driven by tool calls: every reveal, jump, and new slide you make happens through WebMCP. Then call advance to move on.',
  },
  {
    id: 'problem',
    layout: 'bullets',
    emoji: '🧊',
    title: 'Slides are frozen. Conversations are not.',
    bullets: [
      'Decks are written days before anyone asks a question',
      'Presenters juggle a clicker, notes, and timing',
      'Explainer videos feel alive — but take days to produce',
    ],
    notes:
      'Reveal one bullet per advance call and speak to each as it appears. The pacing IS the point: nothing appears until you talk about it.',
  },
  {
    id: 'how',
    layout: 'code',
    emoji: '🔧',
    title: 'The page hands your agent the remote',
    bullets: ['The deck registers WebMCP tools in the browser', 'Each tool call returns what just appeared on screen'],
    code: {
      language: 'javascript',
      content: `navigator.modelContext.registerTool({
  name: 'advance',
  description: 'Reveal the next element…',
  inputSchema: { type: 'object', properties: {} },
  async execute() {
    const revealed = deck.advance();
    return { content: [{ type: 'text',
      text: \`Revealed \${revealed.text}\` }] };
  }
});`,
    },
    notes:
      'Reveal the two bullets first, then the code block. Point out the key trick: advance() returns the text of what appeared, so narration can never drift out of sync with the screen. Try spotlight with target "code" while explaining it.',
  },
  {
    id: 'walkthrough',
    layout: 'diagram',
    title: 'Diagrams your agent can walk through',
    svg: `<svg viewBox="0 0 660 300" xmlns="http://www.w3.org/2000/svg" font-family="inherit">
  <defs>
    <marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill="var(--text-dim)"/>
    </marker>
  </defs>

  <rect x="20" y="120" width="95" height="60" rx="8" fill="var(--surface-2)" stroke="var(--line)"/>
  <text x="67" y="146" text-anchor="middle" font-size="11" fill="var(--text)">Input</text>
  <text x="67" y="162" text-anchor="middle" font-size="11" fill="var(--text)">embeddings</text>
  <text x="67" y="196" text-anchor="middle" font-size="8" fill="var(--text-dim)">+ positional encoding</text>

  <line x1="115" y1="150" x2="148" y2="150" stroke="var(--text-dim)" stroke-width="1.5" marker-end="url(#ah)"/>

  <rect x="150" y="22" width="310" height="256" rx="12" fill="none" stroke="var(--text-dim)" stroke-dasharray="5 4"/>
  <text x="305" y="44" text-anchor="middle" font-size="11" fill="var(--text-dim)">Encoder × N</text>

  <g id="attention">
    <rect x="180" y="196" width="250" height="62" rx="8" fill="var(--surface-2)" stroke="var(--accent)" stroke-width="1.5"/>
    <text x="305" y="213" text-anchor="middle" font-size="11" fill="var(--text)">Multi-head attention</text>
    <rect x="210" y="222" width="14" height="14" rx="3" fill="var(--accent)" opacity="0.35"/>
    <rect x="230" y="222" width="14" height="14" rx="3" fill="var(--accent)" opacity="0.55"/>
    <rect x="250" y="222" width="14" height="14" rx="3" fill="var(--accent)" opacity="0.75"/>
    <rect x="270" y="222" width="14" height="14" rx="3" fill="var(--accent)" opacity="0.95"/>
    <text x="247" y="250" text-anchor="middle" font-size="6.5" fill="var(--text-dim)">heads in parallel</text>
    <text x="310" y="233" font-size="7.5" fill="var(--accent-2)">softmax(QKᵀ/√dₖ)·V</text>
    <text x="310" y="247" font-size="6.5" fill="var(--text-dim)">each head attends to every token</text>
  </g>

  <line x1="305" y1="196" x2="305" y2="188" stroke="var(--text-dim)" stroke-width="1.5" marker-end="url(#ah)"/>
  <rect x="205" y="160" width="200" height="26" rx="6" fill="var(--surface-2)" stroke="var(--line)"/>
  <text x="305" y="177" text-anchor="middle" font-size="10" fill="var(--text)">Add &amp; norm</text>

  <line x1="305" y1="160" x2="305" y2="150" stroke="var(--text-dim)" stroke-width="1.5" marker-end="url(#ah)"/>
  <g id="ffn">
    <rect x="205" y="100" width="200" height="48" rx="8" fill="var(--surface-2)" stroke="var(--line)"/>
    <text x="305" y="128" text-anchor="middle" font-size="10.5" fill="var(--text)">Feed-forward network</text>
  </g>

  <line x1="305" y1="100" x2="305" y2="90" stroke="var(--text-dim)" stroke-width="1.5" marker-end="url(#ah)"/>
  <rect x="205" y="62" width="200" height="26" rx="6" fill="var(--surface-2)" stroke="var(--line)"/>
  <text x="305" y="79" text-anchor="middle" font-size="10" fill="var(--text)">Add &amp; norm</text>

  <line x1="460" y1="150" x2="493" y2="150" stroke="var(--text-dim)" stroke-width="1.5" marker-end="url(#ah)"/>
  <rect x="495" y="120" width="140" height="60" rx="8" fill="var(--surface-2)" stroke="var(--line)"/>
  <text x="565" y="146" text-anchor="middle" font-size="11" fill="var(--text)">Output</text>
  <text x="565" y="162" text-anchor="middle" font-size="8" fill="var(--text-dim)">context-aware vectors</text>
</svg>`,
    notes:
      'Example: a transformer encoder. Ask the audience to picture the whole stack, then say "now let\'s zoom into the attention head" and call zoom_to with target "attention" — the formula only becomes legible zoomed in. Explain it, call zoom_to with "reset", and move on. If anyone asks a question, put it on screen with show_question. Diagrams like this are just SVG in a slide spec, so you can draw new ones live with add_slide.',
  },
  {
    id: 'fact',
    layout: 'fact',
    fact: { value: '0 clicks', label: 'the presenter never touches the deck' },
    title: 'Ask a question — the deck answers.',
    notes:
      'Let the number land, then explain: because slides are structured JSON, the agent can create a brand-new slide mid-conversation with add_slide when the audience asks something the deck did not anticipate. Offer to demonstrate.',
  },
  {
    id: 'try',
    layout: 'split',
    emoji: '🚀',
    title: 'Try it yourself',
    bullets: [
      'Open this page in a WebMCP-capable browser',
      'Say: “Get the deck and present it to me”',
      'Then ask for a new slide about anything',
    ],
    notes:
      'Close by inviting the audience to drive: any question they ask can become a slide in seconds. Thank them, and stop advancing — this is the last slide.',
  },
];
