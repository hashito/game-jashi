#!/usr/bin/env node
// Builds the Firebase Hosting deploy dir public/ (no dependencies): node tools/build-site.js
// Copies the game (dist/) as it is, injects unique SEO tags / OGP / Twitter / JSON-LD / GA4 (from site.json),
// writes og-image.jpg, favicon.svg, sitemap.xml, robots.txt, 404.html, then checks that every local reference resolves.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'public');
const site = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.json'), 'utf8'));
const origin = `https://${site.domain}`;
const url = `${origin}/`;
const ogImage = origin + site.ogImage;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

let lastmod = '';
try { lastmod = execSync('git log -1 --format=%cs', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch {}
if (!lastmod) lastmod = new Date().toISOString().slice(0, 10);

fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, 'dist'), OUT, { recursive: true, filter: (s) => !path.basename(s).startsWith('_') });
fs.copyFileSync(path.join(ROOT, 'assets/og-image.jpg'), path.join(OUT, 'og-image.jpg'));
fs.copyFileSync(path.join(ROOT, 'assets/favicon.svg'), path.join(OUT, 'favicon.svg'));

const title = site.titleSuffix ? `${site.name}｜${site.titleSuffix}` : site.name;
const jsonld = {
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'WebSite', '@id': `${url}#website`, url, name: site.name, inLanguage: 'ja', publisher: { '@id': `${url}#org` } },
    { '@type': 'Organization', '@id': `${url}#org`, name: site.author, url: site.authorUrl },
    {
      '@type': ['VideoGame', 'WebApplication'],
      name: site.name, alternateName: site.nameEn, url, description: site.description, image: ogImage,
      genre: site.genre, gamePlatform: ['Web browser', 'PC', 'Smartphone', 'Tablet'],
      applicationCategory: 'Game', operatingSystem: 'Any (modern web browser)', browserRequirements: 'Requires JavaScript',
      playMode: 'SinglePlayer', inLanguage: 'ja', contentRating: site.contentRating, dateModified: lastmod,
      author: { '@id': `${url}#org` }, offers: { '@type': 'Offer', price: 0, priceCurrency: 'JPY' },
    },
  ],
};
const head = [
  `<meta name="description" content="${esc(site.description)}">`,
  `<link rel="canonical" href="${url}">`,
  `<link rel="icon" href="/favicon.svg" type="image/svg+xml">`,
  `<meta property="og:type" content="website">`,
  `<meta property="og:site_name" content="${esc(site.name)}">`,
  `<meta property="og:title" content="${esc(title)}">`,
  `<meta property="og:description" content="${esc(site.description)}">`,
  `<meta property="og:url" content="${url}">`,
  `<meta property="og:locale" content="ja_JP">`,
  `<meta property="og:image" content="${ogImage}">`,
  `<meta property="og:image:width" content="1200">`,
  `<meta property="og:image:height" content="630">`,
  `<meta property="og:image:type" content="image/jpeg">`,
  `<meta property="og:image:alt" content="${esc(site.ogImageAlt)}">`,
  `<meta name="twitter:card" content="summary_large_image">`,
  `<meta name="twitter:title" content="${esc(title)}">`,
  `<meta name="twitter:description" content="${esc(site.description)}">`,
  `<meta name="twitter:image" content="${ogImage}">`,
  `<meta name="twitter:image:alt" content="${esc(site.ogImageAlt)}">`,
  site.googleSiteVerification ? `<meta name="google-site-verification" content="${esc(site.googleSiteVerification)}">` : '',
  `<script type="application/ld+json">${JSON.stringify(jsonld)}</script>`,
  site.gaId ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${site.gaId}"></script>\n<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${site.gaId}',{allow_google_signals:false,allow_ad_personalization_signals:false});</script>` : '',
].filter(Boolean).join('\n');

let html = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8');
html = html.replace(/<meta (name="description"|property="og:[^"]*"|name="twitter:[^"]*")[^>]*>\s*/g, '');
html = html.replace(/<link rel="(canonical|icon)"[^>]*>\s*/g, '');
html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>\n${head}`);
const ns = `<noscript><div style="position:fixed;inset:0;z-index:100;background:#111512;color:#e9e6dc;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;font:16px/1.9 serif"><div><h1 style="font-size:28px;letter-spacing:.12em">${esc(site.name)}</h1><p>${esc(site.noscript)}</p></div></div></noscript>`;
html = html.replace(/<body([^>]*)>/, `<body$1>\n${ns}`);
fs.writeFileSync(path.join(OUT, 'index.html'), html);

fs.writeFileSync(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`);
fs.writeFileSync(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${url}</loc><lastmod>${lastmod}</lastmod></url>\n</urlset>\n`);
fs.writeFileSync(path.join(OUT, '404.html'), `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>見つかりません｜${esc(site.name)}</title><meta name="robots" content="noindex"><link rel="icon" href="/favicon.svg" type="image/svg+xml">
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#111512;color:#ccc;font-family:serif;text-align:center;padding:16px}a{color:#d8c9a0}</style>
</head><body><div><p style="font-size:22px">……この先の記録は、残っていません。</p><p><a href="/">はじめに戻る</a></p></div></body></html>
`);

// ---- verification: every local reference resolves; report size ----
const problems = [];
const exists = (from, ref) => {
  const clean = ref.split('#')[0].split('?')[0];
  if (!clean || /^(https?:|data:|mailto:|\/\/|%23)/.test(clean)) return true; // %23…: a fragment inside an inline SVG data URL
  const f = clean.startsWith('/') ? path.join(OUT, clean) : path.join(path.dirname(from), clean);
  return fs.existsSync(f);
};
const idx = path.join(OUT, 'index.html');
for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) if (!exists(idx, m[1])) problems.push(`index.html -> ${m[1]}`);
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const files = walk(OUT);
for (const f of files.filter((x) => x.endsWith('.css'))) {
  for (const m of fs.readFileSync(f, 'utf8').matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) if (!exists(f, m[1])) problems.push(`${path.relative(OUT, f)} -> ${m[1]}`);
}
for (const f of files.filter((x) => x.endsWith('.js'))) {
  for (const m of fs.readFileSync(f, 'utf8').matchAll(/(?:^|\n)\s*(?:import|export)[^'"\n]*?from\s*["'](\.[^"']+)["']/g)) if (!exists(f, m[1])) problems.push(`${path.relative(OUT, f)} -> ${m[1]}`);
}
const bytes = files.reduce((a, f) => a + fs.statSync(f).size, 0);
const og = fs.statSync(path.join(OUT, 'og-image.jpg')).size;
console.log(`built ${path.relative(ROOT, OUT)}/ for ${url} (lastmod ${lastmod}, GA ${site.gaId || 'off'}): ${files.length} files, ${(bytes / 1048576).toFixed(2)} MB, og-image ${Math.round(og / 1024)} KB`);
if (problems.length) { console.error('UNRESOLVED REFERENCES:\n' + problems.join('\n')); process.exit(1); }
console.log('all local references resolve');
