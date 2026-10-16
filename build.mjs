#!/usr/bin/env node
// Static build for the book. No dependencies; needs Node 18 or newer.
//   node build.mjs          builds ./dist and checks every internal link
// Source lives in ./src: outline.json (the table of contents), chapters/*.html
// (one fragment per chapter), pages/*.html (extra pages) and assets/.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'dist');

const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'book.config.json'), 'utf8'));
const outline = JSON.parse(fs.readFileSync(path.join(SRC, 'outline.json'), 'utf8'));
const siteUrl = (config.siteUrl || '').replace(/\/+$/, '');

// ---------------------------------------------------------------- helpers

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s) => esc(s).replace(/"/g, '&quot;');
const stripTags = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
const slugify = (s) => stripTags(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV'];

const plain = (s) => s.replace(/\u0000\d+\u0000/g, ' ').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();

// The sentence that contains a defined term, used as its glossary entry.
function sentenceAround(html, start, len) {
  const OPEN = /<(p|li|td|th|dd|aside|figcaption|div|h[1-6])\b[^>]*>/g;
  const CLOSE = /<\/(p|li|td|th|dd|aside|figcaption|div|h[1-6])>/;
  const before = html.slice(Math.max(0, start - 1200), start);
  let cut = 0;
  for (const m of before.matchAll(OPEN)) cut = m.index + m[0].length;
  const afterRaw = html.slice(start + len, start + len + 1200);
  const close = afterRaw.search(CLOSE);
  const block = `${before.slice(cut)}\u0001${html.slice(start, start + len)}\u0002${close >= 0 ? afterRaw.slice(0, close) : afterRaw}`;
  const text = plain(block);
  const pre = text.slice(0, text.indexOf('\u0001'));
  const term = text.slice(text.indexOf('\u0001') + 1, text.indexOf('\u0002'));
  const post = text.slice(text.indexOf('\u0002') + 1);
  const ends = [...pre.matchAll(/[.?!:]["”)]?\s+(?=[A-Z“"(0-9])/g)];
  const head = ends.length ? pre.slice(ends[ends.length - 1].index + ends[ends.length - 1][0].length) : pre;
  const stop = post.search(/[.?!]["”)]?(\s|$)/);
  const rest = stop >= 0 ? post.slice(0, stop + 1) : post;
  let out = `${head}${term}${rest}`.replace(/\s+/g, ' ').trim();
  if (out.length > 240) out = `${out.slice(0, 237).replace(/\s+\S*$/, '')}…`;
  return out;
}

const terms = [];

function readSource(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const m = raw.match(/^\s*<!--meta\s*([\s\S]*?)-->/);
  let meta = {};
  let body = raw;
  if (m) {
    meta = JSON.parse(m[1]);
    body = raw.slice(m[0].length);
  }
  return { meta, body };
}

// ---------------------------------------------------------------- outline

let counter = 0;
const chapters = [];
outline.parts.forEach((part, pi) => {
  part.roman = ROMAN[pi];
  part.chapters.forEach((ch) => {
    counter += 1;
    ch.number = counter;
    ch.part = part;
    ch.file = path.join(SRC, 'chapters', `${ch.slug}.html`);
    ch.written = fs.existsSync(ch.file);
    ch.url = `${ch.slug}.html`;
    chapters.push(ch);
  });
});
const bySlug = new Map(chapters.map((c) => [c.slug, c]));
const written = chapters.filter((c) => c.written);

const pages = (outline.appendices || []).map((p) => ({
  ...p,
  file: path.join(SRC, 'pages', `${p.slug}.html`),
  url: `${p.slug}.html`,
  isPage: true,
})).filter((p) => fs.existsSync(p.file));
pages.forEach((p) => bySlug.set(p.slug, p));

// Personal notes: <aside class="mine">…</aside> anywhere in a chapter. They are collected
// onto notes.html. Set "publishNotes": false in book.config.json to leave them out of the build.
const publishNotes = config.publishNotes !== false;
const noteLabel = config.noteLabel || 'My note';
const NOTE_RE = /<aside class="mine">([\s\S]*?)<\/aside>/g;
const hasNotes = publishNotes && [...written, ...pages].some((d) => /<aside class="mine">/.test(fs.readFileSync(d.file, 'utf8')));
const notes = [];

// ---------------------------------------------------------------- code highlighting

const TS_KEYWORDS = new Set(('abstract as async await break case catch class const continue declare default delete do else enum export extends ' +
  'false finally for from function get if implements import in instanceof interface is keyof let namespace new null of private protected public ' +
  'readonly return satisfies set static super switch this throw true try type typeof undefined var void while yield').split(' '));
const TS_TOKEN = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|('(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`)|\b(\d[\d_]*(?:\.\d+)?(?:e[+-]?\d+)?n?)\b|\b([A-Za-z_$][\w$]*)\b/g;

function highlightTs(code) {
  let out = '';
  let last = 0;
  for (const m of code.matchAll(TS_TOKEN)) {
    out += esc(code.slice(last, m.index));
    const [tok, comment, str, num, word] = m;
    if (comment) out += `<span class="c">${esc(tok)}</span>`;
    else if (str) out += `<span class="s">${esc(tok)}</span>`;
    else if (num) out += `<span class="m">${esc(tok)}</span>`;
    else if (TS_KEYWORDS.has(word)) out += `<span class="k">${esc(tok)}</span>`;
    else if (/^[A-Z]/.test(word)) out += `<span class="t">${esc(tok)}</span>`;
    else out += esc(tok);
    last = m.index + tok.length;
  }
  return out + esc(code.slice(last));
}

const SQL_KEYWORDS = new Set(('add all alter analyze and any as asc begin between by cascade case check column commit concurrently conflict constraint create cross ' +
  'default delete desc distinct do drop else end exists explain false for foreign from full group having if in index inner insert into is isolation join key ' +
  'left level like limit lock materialized not nothing null offset on only or order outer over partition primary references returning right rollback select ' +
  'serializable set share skip table then to transaction true union unique update using vacuum values view when where with').split(' '));
const SQL_TOKEN = /(--[^\n]*)|('(?:''|[^'])*')|\b(\d+(?:\.\d+)?)\b|\b([A-Za-z_][\w]*)\b/g;

function highlightSql(code) {
  let out = '';
  let last = 0;
  for (const m of code.matchAll(SQL_TOKEN)) {
    out += esc(code.slice(last, m.index));
    const [tok, comment, str, num, word] = m;
    if (comment) out += `<span class="c">${esc(tok)}</span>`;
    else if (str) out += `<span class="s">${esc(tok)}</span>`;
    else if (num) out += `<span class="m">${esc(tok)}</span>`;
    else if (word === word.toUpperCase() && SQL_KEYWORDS.has(word.toLowerCase())) out += `<span class="k">${esc(tok)}</span>`;
    else out += esc(tok);
    last = m.index + tok.length;
  }
  return out + esc(code.slice(last));
}

function highlightPlain(code, lang) {
  // Shell, HTTP and plain text: escape, and dim # comments in shell.
  if (lang === 'sh') {
    return code.split('\n').map((l) => (/^\s*#/.test(l) ? `<span class="c">${esc(l)}</span>` : esc(l))).join('\n');
  }
  return esc(code);
}

const LANG_NAMES = { ts: 'TypeScript', js: 'JavaScript', sql: 'SQL', sh: 'Shell', http: 'HTTP', graphql: 'GraphQL', proto: 'Protocol Buffers' };

function dedent(code) {
  const lines = code.replace(/^\n+|\s+$/g, '').split('\n');
  const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length));
  return lines.map((l) => l.slice(indent)).join('\n');
}

// ---------------------------------------------------------------- body pipeline

function renderBody(doc, body) {
  const stash = [];
  const keep = (html) => `\u0000${stash.push(html) - 1}\u0000`;

  // 1. Code blocks: <pre data-lang="ts" data-title="optional">raw code</pre>
  body = body.replace(/<pre data-lang="([\w-]+)"(?: data-title="([^"]*)")?>([\s\S]*?)<\/pre>/g, (_, lang, title, code) => {
    const src = dedent(code);
    const html = lang === 'ts' || lang === 'js' ? highlightTs(src) : lang === 'sql' ? highlightSql(src) : highlightPlain(src, lang);
    const langName = LANG_NAMES[lang] || '';
    const head = `<div class="code-head"><span class="code-title">${title ? esc(title) : ''}</span>${langName ? `<span class="code-lang">${langName}</span>` : ''}</div>`;
    return keep(`<div class="code" data-lang="${lang}">${head}<pre><code>${html}</code></pre></div>`);
  });

  // 2. Figures: number them and remember ids for <x-fig> references.
  const figs = new Map();
  let figCount = 0;
  let firstFig = '';
  let stepFigs = 0;
  const figList = [];
  body = body.replace(/<figure class="([^"]*\bfig\b[^"]*)" id="([^"]+)">([\s\S]*?)<figcaption>([\s\S]*?)<\/figcaption>\s*<\/figure>/g, (_, cls, id, inner, cap) => {
    figCount += 1;
    const label = doc.number ? `Figure ${doc.number}.${figCount}` : `Figure ${figCount}`;
    figs.set(id, label);
    if (!firstFig) firstFig = id;
    const chart = /class="(grid|line|dot|bar)[ "]/.test(inner) ? ' chart' : '';
    const steps = /<ol class="steps"/.test(inner);
    if (steps) stepFigs += 1;
    figList.push({ id, label, title: plain((inner.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1] || ''), steps, tips: /data-tip="/.test(inner) });
    return `<figure class="${cls}${chart}" id="${id}"${steps ? ' data-player' : ''}>${inner}<figcaption><b>${label}.</b> ${cap.trim()}</figcaption></figure>`;
  });
  body = body.replace(/<x-fig to="([^"]+)"><\/x-fig>/g, (_, id) => {
    if (!figs.has(id)) throw new Error(`${doc.slug}: unknown figure "${id}"`);
    return `<a class="figref" href="#${id}">${figs.get(id)}</a>`;
  });

  // 3. Cross references: <x-ref to="slug">optional text</x-ref>
  body = body.replace(/<x-ref to="([^"#]+)(#[^"]+)?">([\s\S]*?)<\/x-ref>/g, (_, slug, hash, text) => {
    const target = bySlug.get(slug);
    if (!target) throw new Error(`${doc.slug}: unknown reference "${slug}"`);
    const name = target.isPage ? target.title : `Chapter ${target.number}, <i>${esc(target.title)}</i>`;
    const label = text.trim() || name;
    if (target.isPage || target.written) return `<a class="xref" href="${target.url}${hash || ''}">${label}</a>`;
    const where = text.trim() ? ` (Chapter ${target.number}, not yet published)` : ' (not yet published)';
    return `<span class="xref planned">${label}${where}</span>`;
  });

  // Short forms: <x-num to="slug"></x-num> gives "12", <x-ch to="slug"></x-ch> gives "Chapter 12".
  body = body.replace(/<x-(num|ch) to="([^"]+)"><\/x-\1>/g, (_, kind, slug) => {
    const target = bySlug.get(slug);
    if (!target || target.isPage) throw new Error(`${doc.slug}: unknown chapter "${slug}"`);
    const label = kind === 'num' ? String(target.number) : `Chapter ${target.number}`;
    return target.written
      ? `<a class="xref" href="${target.url}" title="${escAttr(target.title)}">${label}</a>`
      : `<span class="xref planned" title="${escAttr(target.title)} (not yet published)">${label}</span>`;
  });

  // 4. Tables scroll on small screens.
  body = body.replace(/<table([^>]*)>/g, '<div class="table-wrap"><table$1>').replace(/<\/table>/g, '</table></div>');

  // 5. Headings: ids, anchors and the section list.
  const sections = [];
  const used = new Set();
  body = body.replace(/<h([23])(?: id="([^"]+)")?>([\s\S]*?)<\/h\1>/g, (_, level, id, text) => {
    let hid = id || slugify(text);
    while (used.has(hid)) hid += '-2';
    used.add(hid);
    if (level === '2') sections.push({ id: hid, text: stripTags(text) });
    return `<h${level} id="${hid}">${text.trim()} <a class="anchor" href="#${hid}" aria-label="Link to this section">#</a></h${level}>`;
  });

  // 6. Defined terms get an anchor and are collected for the glossary and the search.
  const usedTerm = new Set();
  body = body.replace(/<dfn>([\s\S]*?)<\/dfn>/g, (m, inner, offset, whole) => {
    const name = plain(inner);
    let id = `term-${slugify(inner)}`;
    while (usedTerm.has(id) || used.has(id)) id += '-2';
    usedTerm.add(id);
    if (doc.number) terms.push({ name, id, doc, def: sentenceAround(whole, offset, m.length) });
    return `<dfn id="${id}">${inner}</dfn>`;
  });

  // 7. Calculators get an id so the page can link to them.
  let calcCount = 0;
  let firstCalc = '';
  body = body.replace(/<div class="(widget[^"]*)" data-widget="([\w-]+)">/g, (_, cls, name) => {
    calcCount += 1;
    const id = `calc-${name}${calcCount > 1 && body.split(`data-widget="${name}"`).length > 2 ? `-${calcCount}` : ''}`;
    if (!firstCalc) firstCalc = id;
    return `<div class="${cls}" data-widget="${name}" id="${id}">`;
  });
  // A calculator's drawing gets a frame of its own, so that it can scroll sideways on a narrow screen.
  body = body.split('<div class="widget').map((chunk, i) => {
    if (i === 0) return chunk;
    const end = chunk.indexOf('<p class="verdict"');
    const at = chunk.indexOf('<svg class="dg"');
    if (at < 0 || (end > -1 && at > end)) return chunk;
    const close = chunk.indexOf('</svg>', at) + 6;
    return chunk.slice(0, at) + '<div class="draw">' + chunk.slice(at, close) + '</div>' + chunk.slice(close);
  }).join('<div class="widget');

  body = body.replace(/\u0000(\d+)\u0000/g, (_, i) => stash[Number(i)]);

  // 8. Reading time per section, for the "on this page" trace.
  const marks = [...body.matchAll(/<h2 id="([^"]+)">/g)];
  sections.forEach((s, i) => {
    const from = i === 0 ? 0 : marks[i].index;
    const to = i + 1 < marks.length ? marks[i + 1].index : body.length;
    s.words = stripTags(body.slice(from, to)).split(' ').length;
  });
  const quiz = body.match(/<section class="quiz">[\s\S]*?<\/section>/);
  const questions = quiz ? (quiz[0].match(/<details/g) || []).length : 0;
  const quizId = quiz ? (quiz[0].match(/<h2 id="([^"]+)"/) || [])[1] : '';

  // 9. Personal notes.
  const withNotes = body;
  body = body.replace(NOTE_RE, (_, inner, offset) => {
    if (!publishNotes) return '';
    const before = withNotes.slice(0, offset);
    const last = [...before.matchAll(/<h2 id="([^"]+)">/g)].pop();
    const section = last ? sections.find((x) => x.id === last[1]) : null;
    const id = `note-${notes.length + 1}`;
    notes.push({ doc, id, html: inner.trim(), section });
    return `<aside class="mine" id="${id}"><span class="label">${esc(noteLabel)}</span> ${inner.trim()}</aside>`;
  });
  const words = stripTags(body).split(' ').length;
  return { html: body, sections, minutes: Math.max(1, Math.round(words / 220)), words, figCount, figList, firstFig, stepFigs, calcCount, firstCalc, questions, quizId };
}

