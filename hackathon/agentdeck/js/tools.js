// AgentDeck WebMCP tool surface.
//
// Every tool returns a short text result that tells the agent what is now on
// screen and what the next reveal will be, so spoken narration and on-screen
// motion stay in lockstep.

const SLIDE_SPEC_SCHEMA = {
  type: 'object',
  properties: {
    layout: {
      type: 'string',
      enum: ['title', 'bullets', 'split', 'code', 'fact', 'quote', 'diagram'],
      description:
        'title: opening slide, everything appears at once. bullets: heading plus bullets revealed one advance at a time. split: emoji visual beside revealed bullets. code: heading, optional bullets, then a code block as the final reveal. fact: one huge statistic. quote: a pull quote. diagram: heading plus an SVG diagram (see svg field).',
    },
    title: { type: 'string' },
    subtitle: { type: 'string', description: 'Supporting line under the title.' },
    emoji: { type: 'string', description: 'One large decorative emoji used as the slide visual.' },
    bullets: {
      type: 'array',
      items: { type: 'string' },
      description: 'Short lines revealed one per advance call — narrate each as it appears.',
    },
    code: {
      type: 'object',
      properties: {
        language: { type: 'string' },
        content: { type: 'string' },
      },
      description: 'Code block, revealed as its own step.',
    },
    fact: {
      type: 'object',
      properties: {
        value: { type: 'string', description: 'The big number or phrase, e.g. "10×".' },
        label: { type: 'string', description: 'What the value means.' },
      },
    },
    quote: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        attribution: { type: 'string' },
      },
    },
    svg: {
      type: 'string',
      description:
        'Inline SVG markup for a diagram (use a viewBox; scripts are stripped). Give the parts you will talk about id attributes — zoom_to can then focus each region by id. Use CSS variables for colors so the diagram matches every theme: var(--text), var(--text-dim), var(--accent), var(--accent-2), var(--surface-2), var(--line).',
    },
    notes: {
      type: 'string',
      description: 'Speaker notes: what to say while this slide is on screen.',
    },
  },
  required: ['layout'],
};

function positionReport(deck) {
  const next = deck.nextRevealLabel();
  const notes = deck.current.notes ? `\nSpeaker notes: ${deck.current.notes}` : '';
  return `Now at ${deck.describePosition()}.${notes}\nNext reveal: ${next || 'none — this is the end of the deck'}.`;
}

