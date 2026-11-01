/* game-kit 6e0b6f0: js/theme-make.js — edit in game-kit and run tools/kit-sync.js */
// A whole UI theme from a few mood colours (standard 1.9). Pure: no DOM, also used by tools/make-theme.mjs and the tests.
//   makeTheme({ mode: 'dark' | 'light', bg, surface?, text, accent, accent2?, danger?, ok?, font?, radius?, scanlines?, hudAlpha? }) -> { '--gf-…': value }
// Every token css/theme.css defines comes back, and every text / background pair of rule U30 is moved (lightness only, the hue stays) until it
// meets WCAG AA (4.5:1 text, 3:1 marks and borders), so a game picks colours for the mood and never ships unreadable text.
//   game.json  "themeColors": { "mode": "dark", "bg": "#0b0a10", "text": "#efe6d8", "accent": "#d0402a" }   -> applied on top of "theme"
//   themeCss('my-look', tokens) -> '[data-theme~="my-look"] { … }'  (tools/make-theme.mjs writes css/themes.css from js/theme-presets.js)

export const parse = (s) => {
  s = String(s).trim();
  let m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
  if (m) { const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1]; return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: 1 }; }
  m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(s);
  if (!m) throw new Error(`theme-make: not a colour "${s}"`);
  return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
};
const hex = (c) => '#' + [c.r, c.g, c.b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const over = (f, b) => ({ r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a), a: 1 });
const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
const col = (x) => (typeof x === 'string' ? parse(x) : x);
/** WCAG contrast of fg on bg (a translucent bg is put over `under`, a translucent fg over the result) */
export function contrast(fg, bg, under = '#000') { const b = over(col(bg), col(under)), f = over(col(fg), b); const [hi, lo] = [lum(f), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); }
/** a + (b - a) * t, as hex */
export const mix = (a, b, t) => { const x = col(a), y = col(b); return hex({ r: x.r + (y.r - x.r) * t, g: x.g + (y.g - x.g) * t, b: x.b + (y.b - x.b) * t }); };
const rgba = (c, a) => { const x = col(c); return `rgba(${x.r}, ${x.g}, ${x.b}, ${a})`; };
/** move fg toward white or black (whichever its backgrounds are farther from) until it reaches `min` on every bg; the hue is kept */
export function fit(fg, bgs, min = 4.5, under = '#000') {
  bgs = [].concat(bgs);
  const ok = (c) => bgs.every((b) => contrast(c, b, under) >= min);
  if (ok(fg)) return hex(col(fg));
  const darkBg = bgs.reduce((s, b) => s + lum(over(col(b), col(under))), 0) / bgs.length < 0.18;
  for (const target of darkBg ? ['#ffffff', '#000000'] : ['#000000', '#ffffff']) for (let t = 0.04; t <= 1.0001; t += 0.04) { const c = mix(fg, target, t); if (ok(c)) return c; }
  return darkBg ? '#ffffff' : '#000000';
}
/** the ink (near black or near white) that reads best on a filled background */
export const inkOn = (bg, dark = '#141210', light = '#ffffff') => (contrast(dark, bg) >= contrast(light, bg) ? dark : light);

const MG_HUES = ['#ff6b5a', '#6db3ff', '#f0d24a', '#4fd283', '#c996f2'];
const MG_HUES_LIGHT = ['#b3261e', '#1d5aa8', '#7a5a00', '#1e7040', '#7a359f'];

