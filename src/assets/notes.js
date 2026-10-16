/* Highlights and notes.
   In a chapter, select some text and choose "Highlight" or "Add a note". The notes page lists
   everything and can save it to a file and bring it back.
   All of it is kept in this browser, under the localStorage key "book-notes". Nothing is sent anywhere.

   A highlight is stored as the text it covers and where that text sits: which block of the chapter
   (the n-th paragraph, list item, table cell and so on) and the character offsets inside it. If the
   chapter is edited later, the text is searched for again, and a highlight whose text no longer
   exists is kept on the notes page and marked as detached. */
(function () {
  'use strict';
  var doc = document;
  var $ = function (s, r) { return (r || doc).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || doc).querySelectorAll(s)); };
  var KEY = 'book-notes';
  var LIMIT = 3000; // characters in one highlight

  function make(tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function button(cls, text) { var b = make('button', cls, text); b.type = 'button'; return b; }
  function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }
  function load() {
    try { var v = JSON.parse(localStorage.getItem(KEY)); if (v && typeof v.items === 'object' && v.items) return v; } catch (e) { /* unreadable: start again */ }
    return { v: 1, items: {} };
  }
  function save(db) { try { localStorage.setItem(KEY, JSON.stringify(db)); return true; } catch (e) { return false; } }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function tally(db) {
    var marks = 0, notes = 0, chapters = 0;
    Object.keys(db.items).forEach(function (s) {
      var list = db.items[s] || [];
      if (list.length) chapters++;
      marks += list.length;
      list.forEach(function (it) { if (it.note) notes++; });
    });
    return { marks: marks, notes: notes, chapters: chapters };
  }
  function summary(t) { return plural(t.marks, 'highlight') + (t.notes ? ', ' + t.notes + ' with a note' : ''); }

  // ------------------------------------------------------------ the home page card
  var card = $('#marks-card');
  if (card) {
    var all = tally(load());
    if (all.marks) {
      $('b', card).textContent = summary(all);
      $('span', card).textContent = 'In ' + plural(all.chapters, 'chapter') + '. Kept in this browser. The notes page can save them to a file.';
      card.hidden = false;
    }
  }

  // ------------------------------------------------------------ in a chapter
  var article = $('.chapter[data-number]');
  if (article) (function () {
    var slug = article.getAttribute('data-slug');
    var BLOCKS = 'p, li, td, th, h2, h3, h4, dd, dt, figcaption, blockquote';
    var SKIP = '.widget, .player, svg, pre, .code, .steps, .grade, .end-read, .pager, .chapter-head, summary, .hl-pop, .hl-bar';
    var blocks = $$(BLOCKS, article).filter(function (el) { return !el.closest(SKIP) && !el.querySelector(BLOCKS); });
    var heads = $$('h2[id]', article);
    function textNodes(block) {
      var out = [], walker = doc.createTreeWalker(block, NodeFilter.SHOW_TEXT, null), n;
      while ((n = walker.nextNode())) if (!n.parentNode.closest('button, .anchor, .fig-tools')) out.push(n);
      return out;
    }
    function textOf(block) { return textNodes(block).map(function (n) { return n.data; }).join(''); }

    var db = load();
    var mine = db.items[slug] || [];
    function commit() {
      db = load();               // another tab may have written in the meantime
      if (mine.length) db.items[slug] = mine; else delete db.items[slug];
      var ok = save(db);
      counter();
      return ok;
    }

    // where a selection sits: one segment for each block it touches
    function segmentsOf(range) {
      var segs = [];
      blocks.forEach(function (block, b) {
        if (!range.intersectsNode(block)) return;
        var acc = 0, s = -1, e = -1;
        textNodes(block).forEach(function (n) {
          var len = n.data.length, lo = 0, hi = len;
          var first = n === range.startContainer, last = n === range.endContainer;
          var inside = first || last || (range.comparePoint(n, 0) === 0 && range.comparePoint(n, len) === 0);
          if (first) lo = range.startOffset;
          if (last) hi = range.endOffset;
          if (inside && hi > lo) { if (s < 0) s = acc + lo; e = acc + hi; }
          acc += len;
        });
        if (s < 0) return;
        var text = textOf(block).slice(s, e);
        var lead = text.length - text.replace(/^\s+/, '').length, trail = text.length - text.replace(/\s+$/, '').length;
        s += lead; e -= trail;
        if (e > s) segs.push({ b: b, s: s, e: e, q: textOf(block).slice(s, e) });
      });
      return segs;
    }

    function paint(item) {
      var first = true;
      item.segs.forEach(function (seg) {
        var block = blocks[seg.b];
        if (!block) return;
        var acc = 0;
        textNodes(block).forEach(function (n) {
          var len = n.data.length, lo = Math.max(seg.s - acc, 0), hi = Math.min(seg.e - acc, len);
          acc += len;
          if (hi <= lo) return;
          var mid = lo > 0 ? n.splitText(lo) : n;
          if (hi - lo < mid.data.length) mid.splitText(hi - lo);
          var m = make('mark', 'hl' + (item.note ? ' noted' : ''));
          m.setAttribute('data-hl', item.id);
          if (first) { m.id = 'hl-' + item.id; m.tabIndex = 0; m.setAttribute('role', 'button'); first = false; }
          mid.parentNode.insertBefore(m, mid);
          m.appendChild(mid);
        });
      });
      label(item);
    }
    function label(item) {
      var m = doc.getElementById('hl-' + item.id);
      if (m) m.setAttribute('aria-label', 'Highlighted: ' + item.q.slice(0, 80) + (item.note ? '. Note: ' + item.note : '') + '. Press Enter to edit.');
      $$('[data-hl="' + item.id + '"]', article).forEach(function (x) { x.classList.toggle('noted', !!item.note); if (item.note) x.title = item.note; else x.removeAttribute('title'); });
    }
    function unpaint(id) {
      $$('[data-hl="' + id + '"]', article).forEach(function (m) {
        var parent = m.parentNode;
        while (m.firstChild) parent.insertBefore(m.firstChild, m);
        parent.removeChild(m);
        parent.normalize();
      });
    }

    // find each stored highlight again; the chapter may have changed since it was made
    var texts = blocks.map(textOf), moved = false;
    mine.forEach(function (item) {
      var found = item.segs.every(function (seg) {
        if (texts[seg.b] != null && texts[seg.b].slice(seg.s, seg.e) === seg.q) return true;
        var best = -1, at = -1;
        texts.forEach(function (t, i) {
          var hit = t.indexOf(seg.q);
          if (hit > -1 && (best < 0 || Math.abs(i - seg.b) < Math.abs(best - seg.b))) { best = i; at = hit; }
        });
        if (best < 0) return false;
        seg.b = best; seg.s = at; seg.e = at + seg.q.length; moved = true;
        return true;
      });
      if (!!item.lost !== !found) { item.lost = !found; moved = true; }
      if (found) paint(item);
    });
    if (moved) commit();

    // the count beside the section list
    function counter() {
      var li = $('#rail-marks');
      if (!li) return;
      var notes = mine.filter(function (it) { return it.note; }).length;
      li.hidden = !mine.length;
      $('a', li).textContent = summary({ marks: mine.length, notes: notes });
      $('a', li).href = 'notes.html#marks-' + slug;
    }
    counter();

    // ---- the bar that appears over a selection
    var bar = make('div', 'hl-bar');
    bar.hidden = true;
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'For the selected text');
    var doMark = button('', 'Highlight'), doNote = button('', 'Add a note'), tooLong = make('span', '', 'Select a shorter passage to highlight it.');
    bar.appendChild(doMark); bar.appendChild(doNote); bar.appendChild(tooLong);
    doc.body.appendChild(bar);
    var pending = null, pendingText = '';
    var coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
    function hideBar() { bar.hidden = true; pending = null; }
    function check() {
      var sel = window.getSelection();
      if (!sel || !sel.rangeCount || sel.isCollapsed) { hideBar(); return; }
      var range = sel.getRangeAt(0), node = range.commonAncestorContainer;
      var el = node.nodeType === 1 ? node : node.parentNode;
      if (!article.contains(el) || el.closest('.hl-pop, .hl-bar, input, textarea')) { hideBar(); return; }
      var segs = segmentsOf(range);
      if (!segs.length) { hideBar(); return; }
      pending = segs;
      pendingText = segs.map(function (s) { return s.q; }).join(' ').replace(/\s+/g, ' ');
      var long = pendingText.length > LIMIT;
      doMark.hidden = doNote.hidden = long;
      tooLong.hidden = !long;
      bar.hidden = false;
      var rects = range.getClientRects();
      var r = rects.length ? (coarse ? rects[rects.length - 1] : rects[0]) : range.getBoundingClientRect();
      var w = bar.offsetWidth, h = bar.offsetHeight;
      var left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8);
      var top = coarse || r.top - h - 10 < 60 ? r.bottom + 10 : r.top - h - 10;
      bar.style.left = (left + window.scrollX) + 'px';
      bar.style.top = (top + window.scrollY) + 'px';
    }
    var timer = null;
    doc.addEventListener('selectionchange', function () { clearTimeout(timer); timer = setTimeout(check, coarse ? 350 : 140); });
    bar.addEventListener('pointerdown', function (e) { e.preventDefault(); }); // keep the selection
    function create(withNote) {
      if (!pending || pendingText.length > LIMIT) return;
      var block = blocks[pending[0].b], section = null;
      heads.forEach(function (h) { if (h.compareDocumentPosition(block) & Node.DOCUMENT_POSITION_FOLLOWING || h === block) section = h; });
      var item = { id: uid(), t: Date.now(), q: pendingText, note: '', segs: pending,
        h: section ? section.id : '', ht: section ? section.textContent.replace(/\s*#\s*$/, '').trim() : '' };
      mine.push(item);
      window.getSelection().removeAllRanges();
      hideBar();
      paint(item);
      if (!commit()) warn();
      if (withNote) openPop(item.id);
    }
    doMark.addEventListener('click', function () { create(false); });
    doNote.addEventListener('click', function () { create(true); });
    doc.addEventListener('keydown', function (e) {
      if (!e.altKey || e.ctrlKey || e.metaKey || !pending) return;
      if (e.key === 'h' || e.key === 'H') { e.preventDefault(); create(false); }
      else if (e.key === 'n' || e.key === 'N') { e.preventDefault(); create(true); }
    });
    function warn() {
      var msg = make('div', 'hl-warn', 'This browser would not store the highlight. Private windows and full storage can cause that.');
      doc.body.appendChild(msg);
      setTimeout(function () { msg.remove(); }, 6000);
    }

    // ---- the note editor
    var pop = null;
    function closePop() { if (pop) { pop.remove(); pop = null; } }
    function openPop(id) {
      closePop();
      var item = mine.filter(function (it) { return it.id === id; })[0];
      var anchor = doc.getElementById('hl-' + id);
      if (!item || !anchor) return;
      pop = make('div', 'hl-pop');
      pop.setAttribute('role', 'dialog');
      pop.setAttribute('aria-label', 'Note on this highlight');
      pop.appendChild(make('p', 'q', item.q.length > 160 ? item.q.slice(0, 157) + '…' : item.q));
      var area = make('textarea');
      area.rows = 4;
      area.placeholder = 'Your note. Leave it empty for a plain highlight.';
      area.setAttribute('aria-label', 'Your note');
      area.value = item.note || '';
      pop.appendChild(area);
      var row = make('div', 'row');
      var ok = button('btn small', 'Save note'), del = button('btn ghost small', 'Remove highlight'), no = button('btn ghost small', 'Close');
      row.appendChild(ok); row.appendChild(del); row.appendChild(no);
      pop.appendChild(row);
      doc.body.appendChild(pop);
      var r = anchor.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
      var left = Math.min(Math.max(8, r.left), window.innerWidth - w - 8);
      var below = r.bottom + 10 + h < window.innerHeight || r.top - h - 10 < 60;
      pop.style.left = (left + window.scrollX) + 'px';
      pop.style.top = ((below ? r.bottom + 10 : r.top - h - 10) + window.scrollY) + 'px';
      var finish = function () { closePop(); anchor.focus({ preventScroll: true }); };
      ok.addEventListener('click', function () { item.note = area.value.trim(); label(item); if (!commit()) warn(); finish(); });
      del.addEventListener('click', function () {
        mine = mine.filter(function (it) { return it.id !== id; });
        unpaint(id); commit(); closePop();
      });
      no.addEventListener('click', finish);
      pop.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { e.preventDefault(); finish(); }
        else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); ok.click(); }
      });
      area.focus();
    }
    article.addEventListener('click', function (e) {
      var m = e.target.closest ? e.target.closest('mark.hl') : null;
      if (!m || e.target.closest('a')) return;
      var sel = window.getSelection();
      if (sel && !sel.isCollapsed) return; // the reader is selecting, not clicking
      openPop(m.getAttribute('data-hl'));
    });
    article.addEventListener('keydown', function (e) {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('mark.hl')) { e.preventDefault(); openPop(e.target.getAttribute('data-hl')); }
    });
    doc.addEventListener('pointerdown', function (e) { if (pop && !pop.contains(e.target) && !(e.target.closest && e.target.closest('mark.hl'))) closePop(); });

    // arriving from the notes page: show the highlight that was asked for
    if (/^#hl-/.test(location.hash)) {
      var target = doc.getElementById(location.hash.slice(1));
      if (target) setTimeout(function () {
        target.scrollIntoView({ block: 'center' });
        $$('[data-hl="' + target.getAttribute('data-hl') + '"]', article).forEach(function (m) { m.classList.add('flash'); setTimeout(function () { m.classList.remove('flash'); }, 2200); });
      }, 60);
    }
  })();

  // ------------------------------------------------------------ the notes page
  var host = $('#my-marks');
  if (host) (function () {
    var index = (window.BOOK_INDEX || []).filter(function (it) { return it.k === 'c'; });
    var chapterOf = {};
    index.forEach(function (it) { chapterOf[it.u.replace(/\.html$/, '')] = it; });
    var bookTitle = (doc.title.split('|')[1] || 'the book').trim();
    function ordered(db) {
      return Object.keys(db.items).filter(function (s) { return (db.items[s] || []).length; })
        .sort(function (a, b) { return (chapterOf[a] ? chapterOf[a].n : 1e6) - (chapterOf[b] ? chapterOf[b].n : 1e6); });
    }
    function nameOf(slug) { var c = chapterOf[slug]; return c ? 'Chapter ' + c.n + ': ' + c.t : slug; }
    function sorted(list) { return list.slice().sort(function (a, b) { return a.segs[0].b - b.segs[0].b || a.segs[0].s - b.segs[0].s; }); }
    function download(name, type, text) {
      var a = make('a');
      a.href = URL.createObjectURL(new Blob([text], { type: type }));
      a.download = name;
      doc.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    }
    function markdown(db) {
      var out = ['# Notes and highlights: ' + bookTitle, ''];
      ordered(db).forEach(function (slug) {
        out.push('## ' + nameOf(slug), '');
        sorted(db.items[slug]).forEach(function (it) {
          if (it.ht) out.push('*' + it.ht + '*', '');
          out.push('> ' + it.q, '');
          if (it.note) out.push(it.note, '');
        });
      });
      return out.join('\n');
    }
    function render(message) {
      var db = load(), t = tally(db);
      host.innerHTML = '';
      var bar = make('div', 'marks-bar');
      bar.appendChild(make('p', '', t.marks ? summary(t) + ', in ' + plural(t.chapters, 'chapter') + '. They are kept in this browser only.' : 'Nothing here yet. Open a chapter, select some text, and choose Highlight or Add a note.'));
      var tools = make('div', 'row');
      var md = button('btn small', 'Save as Markdown'), js = button('btn ghost small', 'Save a backup file'), up = button('btn ghost small', 'Restore from a backup'), wipe = button('btn ghost small', 'Remove all');
      var file = make('input'); file.type = 'file'; file.accept = 'application/json,.json'; file.hidden = true;
      md.disabled = js.disabled = wipe.disabled = !t.marks;
      [md, js, up, wipe, file].forEach(function (b) { tools.appendChild(b); });
      bar.appendChild(tools);
      if (message) { var said = make('p', 'marks-said', message); said.setAttribute('role', 'status'); bar.appendChild(said); }
      host.appendChild(bar);
      md.addEventListener('click', function () { download('system-design-notes.md', 'text/markdown', markdown(load())); });
      js.addEventListener('click', function () { download('system-design-notes.json', 'application/json', JSON.stringify(load(), null, 1)); });
      up.addEventListener('click', function () { file.click(); });
      file.addEventListener('change', function () {
        var f = file.files[0];
        if (!f) return;
        var reader = new FileReader();
        reader.onload = function () {
          var added = 0, now = load();
          try {
            var got = JSON.parse(reader.result);
            if (!got || typeof got.items !== 'object') throw new Error('not a backup');
            Object.keys(got.items).forEach(function (slug) {
              var have = now.items[slug] || [];
              (got.items[slug] || []).forEach(function (it) {
                if (!it || !it.id || !it.segs || !it.segs.length || typeof it.q !== 'string') return;
                var at = -1;
                have.forEach(function (h, i) { if (h.id === it.id) at = i; });
                if (at > -1) have[at] = it; else { have.push(it); added++; }
              });
              if (have.length) now.items[slug] = have;
            });
          } catch (e) { render('That file is not a backup made by this page.'); return; }
          render(save(now) ? 'Restored. ' + plural(added, 'highlight') + ' added.' : 'This browser would not store the backup.');
        };
        reader.readAsText(f);
      });
      wipe.addEventListener('click', function () {
        if (!window.confirm('Remove every highlight and note kept in this browser? This cannot be undone.')) return;
        save({ v: 1, items: {} });
        render('All highlights and notes were removed.');
      });

      ordered(db).forEach(function (slug) {
        var c = chapterOf[slug];
        var h = make('h2');
        h.id = 'marks-' + slug;
        if (c) { var link = make('a', '', nameOf(slug)); link.href = c.u; h.appendChild(link); } else h.textContent = nameOf(slug);
        host.appendChild(h);
        sorted(db.items[slug]).forEach(function (it) {
          var box = make('div', 'mark-item' + (it.lost ? ' lost' : ''));
          box.appendChild(make('blockquote', '', it.q));
          var note = make('p', 'mark-note', it.note || '');
          note.hidden = !it.note;
          box.appendChild(note);
          var meta = make('p', 'mark-meta');
          if (it.lost) meta.appendChild(make('span', '', 'The chapter has changed and this text is no longer in it.'));
          else if (c) { var go = make('a', '', it.ht ? 'In “' + it.ht + '”' : 'Open in the chapter'); go.href = c.u + '#hl-' + it.id; meta.appendChild(go); }
          meta.appendChild(make('span', '', new Date(it.t).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })));
          var edit = button('btn ghost small', it.note ? 'Edit note' : 'Add a note'), drop = button('btn ghost small', 'Remove');
          meta.appendChild(edit); meta.appendChild(drop);
          box.appendChild(meta);
          host.appendChild(box);
          var change = function (fn) {
            var now = load(), list = now.items[slug] || [];
            now.items[slug] = fn(list);
            if (!now.items[slug].length) delete now.items[slug];
            save(now);
            render();
          };
          drop.addEventListener('click', function () { change(function (list) { return list.filter(function (x) { return x.id !== it.id; }); }); });
          edit.addEventListener('click', function () {
            if ($('textarea', box)) return;
            var area = make('textarea'); area.rows = 3; area.value = it.note || ''; area.setAttribute('aria-label', 'Your note');
            var ok = button('btn small', 'Save note'), no = button('btn ghost small', 'Cancel');
            var row = make('div', 'row'); row.appendChild(ok); row.appendChild(no);
            box.insertBefore(area, meta); box.insertBefore(row, meta);
            area.focus();
            no.addEventListener('click', function () { render(); });
            ok.addEventListener('click', function () {
              var text = area.value.trim();
              change(function (list) { list.forEach(function (x) { if (x.id === it.id) x.note = text; }); return list; });
            });
          });
        });
      });
    }
    render();
    window.addEventListener('storage', function (e) { if (e.key === KEY) render(); });
  })();
})();
