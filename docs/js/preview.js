/*
 * preview.js — LIVE VISUAL PREVIEW renderer for the Hyprland config helper.
 *
 * Contract:
 *   window.Hypr.renderPreview(state)
 *     - Idempotent: called on every settings change. Never throws.
 *     - state shape: state[sectionId][fieldKey], exactly as produced by
 *       schema.js buildDefaultState().
 *     - Owns DOM inside #preview only:
 *         #wallpaper   -> background image (window.Hypr.WALLPAPERS[value])
 *         #bar         -> top bar; we update #bar-title text
 *         #windows     -> we OWN this fully: build/destroy/style window tiles,
 *                         set its data-layout attribute, pad it with gaps_out,
 *                         space tiles with gaps_in.
 *
 * The window tiles are 100% self-sufficient: every visual property is set via
 * inline styles / JS so style.css never needs to know our internals.
 *
 * This file is dependency-free, modern ES, and defensive: any missing field
 * falls back to a sane default so a partially-built state can never break the
 * preview.
 */
(function () {
  'use strict';

  // Namespace bootstrap (schema.js may not have run yet in some orderings).
  window.Hypr = window.Hypr || {};

  // --- App palette ----------------------------------------------------------
  const PAL = {
    cyan: '#2de2ff',
    spring: '#3affab',
    magenta: '#ff3d8b',
    text: '#c6d0e0',
    dim: '#7c89a0',
    bg: '#0b0e16',
    bgSoft: '#0f131e',
  };
  const FONT = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

  // ==========================================================================
  // Small, total helpers — every one returns a safe value, never throws.
  // ==========================================================================

  /** Read state[section][field] with a fallback. */
  function get(state, section, field, fallback) {
    try {
      const s = state && state[section];
      if (s && s[field] !== undefined && s[field] !== null) return s[field];
    } catch (_) {
      /* ignore */
    }
    return fallback;
  }

  function num(v, fallback) {
    const n = typeof v === 'number' ? v : parseFloat(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function bool(v, fallback) {
    if (typeof v === 'boolean') return v;
    if (v === 'true' || v === 1 || v === '1') return true;
    if (v === 'false' || v === 0 || v === '0') return false;
    return fallback === undefined ? false : fallback;
  }

  function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
  }

  /**
   * Normalize many color spellings into a usable CSS color.
   * Hyprland configs often use rgba(RRGGBBAA) / 0xAARRGGBB style strings;
   * we accept #rgb / #rrggbb / #rrggbbaa / rgb()/rgba() / 0x.. and bare hex.
   */
  function toCssColor(v, fallback) {
    if (typeof v !== 'string') return fallback;
    let s = v.trim();
    if (!s) return fallback;
    if (s.startsWith('rgb') || s.startsWith('hsl')) return s; // already CSS
    s = s.replace(/^0x/i, '').replace(/^#/, '');
    if (/^[0-9a-f]{3}$/i.test(s)) return '#' + s;
    if (/^[0-9a-f]{6}$/i.test(s)) return '#' + s;
    if (/^[0-9a-f]{8}$/i.test(s)) {
      // Treat as RRGGBBAA (Hyprland's common rgba() form).
      const r = parseInt(s.slice(0, 2), 16);
      const g = parseInt(s.slice(2, 4), 16);
      const b = parseInt(s.slice(4, 6), 16);
      const a = parseInt(s.slice(6, 8), 16) / 255;
      return `rgba(${r},${g},${b},${a.toFixed(3)})`;
    }
    return fallback;
  }

  /** Parse a color to {r,g,b} ints (best effort). Returns null on failure. */
  function rgbParts(color) {
    if (typeof color !== 'string') return null;
    let s = color.trim();
    const m = s.match(/rgba?\(([^)]+)\)/i);
    if (m) {
      const p = m[1].split(',').map((x) => parseFloat(x));
      if (p.length >= 3) return { r: p[0] | 0, g: p[1] | 0, b: p[2] | 0 };
    }
    s = s.replace(/^0x/i, '').replace(/^#/, '');
    if (/^[0-9a-f]{3}$/i.test(s)) {
      return {
        r: parseInt(s[0] + s[0], 16),
        g: parseInt(s[1] + s[1], 16),
        b: parseInt(s[2] + s[2], 16),
      };
    }
    if (s.length >= 6 && /^[0-9a-f]{6}/i.test(s)) {
      return {
        r: parseInt(s.slice(0, 2), 16),
        g: parseInt(s.slice(2, 4), 16),
        b: parseInt(s.slice(4, 6), 16),
      };
    }
    return null;
  }

  /** Build an rgba() string from any color + explicit alpha. */
  function rgba(color, alpha) {
    const p = rgbParts(color) || { r: 0, g: 0, b: 0 };
    return `rgba(${p.r},${p.g},${p.b},${clamp(num(alpha, 1), 0, 1)})`;
  }

  function el(tag, css, text) {
    const node = document.createElement(tag);
    if (css) node.style.cssText = css;
    if (text != null) node.textContent = text;
    return node;
  }

  // ==========================================================================
  // Animation easing map (matches the schema's `curve` choices).
  // ==========================================================================
  const CURVES = {
    smooth: 'cubic-bezier(0.05,0.9,0.1,1.05)',
    snappy: 'cubic-bezier(0.2,0.9,0.1,1)',
    bouncy: 'cubic-bezier(0.34,1.56,0.64,1)',
    linear: 'linear',
  };

  // ==========================================================================
  // Tile content builders — each returns a DOM node that fills a tile body.
  // They use the app palette and look like a real riced desktop.
  // ==========================================================================

  /** Row of macOS-ish window dots used as a faux titlebar. */
  function titleBar(label) {
    const bar = el(
      'div',
      `display:flex;align-items:center;gap:7px;padding:7px 10px;flex:0 0 auto;` +
        `border-bottom:1px solid rgba(255,255,255,0.06);` +
        `background:linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0));`
    );
    ['#ff5f57', '#febc2e', '#28c840'].forEach((c) => {
      bar.appendChild(
        el(
          'span',
          `width:9px;height:9px;border-radius:50%;background:${c};` +
            `box-shadow:0 0 4px ${rgba(c, 0.6)};flex:0 0 auto;`
        )
      );
    });
    bar.appendChild(
      el(
        'span',
        `margin-left:6px;font:600 11px/1 ${FONT};color:${PAL.dim};` +
          `white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`,
        label || ''
      )
    );
    return bar;
  }

  /** Focused tile = terminal with neofetch-style block + blinking prompt. */
  function terminalContent() {
    const wrap = el(
      'div',
      `flex:1 1 auto;display:flex;flex-direction:column;min-height:0;overflow:hidden;`
    );
    wrap.appendChild(titleBar('kitty'));

    const body = el(
      'div',
      `flex:1 1 auto;display:flex;gap:14px;padding:14px;min-height:0;` +
        `font:13px/1.5 ${FONT};color:${PAL.text};overflow:hidden;`
    );

    // ASCII logo (left), cyan.
    const logo = el(
      'pre',
      `margin:0;color:${PAL.cyan};font:12px/1.2 ${FONT};` +
        `text-shadow:0 0 8px ${rgba(PAL.cyan, 0.5)};flex:0 0 auto;white-space:pre;`,
      [
        '      /\\      ',
        '     /  \\     ',
        '    /\\   \\    ',
        '   /  __  \\   ',
        '  /  (  )  \\  ',
        ' / __|  |__ \\ ',
        '/.`        `.\\',
      ].join('\n')
    );
    body.appendChild(logo);

    // neofetch key/value block (right).
    const info = el('div', `flex:1 1 auto;min-width:0;`);
    info.appendChild(
      el(
        'div',
        `color:${PAL.spring};font-weight:600;`,
        'mike@archbox'
      )
    );
    info.appendChild(
      el('div', `color:${PAL.dim};margin-bottom:6px;`, '-----------')
    );
    const rows = [
      ['OS', 'Arch Linux x86_64'],
      ['WM', 'Hyprland'],
      ['Shell', 'zsh 5.9'],
      ['Term', 'kitty'],
      ['CPU', 'AMD Ryzen 7'],
    ];
    rows.forEach(([k, v]) => {
      const r = el('div', `display:flex;gap:8px;white-space:nowrap;`);
      r.appendChild(
        el('span', `color:${PAL.cyan};font-weight:600;width:46px;flex:0 0 auto;`, k)
      );
      r.appendChild(el('span', `color:${PAL.text};`, v));
      info.appendChild(r);
    });

    // color swatch bars (the classic neofetch palette row).
    const swatches = el('div', `display:flex;gap:4px;margin-top:8px;`);
    [PAL.magenta, PAL.cyan, PAL.spring, '#febc2e', '#7c5cff', PAL.text].forEach(
      (c) => {
        swatches.appendChild(
          el('span', `width:16px;height:9px;border-radius:2px;background:${c};`)
        );
      }
    );
    info.appendChild(swatches);
    body.appendChild(info);
    wrap.appendChild(body);

    // Prompt line with blinking caret.
    const prompt = el(
      'div',
      `flex:0 0 auto;padding:8px 14px 12px;font:13px/1.4 ${FONT};` +
        `display:flex;align-items:center;gap:6px;white-space:nowrap;overflow:hidden;`
    );
    prompt.appendChild(el('span', `color:${PAL.spring};font-weight:600;`, '➜'));
    prompt.appendChild(el('span', `color:${PAL.cyan};font-weight:600;`, '~/.config/hypr'));
    prompt.appendChild(el('span', `color:${PAL.text};`, 'hyprctl reload'));
    const caret = el(
      'span',
      `display:inline-block;width:8px;height:15px;background:${PAL.text};` +
        `margin-left:2px;animation:hyprCaret 1s steps(1) infinite;`
    );
    prompt.appendChild(caret);
    wrap.appendChild(prompt);
    return wrap;
  }

  /** A code-editor tile with line numbers + faux syntax highlighting. */
  function editorContent() {
    const wrap = el(
      'div',
      `flex:1 1 auto;display:flex;flex-direction:column;min-height:0;overflow:hidden;`
    );
    wrap.appendChild(titleBar('nvim  hyprland.conf'));

    const body = el(
      'div',
      `flex:1 1 auto;display:flex;font:12px/1.65 ${FONT};` +
        `padding:10px 0;min-height:0;overflow:hidden;`
    );
    const gutter = el(
      'div',
      `flex:0 0 auto;text-align:right;padding:0 10px;color:${PAL.dim};` +
        `opacity:0.6;border-right:1px solid rgba(255,255,255,0.05);user-select:none;`
    );
    const code = el('div', `flex:1 1 auto;padding:0 12px;min-width:0;overflow:hidden;`);

    // [text, color] token lines.
    const lines = [
      [['general {', PAL.dim]],
      [['  gaps_in ', PAL.cyan], ['= ', PAL.dim], ['5', PAL.magenta]],
      [['  gaps_out ', PAL.cyan], ['= ', PAL.dim], ['12', PAL.magenta]],
      [['  border_size ', PAL.cyan], ['= ', PAL.dim], ['2', PAL.magenta]],
      [['  layout ', PAL.cyan], ['= ', PAL.dim], ['dwindle', PAL.spring]],
      [['}', PAL.dim]],
      [['decoration {', PAL.dim]],
      [['  rounding ', PAL.cyan], ['= ', PAL.dim], ['10', PAL.magenta]],
      [['  blur ', PAL.cyan], ['{ ', PAL.dim], ['enabled', PAL.spring], [' = yes }', PAL.dim]],
      [['}', PAL.dim]],
    ];
    lines.forEach((toks, i) => {
      gutter.appendChild(el('div', '', String(i + 1)));
      const ln = el('div', `white-space:pre;`);
      toks.forEach(([t, c]) => ln.appendChild(el('span', `color:${c};`, t)));
      if (toks.length === 0) ln.appendChild(el('span', '', ' '));
      code.appendChild(ln);
    });
    body.appendChild(gutter);
    body.appendChild(code);
    wrap.appendChild(body);
    return wrap;
  }

  /** A now-playing / music widget tile. */
  function musicContent() {
    const wrap = el(
      'div',
      `flex:1 1 auto;display:flex;flex-direction:column;min-height:0;` +
        `overflow:hidden;padding:14px;font:12px ${FONT};color:${PAL.text};` +
        `justify-content:space-between;`
    );

    const top = el('div', `display:flex;gap:12px;align-items:center;`);
    // Album art block with a gradient.
    top.appendChild(
      el(
        'div',
        `width:52px;height:52px;flex:0 0 auto;border-radius:8px;` +
          `background:linear-gradient(135deg,${PAL.magenta},${PAL.cyan});` +
          `box-shadow:0 4px 14px ${rgba(PAL.magenta, 0.4)};` +
          `display:flex;align-items:center;justify-content:center;` +
          `font-size:22px;`,
        '♪'
      )
    );
    const meta = el('div', `min-width:0;overflow:hidden;`);
    meta.appendChild(
      el(
        'div',
        `color:${PAL.spring};font-weight:600;font-size:13px;` +
          `white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`,
        'Midnight City'
      )
    );
    meta.appendChild(
      el(
        'div',
        `color:${PAL.dim};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`,
        'M83 — Hurry Up, We’re Dreaming'
      )
    );
    top.appendChild(meta);
    wrap.appendChild(top);

    // Progress bar.
    const prog = el(
      'div',
      `height:5px;border-radius:3px;background:rgba(255,255,255,0.1);overflow:hidden;`
    );
    prog.appendChild(
      el(
        'div',
        `width:62%;height:100%;border-radius:3px;` +
          `background:linear-gradient(90deg,${PAL.cyan},${PAL.spring});`
      )
    );
    const times = el(
      'div',
      `display:flex;justify-content:space-between;color:${PAL.dim};font-size:11px;`
    );
    times.appendChild(el('span', '', '2:31'));
    times.appendChild(el('span', '', '4:03'));

    // Transport controls.
    const ctrl = el(
      'div',
      `display:flex;gap:16px;justify-content:center;color:${PAL.text};font-size:15px;`
    );
    ['⏮', '⏸', '⏭'].forEach((c) =>
      ctrl.appendChild(el('span', `cursor:default;`, c))
    );

    const bottom = el('div', `display:flex;flex-direction:column;gap:6px;`);
    bottom.appendChild(prog);
    bottom.appendChild(times);
    bottom.appendChild(ctrl);
    wrap.appendChild(bottom);
    return wrap;
  }

  /** A small system stats widget tile. */
  function statsContent() {
    const wrap = el(
      'div',
      `flex:1 1 auto;display:flex;flex-direction:column;gap:10px;min-height:0;` +
        `overflow:hidden;padding:14px;font:12px ${FONT};color:${PAL.text};`
    );
    wrap.appendChild(
      el('div', `color:${PAL.cyan};font-weight:600;letter-spacing:0.05em;`, 'btop')
    );
    const stats = [
      ['CPU', 42, PAL.spring],
      ['MEM', 67, PAL.cyan],
      ['GPU', 28, PAL.magenta],
      ['NET', 81, '#febc2e'],
    ];
    stats.forEach(([label, pct, color]) => {
      const row = el('div', `display:flex;align-items:center;gap:8px;`);
      row.appendChild(
        el('span', `width:34px;flex:0 0 auto;color:${PAL.dim};`, label)
      );
      const track = el(
        'div',
        `flex:1 1 auto;height:8px;border-radius:4px;background:rgba(255,255,255,0.08);overflow:hidden;`
      );
      track.appendChild(
        el(
          'div',
          `width:${pct}%;height:100%;background:${color};` +
            `box-shadow:0 0 8px ${rgba(color, 0.6)};border-radius:4px;`
        )
      );
      row.appendChild(track);
      row.appendChild(
        el('span', `width:34px;text-align:right;color:${color};`, pct + '%')
      );
      wrap.appendChild(row);
    });
    return wrap;
  }

  // Pool of "other" (non-focused) tile builders, cycled for variety.
  const OTHER_BUILDERS = [editorContent, musicContent, statsContent];
  const OTHER_TITLES = ['nvim — hyprland.conf', 'Spotify — Now Playing', 'btop'];

  // ==========================================================================
  // One-time CSS injection for keyframes we can't express inline.
  // ==========================================================================
  function ensureKeyframes() {
    if (document.getElementById('hypr-preview-kf')) return;
    const style = el('style');
    style.id = 'hypr-preview-kf';
    style.textContent =
      '@keyframes hyprCaret{0%,50%{opacity:1}50.01%,100%{opacity:0}}';
    document.head.appendChild(style);
  }

  // ==========================================================================
  // Tile factory: produces a fully self-styled window tile.
  // ==========================================================================
  function buildTile(opts) {
    const {
      focused,
      content,
      borderSize,
      rounding,
      activeC1,
      activeC2,
      activeAngle,
      inactiveC,
      opacity,
      blurCss,
      innerBgAlpha,
      shadow,
      transition,
      dimOverlayAlpha,
    } = opts;

    const tile = el('div');
    // Base structural styles common to all tiles.
    let base =
      `position:relative;box-sizing:border-box;overflow:hidden;` +
      `border-radius:${rounding}px;color:${PAL.text};font-family:${FONT};` +
      `display:flex;flex-direction:column;min-width:0;min-height:0;` +
      `opacity:${opacity};transition:${transition};`;

    // Inner background — translucent so backdrop-filter blur shows through.
    const innerBg = rgba(PAL.bg, innerBgAlpha);

    if (borderSize > 0) {
      // padding-box / border-box double-background trick so border-radius is
      // respected for the gradient (focused) or solid (inactive) border.
      // NOTE: in the `background` shorthand a plain <color> is only valid in the
      // FINAL layer. The inner fill lives in a non-final (padding-box) layer, so
      // we express it as a (solid) gradient — keeping every layer an <image> and
      // the whole declaration valid. (A plain color here invalidates it all.)
      const fill = `linear-gradient(${innerBg},${innerBg})`;
      if (focused) {
        base +=
          `background:${fill} padding-box,` +
          `linear-gradient(${activeAngle}deg,${activeC1},${activeC2}) border-box;` +
          `border:${borderSize}px solid transparent;`;
      } else {
        base +=
          `background:${fill} padding-box,` +
          `linear-gradient(${inactiveC},${inactiveC}) border-box;` +
          `border:${borderSize}px solid transparent;`;
      }
    } else {
      base += `background:${innerBg};border:0;`;
    }

    // Blur: makes the wallpaper visible-through-glass like Hyprland blur.
    if (blurCss) {
      base += `backdrop-filter:${blurCss};-webkit-backdrop-filter:${blurCss};`;
    }
    if (shadow) base += `box-shadow:${shadow};`;

    tile.style.cssText = base;

    // Subtle inner top highlight (the "glass" sheen) on focused tiles.
    if (focused) {
      tile.appendChild(
        el(
          'div',
          `position:absolute;inset:0;pointer-events:none;border-radius:inherit;` +
            `background:linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0) 40%);` +
            `z-index:3;`
        )
      );
    }

    // Content layer.
    const layer = el(
      'div',
      `position:relative;z-index:1;flex:1 1 auto;display:flex;` +
        `flex-direction:column;min-height:0;overflow:hidden;border-radius:inherit;`
    );
    if (content) layer.appendChild(content);
    tile.appendChild(layer);

    // Dim-inactive overlay.
    if (!focused && dimOverlayAlpha > 0) {
      tile.appendChild(
        el(
          'div',
          `position:absolute;inset:0;pointer-events:none;z-index:2;` +
            `border-radius:inherit;background:rgba(0,0,0,${dimOverlayAlpha});`
        )
      );
    }
    return tile;
  }

  // ==========================================================================
  // Main render entry point.
  // ==========================================================================
  function renderPreview(state) {
    try {
      ensureKeyframes();

      const preview = document.getElementById('preview');
      if (!preview) return; // nothing to do
      const wallpaperEl = document.getElementById('wallpaper');
      const windowsEl = document.getElementById('windows');
      const barTitleEl = document.getElementById('bar-title');

      // --- theme.wallpaper -> #wallpaper background --------------------------
      if (wallpaperEl) {
        const wpKey = get(state, 'theme', 'wallpaper', null);
        const wallpapers = window.Hypr.WALLPAPERS || {};
        const wpVal = wpKey != null && wallpapers[wpKey] ? wallpapers[wpKey] : null;
        wallpaperEl.style.position = wallpaperEl.style.position || 'absolute';
        if (wpVal) {
          // Accept either a CSS background shorthand (gradient) or a URL.
          const isImagey = /url\(|gradient|http|data:|\.(png|jpe?g|webp|svg)/i.test(
            wpVal
          );
          const wpStr = typeof wpVal === 'string' ? wpVal.trim() : '';
          if (/^(linear|radial|conic)-gradient|^url\(/i.test(wpStr)) {
            wallpaperEl.style.background = wpVal;
          } else if (isImagey) {
            wallpaperEl.style.backgroundImage = `url("${wpVal}")`;
          } else {
            wallpaperEl.style.background = wpVal;
          }
        }
        wallpaperEl.style.backgroundSize = 'cover';
        wallpaperEl.style.backgroundPosition = 'center';
        wallpaperEl.style.backgroundRepeat = 'no-repeat';
      }

      // --- Read all visually-meaningful fields (defensive) -------------------
      const gapsOut = clamp(num(get(state, 'general', 'gaps_out', 12), 12), 0, 120);
      const gapsIn = clamp(num(get(state, 'general', 'gaps_in', 5), 5), 0, 80);
      const layout = String(get(state, 'general', 'layout', 'dwindle'));
      const borderSize = clamp(num(get(state, 'general', 'border_size', 2), 2), 0, 24);

      const activeC1 = toCssColor(
        get(state, 'general', 'active_border_1', '#2de2ff'),
        PAL.cyan
      );
      const activeC2 = toCssColor(
        get(state, 'general', 'active_border_2', '#ff3d8b'),
        PAL.magenta
      );
      const activeAngle = num(get(state, 'general', 'active_border_angle', 45), 45);
      const inactiveC = toCssColor(
        get(state, 'general', 'inactive_border', '#2a2f3a'),
        '#2a2f3a'
      );

      const rounding = clamp(num(get(state, 'decoration', 'rounding', 10), 10), 0, 40);
      const activeOpacity = clamp(
        num(get(state, 'decoration', 'active_opacity', 1), 1),
        0.1,
        1
      );
      const inactiveOpacity = clamp(
        num(get(state, 'decoration', 'inactive_opacity', 1), 1),
        0.1,
        1
      );

      const blurEnabled = bool(get(state, 'decoration', 'blur_enabled', true), true);
      const blurSize = clamp(num(get(state, 'decoration', 'blur_size', 6), 6), 0, 40);
      const blurPasses = clamp(num(get(state, 'decoration', 'blur_passes', 2), 2), 1, 6);

      const shadowEnabled = bool(
        get(state, 'decoration', 'shadow_enabled', true),
        true
      );
      const shadowRange = clamp(
        num(get(state, 'decoration', 'shadow_range', 20), 20),
        0,
        80
      );
      const shadowColor = toCssColor(
        get(state, 'decoration', 'shadow_color', '#000000'),
        '#000000'
      );

      const dimInactive = bool(get(state, 'decoration', 'dim_inactive', false), false);
      const dimStrength = clamp(
        num(get(state, 'decoration', 'dim_strength', 0.5), 0.5),
        0,
        1
      );

      const animEnabled = bool(get(state, 'animations', 'enabled', true), true);
      const animCurve = String(get(state, 'animations', 'curve', 'smooth'));
      const animSpeed = clamp(num(get(state, 'animations', 'speed', 5), 5), 0, 30);

      // --- Derived styles ----------------------------------------------------
      // Hyprland blur ~ size * passes. Scale to a tasteful CSS px radius.
      const blurRadius = blurEnabled
        ? Math.round(clamp(blurSize * Math.sqrt(blurPasses) * 1.4, 1, 60))
        : 0;
      const blurCss = blurEnabled && blurRadius > 0
        ? `blur(${blurRadius}px) saturate(1.25)`
        : '';

      // Translucent inner bg only when blur is on (so the blur is visible);
      // otherwise tiles are near-opaque.
      const innerBgAlpha = blurEnabled ? 0.55 : 0.92;

      // Shadows (focused is stronger / longer).
      let focusShadow = '';
      let otherShadow = '';
      if (shadowEnabled && shadowRange > 0) {
        const r = shadowRange;
        focusShadow =
          `0 ${Math.round(r * 0.55)}px ${Math.round(r * 1.4)}px ` +
          `${rgba(shadowColor, 0.55)}`;
        otherShadow =
          `0 ${Math.round(r * 0.35)}px ${Math.round(r * 0.9)}px ` +
          `${rgba(shadowColor, 0.4)}`;
      }
      // Add a soft glow to the focused border using the gradient's first color.
      if (focusShadow) {
        focusShadow += `, 0 0 ${Math.round(12 + borderSize * 4)}px ${rgba(
          activeC1,
          0.35
        )}`;
      } else if (borderSize > 0) {
        focusShadow = `0 0 ${Math.round(12 + borderSize * 4)}px ${rgba(
          activeC1,
          0.3
        )}`;
      }

      // Transition (drives the live-animating sliders).
      const easing = CURVES[animCurve] || CURVES.smooth;
      const transition = animEnabled
        ? `all ${(animSpeed * 100).toFixed(0)}ms ${easing}`
        : 'none';

      const dimOverlayAlpha = dimInactive ? dimStrength * 0.7 : 0;

      // --- #bar-title -> focused app name ------------------------------------
      if (barTitleEl) {
        barTitleEl.textContent = 'kitty — ~/.config/hypr';
      }

      // --- #windows: layout + rebuild tiles ----------------------------------
      if (!windowsEl) return;

      const isMaster = layout === 'master';
      windowsEl.setAttribute('data-layout', isMaster ? 'master' : 'dwindle');

      // Container = the workspace area; padding = gaps_out, gap = gaps_in.
      windowsEl.style.cssText =
        `box-sizing:border-box;position:absolute;inset:0;` +
        `display:grid;padding:${gapsOut}px;gap:${gapsIn}px;` +
        `width:100%;height:100%;` +
        (isMaster
          ? // master: full-width top row, two side-by-side below.
            `grid-template-columns:1fr 1fr;grid-template-rows:1.4fr 1fr;` +
            `grid-template-areas:'big big' 'a b';`
          : // dwindle: big on left (~60%), two stacked on right.
            `grid-template-columns:1.5fr 1fr;grid-template-rows:1fr 1fr;` +
            `grid-template-areas:'big a' 'big b';`);

      // Shared tile options.
      const common = {
        borderSize,
        rounding,
        activeC1,
        activeC2,
        activeAngle,
        inactiveC,
        blurCss,
        innerBgAlpha,
        transition,
        dimOverlayAlpha,
      };

      // Rebuild children (simple + robust). Cheap for 3 tiles.
      windowsEl.textContent = '';

      // Focused / master tile.
      const big = buildTile(
        Object.assign({}, common, {
          focused: true,
          content: terminalContent(),
          opacity: activeOpacity,
          shadow: focusShadow,
        })
      );
      big.style.gridArea = 'big';
      windowsEl.appendChild(big);

      // Two non-focused tiles (vary content for a lively desktop).
      ['a', 'b'].forEach((area, i) => {
        const builder = OTHER_BUILDERS[i % OTHER_BUILDERS.length];
        const tile = buildTile(
          Object.assign({}, common, {
            focused: false,
            content: builder(),
            opacity: inactiveOpacity,
            shadow: otherShadow,
          })
        );
        tile.style.gridArea = area;
        windowsEl.appendChild(tile);
      });
    } catch (err) {
      // Never throw out of the render path; log for debugging only.
      try {
        // eslint-disable-next-line no-console
        console.error('[Hypr.renderPreview]', err);
      } catch (_) {
        /* noop */
      }
    }
  }

  window.Hypr.renderPreview = renderPreview;
})();
