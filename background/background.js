const CONCURRENCY = 5;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 500;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function translateOne(text, targetLang, sourceLang = "auto") {
  const url = new URL("https://translate.googleapis.com/translate_a/single");
  url.searchParams.set("client", "gtx");
  url.searchParams.set("sl", sourceLang);
  url.searchParams.set("tl", targetLang);
  url.searchParams.set("dt", "t");
  url.searchParams.set("q", text);

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const res = await fetch(url.toString());

    if (res.status === 429) {
      await sleep(RETRY_DELAY_MS * (attempt + 1));
      continue;
    }

    if (!res.ok) {
      throw new Error(`Translation failed (${res.status})`);
    }

    const data = await res.json();
    const translated = (data[0] || [])
      .map((part) => part[0])
      .filter(Boolean)
      .join("");

    return translated || text;
  }

  throw new Error("Rate limited — try again later");
}

async function translateBatch(segments, targetLang, onProgress, sourceLang = "auto") {
  const results = [];
  let done = 0;

  const queue = segments.filter((s) => s.text?.trim());

  for (let i = 0; i < queue.length; i += CONCURRENCY) {
    const batch = queue.slice(i, i + CONCURRENCY);

    const batchResults = await Promise.all(
      batch.map(async (segment) => {
        const translated = await translateOne(segment.text, targetLang, sourceLang);
        return {
          id: segment.id,
          tag: segment.tag,
          cssPath: segment.cssPath,
          original: segment.text,
          translated,
        };
      })
    );

    results.push(...batchResults);
    done += batch.length;

    onProgress?.({ done, total: queue.length });
  }

  return results;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== "TRANSLATE_BATCH") return false;

  translateBatch(
    message.segments,
    message.targetLang,
    (progress) => {
      chrome.runtime.sendMessage({
        type: "TRANSLATION_PROGRESS",
        progress,
      });
    },
    message.sourceLang || "auto"
  )
    .then((results) => sendResponse({ ok: true, results }))
    .catch((err) =>
      sendResponse({ ok: false, error: err.message || String(err) })
    );

  return true;
});
