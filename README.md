# Duplicate Provider Selector

Chrome extension that finds duplicate **provider service IDs** in SMM panel service tables and checks their checkboxes — keeping one row unchecked per duplicate ID.

## Install (unpacked)

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select this folder (`zyadat-extension`)

## Usage

1. Open your admin **Services** page (the one with `.service-table__container`)
2. Filter as needed (e.g. by provider)
3. Click the extension icon
4. Choose which duplicate to **keep unchecked** (first or last)
5. Click **Run**

The extension scrolls the virtualized table twice: once to scan all rows, once to check duplicates.

## Options

| Setting | Description |
|--------|-------------|
| **Keep first row** | Leaves the topmost duplicate unchecked, checks the rest |
| **Keep last row** | Leaves the bottommost duplicate unchecked |
| **Scroll delay** | Milliseconds between scroll steps (increase if rows are missed) |

## How it works

- Groups rows by `.service-table__provider-service-id`
- If provider ID `3001` appears 3 times → checks 2, leaves 1 unchecked
- Uses native checkbox `click()` so the panel's mass-action counter updates correctly