export function buildTools(deck) {
  return [
    {
      name: 'get_deck',
      description:
        'Call this first. Returns the full deck outline, the current slide and reveal step, the current speaker notes, and what the next advance call will reveal. Use it to orient yourself before presenting or editing. Pass include_specs to also get every slide as JSON — useful for fleshing a live outline out into a fuller presentation.',
      inputSchema: {
        type: 'object',
        properties: {
          include_specs: {
            type: 'boolean',
            description: 'Also return all slides as JSON specs (the format add_slide accepts).',
          },
        },
      },
      handler: ({ include_specs = false } = {}) => {
        const specs = include_specs ? `\n\nSlide specs (add_slide format):\n${JSON.stringify(deck.slides, null, 1)}` : '';
        return `Deck outline (→ marks the current slide):\n${deck.outline()}\n\n${positionReport(deck)}${specs}`;
      },
    },
    {
      name: 'advance',
      description:
        'Reveal the next element on the current slide, or move to the next slide when the current one is fully revealed. Returns exactly what just appeared — narrate that, then advance again when you finish speaking. This is your main presenting tool.',
      inputSchema: {
        type: 'object',
        properties: {
          steps: { type: 'integer', minimum: 1, description: 'Advance several steps at once. Default 1.' },
        },
      },
      handler: ({ steps = 1 } = {}) => {
        const events = [];
        for (let k = 0; k < Math.min(steps, 25); k += 1) {
          const r = deck.advance();
          if (r.type === 'end') {
            events.push('End of deck — nothing more to reveal.');
            break;
          }
          if (r.type === 'slide') {
            events.push(`Moved to a new slide: “${r.slide.title || r.slide.layout}”.`);
          } else {
            events.push(`Revealed ${r.text}.`);
          }
        }
        deck.save();
        return `${events.join('\n')}\n${positionReport(deck)}`;
      },
    },
    {
      name: 'back',
      description: 'Step backwards: hide the most recent reveal, or return to the previous slide.',
      inputSchema: { type: 'object', properties: {} },
      handler: () => {
        deck.back();
        deck.save();
        return positionReport(deck);
      },
    },
    {
      name: 'goto_slide',
      description: 'Jump straight to a slide by its 1-based number or id, optionally pre-revealing some steps.',
      inputSchema: {
        type: 'object',
        properties: {
          slide: { type: ['integer', 'string'], description: '1-based slide number, or a slide id from get_deck.' },
          step: { type: 'integer', minimum: 0, description: 'How many reveals to apply on arrival. Default 0.' },
        },
        required: ['slide'],
      },
      handler: ({ slide, step = 0 }) => {
        deck.goto(slide, step);
        deck.save();
        return positionReport(deck);
      },
    },
    {
      name: 'add_slide',
      description:
        'Create a new slide from a structured spec and insert it into the deck. Use this to build or extend the presentation live while you talk — keep bullets short (they are revealed one at a time) and always include speaker notes.',
      inputSchema: {
        type: 'object',
        properties: {
          position: {
            type: 'integer',
            minimum: 1,
            description: '1-based position to insert at. Omit to append at the end.',
          },
          present: {
            type: 'boolean',
            description: 'If true, jump to the new slide immediately after creating it.',
          },
          slide: SLIDE_SPEC_SCHEMA,
        },
        required: ['slide'],
      },
      handler: ({ slide, position, present = false }) => {
        const { slide: created, position: at } = deck.addSlide(slide, position);
        if (present) deck.goto(created.id, 0);
        deck.save();
        return `Created slide ${at} (“${created.title || created.layout}”, id ${created.id}).${present ? ' Now presenting it.' : ''}\n${positionReport(deck)}`;
      },
    },
    {
      name: 'update_slide',
      description:
        'Replace fields on an existing slide (title, bullets, code, notes, …). Fields you omit are kept. If the slide is on screen it re-renders in place.',
      inputSchema: {
        type: 'object',
        properties: {
          slide: { type: ['integer', 'string'], description: '1-based slide number, or a slide id from get_deck.' },
          set: SLIDE_SPEC_SCHEMA,
        },
        required: ['slide', 'set'],
      },
      handler: ({ slide, set }) => {
        const updated = deck.updateSlide(slide, set);
        deck.save();
        return `Updated slide “${updated.title || updated.layout}” (id ${updated.id}).\n${positionReport(deck)}`;
      },
    },
    {
      name: 'remove_slide',
      description: 'Delete a slide by its 1-based number or id.',
      inputSchema: {
        type: 'object',
        properties: {
          slide: { type: ['integer', 'string'], description: '1-based slide number, or a slide id from get_deck.' },
        },
        required: ['slide'],
      },
      handler: ({ slide }) => {
        const removed = deck.removeSlide(slide);
        deck.save();
        return `Removed slide “${removed.title || removed.layout}”.\n${positionReport(deck)}`;
      },
    },
    {
      name: 'spotlight',
      description:
        'Briefly emphasise one element on the current slide while you talk about it: the rest of the slide dims for a few seconds. Targets: "title", "subtitle", "bullet 2", "code", "fact", "quote", "visual".',
      inputSchema: {
        type: 'object',
        properties: {
          target: { type: 'string', description: 'e.g. "bullet 3" or "code".' },
        },
        required: ['target'],
      },
      handler: ({ target }) => {
        const ok = deck.spotlight(target);
        return ok
          ? `Spotlighting ${target} for a few seconds.`
          : `Nothing matches “${target}” on this slide — it may not be revealed yet.`;
      },
    },
    {
      name: 'zoom_to',
      description:
        'Cinematic camera move: smoothly zoom the current slide until one element fills the stage — a diagram region by its SVG id (e.g. "attention"), or "bullet 2", "code", "fact", "diagram". Use it while explaining that part ("now, zooming into the attention head…"), then call again with target "reset" to pull back before moving on.',
      inputSchema: {
        type: 'object',
        properties: {
          target: {
            type: 'string',
            description: 'An element id from the slide\'s SVG, "bullet N", "title", "code", "fact", "diagram" — or "reset" to zoom back out.',
          },
        },
        required: ['target'],
      },
      handler: ({ target }) => {
        const r = deck.zoomTo(target);
        if (!r.ok) return `Could not zoom: ${r.reason}.`;
        if (r.reset) return 'Zoomed back out to the full slide.';
        return `Zoomed in on “${target}” (${r.scale}×). Call zoom_to with target "reset" before advancing.`;
      },
    },
    {
      name: 'show_question',
      description:
        'Put an audience question on screen as a card over the current slide — use it the moment a listener asks something, so the room sees the question while you answer. Call with clear=true to dismiss the card when you are done answering.',
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'The question, as asked.' },
          attribution: { type: 'string', description: 'Optional: who asked.' },
          clear: { type: 'boolean', description: 'Dismiss the current question card instead of showing one.' },
        },
      },
      handler: ({ text, attribution, clear = false }) => {
        if (clear) {
          return deck.clearQuestion() ? 'Question card dismissed.' : 'There was no question card on screen.';
        }
        if (!text) return 'Provide the question text, or pass clear=true to dismiss.';
        deck.showQuestion(text, attribution);
        return `Showing the question: “${text}”. Answer it aloud, then call show_question with clear=true.`;
      },
    },
    {
      name: 'set_theme',
      description: 'Switch the deck theme. Themes: midnight (dark, default), paper (light), aurora (vivid gradient).',
      inputSchema: {
        type: 'object',
        properties: {
          theme: { type: 'string', enum: ['midnight', 'paper', 'aurora'] },
        },
        required: ['theme'],
      },
      handler: ({ theme }) => {
        deck.setTheme(theme);
        deck.save();
        return `Theme is now “${theme}”.`;
      },
    },
  ];
}

// Registers tools with whichever WebMCP surface the browser exposes.
// Returns { mode, tools } where tools keep their handlers for the debug runner.
export function registerTools(deck, log) {
  const tools = buildTools(deck);
  const defs = tools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
    async execute(args) {
      const params = args && typeof args === 'object' ? args : {};
      log(t.name, params, 'agent');
      try {
        const text = await t.handler(params);
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  }));

  const mc = typeof navigator !== 'undefined' ? navigator.modelContext : undefined;
  let mode = 'unavailable';
  try {
    if (mc && typeof mc.registerTool === 'function') {
      defs.forEach((d) => mc.registerTool(d));
      mode = 'registerTool';
    } else if (mc && typeof mc.provideContext === 'function') {
      mc.provideContext({ tools: defs });
      mode = 'provideContext';
    }
  } catch (err) {
    console.warn('WebMCP registration failed:', err);
    mode = 'error';
  }
  return { mode, tools, defs };
}
