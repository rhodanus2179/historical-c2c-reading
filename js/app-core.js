const PLAN = window.PLAN;
const BIBLE_BOOKS = window.BIBLE_BOOKS;

const ERAS = [
  ...new Map(
    PLAN.map((item) => [
      item.era,
      { name: item.era, theme: item.theme, start: item.day, end: item.day },
    ]),
  ).values(),
];
PLAN.forEach((item) => {
  const era = ERAS.find((candidate) => candidate.name === item.era);
  if (era) era.end = item.day;
});

const STATE_VERSION = 4;
const BACKUP_FORMAT_VERSION = 2;
const KEY = "bible-history-reader-v1";
const PRE_IMPORT_KEY = "bible-history-reader-v1-pre-import";
const VALID_MODES = new Set(["pace", "calendar"]);
const VALID_THEMES = new Set(["system", "light", "dark"]);
const views = [
  ["today", "今日"],
  ["plan", "通読表"],
  ["history", "歴史"],
  ["notes", "記録"],
  ["settings", "設定"],
];

const sidebar = document.getElementById("sidebar");
const mobileNav = document.getElementById("mobileNav");
const headerProgress = document.getElementById("headerProgress");
const toastElement = document.getElementById("toast");
const toastMessage = document.getElementById("toastMessage");
const toastAction = document.getElementById("toastAction");

