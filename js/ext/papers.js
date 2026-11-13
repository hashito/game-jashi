// 5.9 (feedback 2026-11-13 「みる風車のような古い紙の雰囲気で読む。書類形式でもよい」): every document is read on old paper, and the
// ones that are a form are drawn as that form (data/docs.json "form"; without one, the text on plain aged paper):
//   letter   the uncle's note: his handwriting on ruled paper, what I noticed in the margin under it
//   log      a log book (the duty diary, the hut's work log): columns and rows, the narration round them
//   notice   an office notice (the forestry office): its heading, the body, a red stamp, the pencil notes on it
//   card     a field record card (the three eyes): place, direction, memo, the photo clipped on
// The same paper is used in the window ('doc', whoever opens it: the kit's pick-up, the story's showDoc) and in the 資料 detail of
// the inventory. The items of the inventory get their own story as a block of its own (data/items.json "lore", 「この品の話」).
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const P = (t, cls = '') => `<p${cls ? ` class="${cls}"` : ''}>${esc(t)}</p>`;

function photo(d, o) {
  if (!d.photo || o.noPhoto) return '';
  return `<figure class="js-pp-photo${d.form && d.form.type === 'card' ? ' js-pp-clip' : ''}"><img src="${esc(d.photo)}" alt=""></figure>`;
}

/** the paper of one document (d: a docs.json entry). o.inline: the smaller one in the inventory detail */
export function paperHtml(d, o = {}) {
  const paras = String(d.text || '').split('\n'), f = d.form || null, at = (i) => paras[i] ?? '';
  const list = (ix) => (ix || []).map((i) => P(at(i))).join('');
  const type = f ? f.type : 'plain';
  let inner = '';
  if (type === 'letter') {
    inner = `${photo(d, o)}<div class="js-pp-hand">${list(f.body)}${f.sign ? `<p class="js-pp-sign">${esc(f.sign)}</p>` : ''}</div>`
      + (f.notes && f.notes.length ? `<div class="js-pp-aside"><p class="js-pp-label">${esc(f.notesLabel || '気づいたこと')}</p>${list(f.notes)}</div>` : '');
  } else if (type === 'log') {
    const cols = f.cols || [];
    inner = `<header class="js-pp-head"><b>${esc(f.head || d.title)}</b>${f.sub ? `<span>${esc(f.sub)}</span>` : ''}</header>${list(f.intro)}`
      + `<table class="js-pp-log"><thead><tr>${cols.map((c) => `<th scope="col">${esc(c)}</th>`).join('')}</tr></thead><tbody>${(f.rows || []).map((r) => `<tr${r.odd ? ' class="js-pp-odd"' : ''}>${(r.cells || r).map((c, i) => `<td data-col="${esc(cols[i] || '')}">${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
      + list(f.after) + photo(d, o);
  } else if (type === 'notice') {
    inner = `<div class="js-pp-notice"><p class="js-pp-org">${esc(f.org || '')}</p><h3 class="js-pp-title">${esc(f.title || d.title)}</h3>${(f.body || []).map((t) => P(t)).join('')}${f.date ? `<p class="js-pp-date">${esc(f.date)}</p>` : ''}${f.stamp ? `<span class="js-pp-stamp" aria-label="印">${esc(f.stamp)}</span>` : ''}</div>`
      + (f.pencil && f.pencil.length ? `<div class="js-pp-pencil">${f.pencil.map((t) => P(t)).join('')}</div>` : '')
      + (f.caption ? P(f.caption, 'js-pp-cap') : '') + list(f.after) + photo(d, o);
  } else if (type === 'card') {
    const row = (k, v) => `<div class="js-pp-row"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`;
    inner = `<header class="js-pp-head js-pp-cardhead"><b>${esc(f.head || '現地記録カード')}</b>${f.no ? `<span>No. ${esc(f.no)}</span>` : ''}</header>${photo(d, o)}<dl class="js-pp-fields">${row('撮影場所', f.place || '')}${row('目の向き', f.dir || '')}${row('メモ', f.memo || '')}</dl>`;
  } else inner = `${photo(d, o)}${paras.map((t) => P(t)).join('')}`;
  return `<article class="js-paper js-paper--${esc(type)}${o.inline ? ' js-paper--inline' : ''}">${inner}</article>`;
}

export function installPapers(ctx) {
  const docs = ctx.data.docs || [], items = ctx.data.items || [];
  // the window: any 'doc' window of a document is drawn as its paper
  const wm = ctx.wm;
  if (wm && wm.open && !wm.__papers) {
    const open0 = wm.open.bind(wm); wm.__papers = true;
    wm.open = (id, o = {}) => {
      const d = id === 'doc' && o && o.title ? docs.find((x) => x.title === o.title) : null;
      if (!d) return open0(id, o);
      const wide = d.form && (d.form.type === 'log' || d.form.type === 'notice');
      return open0(id, { ...o, size: wide ? 'm' : o.size || 's', render: (el) => { el.innerHTML = `<div class="js-docwrap">${paperHtml(d)}${d.feeling ? `<p class="iv-feel js-pp-feel">${esc(d.feeling)}</p>` : ''}</div>`; } });
    };
  }
  // the inventory detail: a document is its paper (in place of the plain photo card), an item gets its story under the card
  const inv = ctx.inv;
  if (inv && inv.render && !inv.__papers) {
    const r0 = inv.render.bind(inv); inv.__papers = true;
    inv.render = (el) => {
      const out = r0(el);
      try {
        const root = out || el; const sel = root && root.querySelector('.iv-cell.sel'), det = root && root.querySelector('.iv-detail');
        if (!sel || !det) return out;
        const id = sel.dataset.id, d = docs.find((x) => x.id === id), it = !d && items.find((x) => x.id === id);
        const card = det.querySelector('.iv-photocard');
        if (d && card) { card.insertAdjacentHTML('beforebegin', `<h3 class="js-pp-name">${esc(d.title)}</h3>${paperHtml(d, { inline: true })}`); card.remove(); }
        else if (it && it.lore && card && !det.querySelector('.js-lore')) card.insertAdjacentHTML('afterend', `<aside class="js-lore" aria-label="この品の話"><span class="js-lore-l">この品の話</span><p>${esc(it.lore)}</p></aside>`);
      } catch (e) { /* the plain card stays */ }
      return out;
    };
  }
}
