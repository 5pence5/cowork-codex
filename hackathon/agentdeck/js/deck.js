// AgentDeck slide engine: renders JSON slide specs, steps through reveals,
// and reports what changed so a narrating agent can stay in sync.

const STORAGE_KEY = 'agentdeck.v1';
const THEMES = ['midnight', 'paper', 'aurora'];

let uid = 0;
function freshId(prefix = 'slide') {
  uid += 1;
  return `${prefix}-${Date.now().toString(36)}-${uid}`;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// Basic hygiene for agent-supplied SVG markup: keep shapes and ids, drop
// anything executable.
function sanitizeSvg(markup) {
  const box = document.createElement('div');
  box.innerHTML = markup;
  box.querySelectorAll('script, foreignObject').forEach((n) => n.remove());
  box.querySelectorAll('*').forEach((n) => {
    [...n.attributes].forEach((a) => {
      if (/^on/i.test(a.name) || /javascript:/i.test(a.value)) n.removeAttribute(a.name);
    });
  });
  return box.querySelector('svg');
}

export class Deck {
  constructor(stage, slides, { onChange } = {}) {
    this.stage = stage;
    this.slides = slides.map((s) => ({ ...s, id: s.id || freshId() }));
    this.i = 0;
    this.step = 0;
    this.fragLabels = [];
    this.maxFrag = 0;
    this.onChange = onChange || (() => {});
    this.theme = 'midnight';
  }

  get current() {
    return this.slides[this.i];
  }

  // --- rendering ------------------------------------------------------------

  render({ animate = true } = {}) {
    const slide = this.current;
    this.stage.innerHTML = '';
    this.fragLabels = [];
    let frag = 0;

    const root = el('section', `slide layout-${slide.layout}${animate ? ' enter' : ''}`);
    // The entrance animation must release its hold on `transform` once it
    // finishes, or zoomTo's inline transform would be ignored.
    root.addEventListener('animationend', () => root.classList.remove('enter'), { once: true });
    const nextFrag = (node, label) => {
      frag += 1;
      node.dataset.frag = String(frag);
      node.classList.add('frag');
      this.fragLabels[frag] = label;
    };

    if (slide.emoji && slide.layout !== 'fact') {
      root.appendChild(el('div', 'visual', slide.emoji));
    }

    const body = el('div', 'body');
    root.appendChild(body);

    if (slide.layout === 'quote' && slide.quote) {
      const q = el('blockquote', 'quote');
      q.appendChild(el('p', 'quote-text', `“${slide.quote.text}”`));
      if (slide.quote.attribution) q.appendChild(el('cite', 'quote-cite', `— ${slide.quote.attribution}`));
      body.appendChild(q);
    } else if (slide.layout === 'fact' && slide.fact) {
      const f = el('div', 'fact');
      f.appendChild(el('div', 'fact-value', slide.fact.value));
      if (slide.fact.label) f.appendChild(el('div', 'fact-label', slide.fact.label));
      body.appendChild(f);
      if (slide.title) body.appendChild(el('h2', 'fact-title', slide.title));
    } else {
      if (slide.title) body.appendChild(el(slide.layout === 'title' ? 'h1' : 'h2', 'title', slide.title));
      if (slide.subtitle) body.appendChild(el('p', 'subtitle', slide.subtitle));
    }

    if (slide.svg) {
      const frame = el('div', 'diagram-frame');
      const svg = sanitizeSvg(slide.svg);
      if (svg) frame.appendChild(svg);
      else frame.appendChild(el('p', 'subtitle', '(diagram markup was invalid)'));
      body.appendChild(frame);
    }

    if (Array.isArray(slide.bullets) && slide.bullets.length && slide.layout !== 'title') {
      const list = el('ul', 'bullets');
      slide.bullets.forEach((text, idx) => {
        const li = el('li', 'bullet', text);
        nextFrag(li, `bullet ${idx + 1}: “${text}”`);
        list.appendChild(li);
      });
      body.appendChild(list);
    } else if (Array.isArray(slide.bullets) && slide.layout === 'title') {
      // Title slides show everything on arrival.
      const list = el('ul', 'bullets');
      slide.bullets.forEach((text) => list.appendChild(el('li', 'bullet', text)));
      body.appendChild(list);
    }

    if (slide.code && slide.code.content) {
      const wrap = el('div', 'codewrap');
      if (slide.code.language) wrap.appendChild(el('div', 'code-lang', slide.code.language));
      const pre = el('pre', 'code');
      pre.appendChild(el('code', null, slide.code.content));
      wrap.appendChild(pre);
      nextFrag(wrap, `the ${slide.code.language || ''} code block`.trim());
      body.appendChild(wrap);
    }

    this.maxFrag = frag;
    this.stage.appendChild(root);

    // Apply already-revealed steps (used by goto/back) without animating them.
    root.querySelectorAll('.frag').forEach((node) => {
      const n = Number(node.dataset.frag);
      if (n <= this.step) {
        node.classList.add('on', 'instant');
        requestAnimationFrame(() => node.classList.remove('instant'));
      }
    });

    this.onChange();
  }

  // --- navigation -----------------------------------------------------------

  advance() {
    if (this.step < this.maxFrag) {
      this.step += 1;
      const node = this.stage.querySelector(`[data-frag="${this.step}"]`);
      if (node) node.classList.add('on');
      this.onChange();
      return { type: 'reveal', text: this.fragLabels[this.step] || `step ${this.step}` };
    }
    if (this.i < this.slides.length - 1) {
      this.i += 1;
      this.step = 0;
      this.render();
      return { type: 'slide', slide: this.current };
    }
    return { type: 'end' };
  }

  back() {
    if (this.step > 0) {
      const node = this.stage.querySelector(`[data-frag="${this.step}"]`);
      if (node) node.classList.remove('on');
      this.step -= 1;
      this.onChange();
      return { type: 'hide' };
    }
    if (this.i > 0) {
      this.i -= 1;
      this.render({ animate: false });
      this.step = this.maxFrag;
      this.render({ animate: false });
      return { type: 'slide', slide: this.current };
    }
    return { type: 'start' };
  }

  goto(ref, step = 0) {
    const idx = this.indexOf(ref);
    if (idx === -1) throw new Error(`No slide matches “${ref}”. Use a 1-based number or a slide id.`);
    this.i = idx;
    this.step = 0;
    this.render();
    // Fast-forward requested steps with animation so late reveals still read.
    const target = Math.min(Math.max(0, step), this.maxFrag);
    while (this.step < target) this.advance();
    return this.current;
  }

  indexOf(ref) {
    if (typeof ref === 'number') return ref >= 1 && ref <= this.slides.length ? ref - 1 : -1;
    const asNum = Number(ref);
    if (!Number.isNaN(asNum) && String(asNum) === String(ref)) return this.indexOf(asNum);
    return this.slides.findIndex((s) => s.id === ref);
  }

  // --- editing --------------------------------------------------------------

  addSlide(spec, position) {
    const slide = { ...spec, id: spec.id || freshId() };
    if (!slide.layout) slide.layout = 'bullets';
    let idx = this.slides.length;
    if (typeof position === 'number' && position >= 1 && position <= this.slides.length + 1) {
      idx = position - 1;
    }
    this.slides.splice(idx, 0, slide);
    if (idx <= this.i) this.i += 1;
    this.onChange();
    return { slide, position: idx + 1 };
  }

  updateSlide(ref, patch) {
    const idx = this.indexOf(ref);
    if (idx === -1) throw new Error(`No slide matches “${ref}”.`);
    const kept = this.slides[idx];
    this.slides[idx] = { ...kept, ...patch, id: kept.id };
    if (idx === this.i) {
      this.render({ animate: false });
      if (this.step > this.maxFrag) {
        this.step = this.maxFrag;
        this.render({ animate: false });
      }
    }
    this.onChange();
    return this.slides[idx];
  }

  removeSlide(ref) {
    const idx = this.indexOf(ref);
    if (idx === -1) throw new Error(`No slide matches “${ref}”.`);
    if (this.slides.length === 1) throw new Error('Cannot remove the last remaining slide.');
    const [removed] = this.slides.splice(idx, 1);
    if (idx < this.i) this.i -= 1;
    else if (idx === this.i) this.i = Math.min(this.i, this.slides.length - 1);
    this.step = 0;
    this.render({ animate: false });
    return removed;
  }

  // --- presentation effects -------------------------------------------------

  resolveTarget(target) {
    const slide = this.stage.querySelector('.slide');
    if (!slide) return null;
    const t = String(target).trim();
    const m = /^bullet\s*(\d+)$/i.exec(t);
    if (m) return slide.querySelectorAll('.bullet')[Number(m[1]) - 1] || null;
    const map = {
      title: '.title, .fact-title',
      subtitle: '.subtitle',
      code: '.codewrap',
      fact: '.fact',
      quote: '.quote',
      visual: '.visual',
      diagram: '.diagram-frame',
    };
    const sel = map[t.toLowerCase()];
    if (sel) return slide.querySelector(sel);
    // Fall back to an element id, e.g. a region inside a diagram's SVG.
    return slide.querySelector(`#${CSS.escape(t.replace(/^#/, ''))}`);
  }

  spotlight(target) {
    const slide = this.stage.querySelector('.slide');
    if (!slide) return false;
    const node = this.resolveTarget(target);
    if (!node) return false;
    slide.classList.add('dimmed');
    node.classList.add('spot');
    clearTimeout(this._spotTimer);
    this._spotTimer = setTimeout(() => {
      slide.classList.remove('dimmed');
      node.classList.remove('spot');
    }, 4000);
    return true;
  }

  // Prezi-style camera move: scale and pan the whole slide so one element
  // fills the stage. Pass 'reset' to pull back out.
  zoomTo(target, maxScale = 8) {
    const slide = this.stage.querySelector('.slide');
    if (!slide) return { ok: false, reason: 'no slide on stage' };
    slide.classList.remove('enter'); // the entrance animation would override the zoom transform

    if (String(target).trim().toLowerCase() === 'reset') {
      slide.style.transition = 'transform 0.9s cubic-bezier(0.22, 1, 0.36, 1)';
      slide.style.transform = '';
      return { ok: true, reset: true };
    }

    const node = this.resolveTarget(target);
    if (!node) return { ok: false, reason: `nothing on this slide matches “${target}”` };
    if (node.classList?.contains('frag') && !node.classList.contains('on')) {
      return { ok: false, reason: `“${target}” has not been revealed yet — advance first` };
    }

    // Measure in the untransformed state so repeated zooms stay accurate.
    slide.style.transition = 'none';
    slide.style.transform = '';
    void slide.offsetWidth;
    const stageR = this.stage.getBoundingClientRect();
    const tR = node.getBoundingClientRect();
    if (!tR.width || !tR.height) return { ok: false, reason: `“${target}” has no visible area` };

    const pad = 0.72;
    let k = Math.min((stageR.width * pad) / tR.width, (stageR.height * pad) / tR.height);
    k = Math.min(Math.max(k, 1.15), maxScale);
    const cx = tR.left + tR.width / 2 - stageR.left;
    const cy = tR.top + tR.height / 2 - stageR.top;
    const dx = stageR.width / 2 - k * cx;
    const dy = stageR.height / 2 - k * cy;

    slide.style.transformOrigin = '0 0';
    void slide.offsetWidth;
    slide.style.transition = 'transform 0.9s cubic-bezier(0.22, 1, 0.36, 1)';
    slide.style.transform = `translate(${dx}px, ${dy}px) scale(${k})`;
    return { ok: true, scale: Number(k.toFixed(2)) };
  }

  showQuestion(text, attribution) {
    this.clearQuestion();
    const card = el('div', 'question-card');
    card.appendChild(el('div', 'question-icon', '🙋'));
    const body = el('div', 'question-body');
    body.appendChild(el('p', 'question-text', `“${text}”`));
    if (attribution) body.appendChild(el('div', 'question-cite', attribution));
    card.appendChild(body);
    this.stage.appendChild(card);
    return true;
  }

  clearQuestion() {
    const card = this.stage.querySelector('.question-card');
    if (!card) return false;
    card.remove();
    return true;
  }

  setTheme(name) {
    if (!THEMES.includes(name)) throw new Error(`Unknown theme “${name}”. Themes: ${THEMES.join(', ')}.`);
    this.theme = name;
    document.documentElement.dataset.theme = name;
    this.onChange();
    return name;
  }

  // --- state for the agent --------------------------------------------------

  describePosition() {
    const s = this.current;
    return `slide ${this.i + 1}/${this.slides.length} (“${s.title || s.layout}”, id ${s.id}), reveal step ${this.step}/${this.maxFrag}`;
  }

  nextRevealLabel() {
    if (this.step < this.maxFrag) return this.fragLabels[this.step + 1];
    if (this.i < this.slides.length - 1) {
      const n = this.slides[this.i + 1];
      return `next slide: “${n.title || n.layout}”`;
    }
    return null;
  }

  outline() {
    return this.slides
      .map((s, idx) => {
        const marker = idx === this.i ? '→' : ' ';
        const bullets = Array.isArray(s.bullets) && s.bullets.length ? ` — ${s.bullets.length} bullets` : '';
        return `${marker} ${idx + 1}. [${s.layout}] ${s.title || s.quote?.text || s.fact?.value || '(untitled)'}${bullets} (id: ${s.id})`;
      })
      .join('\n');
  }

  // --- persistence ----------------------------------------------------------

  save() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ slides: this.slides, theme: this.theme, i: this.i, step: this.step })
      );
    } catch {
      /* storage unavailable; presenting still works */
    }
  }

  static loadSaved() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!Array.isArray(data.slides) || !data.slides.length) return null;
      return data;
    } catch {
      return null;
    }
  }

  static clearSaved() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
}

export { THEMES };