let toastTimer = null;
let toastActionHandler = null;
let toastExpireHandler = null;
let pendingUndo = null;
let activeView = "today";

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function createDefaultState() {
  return {
    version: STATE_VERSION,
    settings: {
      startDate: localDateString(),
      mode: "pace",
      theme: "system",
      fontSize: 16,
      translation: "si",
    },
    progress: {},
    notes: {},
    selectedDay: 1,
  };
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function clampDay(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1;
  return Math.max(1, Math.min(365, Math.trunc(numeric)));
}

function clampFontSize(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 16;
  return Math.max(14, Math.min(20, Math.round(numeric)));
}

function isValidDateString(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function normalizeCompletion(value) {
  if (value === "completed") {
    return { status: "completed", completedAt: null, utcOffsetMinutes: null };
  }
  if (!isPlainObject(value) || value.status !== "completed") return null;

  let completedAt = null;
  if (typeof value.completedAt === "string") {
    const parsed = new Date(value.completedAt);
    if (!Number.isNaN(parsed.getTime())) completedAt = parsed.toISOString();
  }

  let utcOffsetMinutes = null;
  if (
    completedAt !== null &&
    Number.isFinite(Number(value.utcOffsetMinutes)) &&
    Number(value.utcOffsetMinutes) >= -840 &&
    Number(value.utcOffsetMinutes) <= 840
  ) {
    utcOffsetMinutes = Math.trunc(Number(value.utcOffsetMinutes));
  }

  return { status: "completed", completedAt, utcOffsetMinutes };
}

function normalizeState(input) {
  const defaults = createDefaultState();
  const source = isPlainObject(input) ? input : {};
  const rawSettings = isPlainObject(source.settings) ? source.settings : {};

  const settings = {
    startDate: isValidDateString(rawSettings.startDate)
      ? rawSettings.startDate
      : defaults.settings.startDate,
    mode: VALID_MODES.has(rawSettings.mode)
      ? rawSettings.mode
      : defaults.settings.mode,
    theme: VALID_THEMES.has(rawSettings.theme)
      ? rawSettings.theme
      : defaults.settings.theme,
    fontSize: clampFontSize(rawSettings.fontSize),
    translation:
      typeof rawSettings.translation === "string" && rawSettings.translation
        ? rawSettings.translation
        : defaults.settings.translation,
  };

  const progress = {};
  if (isPlainObject(source.progress)) {
    Object.entries(source.progress).forEach(([rawDay, rawRecord]) => {
      const day = Number(rawDay);
      if (!Number.isInteger(day) || day < 1 || day > 365) return;
      const record = normalizeCompletion(rawRecord);
      if (record) progress[day] = record;
    });
  }

  const notes = {};
  if (isPlainObject(source.notes)) {
    Object.entries(source.notes).forEach(([rawDay, note]) => {
      const day = Number(rawDay);
      if (!Number.isInteger(day) || day < 1 || day > 365) return;
      if (typeof note === "string") notes[day] = note;
    });
  }

  return {
    version: STATE_VERSION,
    settings,
    progress,
    notes,
    selectedDay: clampDay(source.selectedDay),
  };
}

function saveStateToKey(storageKey, value) {
  localStorage.setItem(storageKey, JSON.stringify(normalizeState(value)));
}

function load() {
  const raw = localStorage.getItem(KEY);
  if (!raw) return createDefaultState();

  try {
    const parsed = JSON.parse(raw);
    const normalized = normalizeState(parsed);
    if (JSON.stringify(parsed) !== JSON.stringify(normalized)) {
      saveStateToKey(KEY, normalized);
    }
    return normalized;
  } catch {
    const defaults = createDefaultState();
    saveStateToKey(KEY, defaults);
    return defaults;
  }
}

let state = load();

function save() {
  state = normalizeState(state);
  saveStateToKey(KEY, state);
}

function getCompletion(day) {
  const record = state.progress[clampDay(day)];
  return record ? clone(record) : null;
}

function isCompleted(day) {
  return Boolean(state.progress[clampDay(day)]?.status === "completed");
}

function markCompleted(day, now = new Date()) {
  const normalizedDay = clampDay(day);
  state.progress[normalizedDay] = {
    status: "completed",
    completedAt: now.toISOString(),
    utcOffsetMinutes: -now.getTimezoneOffset(),
  };
  return getCompletion(normalizedDay);
}

function markUnread(day) {
  const normalizedDay = clampDay(day);
  const previous = getCompletion(normalizedDay);
  delete state.progress[normalizedDay];
  return previous;
}

function completedDays() {
  return Object.keys(state.progress)
    .map(Number)
    .filter((day) => Number.isInteger(day) && isCompleted(day))
    .sort((a, b) => a - b);
}

function doneCount() {
  return completedDays().length;
}

function allCompleted() {
  return doneCount() === 365;
}

function nextDay() {
  for (let day = 1; day <= 365; day += 1) {
    if (!isCompleted(day)) return day;
  }
  return 365;
}

function scheduledDay(now = new Date()) {
  const [year, month, day] = state.settings.startDate.split("-").map(Number);
  const startUtc = Date.UTC(year, month - 1, day);
  const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const elapsed = Math.floor((todayUtc - startUtc) / 86400000) + 1;
  return Math.max(1, Math.min(365, elapsed));
}

function targetDay() {
  return state.settings.mode === "calendar" ? scheduledDay() : nextDay();
}

function targetLabel() {
  return state.settings.mode === "calendar" ? "今日の予定" : "次の通読";
}

function pct() {
  return Math.round((doneCount() / 365) * 1000) / 10;
}

function applyTheme() {
  const systemDark =
    typeof matchMedia === "function" &&
    matchMedia("(prefers-color-scheme:dark)").matches;
  const theme =
    state.settings.theme === "system"
      ? systemDark
        ? "dark"
        : "light"
      : state.settings.theme;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.fontSize = `${state.settings.fontSize}px`;
}

function hideToast() {
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = null;
  toastActionHandler = null;
  toastExpireHandler = null;
  toastElement.classList.remove("show");
  toastAction.hidden = true;
  toastAction.textContent = "";
}

function toast(message, options = {}) {
  hideToast();
  const {
    actionLabel = "",
    onAction = null,
    onExpire = null,
    duration = 1800,
  } = options;

  toastMessage.textContent = message;
  toastActionHandler = typeof onAction === "function" ? onAction : null;
  toastExpireHandler = typeof onExpire === "function" ? onExpire : null;

  if (actionLabel && toastActionHandler) {
    toastAction.textContent = actionLabel;
    toastAction.hidden = false;
  }

  toastElement.classList.add("show");
  toastTimer = setTimeout(() => {
    const expire = toastExpireHandler;
    hideToast();
    if (expire) expire();
  }, duration);
}

toastAction.addEventListener("click", () => {
  const action = toastActionHandler;
  hideToast();
  if (action) action();
});

function registerCompletionUndo(day, previousRecord, nextRecord, message) {
  const change = {
    day: clampDay(day),
    previousRecord: clone(previousRecord),
    nextRecord: clone(nextRecord),
  };
  pendingUndo = change;
  toast(message, {
    actionLabel: "元に戻す",
    duration: 5000,
    onAction: () => undoCompletionChange(change),
    onExpire: () => {
      if (pendingUndo === change) pendingUndo = null;
    },
  });
}

function undoCompletionChange(change) {
  if (!change || pendingUndo !== change) return;
  if (change.previousRecord) {
    state.progress[change.day] = clone(change.previousRecord);
  } else {
    delete state.progress[change.day];
  }
  pendingUndo = null;
  save();
  render(activeView);
  toast("元に戻しました");
}

function navHtml() {
  return views
    .map(
      ([id, label]) =>
        `<button type="button" class="navbtn ${id === "today" ? "active" : ""}" data-view="${id}"${
          id === "today" ? ' aria-current="page"' : ""
        }>${label}</button>`,
    )
    .join("");
}

sidebar.innerHTML = navHtml();
mobileNav.innerHTML = navHtml();

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-view]");
  if (button) showView(button.dataset.view);
});

