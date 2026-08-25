const statusDot = document.getElementById("status-dot");
const statusText = document.getElementById("status-text");
const runBtn = document.getElementById("run-btn");
const cancelBtn = document.getElementById("cancel-btn");
const logSection = document.getElementById("log");
const logMessage = document.getElementById("log-message");
const logDetails = document.getElementById("log-details");
const progressFill = document.getElementById("progress-fill");
const scrollDelayInput = document.getElementById("scroll-delay");

const translateDot = document.getElementById("translate-dot");
const translateStatusText = document.getElementById("translate-status-text");
const targetLangSelect = document.getElementById("target-lang");
const pickBtn = document.getElementById("pick-btn");
const addTranslationsBtn = document.getElementById("add-translations-btn");
const cancelTranslateBtn = document.getElementById("cancel-translate-btn");
const translateScrollDelayInput = document.getElementById("translate-scroll-delay");

let translateRunning = false;
let running = false;

// ── Tab switching ────────────────────────────────────────────────
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(`tab-${tab.dataset.tab}`).classList.add("active");
  });
});

// ── Shared helpers ─────────────────────────────────────────────
function onProgressMessage(msg) {
  if (msg.type === "SELECTION_PROGRESS") updateProgress(msg.progress);
  if (msg.type === "PICKER_STATUS") updateTranslateStatus(msg);
  if (msg.type === "TRANSLATION_PROGRESS") {
    const { done, total } = msg.progress;
    setTranslateStatus("running", `Translating ${done}/${total}…`);
  }
}

function setStatus(state, text) {
  statusDot.className = `dot ${state}`;
  statusText.textContent = text;
}

function setTranslateStatus(state, text) {
  translateDot.className = `dot ${state}`;
  translateStatusText.textContent = text;
}

function setRunning(isRunning) {
  running = isRunning;
  runBtn.disabled = isRunning || !runBtn.dataset.ready;
  cancelBtn.disabled = !isRunning;
  document.querySelectorAll('input[name="keep"], #scroll-delay').forEach((el) => {
    el.disabled = isRunning;
  });
}

function getOptions() {
  const keep =
    document.querySelector('input[name="keep"]:checked')?.value || "first";
  return {
    keep,
    scrollDelay: Number(scrollDelayInput.value) || 20,
  };
}

