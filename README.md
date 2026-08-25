# Zyadat Tools

Chrome extension with two tools:

1. **Duplicate Provider Selector** — finds duplicate provider service IDs in SMM panel tables and checks their checkboxes (keeps one per ID).
2. **Translation** — pick any element on a page, extract text per tag, and translate to a chosen language (source is always auto-detected).

## Install (unpacked)

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select this folder (`zyadat-extension`)
5. Reload any open tabs after installing

## Duplicate Provider Selector

1. Open your admin **Services** page (with `.service-table__container`)
2. Filter as needed (e.g. by provider)
3. Click the extension icon → **Duplicates** tab
4. Choose which duplicate to **keep unchecked** (first or last)
5. Click **Run**

The extension scrolls the virtualized table twice: once to scan all rows, once to check duplicates.

| Setting | Description |
|--------|-------------|
| **Keep first row** | Leaves the topmost duplicate unchecked, checks the rest |
| **Keep last row** | Leaves the bottommost duplicate unchecked |
| **Scroll delay** | Milliseconds between scroll steps (increase if rows are missed) |

## Translation

### Add translations (services names page)

For the admin **services names** translation table:

1. Open the services names page (Arabic / English columns)
2. Click the extension icon → **Translate** tab
3. Click **Add translations**

The extension will:

1. Find every table row that has **English text** on the right (skips empty rows)
2. Translate each English entry to Arabic
3. Fill the matching **Arabic cell** on the left (via the real input, not just the view div)

Works with multiple translation slots per service (name, description, etc.) and virtualized tables.

### Generic element translation

1. Click **Select element on page**
2. Click any element on the page
3. Each tag's text is translated separately into your chosen language
4. Results appear in a floating panel with **Copy All**

Press **Esc** while picking to cancel.

### Supported languages (generic picker)

English, Arabic, Spanish, French, German, Turkish, Urdu, Hindi, Bengali, Portuguese, Russian, Japanese, Korean, Chinese (Simplified/Traditional), Italian, Dutch, Polish, Indonesian, Persian.

### Limits

- Selections with more than 200 text segments are capped (first 200 translated)
- Uses Google Translate's free endpoint (no API key required)

## Project structure

```
zyadat-extension/
├── manifest.json
├── background/background.js    # Translation API calls
├── content/
│   ├── content.js              # Duplicate selector
│   └── translate.js            # Element picker + results panel
├── popup/                      # Extension popup UI
└── icons/
```

## Reload after changes

Go to `chrome://extensions`, click the refresh icon on the extension card, then reload the page you're working on.
