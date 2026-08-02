function renderToday() {
  const todayRoot = document.getElementById("today");
  const selected = dayData(state.selectedDay || targetDay());
  if (state.selectedDay !== selected.day) {
    state.selectedDay = selected.day;
    save();
  }

  const target = targetDay();
  const isTarget = selected.day === target;
  const completed = isCompleted(selected.day);
  const targetText = targetLabel();
  const paceCompleted = state.settings.mode === "pace" && allCompleted();

  let statusLabel;
  if (isTarget) {
    statusLabel = completed ? "✓ 読了" : `○ ${targetText}`;
  } else {
    statusLabel = `閲覧中 Day ${selected.day}`;
  }

  let targetControl = "";
  if (!isTarget) {
    targetControl = paceCompleted
      ? '<span class="target-complete">通読完了</span>'
      : `<button type="button" class="secondary target-button" id="targetDayBtn">${targetText} Day ${target}へ</button>`;
  }

  const previousDay = selected.day - 1;
  const nextReadingDay = selected.day + 1;
  const progressNext = allCompleted() ? "完了" : nextDay();

  todayRoot.innerHTML = `
    <div class="hero">
      <div class="kicker">DAY ${selected.day} / 365</div>
      <h1>${esc(selected.era)}</h1>
      <p>${esc(selected.theme)}</p>
      <div class="progressbar" aria-label="全体の進捗 ${pct()}%">
        <span style="width:${pct()}%"></span>
      </div>
    </div>
    <div class="grid2">
      <div>
        <div class="card">
          <div class="reading-status-row">
            <span class="badge">${statusLabel}</span>
            ${targetControl}
          </div>
          <h2 class="reading-heading">${isTarget ? `${targetText} Day ${selected.day}` : `Day ${selected.day}の通読`}</h2>
          <div class="reading-title">${esc(selected.reading)}</div>
          <p class="small">歴史順通読計画の第${selected.day}日です。節範囲が指定された日も、読み進めやすいよう該当章全体を開きます。</p>
          <div class="reading-links">${renderBibleLinks(selected.reading)}</div>
          <div class="actions">
            <button type="button" class="primary" id="doneBtn">${completed ? "未読に戻す" : "読了にする"}</button>
          </div>
          <div class="daynav" aria-label="通読日の移動">
            <button type="button" id="prevBtn" ${selected.day === 1 ? "disabled" : ""}>← Day ${selected.day === 1 ? 1 : previousDay}</button>
            <button type="button" id="nextBtn" ${selected.day === 365 ? "disabled" : ""}>Day ${selected.day === 365 ? 365 : nextReadingDay} →</button>
          </div>
        </div>
        <div class="card spaced-card">
          <h2>Day ${selected.day}のメモ</h2>
          <label class="sr-only" for="noteArea">Day ${selected.day}のメモ</label>
          <textarea id="noteArea" placeholder="気づいたこと、疑問、祈りなど…">${esc(state.notes[selected.day] || "")}</textarea>
          <div class="small">入力内容はこのブラウザ内に自動保存されます。</div>
        </div>
      </div>
      <div>
        <div class="card">
          <h3>現在地</h3>
          <span class="badge">${esc(selected.era)}</span>
          <p>${esc(selected.theme)}</p>
        </div>
        <div class="card spaced-card">
          <h3>進捗</h3>
          <div class="stats">
            <div class="stat"><strong>${doneCount()}</strong><span>読了日</span></div>
            <div class="stat"><strong>${pct()}%</strong><span>全体</span></div>
            <div class="stat"><strong>${progressNext}</strong><span>次のDay</span></div>
            <div class="stat"><strong>${scheduledDay()}</strong><span>予定Day</span></div>
          </div>
        </div>
      </div>
    </div>`;

  const doneButton = todayRoot.querySelector("#doneBtn");
  const previousButton = todayRoot.querySelector("#prevBtn");
  const nextButton = todayRoot.querySelector("#nextBtn");
  const targetButton = todayRoot.querySelector("#targetDayBtn");
  const noteArea = todayRoot.querySelector("#noteArea");

  doneButton.addEventListener("click", () => {
    const previousRecord = getCompletion(selected.day);
    if (completed) markUnread(selected.day);
    else markCompleted(selected.day);
    const nextRecord = getCompletion(selected.day);
    save();
    renderToday();
    registerCompletionUndo(
      selected.day,
      previousRecord,
      nextRecord,
      completed
        ? `Day ${selected.day}を未読に戻しました`
        : `Day ${selected.day}を読了にしました`,
    );
  });

  previousButton.addEventListener("click", () => {
    if (selected.day === 1) return;
    state.selectedDay = previousDay;
    save();
    renderToday();
  });

  nextButton.addEventListener("click", () => {
    if (selected.day === 365) return;
    state.selectedDay = nextReadingDay;
    save();
    renderToday();
  });

  if (targetButton) {
    targetButton.addEventListener("click", () => {
      state.selectedDay = target;
      save();
      renderToday();
    });
  }

  todayRoot.querySelectorAll("[data-bible-book]").forEach((button) => {
    button.addEventListener("click", () => {
      openBibleChapter(button.dataset.bibleBook, Number(button.dataset.bibleChapter));
    });
  });

  let noteTimer;
  noteArea.addEventListener("input", (event) => {
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => {
      state.notes[selected.day] = event.target.value;
      save();
    }, 500);
  });
}

