(() => {
  const PANEL_ID = "zyadat-translate-panel";
  const HIGHLIGHT_ID = "zyadat-translate-highlight";
  const BANNER_ID = "zyadat-translate-banner";
  const PAGE_FAB_ID = "zyadat-translations-fab";
  const MAX_SEGMENTS = 200;
  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "SVG", "PATH"]);

  let pickerActive = false;
  let addTranslationsCancelled = false;
  let targetLang = "en";
  let hoveredEl = null;
  let panelEl = null;

  let updatePageFabFromStatus = () => {};

  const sendStatus = (status, detail = {}) => {
    chrome.runtime.sendMessage({ type: "PICKER_STATUS", status, ...detail });
    updatePageFabFromStatus(status, detail);
  };

  const getDirectText = (el) =>
    [...el.childNodes]
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent.trim())
      .filter(Boolean)
      .join(" ");

  const getCssPath = (el, root) => {
    const parts = [];
    let node = el;

    while (node && node !== root && node.nodeType === Node.ELEMENT_NODE) {
      const parent = node.parentElement;
      if (!parent) break;

      const siblings = [...parent.children].filter(
        (c) => c.tagName === node.tagName
      );
      const idx = siblings.indexOf(node) + 1;
      const tag = node.tagName.toLowerCase();
      parts.unshift(
        siblings.length > 1 ? `${tag}:nth-child(${idx})` : tag
      );
      node = parent;
    }

    return parts.join(" > ") || el.tagName.toLowerCase();
  };

  function extractTextSegments(root) {
    const segments = [];
    let id = 0;

    function walk(el) {
      if (SKIP_TAGS.has(el.tagName)) return;

      const directText = getDirectText(el);
      if (directText) {
        segments.push({
          id: id++,
          tag: el.tagName.toLowerCase(),
          text: directText,
          cssPath: getCssPath(el, root),
        });
      }

      for (const child of el.children) walk(child);
    }

    walk(root);
    return segments;
  }

  function formatCopyAll(results) {
    return results
      .map(
        (r) =>
          `── ${r.tag} ──\nOriginal: ${r.original}\nTranslated: ${r.translated}`
      )
      .join("\n\n");
  }

  function removeHighlight() {
    document.getElementById(HIGHLIGHT_ID)?.remove();
    hoveredEl = null;
  }

  function removeBanner() {
    document.getElementById(BANNER_ID)?.remove();
  }

  function removePanel() {
    document.getElementById(PANEL_ID)?.remove();
    panelEl = null;
  }

  function highlightElement(el) {
    let box = document.getElementById(HIGHLIGHT_ID);
    if (!box) {
      box = document.createElement("div");
      box.id = HIGHLIGHT_ID;
      Object.assign(box.style, {
        position: "fixed",
        pointerEvents: "none",
        border: "2px solid #2563eb",
        background: "rgba(37, 99, 235, 0.12)",
        zIndex: "2147483646",
        borderRadius: "4px",
        transition: "all 0.05s ease",
      });
      document.body.appendChild(box);
    }

    const rect = el.getBoundingClientRect();
    Object.assign(box.style, {
      top: `${rect.top}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      display: rect.width && rect.height ? "block" : "none",
    });
  }

  function showBanner() {
    removeBanner();
    const banner = document.createElement("div");
    banner.id = BANNER_ID;
    banner.textContent = "Click an element to translate · Esc to cancel";
    Object.assign(banner.style, {
      position: "fixed",
      top: "12px",
      left: "50%",
      transform: "translateX(-50%)",
      background: "#1e293b",
      color: "#fff",
      padding: "8px 16px",
      borderRadius: "8px",
      fontSize: "13px",
      fontFamily: "system-ui, sans-serif",
      zIndex: "2147483647",
      boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
    });
    document.body.appendChild(banner);
  }

  function showPanel(selectedTag, results, capped) {
    removePanel();

    panelEl = document.createElement("div");
    panelEl.id = PANEL_ID;
    Object.assign(panelEl.style, {
      position: "fixed",
      bottom: "16px",
      right: "16px",
      width: "380px",
      maxHeight: "70vh",
      background: "#fff",
      border: "1px solid #e5e7eb",
      borderRadius: "12px",
      boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
      zIndex: "2147483640",
      fontFamily: "system-ui, sans-serif",
      fontSize: "13px",
      color: "#1a1a1a",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
    });

    const header = document.createElement("div");
    Object.assign(header.style, {
      padding: "12px 14px",
      borderBottom: "1px solid #e5e7eb",
      fontWeight: "600",
    });
    header.textContent = `Translations — <${selectedTag}> (${results.length} segments)`;
    if (capped) {
      const warn = document.createElement("div");
      warn.textContent = `Showing first ${MAX_SEGMENTS} segments`;
      Object.assign(warn.style, {
        fontSize: "11px",
        color: "#f59e0b",
        fontWeight: "400",
        marginTop: "4px",
      });
      header.appendChild(warn);
    }

    const body = document.createElement("div");
    Object.assign(body.style, {
      flex: "1",
      overflowY: "auto",
      padding: "10px 14px",
    });

    for (const r of results) {
      const block = document.createElement("div");
      Object.assign(block.style, {
        marginBottom: "12px",
        paddingBottom: "12px",
        borderBottom: "1px solid #f3f4f6",
      });

      const tagLabel = document.createElement("div");
      tagLabel.textContent = `[${r.tag}] ${r.cssPath}`;
      Object.assign(tagLabel.style, {
        fontSize: "10px",
        color: "#9ca3af",
        marginBottom: "4px",
        wordBreak: "break-all",
      });

      const original = document.createElement("div");
      original.textContent = r.original;
      Object.assign(original.style, {
        fontSize: "12px",
        marginBottom: "4px",
        wordBreak: "break-word",
      });

      const arrow = document.createElement("div");
      arrow.textContent = "→";
      Object.assign(arrow.style, { color: "#2563eb", marginBottom: "4px" });

      const translated = document.createElement("div");
      translated.textContent = r.translated;
      Object.assign(translated.style, {
        fontSize: "12px",
        fontWeight: "500",
        color: "#1d4ed8",
        wordBreak: "break-word",
      });

      block.append(tagLabel, original, arrow, translated);
      body.appendChild(block);
    }

    const footer = document.createElement("div");
    Object.assign(footer.style, {
      padding: "10px 14px",
      borderTop: "1px solid #e5e7eb",
      display: "flex",
      gap: "8px",
    });

    const makeBtn = (label, primary) => {
      const btn = document.createElement("button");
      btn.textContent = label;
      Object.assign(btn.style, {
        flex: "1",
        padding: "7px 10px",
        border: "none",
        borderRadius: "8px",
        fontSize: "12px",
        fontWeight: "500",
        cursor: "pointer",
        background: primary ? "#2563eb" : "#e5e7eb",
        color: primary ? "#fff" : "#374151",
      });
      return btn;
    };

    const copyBtn = makeBtn("Copy All", true);
    copyBtn.addEventListener("click", async () => {
      await navigator.clipboard.writeText(formatCopyAll(results));
      copyBtn.textContent = "Copied!";
      setTimeout(() => {
        copyBtn.textContent = "Copy All";
      }, 1500);
    });

    const anotherBtn = makeBtn("Select another", false);
    anotherBtn.addEventListener("click", () => {
      removePanel();
      startPicker(targetLang);
    });

    const closeBtn = makeBtn("Close", false);
    closeBtn.addEventListener("click", () => removePanel());

    footer.append(copyBtn, anotherBtn, closeBtn);
    panelEl.append(header, body, footer);
    document.body.appendChild(panelEl);
  }

  async function translateAndShow(el) {
    const segments = extractTextSegments(el);

    if (!segments.length) {
      sendStatus("error", { message: "No translatable text found in selection." });
      return;
    }

    const capped = segments.length > MAX_SEGMENTS;
    const toTranslate = capped ? segments.slice(0, MAX_SEGMENTS) : segments;

    sendStatus("translating", { total: toTranslate.length });

    try {
      const response = await chrome.runtime.sendMessage({
        type: "TRANSLATE_BATCH",
        segments: toTranslate,
        targetLang,
      });

      if (!response?.ok) {
        throw new Error(response?.error || "Translation failed");
      }

      showPanel(el.tagName.toLowerCase(), response.results, capped);
      sendStatus("done", {
        message: `Translated ${response.results.length} segments`,
        count: response.results.length,
      });
    } catch (err) {
      sendStatus("error", { message: err.message || String(err) });
    }
  }

  function stopPicker() {
    pickerActive = false;
    removeHighlight();
    removeBanner();
    document.removeEventListener("mousemove", onMouseMove, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKeyDown, true);
  }

  function onMouseMove(e) {
    if (!pickerActive) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (
      !el ||
      el.id === HIGHLIGHT_ID ||
      el.id === BANNER_ID ||
      el.id === PANEL_ID ||
      el.closest(`#${PANEL_ID}`)
    ) {
      return;
    }
    hoveredEl = el;
    highlightElement(el);
  }

  function onClick(e) {
    if (!pickerActive) return;
    e.preventDefault();
    e.stopPropagation();

    const el = hoveredEl || e.target;
    stopPicker();
    translateAndShow(el);
  }

  function onKeyDown(e) {
    if (!pickerActive) return;
    if (e.key === "Escape") {
      stopPicker();
      sendStatus("cancelled");
    }
  }

  function startPicker(lang) {
    stopPicker();
    targetLang = lang;
    pickerActive = true;
    showBanner();
    sendStatus("picking");

    document.addEventListener("mousemove", onMouseMove, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeyDown, true);
  }

  // ── Services names bulk translation ─────────────────────────────

  const LEFT_CELL_SELECTOR = "td.td-default-lang .cell.cell-translations";
  const RIGHT_CELL_SELECTOR =
    "td.p-0:not(.td-default-lang) .cell.cell-translations";
  const SLOT_SELECTORS = [
    ".cell-translations-name",
    ".cell-translations-description",
  ];

  const LANGUAGE_NAME_TO_CODE = {
    arabic: "ar",
    ar: "ar",
    english: "en",
    en: "en",
    spanish: "es",
    es: "es",
    french: "fr",
    fr: "fr",
    german: "de",
    de: "de",
    turkish: "tr",
    tr: "tr",
    urdu: "ur",
    ur: "ur",
    hindi: "hi",
    hi: "hi",
    bengali: "bn",
    bn: "bn",
    portuguese: "pt",
    pt: "pt",
    russian: "ru",
    ru: "ru",
    japanese: "ja",
    ja: "ja",
    korean: "ko",
    ko: "ko",
    italian: "it",
    it: "it",
    dutch: "nl",
    nl: "nl",
    polish: "pl",
    pl: "pl",
    indonesian: "id",
    id: "id",
    persian: "fa",
    farsi: "fa",
    fa: "fa",
    chinese: "zh-CN",
    mandarin: "zh-CN",
    "chinese simplified": "zh-CN",
    "chinese traditional": "zh-TW",
    cantonese: "zh-TW",
  };

  const NATIVE_LANGUAGE_PATTERNS = [
    [/العربية|عربي/i, "ar"],
    [/english|انجليزي|إنجليزي|الإنجليزية/i, "en"],
    [/español|spanish/i, "es"],
    [/français|french/i, "fr"],
    [/deutsch|german/i, "de"],
    [/türkçe|turkish/i, "tr"],
    [/اردو|urdu/i, "ur"],
    [/हिन्दी|hindi/i, "hi"],
    [/বাংলা|bengali/i, "bn"],
    [/português|portuguese/i, "pt"],
    [/русский|russian/i, "ru"],
    [/日本語|japanese/i, "ja"],
    [/한국어|korean/i, "ko"],
    [/italiano|italian/i, "it"],
    [/nederlands|dutch/i, "nl"],
    [/polski|polish/i, "pl"],
    [/indonesia|indonesian/i, "id"],
    [/فارسی|persian|farsi/i, "fa"],
    [/中文|chinese/i, "zh-CN"],
  ];

  function cleanHeaderLabel(text) {
    return text.replace(/\bdefault\b/gi, "").replace(/\s+/g, " ").trim();
  }

  function parseLanguageFromHeader(text) {
    const cleaned = cleanHeaderLabel(text).toLowerCase();
    if (!cleaned) return null;

    if (LANGUAGE_NAME_TO_CODE[cleaned]) return LANGUAGE_NAME_TO_CODE[cleaned];

    for (const [name, code] of Object.entries(LANGUAGE_NAME_TO_CODE)) {
      if (cleaned.includes(name)) return code;
    }

    for (const [pattern, code] of NATIVE_LANGUAGE_PATTERNS) {
      if (pattern.test(text)) return code;
    }

    const iso = cleaned.match(/\b([a-z]{2}(?:-[a-z]{2})?)\b/);
    if (iso && LANGUAGE_NAME_TO_CODE[iso[1]]) return LANGUAGE_NAME_TO_CODE[iso[1]];

    return null;
  }

  function detectColumnLanguages(table) {
    const headerRow = table.querySelector("thead tr");
    const sampleRow = table.querySelector("tbody tr");
    if (!headerRow || !sampleRow) return null;

    const leftTd = sampleRow.querySelector("td.td-default-lang");
    const rightTd = sampleRow.querySelector("td.p-0:not(.td-default-lang)");
    if (!leftTd || !rightTd) return null;

    const leftHeader =
      headerRow.children[leftTd.cellIndex]?.textContent?.trim() || "";
    const rightHeader =
      headerRow.children[rightTd.cellIndex]?.textContent?.trim() || "";

    const leftCode =
      leftTd.dataset.lang ||
      leftTd.getAttribute("lang") ||
      parseLanguageFromHeader(leftHeader);
    const rightCode =
      rightTd.dataset.lang ||
      rightTd.getAttribute("lang") ||
      parseLanguageFromHeader(rightHeader);

    if (!leftCode || !rightCode) return null;

    return {
      left: { code: leftCode, label: cleanHeaderLabel(leftHeader) || leftCode },
      right: {
        code: rightCode,
        label: cleanHeaderLabel(rightHeader) || rightCode,
      },
    };
  }

  function findTranslationTable() {
    const scoped =
      document.querySelector(".services-names__body table.table") ||
      document.querySelector(".service-names__body table.table");

    if (scoped) return scoped;

    const viewportTable = document.querySelector(
      '[data-viewport-type="element"] table.table, table.table'
    );
    if (viewportTable?.querySelector(LEFT_CELL_SELECTOR)) return viewportTable;

    return null;
  }

  function isTranslationPage() {
    const table = findTranslationTable();
    if (!table) return false;
    if (!detectColumnLanguages(table)) return false;
    return !!table.querySelector(
      `${LEFT_CELL_SELECTOR} .cell-translations-name, ${LEFT_CELL_SELECTOR} .cell-translations-description, ${RIGHT_CELL_SELECTOR} .cell-translations-name, ${RIGHT_CELL_SELECTOR} .cell-translations-description`
    );
  }

  function findScrollContainer() {
    return (
      document.querySelector('[data-testid="virtuoso-scroller"]') ||
      document.querySelector('[data-virtuoso-scroller="true"]') ||
      document.querySelector('[data-viewport-type="element"]')?.parentElement ||
      document.querySelector('[data-viewport-type="element"]') ||
      document.querySelector(".services-names__body") ||
      document.querySelector(".service-names__body")
    );
  }

  function getSlotElement(cell) {
    if (
      cell?.matches?.(
        ".cell-translations-name, .cell-translations-description"
      )
    ) {
      return cell;
    }
    return (
      cell?.querySelector(".cell-translations-name, .cell-translations-description") ||
      cell
    );
  }

  function forEachTranslationSlot(leftCell, rightCell, callback) {
    let found = false;

    for (const sel of SLOT_SELECTORS) {
      const leftSlot = leftCell.querySelector(sel);
      const rightSlot = rightCell.querySelector(sel);
      if (!leftSlot && !rightSlot) continue;

      found = true;
      callback(leftSlot, rightSlot, sel.slice(1));
    }

    if (!found) {
      callback(leftCell, rightCell, "cell");
    }
  }

  function findEditableInput(scope) {
    if (!scope) return null;
    const tr = scope.closest("tr");
    const td = scope.closest("td");
    const candidates = [
      ...scope.querySelectorAll('input:not([type="checkbox"]), textarea'),
      ...(td?.querySelectorAll('input:not([type="checkbox"]), textarea') || []),
    ];
    return (
      candidates.find((el) => !el.closest(".td-service")) ||
      (document.activeElement?.matches('input:not([type="checkbox"]), textarea')
        ? document.activeElement
        : null)
    );
  }

  const CELL_EDIT_DELAY = 80;
  const CELL_BETWEEN_DELAY = 50;

  const cellSleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function findInputNearCell(cell) {
    const slot = getSlotElement(cell);
    return findEditableInput(slot || cell);
  }

  function setInputValue(input, text) {
    const proto =
      input instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(input, text);
    else input.value = text;

    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  function getSlotText(cell) {
    if (!cell) return "";
    const slot = getSlotElement(cell);
    const input = slot.querySelector('input:not([type="checkbox"]), textarea');
    if (input) return input.value.trim();
    const inner = slot.querySelector("span span") || slot.querySelector("span");
    return (inner?.textContent || "").trim();
  }

  async function setCellText(cell, text) {
    if (!cell) return false;

    const clickTarget = getSlotElement(cell);
    clickTarget.click();
    await cellSleep(CELL_EDIT_DELAY);

    let input = findInputNearCell(cell);

    if (!input) {
      clickTarget.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
      await cellSleep(CELL_EDIT_DELAY);
      input = findInputNearCell(cell);
    }

    if (input) {
      input.focus();
      setInputValue(input, text);
      await cellSleep(CELL_BETWEEN_DELAY);
      return true;
    }

    const editable =
      clickTarget.querySelector("[contenteditable='true']") ||
      (clickTarget.isContentEditable ? clickTarget : null);

    if (editable) {
      editable.focus();
      editable.textContent = text;
      editable.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          data: text,
          inputType: "insertText",
        })
      );
      editable.dispatchEvent(new Event("blur", { bubbles: true }));
      await cellSleep(CELL_BETWEEN_DELAY);
      return true;
    }

    const inner = clickTarget.querySelector("span span") || clickTarget.querySelector("span");
    if (inner) inner.textContent = text;
    else clickTarget.textContent = text;
    await cellSleep(CELL_BETWEEN_DELAY);
    return false;
  }

  function getRowKey(tr, slotKey, sourceText) {
    const itemIndex = tr.getAttribute("data-item-index");
    if (itemIndex != null) return `item-${itemIndex}-${slotKey}`;
    const idMatch = tr.textContent.match(/\bID\s*(\d+)\b/i);
    const idPart = idMatch ? `id-${idMatch[1]}` : `row-${tr.rowIndex}`;
    return `${idPart}-${slotKey}-${sourceText}`;
  }

  function collectTranslationTasks(table, langs) {
    const tasks = [];

    table.querySelectorAll("tbody tr").forEach((tr) => {
      const leftCell = tr.querySelector(LEFT_CELL_SELECTOR);
      const rightCell = tr.querySelector(RIGHT_CELL_SELECTOR);
      if (!leftCell || !rightCell) return;

      forEachTranslationSlot(leftCell, rightCell, (leftSlot, rightSlot, slotKey) => {
        const leftText = getSlotText(leftSlot || leftCell);
        const rightText = getSlotText(rightSlot || rightCell);

        let sourceText;
        let targetSlot;
        let targetLang;
        let direction;

        if (leftText && !rightText) {
          sourceText = leftText;
          targetSlot = rightSlot || rightCell;
          targetLang = langs.right.code;
          direction = "left-to-right";
        } else if (rightText && !leftText) {
          sourceText = rightText;
          targetSlot = leftSlot || leftCell;
          targetLang = langs.left.code;
          direction = "right-to-left";
        } else {
          return;
        }

        tasks.push({
          key: getRowKey(tr, slotKey, sourceText),
          sourceText,
          targetSlot,
          targetLang,
          direction,
        });
      });
    });

    return tasks;
  }

  async function scrollSnapshot(scrollEl, scrollDelay, onSnapshot) {
    await onSnapshot();

    if (!scrollEl || scrollEl.scrollHeight <= scrollEl.clientHeight) return;

    const step = Math.max(300, scrollEl.clientHeight - 60);
    for (let y = 0; y <= scrollEl.scrollHeight; y += step) {
      if (addTranslationsCancelled) throw new Error("Cancelled");
      scrollEl.scrollTop = y;
      await new Promise((r) => setTimeout(r, scrollDelay));
      await onSnapshot();
    }

    scrollEl.scrollTop = 0;
    await new Promise((r) => setTimeout(r, scrollDelay));
    await onSnapshot();
  }

  async function collectAllTranslationTasks(scrollEl, scrollDelay, langs) {
    const table = findTranslationTable();
    if (!table) return [];

    const seen = new Map();

    await scrollSnapshot(scrollEl, scrollDelay, () => {
      for (const task of collectTranslationTasks(table, langs)) {
        if (!seen.has(task.key)) seen.set(task.key, task);
      }
    });

    return [...seen.values()].map((task, id) => ({ ...task, id }));
  }

  async function applyTranslationTasks(scrollEl, scrollDelay, langs, entries, applyFn) {
    const table = findTranslationTable();
    const pending = new Map(entries.map((e) => [e.key, e]));
    let applied = 0;

    await scrollSnapshot(scrollEl, scrollDelay, async () => {
      for (const task of collectTranslationTasks(table, langs)) {
        if (addTranslationsCancelled) throw new Error("Cancelled");
        const entry = pending.get(task.key);
        if (!entry) continue;
        await applyFn(task, entry);
        pending.delete(task.key);
        applied++;
      }
    });

    return { applied, remaining: pending.size };
  }

  async function translateEntriesInBatches(entries) {
    const byTarget = new Map();

    for (const entry of entries) {
      if (!byTarget.has(entry.targetLang)) byTarget.set(entry.targetLang, []);
      byTarget.get(entry.targetLang).push(entry);
    }

    const translatedById = new Map();

    for (const [targetLang, batch] of byTarget) {
      const response = await chrome.runtime.sendMessage({
        type: "TRANSLATE_BATCH",
        segments: batch.map((e) => ({ id: e.id, text: e.sourceText })),
        sourceLang: "auto",
        targetLang,
      });

      if (!response?.ok) {
        throw new Error(response?.error || "Translation failed");
      }

      for (const result of response.results) {
        translatedById.set(result.id, result.translated);
      }
    }

    return translatedById;
  }

  function formatLanguagePair(langs) {
    return `${langs.left.label} ↔ ${langs.right.label}`;
  }

  async function runAddTranslations(scrollDelay = 20) {
    addTranslationsCancelled = false;

    const table = findTranslationTable();
    if (!table) {
      throw new Error(
        "Services names table not found. Open the translations page first."
      );
    }

    const langs = detectColumnLanguages(table);
    if (!langs) {
      throw new Error(
        "Could not detect left/right column languages from the table header."
      );
    }

    const scrollEl = findScrollContainer();
    const langPair = formatLanguagePair(langs);

    sendStatus("translating", {
      message: `Scanning rows (${langPair})…`,
      phase: "scan",
    });

    const entries = await collectAllTranslationTasks(scrollEl, scrollDelay, langs);

    if (!entries.length) {
      throw new Error(
        "No missing translations found. Each row needs text on one side only."
      );
    }

    const toRight = entries.filter((e) => e.direction === "left-to-right").length;
    const toLeft = entries.filter((e) => e.direction === "right-to-left").length;
    const directionSummary = [
      toRight ? `${toRight} → ${langs.right.label}` : "",
      toLeft ? `${toLeft} → ${langs.left.label}` : "",
    ]
      .filter(Boolean)
      .join(", ");

    sendStatus("translating", {
      message: `Translating ${entries.length} entries (${directionSummary})…`,
      total: entries.length,
      phase: "translate",
    });

    const translatedById = await translateEntriesInBatches(entries);

    sendStatus("translating", {
      message: `Filling ${entries.length} missing cells…`,
      total: entries.length,
      phase: "paste",
    });

    const { applied, remaining } = await applyTranslationTasks(
      scrollEl,
      scrollDelay,
      langs,
      entries,
      async (task, entry) => {
        const translated = translatedById.get(entry.id);
        if (translated && task.targetSlot) {
          await setCellText(task.targetSlot, translated);
        }
      }
    );

    if (remaining > 0) {
      return {
        count: applied,
        message: `Filled ${applied} cells (${langPair}). ${remaining} rows were not visible — scroll and retry.`,
      };
    }

    return {
      count: applied,
      message: `Added ${applied} translations (${directionSummary}).`,
    };
  }

  // ── In-page "Add translations" button ───────────────────────────

  const PAGE_TITLE_RE = /bulk edit service names and descriptions/i;

  function findTranslationPageHeader() {
    return document.querySelector(
      ".services-names__header, .service-names__header"
    );
  }

  function findTranslationPageTitle() {
    const header = findTranslationPageHeader();
    if (header) {
      const title = header.querySelector(".title");
      if (title && PAGE_TITLE_RE.test(title.textContent.trim())) return title;
    }

    for (const el of document.querySelectorAll("h1, h2, h3, h4, .title")) {
      if (PAGE_TITLE_RE.test(el.textContent.trim())) return el;
    }

    return null;
  }

  function findTitleMountParent(titleEl) {
    return titleEl.parentElement;
  }

  function injectPageFabStyles() {
    if (document.getElementById("zyadat-translations-fab-styles")) return;

    const style = document.createElement("style");
    style.id = "zyadat-translations-fab-styles";
    style.textContent = `
      .zyadat-title-row {
        display: flex !important;
        align-items: center !important;
        flex-wrap: wrap !important;
        gap: 12px !important;
      }
      #${PAGE_FAB_ID} {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 6px;
        flex-shrink: 0;
        font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
        font-size: 13px;
        line-height: 1.4;
      }
      #${PAGE_FAB_ID} .zyadat-fab-actions {
        display: flex;
        gap: 8px;
        align-items: center;
      }
      #${PAGE_FAB_ID} .zyadat-fab-add {
        padding: 8px 14px;
        border: none;
        border-radius: 6px;
        background: #2563eb;
        color: #fff;
        font: inherit;
        font-weight: 600;
        cursor: pointer;
        box-shadow: 0 2px 8px rgba(37, 99, 235, 0.3);
        white-space: nowrap;
      }
      #${PAGE_FAB_ID} .zyadat-fab-add:hover:not(:disabled) {
        background: #1d4ed8;
      }
      #${PAGE_FAB_ID} .zyadat-fab-add:disabled {
        opacity: 0.65;
        cursor: not-allowed;
      }
      #${PAGE_FAB_ID} .zyadat-fab-cancel {
        padding: 8px 12px;
        border: 1px solid #d1d5db;
        border-radius: 6px;
        background: #fff;
        color: #374151;
        font: inherit;
        font-weight: 500;
        cursor: pointer;
        white-space: nowrap;
      }
      #${PAGE_FAB_ID} .zyadat-fab-cancel:hover:not(:disabled) {
        background: #f9fafb;
      }
      #${PAGE_FAB_ID} .zyadat-fab-cancel:disabled {
        display: none;
      }
      #${PAGE_FAB_ID} .zyadat-fab-status {
        max-width: 360px;
        padding: 6px 10px;
        border-radius: 6px;
        background: #f9fafb;
        color: #374151;
        border: 1px solid #e5e7eb;
        text-align: right;
        font-size: 12px;
      }
      #${PAGE_FAB_ID} .zyadat-fab-status:empty {
        display: none;
      }
      #${PAGE_FAB_ID}[data-state="error"] .zyadat-fab-status {
        color: #b91c1c;
        border-color: #fecaca;
        background: #fef2f2;
      }
      #${PAGE_FAB_ID}[data-state="done"] .zyadat-fab-status {
        color: #166534;
        border-color: #bbf7d0;
        background: #f0fdf4;
      }
    `;
    document.head.appendChild(style);
  }

  function setPageFabState(fab, state) {
    fab.dataset.state = state;
    const addBtn = fab.querySelector(".zyadat-fab-add");
    const cancelBtn = fab.querySelector(".zyadat-fab-cancel");
    const running = state === "running";

    if (addBtn) addBtn.disabled = running;
    if (cancelBtn) cancelBtn.disabled = !running;
  }

  function updatePageFabMessage(fab, message) {
    const status = fab.querySelector(".zyadat-fab-status");
    if (status) status.textContent = message || "";
  }

  function createPageFabElement() {
    const fab = document.createElement("div");
    fab.id = PAGE_FAB_ID;
    fab.dataset.state = "idle";
    fab.innerHTML = `
      <div class="zyadat-fab-actions">
        <button type="button" class="zyadat-fab-add">Add translations</button>
        <button type="button" class="zyadat-fab-cancel" disabled>Cancel</button>
      </div>
      <div class="zyadat-fab-status" aria-live="polite"></div>
    `;

    const addBtn = fab.querySelector(".zyadat-fab-add");
    const cancelBtn = fab.querySelector(".zyadat-fab-cancel");

    addBtn.addEventListener("click", () => {
      setPageFabState(fab, "running");
      updatePageFabMessage(fab, "Starting…");

      runAddTranslations(20)
        .then((result) => {
          setPageFabState(fab, "done");
          updatePageFabMessage(fab, result.message);
        })
        .catch((err) => {
          const msg = err.message || String(err);
          if (msg === "Cancelled") {
            setPageFabState(fab, "idle");
            updatePageFabMessage(fab, "");
            return;
          }
          setPageFabState(fab, "error");
          updatePageFabMessage(fab, msg);
        });
    });

    cancelBtn.addEventListener("click", () => {
      addTranslationsCancelled = true;
      updatePageFabMessage(fab, "Cancelling…");
    });

    return fab;
  }

  function injectPageFab() {
    const titleEl = findTranslationPageTitle();
    if (!titleEl) return;

    const mountParent = findTitleMountParent(titleEl);
    if (!mountParent) return;

    injectPageFabStyles();
    mountParent.classList.add("zyadat-title-row");

    let fab = document.getElementById(PAGE_FAB_ID);
    if (fab?.parentElement === mountParent) {
      const addBtn = fab.querySelector(".zyadat-fab-add");
      if (addBtn && fab.dataset.state === "idle") {
        addBtn.disabled = !isTranslationPage();
      }
      return;
    }

    if (fab) fab.remove();
    fab = createPageFabElement();
    fab.querySelector(".zyadat-fab-add").disabled = !isTranslationPage();
    mountParent.appendChild(fab);
  }

  function removePageFab() {
    if (findTranslationPageTitle()) return;

    const fab = document.getElementById(PAGE_FAB_ID);
    const mountParent = fab?.parentElement;
    fab?.remove();
    mountParent?.classList.remove("zyadat-title-row");
  }

  updatePageFabFromStatus = (status, detail = {}) => {
    const fab = document.getElementById(PAGE_FAB_ID);
    if (!fab) return;

    if (status === "translating") {
      setPageFabState(fab, "running");
      if (detail.message) updatePageFabMessage(fab, detail.message);
      return;
    }

    if (status === "done") {
      setPageFabState(fab, "done");
      updatePageFabMessage(fab, detail.message || "Done.");
      return;
    }

    if (status === "error") {
      setPageFabState(fab, "error");
      updatePageFabMessage(fab, detail.message || "Translation failed.");
      return;
    }

    if (status === "cancelled") {
      setPageFabState(fab, "idle");
      updatePageFabMessage(fab, "");
    }
  };

  let pageFabCheckTimer = null;

  function watchTranslationPage() {
    const check = () => {
      if (findTranslationPageTitle()) injectPageFab();
      else removePageFab();
    };

    check();

    const observer = new MutationObserver(() => {
      clearTimeout(pageFabCheckTimer);
      pageFabCheckTimer = setTimeout(check, 300);
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  watchTranslationPage();

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "START_PICKER") {
      startPicker(message.targetLang || "en");
      sendResponse({ ok: true });
      return false;
    }

    if (message.type === "CANCEL_PICKER") {
      stopPicker();
      sendResponse({ ok: true });
      return false;
    }

    if (message.type === "TRANSLATE_PING") {
      const table = findTranslationTable();
      const languages = table ? detectColumnLanguages(table) : null;
      sendResponse({
        ok: true,
        pickerActive,
        hasTranslationTable: isTranslationPage(),
        languages,
      });
      return false;
    }

    if (message.type === "ADD_TRANSLATIONS") {
      runAddTranslations(message.scrollDelay ?? 20)
        .then((result) => {
          sendStatus("done", result);
          sendResponse({ ok: true, result });
        })
        .catch((err) => {
          const msg = err.message || String(err);
          if (msg !== "Cancelled") sendStatus("error", { message: msg });
          else sendStatus("cancelled");
          sendResponse({ ok: false, error: msg });
        });
      return true;
    }

    if (message.type === "CANCEL_ADD_TRANSLATIONS") {
      addTranslationsCancelled = true;
      sendResponse({ ok: true });
      return false;
    }
  });
})();
