# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Hyprwright** — a static, zero-build web app that lets a user pick [Hyprland](https://hyprland.org) compositor settings and see a live visual mock-up of a Linux desktop react in real time, then copy/download a valid `hyprland.conf`. The entire site lives in `docs/` so it can be served by GitHub Pages (Settings → Pages → Deploy from a branch → `/docs`).

There is **no build step, no package manager, no framework** — plain HTML/CSS/ES. The `.js` files are loaded directly via `<script>` tags in dependency order.

## Commands

```bash
# Run locally (any static server works)
cd docs && python3 -m http.server 8000   # http://localhost:8000

# Syntax-check the JS (no test suite exists)
node -c docs/js/schema.js docs/js/app.js docs/js/preview.js docs/js/generator.js

# Smoke-test the config generator headlessly (Node has no DOM, but generator.js
# only needs window). schema.js must be required first to populate window.Hypr:
node -e 'global.window={};require("./docs/js/schema.js");require("./docs/js/generator.js");console.log(window.Hypr.generateConfig(window.Hypr.buildDefaultState()))'
```

There is no linter, test runner, or CI configured.

## Architecture

Everything communicates through a single global namespace, **`window.Hypr`**, and a single mutable **`STATE`** object shaped as `state[sectionId][fieldKey]`. The four modules are deliberately decoupled so they could be (and were) built independently against one contract.

**`js/schema.js` is the single source of truth.** It exports `SCHEMA` (an array of sections, each with typed fields), `WALLPAPERS` (gradient presets), and `buildDefaultState()`. Field types are `slider | color | toggle | select`. Each field carries a `hypr` dotted keyword path (e.g. `decoration:blur:enabled`) that the generator uses. **To add a setting, add one field to `SCHEMA`** — the control, preview hook, and config line all derive from it; do not hard-code fields in the other modules.

The data flow on every change:

```
app.js (owns STATE, builds controls from SCHEMA)
   │  on any input → setValue() → update()
   ├──► window.Hypr.renderPreview(state)   // preview.js repaints the mock desktop
   └──► window.Hypr.generateConfig(state)  // generator.js returns hyprland.conf text
```

- **`js/app.js`** — owns `STATE`, builds the control panel from `SCHEMA` (one builder per field type), wires Reset/Randomize/Copy/Download, the section scroll-spy nav, and the mock-bar clock. It is the only module that mutates state.
- **`js/preview.js`** — defines `renderPreview(state)`. It **fully owns** the `#windows`, `#wallpaper`, and `#bar-title` DOM and styles the window tiles entirely with **inline styles** (so `style.css` never needs to know its internals). It is idempotent, defensive (clamps/sanitizes every value, since Randomize produces out-of-range input), and wrapped to never throw.
- **`js/generator.js`** — defines `generateConfig(state)` → string. Defensive (falls back to schema defaults). Converts UI `#rrggbb` colors to Hyprland `rgba(RRGGBBAA)`. The active border is emitted as a **gradient**: `col.active_border = rgba(c1ff) rgba(c2ff) <angle>deg`. The `theme` section is `preview_only` and is emitted only as a trailing comment hint, never as a real config block.
- **`css/style.css`** — owns everything *except* the window tiles: the 3-column app grid, the atmospheric background layers (`.bg-grid/.bg-glow/.bg-noise`), the monitor bezel + faux waybar, and all custom controls. The slider fill uses a `--fill` CSS variable that `app.js` sets per-input.

### Conventions worth knowing

- **Script load order matters**: `schema.js` → `preview.js` → `generator.js` → `app.js` (later files read `window.Hypr` populated by earlier ones).
- **CSS gradient-border trick** (in `preview.js`): the focused tile's border uses the padding-box/border-box double-background technique. A plain `<color>` is only valid in the *final* layer of the `background` shorthand, so the inner fill is written as `linear-gradient(color,color)` — writing a bare color there silently invalidates the whole declaration and the border disappears.
- **Design system is locked** and shared between `preview.js` (inline) and `style.css` (`:root` vars): near-black bg, cyan `#2de2ff` / spring-green `#3affab` accents, magenta `#ff3d8b` sparingly; fonts Bricolage Grotesque (display) + IBM Plex Mono (body/code). Keep both modules in sync if the palette changes.
