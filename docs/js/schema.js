/* =============================================================================
 * Hyprland Config Helper — SCHEMA (the shared contract)
 * -----------------------------------------------------------------------------
 * This file is the single source of truth consumed by every other module:
 *   - app.js       builds the control panel from SCHEMA + reads/writes STATE
 *   - preview.js   reads STATE to render the live visual mock-up
 *   - generator.js reads STATE + SCHEMA to emit a valid hyprland.conf
 *
 * STATE shape:  state[sectionId][fieldKey] = value
 *   - color  -> "#rrggbb"   (hex, 6 digits)
 *   - slider -> Number
 *   - toggle -> Boolean
 *   - select -> String (one of option.value)
 *
 * Each field's `hypr` is the dotted Hyprland keyword path (e.g. "decoration:rounding").
 * Colors are emitted by generator.js as rgba(rrggbbaa). Gradient handling for the
 * active border (two colors + angle) is described on those fields via `role`.
 * ===========================================================================*/

const SCHEMA = [
  {
    id: 'general',
    title: 'General',
    blurb: 'Gaps, borders & layout — the bones of your tiling.',
    icon: 'layout',
    fields: [
      { key: 'gaps_in',  label: 'Inner gaps',  hypr: 'general:gaps_in',  type: 'slider', min: 0, max: 30, step: 1, default: 5,  unit: 'px' },
      { key: 'gaps_out', label: 'Outer gaps',  hypr: 'general:gaps_out', type: 'slider', min: 0, max: 60, step: 1, default: 20, unit: 'px' },
      { key: 'border_size', label: 'Border size', hypr: 'general:border_size', type: 'slider', min: 0, max: 12, step: 1, default: 2, unit: 'px' },
      { key: 'active_border_1', label: 'Active border', hypr: 'general:col.active_border', type: 'color', default: '#33ccff', role: 'gradient-start' },
      { key: 'active_border_gradient', label: 'Gradient border', type: 'toggle', default: true, note: 'Off = a single solid color.' },
      { key: 'active_border_2', label: 'Active border (gradient end)', hypr: 'general:col.active_border', type: 'color', default: '#00ff99', role: 'gradient-end', dependsOn: { key: 'active_border_gradient', value: true } },
      { key: 'active_border_angle', label: 'Gradient angle', hypr: 'general:col.active_border', type: 'slider', min: 0, max: 360, step: 5, default: 45, unit: '°', role: 'gradient-angle', dependsOn: { key: 'active_border_gradient', value: true } },
      { key: 'inactive_border', label: 'Inactive border', hypr: 'general:col.inactive_border', type: 'color', default: '#1a2030' },
      { key: 'layout', label: 'Layout engine', hypr: 'general:layout', type: 'select', default: 'dwindle',
        options: [ { value: 'dwindle', label: 'Dwindle' }, { value: 'master', label: 'Master' } ] },
      { key: 'resize_on_border', label: 'Resize on border', hypr: 'general:resize_on_border', type: 'toggle', default: true },
    ],
  },
  {
    id: 'decoration',
    title: 'Decoration',
    blurb: 'Rounding, opacity & the signature Hyprland blur.',
    icon: 'sparkle',
    fields: [
      { key: 'rounding', label: 'Corner rounding', hypr: 'decoration:rounding', type: 'slider', min: 0, max: 26, step: 1, default: 10, unit: 'px' },
      { key: 'active_opacity', label: 'Active opacity', hypr: 'decoration:active_opacity', type: 'slider', min: 0.4, max: 1, step: 0.01, default: 1 },
      { key: 'inactive_opacity', label: 'Inactive opacity', hypr: 'decoration:inactive_opacity', type: 'slider', min: 0.4, max: 1, step: 0.01, default: 0.92 },
      { key: 'blur_enabled', label: 'Blur', hypr: 'decoration:blur:enabled', type: 'toggle', default: true },
      { key: 'blur_size', label: 'Blur size', hypr: 'decoration:blur:size', type: 'slider', min: 1, max: 20, step: 1, default: 8 },
      { key: 'blur_passes', label: 'Blur passes', hypr: 'decoration:blur:passes', type: 'slider', min: 1, max: 5, step: 1, default: 3 },
      { key: 'shadow_enabled', label: 'Drop shadow', hypr: 'decoration:shadow:enabled', type: 'toggle', default: true },
      { key: 'shadow_range', label: 'Shadow range', hypr: 'decoration:shadow:range', type: 'slider', min: 0, max: 60, step: 1, default: 24 },
      { key: 'shadow_color', label: 'Shadow color', hypr: 'decoration:shadow:color', type: 'color', default: '#000000' },
      { key: 'dim_inactive', label: 'Dim inactive', hypr: 'decoration:dim_inactive', type: 'toggle', default: false },
      { key: 'dim_strength', label: 'Dim strength', hypr: 'decoration:dim_strength', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.3 },
    ],
  },
  {
    id: 'animations',
    title: 'Animations',
    blurb: 'Motion curves & speed of every transition.',
    icon: 'motion',
    fields: [
      { key: 'enabled', label: 'Animations', hypr: 'animations:enabled', type: 'toggle', default: true },
      { key: 'curve', label: 'Easing curve', type: 'select', default: 'smooth',
        options: [
          { value: 'smooth',  label: 'Smooth' },
          { value: 'snappy',  label: 'Snappy' },
          { value: 'bouncy',  label: 'Bouncy' },
          { value: 'linear',  label: 'Linear' },
        ] },
      { key: 'speed', label: 'Speed', type: 'slider', min: 1, max: 12, step: 1, default: 5, unit: 'ds',
        note: 'Animation duration in deciseconds (lower = faster).' },
    ],
  },
  {
    id: 'theme',
    title: 'Wallpaper & Vibe',
    blurb: 'Set the backdrop the preview renders against.',
    icon: 'image',
    preview_only: true, // not emitted to hyprland.conf core (used by hyprpaper note)
    fields: [
      { key: 'wallpaper', label: 'Wallpaper', type: 'select', default: 'aurora',
        options: [
          { value: 'aurora',   label: 'Aurora' },
          { value: 'sunset',   label: 'Sunset' },
          { value: 'mono',     label: 'Mono Noir' },
          { value: 'vapor',    label: 'Vaporwave' },
          { value: 'forest',   label: 'Deep Forest' },
        ] },
    ],
  },
];

/* Build the default STATE from SCHEMA defaults. */
function buildDefaultState() {
  const state = {};
  for (const section of SCHEMA) {
    state[section.id] = {};
    for (const field of section.fields) {
      state[section.id][field.key] = field.default;
    }
  }
  return state;
}

/* Wallpaper gradient presets — shared by preview.js (CSS) so both stay in sync. */
const WALLPAPERS = {
  aurora: 'radial-gradient(120% 120% at 20% 10%, #0b2a3a 0%, #093d4f 35%, #0a1622 100%)',
  sunset: 'linear-gradient(160deg, #2b1055 0%, #7597de 100%)',
  mono:   'radial-gradient(120% 120% at 70% 20%, #20242c 0%, #0c0d10 100%)',
  vapor:  'linear-gradient(160deg, #ff6ad5 0%, #c774e8 35%, #6184d8 70%, #26c5e0 100%)',
  forest: 'radial-gradient(120% 120% at 30% 0%, #0f3d2e 0%, #08251c 55%, #04110c 100%)',
};

window.Hypr = window.Hypr || {};
window.Hypr.SCHEMA = SCHEMA;
window.Hypr.WALLPAPERS = WALLPAPERS;
window.Hypr.buildDefaultState = buildDefaultState;