export function makeTheme(o = {}) {
  const dark = (o.mode || 'dark') === 'dark';
  const bg = hex(col(o.bg || (dark ? '#0d0f12' : '#e9e4d6')));
  const surface = hex(col(o.surface || (dark ? mix(bg, '#ffffff', 0.06) : mix(bg, '#ffffff', 0.75))));
  const surface2 = mix(surface, dark ? '#ffffff' : '#000000', dark ? 0.05 : 0.05);
  const acc0 = o.accent || (dark ? '#d0a040' : '#8a3a1a'), acc2 = o.accent2 || (dark ? '#e8c060' : '#8a5a10');
  const danger0 = o.danger || (dark ? '#ff6a58' : '#b3261e'), ok0 = o.ok || (dark ? '#5fd690' : '#2e7a4a');
  const panelA = 0.97, softA = 0.9, panelSoft = rgba(surface, softA);
  const accentSoft = mix(surface, acc0, dark ? 0.2 : 0.12), highlight = mix(surface, acc2, dark ? 0.16 : 0.14);
  const text = fit(o.text || (dark ? '#e8e4dc' : '#262420'), [surface, surface2, accentSoft, highlight, rgba(surface, softA)], 4.6, bg);
  const textDim = fit(mix(text, surface, 0.35), [surface, surface2, panelSoft], 4.6, bg);
  const accent = fit(acc0, [surface, panelSoft], 4.6, bg);
  const accentInk = inkOn(accent);
  const accentHover = (() => { let h = mix(accent, dark ? '#ffffff' : '#000000', 0.12); if (contrast(accentInk, h) < 4.6) h = mix(accent, dark ? '#000000' : '#ffffff', 0.08); return contrast(accentInk, h) >= 4.6 ? h : accent; })();
  const t = {
    '--gf-bg': bg, '--gf-surface': surface, '--gf-surface-2': surface2, '--gf-panel': rgba(surface, panelA), '--gf-panel-soft': panelSoft,
    '--gf-text': text, '--gf-text-dim': textDim, '--gf-accent': accent, '--gf-accent-ink': accentInk, '--gf-accent-2': hex(col(acc2)),
    '--gf-goal': fit(acc2, [surface, panelSoft], 4.6, bg), '--gf-accent-soft': accentSoft, '--gf-highlight': highlight,
    '--gf-heading': fit(o.heading || acc0, [surface], 4.6), '--gf-accent-hover': accentHover,
    '--gf-border': mix(surface, accent, dark ? 0.32 : 0.22), '--gf-border-strong': fit(mix(surface, accent, 0.6), [surface], 3.1),
    '--gf-scrim': dark ? 'rgba(0, 0, 0, 0.5)' : rgba(mix(bg, '#000000', 0.7), 0.3), '--gf-danger': fit(danger0, [surface], 3.1), '--gf-ok': fit(ok0, [surface], 3.1),
    '--gf-overlay': dark ? 'rgba(0, 0, 0, 0.7)' : rgba(mix(bg, '#000000', 0.8), 0.5), '--gf-overlay-strong': dark ? 'rgba(0, 0, 0, 0.85)' : rgba(mix(bg, '#000000', 0.8), 0.72),
  };
  // the paired blocks (rule U30): a tint of the block's colour, its text and its caption both AA on it
  const block = (name, hue, k = dark ? 0.16 : 0.12) => {
    const b = mix(surface, hue, k);
    t[`--gf-${name}-bg`] = b; t[`--gf-${name}-text`] = fit(text, [b], 4.6); t[`--gf-${name}-label`] = fit(hue, [b], 4.6); t[`--gf-${name}-line`] = fit(hue, [b], 3.1);
  };
  block('note', acc2); block('hint', ok0); block('warn', danger0); block('quote', textDim, dark ? 0.06 : 0.08); block('voice', accent, dark ? 0.1 : 0.08);
  t['--gf-chip-bg'] = mix(surface, accent, dark ? 0.24 : 0.16); t['--gf-chip-text'] = fit(text, [t['--gf-chip-bg']], 4.6);
  t['--gf-badge-bg'] = dark ? fit(danger0, [surface], 3.1) : fit(danger0, ['#ffffff'], 4.6); t['--gf-badge-text'] = inkOn(t['--gf-badge-bg'], '#1a0603');
  t['--gf-code-bg'] = mix(surface, dark ? '#000000' : '#000000', dark ? 0.35 : 0.07); t['--gf-code-text'] = fit(text, [t['--gf-code-bg']], 4.6);
  // the HUD: see-through panels of the surface; the resting alphas are raised until the text is AA over white AND black (whatever the 3D view is)
  const hudOk = (a) => ['#ffffff', '#000000'].every((u) => contrast(text, { ...col(surface), a }, u) >= 4.6);
  let ha = o.hudAlpha ?? 0.72; while (!hudOk(ha) && ha < 0.97) ha = +(ha + 0.02).toFixed(2);
  let hb = Math.min(ha, 0.6); while (!hudOk(hb) && hb < 0.97) hb = +(hb + 0.02).toFixed(2);
  Object.assign(t, { '--gf-hud-bg': surface, '--gf-hud-alpha': String(ha), '--gf-hud-btn-alpha': String(hb), '--gf-hud-alpha-active': String(Math.max(0.92, ha)) });
  // mini games: their own dark (or paper) panel in the theme's colours
  const mgBg = dark ? mix(bg, accent, 0.05) : mix(surface, acc2, 0.06), mgBg2 = dark ? mix(surface, accent, 0.04) : surface, mgBtn = dark ? mix(surface, accent, 0.12) : mix(surface, acc2, 0.14);
  const mgs = [mgBg, mgBg2, mgBtn];
  Object.assign(t, {
    '--gf-mg-bg': mgBg, '--gf-mg-bg-2': mgBg2, '--gf-mg-btn': mgBtn, '--gf-mg-line': mix(mgBg, accent, 0.4),
    '--gf-mg-ink': fit(text, mgs, 4.6), '--gf-mg-accent': fit(accent, mgs, 4.6), '--gf-mg-warn': fit(acc2, mgs, 4.6), '--gf-mg-dim': fit(textDim, mgs, 4.6), '--gf-mg-bad': fit(danger0, mgs, 4.6),
  });
  (dark ? MG_HUES : MG_HUES_LIGHT).forEach((h, i) => { t[`--gf-mg-c${i + 1}`] = fit(h, mgs, 4.6); });
  // the map: room fills near the surface, the names (--gf-text) AA on them even at 55% over the page
  const room = (hue, k) => { let f = mix(surface, hue, k); for (let i = 0; i < 12 && [f, { ...col(f), a: 0.55 }].some((b) => contrast(text, b, bg) < 4.6); i++) f = mix(f, surface, 0.3); return f; };
  const mroom = room(accent, 0.18);
  Object.assign(t, {
    '--gf-map-room': mroom, '--gf-map-corridor': room(acc2, 0.12), '--gf-map-outdoor': room(ok0, 0.16), '--gf-map-stairs': room(acc2, 0.24),
    '--gf-map-door': fit(acc2, [mroom], 3.1, bg), '--gf-map-grid': mix(bg, text, 0.06), '--gf-map-grid-2': mix(bg, text, 0.12),
  });
  if (o.font) t['--gf-font'] = o.font;
  if (o.radius != null) { t['--gf-radius'] = `${o.radius}px`; t['--gf-radius-lg'] = `${Math.round(o.radius * 1.6)}px`; }
  t['--gf-shadow'] = o.shadow || (dark ? '0 10px 40px rgba(0, 0, 0, 0.7)' : `0 8px 30px ${rgba(mix(bg, '#000000', 0.75), 0.28)}`);
  if (o.scanlines != null) t['--gf-scanlines'] = String(o.scanlines);
  if (o.lh != null) t['--gf-lh'] = String(o.lh);
  return t;
}

/** the CSS block of a theme */
export const themeCss = (name, tokens, about = '') => `${about ? `/* ${about} */\n` : ''}[data-theme~="${name}"] {\n  color-scheme: ${contrast('#000000', tokens['--gf-surface']) > contrast('#ffffff', tokens['--gf-surface']) ? 'light' : 'dark'};\n${Object.entries(tokens).map(([k, v]) => `  ${k}: ${v};`).join('\n')}\n}\n`;

/** apply a theme's tokens on an element (the page root): game.json "themeColors" */
export function applyTheme(el, tokens) { for (const [k, v] of Object.entries(tokens)) el.style.setProperty(k, v); return tokens; }
