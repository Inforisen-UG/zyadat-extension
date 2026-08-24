const statusDot = document.getElementById("status-dot");
const statusText = document.getElementById("status-text");
const runBtn = document.getElementById("run-btn");
const cancelBtn = document.getElementById("cancel-btn");
const logSection = document.getElementById("log");
const logMessage = document.getElementById("log-message");
const logDetails = document.getElementById("log-details");
const progressFill = document.getElementById("progress-fill");
const scrollDelayInput = document.getElementById("scroll-delay");

let running = false;

function onProgressMessage(msg) {
  if (msg.type === "SELECTION_PROGRESS") {
    updateProgress(msg.progress);
  }
}

function setStatus(state, text) {
  statusDot.className = `dot ${state}`;
  statusText.textContent = text;
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
        ? base +
          Math.round(
            ((progress.checked || 0) / progress.total) * 50
          )
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

async function init() {
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

init();
