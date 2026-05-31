/* =============================================================================
 * Hyprland Config Helper — APP (wiring & control panel)
 * -----------------------------------------------------------------------------
 * Builds the control panel from SCHEMA, owns the mutable STATE, and on every
 * change re-renders the live preview + regenerates the config text.
 *
 * Depends on the contract published on window.Hypr:
 *   - SCHEMA, WALLPAPERS, buildDefaultState   (schema.js)
 *   - renderPreview(state)                    (preview.js)
 *   - generateConfig(state)  -> string        (generator.js)
 * ===========================================================================*/
(function () {
  'use strict';

  const { SCHEMA, buildDefaultState } = window.Hypr;
  let state = buildDefaultState();

  const $ = (sel, root = document) => root.querySelector(sel);

  /* ---- central update: mutate state -> repaint preview + output ---------- */
  function update() {
    try { window.Hypr.renderPreview(state); }
    catch (e) { console.error('preview render failed', e); }
    try { $('#config-output').textContent = window.Hypr.generateConfig(state); }
    catch (e) { console.error('config generation failed', e); }
  }

  function setValue(sectionId, key, value) {
    state[sectionId][key] = value;
    update();
  }

  /* ---- control builders -------------------------------------------------- */
  function buildSlider(sectionId, field) {
    const wrap = document.createElement('label');
    wrap.className = 'ctrl ctrl--slider';
    wrap.dataset.field = field.key;

    const isFloat = field.step && field.step < 1;
    const fmt = (v) => (isFloat ? Number(v).toFixed(2) : String(v)) + (field.unit ? field.unit : '');

    wrap.innerHTML = `
      <span class="ctrl__row">
        <span class="ctrl__label">${field.label}</span>
        <output class="ctrl__value"></output>
      </span>
      <input class="ctrl__range" type="range" min="${field.min}" max="${field.max}" step="${field.step}">
      ${field.note ? `<span class="ctrl__note">${field.note}</span>` : ''}`;

    const input = $('.ctrl__range', wrap);
    const out = $('.ctrl__value', wrap);
    input.value = state[sectionId][field.key];
    out.textContent = fmt(input.value);

    input.addEventListener('input', () => {
      const v = isFloat ? parseFloat(input.value) : parseInt(input.value, 10);
      out.textContent = fmt(v);
      // reflect fill progress for styling
      const pct = ((v - field.min) / (field.max - field.min)) * 100;
      input.style.setProperty('--fill', pct + '%');
      setValue(sectionId, field.key, v);
    });
    const pct0 = ((parseFloat(input.value) - field.min) / (field.max - field.min)) * 100;
    input.style.setProperty('--fill', pct0 + '%');
    return wrap;
  }

  function buildColor(sectionId, field) {
    const wrap = document.createElement('label');
    wrap.className = 'ctrl ctrl--color';
    wrap.dataset.field = field.key;
    wrap.innerHTML = `
      <span class="ctrl__row">
        <span class="ctrl__label">${field.label}</span>
        <span class="ctrl__hex"></span>
      </span>
      <span class="swatch">
        <input class="swatch__input" type="color">
        <span class="swatch__chip"></span>
      </span>`;
    const input = $('.swatch__input', wrap);
    const chip = $('.swatch__chip', wrap);
    const hex = $('.ctrl__hex', wrap);
    input.value = state[sectionId][field.key];
    chip.style.background = input.value;
    hex.textContent = input.value.toUpperCase();
    input.addEventListener('input', () => {
      chip.style.background = input.value;
      hex.textContent = input.value.toUpperCase();
      setValue(sectionId, field.key, input.value);
    });
    return wrap;
  }

  function buildToggle(sectionId, field) {
    const wrap = document.createElement('label');
    wrap.className = 'ctrl ctrl--toggle';
    wrap.dataset.field = field.key;
    wrap.innerHTML = `
      <span class="ctrl__label">${field.label}</span>
      <span class="switch"><input type="checkbox"><span class="switch__track"></span></span>`;
    const input = $('input', wrap);
    input.checked = !!state[sectionId][field.key];
    input.addEventListener('change', () => setValue(sectionId, field.key, input.checked));
    return wrap;
  }

  function buildSelect(sectionId, field) {
    const wrap = document.createElement('div');
    wrap.className = 'ctrl ctrl--select';
    wrap.dataset.field = field.key;
    const seg = field.options.length <= 4;
    if (seg) {
      wrap.innerHTML = `<span class="ctrl__label">${field.label}</span><div class="seg"></div>`;
      const segWrap = $('.seg', wrap);
      field.options.forEach((opt) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'seg__btn';
        b.textContent = opt.label;
        b.dataset.value = opt.value;
        if (state[sectionId][field.key] === opt.value) b.classList.add('is-active');
        b.addEventListener('click', () => {
          segWrap.querySelectorAll('.seg__btn').forEach((x) => x.classList.remove('is-active'));
          b.classList.add('is-active');
          setValue(sectionId, field.key, opt.value);
        });
        segWrap.appendChild(b);
      });
    } else {
      wrap.innerHTML = `<span class="ctrl__label">${field.label}</span>
        <select class="ctrl__dropdown">${field.options
          .map((o) => `<option value="${o.value}">${o.label}</option>`).join('')}</select>`;
      const sel = $('select', wrap);
      sel.value = state[sectionId][field.key];
      sel.addEventListener('change', () => setValue(sectionId, field.key, sel.value));
    }
    return wrap;
  }

  function buildField(sectionId, field) {
    switch (field.type) {
      case 'slider': return buildSlider(sectionId, field);
      case 'color':  return buildColor(sectionId, field);
      case 'toggle': return buildToggle(sectionId, field);
      case 'select': return buildSelect(sectionId, field);
      default: return document.createComment('unknown field ' + field.key);
    }
  }

  /* ---- render whole panel ------------------------------------------------ */
  function renderPanel() {
    const controls = $('#controls');
    const nav = $('#sectnav');
    controls.innerHTML = '';
    nav.innerHTML = '';

    SCHEMA.forEach((section, i) => {
      // nav chip
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'sectnav__chip' + (i === 0 ? ' is-active' : '');
      chip.textContent = section.title;
      chip.dataset.target = section.id;
      chip.addEventListener('click', () => {
        const el = document.getElementById('sect-' + section.id);
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      nav.appendChild(chip);

      // section block
      const block = document.createElement('section');
      block.className = 'cgroup';
      block.id = 'sect-' + section.id;
      block.innerHTML = `
        <div class="cgroup__head">
          <h3 class="cgroup__title">${section.title}</h3>
          <p class="cgroup__blurb">${section.blurb}</p>
        </div>
        <div class="cgroup__fields"></div>`;
      const fields = $('.cgroup__fields', block);
      section.fields.forEach((f) => fields.appendChild(buildField(section.id, f)));
      controls.appendChild(block);
    });

    // scroll-spy for nav active state
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const id = entry.target.id.replace('sect-', '');
          nav.querySelectorAll('.sectnav__chip').forEach((c) =>
            c.classList.toggle('is-active', c.dataset.target === id));
        }
      });
    }, { root: controls, rootMargin: '-10% 0px -70% 0px' });
    SCHEMA.forEach((s) => obs.observe(document.getElementById('sect-' + s.id)));
  }

  /* ---- toast ------------------------------------------------------------- */
  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('is-shown');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('is-shown'), 1800);
  }

  /* ---- top-level actions ------------------------------------------------- */
  function reset() {
    state = buildDefaultState();
    renderPanel();
    update();
    toast('Reset to defaults');
  }

  function randomize() {
    const rnd = (a, b) => a + Math.random() * (b - a);
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const randColor = () => '#' + Array.from({ length: 3 }, () =>
      Math.floor(rnd(40, 255)).toString(16).padStart(2, '0')).join('');
    SCHEMA.forEach((section) => {
      section.fields.forEach((f) => {
        if (f.type === 'slider') {
          const v = f.step < 1 ? +rnd(f.min, f.max).toFixed(2)
            : Math.round(rnd(f.min, f.max) / f.step) * f.step;
          state[section.id][f.key] = v;
        } else if (f.type === 'color') {
          state[section.id][f.key] = randColor();
        } else if (f.type === 'toggle') {
          state[section.id][f.key] = Math.random() > 0.35;
        } else if (f.type === 'select') {
          state[section.id][f.key] = pick(f.options).value;
        }
      });
    });
    renderPanel();
    update();
    toast('Randomized ✦');
  }

  async function copyConfig() {
    const text = $('#config-output').textContent;
    try {
      await navigator.clipboard.writeText(text);
      toast('Copied to clipboard');
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast('Copied to clipboard'); }
      catch { toast('Copy failed — select manually'); }
      ta.remove();
    }
  }

  function downloadConfig() {
    const text = $('#config-output').textContent;
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'hyprland.conf';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    toast('Downloaded hyprland.conf');
  }

  /* ---- live clock in the mock bar --------------------------------------- */
  function tickClock() {
    const el = document.getElementById('bar-clock');
    if (!el) return;
    const d = new Date();
    el.textContent = String(d.getHours()).padStart(2, '0') + ':' +
                     String(d.getMinutes()).padStart(2, '0');
  }

  /* ---- boot -------------------------------------------------------------- */
  function init() {
    renderPanel();
    update();
    tickClock();
    setInterval(tickClock, 10000);

    $('#btn-reset').addEventListener('click', reset);
    $('#btn-randomize').addEventListener('click', randomize);
    $('#btn-copy').addEventListener('click', copyConfig);
    $('#btn-download').addEventListener('click', downloadConfig);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