function showView(id) {
  const validId = views.some(([viewId]) => viewId === id) ? id : "today";
  activeView = validId;
  document.querySelectorAll(".view").forEach((view) => {
    view.classList.toggle("active", view.id === validId);
  });
  document.querySelectorAll("[data-view]").forEach((button) => {
    const isActive = button.dataset.view === validId;
    button.classList.toggle("active", isActive);
    if (isActive) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  render(validId);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function render(id) {
  applyTheme();
  headerProgress.textContent = `${doneCount()} / 365日 ・ ${pct()}%`;
  const renderers = {
    today: renderToday,
    plan: renderPlan,
    history: renderHistory,
    notes: renderNotes,
    settings: renderSettings,
  };
  (renderers[id] || renderToday)();
}

function dayData(day) {
  return PLAN[clampDay(day) - 1];
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

function hasPreImportState() {
  return localStorage.getItem(PRE_IMPORT_KEY) !== null;
}

function exportData() {
  const payload = {
    app: "BibleHistoryReading",
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    data: normalizeState(state),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `bible-reading-backup-${localDateString()}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function parseBackup(text) {
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error("invalid-json");
  }
  if (!isPlainObject(payload) || payload.app !== "BibleHistoryReading") {
    throw new Error("invalid-app");
  }
  const formatVersion = payload.formatVersion == null ? 1 : Number(payload.formatVersion);
  if (!Number.isInteger(formatVersion) || formatVersion < 1) {
    throw new Error("invalid-format");
  }
  if (formatVersion > BACKUP_FORMAT_VERSION) {
    throw new Error("future-version");
  }
  if (!isPlainObject(payload.data)) throw new Error("invalid-data");
  if (payload.data.version != null) {
    const stateVersion = Number(payload.data.version);
    if (!Number.isInteger(stateVersion) || stateVersion < 1) {
      throw new Error("invalid-data");
    }
    if (stateVersion > STATE_VERSION) throw new Error("future-version");
  }
  return normalizeState(payload.data);
}

function applyImportedState(importedState) {
  saveStateToKey(PRE_IMPORT_KEY, state);
  state = normalizeState(importedState);
  save();
}

function swapPreImportState() {
  const raw = localStorage.getItem(PRE_IMPORT_KEY);
  if (!raw) return false;
  try {
    const previous = normalizeState(JSON.parse(raw));
    const current = normalizeState(state);
    saveStateToKey(PRE_IMPORT_KEY, current);
    state = previous;
    save();
    return true;
  } catch {
    localStorage.removeItem(PRE_IMPORT_KEY);
    return false;
  }
}

function resetAllData() {
  localStorage.removeItem(KEY);
  localStorage.removeItem(PRE_IMPORT_KEY);
  state = createDefaultState();
  save();
}

const BIBLE_BOOK_KEYS = Object.keys(BIBLE_BOOKS).sort(
  (a, b) => b.length - a.length,
);

function parseReadingForLinks(label) {
  const groups = new Map();
  let currentBook = null;

  String(label)
    .split("、")
    .forEach((raw) => {
      let token = raw.trim();
      const matched = BIBLE_BOOK_KEYS.find((key) => token.startsWith(key));
      if (matched) {
        currentBook = matched;
        token = token.slice(matched.length);
      }
      if (!currentBook || !BIBLE_BOOKS[currentBook]) return;

      const numbers = token.match(/\d+(?::\d+)?(?:～\d+(?::\d+)?)?/);
      if (!numbers) return;
      const [left, right = null] = numbers[0].split("～");
      const startChapter = Number.parseInt(left.split(":")[0], 10);
      let endChapter = startChapter;
      if (right) {
        endChapter =
          left.includes(":") && !right.includes(":")
            ? startChapter
            : Number.parseInt(right.split(":")[0], 10);
      }
      if (!Number.isFinite(startChapter) || !Number.isFinite(endChapter)) return;

      if (!groups.has(currentBook)) groups.set(currentBook, new Set());
      for (let chapter = startChapter; chapter <= endChapter; chapter += 1) {
        groups.get(currentBook).add(chapter);
      }
    });

  return [...groups.entries()].map(([book, chapters]) => ({
    book,
    chapters: [...chapters].sort((a, b) => a - b),
  }));
}

function renderBibleLinks(label) {
  const groups = parseReadingForLinks(label);
  if (!groups.length) {
    return '<div class="small">聖書箇所を自動判定できませんでした。</div>';
  }
  return (
    '<div class="small">「ともに聴く聖書」で本文を読み、音声を再生できます。</div>' +
    groups
      .map((group) => {
        const meta = BIBLE_BOOKS[group.book];
        const buttons = group.chapters
          .map(
            (chapter) =>
              `<button type="button" class="chapter-btn" data-bible-book="${group.book}" data-bible-chapter="${chapter}" title="${esc(meta.titleNi)} ${chapter}章をともに聴く聖書で開く">${chapter}章</button>`,
          )
          .join("");
        return `<div class="chapter-group"><div class="chapter-group-head"><span class="chapter-group-title">${esc(meta.titleNi)}</span><span class="small">該当章</span></div><div class="chapter-buttons">${buttons}</div></div>`;
      })
      .join("")
  );
}

function openBibleChapter(bookKey, chapter) {
  const book = BIBLE_BOOKS[bookKey];
  const chapterNumber = Number(chapter);
  if (!book || !Number.isInteger(chapterNumber) || chapterNumber < 1) return;

  const link = document.createElement("a");
  link.href = `https://prs.app/ja/bible/${book.code}.${chapterNumber}.jdb`;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.hidden = true;
  document.body.appendChild(link);
  link.click();
  link.remove();
}
