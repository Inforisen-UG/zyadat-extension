(() => {
  const PANEL_ID = "zyadat-translate-panel";
  const HIGHLIGHT_ID = "zyadat-translate-highlight";
  const BANNER_ID = "zyadat-translate-banner";
  const MAX_SEGMENTS = 200;
  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "SVG", "PATH"]);

  let pickerActive = false;
  let addTranslationsCancelled = false;
  let targetLang = "en";
  let hoveredEl = null;
  let panelEl = null;

  const sendStatus = (status, detail = {}) => {
    chrome.runtime.sendMessage({ type: "PICKER_STATUS", status, ...detail });
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

  const SOURCE_CELL_SELECTOR = "td.td-default-lang .cell.cell-translations";
  const ENGLISH_CELL_SELECTOR =
    "td.p-0:not(.td-default-lang) .cell.cell-translations";

  function findTranslationTable() {
    const scoped =
      document.querySelector(".services-names__body table.table") ||
      document.querySelector(".service-names__body table.table");

    if (scoped) return scoped;

    const viewportTable = document.querySelector(
      '[data-viewport-type="element"] table.table, table.table'
    );
    if (viewportTable?.querySelector(SOURCE_CELL_SELECTOR)) return viewportTable;

    return null;
  }

  function isTranslationPage() {
    const table = findTranslationTable();
    if (!table) return false;
    return !!table.querySelector(
      `${SOURCE_CELL_SELECTOR} .cell-translations-name, ${SOURCE_CELL_SELECTOR} .cell-translations-description`
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
    return (
      cell?.querySelector(".cell-translations-name, .cell-translations-description") ||
      cell
    );
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

  function getRowKey(tr, sourceText) {
    const itemIndex = tr.getAttribute("data-item-index");
    if (itemIndex != null) return `item-${itemIndex}`;
    const idMatch = tr.textContent.match(/\bID\s*(\d+)\b/i);
    const idPart = idMatch ? `id-${idMatch[1]}` : `row-${tr.rowIndex}`;
    return `${idPart}-${sourceText}`;
  }

  function collectRowPairs(table) {
    const pairs = [];

    table.querySelectorAll("tbody tr").forEach((tr, index) => {
      const arabicCell = tr.querySelector(SOURCE_CELL_SELECTOR);
      const englishCell = tr.querySelector(ENGLISH_CELL_SELECTOR);
      if (!arabicCell || !englishCell) return;

      const sourceText = getSlotText(arabicCell);
      if (!sourceText) return;

      pairs.push({
        key: getRowKey(tr, sourceText),
        arabicCell,
        englishCell,
        text: sourceText,
        rowIndex: index,
      });
    });

    return pairs;
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

  async function collectAllRowEntries(scrollEl, scrollDelay) {
    const table = findTranslationTable();
    if (!table) return [];

    const seen = new Map();

    await scrollSnapshot(scrollEl, scrollDelay, () => {
      for (const pair of collectRowPairs(table)) {
        if (!seen.has(pair.key)) seen.set(pair.key, pair.text);
      }
    });

    return [...seen.entries()].map(([key, text], id) => ({ key, text, id }));
  }

  async function applyToAllRows(scrollEl, scrollDelay, entries, applyFn) {
    const table = findTranslationTable();
    const pending = new Map(entries.map((e) => [e.key, e]));
    let applied = 0;

    await scrollSnapshot(scrollEl, scrollDelay, async () => {
      for (const pair of collectRowPairs(table)) {
        if (addTranslationsCancelled) throw new Error("Cancelled");
        const entry = pending.get(pair.key);
        if (!entry) continue;
        await applyFn(pair, entry);
        pending.delete(pair.key);
        applied++;
      }
    });

    return { applied, remaining: pending.size };
  }

  async function runAddTranslations(scrollDelay = 20) {
    addTranslationsCancelled = false;

    const table = findTranslationTable();
    if (!table) {
      throw new Error(
        "Services names table not found. Open the translations page first."
      );
    }

    const scrollEl = findScrollContainer();

    sendStatus("translating", { message: "Scanning rows…", phase: "scan" });

    const entries = await collectAllRowEntries(scrollEl, scrollDelay);

    if (!entries.length) {
      throw new Error("No translation rows with source text found.");
    }

    sendStatus("translating", {
      message: `Copying ${entries.length} rows to English column…`,
      total: entries.length,
      phase: "copy",
    });

    await applyToAllRows(scrollEl, scrollDelay, entries, async (pair, entry) => {
      await setCellText(pair.englishCell, entry.text);
    });

    sendStatus("translating", {
      message: `Translating ${entries.length} rows (EN → AR)…`,
      total: entries.length,
      phase: "translate",
    });

    const segments = entries.map((e) => ({ id: e.id, text: e.text }));

    const response = await chrome.runtime.sendMessage({
      type: "TRANSLATE_BATCH",
      segments,
      sourceLang: "en",
      targetLang: "ar",
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Translation failed");
    }

    const byId = new Map(response.results.map((r) => [r.id, r.translated]));

    sendStatus("translating", {
      message: `Pasting ${response.results.length} Arabic translations…`,
      total: response.results.length,
      phase: "paste",
    });

    const { applied, remaining } = await applyToAllRows(
      scrollEl,
      scrollDelay,
      entries,
      async (pair, entry) => {
        const arabic = byId.get(entry.id);
        if (arabic) await setCellText(pair.arabicCell, arabic);
      }
    );

    if (remaining > 0) {
      return {
        count: applied,
        message: `Applied ${applied} translations. ${remaining} rows were not visible — scroll and retry.`,
      };
    }

    return {
      count: applied,
      message: `Added ${applied} translations (EN → AR).`,
    };
  }

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
      sendResponse({
        ok: true,
        pickerActive,
        hasTranslationTable: isTranslationPage(),
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
