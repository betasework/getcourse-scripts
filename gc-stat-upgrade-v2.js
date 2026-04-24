(function () {
  "use strict";

  if (!/\/teach\/control\/stream\/stat\/id\//.test(location.pathname)) return;

  const APP_ID = "gc-stat-upgrade";
  const ROOT_ID = `${APP_ID}-root`;
  const STYLE_ID = `${APP_ID}-style`;
  const INTERNAL_TABLE_ID = `${APP_ID}-internal-table`;
  const STATE_KEY = "__gcStatUpgradeState";

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
    const root = document.getElementById(ROOT_ID);
    if (root) root.remove();
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
    renderChart(model);
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
      #${ROOT_ID}{
        --bg:#f5f2ea;
        --panel:rgba(255,252,246,.92);
        --panelStrong:#fffdf8;
        --ink:#11224f;
        --muted:#5f6780;
        --line:rgba(17,34,79,.12);
        --blue:#2c63ff;
        --orange:#ff6a13;
        --green:#157f55;
        --rose:#c44536;
        --amber:#b86b00;
        --shadow:0 22px 60px rgba(17,34,79,.08);
        margin:14px 0 26px;
        color:var(--ink);
        font-family:"Avenir Next","Segoe UI",Arial,sans-serif;
      }

      #${ROOT_ID} *,
      #${ROOT_ID} *::before,
      #${ROOT_ID} *::after { box-sizing:border-box; }

      #${ROOT_ID} h1,#${ROOT_ID} h2,#${ROOT_ID} h3,#${ROOT_ID} p { margin:0; }

      #${ROOT_ID} .page{
        background:
          radial-gradient(circle at top left, rgba(44,99,255,.14), transparent 32%),
          radial-gradient(circle at 85% 12%, rgba(255,106,19,.13), transparent 24%),
          linear-gradient(180deg,#fbf8f1 0%, var(--bg) 100%);
        border-radius:24px;
        padding:14px;
      }

      #${ROOT_ID} .panel{
        background:var(--panel);
        border:1px solid rgba(255,255,255,.8);
        border-radius:20px;
        box-shadow:var(--shadow);
        backdrop-filter:blur(10px);
      }

      #${ROOT_ID} .hero{
        display:grid;
        grid-template-columns:1.4fr .95fr;
        gap:16px;
        margin-bottom:16px;
      }

      #${ROOT_ID} .hero-main{padding:24px;}
      #${ROOT_ID} .eyebrow{
        display:inline-flex;
        align-items:center;
        gap:8px;
        padding:6px 10px;
        border-radius:999px;
        background:rgba(17,34,79,.06);
        color:var(--muted);
        font-size:12px;
        text-transform:uppercase;
        letter-spacing:.04em;
      }

      #${ROOT_ID} .hero-title{
        margin-top:14px;
        font-size:clamp(30px,4vw,54px);
        line-height:.95;
        letter-spacing:-.04em;
      }

      #${ROOT_ID} .hero-copy{
        margin-top:12px;
        color:var(--muted);
        font-size:16px;
        line-height:1.5;
        max-width:760px;
      }

      #${ROOT_ID} .hero-side{
        padding:20px;
        display:grid;
        gap:14px;
        background:linear-gradient(180deg,rgba(17,34,79,.98),rgba(25,48,105,.98));
        color:#f8f6f2;
      }

      #${ROOT_ID} .side-title{
        font-size:12px;
        text-transform:uppercase;
        letter-spacing:.1em;
        color:rgba(255,255,255,.72);
      }

      #${ROOT_ID} .side-value{
        font-size:clamp(38px,4vw,64px);
        line-height:.92;
        font-weight:700;
        letter-spacing:-.04em;
      }

      #${ROOT_ID} .side-copy{
        color:rgba(255,255,255,.78);
        font-size:14px;
        line-height:1.45;
      }

      #${ROOT_ID} .hero-grid{
        display:grid;
        grid-template-columns:repeat(2,minmax(0,1fr));
        gap:10px;
      }

      #${ROOT_ID} .hero-mini{
        padding:10px 12px;
        border-radius:12px;
        background:rgba(255,255,255,.08);
        border:1px solid rgba(255,255,255,.08);
      }

      #${ROOT_ID} .hero-mini strong{
        display:block;
        font-size:20px;
        letter-spacing:-.02em;
      }

      #${ROOT_ID} .hero-mini span{
        display:block;
        margin-top:4px;
        font-size:12px;
        color:rgba(255,255,255,.72);
        line-height:1.35;
      }

      #${ROOT_ID} .hero-insights{
        display:grid;
        gap:8px;
      }

      #${ROOT_ID} .hero-insight-title{
        font-size:13px;
        line-height:1.25;
      }

      #${ROOT_ID} .metrics{
        display:grid;
        grid-template-columns:repeat(4,minmax(0,1fr));
        gap:12px;
        margin-bottom:16px;
      }

      #${ROOT_ID} .metric{ padding:14px 16px; }
      #${ROOT_ID} .metric-label{ font-size:12px; color:var(--muted); margin-bottom:8px; }
      #${ROOT_ID} .metric-value{ font-size:30px; line-height:.95; letter-spacing:-.03em; font-weight:700; }
      #${ROOT_ID} .metric-note{ margin-top:8px; color:var(--muted); font-size:12px; line-height:1.4; }

      #${ROOT_ID} .layout{
        display:grid;
        grid-template-columns:1fr;
        gap:16px;
        margin-bottom:16px;
      }

      #${ROOT_ID} .chart-card { padding:16px; }

      #${ROOT_ID} .card-head{
        display:flex;
        justify-content:space-between;
        align-items:flex-start;
        gap:10px;
        margin-bottom:10px;
      }

      #${ROOT_ID} .card-title{ font-size:24px; letter-spacing:-.03em; line-height:1; }
      #${ROOT_ID} .card-subtitle{ margin-top:8px; color:var(--muted); font-size:13px; line-height:1.45; }

      #${ROOT_ID} .legend{ display:flex; gap:14px; flex-wrap:wrap; color:var(--muted); font-size:12px; }
      #${ROOT_ID} .legend span{ display:inline-flex; align-items:center; gap:6px; }
      #${ROOT_ID} .swatch{ width:10px; height:10px; border-radius:50%; display:inline-block; }

      #${ROOT_ID} .chart-wrap{
        border-radius:14px;
        padding:10px 10px 0;
        background:linear-gradient(180deg,rgba(17,34,79,.03),rgba(17,34,79,0));
        border:1px solid rgba(17,34,79,.06);
      }

      #${ROOT_ID} svg{ width:100%; height:auto; display:block; }

      #${ROOT_ID} .table-card{ padding:16px; }
      #${ROOT_ID} table{ width:100%; border-collapse:collapse; }
      #${ROOT_ID} th,#${ROOT_ID} td{
        padding:10px;
        text-align:left;
        border-bottom:1px solid rgba(17,34,79,.08);
        vertical-align:top;
        font-size:13px;
      }

      #${ROOT_ID} th{
        font-size:11px;
        text-transform:uppercase;
        letter-spacing:.05em;
        color:var(--muted);
      }

      #${ROOT_ID} .lesson-link{ color:#185fa5; text-decoration:none; }
      #${ROOT_ID} .lesson-link:hover{ text-decoration:underline; }
      #${ROOT_ID} .small{ display:block; margin-top:5px; font-size:11px; color:var(--muted); line-height:1.35; }

      #${ROOT_ID} .badge{
        display:inline-flex;
        align-items:center;
        padding:4px 8px;
        border-radius:999px;
        font-size:11px;
        font-weight:700;
      }

      #${ROOT_ID} .good{ background:rgba(21,127,85,.12); color:var(--green); }
      #${ROOT_ID} .warn{ background:rgba(184,107,0,.12); color:var(--amber); }
      #${ROOT_ID} .bad{ background:rgba(196,69,54,.12); color:var(--rose); }
      #${ROOT_ID} .muted{ color:var(--muted); }

      #${ROOT_ID} .btn{
        appearance:none;
        border:1px solid rgba(17,34,79,.1);
        border-radius:999px;
        background:#fff;
        color:var(--ink);
        padding:8px 12px;
        cursor:pointer;
        font-size:12px;
      }

      @media (max-width:1120px){
        #${ROOT_ID} .hero { grid-template-columns:1fr; }
        #${ROOT_ID} .metrics { grid-template-columns:repeat(2,minmax(0,1fr)); }
      }

      @media (max-width:720px){
        #${ROOT_ID} .page { padding:10px; }
        #${ROOT_ID} .hero-main,
        #${ROOT_ID} .hero-side,
        #${ROOT_ID} .chart-card,
        #${ROOT_ID} .table-card,
        #${ROOT_ID} .metric { padding:14px; }

        #${ROOT_ID} .hero-grid,
        #${ROOT_ID} .metrics { grid-template-columns:1fr; }
      }
    `;
    document.head.appendChild(style);
  }

  function findStatsTable() {
    const tables = Array.from(document.querySelectorAll("table"));

    const native = tables.find((table) => {
      if (table.id === INTERNAL_TABLE_ID) return false;
      if (table.closest(`#${ROOT_ID}`)) return false;
      return table.classList.contains("lessons-table");
    });
    if (native) return native;

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
      item.passedRate = item.passed !== null && item.entered ? Math.round((item.passed / item.entered) * 100) : null;
      item.answerGap = item.answered !== null ? item.entered - item.answered : null;
      item.passedGap = item.passed !== null ? item.entered - item.passed : null;
    });

    const first = rows[0] || null;
    const last = rows.length ? rows[rows.length - 1] : null;

    const answerRows = rows.filter((r) => r.answerRate !== null);
    const totalAnswerRate = answerRows.length
      ? Math.round(answerRows.reduce((acc, r) => acc + r.answerRate, 0) / answerRows.length)
      : null;

    const largestDrop = rows.reduce((acc, item, i) => {
      if (i === 0 || item.delta === null || item.delta >= acc.value) return acc;
      return {
        value: item.delta,
        index: i,
        fromTitle: rows[i - 1].title,
        title: item.title
      };
    }, { value: 0, index: 0, fromTitle: "", title: "" });

    const completionRate = first && last && first.entered
      ? Math.round((last.entered / first.entered) * 100)
      : 0;

    const startAnswerRate = first && first.answerRate !== null ? first.answerRate : null;
    const finalAnswerRate = last && last.answerRate !== null ? last.answerRate : null;

    const averageLessonShare = first && first.entered
      ? Math.round((rows.reduce((sum, r) => sum + r.entered, 0) / rows.length / first.entered) * 100)
      : 0;

    return {
      rows,
      first,
      last,
      completionRate,
      totalAnswerRate,
      startAnswerRate,
      finalAnswerRate,
      averageLessonShare,
      largestDrop
    };
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
    const enteredMetric = readMetricCell(cells[indexes.entered]);
    const answeredMetric = indexes.answered >= 0 && cells[indexes.answered] ? readMetricCell(cells[indexes.answered]) : emptyMetric();
    const passedMetric = indexes.passed >= 0 && cells[indexes.passed] ? readMetricCell(cells[indexes.passed]) : emptyMetric();

    if (enteredMetric.value === null) return null;

    return {
      title,
      href,
      status,
      entered: enteredMetric.value,
      answered: answeredMetric.value,
      answeredRaw: answeredMetric.raw,
      passed: passedMetric.value,
      passedRaw: passedMetric.raw,
      delta: null,
      deltaPct: null,
      answerRate: null,
      passedRate: null,
      answerGap: null,
      passedGap: null
    };
  }

  function buildTopInsights(model) {
    const items = [];

    if (model.largestDrop.value < 0) {
      items.push({
        title: "Провал в связке уроков",
        text: `Максимальная просадка ${formatInt(Math.abs(model.largestDrop.value))} чел. между «${trimLabel(model.largestDrop.fromTitle, 36)}» и «${trimLabel(model.largestDrop.title, 36)}».`
      });
    }

    const lowAnswer = model.rows
      .filter((r) => r.answerRate !== null && r.answerRate < 70)
      .sort((a, b) => a.answerRate - b.answerRate)
      .slice(0, 2);

    if (lowAnswer.length) {
      items.push({
        title: "Низкая вовлеченность в задания",
        text: lowAnswer.map((r) => `«${trimLabel(r.title, 32)}» (${r.answerRate}%)`).join(", ")
      });
    }

    return items;
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
    } else if (root.parentNode !== parent) {
      const next = sourceTable.nextSibling;
      if (next) parent.insertBefore(root, next);
      else parent.appendChild(root);
    }

    root.dataset.bound = "0";
    root._model = model;

    const metricItems = buildMetricItems(model);
    const topInsights = buildTopInsights(model);

    root.innerHTML = `
      <div class="page">
        <section class="hero">
          <article class="panel hero-main">
            <span class="eyebrow">GetCourse / Statistics Upgrade</span>
            <h1 class="hero-title">Статистика, которая сразу показывает, где курс теряет людей</h1>
            <p class="hero-copy">
              Вместо одной линии и сухой таблицы дашборд дает обзор воронки, диагностику уроков
              и точки действия для куратора.
            </p>
          </article>

          <aside class="panel hero-side">
            <p class="side-title">Ключевой вывод</p>
            <div>
              <div class="side-value">${model.completionRate}%</div>
              <p class="side-copy">До последнего урока дошли ${formatInt(model.last ? model.last.entered : 0)} из ${formatInt(model.first ? model.first.entered : 0)} стартовавших.</p>
            </div>
            <div class="hero-grid">
              <div class="hero-mini"><strong>${model.largestDrop.value ? formatInt(Math.abs(model.largestDrop.value)) : "0"}</strong><span>максимальная потеря между соседними уроками</span></div>
              <div class="hero-mini"><strong>${model.totalAnswerRate === null ? "—" : `${model.totalAnswerRate}%`}</strong><span>средняя конверсия в ответ</span></div>
              <div class="hero-mini"><strong>${model.startAnswerRate === null ? "—" : `${model.startAnswerRate}%`}</strong><span>ответили на старте</span></div>
              <div class="hero-mini"><strong>${model.finalAnswerRate === null ? "—" : `${model.finalAnswerRate}%`}</strong><span>ответили в финале</span></div>
            </div>

            ${topInsights.length ? `
              <div class="hero-insights">
                ${topInsights.map((it) => `
                  <div class="hero-mini">
                    <strong class="hero-insight-title">${escapeHtml(it.title)}</strong>
                    <span>${escapeHtml(it.text)}</span>
                  </div>
                `).join("")}
              </div>
            ` : ""}
          </aside>
        </section>

        <section class="metrics">
          ${metricItems.map(renderMetricCard).join("")}
        </section>

        <section class="layout">
          <article class="panel chart-card">
            <div class="card-head">
              <div>
                <h2 class="card-title">Воронка уроков</h2>
                <p class="card-subtitle">Подсветка отмечает переходы с наибольшей просадкой.</p>
              </div>
              <div>
                <button type="button" class="btn" data-role="csv">Экспорт CSV</button>
              </div>
            </div>
            <div class="legend">
              <span><i class="swatch" style="background:var(--blue)"></i>Зашли</span>
              ${model.rows.some((r) => r.answered !== null) ? '<span><i class="swatch" style="background:var(--orange)"></i>Ответили</span>' : ""}
            </div>
            <div class="chart-wrap">
              <svg id="${APP_ID}-chart" viewBox="0 0 980 430" aria-label="Воронка уроков"></svg>
            </div>
          </article>
        </section>

        <section class="panel table-card">
          <table id="${INTERNAL_TABLE_ID}">
            <thead>
              <tr>
                <th>Урок</th>
                <th>Зашли</th>
                <th>Ответили</th>
                <th>Не ответили</th>
                <th>Конверсия ответа</th>
                <th>Потеря к прошлому</th>
                <th>Сигнал</th>
              </tr>
            </thead>
            <tbody>
              ${model.rows.map((row, i) => renderLessonRow(row, i)).join("")}
            </tbody>
          </table>
        </section>
      </div>
    `;
  }

  function buildMetricItems(model) {
    const first = model.first ? model.first.entered : 0;
    const last = model.last ? model.last.entered : 0;
    const lost = Math.max(0, first - last);
    const largestDropText = model.largestDrop.value
      ? `${formatInt(Math.abs(model.largestDrop.value))} чел.`
      : "0 чел.";

    return [
      { label: "Стартовали", value: formatInt(first), note: "Базовая аудитория, от которой считаем реальную воронку." },
      { label: "Дошли до финала", value: formatInt(last), note: `${model.completionRate}% от первого урока.` },
      { label: "Потеря по пути", value: formatInt(lost), note: "Разница между стартом и финалом." },
      { label: "Самая слабая связка", value: largestDropText, note: model.largestDrop.value ? "Переход с максимальной просадкой внимания." : "Резкой просадки не обнаружено." }
    ];
  }

  function renderMetricCard(item) {
    return `<article class="panel metric"><p class="metric-label">${item.label}</p><h3 class="metric-value">${item.value}</h3><p class="metric-note">${item.note}</p></article>`;
  }

  function renderLessonRow(row, index) {
    const signal = getSignal(row);
    const lessonLabel = row.href ? `<a class="lesson-link" href="${escapeHtml(row.href)}">${escapeHtml(row.title)}</a>` : escapeHtml(row.title);
    const answeredDisplay = row.answered !== null ? formatInt(row.answered) : escapeHtml(row.answeredRaw || "—");
    const notAnsweredDisplay = row.answerGap !== null ? formatInt(row.answerGap) : "—";
    const conversionDisplay = row.answerRate === null ? "—" : `${row.answerRate}%`;
    const diffDisplay = index === 0 || row.delta === null ? "—" : `${row.delta} чел. (${row.deltaPct > 0 ? "+" : ""}${row.deltaPct}%)`;
    const detail = `Статус: ${escapeHtml(row.status || "—")} · Прошли: ${row.passed !== null ? formatInt(row.passed) : escapeHtml(row.passedRaw || "—")}`;

    return `
      <tr>
        <td>${lessonLabel}<span class="small">${detail}</span></td>
        <td>${formatInt(row.entered)}</td>
        <td>${answeredDisplay}</td>
        <td>${notAnsweredDisplay}</td>
        <td>${conversionDisplay}</td>
        <td class="${index === 0 || row.delta === null || row.delta >= 0 ? "muted" : ""}">${diffDisplay}</td>
        <td><span class="badge ${signal.className}">${signal.label}</span></td>
      </tr>
    `;
  }

  function getSignal(row) {
    if (row.answered === null) {
      return { className: "warn", label: "Нет задания" };
    }

    if (row.delta !== null && row.delta <= -30) {
      return { className: "bad", label: "Проверить переход" };
    }
    if (row.delta !== null && row.delta <= -15) {
      return { className: "warn", label: "Наблюдать" };
    }

    if (row.answerRate !== null && row.answerRate < 70) {
      if (row.delta === null || row.delta < 0) {
        return { className: "warn", label: "Падает вовлечение" };
      }
      return { className: "good", label: "Прирост / стабильно" };
    }

    return { className: "good", label: "Стабильно" };
  }

  function renderChart(model) {
    const svg = document.getElementById(`${APP_ID}-chart`);
    if (!svg) return;

    const width = 980;
    const height = 430;
    const margin = { top: 18, right: 20, bottom: 90, left: 58 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const numericValues = model.rows.flatMap((item) => [item.entered, item.answered].filter((v) => v !== null));
    const yMax = roundUp(Math.max.apply(null, numericValues.concat([100])), 20);
    const yMin = Math.max(0, roundDown(Math.min.apply(null, numericValues.concat([0])) - 40, 20));
    const stepX = model.rows.length > 1 ? innerWidth / (model.rows.length - 1) : innerWidth;
    const ticks = buildTicks(yMin, yMax, 6);

    const x = (index) => margin.left + index * stepX;
    const y = (value) => {
      if (value === null) return null;
      const ratio = (value - yMin) / Math.max(yMax - yMin, 1);
      return margin.top + innerHeight - ratio * innerHeight;
    };

    const pathFor = (key) => {
      let started = false;
      return model.rows.map((item, idx) => {
        const v = item[key];
        if (v === null) {
          started = false;
          return "";
        }
        const cmd = started ? "L" : "M";
        started = true;
        return `${cmd}${x(idx).toFixed(2)},${y(v).toFixed(2)}`;
      }).join(" ");
    };

    const gridLines = ticks.map((value) => `
      <g>
        <line x1="${margin.left}" x2="${width - margin.right}" y1="${y(value)}" y2="${y(value)}" stroke="rgba(17,34,79,.12)" stroke-width="1"/>
        <text x="${margin.left - 14}" y="${y(value) + 5}" text-anchor="end" font-size="12" fill="#5f6780">${formatInt(value)}</text>
      </g>
    `).join("");

    const areas = model.rows.slice(1).map((lesson, i) => {
      const diff = lesson.delta;
      if (diff === null || diff > -15) return "";
      const startX = x(i);
      const endX = x(i + 1);
      const fill = diff <= -30 ? "rgba(196,69,54,.08)" : "rgba(255,106,19,.08)";
      return `<rect x="${startX}" y="${margin.top}" width="${endX - startX}" height="${innerHeight}" fill="${fill}"></rect>`;
    }).join("");

    const labels = model.rows.map((lesson, idx) => `
      <text x="${x(idx)}" y="${height - 28}" transform="rotate(-28 ${x(idx)} ${height - 28})" font-size="12" fill="#5f6780">${escapeHtml(trimLabel(lesson.title, 28))}</text>
    `).join("");

    const enteredMarkers = model.rows.map((lesson, idx) => `<circle cx="${x(idx)}" cy="${y(lesson.entered)}" r="4.5" fill="#2c63ff"></circle>`).join("");
    const answeredMarkers = model.rows.map((lesson, idx) => lesson.answered === null ? "" : `<circle cx="${x(idx)}" cy="${y(lesson.answered)}" r="4.5" fill="#ff6a13"></circle>`).join("");

    svg.innerHTML = `
      ${gridLines}
      ${areas}
      <path d="${pathFor("entered")}" fill="none" stroke="#2c63ff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"></path>
      ${model.rows.some((item) => item.answered !== null) ? `<path d="${pathFor("answered")}" fill="none" stroke="#ff6a13" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"></path>` : ""}
      ${enteredMarkers}
      ${answeredMarkers}
      ${labels}
    `;
  }

  function bindRoot(model) {
    const root = document.getElementById(ROOT_ID);
    if (!root || root.dataset.bound === "1") return;

    root.addEventListener("click", (event) => {
      const btn = event.target.closest('button[data-role="csv"]');
      if (!btn) return;
      downloadCsv(root._model || model);
    });

    root.dataset.bound = "1";
  }

  function downloadCsv(model) {
    const rows = [[
      "Урок", "Статус", "Зашли", "Ответили", "Не ответили", "Прошли",
      "Конверсия ответа", "Конверсия прохождения", "Динамика", "Сигнал"
    ]];

    model.rows.forEach((item, i) => {
      const signal = getSignal(item);
      rows.push([
        item.title,
        item.status || "",
        item.entered,
        item.answered !== null ? item.answered : item.answeredRaw || "",
        item.answerGap !== null ? item.answerGap : "—",
        item.passed !== null ? item.passed : item.passedRaw || "",
        item.answerRate === null ? "—" : `${item.answerRate}%`,
        item.passedRate === null ? "—" : `${item.passedRate}%`,
        i === 0 || item.delta === null ? "—" : `${item.delta} (${item.deltaPct > 0 ? "+" : ""}${item.deltaPct}%)`,
        signal.label
      ]);
    });

    const csv = rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\n");
    const link = document.createElement("a");
    link.href = `data:text/csv;charset=utf-8,\uFEFF${encodeURIComponent(csv)}`;
    link.download = `lesson_stat_${toIsoDate(new Date())}.csv`;
    link.click();
  }

  function readMetricCell(cell) {
    const raw = normalizeSpace(cell ? cell.textContent : "");
    if (!raw) return emptyMetric();
    if (!/\d/.test(raw)) return { raw, value: null };
    return { raw, value: parseNumber(raw) };
  }

  function emptyMetric() { return { raw: "", value: null }; }

  function buildTicks(min, max, count) {
    if (max <= min) return [min];
    const step = Math.max(1, roundUp((max - min) / Math.max(count - 1, 1), 20));
    const ticks = [];
    for (let value = min; value <= max; value += step) ticks.push(value);
    if (ticks[ticks.length - 1] !== max) ticks.push(max);
    return ticks;
  }

  function roundUp(value, step) { return Math.ceil(value / step) * step; }
  function roundDown(value, step) { return Math.floor(value / step) * step; }

  function indexOfHeader(headerColumns, title) {
    const hit = headerColumns.find((cell) => normalizeText(cell.text) === title);
    return hit ? hit.index : -1;
  }

  function normalizeText(value) { return normalizeSpace(value).toLowerCase(); }
  function normalizeSpace(value) { return String(value || "").replace(/\s+/g, " ").trim(); }

  function trimLabel(text, maxLength) {
    const value = normalizeSpace(text);
    return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
  }

  function parseNumber(value) {
    const cleaned = String(value || "").replace(/[^\d-]/g, "");
    return cleaned ? Number(cleaned) : 0;
  }

  function formatInt(value) { return Number(value || 0).toLocaleString("ru-RU"); }

  function toIsoDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
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
