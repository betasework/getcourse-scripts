(function () {
  "use strict";

  if (!/\/teach\/control\/stream\/stat\/id\//.test(location.pathname)) return;

  const APP_ID = "gc-stat-upgrade";
  const ROOT_ID = `${APP_ID}-root`;
  const STYLE_ID = `${APP_ID}-style`;
  const INTERNAL_TABLE_ID = `${APP_ID}-internal-table`;
  const STATE_KEY = "__gcStatUpgradeState";

  // Убиваем предыдущий инстанс (если bookmarklet нажали еще раз)
  try {
    if (window[STATE_KEY] && typeof window[STATE_KEY].destroy === "function") {
      window[STATE_KEY].destroy();
    }
  } catch (_) {}

  const state = {
    observer: null,
    timer: null,
    initializedForTable: null
  };
  window[STATE_KEY] = state;

  function destroy() {
    if (state.observer) {
      state.observer.disconnect();
      state.observer = null;
    }
    if (state.timer) {
      clearInterval(state.timer);
      state.timer = null;
    }
    const oldRoot = document.getElementById(ROOT_ID);
    if (oldRoot) oldRoot.remove();
  }
  state.destroy = destroy;

  function init() {
    injectStyles();
    tryRender();

    state.observer = new MutationObserver(() => {
      if (state.initializedForTable) return;
      tryRender();
    });
    state.observer.observe(document.body, { childList: true, subtree: true });

    let attempts = 0;
    state.timer = setInterval(() => {
      attempts += 1;
      if (state.initializedForTable || attempts > 40) {
        clearInterval(state.timer);
        state.timer = null;
        return;
      }
      tryRender();
    }, 250);
  }

  function tryRender() {
    const sourceTable = findStatsTable();
    if (!sourceTable) return;

    const model = buildTableModel(sourceTable);
    if (!model.rows.length) return;

    renderRoot(sourceTable, model);
    bindRoot(model);

    sourceTable.style.display = "none";
    state.initializedForTable = sourceTable;

    if (state.observer) {
      state.observer.disconnect();
      state.observer = null;
    }
    if (state.timer) {
      clearInterval(state.timer);
      state.timer = null;
    }
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${ROOT_ID}{margin:16px 0 24px;font-family:Arial,sans-serif;color:#1b2a4a}
      #${ROOT_ID} *{box-sizing:border-box}
      #${ROOT_ID} .wrap{background:#f6f7fb;border:1px solid #e4e7ef;border-radius:14px;padding:16px}
      #${ROOT_ID} .kpi{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:14px}
      #${ROOT_ID} .card{background:#fff;border:1px solid #e6e9f1;border-radius:10px;padding:10px 12px}
      #${ROOT_ID} .label{font-size:12px;color:#5a6783;margin-bottom:4px}
      #${ROOT_ID} .val{font-size:24px;font-weight:700;line-height:1}
      #${ROOT_ID} .chart{background:#fff;border:1px solid #e6e9f1;border-radius:10px;padding:10px;margin-bottom:14px}
      #${ROOT_ID} svg{width:100%;height:auto;display:block}
      #${ROOT_ID} .head{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:8px}
      #${ROOT_ID} .btn{border:1px solid #d3d8e5;background:#fff;border-radius:999px;padding:8px 12px;cursor:pointer;font-size:12px}
      #${ROOT_ID} table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #e6e9f1;border-radius:10px;overflow:hidden}
      #${ROOT_ID} th,#${ROOT_ID} td{padding:10px;border-bottom:1px solid #edf0f6;text-align:left;font-size:13px}
      #${ROOT_ID} th{font-size:11px;text-transform:uppercase;color:#5a6783;letter-spacing:.04em}
      #${ROOT_ID} .good{color:#157f55;font-weight:700}
      #${ROOT_ID} .warn{color:#b86b00;font-weight:700}
      #${ROOT_ID} .bad{color:#c44536;font-weight:700}
      @media (max-width:900px){#${ROOT_ID} .kpi{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media (max-width:560px){#${ROOT_ID} .kpi{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function findStatsTable() {
    const tables = Array.from(document.querySelectorAll("table"));

    // Приоритет: нативная таблица GetCourse
    const native = tables.find((table) => {
      if (table.id === INTERNAL_TABLE_ID) return false;
      if (table.closest(`#${ROOT_ID}`)) return false;
      return table.classList.contains("lessons-table");
    });
    if (native) return native;

    // Фолбэк: по заголовкам, но исключая наши таблицы
    return tables.find((table) => {
      if (table.id === INTERNAL_TABLE_ID) return false;
      if (table.closest(`#${ROOT_ID}`)) return false;
      const headerRow = table.querySelector("thead tr");
      if (!headerRow) return false;
      const headers = getHeaderColumns(headerRow).map((c) => normalizeText(c.text));
      return headers.includes("урок") && headers.includes("зашли") && headers.includes("ответили");
    }) || null;
  }

  function getHeaderColumns(headerRow) {
    const cols = [];
    let colIndex = 0;
    Array.from(headerRow.cells).forEach((cell) => {
      const text = normalizeSpace(cell.textContent);
      const span = Math.max(1, Number(cell.colSpan) || 1);
      cols.push({ text, index: colIndex, span });
      colIndex += span;
    });
    return cols;
  }

  function buildTableModel(table) {
    const headerRow = table.querySelector("thead tr");
    const headerCols = getHeaderColumns(headerRow);

    const indexes = {
      status: indexOfHeader(headerCols, "статус"),
      entered: indexOfHeader(headerCols, "зашли"),
      answered: indexOfHeader(headerCols, "ответили"),
      passed: indexOfHeader(headerCols, "прошли")
    };

    const bodyRows = Array.from(table.querySelectorAll("tr")).filter((tr) => !tr.closest("thead"));
    const rows = bodyRows.map((row) => parseRow(row, indexes)).filter(Boolean);

    rows.forEach((item, i) => {
      const prev = i > 0 ? rows[i - 1] : null;
      item.delta = prev ? item.entered - prev.entered : null;
      item.deltaPct = prev && prev.entered ? Math.round((item.delta / prev.entered) * 100) : null;
      item.answerRate = item.answered !== null && item.entered ? Math.round((item.answered / item.entered) * 100) : null;
    });

    const first = rows[0] || null;
    const last = rows[rows.length - 1] || null;
    const completionRate = first && last && first.entered ? Math.round((last.entered / first.entered) * 100) : 0;

    return { rows, first, last, completionRate };
  }

  function parseRow(row, indexes) {
    const cells = row.cells;
    if (!cells || !cells.length || indexes.entered < 0 || !cells[indexes.entered]) return null;

    const lessonCell =
      row.querySelector("td.main-info") ||
      Array.from(cells).find((c) => c.querySelector("a")) ||
      cells[0];

    const lessonLink = lessonCell ? lessonCell.querySelector("a") : null;
    const title = normalizeSpace(lessonLink ? lessonLink.textContent : lessonCell ? lessonCell.textContent : "");
    if (!title) return null;

    const href = lessonLink ? lessonLink.href : "";
    const status = indexes.status >= 0 && cells[indexes.status] ? normalizeSpace(cells[indexes.status].textContent) : "";
    const entered = readMetricCell(cells[indexes.entered]);
    const answered = indexes.answered >= 0 && cells[indexes.answered] ? readMetricCell(cells[indexes.answered]) : { raw: "", value: null };
    const passed = indexes.passed >= 0 && cells[indexes.passed] ? readMetricCell(cells[indexes.passed]) : { raw: "", value: null };

    if (entered.value === null) return null;

    return {
      title, href, status,
      entered: entered.value,
      answered: answered.value,
      answeredRaw: answered.raw,
      passed: passed.value,
      delta: null,
      deltaPct: null,
      answerRate: null
    };
  }

  function renderRoot(sourceTable, model) {
    let root = document.getElementById(ROOT_ID);
    const parent = sourceTable.parentNode;
    if (!parent) return;

    if (!root) {
      root = document.createElement("section");
      root.id = ROOT_ID;
      const next = sourceTable.nextSibling;
      if (next) parent.insertBefore(root, next);
      else parent.appendChild(root);
    } else {
      // На всякий случай: если root не в том parent, переносим
      if (root.parentNode !== parent) {
        const next = sourceTable.nextSibling;
        if (next) parent.insertBefore(root, next);
        else parent.appendChild(root);
      }
    }

    root.dataset.bound = "0";
    root._model = model;

    const avgAnswer = getAvgAnswerRate(model.rows);

    root.innerHTML = `
      <div class="wrap">
        <div class="kpi">
          <div class="card"><div class="label">Стартовали</div><div class="val">${formatInt(model.first ? model.first.entered : 0)}</div></div>
          <div class="card"><div class="label">Дошли до финала</div><div class="val">${formatInt(model.last ? model.last.entered : 0)}</div></div>
          <div class="card"><div class="label">Дошли до конца, %</div><div class="val">${model.completionRate}%</div></div>
          <div class="card"><div class="label">Средняя конверсия в ответ</div><div class="val">${avgAnswer === null ? "—" : avgAnswer + "%"}</div></div>
        </div>
        <div class="chart">
          <div class="head">
            <strong>Воронка уроков</strong>
            <button type="button" class="btn" data-role="csv">Экспорт CSV</button>
          </div>
          <svg id="${APP_ID}-chart" viewBox="0 0 940 340" aria-label="Воронка уроков"></svg>
        </div>
        <table id="${INTERNAL_TABLE_ID}">
          <thead>
            <tr>
              <th>Урок</th><th>Зашли</th><th>Ответили</th>
              <th>Конверсия</th><th>Потеря к прошлому</th><th>Сигнал</th>
            </tr>
          </thead>
          <tbody>${model.rows.map((row, i) => renderRow(row, i)).join("")}</tbody>
        </table>
      </div>
    `;

    renderChart(model.rows);
  }

  function renderRow(row, index) {
    const signal = getSignal(row);
    const title = row.href ? `<a href="${escapeHtml(row.href)}">${escapeHtml(row.title)}</a>` : escapeHtml(row.title);
    const deltaText = index === 0 || row.delta === null ? "—" : `${row.delta} (${row.deltaPct > 0 ? "+" : ""}${row.deltaPct}%)`;
    const answeredText = row.answered !== null ? formatInt(row.answered) : escapeHtml(row.answeredRaw || "—");
    const convText = row.answerRate === null ? "—" : `${row.answerRate}%`;
    return `<tr>
      <td>${title}</td><td>${formatInt(row.entered)}</td><td>${answeredText}</td>
      <td>${convText}</td><td>${deltaText}</td><td class="${signal.className}">${signal.label}</td>
    </tr>`;
  }

  function renderChart(rows) {
    const svg = document.getElementById(`${APP_ID}-chart`);
    if (!svg || !rows.length) return;

    const width = 940, height = 340;
    const m = { top: 20, right: 20, bottom: 70, left: 50 };
    const iw = width - m.left - m.right;
    const ih = height - m.top - m.bottom;

    const values = rows.flatMap((r) => [r.entered, r.answered].filter((v) => v !== null));
    const yMax = Math.max(10, Math.ceil(Math.max.apply(null, values) / 10) * 10);
    const stepX = rows.length > 1 ? iw / (rows.length - 1) : iw;

    const x = (i) => m.left + i * stepX;
    const y = (v) => m.top + ih - (v / yMax) * ih;

    const path = (key) => {
      let started = false;
      return rows.map((r, i) => {
        const v = r[key];
        if (v === null) { started = false; return ""; }
        const cmd = started ? "L" : "M";
        started = true;
        return `${cmd}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      }).join(" ");
    };

    const ticks = 5;
    const grid = Array.from({ length: ticks + 1 }, (_, i) => Math.round((yMax * i) / ticks))
      .map((v) => `<g>
        <line x1="${m.left}" y1="${y(v)}" x2="${width - m.right}" y2="${y(v)}" stroke="#e6e9f1"/>
        <text x="${m.left - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="#5a6783">${formatInt(v)}</text>
      </g>`).join("");

    const labels = rows.map((r, i) =>
      `<text x="${x(i)}" y="${height - 24}" transform="rotate(-30 ${x(i)} ${height - 24})" font-size="11" fill="#5a6783">${escapeHtml(trimLabel(r.title, 24))}</text>`
    ).join("");

    const pointsEntered = rows.map((r, i) => `<circle cx="${x(i)}" cy="${y(r.entered)}" r="3.8" fill="#2c63ff"></circle>`).join("");
    const pointsAnswered = rows.map((r, i) => r.answered === null ? "" : `<circle cx="${x(i)}" cy="${y(r.answered)}" r="3.8" fill="#ff6a13"></circle>`).join("");

    svg.innerHTML = `
      ${grid}
      <path d="${path("entered")}" fill="none" stroke="#2c63ff" stroke-width="2.5" stroke-linejoin="round"></path>
      <path d="${path("answered")}" fill="none" stroke="#ff6a13" stroke-width="2.5" stroke-linejoin="round"></path>
      ${pointsEntered}${pointsAnswered}${labels}
    `;
  }

  function bindRoot(model) {
    const root = document.getElementById(ROOT_ID);
    if (!root || root.dataset.bound === "1") return;

    root.addEventListener("click", (event) => {
      const btn = event.target.closest('[data-role="csv"]');
      if (!btn) return;
      downloadCsv(root._model || model);
    });

    root.dataset.bound = "1";
  }

  function downloadCsv(model) {
    const rows = [["Урок", "Статус", "Зашли", "Ответили", "Конверсия", "Потеря к прошлому", "Сигнал"]];
    model.rows.forEach((item, i) => {
      const signal = getSignal(item);
      rows.push([
        item.title,
        item.status || "",
        item.entered,
        item.answered !== null ? item.answered : item.answeredRaw || "",
        item.answerRate === null ? "—" : `${item.answerRate}%`,
        i === 0 || item.delta === null ? "—" : `${item.delta} (${item.deltaPct > 0 ? "+" : ""}${item.deltaPct}%)`,
        signal.label
      ]);
    });

    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const link = document.createElement("a");
    link.href = `data:text/csv;charset=utf-8,\uFEFF${encodeURIComponent(csv)}`;
    link.download = `lesson_stat_${toIsoDate(new Date())}.csv`;
    link.click();
  }

  function getSignal(row) {
    if (row.answered === null) return { className: "warn", label: "Нет задания" };
    if (row.delta !== null && row.delta <= -20) return { className: "bad", label: "Провал перехода" };
    if (row.delta !== null && row.delta <= -10) return { className: "warn", label: "Наблюдать" };
    if (row.answerRate !== null && row.answerRate < 60) return { className: "warn", label: "Низкая вовлеченность" };
    return { className: "good", label: "Стабильно" };
  }

  function getAvgAnswerRate(rows) {
    const vals = rows.map((r) => r.answerRate).filter((v) => v !== null);
    if (!vals.length) return null;
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  }

  function indexOfHeader(columns, title) {
    const idx = columns.find((c) => normalizeText(c.text) === title);
    return idx ? idx.index : -1;
  }

  function readMetricCell(cell) {
    const raw = normalizeSpace(cell ? cell.textContent : "");
    if (!raw) return { raw: "", value: null };
    if (!/\d/.test(raw)) return { raw, value: null };
    return { raw, value: parseNumber(raw) };
  }

  function parseNumber(value) {
    const cleaned = String(value || "").replace(/[^\d-]/g, "");
    return cleaned ? Number(cleaned) : 0;
  }

  function normalizeText(v) { return normalizeSpace(v).toLowerCase(); }
  function normalizeSpace(v) { return String(v || "").replace(/\s+/g, " ").trim(); }
  function trimLabel(text, max) { const t = normalizeSpace(text); return t.length <= max ? t : `${t.slice(0, max - 1)}…`; }
  function formatInt(v) { return Number(v || 0).toLocaleString("ru-RU"); }
  function toIsoDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }
  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  init();
})();