function renderPlan() {
  const planRoot = document.getElementById("plan");
  planRoot.innerHTML = `
    <div class="card">
      <h2>365日通読表</h2>
      <div class="toolbar">
        <label class="sr-only" for="searchPlan">書巻・箇所を検索</label>
        <input id="searchPlan" type="search" placeholder="書巻・箇所を検索">
        <label class="sr-only" for="statusFilter">読了状態で絞り込む</label>
        <select id="statusFilter">
          <option value="all">すべて</option>
          <option value="done">読了済み</option>
          <option value="unread">未読</option>
        </select>
      </div>
      <div class="plan-grid" id="planGrid"></div>
    </div>`;

  const searchInput = planRoot.querySelector("#searchPlan");
  const statusFilter = planRoot.querySelector("#statusFilter");
  const planGrid = planRoot.querySelector("#planGrid");

  function drawPlan() {
    const query = searchInput.value.trim();
    const filter = statusFilter.value;
    const target = targetDay();
    const days = PLAN.filter((day) => {
      const queryMatches =
        !query || day.reading.includes(query) || day.era.includes(query);
      const completed = isCompleted(day.day);
      const statusMatches =
        filter === "all" ||
        (filter === "done" && completed) ||
        (filter === "unread" && !completed);
      return queryMatches && statusMatches;
    });

    planGrid.innerHTML = days.length
      ? days
          .map((day) => {
            const completed = isCompleted(day.day);
            return `<button type="button" class="daycell ${completed ? "done" : ""} ${day.day === target ? "target" : ""}" data-day="${day.day}" aria-label="Day ${day.day} ${esc(day.reading)}${completed ? " 読了済み" : ""}">
              <span class="num">Day ${day.day}</span>
              ${completed ? '<span class="check" aria-hidden="true">✓</span>' : ""}
              <div class="txt">${esc(day.reading)}</div>
            </button>`;
          })
          .join("")
      : '<div class="empty">該当する日がありません。</div>';

    planGrid.querySelectorAll("[data-day]").forEach((button) => {
      button.addEventListener("click", () => {
        state.selectedDay = Number(button.dataset.day);
        save();
        showView("today");
      });
    });
  }

  drawPlan();
  searchInput.addEventListener("input", drawPlan);
  statusFilter.addEventListener("change", drawPlan);
}