// ---------------------------------------------------------------- shared chrome

const MARKERS = `<svg class="defs" width="0" height="0" aria-hidden="true" focusable="false"><defs>
${['ink', 'sig', 'store', 'async', 'fault'].map((c) => `<marker id="ah-${c}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="ah ah-${c}" d="M0 0 10 5 0 10z"/></marker>`).join('\n')}
<marker id="uml-tri" viewBox="0 0 14 14" refX="13" refY="7" markerWidth="14" markerHeight="14" markerUnits="userSpaceOnUse" orient="auto"><path class="um um-hollow" d="M1.5 1.5 13 7 1.5 12.5z"/></marker>
<marker id="uml-open" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto"><path class="um um-open" d="M2 1.5 11 6 2 10.5"/></marker>
<marker id="uml-dia" viewBox="0 0 18 12" refX="1" refY="6" markerWidth="18" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto"><path class="um um-solid" d="M1 6 9 1.5 17 6 9 10.5z"/></marker>
<marker id="uml-dia-o" viewBox="0 0 18 12" refX="1" refY="6" markerWidth="18" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto"><path class="um um-hollow" d="M1 6 9 1.5 17 6 9 10.5z"/></marker>
</defs></svg>`;

// Marker references must live in the document itself, not in the external stylesheet.
const MARKER_CSS = `<style>
.dg .e{marker-end:url(#ah-ink)}.dg .e.sig{marker-end:url(#ah-sig)}.dg .e.store{marker-end:url(#ah-store)}
.dg .e.async{marker-end:url(#ah-async)}.dg .e.fault{marker-end:url(#ah-fault)}
.dg .e.inherit,.dg .e.implements{marker-end:url(#uml-tri)}.dg .e.assoc,.dg .e.uses{marker-end:url(#uml-open)}
.dg .e.owns{marker-start:url(#uml-dia);marker-end:none}.dg .e.has{marker-start:url(#uml-dia-o);marker-end:none}.dg .e.owns.assoc,.dg .e.has.assoc{marker-end:url(#uml-open)}
.dg .e.both{marker-start:url(#ah-ink)}.dg .e.sig.both{marker-start:url(#ah-sig)}.dg .e.store.both{marker-start:url(#ah-store)}.dg .e.async.both{marker-start:url(#ah-async)}.dg .e.fault.both{marker-start:url(#ah-fault)}
.dg .e.none{marker-end:none}
</style>`;

const THEME_BOOT = `<script>(function(){try{var t=localStorage.getItem('book-theme')||localStorage.getItem('theme');if(t!=='light'&&t!=='dark'){t=(window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches)?'light':'dark'}document.documentElement.setAttribute('data-theme',t)}catch(e){}})()</script>`;

const ICON = {
  logo: '<svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 3 7.8l9 4.9 9-4.9L12 3z"/><path d="M3.5 12.2 12 16.9l8.5-4.7"/><path d="M3.5 16.4 12 21l8.5-4.6" opacity=".6"/></svg>',
  menu: '<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 5.5h14M3 10h14M3 14.5h9"/></svg>',
  search: '<svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/></svg>',
  theme: '<svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M13 9.5A5.5 5.5 0 1 1 6.5 3 4.3 4.3 0 0 0 13 9.5z"/></svg>',
  close: '<svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
  prev: '<svg width="14" height="14" viewBox="0 0 12 12" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.5 2l-4 4 4 4"/></svg>',
  next: '<svg width="14" height="14" viewBox="0 0 12 12" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 2l4 4-4 4"/></svg>',
  check: '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7.5l3 3 5-6.5"/></svg>',
};

function sidebar(current) {
  const parts = outline.parts.map((part) => {
    const open = current && current.part === part;
    const items = part.chapters.map((ch) => {
      const num = `<span class="num">${ch.number}</span>`;
      if (!ch.written) return `<li class="planned">${num}<span class="t">${esc(ch.title)}</span><small>soon</small></li>`;
      const here = current && current.slug === ch.slug;
      return `<li data-slug="${ch.slug}"><a href="${ch.url}"${here ? ' aria-current="page"' : ''}>${num}<span class="t">${esc(ch.title)}</span><span class="tick" aria-hidden="true"></span></a></li>`;
    }).join('');
    const done = part.chapters.filter((c) => c.written).length;
    const count = done ? `${done} of ${part.chapters.length}` : 'soon';
    return `<details${open ? ' open' : ''} data-part="${part.id}"><summary><span class="part-no">${part.roman}</span><span class="part-name">${esc(part.title)}</span><span class="count" data-written="${done}">${count}</span></summary><ol>${items}</ol></details>`;
  }).join('\n');
  const front = [
    `<li><a href="index.html"${current ? '' : ' aria-current="page"'}>Contents and system map</a></li>`,
    ...pages.map((p) => `<li><a href="${p.url}"${current && current.slug === p.slug ? ' aria-current="page"' : ''}>${esc(p.title)}</a></li>`),
    `<li><a href="glossary.html"${current && current.slug === 'glossary' ? ' aria-current="page"' : ''}>Glossary</a></li>`,
    `<li><a href="notes.html"${current && current.slug === 'notes' ? ' aria-current="page"' : ''}>Notes and highlights</a></li>`,
  ].join('');
  return `<nav class="sidebar" id="sidebar" aria-label="Table of contents">
<div class="side-head"><b>Contents</b><button type="button" id="side-close" aria-label="Close contents">${ICON.close}</button></div>
<ul class="front">${front}</ul>
${parts}
</nav>`;
}

function siteFooter() {
  const howTo = pages[0] ? `<a href="${pages[0].url}">${esc(pages[0].title)}</a>` : '';
  return `<footer class="site-foot">
  <div class="foot-top">
    <div class="foot-brand-block">
    <a class="foot-brand" href="index.html"><span class="brand-tile" aria-hidden="true">${ICON.logo}</span><span>${esc(config.title)}</span></a>
      <p class="foot-tag">${esc(config.subtitle)}</p>
    </div>
    <nav class="foot-nav" aria-label="Footer"><a href="index.html#contents">Contents</a>${howTo}<a href="notes.html">Notes</a><a class="gloss" href="glossary.html">Glossary</a></nav>
  </div>
  <div class="foot-meta"><span>Facts last checked ${esc(config.factsChecked)}</span><span class="sep" aria-hidden="true">·</span><a href="about.html#sources">Sources and acknowledgements</a>${config.author ? `<span class="sep" aria-hidden="true">·</span><span>© ${esc(config.author)}</span>` : ''}</div>
</footer>`;
}

function page({ title, description, url, bodyClass, current, main, extraHead = '', where = '', rail = '', dock = '', footer = true }) {
  const _tw = config.title.split(' ');
  const brandHtml = _tw.length > 1
    ? `${esc(_tw.slice(0, -1).join(' '))} <b>${esc(_tw[_tw.length - 1])}</b>`
    : esc(config.title);
  const fullTitle = title ? `${title} | ${config.title}` : `${config.title}: ${config.subtitle}`;
  const canonical = siteUrl ? `<link rel="canonical" href="${siteUrl}/${url === 'index.html' ? '' : url}">` : '';
  const og = [
    ['og:title', title || config.title],
    ['og:description', description],
    ['og:type', title ? 'article' : 'book'],
    ['og:site_name', config.title],
    ...(siteUrl ? [['og:url', `${siteUrl}/${url === 'index.html' ? '' : url}`]] : []),
  ].map(([p, c]) => `<meta property="${p}" content="${escAttr(c)}">`).join('\n');
  const author = config.author ? `<meta name="author" content="${escAttr(config.author)}">` : '';
  const classes = [bodyClass, rail ? '' : 'no-rail', dock ? 'has-dock' : ''].filter(Boolean).join(' ');
  return `<!doctype html>
<html lang="${config.language || 'en'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${escAttr(description)}">
${author}
${canonical}
${og}
<meta name="twitter:card" content="summary">
<link rel="preload" href="assets/fonts/hanken-grotesk-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="assets/fonts/bricolage-grotesque-latin-700-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="assets/book.css">
${MARKER_CSS}
${THEME_BOOT}
<noscript><style>.search-btn,#theme-btn,#menu-btn,.dock .here{display:none!important}.is-chapter .brand{display:flex!important}.is-chapter .where{display:none!important}</style></noscript>
${extraHead}
</head>
<body class="${classes}">
<a class="skip" href="#main">Skip to content</a>
${MARKERS}
<header class="topbar">
  <button class="icon-btn" id="menu-btn" type="button" aria-controls="sidebar" aria-expanded="false" aria-label="Open contents">${ICON.menu}</button>
  <a class="brand" href="index.html" aria-label="${escAttr(config.title)} — home"><span class="brand-tile" aria-hidden="true">${ICON.logo}</span><span class="brand-text">${brandHtml}</span></a>
  ${where}
  <button class="search-btn" id="search-btn" type="button" aria-haspopup="dialog" aria-label="Search chapters, sections and terms">${ICON.search}<span>Search chapters, sections and terms</span><kbd id="search-key">Ctrl K</kbd></button>
  <a class="read-count" href="index.html#contents" id="read-count" data-total="${written.length}" hidden><span></span><span class="meter"><i></i></span></a>
  <button class="icon-btn" id="theme-btn" type="button" aria-label="Switch between light and dark theme">${ICON.theme}</button>
</header>
${current && current.number ? '<div class="progress" aria-hidden="true"><i id="progress-bar"></i></div>' : ''}
<div class="shell">
${sidebar(current)}
<main id="main">
${main}
${bodyClass === 'is-home' || !footer ? '' : siteFooter()}
</main>
${rail}
</div>
${dock}
<dialog class="palette" id="palette" aria-label="Search the book">
  <div class="palette-in">${ICON.search}<input id="palette-input" type="search" placeholder="Search chapters, sections and terms" aria-label="Search chapters, sections and terms" autocomplete="off" spellcheck="false"><button class="btn ghost small" id="palette-close" type="button">Close</button></div>
  <ul class="palette-out" id="palette-out"></ul>
  <div class="palette-foot"><span><kbd>↑</kbd> <kbd>↓</kbd> move</span><span><kbd>Enter</kbd> open</span><span><kbd>Esc</kbd> close</span></div>
</dialog>
<script src="assets/search-index.js" defer></script>
<script src="assets/book.js" defer></script>
<script src="assets/figures.js" defer></script>
<script src="assets/notes.js" defer></script>
</body>
</html>
`;
}

// ---------------------------------------------------------------- chapter pages

function chapterPage(ch, index) {
  const { meta, body } = readSource(ch.file);
  const r = renderBody(ch, body);
  ch.sections = r.sections;
  ch.minutes = r.minutes;
  ch.words = r.words;
  ch.stepFigs = r.stepFigs;
  ch.figList = r.figList;
  ch.figCount = r.figCount;
  ch.description = meta.description || ch.summary;
  const prev = written[index - 1];
  const next = written[index + 1];
  const upcoming = chapters.find((c) => c.number > ch.number && !c.written);
  const nextHtml = next
    ? `<a class="next" href="${next.url}"><span>Next</span>${next.number}. ${esc(next.title)}</a>`
    : (upcoming ? `<div class="next muted"><span>Next, not yet published</span>${upcoming.number}. ${esc(upcoming.title)}</div>` : '<span></span>');
  const prevHtml = prev
    ? `<a class="prev" href="${prev.url}"><span>Previous</span>${prev.number}. ${esc(prev.title)}</a>`
    : '<a class="prev" href="index.html"><span>Back to</span>Contents and system map</a>';
  const main = `<article class="chapter" data-slug="${ch.slug}" data-number="${ch.number}" data-title="${escAttr(ch.title)}" data-minutes="${r.minutes}">
<header class="chapter-head">
  <p class="crumb"><a href="index.html#part-${ch.part.id}">Part ${ch.part.roman}: ${esc(ch.part.title)}</a><span aria-hidden="true">/</span><span>Chapter ${ch.number}</span></p>
  <h1>${esc(ch.title)}</h1>
  <p class="lede">${meta.lede || esc(ch.summary)}</p>
  <div class="pills"><span class="pill part">${esc(ch.part.title)}</span><span class="pill"><b>${r.minutes}</b> min read</span><span class="pill">Checked ${esc(meta.checked || config.factsChecked)}</span>${r.figCount ? `<span class="pill"><b>${r.figCount}</b> figure${r.figCount === 1 ? '' : 's'}</span>` : ''}${r.calcCount ? `<span class="pill"><b>${r.calcCount}</b> calculator${r.calcCount === 1 ? '' : 's'}</span>` : ''}</div>
</header>
${r.html}
<div class="end-read" hidden><p>Finished this chapter? Mark it as read to keep track of where you are in the book.</p><button class="btn small" type="button" data-mark-read aria-pressed="false">${ICON.check}<span>Mark as read</span></button></div>
<nav class="pager" aria-label="Chapter navigation">${prevHtml}${nextHtml}</nav>
</article>`;

  // "On this page": every section is a bar, placed and sized by its share of the reading time.
  const total = r.sections.reduce((a, s) => a + s.words, 0) || 1;
  let before = 0;
  const trace = r.sections.map((s) => {
    const left = (before / total) * 100;
    const width = (s.words / total) * 100;
    before += s.words;
    return `<li><a href="#${s.id}"><span class="t">${esc(s.text)}</span><span class="bar"><i style="left:${left.toFixed(2)}%;width:${width.toFixed(2)}%"></i></span></a></li>`;
  }).join('\n');
  const links = [
    r.figCount ? `<li><a href="#${r.firstFig}">${r.figCount} figure${r.figCount === 1 ? '' : 's'}${r.stepFigs ? `, ${r.stepFigs} you can play` : ''}</a></li>` : '',
    r.calcCount ? `<li><a href="#${r.firstCalc}">${r.calcCount} calculator${r.calcCount === 1 ? '' : 's'}</a></li>` : '',
    r.questions ? `<li><a href="#${r.quizId}">${r.questions} question${r.questions === 1 ? '' : 's'}<span id="rail-quiz"></span></a></li>` : '',
    `<li id="rail-marks" hidden><a href="notes.html"></a></li>`,
  ].join('');
  const rail = r.sections.length ? `<aside class="rail" id="rail" aria-label="On this page">
<h2>On this page</h2>
<p class="rail-time" id="rail-time">${r.minutes} minute read</p>
<ol class="trace" id="trace">
${trace}
</ol>
<ul class="rail-links">${links}</ul>
</aside>` : '';
  const dock = r.sections.length ? `<nav class="dock" aria-label="Reading controls">
  ${prev ? `<a href="${prev.url}" aria-label="Previous chapter: ${escAttr(prev.title)}">${ICON.prev}</a>` : `<span class="gap" aria-hidden="true">${ICON.prev}</span>`}
  <button class="here" id="dock-here" type="button" aria-controls="sheet" aria-expanded="false"><span class="row"><b id="dock-title">${esc(r.sections[0].text)}</b><small id="dock-count">1 of ${r.sections.length}</small></span><span class="meter sig"><i id="dock-bar"></i></span></button>
  ${next ? `<a href="${next.url}" aria-label="Next chapter: ${escAttr(next.title)}">${ICON.next}</a>` : `<span class="gap" aria-hidden="true">${ICON.next}</span>`}
</nav>
<div class="scrim" id="scrim"></div>
<div class="sheet" id="sheet" role="dialog" aria-label="On this page"><div class="sheet-head"><b>On this page</b><small id="sheet-time"></small><button type="button" id="sheet-close" aria-label="Close the section list">${ICON.close}</button></div></div>` : '';
  const where = `<div class="where"><small>Chapter ${ch.number} of ${chapters.length}</small><b>${esc(ch.title)}</b></div>`;
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Chapter',
    name: ch.title,
    position: ch.number,
    description: ch.description,
    isPartOf: { '@type': 'Book', name: config.title, ...(config.author ? { author: { '@type': 'Person', name: config.author } } : {}) },
    ...(meta.updated ? { dateModified: meta.updated } : {}),
  };
  return page({
    title: `${ch.title}`,
    description: ch.description,
    url: ch.url,
    bodyClass: 'is-chapter',
    current: ch,
    main,
    where,
    rail,
    dock,
    extraHead: `<script type="application/ld+json">${JSON.stringify(ld)}</script>`,
  });
}

function extraPage(p) {
  const { meta, body } = readSource(p.file);
  const r = renderBody({ slug: p.slug }, body);
  p.sections = r.sections;
  p.description = meta.description || p.summary;
  const main = `<article class="chapter" data-slug="${p.slug}">
<header class="chapter-head"><h1>${esc(p.title)}</h1><p class="lede">${meta.lede || esc(p.summary)}</p></header>
${r.html}
<nav class="pager" aria-label="Page navigation"><a class="prev" href="index.html"><span>Back to</span>Contents and system map</a>${written[0] ? `<a class="next" href="${written[0].url}"><span>Start reading</span>1. ${esc(written[0].title)}</a>` : ''}</nav>
</article>`;
  return page({ title: p.title, description: p.description, url: p.url, bodyClass: 'is-page', current: p, main });
}

// ---------------------------------------------------------------- glossary

function glossaryPage() {
  const sorted = [...terms].sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) || a.doc.number - b.doc.number);
  const groups = new Map();
  for (const t of sorted) {
    const first = t.name[0].toUpperCase();
    const key = /[A-Z]/.test(first) ? first : '0-9';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }
  const az = [...groups.keys()].map((k) => `<li><a href="#g-${k === '0-9' ? 'num' : k.toLowerCase()}">${k}</a></li>`).join('');
  const body = [...groups].map(([k, list]) => `<h2 id="g-${k === '0-9' ? 'num' : k.toLowerCase()}">${k}</h2>
<dl>
${list.map((t) => `<dt>${esc(t.name)}</dt><dd>${esc(t.def)} <a href="${t.doc.url}#${t.id}">Chapter ${t.doc.number}</a></dd>`).join('\n')}
</dl>`).join('\n');
  const main = `<article class="chapter glossary" data-slug="glossary">
<header class="chapter-head"><h1>Glossary</h1><p class="lede">Every term the book defines, ${terms.length} so far, with the sentence that introduces it and a link to the place it is explained. The list is built from the chapters, so it grows as they do.</p></header>
<ul class="az">${az}</ul>
${body}
</article>`;
  return page({ title: 'Glossary', description: 'Every term defined in the book, with the sentence that introduces it and a link to where it is explained.', url: 'glossary.html', bodyClass: 'is-page', current: { slug: 'glossary', sections: [] }, main });
}

// ---------------------------------------------------------------- index page

function indexPage() {
  const map = fs.readFileSync(path.join(SRC, 'pages', 'system-map.svg'), 'utf8');
  const totalMinutes = written.reduce((a, c) => a + c.minutes, 0);
  const hours = Math.round(totalMinutes / 60);
  const parts = outline.parts.map((part) => {
    const done = part.chapters.filter((c) => c.written).length;
    const items = part.chapters.map((ch) => {
      const inner = `<span class="num">${ch.number}</span><span class="what"><span class="title">${esc(ch.title)}</span><span class="sum">${esc(ch.summary)}</span></span>`;
      return ch.written
        ? `<li data-slug="${ch.slug}"><a href="${ch.url}">${inner}<span class="state" data-minutes="${ch.minutes} min">${ch.minutes} min</span></a></li>`
        : `<li class="planned"><div>${inner}<span class="state">Not written yet</span></div></li>`;
    }).join('\n');
    const prog = done
      ? `<div class="part-prog" data-part-prog="${done}"><span>${done} of ${part.chapters.length} published</span><span class="meter"><i></i></span></div>`
      : `<div class="part-prog"><span>${part.chapters.length} chapters, not written yet</span></div>`;
    return `<section class="part${done ? '' : ' unwritten'}" id="part-${part.id}">
<div class="part-head"><h2><span class="part-no">Part ${part.roman}</span>${esc(part.title)}</h2>${prog}</div>
<p class="blurb">${esc(part.blurb)}</p>
<ol class="chapters">${items}</ol>
</section>`;
  }).join('\n');
  const byline = config.author ? `<p class="byline">By ${esc(config.author)}</p>` : '';
  const first = written[0];
  const strip = outline.parts.map((part) => {
    const done = part.chapters.filter((c) => c.written).length;
    return `<a class="dchip" href="#part-${part.id}">${esc(part.title)} <span class="n">${done}</span></a>`;
  }).join('');
  const titleWords = config.title.split(' ');
  const titleHtml = titleWords.length > 1
    ? `${esc(titleWords.slice(0, -1).join(' '))} <span class="title-accent">${esc(titleWords[titleWords.length - 1])}</span>`
    : esc(config.title);
  const main = `<div class="home">
<header class="hero">
  <div class="aurora" aria-hidden="true"><i class="b1"></i><i class="b2"></i></div>
  <div>
    <p class="tag-row"><span>Index / ${esc(config.factsChecked)}</span><span class="rule"></span><span>Book</span></p>
    <h1>${titleHtml}</h1>
    <p class="sub">${esc(config.subtitle)}</p>
    ${byline}
    <p class="intro">This book explains how software systems are designed at two levels: the high-level design of servers, networks and data stores, and the low-level design of the classes and interfaces inside one service. It starts from a single request and builds up. Diagrams are original, code is TypeScript, and facts that change over time carry the date they were checked.</p>
    <p class="statline"><span><b>${written.length}</b> chapters</span><span class="sep">/</span><span><b>${outline.parts.length}</b> parts</span><span class="sep">/</span><span><b>${hours}h</b> of reading</span></p>
    <div class="strip">${strip}</div>
    <p class="actions">${first ? `<a class="btn" href="${first.url}" id="start-link">Start at chapter 1</a>` : ''}${pages[0] ? `<a class="btn ghost" href="${pages[0].url}">${esc(pages[0].title)}</a>` : ''}${hasNotes ? `<a class="btn ghost" href="notes.html">${esc(noteLabel)}s</a>` : ''}</p>
    <p class="status" id="home-status">${written.length} of ${chapters.length} chapters are published, about ${hours} hours of reading. The rest are listed below and marked as not written yet.</p>
  </div>
</header>
<a class="resume" id="again-card" href="#contents" hidden><b></b><span></span></a>
<section class="section map" aria-labelledby="map-h">
<div class="section-head"><h2 id="map-h">The book as one system</h2><a class="link" href="about.html">How to read →</a></div>
  <p>Most of the book describes one part of this picture. Select a region to jump to the part that covers it.</p>
  <div class="map-scroll">${map}</div>
</section>
<section class="section" aria-label="Browse by topic">
<div class="section-head"><h2>Browse by topic</h2><a class="link" href="#contents">Full contents →</a></div>
<div class="toc topic-grid" id="contents">
${parts}
</div>
</section>
${siteFooter()}
</div>`;
  const ld = { '@context': 'https://schema.org', '@type': 'Book', name: config.title, description: config.description, inLanguage: config.language || 'en', ...(config.author ? { author: { '@type': 'Person', name: config.author } } : {}), ...(siteUrl ? { url: siteUrl } : {}) };
  return page({ title: '', description: config.description, url: 'index.html', bodyClass: 'is-home', current: null, main, extraHead: `<script type="application/ld+json">${JSON.stringify(ld)}</script>` });
}

// ---------------------------------------------------------------- write

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.cpSync(path.join(SRC, 'assets'), path.join(OUT, 'assets'), { recursive: true });

const outputs = new Map();
written.forEach((ch, i) => outputs.set(ch.url, chapterPage(ch, i)));
pages.forEach((p) => outputs.set(p.url, extraPage(p)));
{
  // Notes and highlights: what the reader marked in this browser (filled in by notes.js), then any
  // notes written into the chapter files with <aside class="mine">.
  const groups = new Map();
  for (const n of notes) {
    if (!groups.has(n.doc)) groups.set(n.doc, []);
    groups.get(n.doc).push(n);
  }
  const body = [...groups].map(([doc, list]) => {
    const heading = doc.number ? `Chapter ${doc.number}: ${esc(doc.title)}` : esc(doc.title);
    const items = list.map((n) => `<aside class="mine"><span class="label"><a href="${doc.url}#${n.id}">${n.section ? esc(n.section.text) : 'Top of the page'}</a></span> ${n.html}</aside>`).join('\n');
    return `<h3 id="notes-${doc.slug}">${heading}</h3>\n${items}`;
  }).join('\n');
  const main = `<article class="chapter" data-slug="notes">
<header class="chapter-head"><h1>Notes and highlights</h1><p class="lede">What you have marked while reading. In any chapter, select some text and choose Highlight or Add a note. Everything is kept in this browser and nowhere else, so save a backup file if it matters to you.</p></header>
<div id="my-marks"><noscript><p>Highlights and notes need JavaScript, because they are stored by your browser.</p></noscript></div>
${hasNotes ? `<h2 id="written">Written into the book</h2>\n<p>Notes added to the chapter files themselves, in reading order.</p>\n${body}` : ''}
</article>`;
  outputs.set('notes.html', page({ title: 'Notes and highlights', description: 'What you have marked while reading, kept in this browser.', url: 'notes.html', bodyClass: 'is-page', current: { slug: 'notes', sections: [] }, main, footer: false }));
}
outputs.set('glossary.html', glossaryPage());
outputs.set('index.html', indexPage());
for (const [name, html] of outputs) fs.writeFileSync(path.join(OUT, name), html);
fs.writeFileSync(path.join(OUT, '.nojekyll'), ''); // GitHub Pages: serve the files as they are

// Search index: chapters (k: c), their sections (s), defined terms (t) and other pages (p).
const searchIndex = [];
for (const ch of written) {
  searchIndex.push({ k: 'c', t: ch.title, u: ch.url, c: `Chapter ${ch.number}`, d: ch.summary, n: ch.number, m: ch.minutes, p: ch.part.id });
  for (const s of ch.sections) searchIndex.push({ k: 's', t: s.text, u: `${ch.url}#${s.id}`, c: `Chapter ${ch.number}, ${ch.title}` });
}
for (const t of terms) searchIndex.push({ k: 't', t: t.name, u: `${t.doc.url}#${t.id}`, c: `Chapter ${t.doc.number}, ${t.doc.title}`, d: t.def });
for (const p of pages) searchIndex.push({ k: 'p', t: p.title, u: p.url, c: 'Page', d: p.summary });
searchIndex.push({ k: 'p', t: 'Glossary', u: 'glossary.html', c: 'Page', d: 'Every term the book defines, with a link to where it is explained.' });
searchIndex.push({ k: 'p', t: 'Notes and highlights', u: 'notes.html', c: 'Page', d: 'What you have marked while reading, kept in this browser.' });
searchIndex.push({ k: 'p', t: 'Glossary', u: 'glossary.html', c: 'Page', d: 'Every term the book defines.' });
fs.writeFileSync(path.join(OUT, 'assets', 'search-index.js'), `window.BOOK_INDEX=${JSON.stringify(searchIndex)};\n`);

if (siteUrl) {
  const urls = ['', ...pages.map((p) => p.url), ...written.map((c) => c.url)];
  fs.writeFileSync(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${siteUrl}/${u}</loc></url>`).join('\n')}\n</urlset>\n`);
  fs.writeFileSync(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${siteUrl}/sitemap.xml\n`);
}

// ---------------------------------------------------------------- link check

const problems = [];
const idsOf = new Map();
for (const [name, html] of outputs) idsOf.set(name, new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])));
for (const [name, html] of outputs) {
  for (const m of html.matchAll(/<a\b[^>]*\shref="([^"]+)"/g)) {
    const href = m[1].replace(/&amp;/g, '&');
    if (/^(https?:|mailto:)/.test(href)) continue;
    const [file, hash] = href.split('#');
    const target = file || name;
    if (!outputs.has(target)) { problems.push(`${name}: link to missing page "${href}"`); continue; }
    if (hash && !idsOf.get(target).has(hash)) problems.push(`${name}: link to missing anchor "${href}"`);
  }
  const dupes = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]).filter((id, i, a) => a.indexOf(id) !== i);
  if (dupes.length) problems.push(`${name}: duplicate ids ${[...new Set(dupes)].join(', ')}`);
}

// ---------------------------------------------------------------- figure plan
// figures.plan.json says, for every figure, whether it should be playable ("play"), show values on
// hover ("values") or stay as drawn ("still"). FIGURES.md reports how far the chapters have got.
const planFile = path.join(ROOT, 'figures.plan.json');
const plan = fs.existsSync(planFile) ? JSON.parse(fs.readFileSync(planFile, 'utf8')) : {};
const tally = { play: [0, 0], values: [0, 0], still: [0, 0] };
const unplanned = [];
const pending = [];
const report = ['# Figures', '', 'Built by `node build.mjs` from `figures.plan.json` and the chapters. Do not edit by hand.', '',
  '`play`: a sequence, converted when the figure has `<ol class="steps">`. `values`: a chart, converted when its marks carry `data-tip`. `still`: stays as drawn.', ''];
const rowsByChapter = [];
for (const ch of written) {
  const want = plan[ch.slug] || {};
  const rows = [];
  for (const f of ch.figList || []) {
    const kind = want[f.id];
    if (!kind) { unplanned.push(`${ch.slug}#${f.id}`); continue; }
    const done = kind === 'play' ? f.steps : kind === 'values' ? f.tips : true;
    tally[kind][1] += 1;
    if (done) tally[kind][0] += 1; else pending.push(`${ch.slug}#${f.id} (${kind})`);
    rows.push(`| ${f.label.replace('Figure ', '')} | \`${f.id}\` | ${f.title} | ${kind} | ${kind === 'still' ? '' : done ? 'done' : 'to do'} |`);
  }
  rowsByChapter.push([`## ${ch.number}. ${ch.title} (\`${ch.slug}\`)`, '', '| No. | Id | What it shows | Kind | Status |', '|---|---|---|---|---|', ...rows, ''].join('\n'));
}
report.push(`Playable: ${tally.play[0]} of ${tally.play[1]} done. With values: ${tally.values[0]} of ${tally.values[1]} done. Still: ${tally.still[1]}.`, '', ...rowsByChapter);
fs.writeFileSync(path.join(ROOT, 'FIGURES.md'), report.join('\n'));

const words = written.reduce((a, c) => a + c.words, 0);
const figTotal = written.reduce((a, c) => a + (c.figCount || 0), 0);
const stepTotal = written.reduce((a, c) => a + (c.stepFigs || 0), 0);
console.log(`Built ${written.length} of ${chapters.length} chapters (${words.toLocaleString('en-US')} words) and ${outputs.size - written.length} other pages into dist/` + (notes.length ? `, with ${notes.length} personal note(s)` : ''));
console.log(`${figTotal} figures: ${tally.play[0]} of ${tally.play[1]} playable ones converted, ${tally.values[0]} of ${tally.values[1]} charts with values; ${terms.length} glossary terms. See FIGURES.md.`);
if (unplanned.length) problems.push(`figures missing from figures.plan.json: ${unplanned.join(', ')}`);
if (process.argv.includes('--strict') && pending.length) problems.push(`figures not converted yet: ${pending.join(', ')}`);
if (!siteUrl) console.log('Note: set "siteUrl" in book.config.json to emit canonical links, sitemap.xml and robots.txt.');
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n` + problems.map((p) => `  ${p}`).join('\n'));
  process.exit(1);
}
console.log('All internal links and anchors resolve.');
