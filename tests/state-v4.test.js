const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

function element() {
  return {
    innerHTML: '',
    textContent: '',
    hidden: false,
    dataset: {},
    style: {},
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener() {},
    setAttribute() {},
    removeAttribute() {},
    appendChild() {},
    click() {},
    remove() {},
    querySelectorAll() { return []; },
    querySelector() { return null; },
  };
}

const elements = new Map();
['sidebar','mobileNav','headerProgress','toast','toastMessage','toastAction'].forEach(id => elements.set(id, element()));
const store = new Map();
store.set('bible-history-reader-v1', JSON.stringify({
  version: 3,
  settings: { startDate: '2026-07-01', mode: 'pace', theme: 'system', fontSize: 99, translation: 'si' },
  progress: { 1: 'completed', 2: 'unread', 366: 'completed' },
  notes: { 1: 'memo', 0: 'bad' },
  selectedDay: '400',
}));

const context = {
  console,
  setTimeout: () => 1,
  clearTimeout() {},
  Blob,
  URL,
  Date,
  JSON,
  Math,
  Number,
  Object,
  String,
  Map,
  Set,
  localStorage: {
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { store.set(key, String(value)); },
    removeItem(key) { store.delete(key); },
  },
  document: {
    documentElement: { dataset: {}, style: {} },
    body: { appendChild() {} },
    getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
    addEventListener() {},
    querySelectorAll() { return []; },
    createElement() { return element(); },
  },
  window: {
    PLAN: Array.from({ length: 365 }, (_, i) => ({ day: i + 1, era: 'era', theme: 'theme', reading: '創1' })),
    BIBLE_BOOKS: { '創': { code: 'gen', titleNi: '創世記' } },
    scrollTo() {},
  },
  matchMedia: () => ({ matches: false }),
  renderToday() {},
  renderPlan() {},
  renderHistory() {},
  renderNotes() {},
  renderSettings() {},
};
context.globalThis = context;
vm.createContext(context);
const core = fs.readFileSync('js/app-core.js', 'utf8');
const checks = `
assert.strictEqual(state.version, 4);
assert.strictEqual(state.settings.fontSize, 20);
assert.strictEqual(state.selectedDay, 365);
assert.strictEqual(isCompleted(1), true);
assert.strictEqual(JSON.stringify(getCompletion(1)), JSON.stringify({ status: 'completed', completedAt: null, utcOffsetMinutes: null }));
assert.strictEqual(isCompleted(2), false);
assert.strictEqual(state.notes[1], 'memo');
assert.strictEqual(state.notes[0], undefined);

const fixed = new Date('2026-08-02T09:15:30.000Z');
markCompleted(2, fixed);
assert.strictEqual(isCompleted(2), true);
assert.strictEqual(getCompletion(2).completedAt, '2026-08-02T09:15:30.000Z');
assert.strictEqual(getCompletion(2).utcOffsetMinutes, fixed.getTimezoneOffset() === 0 ? 0 : -fixed.getTimezoneOffset());
assert.strictEqual(nextDay(), 3);

const oldBackup = JSON.stringify({ app: 'BibleHistoryReading', data: { version: 3, progress: { 8: 'completed' }, notes: {}, settings: {}, selectedDay: 8 } });
const imported = parseBackup(oldBackup);
assert.strictEqual(imported.version, 4);
assert.strictEqual(imported.progress[8].completedAt, null);

assert.throws(() => parseBackup(JSON.stringify({ app: 'BibleHistoryReading', formatVersion: 3, data: {} })), /future-version/);
assert.throws(() => parseBackup(JSON.stringify({ app: 'BibleHistoryReading', formatVersion: 2, data: { version: 5 } })), /future-version/);
assert.throws(() => parseBackup(JSON.stringify({ app: 'Other', data: {} })), /invalid-app/);

const beforeImport = JSON.stringify(normalizeState(state));
applyImportedState(imported);
assert.strictEqual(isCompleted(8), true);
assert.strictEqual(hasPreImportState(), true);
assert.strictEqual(swapPreImportState(), true);
assert.strictEqual(JSON.stringify(normalizeState(state)), beforeImport);

state.settings.startDate = '2026-08-01';
assert.strictEqual(scheduledDay(new Date(2026, 7, 2, 12, 0, 0)), 2);

state.progress = {};
for (let day = 1; day <= 365; day += 1) state.progress[day] = { status: 'completed', completedAt: null, utcOffsetMinutes: null };
assert.strictEqual(allCompleted(), true);
assert.strictEqual(nextDay(), 365);
console.log('core checks passed');
`;
context.assert = assert;
vm.runInContext(core + '\n' + checks, context);