function renderHistory() {
  const historyRoot = document.getElementById("history");
  const selected = dayData(state.selectedDay || targetDay());
  const currentEra = ERAS.find((era) => era.name === selected.era);
  const eraProgress = currentEra
    ? Math.round(
        ((selected.day - currentEra.start + 1) /
          (currentEra.end - currentEra.start + 1)) *
          100,
      )
    : 0;

  historyRoot.innerHTML = `
    <div class="hero">
      <div class="kicker">BIBLE HISTORY · DAY ${selected.day}</div>
      <h1>${esc(selected.era)}</h1>
      <p>${esc(selected.theme)}</p>
      <div class="progressbar" aria-label="この時代区分の進捗 ${eraProgress}%"><span style="width:${eraProgress}%"></span></div>
    </div>
    <div class="card spaced-card">
      <h2>聖書史タイムライン</h2>
      <p class="small">現在選択中：Day ${selected.day}「${esc(selected.reading)}」／この時代区分の進行 ${eraProgress}%</p>
      <div class="timeline">
        ${ERAS.map(
          (era) => `<div class="era ${era.name === selected.era ? "active" : ""}">
            <h3>${esc(era.name)}</h3>
            <div>${esc(era.theme)}</div>
            <div class="small">Day ${era.start}～${era.end}</div>
          </div>`,
        ).join("")}
      </div>
    </div>`;
}

function renderNotes() {
  const notesRoot = document.getElementById("notes");
  const items = Object.entries(state.notes)
    .filter(([, value]) => value.trim())
    .sort((a, b) => Number(b[0]) - Number(a[0]));

  notesRoot.innerHTML = `
    <div class="card">
      <h2>通読記録</h2>
      <div class="toolbar">
        <label class="sr-only" for="noteSearch">メモを検索</label>
        <input id="noteSearch" type="search" placeholder="メモを検索">
      </div>
      <div id="notesList"></div>
    </div>`;

  const noteSearch = notesRoot.querySelector("#noteSearch");
  const notesList = notesRoot.querySelector("#notesList");

  function drawNotes(filteredItems) {
    notesList.innerHTML = filteredItems.length
      ? filteredItems
          .map(
            ([day, value]) => `<div class="noteitem">
              <span class="badge">Day ${day}</span>
              <h3>${esc(dayData(Number(day)).reading)}</h3>
              <p>${esc(value).replace(/\n/g, "<br>")}</p>
              <button type="button" class="secondary" data-open-note="${day}">開く</button>
            </div>`,
          )
          .join("")
      : '<div class="empty">まだメモはありません。</div>';

    notesList.querySelectorAll("[data-open-note]").forEach((button) => {
      button.addEventListener("click", () => {
        state.selectedDay = Number(button.dataset.openNote);
        save();
        showView("today");
      });
    });
  }

  drawNotes(items);
  noteSearch.addEventListener("input", (event) => {
    const query = event.target.value;
    drawNotes(
      items.filter(
        ([day, value]) =>
          value.includes(query) || dayData(Number(day)).reading.includes(query),
      ),
    );
  });
}

