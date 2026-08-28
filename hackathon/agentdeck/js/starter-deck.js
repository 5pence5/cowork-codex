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
