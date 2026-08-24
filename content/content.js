(() => {
  let cancelled = false;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const readRow = (body) => ({
    serviceId:
      body.querySelector(".service-table__id span span")?.textContent.trim() ||
      body.id.replace("service-", ""),
    providerId: body
      .querySelector(".service-table__provider-service-id span span")
      ?.textContent.trim(),
    top: parseInt(body.style.top, 10) || 0,
  });

  async function collectAll(scrollEl, scrollDelay, onProgress) {
    const map = new Map();
    const step = Math.max(400, scrollEl.clientHeight - 60);

    for (let y = 0; y <= scrollEl.scrollHeight; y += step) {
      if (cancelled) throw new Error("Cancelled");

      scrollEl.scrollTop = y;
      await sleep(scrollDelay);

      for (const body of scrollEl.querySelectorAll(
        '.service-table__body[id^="service-"]'
      )) {
        const row = readRow(body);
        if (row.serviceId && !map.has(row.serviceId)) {
          map.set(row.serviceId, row);
        }
      }

      onProgress?.({
        phase: "scan",
        found: map.size,
        scrollTop: y,
        scrollHeight: scrollEl.scrollHeight,
      });
    }

    return map;
  }

  function getDuplicatesToCheck(catalog, keep) {
    const byProvider = new Map();

    for (const row of catalog.values()) {
      if (!row.providerId) continue;
      if (!byProvider.has(row.providerId)) byProvider.set(row.providerId, []);
      byProvider.get(row.providerId).push(row);
    }

    const toCheck = new Set();
    const summary = [];

    for (const [providerId, rows] of byProvider) {
      if (rows.length <= 1) continue;

      rows.sort((a, b) => a.top - b.top);
      const duplicates = keep === "last" ? rows.slice(0, -1) : rows.slice(1);

      duplicates.forEach((r) => toCheck.add(r.serviceId));

      summary.push({
        providerId,
        total: rows.length,
        kept: keep === "last" ? rows.at(-1).serviceId : rows[0].serviceId,
        checking: duplicates.length,
      });
    }

    return { toCheck, summary };
  }

  async function checkDuplicates(scrollEl, toCheck, scrollDelay, onProgress) {
    let checked = 0;
    const remaining = new Set(toCheck);
    const step = Math.max(400, scrollEl.clientHeight - 60);

    for (let y = 0; y <= scrollEl.scrollHeight; y += step) {
      if (cancelled) throw new Error("Cancelled");

      scrollEl.scrollTop = y;
      await sleep(scrollDelay);

      for (const body of scrollEl.querySelectorAll(
        '.service-table__body[id^="service-"]'
      )) {
        const { serviceId } = readRow(body);
        if (!remaining.has(serviceId)) continue;

        const cb = body.querySelector(".service-table__controls-checkbox");
        if (cb && !cb.checked) {
          cb.click();
          checked++;
        }

        remaining.delete(serviceId);
      }

      onProgress?.({
        phase: "check",
        checked,
        total: toCheck.size,
        remaining: remaining.size,
        scrollTop: y,
        scrollHeight: scrollEl.scrollHeight,
      });

      if (remaining.size === 0) break;
    }

    return { checked, remaining: remaining.size };
  }

  async function runSelection(options, onProgress) {
    cancelled = false;

    const scrollEl = document.querySelector(".service-table__container");
    if (!scrollEl) {
      throw new Error(
        "Service table not found. Open the services page with the provider table visible."
      );
    }

    const keep = options.keep === "last" ? "last" : "first";
    const scrollDelay = Math.max(10, Number(options.scrollDelay) || 20);

    onProgress?.({ phase: "scan", message: "Scanning all rows…" });
    const catalog = await collectAll(scrollEl, scrollDelay, onProgress);

    const { toCheck, summary } = getDuplicatesToCheck(catalog, keep);

    if (!toCheck.size) {
      scrollEl.scrollTop = 0;
      return {
        scanned: catalog.size,
        toCheck: 0,
        checked: 0,
        remaining: 0,
        summary: [],
        message: "No duplicate provider IDs found.",
      };
    }

    onProgress?.({
      phase: "check",
      message: `Checking ${toCheck.size} duplicates…`,
      toCheck: toCheck.size,
    });

    const { checked, remaining } = await checkDuplicates(
      scrollEl,
      toCheck,
      scrollDelay,
      onProgress
    );

    scrollEl.scrollTop = 0;

    const label = document.querySelector(
      ".mass-actions__selected-title"
    )?.textContent;

    return {
      scanned: catalog.size,
      toCheck: toCheck.size,
      checked,
      remaining,
      summary,
      label,
      message: `Checked ${checked} of ${toCheck.size} duplicate rows.`,
    };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "CANCEL_SELECTION") {
      cancelled = true;
      sendResponse({ ok: true });
      return false;
    }

    if (message.type === "RUN_SELECTION") {
      runSelection(message.options || {}, (progress) => {
        chrome.runtime.sendMessage({
          type: "SELECTION_PROGRESS",
          progress,
        });
      })
        .then((result) => sendResponse({ ok: true, result }))
        .catch((err) =>
          sendResponse({
            ok: false,
            error: err.message || String(err),
          })
        );

      return true;
    }

    if (message.type === "PING") {
      const hasTable = !!document.querySelector(".service-table__container");
      sendResponse({ ok: true, hasTable });
      return false;
    }
  });
})();