function renderSettings() {
  const settingsRoot = document.getElementById("settings");
  const rollbackButton = hasPreImportState()
    ? '<button type="button" class="secondary" id="rollbackBtn">復元前の状態に戻す</button>'
    : "";

  settingsRoot.innerHTML = `
    <div class="card">
      <h2>設定</h2>
      <div class="settings-grid">
        <div class="field">
          <label for="startDate">通読開始日</label>
          <input type="date" id="startDate" value="${state.settings.startDate}">
        </div>
        <div class="field">
          <label for="mode">進行モード</label>
          <select id="mode">
            <option value="pace" ${state.settings.mode === "pace" ? "selected" : ""}>自分のペース</option>
            <option value="calendar" ${state.settings.mode === "calendar" ? "selected" : ""}>カレンダー</option>
          </select>
        </div>
        <div class="field">
          <label for="theme">表示テーマ</label>
          <select id="theme">
            <option value="system" ${state.settings.theme === "system" ? "selected" : ""}>端末設定</option>
            <option value="light" ${state.settings.theme === "light" ? "selected" : ""}>ライト</option>
            <option value="dark" ${state.settings.theme === "dark" ? "selected" : ""}>ダーク</option>
          </select>
        </div>
        <div class="field">
          <div class="field-label-row">
            <label for="fontSize">文字サイズ</label>
            <output id="fontSizeValue" for="fontSize">${state.settings.fontSize}px</output>
          </div>
          <input type="range" id="fontSize" min="14" max="20" value="${state.settings.fontSize}">
        </div>
      </div>
      <div class="actions">
        <button type="button" class="primary" id="saveSettings">設定を保存</button>
        <button type="button" class="secondary" id="exportBtn">バックアップ</button>
        <label class="secondary file-button">復元
          <input type="file" id="importFile" class="sr-only-input" accept="application/json">
        </label>
        ${rollbackButton}
        <button type="button" class="danger" id="resetBtn">全データ初期化</button>
      </div>
      <p class="small">記録はこのブラウザ内に保存されます。定期的にバックアップしてください。復元を実行すると、直前の状態へ一度戻せます。<br>v1.3.0：読了日時の記録、読了操作のUndo、復元時の安全性を改善しました。</p>
    </div>`;

  const startDateInput = settingsRoot.querySelector("#startDate");
  const modeSelect = settingsRoot.querySelector("#mode");
  const themeSelect = settingsRoot.querySelector("#theme");
  const fontSizeInput = settingsRoot.querySelector("#fontSize");
  const fontSizeValue = settingsRoot.querySelector("#fontSizeValue");
  const saveSettingsButton = settingsRoot.querySelector("#saveSettings");
  const exportButton = settingsRoot.querySelector("#exportBtn");
  const importFile = settingsRoot.querySelector("#importFile");
  const rollback = settingsRoot.querySelector("#rollbackBtn");
  const resetButton = settingsRoot.querySelector("#resetBtn");

  fontSizeInput.addEventListener("input", () => {
    fontSizeValue.textContent = `${fontSizeInput.value}px`;
  });

  saveSettingsButton.addEventListener("click", () => {
    state.settings.startDate = startDateInput.value;
    state.settings.mode = modeSelect.value;
    state.settings.theme = themeSelect.value;
    state.settings.fontSize = Number(fontSizeInput.value);
    save();
    applyTheme();
    toast("設定を保存しました");
  });

  exportButton.addEventListener("click", exportData);
  importFile.addEventListener("change", importData);

  if (rollback) {
    rollback.addEventListener("click", () => {
      if (
        !window.confirm(
          "復元前の状態に戻しますか？現在の状態と復元前の状態を入れ替えます。",
        )
      ) {
        return;
      }
      if (swapPreImportState()) {
        applyTheme();
        render("settings");
        toast("復元前の状態に戻しました");
      } else {
        window.alert("復元前の状態を読み込めませんでした。");
        renderSettings();
      }
    });
  }

  resetButton.addEventListener("click", () => {
    if (!window.confirm("進捗・メモ・設定をすべて削除しますか？")) return;
    resetAllData();
    applyTheme();
    render("settings");
    toast("初期化しました");
  });
}

function importData(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    try {
      const importedState = parseBackup(reader.result);
      applyImportedState(importedState);
      applyTheme();
      render("settings");
      toast("バックアップを復元しました");
    } catch (error) {
      if (error.message === "future-version") {
        window.alert(
          "このバックアップは新しいバージョンのアプリで作成された可能性があります。アプリを更新してから再度お試しください。",
        );
      } else {
        window.alert("このアプリのバックアップファイルを読み込めませんでした。");
      }
    } finally {
      event.target.value = "";
    }
  });
  reader.readAsText(file);
}

const themeButton = document.getElementById("themeBtn");
themeButton.addEventListener("click", () => {
  state.settings.theme =
    document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  save();
  applyTheme();
  if (activeView === "settings") renderSettings();
});

applyTheme();
render("today");
