import { Deck } from './deck.js';
import { registerTools } from './tools.js';
import { starterDeck } from './starter-deck.js';

const stage = document.getElementById('stage');
const progress = document.getElementById('progress');
const logEl = document.getElementById('log');
const statusChip = document.getElementById('mcp-status');
const panel = document.getElementById('panel');

// --- logging ----------------------------------------------------------------

function log(tool, args, source = 'agent') {
  const row = document.createElement('div');
  row.className = `log-row log-${source}`;
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const argText = args && Object.keys(args).length ? JSON.stringify(args) : '';
  row.innerHTML = '';
  const badge = document.createElement('span');
  badge.className = 'log-badge';
  badge.textContent = source === 'agent' ? '🤖' : source === 'sim' ? '🧪' : '⌨️';
  const body = document.createElement('span');
  body.className = 'log-body';
  body.textContent = `${time}  ${tool}${argText ? ` ${argText}` : ''}`;
  row.append(badge, body);
  logEl.appendChild(row);
  logEl.scrollTop = logEl.scrollHeight;
}

// --- deck boot --------------------------------------------------------------

const saved = Deck.loadSaved();
const deck = new Deck(stage, saved?.slides || starterDeck, { onChange: renderProgress });
if (saved?.theme) {
  try {
    deck.setTheme(saved.theme);
  } catch {
    /* stale theme name; keep default */
  }
}
deck.render({ animate: false });
renderProgress();

function renderProgress() {
  progress.innerHTML = '';
  deck.slides.forEach((s, idx) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = `dot${idx === deck.i ? ' active' : ''}`;
    dot.title = s.title || s.layout;
    dot.addEventListener('click', () => {
      log('goto_slide', { slide: idx + 1 }, 'key');
      deck.goto(idx + 1);
      deck.save();
    });
    progress.appendChild(dot);
  });
}

// --- WebMCP -----------------------------------------------------------------

const { mode, tools, defs } = registerTools(deck, log);

if (mode === 'registerTool' || mode === 'provideContext') {
  statusChip.textContent = `WebMCP: ${defs.length} tools live`;
  statusChip.className = 'chip chip-ok';
  statusChip.title = `Registered via navigator.modelContext.${mode}`;
} else {
  statusChip.textContent = 'WebMCP: not detected';
  statusChip.className = 'chip chip-warn';
  statusChip.title =
    'Open this page in the ChatGPT desktop in-app browser, or Chrome with the WebMCP flag enabled. The simulator in the console panel works everywhere.';
}

// --- keyboard + UI ----------------------------------------------------------

document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea, select')) return;
  if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
    e.preventDefault();
    log('advance', {}, 'key');
    deck.advance();
    deck.save();
  } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
    e.preventDefault();
    log('back', {}, 'key');
    deck.back();
    deck.save();
  }
});

document.getElementById('toggle-panel').addEventListener('click', () => {
  panel.hidden = !panel.hidden;
});
document.getElementById('close-panel').addEventListener('click', () => {
  panel.hidden = true;
});

document.getElementById('reset-deck').addEventListener('click', () => {
  if (!confirm('Discard edits and restore the starter deck?')) return;
  Deck.clearSaved();
  location.reload();
});

// --- simulator --------------------------------------------------------------

const toolSelect = document.getElementById('runner-tool');
defs.forEach((d) => {
  const opt = document.createElement('option');
  opt.value = d.name;
  opt.textContent = d.name;
  toolSelect.appendChild(opt);
});

document.getElementById('runner').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = toolSelect.value;
  const tool = tools.find((t) => t.name === name);
  if (!tool) return;
  let args = {};
  const raw = document.getElementById('runner-args').value.trim();
  if (raw) {
    try {
      args = JSON.parse(raw);
    } catch {
      log(name, { error: 'invalid JSON args' }, 'sim');
      return;
    }
  }
  log(name, args, 'sim');
  let text;
  try {
    text = await tool.handler(args);
  } catch (err) {
    text = `Error: ${err.message}`;
  }
  const row = document.createElement('div');
  row.className = 'log-row log-result';
  row.textContent = text;
  logEl.appendChild(row);
  logEl.scrollTop = logEl.scrollHeight;
});