function updateProgress(progress) {
  logSection.hidden = false;

  if (progress.phase === "scan") {
    logMessage.textContent = progress.message || "Scanning rows…";
    if (progress.scrollHeight) {
      const pct = Math.min(
        50,
        Math.round((progress.scrollTop / progress.scrollHeight) * 50)
      );
      progressFill.style.width = `${pct}%`;
    }
    logDetails.textContent = `Found: ${progress.found ?? "…"} services`;
  }

  if (progress.phase === "check") {
    logMessage.textContent = progress.message || "Checking duplicates…";
    const base = 50;
    const pct =
      progress.total > 0
        ? base + Math.round(((progress.checked || 0) / progress.total) * 50)
        : base;
    progressFill.style.width = `${Math.min(100, pct)}%`;
    logDetails.textContent = [
      `Checked: ${progress.checked ?? 0} / ${progress.total ?? "?"}`,
      progress.remaining != null ? `Remaining: ${progress.remaining}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }
}

function updateTranslateStatus(msg) {
  switch (msg.status) {
    case "picking":
      setTranslateStatus("running", "Click an element on the page…");
      pickBtn.disabled = true;
      addTranslationsBtn.disabled = true;
      break;
    case "translating":
      setTranslateStatus(
        "running",
        msg.message || `Translating ${msg.total ?? "…"}…`
      );
      break;
    case "done":
      setTranslateStatus("ready", msg.message || "Done");
      pickBtn.disabled = false;
      addTranslationsBtn.disabled = false;
      cancelTranslateBtn.disabled = true;
      translateRunning = false;
      break;
    case "cancelled":
      setTranslateStatus("ready", "Cancelled");
      pickBtn.disabled = false;
      addTranslationsBtn.disabled = false;
      cancelTranslateBtn.disabled = true;
      translateRunning = false;
      break;
    case "error":
      setTranslateStatus("error", msg.message || "Error");
      pickBtn.disabled = false;
      addTranslationsBtn.disabled = false;
      cancelTranslateBtn.disabled = true;
      translateRunning = false;
      break;
  }
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function pingContentScript(tabId) {
  try {
    return await chrome.tabs.sendMessage(tabId, { type: "PING" });
  } catch {
    return null;
  }
}

// ── Duplicates init ─────────────────────────────────────────────
async function initDuplicates() {
  const tab = await getActiveTab();

  if (!tab?.id || tab.url?.startsWith("chrome://")) {
    setStatus("error", "Open your services admin page first");
    return;
  }

  const ping = await pingContentScript(tab.id);

  if (!ping) {
    setStatus("error", "Reload the page, then try again");
    return;
  }

  if (!ping.hasTable) {
    setStatus("error", "Service table not found on this page");
    return;
  }

  runBtn.dataset.ready = "1";
  runBtn.disabled = false;
  setStatus("ready", "Ready — table detected");
}

runBtn.addEventListener("click", async () => {
  const tab = await getActiveTab();
  if (!tab?.id) return;

  setRunning(true);
  setStatus("running", "Running…");
  logSection.hidden = false;
  logMessage.textContent = "Starting…";
  logDetails.textContent = "";
  progressFill.style.width = "0%";

  chrome.runtime.onMessage.addListener(onProgressMessage);

  try {
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "RUN_SELECTION",
      options: getOptions(),
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Unknown error");
    }

    const r = response.result;
    progressFill.style.width = "100%";
    logMessage.textContent = r.message;
    logDetails.textContent = [
      `Scanned: ${r.scanned} services`,
      `Duplicates: ${r.toCheck}`,
      `Checked: ${r.checked}`,
      r.remaining ? `Missed: ${r.remaining}` : "",
      r.label ? `UI: ${r.label}` : "",
      r.summary?.length
        ? `\n${r.summary.length} duplicate provider ID groups`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    setStatus("ready", "Done");
  } catch (err) {
    logMessage.textContent = "Error";
    logDetails.textContent = err.message;
    setStatus("error", "Failed");
  } finally {
    chrome.runtime.onMessage.removeListener(onProgressMessage);
    setRunning(false);
  }
});

cancelBtn.addEventListener("click", async () => {
  const tab = await getActiveTab();
  if (tab?.id) {
    await chrome.tabs.sendMessage(tab.id, { type: "CANCEL_SELECTION" });
  }
  setRunning(false);
  setStatus("ready", "Cancelled");
  logMessage.textContent = "Cancelled";
});

async function pingTranslateScript(tabId) {
  try {
    return await chrome.tabs.sendMessage(tabId, { type: "TRANSLATE_PING" });
  } catch {
    return null;
  }
}

async function initTranslate() {
  const tab = await getActiveTab();

  if (!tab?.id || tab.url?.startsWith("chrome://")) {
    setTranslateStatus("error", "Open the services names page first");
    return;
  }

  const ping = await pingTranslateScript(tab.id);

  if (!ping) {
    setTranslateStatus("error", "Reload the page, then try again");
    return;
  }

  if (ping.hasTranslationTable) {
    addTranslationsBtn.disabled = false;
    setTranslateStatus("ready", "Ready — translation table detected");
  } else {
    setTranslateStatus("ready", "Generic translate only (no names table)");
    addTranslationsBtn.disabled = true;
  }
}

async function loadSavedLang() {
  const { targetLang } = await chrome.storage.local.get("targetLang");
  if (targetLang) targetLangSelect.value = targetLang;
}

targetLangSelect.addEventListener("change", () => {
  chrome.storage.local.set({ targetLang: targetLangSelect.value });
});

pickBtn.addEventListener("click", async () => {
  const tab = await getActiveTab();
  if (!tab?.id || tab.url?.startsWith("chrome://")) {
    setTranslateStatus("error", "Cannot run on this page");
    return;
  }

  try {
    await chrome.tabs.sendMessage(tab.id, {
      type: "START_PICKER",
      targetLang: targetLangSelect.value,
    });
    setTranslateStatus("running", "Click an element on the page…");
    pickBtn.disabled = true;
    window.close();
  } catch {
    setTranslateStatus("error", "Reload the page, then try again");
    pickBtn.disabled = false;
  }
});

addTranslationsBtn.addEventListener("click", async () => {
  const tab = await getActiveTab();
  if (!tab?.id) return;

  translateRunning = true;
  addTranslationsBtn.disabled = true;
  cancelTranslateBtn.disabled = false;
  pickBtn.disabled = true;
  setTranslateStatus("running", "Starting…");

  try {
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "ADD_TRANSLATIONS",
      scrollDelay: Number(translateScrollDelayInput.value) || 20,
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Unknown error");
    }

    setTranslateStatus("ready", response.result.message);
  } catch (err) {
    setTranslateStatus("error", err.message);
  } finally {
    translateRunning = false;
    addTranslationsBtn.disabled = false;
    cancelTranslateBtn.disabled = true;
    pickBtn.disabled = false;
  }
});

cancelTranslateBtn.addEventListener("click", async () => {
  const tab = await getActiveTab();
  if (tab?.id) {
    await chrome.tabs.sendMessage(tab.id, { type: "CANCEL_ADD_TRANSLATIONS" });
  }
  setTranslateStatus("ready", "Cancelling…");
});

// Listen for translate status even when popup reopens
chrome.runtime.onMessage.addListener(onProgressMessage);

loadSavedLang();
initDuplicates();
initTranslate();
