# Hyprwright

A **visual [Hyprland](https://hyprland.org) config helper**. Pick your settings with
sliders, color pickers and toggles, and watch a live mock-up of your desktop update in
real time — gaps, borders, gradient border, corner rounding, blur, shadows, opacity,
dim, layout and animations. When it looks right, copy or download a ready-to-use
`hyprland.conf`.

> Not affiliated with the Hyprland project. Built for ricers.

## Live site

Served as a static site from [`docs/`](docs/) via GitHub Pages.

### Enable GitHub Pages

1. Push this repo to GitHub.
2. **Settings → Pages → Build and deployment**
   - **Source:** *Deploy from a branch*
   - **Branch:** `main` (or your default) · **Folder:** `/docs`
3. Wait for the deploy; your site appears at `https://<user>.github.io/<repo>/`.

## Run locally

No build step — it's vanilla HTML/CSS/JS.

```bash
cd docs
python3 -m http.server 8000
# open http://localhost:8000
```

## Project layout

```
docs/
├── index.html        # structure, font links, script order
├── css/style.css     # full theme ("compositor control room" aesthetic)
└── js/
    ├── schema.js     # the shared contract: config fields, defaults, wallpapers
    ├── preview.js    # live visual desktop mock-up renderer
    ├── generator.js  # STATE -> valid hyprland.conf text
    └── app.js        # control panel, state, wiring (copy / download / randomize)
```

### How it fits together

`schema.js` is the single source of truth. `app.js` builds the control panel from it
and holds the mutable `STATE`. On every change it calls `Hypr.renderPreview(state)`
(repaints the mock desktop) and `Hypr.generateConfig(state)` (regenerates the config
text). To add a new setting, add one field to `SCHEMA` — the control, the preview hook
and the config line follow from there.

## Settings covered

- **General** — inner/outer gaps, border size, active **gradient** border (two colors +
  angle), inactive border, layout (dwindle / master), resize-on-border.
- **Decoration** — corner rounding, active/inactive opacity, blur (size + passes),
  drop shadow (range + color), dim inactive (+ strength).
- **Animations** — enable, easing curve (smooth / snappy / bouncy / linear), speed.
- **Wallpaper & vibe** — preview backdrop preset.
