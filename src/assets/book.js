/* Behavior for the book: theme, contents, reading progress, search and the calculators.
   Everything here is an enhancement. Pages read correctly with JavaScript off.
   What is remembered (theme, chapters read, where you stopped, quiz answers) stays in this
   browser's localStorage. Nothing is sent anywhere. Highlights and notes are in notes.js,
   the figure player in figures.js. */
(function () {
  'use strict';
  var doc = document;
  var $ = function (s, r) { return (r || doc).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || doc).querySelectorAll(s)); };
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
    json: function (k, fallback) { try { var v = JSON.parse(localStorage.getItem(k)); return v && typeof v === 'object' ? v : fallback; } catch (e) { return fallback; } },
    put: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
  };
  function make(tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }
  var INDEX = function () { return window.BOOK_INDEX || []; };
  var here = location.pathname.split('/').pop() || 'index.html';

  // ------------------------------------------------------------ theme
  var themeBtn = $('#theme-btn');
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      var root = doc.documentElement;
      var current = root.getAttribute('data-theme') ||
        (window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
      var next = current === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      store.set('book-theme', next);
    });
  }

  // ------------------------------------------------------------ contents on small screens
  var menuBtn = $('#menu-btn');
  var sidebar = $('#sidebar');
  function setMenu(open) {
    if (!sidebar || !menuBtn) return;
    sidebar.classList.toggle('open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
    doc.body.style.overflow = open ? 'hidden' : '';
    if (open) { var c = $('#side-close'); if (c) c.focus(); } else if (doc.activeElement && sidebar.contains(doc.activeElement)) menuBtn.focus();
  }
  if (menuBtn && sidebar) {
    menuBtn.addEventListener('click', function () { setMenu(!sidebar.classList.contains('open')); });
    var sideClose = $('#side-close');
    if (sideClose) sideClose.addEventListener('click', function () { setMenu(false); });
    sidebar.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });
    var current = $('.sidebar a[aria-current="page"]');
    if (current && sidebar.scrollHeight > sidebar.clientHeight) sidebar.scrollTop = Math.max(0, current.offsetTop - sidebar.clientHeight / 2);
  }

  // ------------------------------------------------------------ chapters read
  var read = store.json('book-read', {});
  var article = $('.chapter[data-number]');
  var slug = article ? article.getAttribute('data-slug') : '';
  function paintRead() {
    $$('li[data-slug]').forEach(function (li) { li.classList.toggle('read', !!read[li.getAttribute('data-slug')]); });
    $$('.chapters li[data-slug] .state').forEach(function (s) {
      s.textContent = s.closest('li').classList.contains('read') ? 'Read' : s.getAttribute('data-minutes');
    });
    var counter = $('#read-count');
    if (counter) {
      var total = Number(counter.getAttribute('data-total'));
      var n = $$('.sidebar li[data-slug].read').length;
      counter.firstElementChild.textContent = n + ' of ' + total + ' chapters read';
      $('i', counter).style.width = (total ? n / total * 100 : 0) + '%';
      counter.hidden = false;
    }
    $$('[data-mark-read]').forEach(function (b) {
      var on = !!read[slug];
      b.setAttribute('aria-pressed', String(on));
      b.lastElementChild.textContent = on ? 'Read' : 'Mark as read';
      b.hidden = false;
    });
    $$('.part').forEach(function (part) {
      var prog = $('[data-part-prog]', part);
      if (!prog) return;
      var all = $$('li[data-slug]', part).length;
      var done = $$('li[data-slug].read', part).length;
      if (done) prog.firstElementChild.textContent = done + ' of ' + all + ' read';
      $('i', prog).style.width = (all ? done / all * 100 : 0) + '%';
    });
    var status = $('#home-status');
    if (status) {
      var readCount = Object.keys(read).filter(function (k) { return read[k]; }).length;
      var extra = $('#home-read') || status.appendChild(make('span'));
      extra.id = 'home-read';
      extra.textContent = readCount ? ' You have read ' + readCount + '.' : '';
    }
  }
  function setRead(on) {
    if (!slug) return;
    read = store.json('book-read', {});
    if (on) read[slug] = 1; else delete read[slug];
    store.put('book-read', read);
    paintRead();
  }
  $$('[data-mark-read]').forEach(function (b) { b.addEventListener('click', function () { setRead(!read[slug]); }); });
  var endRead = $('.end-read');
  if (endRead) endRead.hidden = false;
  paintRead();

  // ------------------------------------------------------------ the chapter as a trace: sections, progress, where you stopped
  var heads = [];
  var traceItems = [];
  var sheet = $('#sheet');
  var scrim = $('#scrim');
  var dockHere = $('#dock-here');
  if (article) {
    $$('#trace li').forEach(function (li) {
      var h = doc.getElementById($('a', li).getAttribute('href').slice(1));
      if (h) { heads.push(h); traceItems.push([li]); }
    });
    if (sheet && $('#trace')) {
      var copy = $('#trace').cloneNode(true);
      copy.removeAttribute('id');
      sheet.appendChild(copy);
      $$('li', copy).forEach(function (li, i) { if (traceItems[i]) traceItems[i].push(li); });
      copy.addEventListener('click', function (e) { if (e.target.closest('a')) setSheet(false); });
    }
  }
  function setSheet(open) {
    if (!sheet) return;
    sheet.classList.toggle('open', open);
    scrim.classList.toggle('open', open);
    dockHere.setAttribute('aria-expanded', String(open));
    if (open) $('#sheet-close').focus(); else if (sheet.contains(doc.activeElement)) dockHere.focus();
  }
  if (dockHere && sheet) {
    dockHere.addEventListener('click', function () { setSheet(!sheet.classList.contains('open')); });
    $('#sheet-close').addEventListener('click', function () { setSheet(false); });
    scrim.addEventListener('click', function () { setSheet(false); });
  }

  var minutes = article ? Number(article.getAttribute('data-minutes')) : 0;
  var lastSaved = 0;
  function track() {
    if (!article) return;
    var rect = article.getBoundingClientRect();
    var span = Math.max(1, rect.height - window.innerHeight);
    var done = Math.min(1, Math.max(0, -rect.top / span));
    var bar = $('#progress-bar');
    if (bar) bar.style.width = (done * 100).toFixed(1) + '%';
    var now = 0;
    for (var i = 0; i < heads.length; i++) if (heads[i].getBoundingClientRect().top < window.innerHeight * 0.35) now = i;
    traceItems.forEach(function (pair, i) {
      pair.forEach(function (li) {
        li.classList.toggle('done', i < now);
        li.classList.toggle('now', i === now);
        if (i === now) $('a', li).setAttribute('aria-current', 'location'); else $('a', li).removeAttribute('aria-current');
      });
    });
    var left = Math.max(0, Math.round(minutes * (1 - done)));
    var leftText = done < 0.02 ? minutes + ' minute read' : left < 1 ? 'Less than a minute left' : 'About ' + plural(left, 'minute') + ' left';
    var railTime = $('#rail-time'); if (railTime) railTime.textContent = leftText;
    var sheetTime = $('#sheet-time'); if (sheetTime) sheetTime.textContent = leftText;
    if (heads.length) {
      var name = heads[now].textContent.replace(/\s*#\s*$/, '').trim();
      var t = $('#dock-title'); if (t) t.textContent = name;
      var c = $('#dock-count'); if (c) c.textContent = (now + 1) + ' of ' + heads.length;
      var db = $('#dock-bar'); if (db) db.style.width = (done * 100).toFixed(1) + '%';
      var stamp = Date.now();
      if (stamp - lastSaved > 1500) {
        lastSaved = stamp;
        var pos = store.json('book-pos', {});
        pos[slug] = { s: name, h: heads[now].id, p: Math.round(done * 100), left: left };
        store.put('book-pos', pos);
      }
    }
  }
  if (article) {
    store.put('book-last', { u: here, n: Number(article.getAttribute('data-number')), t: article.getAttribute('data-title'), slug: slug });
    var ticking = false;
    var onScroll = function () { if (!ticking) { ticking = true; requestAnimationFrame(function () { ticking = false; track(); }); } };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    track();
  }

  // ------------------------------------------------------------ home: where you stopped, questions to try again
  var card = $('#continue-card');
  var last = store.json('book-last', null);
  if (card && last && last.u && last.t) {
    var pos = store.json('book-pos', {})[last.slug] || {};
    card.href = last.u + (pos.h && pos.p > 2 && pos.p < 97 ? '#' + pos.h : '');
    card.innerHTML = '';
    card.appendChild(make('small', '', 'Where you stopped'));
    card.appendChild(make('b', '', last.n + '. ' + last.t));
    if (pos.s) card.appendChild(make('span', '', pos.s + (pos.left ? '. About ' + plural(pos.left, 'minute') + ' left' : '')));
    var meter = make('span', 'meter sig'); var fill = make('i'); fill.style.width = (pos.p || 0) + '%'; meter.appendChild(fill); card.appendChild(meter);
    var start = $('#start-link');
    if (start) { start.href = card.href; start.textContent = 'Continue chapter ' + last.n; }
  }
  var quiz = store.json('book-quiz', {});
  var againCard = $('#again-card');
  if (againCard) {
    var again = 0, firstAgain = '';
    Object.keys(quiz).forEach(function (s) {
      Object.keys(quiz[s]).forEach(function (q) { if (quiz[s][q] === 'again') { again++; firstAgain = firstAgain || s; } });
    });
    if (again) {
      againCard.href = firstAgain + '.html#check';
      $('b', againCard).textContent = plural(again, 'question') + ' to try again';
      $('span', againCard).textContent = 'You marked these to come back to. This opens the first chapter that has one.';
      againCard.hidden = false;
    }
  }

  // ------------------------------------------------------------ check yourself: mark what you knew
  var quizItems = $$('.quiz details');
  function paintQuiz() {
    var mine = quiz[slug] || {};
    var answered = 0;
    quizItems.forEach(function (d, i) {
      d.classList.toggle('ok', mine[i] === 'ok');
      d.classList.toggle('again', mine[i] === 'again');
      if (mine[i]) answered++;
    });
    var note = $('#rail-quiz');
    if (note) note.textContent = answered ? ', ' + answered + ' answered' : '';
  }
  if (slug && quizItems.length) {
    quizItems.forEach(function (d, i) {
      d.addEventListener('toggle', function () {
        if (!d.open || $('.grade', d)) return;
        var row = make('div', 'grade');
        [['ok', 'I knew this'], ['again', 'Ask me again later']].forEach(function (pair) {
          var b = make('button', 'btn ghost small', pair[1]);
          b.type = 'button';
          b.addEventListener('click', function () {
            quiz = store.json('book-quiz', {});
            quiz[slug] = quiz[slug] || {};
            if (quiz[slug][i] === pair[0]) delete quiz[slug][i]; else quiz[slug][i] = pair[0];
            store.put('book-quiz', quiz);
            paintQuiz();
          });
          row.appendChild(b);
        });
        d.appendChild(row);
      });
    });
    paintQuiz();
  }

  // ------------------------------------------------------------ search palette
  var palette = $('#palette');
  var pin = $('#palette-input');
  var pout = $('#palette-out');
  var active = -1;
  var GROUPS = [['c', 'Chapters', 6], ['t', 'Terms', 6], ['s', 'Sections', 8], ['p', 'Pages', 3]];
  function score(item, terms) {
    var title = item.t.toLowerCase();
    var hay = title + ' ' + (item.k === 's' ? '' : (item.d || '').toLowerCase());
    var total = 0;
    for (var i = 0; i < terms.length; i++) {
      var at = title.indexOf(terms[i]);
      if (at === 0) total += 0;
      else if (at > 0 && /[\s\-(/]/.test(title.charAt(at - 1))) total += 1;
      else if (at > 0) total += 2;
      else if (hay.indexOf(terms[i]) > -1) total += 4;
      else return -1;
    }
    return total + title.length / 200;
  }
  function renderPalette() {
    var terms = pin.value.toLowerCase().split(/\s+/).filter(Boolean);
    pout.innerHTML = '';
    active = -1;
    if (!terms.length) {
      var counts = { c: 0, s: 0, t: 0 };
      INDEX().forEach(function (it) { if (counts[it.k] != null) counts[it.k]++; });
      pout.appendChild(make('li', 'none', 'Type to search ' + counts.c + ' chapters, ' + counts.s + ' sections and ' + counts.t + ' defined terms.'));
      var l = store.json('book-last', null);
      if (l && l.u) {
        pout.appendChild(make('li', 'group', 'Where you stopped'));
        var li = make('li'); var a = make('a', '', l.n + '. ' + l.t); a.href = l.u; li.appendChild(a); pout.appendChild(li);
      }
      return;
    }
    var any = false;
    GROUPS.forEach(function (g) {
      var hits = [];
      INDEX().forEach(function (item) { if (item.k === g[0]) { var s = score(item, terms); if (s >= 0) hits.push([s, item]); } });
      if (!hits.length) return;
      any = true;
      hits.sort(function (a, b) { return a[0] - b[0]; });
      pout.appendChild(make('li', 'group', g[1]));
      hits.slice(0, g[2]).forEach(function (h) {
        var li = make('li');
        var a = make('a', '', h[1].t);
        a.href = h[1].u;
        a.appendChild(make('small', '', h[1].k === 't' && h[1].d ? h[1].d : h[1].k === 'c' ? h[1].c + '. ' + h[1].d : h[1].c));
        li.appendChild(a);
        pout.appendChild(li);
      });
    });
    if (!any) pout.appendChild(make('li', 'none', 'Nothing matches. Try one word, such as "cache" or "quorum".'));
    else move(1);
  }
  function move(step) {
    var links = $$('a', pout);
    if (!links.length) return;
    active = (active + step + links.length) % links.length;
    links.forEach(function (a, i) { a.classList.toggle('active', i === active); });
    links[active].scrollIntoView({ block: 'nearest' });
  }
  function openPalette() {
    if (!palette || palette.open) return;
    setMenu(false);
    if (palette.showModal) palette.showModal(); else palette.setAttribute('open', '');
    pin.value = '';
    renderPalette();
    pin.focus();
  }
  function closePalette() { if (palette && palette.open) { if (palette.close) palette.close(); else palette.removeAttribute('open'); } }
  if (palette && pin) {
    var key = $('#search-key');
    if (key && /Mac|iPhone|iPad/.test(navigator.platform || '')) key.textContent = '⌘ K';
    $('#search-btn').addEventListener('click', openPalette);
    $('#palette-close').addEventListener('click', closePalette);
    palette.addEventListener('click', function (e) { if (e.target === palette) closePalette(); });
    pin.addEventListener('input', renderPalette);
    pin.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); move(e.key === 'ArrowDown' ? 1 : -1); }
      else if (e.key === 'Enter') { var links = $$('a', pout); if (links.length) { e.preventDefault(); var to = links[Math.max(active, 0)]; closePalette(); location.href = to.href; } }
    });
    pout.addEventListener('click', function (e) { if (e.target.closest('a')) closePalette(); });
    doc.addEventListener('keydown', function (e) {
      var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(doc.activeElement.tagName);
      if ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); if (palette.open) closePalette(); else openPalette(); }
      else if (e.key === '/' && !typing) { e.preventDefault(); openPalette(); }
      else if (e.key === 'Escape') { setMenu(false); setSheet(false); }
    });
  }

  // ------------------------------------------------------------ a preview when a link points at another chapter
  if (window.matchMedia && matchMedia('(hover: hover)').matches) {
    var peek = null;
    var hidePeek = function () { if (peek) { peek.remove(); peek = null; } };
    $$('a.xref, .connects a').forEach(function (a) {
      var file = (a.getAttribute('href') || '').split('#')[0];
      if (!file || file === here) return;
      var show = function () {
        var item = null;
        INDEX().forEach(function (it) { if (it.k === 'c' && it.u === file) item = it; });
        if (!item) return;
        hidePeek();
        peek = make('div', 'peek');
        peek.setAttribute('role', 'tooltip');
        peek.appendChild(make('small', '', item.c + ', ' + item.m + ' minute read' + (read[file.replace(/\.html$/, '')] ? ', read' : '')));
        peek.appendChild(make('b', '', item.t));
        peek.appendChild(doc.createTextNode(item.d));
        doc.body.appendChild(peek);
        var r = a.getBoundingClientRect();
        var w = peek.offsetWidth;
        var left = Math.min(Math.max(8, r.left), window.innerWidth - w - 8);
        var below = r.bottom + 8 + peek.offsetHeight < window.innerHeight;
        peek.style.left = (left + window.scrollX) + 'px';
        peek.style.top = ((below ? r.bottom + 8 : r.top - peek.offsetHeight - 8) + window.scrollY) + 'px';
      };
      a.addEventListener('mouseenter', show);
      a.addEventListener('focus', show);
      a.addEventListener('mouseleave', hidePeek);
      a.addEventListener('blur', hidePeek);
    });
    window.addEventListener('scroll', hidePeek, { passive: true });
  }

  // ------------------------------------------------------------ copy buttons on code
  $$('.code').forEach(function (block) {
    if (!navigator.clipboard) return;
    var btn = make('button', 'copy-btn', 'Copy');
    btn.type = 'button';
    btn.addEventListener('click', function () {
      navigator.clipboard.writeText($('code', block).textContent).then(function () {
        btn.textContent = 'Copied';
        setTimeout(function () { btn.textContent = 'Copy'; }, 1500);
      });
    });
    ($('.code-head', block) || block).appendChild(btn);
  });

  // ------------------------------------------------------------ a slider beside every number in a calculator
  function niceMax(v) {
    var target = Math.max(Math.abs(v) * 4, 1);
    var pow = Math.pow(10, Math.floor(Math.log(target) / Math.LN10));
    var lead = target / pow;
    return (lead <= 1 ? 1 : lead <= 2 ? 2 : lead <= 5 ? 5 : 10) * pow;
  }
  $$('.widget input[type="number"]').forEach(function (num) {
    var min = num.min === '' ? 0 : Number(num.min);
    var max = num.max === '' ? niceMax(Number(num.value)) : Number(num.max);
    if (!(max > min)) return;
    var step = Number(num.step) || 1;
    if ((max - min) / step < 10) step = (max - min) / 100;
    var decimals = (String(step).split('.')[1] || '').length;
    var range = make('input');
    range.type = 'range';
    range.min = min; range.max = max; range.step = 'any';
    range.value = num.value;
    var label = num.closest('label');
    range.setAttribute('aria-label', (label ? label.firstChild.textContent.trim() : num.name) + ', slider');
    range.addEventListener('input', function () {
      var v = Math.round(Number(range.value) / step) * step;
      num.value = Math.min(max, Math.max(min, v)).toFixed(Math.min(decimals, 6));
    });
    num.addEventListener('input', function () { range.value = num.value; });
    num.insertAdjacentElement('afterend', range);
  });

  // ------------------------------------------------------------ number formatting
  function sig(n, digits) { return Number(n.toPrecision(digits || 3)); }
  function compact(n) {
    if (!isFinite(n)) return 'n/a';
    var a = Math.abs(n);
    if (a >= 1e15) {
      var e = Math.floor(Math.log10(a));
      var sup = String(e).split('').map(function (d) { return '⁰¹²³⁴⁵⁶⁷⁸⁹'.charAt(+d); }).join('');
      return sig(n / Math.pow(10, e)) + ' × 10' + sup;
    }
    if (a >= 1e12) return sig(n / 1e12) + ' trillion';
    if (a >= 1e9) return sig(n / 1e9) + ' billion';
    if (a >= 1e6) return sig(n / 1e6) + ' million';
    if (a >= 1e4) return sig(n / 1e3) + ' thousand';
    if (a >= 100) return Math.round(n).toLocaleString('en-US');
    return String(sig(n));
  }
  function bytes(n) {
    var units = ['bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB'];
    var i = 0;
    while (n >= 1000 && i < units.length - 1) { n /= 1000; i++; }
    return sig(n) + ' ' + (i === 0 && sig(n) === 1 ? 'byte' : units[i]);
  }
  function bits(n) {
    var units = ['bit/s', 'kbit/s', 'Mbit/s', 'Gbit/s', 'Tbit/s'];
    var i = 0;
    while (n >= 1000 && i < units.length - 1) { n /= 1000; i++; }
    return sig(n) + ' ' + units[i];
  }
  function duration(seconds) {
    if (seconds < 1) return sig(seconds * 1000) + ' ms';
    if (seconds < 90) return sig(seconds) + ' s';
    if (seconds < 5400) return sig(seconds / 60) + ' min';
    if (seconds < 172800) return sig(seconds / 3600) + ' hours';
    if (seconds < 63072000) return sig(seconds / 86400) + ' days';
    return sig(seconds / 31536000) + ' years';
  }
  function val(root, name) { var el = $('[name="' + name + '"]', root); return el ? parseFloat(el.value) : NaN; }
  function out(root, name, text) { var el = $('[data-out="' + name + '"]', root); if (el) el.textContent = text; }
  function bind(root, fn) {
    var run = function () {
      fn();
      // On a narrow screen the drawing scrolls sideways. Keep its marked point in view.
      var frame = $('.draw', root), mark = frame && $('.dot', frame);
      if (!mark || frame.scrollWidth <= frame.clientWidth + 1) return;
      var f = frame.getBoundingClientRect(), m = mark.getBoundingClientRect();
      if (m.left < f.left + 24 || m.right > f.right - 24) frame.scrollLeft += m.left + m.width / 2 - (f.left + f.width / 2);
    };
    root.addEventListener('input', run);
    root.addEventListener('change', run);
    run();
  }
  // A calculator may hold one drawing. The markup carries the drawing for the default numbers, and
  // every change draws it again from nothing with the same code, so the two cannot drift apart.
  var SVGNS = 'http://www.w3.org/2000/svg';
  function paper(root, w, h) {
    var svg = $('svg.dg', root);
    if (!svg) return null;
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    svg.textContent = '';
    return function (name, attrs, text) {
      var e = doc.createElementNS(SVGNS, name);
      for (var k in attrs) e.setAttribute(k, attrs[k]);
      if (text != null) e.textContent = text;
      svg.appendChild(e);
      return e;
    };
  }
  function noPaper(root) { var svg = $('svg.dg', root); if (svg) svg.textContent = ''; }
  function r1(x) { return Number(x.toFixed(1)); }
  function pathOf(points) { return points.map(function (p, i) { return (i ? 'L' : 'M') + r1(p[0]) + ' ' + r1(p[1]); }).join(' '); }

  // ------------------------------------------------------------ availability calculator
  $$('[data-widget="nines"]').forEach(function (root) {
    bind(root, function () {
      var a = val(root, 'component') / 100;
      var n = val(root, 'series');
      var r = val(root, 'copies');
      var stage = 1 - Math.pow(1 - a, r);
      var system = Math.pow(stage, n);
      var year = 365.25 * 86400;
      out(root, 'series', n);
      out(root, 'copies', r);
      out(root, 'system', (system * 100).toFixed(system > 0.99999 ? 5 : system > 0.9999 ? 4 : 3) + '%');
      out(root, 'year', duration((1 - system) * year));
      out(root, 'month', duration((1 - system) * year / 12));
      out(root, 'day', duration((1 - system) * 86400));
      var single = Math.pow(a, n);
      out(root, 'verdict', r > 1
        ? 'Without the extra copies the same chain would be ' + (single * 100).toFixed(3) + '% available, which is ' + duration((1 - single) * year) + ' of downtime a year. This assumes copies fail independently, which real systems only approximate.'
        : n > 1
          ? 'Every dependency in the chain multiplies in. ' + n + ' components at ' + (a * 100) + '% each are worse than any one of them alone.'
          : 'One component, no redundancy: the system is exactly as available as that component.');
    });
  });

  // ------------------------------------------------------------ capacity estimator
  $$('[data-widget="estimator"]').forEach(function (root) {
    bind(root, function () {
      var dau = val(root, 'dau'), reads = val(root, 'reads'), writes = val(root, 'writes');
      var writeKb = val(root, 'writeKb'), readKb = val(root, 'readKb');
      var peak = val(root, 'peak'), years = val(root, 'years'), copies = val(root, 'copies');
      if ([dau, reads, writes, writeKb, readKb, peak, years, copies].some(function (x) { return !isFinite(x) || x < 0; })) {
        $$('[data-out]', root).forEach(function (e) { e.textContent = 'n/a'; });
        out(root, 'verdict', 'Enter a number of zero or more in every field.');
        return;
      }
      var day = 86400;
      var rq = dau * reads / day, wq = dau * writes / day;
      var perDay = dau * writes * writeKb * 1000;
      out(root, 'readQps', compact(rq) + ' /s');
      out(root, 'readPeak', compact(rq * peak) + ' /s');
      out(root, 'writeQps', compact(wq) + ' /s');
      out(root, 'writePeak', compact(wq * peak) + ' /s');
      out(root, 'storageDay', bytes(perDay));
      out(root, 'storageTotal', bytes(perDay * 365 * years * copies));
      out(root, 'egress', bits(rq * readKb * 1000 * 8));
      out(root, 'egressPeak', bits(rq * peak * readKb * 1000 * 8));
      var ratio = wq > 0 ? rq / wq : Infinity;
      out(root, 'verdict', !isFinite(ratio)
        ? 'There are no writes, so this is a read-only workload.'
        : ratio >= 10
          ? 'Reads outnumber writes about ' + compact(ratio) + ' to 1. That is a read-heavy system: caching, replicas and a CDN will do most of the work.'
          : ratio <= 0.5
            ? 'Writes outnumber reads. That is a write-heavy system: look at append-friendly storage, batching and partitioning.'
            : 'Reads and writes are within an order of magnitude of each other, so neither path can be neglected.');
    });
  });

  // ------------------------------------------------------------ fan-out and the tail
  $$('[data-widget="fanout"]').forEach(function (root) {
    bind(root, function () {
      var n = val(root, 'calls');
      var p = val(root, 'percentile') / 100;
      var slow = 1 - Math.pow(p, n);
      out(root, 'calls', n);
      out(root, 'slow', (slow * 100).toFixed(1) + '%');
      out(root, 'fast', ((1 - slow) * 100).toFixed(1) + '%');
      var bar = $('[data-bar]', root);
      if (bar) bar.setAttribute('width', (slow * 100).toFixed(2) + '%');
      out(root, 'verdict', 'With ' + n + ' backend call' + (n === 1 ? '' : 's') + ' per request, about ' + (slow * 100).toFixed(1) +
        '% of user requests wait on at least one call that is slower than the backend’s own p' + (p * 100) + '.');
    });
  });

  // ------------------------------------------------------------ subnet calculator
  $$('[data-widget="subnet"]').forEach(function (root) {
    function dotted(n) { return [Math.floor(n / 16777216) % 256, Math.floor(n / 65536) % 256, Math.floor(n / 256) % 256, n % 256].join('.'); }
    bind(root, function () {
      var m = /^\s*(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\s*\/\s*(\d{1,2})\s*$/.exec($('[name="cidr"]', root).value);
      var ok = m && +m[1] <= 255 && +m[2] <= 255 && +m[3] <= 255 && +m[4] <= 255 && +m[5] <= 32;
      if (!ok) {
        ['network', 'mask', 'range', 'count', 'hosts'].forEach(function (k) { out(root, k, 'n/a'); });
        out(root, 'verdict', 'Enter an IPv4 block in CIDR notation, such as 10.0.16.0/20. The part after the slash is a prefix length from 0 to 32.');
        return;
      }
      var ip = (+m[1]) * 16777216 + (+m[2]) * 65536 + (+m[3]) * 256 + (+m[4]);
      var bits = +m[5];
      var size = Math.pow(2, 32 - bits);
      var net = Math.floor(ip / size) * size;
      var last = net + size - 1;
      out(root, 'network', dotted(net) + '/' + bits);
      out(root, 'mask', dotted(4294967296 - size));
      out(root, 'range', dotted(net) + ' to ' + dotted(last));
      out(root, 'count', size.toLocaleString('en-US'));
      out(root, 'hosts', (bits >= 31 ? size : size - 2).toLocaleString('en-US'));
      var a = +m[1], b = +m[2];
      var kind = a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ? 'a private range, usable inside your own network and never routed on the internet'
        : a === 100 && b >= 64 && b <= 127 ? 'the shared range that internet providers use for carrier-grade NAT'
        : a === 127 ? 'the loopback range, which never leaves the machine'
        : a === 169 && b === 254 ? 'the link-local range, used when no address has been assigned'
        : a >= 224 ? 'a multicast or reserved range'
        : 'public address space, which must be allocated to you before you can use it';
      out(root, 'verdict', (ip !== net ? 'The address you typed sits inside the block that starts at ' + dotted(net) + '. ' : '') +
        'This is ' + kind + '. Each bit added to the prefix halves the block: a /' + Math.min(bits + 1, 32) + ' here would hold ' + Math.max(size / 2, 1).toLocaleString('en-US') + ' addresses.');
    });
  });

  // ------------------------------------------------------------ TCP slow start
  $$('[data-widget="slowstart"]').forEach(function (root) {
    bind(root, function () {
      var kb = val(root, 'size'), rtt = val(root, 'rtt'), iw = val(root, 'iw');
      if (!(kb > 0) || !(rtt >= 0) || !(iw >= 1)) { noPaper(root); ['first', 'trips', 'time'].forEach(function (k) { out(root, k, 'n/a'); }); out(root, 'verdict', 'Enter a response size above zero, a round-trip time of zero or more, and an initial window of at least 1 segment.'); return; }
      var first = iw * 1460;
      var trips = Math.ceil(Math.log(kb * 1000 / first + 1) / Math.LN2 - 1e-9);
      var d = paper(root, 640, 112);
      if (d) {
        var total = kb * 1000, sent = 0, x0 = 16, wide = 608;
        d('text', { x: x0, y: 20, 'class': 'ts' }, 'What arrives in each round trip, as a share of the ' + bytes(total) + ' response');
        for (var t = 0; t < Math.min(trips, 40); t++) {
          var part = Math.min(first * Math.pow(2, t), total - sent);
          var sx = x0 + sent / total * wide, sw = part / total * wide;
          d('rect', { x: r1(sx), y: 32, width: r1(Math.max(sw - 1.5, 0.6)), height: 30, rx: 3, 'class': t % 2 ? 'n store' : 'n sig' });
          if (sw > 26) d('text', { x: r1(sx + sw / 2), y: 52, 'class': 'tb mid' }, String(t + 1));
          if (sw > 78) d('text', { x: r1(sx + sw / 2), y: 82, 'class': 'ts mid' }, bytes(part));
          sent += part;
        }
        d('text', { x: x0, y: 104, 'class': 'ts' }, trips === 1 ? 'One round trip carries all of it.' : 'Each block is one round trip. Every block is twice the size of the one before, until the response ends.');
      }
      var flights = [];
      for (var k = 0; k < Math.min(trips, 8); k++) flights.push(bytes(first * Math.pow(2, k)));
      out(root, 'first', bytes(first));
      out(root, 'trips', String(trips));
      out(root, 'time', sig(trips * rtt) + ' ms');
      out(root, 'verdict', trips === 1
        ? 'The whole response fits in the first flight of packets, so it arrives one round trip after the request is sent.'
        : 'The sender may transmit ' + flights.join(', then ') + (trips > 8 ? ' and so on' : '') + ', doubling each round trip. A response of ' + bytes(kb * 1000) + ' therefore needs ' + trips + ' round trips on a new connection, before any time the server spends thinking.');
    });
  });

  // ------------------------------------------------------------ cache offload
  $$('[data-widget="offload"]').forEach(function (root) {
    bind(root, function () {
      var rps = val(root, 'rps'), h = val(root, 'hit') / 100, kb = val(root, 'kb');
      out(root, 'hit', Math.round(h * 100) + '%');
      if (!(rps >= 0) || !(kb >= 0)) { ['origin', 'edge', 'bandwidth'].forEach(function (k) { out(root, k, 'n/a'); }); out(root, 'verdict', 'Enter numbers of zero or more for requests and response size.'); return; }
      var origin = rps * (1 - h);
      out(root, 'origin', compact(origin) + ' /s');
      out(root, 'edge', compact(rps - origin) + ' /s');
      out(root, 'bandwidth', bits(origin * kb * 1000 * 8));
      var bar = $('[data-bar]', root);
      if (bar) bar.setAttribute('width', (h * 100).toFixed(1) + '%');
      var pct = Math.round(h * 100);
      out(root, 'verdict', h >= 1
        ? 'Every request is served from the edge. The origin sees traffic only when content is first fetched or revalidated.'
        : 'The origin serves ' + (100 - pct) + '% of requests. From here, one more point of hit ratio removes ' + sig(100 / (100 - pct)) + '% of the origin\u2019s load.'
          + (pct >= 90 ? ' That is why the last few points matter most.' : pct <= 50 ? ' At this level the CDN is saving little, so check the cache key and the Cache-Control headers before anything else.' : ''));
    });
  });

  // ------------------------------------------------------------ B-tree depth
  $$('[data-widget="btree"]').forEach(function (root) {
    bind(root, function () {
      var rows = val(root, 'rows'), f = val(root, 'fanout'), per = val(root, 'perpage');
      if (!(rows >= 1) || !(f >= 2) || !(per >= 1)) {
        ['levels', 'lookup', 'scan', 'ratio'].forEach(function (k) { out(root, k, 'n/a'); });
        noPaper(root);
        out(root, 'verdict', 'Enter at least 1 row, at least 2 keys per index page and at least 1 row per table page.');
        return;
      }
      var levels = Math.max(1, Math.ceil(Math.log(rows) / Math.log(f) - 1e-9));
      var scan = Math.ceil(rows / per);
      var list = [];
      for (var lv = 1; lv <= levels; lv++) list.push({ name: 'Index level ' + lv + (lv === 1 ? ', the root' : lv === levels ? ', the leaves' : ''), pages: Math.max(1, Math.ceil(rows / Math.pow(f, levels - lv + 1))) });
      if (levels === 1) list[0].name = 'Index level 1, root and leaf';
      if (list.length > 6) list = list.slice(0, 3).concat([{ gap: list.length - 5 }], list.slice(-2));
      list.push({ name: 'Table', pages: scan, table: true });
      var d = paper(root, 640, 34 + list.length * 32);
      if (d) {
        var biggest = Math.max(scan, list[list.length - 2].pages, 2);
        d('text', { x: 10, y: 16, 'class': 'ts' }, 'A lookup reads one page on every row, marked in blue. A full scan reads every page of the table.');
        list.forEach(function (row, i) {
          var y = 28 + i * 32;
          if (row.gap) { d('text', { x: 340, y: y + 18, 'class': 'ts mid' }, row.gap + ' more levels'); return; }
          var w = 30 + 290 * Math.log(row.pages) / Math.log(biggest);
          d('text', { x: 10, y: y + 17, 'class': 'ts' }, row.name);
          d('rect', { x: r1(340 - w / 2), y: y, width: r1(w), height: 24, rx: 4, 'class': row.table ? 'n store' : 'n' });
          d('rect', { x: 331, y: y + 3, width: 18, height: 18, rx: 3, 'class': 'bar' });
          d('text', { x: r1(340 + w / 2 + 8), y: y + 17, 'class': 'ts' }, compact(row.pages) + (row.pages === 1 ? ' page' : ' pages'));
        });
      }
      var cap = Math.pow(f, levels);
      out(root, 'levels', String(levels));
      out(root, 'lookup', (levels + 1) + ' pages');
      out(root, 'scan', compact(scan) + (scan === 1 ? ' page' : ' pages'));
      out(root, 'ratio', compact(scan / (levels + 1)) + '×');
      out(root, 'verdict', 'A tree ' + levels + (levels === 1 ? ' level' : ' levels') + ' deep with ' + compact(f) + ' keys per page can index up to ' + compact(cap) +
        ' rows, so this table could grow ' + compact(cap / rows) + ' times before the index gains another level. Depth grows with the logarithm of the table size, which is why indexed lookups stay fast as data grows.');
    });
  });

  // ------------------------------------------------------------ quorum overlap
  $$('[data-widget="quorum"]').forEach(function (root) {
    var svg = $('svg', root);
    bind(root, function () {
      var n = Math.round(val(root, 'n')), w = Math.round(val(root, 'w')), r = Math.round(val(root, 'r'));
      if (!(n >= 1 && n <= 9) || !(w >= 1 && w <= n) || !(r >= 1 && r <= n)) {
        ['overlap', 'wfail', 'rfail'].forEach(function (k) { out(root, k, 'n/a'); });
        if (svg) svg.innerHTML = '';
        out(root, 'verdict', 'Use between 1 and 9 replicas, and values of W and R from 1 up to the number of replicas.');
        return;
      }
      var overlap = w + r - n;
      out(root, 'overlap', overlap > 0 ? 'Yes, by ' + overlap + (overlap === 1 ? ' replica' : ' replicas') : 'No');
      out(root, 'wfail', String(n - w));
      out(root, 'rfail', String(n - r));
      if (svg) {
        var h = '<text class="ts" x="0" y="28">A write is acknowledged by</text><text class="ts" x="0" y="68">A later read asks</text>';
        for (var i = 0; i < n; i++) {
          var x = 190 + i * 30, inW = i < w, inR = i >= n - r;
          if (inW && inR) h += '<path class="e store none" d="M' + x + ' 35V53"/>';
          h += '<circle class="n ' + (inW ? 'sig' : 'ghost') + '" cx="' + x + '" cy="24" r="10"/>';
          h += '<circle class="n ' + (inR ? 'store' : 'ghost') + '" cx="' + x + '" cy="64" r="10"/>';
        }
        svg.innerHTML = h;
      }
      out(root, 'verdict', (overlap > 0
        ? 'Every read reaches at least one replica that holds the latest acknowledged write, because W + R = ' + (w + r) + ' is greater than N = ' + n + '.'
        : 'A read can miss the latest write, because W + R = ' + (w + r) + ' is not greater than N = ' + n + ': the replicas it asks may all be ones the write has not reached yet.') +
        ' Writes continue with ' + (n - w) + ' of ' + n + ' replicas down, and reads with ' + (n - r) + ' down.');
    });
  });

  // ------------------------------------------------------------ keys moved when the server count changes
  $$('[data-widget="rehash"]').forEach(function (root) {
    function gcd(a, b) { while (b) { var t = a % b; a = b; b = t; } return a; }
    function mix(x) { x ^= x >>> 16; x = Math.imul(x, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16; return x >>> 0; }
    bind(root, function () {
      var a = Math.round(val(root, 'from')), b = Math.round(val(root, 'to'));
      var vn = Math.round(val(root, 'vnodes'));
      if (!(vn >= 1 && vn <= 200)) vn = 1;
      if (!(a >= 1 && a <= 1000) || !(b >= 1 && b <= 1000)) {
        ['modulo', 'consistent'].forEach(function (k) { out(root, k, 'n/a'); });
        noPaper(root);
        $$('[data-bar]', root).forEach(function (e) { e.setAttribute('width', '0%'); });
        out(root, 'verdict', 'Enter server counts from 1 to 1,000.');
        return;
      }
      var limit = Math.min(a / gcd(a, b) * b, 2000000), same = 0;
      for (var k = 0; k < limit; k++) if (k % a === k % b) same++;
      var modulo = a === b ? 0 : 1 - same / limit;
      var consistent = Math.abs(b - a) / Math.max(a, b);
      out(root, 'modulo', (modulo * 100).toFixed(1) + '%');
      out(root, 'consistent', (consistent * 100).toFixed(1) + '%');
      // The drawing: 96 sample keys placed by a fixed hash, under both schemes.
      var d = paper(root, 640, 262);
      if (d) {
        var KEYS = 96, SEED = 26925, most = Math.max(a, b);
        var ringOf = function (n) {
          var r = [];
          for (var sv = 0; sv < n; sv++) for (var v = 0; v < vn; v++) r.push([mix(Math.imul(sv + 1, 0x9E3779B1) ^ Math.imul(v + 1, 0x85EBCA77) ^ SEED) / 4294967296, sv]);
          r.sort(function (m, n2) { return m[0] - n2[0]; });
          return r;
        };
        var ownerOn = function (r, pos) {
          var lo = 0, hi = r.length;
          while (lo < hi) { var mid = (lo + hi) >> 1; if (r[mid][0] < pos) lo = mid + 1; else hi = mid; }
          return r[lo === r.length ? 0 : lo][1];
        };
        var ringA = ringOf(a), ringB = ringOf(b), ringMoves = 0, modMoves = 0, keys = [];
        for (var q = 0; q < KEYS; q++) {
          var pos = mix(Math.imul(q + 1, 0xC2B2AE3D) ^ SEED) / 4294967296, hv = mix(Math.imul(q + 1, 0x27D4EB2F) ^ (SEED * 3));
          var k1 = ownerOn(ringA, pos) !== ownerOn(ringB, pos), k2 = hv % a !== hv % b;
          if (k1) ringMoves++;
          if (k2) modMoves++;
          keys.push({ pos: pos, ring: k1, mod: k2 });
        }
        var grid = function (x0, y0, field) {
          keys.forEach(function (key, n) {
            d('rect', { x: x0 + (n % 16) * 17, y: y0 + Math.floor(n / 16) * 17, width: 13, height: 13, rx: 2.5, 'class': key[field] ? 'bar' : 'bar mute' });
          });
        };
        d('text', { x: 10, y: 18, 'class': 'tb' }, 'Consistent hashing: ' + ringMoves + ' of ' + KEYS + ' sample keys move');
        d('text', { x: 350, y: 18, 'class': 'tb' }, 'Hash mod N: ' + modMoves + ' of ' + KEYS + ' sample keys move');
        var marks = most * vn <= 72;
        if (marks) {
          var cx = 116, cy = 140, rad = 88;
          var at = function (p0, rr) { var ang = p0 * 2 * Math.PI - Math.PI / 2; return [r1(cx + rr * Math.cos(ang)), r1(cy + rr * Math.sin(ang))]; };
          d('circle', { cx: cx, cy: cy, r: rad, 'class': 'axis', fill: 'none' });
          keys.forEach(function (key) { var p0 = at(key.pos, rad); d('circle', { cx: p0[0], cy: p0[1], r: key.ring ? 4.2 : 2.6, 'class': key.ring ? 'fill-sig' : '', style: key.ring ? '' : 'fill:var(--ink-3)' }); });
          (b >= a ? ringB : ringA).forEach(function (spot) {
            var sp = at(spot[0], rad + 12);
            d('rect', { x: r1(sp[0] - 5), y: r1(sp[1] - 5), width: 10, height: 10, rx: 2.5, 'class': spot[1] < Math.min(a, b) ? 'n' : b > a ? 'n store' : 'n ghost' });
          });
          d('rect', { x: 236, y: 64, width: 10, height: 10, rx: 2.5, 'class': 'n' });
          d('text', { x: 253, y: 73, 'class': 'ts' }, vn > 1 ? 'a position' : 'a server');
          if (a !== b) {
            d('rect', { x: 236, y: 84, width: 10, height: 10, rx: 2.5, 'class': b > a ? 'n store' : 'n ghost' });
            d('text', { x: 253, y: 93, 'class': 'ts' }, b > a ? 'added' : 'removed');
          }
          d('circle', { cx: 241, cy: 109, r: 4.2, 'class': 'fill-sig' });
          d('text', { x: 253, y: 113, 'class': 'ts' }, 'key that moves');
          d('text', { x: 236, y: 146, 'class': 'ts' }, 'A key belongs');
          d('text', { x: 236, y: 161, 'class': 'ts' }, 'to the next');
          d('text', { x: 236, y: 176, 'class': 'ts' }, (vn > 1 ? 'position' : 'server') + ' clockwise.');
        } else {
          grid(10, 34, 'ring');
          d('text', { x: 10, y: 156, 'class': 'ts' }, 'The ring is drawn while it has at most 72 positions.');
        }
        grid(350, 34, 'mod');
        d('rect', { x: 350, y: 146, width: 13, height: 13, rx: 2.5, 'class': 'bar' });
        d('text', { x: 370, y: 157, 'class': 'ts' }, 'moves to another server');
        d('rect', { x: 350, y: 166, width: 13, height: 13, rx: 2.5, 'class': 'bar mute' });
        d('text', { x: 370, y: 177, 'class': 'ts' }, 'stays where it is');
        var say = vn === 1
          ? ['With one position for each server the arcs are', 'uneven, so this sample can be far from the average', 'below. Give each server more positions and it', 'comes closer.']
          : ['With ' + vn + ' positions for each server the arcs even', 'out, and the sample comes close to the average', 'below. Real systems use a hundred or more.'];
        say.forEach(function (line, n) { d('text', { x: 350, y: 206 + n * 15, 'class': 'ts' }, line); });
      }
      var b1 = $('[data-bar="modulo"]', root), b2 = $('[data-bar="consistent"]', root);
      if (b1) b1.setAttribute('width', (modulo * 100).toFixed(1) + '%');
      if (b2) b2.setAttribute('width', (consistent * 100).toFixed(1) + '%');
      out(root, 'verdict', a === b ? 'The number of servers is unchanged, so no key moves under either scheme.'
        : 'Going from ' + a + ' to ' + b + (b === 1 ? ' server' : ' servers') + ', hashing modulo the server count sends ' + (modulo * 100).toFixed(1) + '% of keys to a different server. Consistent hashing moves ' +
          (consistent * 100).toFixed(1) + '%, which is only ' + (b > a ? 'the share the new servers should take.' : 'the keys that lived on the removed servers.'));
    });
  });

  // ------------------------------------------------------------ cache latency
  $$('[data-widget="cachemath"]').forEach(function (root) {
    bind(root, function () {
      var hit = val(root, 'hit'), c = val(root, 'cache'), d = val(root, 'db');
      out(root, 'hit', sig(hit) + '%');
      if (!(c >= 0) || !(d >= 0)) {
        ['avg', 'p99', 'db'].forEach(function (k) { out(root, k, 'n/a'); });
        out(root, 'verdict', 'Enter latencies of zero or more.');
        return;
      }
      var h = hit / 100, miss = c + d, avg = h * c + (1 - h) * miss, tailIsMiss = 100 - hit > 1;
      out(root, 'avg', sig(avg) + ' ms');
      out(root, 'p99', sig(tailIsMiss ? miss : c) + ' ms');
      out(root, 'db', sig(100 - hit) + '%');
      out(root, 'verdict', (avg < d
        ? 'The average falls from ' + sig(d) + ' ms without a cache to ' + sig(avg) + ' ms. '
        : 'At this hit ratio the cache does not help: the average is ' + sig(avg) + ' ms, against ' + sig(d) + ' ms with no cache, because nearly every request pays for a lookup that misses. ') + (tailIsMiss
        ? 'The 99th percentile is still a miss at ' + sig(miss) + ' ms, because more than 1 request in 100 misses. A cache improves the typical request long before it improves the slowest ones.'
        : 'The 99th percentile is now a hit as well, because no more than 1 request in 100 misses.'));
    });
  });

  // ------------------------------------------------------------ Snowflake-style ID layout
  $$('[data-widget="snowflake"]').forEach(function (root) {
    bind(root, function () {
      var t = Math.round(val(root, 'ts')), n = Math.round(val(root, 'node')), q = Math.round(val(root, 'seq'));
      if (!(t >= 1 && t <= 62) || !(n >= 0 && n <= 62) || !(q >= 0 && q <= 62)) {
        ['years', 'nodes', 'rate', 'total'].forEach(function (k) { out(root, k, 'n/a'); });
        $$('[data-seg]', root).forEach(function (b) { b.setAttribute('width', '0%'); });
        out(root, 'verdict', 'Enter whole numbers of bits: 1 to 62 for the timestamp and 0 to 62 for the others.');
        return;
      }
      var total = t + n + q;
      var years = Math.pow(2, t) / 1000 / 86400 / 365.25;
      out(root, 'years', years >= 1 ? compact(years) + (sig(years) === 1 ? ' year' : ' years') : duration(Math.pow(2, t) / 1000));
      out(root, 'nodes', compact(Math.pow(2, n)));
      out(root, 'rate', compact(Math.pow(2, q) * 1000) + ' /s');
      out(root, 'total', total + ' of 63');
      var bars = $$('[data-seg]', root);
      if (bars.length === 3) {
        var x = 0, widths = [t, n, q];
        bars.forEach(function (b, i) { b.setAttribute('x', (x / Math.max(total, 63) * 100).toFixed(2) + '%'); b.setAttribute('width', (widths[i] / Math.max(total, 63) * 100).toFixed(2) + '%'); x += widths[i]; });
      }
      out(root, 'verdict', total > 63
        ? 'This layout needs ' + total + ' bits, and a signed 64-bit integer has 63 to give. Take ' + (total - 63) + ' away from somewhere.'
        : (total < 63 ? 'This layout leaves ' + (63 - total) + (63 - total === 1 ? ' bit' : ' bits') + ' unused. ' : 'This layout uses every available bit. ') +
          'Each added timestamp bit doubles the lifetime, each added node bit doubles the number of generators, and each added sequence bit doubles how many IDs one generator can issue in a millisecond.');
    });
  });

  // ------------------------------------------------------------ Bloom filter sizing
  $$('[data-widget="bloom"]').forEach(function (root) {
    bind(root, function () {
      var n = val(root, 'n'), p = val(root, 'p') / 100, size = val(root, 'size');
      if (!(n >= 1) || !(p > 0 && p <= 0.5) || !(size >= 1)) {
        ['bits', 'hashes', 'memory', 'raw'].forEach(function (k) { out(root, k, 'n/a'); });
        noPaper(root);
        out(root, 'verdict', 'Enter at least 1 item, a false positive rate above 0 and at most 50 percent, and an item size of at least 1 byte.');
        return;
      }
      var perItem = -Math.log(p) / (Math.LN2 * Math.LN2);
      var k = Math.max(1, Math.round(perItem * Math.LN2));
      var mem = Math.ceil(perItem * n / 8), raw = n * size;
      var d = paper(root, 640, 262);
      if (d) {
        var big = Math.max(mem, raw);
        d('text', { x: 10, y: 22, 'class': 'ts' }, 'The items themselves');
        d('rect', { x: 150, y: 10, width: r1(Math.max(470 * raw / big, 2)), height: 16, rx: 3, 'class': 'bar mute' });
        d('text', { x: 10, y: 46, 'class': 'ts' }, 'The filter');
        d('rect', { x: 150, y: 34, width: r1(Math.max(470 * mem / big, 2)), height: 16, rx: 3, 'class': 'bar' });
        var L = 64, R = 20, T = 78, B = 44, W = 640, H = 262, MAXB = 30;
        var bx = function (bitsPer) { return L + Math.min(bitsPer, MAXB) / MAXB * (W - L - R); };
        var py = function (rate) { return T + Math.min(Math.max(-Math.log(rate) / Math.LN10, 0), 6) / 6 * (H - T - B); };
        [[1, '100%'], [0.01, '1%'], [0.0001, '0.01%'], [0.000001, '0.0001%']].forEach(function (tick, i) {
          d('line', { x1: L, x2: W - R, y1: r1(py(tick[0])), y2: r1(py(tick[0])), 'class': i === 3 ? 'axis' : 'grid' });
          d('text', { x: L - 8, y: r1(py(tick[0]) + 4), 'class': 'ts end' }, tick[1]);
        });
        [0, 10, 20, 30].forEach(function (v) { d('text', { x: r1(bx(v)), y: H - B + 17, 'class': 'ts mid' }, String(v)); });
        d('text', { x: (L + W - R) / 2, y: H - 8, 'class': 'ts mid' }, 'Bits per item. Every 4.8 bits more makes false positives ten times rarer.');
        var endBits = Math.min(MAXB, 6 * Math.LN10 / (Math.LN2 * Math.LN2));
        d('path', { d: pathOf([[bx(0), py(1)], [bx(endBits), py(Math.exp(-endBits * Math.LN2 * Math.LN2))]]), 'class': 'line' });
        var mx = bx(perItem), my = py(p), left = mx > W - R - 190;
        d('line', { x1: r1(mx), x2: r1(mx), y1: r1(my), y2: H - B, 'class': 'axis', 'stroke-dasharray': '4 4' });
        d('circle', { cx: r1(mx), cy: r1(my), r: 5.5, 'class': 'dot' });
        d('text', { x: r1(left ? mx - 10 : mx + 10), y: r1(left ? Math.min(my + 20, H - B - 6) : my - 8), 'class': 'tb' + (left ? ' end' : '') }, sig(perItem) + ' bits, 1 wrong “maybe” in ' + compact(Math.round(1 / p)));
      }
      out(root, 'bits', sig(perItem) + ' bits');
      out(root, 'hashes', String(k));
      out(root, 'memory', bytes(mem));
      out(root, 'raw', bytes(raw));
      out(root, 'verdict', 'The filter needs ' + bytes(mem) + ', about ' + sig(mem / raw * 100) + '% of the ' + bytes(raw) + ' the items themselves occupy. It never misses an item that is present, and wrongly reports an absent one as possibly present about once in ' +
        compact(Math.round(1 / p)) + ' lookups. Halving that error rate costs about 1.44 more bits per item.');
    });
  });

  // ------------------------------------------------------------ queue backlog
  $$('[data-widget="backlog"]').forEach(function (root) {
    bind(root, function () {
      var a = val(root, 'arrive'), ms = val(root, 'each'), c = Math.round(val(root, 'consumers')), b = val(root, 'backlog');
      if (!(a >= 0) || !(ms > 0) || !(c >= 1) || !(b >= 0)) {
        ['capacity', 'util', 'drain', 'need'].forEach(function (k) { out(root, k, 'n/a'); });
        noPaper(root);
        out(root, 'verdict', 'Enter an arrival rate and a backlog of zero or more, a processing time above zero and at least 1 consumer.');
        return;
      }
      var cap = c * 1000 / ms, util = a / cap, net = cap - a;
      var need = Math.max(1, Math.ceil(a * ms / 1000 / 0.7));
      var keepUp = Math.floor(a * ms / 1000) + 1;
      var d = paper(root, 640, 214);
      if (d) {
        var L = 40, R = 20, T = 30, B = 40, W = 640, H = 214;
        var span = net > 0 ? (b > 0 ? b / net * 1.25 : 60) : 3600;
        var endDepth = net > 0 ? 0 : b + (-net) * span;
        var top = Math.max(b, endDepth, 1);
        var x = function (t) { return L + t / span * (W - L - R); };
        var y = function (m) { return H - B - m / top * (H - T - B); };
        var pts = net > 0 && b > 0 ? [[x(0), y(b)], [x(b / net), y(0)], [x(span), y(0)]] : [[x(0), y(b)], [x(span), y(endDepth)]];
        d('line', { x1: L, x2: W - R, y1: T, y2: T, 'class': 'grid' });
        d('path', { d: pathOf(pts) + ' L' + r1(x(span)) + ' ' + (H - B) + ' L' + L + ' ' + (H - B) + ' Z', 'class': net < 0 ? 'fill-fault' : 'fill-sig', style: 'opacity:.14' });
        d('path', { d: pathOf(pts), 'class': 'line', style: net < 0 ? 'stroke:var(--fault)' : '' });
        d('line', { x1: L, x2: W - R, y1: H - B, y2: H - B, 'class': 'axis' });
        d('text', { x: L, y: T - 8, 'class': 'ts' }, compact(top) + ' messages');
        d('text', { x: L - 8, y: H - B + 4, 'class': 'ts end' }, '0');
        d('text', { x: L, y: H - B + 17, 'class': 'ts' }, 'now');
        d('text', { x: (L + W - R) / 2, y: H - B + 17, 'class': 'ts mid' }, duration(span / 2));
        d('text', { x: W - R, y: H - B + 17, 'class': 'ts end' }, duration(span));
        d('text', { x: (L + W - R) / 2, y: H - 6, 'class': 'ts mid' }, 'Messages waiting in the queue, from now on');
        if (net > 0 && b > 0) {
          d('circle', { cx: r1(x(b / net)), cy: r1(y(0)), r: 5.5, 'class': 'dot' });
          d('text', { x: W - R - 6, y: T + 20, 'class': 'tb end' }, 'empty after ' + duration(b / net));
        } else if (net < 0) {
          d('text', { x: L + 10, y: T + 20, 'class': 'tb' }, compact(endDepth) + ' waiting after an hour');
        } else {
          d('text', { x: (L + W - R) / 2, y: r1(Math.max(y(b) - 10, T + 14)), 'class': 'tb mid' }, net === 0 ? 'The backlog never shrinks' : 'The queue stays empty');
        }
      }
      out(root, 'capacity', compact(cap) + ' /s');
      out(root, 'util', sig(util * 100) + '%');
      out(root, 'drain', net > 0 ? (b > 0 ? duration(b / net) : 'no backlog') : 'never');
      out(root, 'need', need.toLocaleString('en-US'));
      var text;
      if (net > 0) {
        text = 'The consumers can process ' + compact(cap) + ' messages a second and ' + compact(a) + ' arrive, so the queue shrinks by ' + compact(net) + ' a second' +
          (b > 0 ? ' and the backlog of ' + compact(b) + ' clears in ' + duration(b / net) + '.' : ' and stays empty.') +
          (util > 0.7 ? ' At ' + sig(util * 100) + '% utilization there is little room for a burst: ' + need.toLocaleString('en-US') + ' consumers would bring it down to 70%.' : ' Utilization is at or below 70%, which leaves room for bursts.');
      } else if (net === 0) {
        text = 'Arrivals exactly match capacity. The backlog never shrinks, and any burst makes it grow for good. Run at least ' + need.toLocaleString('en-US') + ' consumers.';
      } else {
        text = 'More arrives than the consumers can process. The queue grows by ' + compact(-net) + ' messages a second, which is ' + compact(-net * 3600) + ' an hour, and no backlog will ever clear. It takes ' +
          keepUp.toLocaleString('en-US') + ' consumers just to keep up and ' + need.toLocaleString('en-US') + ' to do so with room to spare. The alternative is to make each message cheaper to process.';
      }
      out(root, 'verdict', text);
    });
  });

  // ------------------------------------------------------------ log sizing
  $$('[data-widget="logsize"]').forEach(function (root) {
    bind(root, function () {
      var rate = val(root, 'rate'), size = val(root, 'size'), days = val(root, 'days'), rf = Math.round(val(root, 'rf')), consume = val(root, 'consume');
      if (!(rate > 0) || !(size >= 1) || !(days > 0) || !(rf >= 1) || !(consume > 0)) {
        ['ingress', 'perday', 'stored', 'partitions'].forEach(function (k) { out(root, k, 'n/a'); });
        out(root, 'verdict', 'Enter values above zero, with a message size of at least 1 byte and at least 1 replica.');
        return;
      }
      var ingress = rate * size, perday = ingress * 86400, stored = perday * days * rf, parts = Math.max(1, Math.ceil(rate / consume));
      var n = parts.toLocaleString('en-US');
      out(root, 'ingress', bytes(ingress) + '/s');
      out(root, 'perday', bytes(perday));
      out(root, 'stored', bytes(stored));
      out(root, 'partitions', n);
      out(root, 'verdict', 'The topic takes in ' + bytes(ingress) + ' a second, or ' + bytes(perday) + ' a day. Keeping ' + sig(days) + (days === 1 ? ' day' : ' days') + ' on ' + rf + (rf === 1 ? ' replica' : ' replicas') +
        ' needs about ' + bytes(stored) + ' of disk before compression. One consumer handles ' + compact(consume) + (consume === 1 ? ' message' : ' messages') + ' a second, so a group needs at least ' + n + (parts === 1 ? ' consumer' : ' consumers') +
        ' to keep up, and therefore at least ' + n + (parts === 1 ? ' partition' : ' partitions') + '. Plan for the peak you expect: adding partitions later changes which partition each key maps to.');
    });
  });

  // ------------------------------------------------------------ retry amplification
  $$('[data-widget="retries"]').forEach(function (root) {
    bind(root, function () {
      var layers = Math.round(val(root, 'layers')), attempts = Math.round(val(root, 'attempts')), budget = val(root, 'budget');
      if (!(layers >= 1 && layers <= 10) || !(attempts >= 1 && attempts <= 10) || !(budget >= 0 && budget <= 100)) {
        ['worst', 'worstcalls', 'budgeted', 'budgetcalls'].forEach(function (k) { out(root, k, 'n/a'); });
        noPaper(root);
        out(root, 'verdict', 'Enter 1 to 10 layers, 1 to 10 attempts per layer and a retry budget between 0 and 100 percent.');
        return;
      }
      var worst = Math.pow(attempts, layers), b = Math.pow(1 + budget / 100, layers);
      var d = paper(root, 640, 52 + layers * 34);
      if (d) {
        var log = worst > 100;
        var len = function (v) { return Math.max(3, 350 * (log ? Math.log(v) / Math.log(worst) : (worst > 1 ? v / worst : 0))); };
        d('rect', { x: 150, y: 8, width: 12, height: 12, rx: 3, 'class': 'bar fault' });
        d('text', { x: 168, y: 19, 'class': 'ts' }, 'every layer retries');
        d('rect', { x: 300, y: 8, width: 12, height: 12, rx: 3, 'class': 'bar store' });
        d('text', { x: 318, y: 19, 'class': 'ts' }, 'every layer keeps to its retry budget');
        for (var ly = 1; ly <= layers; ly++) {
          var yy = 32 + (ly - 1) * 34, w1 = Math.pow(attempts, ly), w2 = Math.pow(1 + budget / 100, ly);
          d('text', { x: 10, y: yy + 16, 'class': 'ts' }, ly === layers ? 'The failing service gets' : 'Layer ' + (ly + 1) + ' gets');
          d('rect', { x: 150, y: yy, width: r1(len(w1)), height: 11, rx: 2, 'class': 'bar fault' });
          d('text', { x: r1(150 + len(w1) + 6), y: yy + 10, 'class': 'ts' }, compact(w1) + (w1 === 1 ? ' call' : ' calls'));
          d('rect', { x: 150, y: yy + 14, width: r1(len(w2)), height: 11, rx: 2, 'class': 'bar store' });
          d('text', { x: r1(150 + len(w2) + 6), y: yy + 24, 'class': 'ts' }, sig(w2) + (sig(w2) === 1 ? ' call' : ' calls'));
        }
        d('text', { x: 150, y: 44 + layers * 34, 'class': 'ts' }, 'Calls caused by one user request.' + (log ? ' Bar lengths are on a logarithmic scale.' : ''));
      }
      out(root, 'worst', compact(worst) + '×');
      out(root, 'worstcalls', compact(worst * 1000));
      out(root, 'budgeted', sig(b) + '×');
      out(root, 'budgetcalls', compact(Math.round(b * 1000)));
      out(root, 'verdict', attempts === 1
        ? 'With one attempt per layer there are no retries, so a failure at the bottom adds no load. It also means every brief fault reaches the user.'
        : 'If the service at the bottom starts failing, each user request turns into up to ' + compact(worst) + ' calls to it: ' + layers + (layers === 1 ? ' layer' : ' layers, each') + ' trying ' + attempts +
          ' times. For every 1,000 user requests it receives ' + compact(worst * 1000) + ' calls, at the moment it is least able to cope. If every layer instead limits retries to ' + sig(budget) +
          '% of its traffic, the same 1,000 requests become at most ' + compact(Math.round(b * 1000)) + ' calls.');
    });
  });

  // ------------------------------------------------------------ token bucket
  $$('[data-widget="tokenbucket"]').forEach(function (root) {
    var svg = $('svg', root);
    var NS = 'http://www.w3.org/2000/svg';
    var W = 640, H = 210, L = 56, R = 18, TOP = 26, B = 40;
    function el(name, attrs, text) {
      var e = doc.createElementNS(NS, name);
      for (var k in attrs) e.setAttribute(k, attrs[k]);
      if (text != null) e.textContent = text;
      svg.appendChild(e);
      return e;
    }
    var pic = null;
    if (svg) {
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      svg.textContent = '';
      el('line', { x1: L, x2: W - R, y1: TOP, y2: TOP, 'class': 'grid' });
      pic = {
        area: el('path', { 'class': 'fill-sig', style: 'opacity:.14' }),
        line: el('path', { 'class': 'line' }),
        dry: el('line', { 'class': 'x', style: 'stroke-width:1.5;stroke-dasharray:4 4', y1: TOP - 10, y2: H - B }),
        dryText: el('text', { 'class': 'ts', y: TOP - 13 }),
        top: el('text', { x: L - 8, y: TOP + 4, 'class': 'ts end' }),
        mid: el('text', { x: (L + W - R) / 2, y: H - B + 17, 'class': 'ts mid' }),
        end: el('text', { x: W - R, y: H - B + 17, 'class': 'ts end' })
      };
      el('line', { x1: L, x2: W - R, y1: H - B, y2: H - B, 'class': 'axis' });
      el('text', { x: L - 8, y: H - B + 4, 'class': 'ts end' }, '0');
      el('text', { x: L, y: H - B + 17, 'class': 'ts' }, '0 s');
      el('text', { x: (L + W - R) / 2, y: H - 6, 'class': 'ts mid' }, 'Tokens left in the bucket, second by second');
    }
    function draw(cap, rate, inc, T, dry) {
      if (!pic) return;
      var x = function (t) { return L + t / T * (W - L - R); };
      var y = function (k) { return H - B - k / cap * (H - TOP - B); };
      var pts = !isFinite(dry) ? [[0, cap], [T, cap]] : dry >= T ? [[0, cap], [T, cap - (inc - rate) * T]] : [[0, cap], [dry, 0], [T, 0]];
      var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + x(p[0]).toFixed(1) + ' ' + y(p[1]).toFixed(1); }).join(' ');
      pic.line.setAttribute('d', d);
      pic.area.setAttribute('d', d + ' L' + x(T).toFixed(1) + ' ' + (H - B) + ' L' + L + ' ' + (H - B) + ' Z');
      pic.top.textContent = compact(cap);
      pic.mid.textContent = sig(T / 2) + ' s';
      pic.end.textContent = sig(T) + ' s';
      var show = isFinite(dry) && dry < T;
      pic.dry.style.display = pic.dryText.style.display = show ? '' : 'none';
      if (show) {
        var dx = x(dry);
        pic.dry.setAttribute('x1', dx); pic.dry.setAttribute('x2', dx);
        var right = dx > W - R - 130;
        pic.dryText.setAttribute('x', right ? dx - 6 : dx + 6);
        pic.dryText.setAttribute('class', right ? 'ts end' : 'ts');
        pic.dryText.textContent = 'empty after ' + duration(dry);
      }
    }
    bind(root, function () {
      var rate = val(root, 'rate'), cap = val(root, 'capacity'), inc = val(root, 'incoming'), T = val(root, 'seconds');
      if (svg) svg.style.visibility = (rate > 0 && cap >= 1 && inc >= 0 && T > 0) ? '' : 'hidden';
      if (!(rate > 0) || !(cap >= 1) || !(inc >= 0) || !(T > 0)) {
        ['burst', 'allowed', 'rejected', 'share'].forEach(function (k) { out(root, k, 'n/a'); });
        out(root, 'verdict', 'Enter a refill rate and a duration above zero, a bucket size of at least 1 and an arrival rate of zero or more.');
        return;
      }
      var total = inc * T, allowed = Math.min(total, cap + rate * T), rejected = total - allowed;
      var dry = inc > rate ? cap / (inc - rate) : Infinity;
      draw(cap, rate, inc, T, dry);
      out(root, 'burst', isFinite(dry) ? duration(dry) : 'never empties');
      out(root, 'allowed', compact(Math.round(allowed)));
      out(root, 'rejected', compact(Math.round(rejected)));
      out(root, 'share', total > 0 ? sig(rejected / total * 100) + '%' : '0%');
      var plural = function (n, w) { return compact(n) + ' ' + w + (n === 1 ? '' : 's'); };
      var text = 'The bucket starts full with ' + plural(cap, 'token') + ' and refills at ' + compact(rate) + ' a second. ';
      if (!isFinite(dry)) {
        text += 'Requests arrive at ' + compact(inc) + ' a second, which is no faster than the refill, so the bucket never empties and every request is allowed.';
      } else if (dry >= T) {
        text += 'Requests arrive at ' + compact(inc) + ' a second, which would empty the bucket after ' + duration(dry) + '. This burst ends before that, so all ' + compact(Math.round(total)) + ' requests are allowed.';
      } else {
        text += 'Requests arrive at ' + compact(inc) + ' a second, so the bucket runs dry after ' + duration(dry) + ', having let ' + plural(Math.round(inc * dry), 'request') + ' through at full speed. From then on only ' +
          compact(rate) + ' a second pass. Over ' + duration(T) + ', ' + compact(Math.round(allowed)) + ' of ' + compact(Math.round(total)) + ' requests are allowed and ' + compact(Math.round(rejected)) + ' are rejected.';
      }
      out(root, 'verdict', text);
    });
  });

  // ------------------------------------------------------------ function cost
  $$('[data-widget="lambdacost"]').forEach(function (root) {
    var money = function (x) { return '$' + Number(x.toFixed(2)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
    bind(root, function () {
      var req = val(root, 'requests'), ms = val(root, 'ms'), mem = val(root, 'memory'), pg = val(root, 'gbs'), pr = val(root, 'reqprice'), server = val(root, 'server');
      if (!(req >= 0) || !(ms > 0) || !(mem >= 128) || !(pg >= 0) || !(pr >= 0) || !(server >= 0)) {
        ['gbs', 'cost', 'conc', 'breakeven'].forEach(function (k) { out(root, k, 'n/a'); });
        noPaper(root);
        out(root, 'verdict', 'Enter a duration above zero, at least 128 MB of memory, and counts and prices of zero or more.');
        return;
      }
      var gbs = req * ms / 1000 * mem / 1024, compute = gbs * pg, reqcost = req / 1e6 * pr, cost = compute + reqcost;
      var conc = req / 2592000 * ms / 1000;
      var per = ms / 1000 * mem / 1024 * pg + pr / 1e6, even = per > 0 ? server / per : Infinity;
      var d = paper(root, 640, 220);
      if (d) {
        var L = 64, R = 20, T = 20, B = 40, W = 640, H = 220;
        var maxReq = Math.max(req * 1.5, isFinite(even) && server > 0 ? even * 1.5 : 0, 1000);
        var maxCost = Math.max(per * maxReq, server, 0.01) * 1.08;
        var x = function (v) { return L + v / maxReq * (W - L - R); };
        var y = function (c) { return H - B - c / maxCost * (H - T - B); };
        d('line', { x1: L, x2: W - R, y1: T, y2: T, 'class': 'grid' });
        d('line', { x1: L, x2: W - R, y1: H - B, y2: H - B, 'class': 'axis' });
        d('text', { x: L - 8, y: T + 4, 'class': 'ts end' }, money(maxCost).replace(/\.\d\d$/, ''));
        d('text', { x: L - 8, y: H - B + 4, 'class': 'ts end' }, '$0');
        d('text', { x: L, y: H - B + 17, 'class': 'ts' }, '0');
        d('text', { x: W - R, y: H - B + 17, 'class': 'ts end' }, compact(maxReq));
        d('text', { x: (L + W - R) / 2, y: H - 6, 'class': 'ts mid' }, 'Cost per month against requests per month');
        if (server > 0) {
          d('path', { d: pathOf([[x(0), y(server)], [x(maxReq), y(server)]]), 'class': 'line', style: 'stroke:var(--ink-2)' });
          d('text', { x: W - R - 4, y: r1(y(server) - 7), 'class': 'ts end' }, 'always on: ' + money(server).replace('.00', ''));
        }
        d('path', { d: pathOf([[x(0), y(0)], [x(maxReq), y(per * maxReq)]]), 'class': 'line', style: 'stroke:var(--async)' });
        d('text', { x: r1(x(maxReq * 0.62) - 6), y: r1(y(per * maxReq * 0.62) - 8), 'class': 'ts end' }, 'function');
        if (server > 0 && isFinite(even) && even <= maxReq) {
          d('line', { x1: r1(x(even)), x2: r1(x(even)), y1: r1(y(server)), y2: H - B, 'class': 'axis', 'stroke-dasharray': '4 4' });
          d('text', { x: r1(x(even)), y: H - B + 17, 'class': 'ts mid' }, 'break-even');
        }
        var rx = x(req), near = rx > W - R - 170;
        d('circle', { cx: r1(rx), cy: r1(y(cost)), r: 5.5, 'class': 'dot' });
        d('text', { x: r1(near ? rx - 10 : rx + 10), y: r1(Math.min(y(cost) + 17, H - B - 6)), 'class': 'tb' + (near ? ' end' : '') }, 'now: ' + money(cost));
      }
      out(root, 'gbs', compact(gbs) + ' GB-s');
      out(root, 'cost', money(cost));
      out(root, 'conc', String(sig(conc)));
      out(root, 'breakeven', server === 0 ? 'n/a' : isFinite(even) ? compact(even) + ' /month' : 'never');
      var text = 'At these prices the function costs about ' + money(cost) + ' a month before any free allowance: ' + money(compute) + ' for compute and ' + money(reqcost) + ' for requests. On average ' + sig(conc) +
        (conc < 1 ? ' copies are running at once, so an always-on server would sit idle most of the time. ' : ' copies are running at once. ');
      if (server === 0) text += 'With no cost entered for the alternative, there is nothing to break even against.';
      else if (!isFinite(even)) text += 'At a price of zero the function is cheaper than the ' + money(server).replace('.00', '') + ' alternative at any volume.';
      else text += cost <= server
        ? 'The function stays cheaper than the ' + money(server).replace('.00', '') + ' alternative up to about ' + compact(even) + ' requests a month.'
        : 'At this volume the function costs more than the ' + money(server).replace('.00', '') + ' alternative, which it overtook at about ' + compact(even) + ' requests a month. Steady, high traffic is where paying per use stops paying.';
      out(root, 'verdict', text);
    });
  });

  // ------------------------------------------------------------ shuffle sharding
  $$('[data-widget="shuffle"]').forEach(function (root) {
    var choose = function (n, k) { if (k < 0 || k > n) return 0; var c = 1; for (var i = 1; i <= k; i++) c = c * (n - k + i) / i; return Math.round(c); };
    bind(root, function () {
      var n = Math.round(val(root, 'workers')), k = Math.round(val(root, 'size'));
      if (!(n >= 2 && n <= 5000) || !(k >= 1 && k <= 12) || !(k < n)) {
        ['plainshare', 'combos', 'same', 'partial'].forEach(function (x) { out(root, x, 'n/a'); });
        out(root, 'verdict', 'Enter 2 to 5,000 workers and a shard size from 1 to 12 that is smaller than the number of workers.');
        return;
      }
      var shards = Math.floor(n / k), c = choose(n, k), same = 1 / c, none = choose(n - k, k) / c, partial = Math.max(0, 1 - none - same);
      out(root, 'plainshare', sig(100 / shards) + '%');
      out(root, 'combos', compact(c));
      var tiny = same * 100 < 0.01;
      out(root, 'same', tiny ? '1 in ' + compact(c) : sig(same * 100) + '%');
      out(root, 'partial', sig(partial * 100) + '%');
      out(root, 'verdict', 'Plain sharding gives ' + compact(shards) + (shards === 1 ? ' shard' : ' shards') + ', so one tenant that overloads its shard takes ' + sig(100 / shards) + '% of all tenants down with it. Shuffle sharding gives ' +
        compact(c) + ' possible sets of ' + k + (k === 1 ? ' worker' : ' workers') + '. Another tenant has exactly the same set only ' + (tiny ? 'once in ' + compact(c) + ' times. ' : sig(same * 100) + '% of the time. ') +
        (k === 1 ? 'With one worker per tenant there is nothing to fall back on, so this is plain sharding with smaller shards.' : sig(partial * 100) + '% share some but not all of the bad tenant’s workers, and still have a healthy one to retry on.'));
    });
  });

  // ------------------------------------------------------------ distance and round trips
  $$('[data-widget="distance"]').forEach(function (root) {
    bind(root, function () {
      var km = val(root, 'km'), f = val(root, 'factor'), server = val(root, 'server');
      if (!(km >= 0) || !(km <= 20100) || !(f >= 1) || !(server >= 0)) {
        ['rtt', 'fresh', 'quic', 'reuse'].forEach(function (k) { out(root, k, 'n/a'); });
        out(root, 'verdict', km > 20100 ? 'No two places on Earth are more than about 20,000 km apart. Enter a smaller distance.' : 'Enter a distance and a server time of zero or more, and a route factor of at least 1.');
        return;
      }
      var oneway = km / 200000 * 1000, rtt = 2 * oneway * f;
      var ms = function (x) { return x >= 1000 ? sig(x / 1000) + ' s' : sig(x) + ' ms'; };
      out(root, 'rtt', ms(rtt));
      out(root, 'fresh', ms(3 * rtt + server));
      out(root, 'quic', ms(2 * rtt + server));
      out(root, 'reuse', ms(rtt + server));
      out(root, 'verdict', 'Light in fiber covers ' + Math.round(km).toLocaleString('en-US') + ' km in ' + ms(oneway) + ', and real routes are longer, so one round trip takes about ' + ms(rtt) + '. A first request over TCP and TLS 1.3 needs three round trips before the response arrives: ' +
        ms(3 * rtt + server) + '. Over HTTP/3 it needs two: ' + ms(2 * rtt + server) + '. On a connection that is already open it needs one: ' + ms(rtt + server) + '. Server time is ' + ms(server) + ' of each. Only moving closer reduces the rest.');
    });
  });

  // ------------------------------------------------------------ horizontal pod autoscaler
  $$('[data-widget="hpa"]').forEach(function (root) {
    bind(root, function () {
      var n = Math.round(val(root, 'replicas')), cur = val(root, 'current'), target = val(root, 'target'), min = Math.round(val(root, 'min')), max = Math.round(val(root, 'max'));
      if (!(n >= 1) || !(cur >= 0) || !(target > 0) || !(min >= 1) || !(max >= min)) {
        ['ratio', 'desired', 'change', 'after'].forEach(function (k) { out(root, k, 'n/a'); });
        out(root, 'verdict', 'Enter at least 1 pod, a usage of zero or more, a target above zero, and a maximum that is not below the minimum.');
        return;
      }
      var pods = function (x) { return x.toLocaleString('en-US') + (x === 1 ? ' pod' : ' pods'); };
      var ratio = cur / target, within = Math.abs(ratio - 1) <= 0.1;
      var raw = within ? n : Math.ceil(n * ratio), desired = Math.min(max, Math.max(min, raw)), diff = desired - n;
      var after = desired > 0 ? n * cur / desired : 0;
      out(root, 'ratio', String(sig(ratio)));
      out(root, 'desired', desired.toLocaleString('en-US'));
      out(root, 'change', diff === 0 ? 'none' : (diff > 0 ? '+' : '−') + Math.abs(diff).toLocaleString('en-US'));
      out(root, 'after', sig(after) + '%');
      var text = (n === 1 ? 'The single pod uses ' : 'Each of the ' + pods(n) + ' uses ') + sig(cur) + '% of the CPU it requested, against a target of ' + sig(target) + '%. ';
      if (within && desired === n) text += 'The ratio is ' + sig(ratio) + ', which is within 10% of 1, so the autoscaler changes nothing. The tolerance stops it from adding and removing pods over small wobbles.';
      else {
        text += 'The ratio is ' + sig(ratio) + (within ? ', within the tolerance, so the formula asks for no change' : ', so the formula asks for ' + pods(raw)) + '. ';
        if (raw > max) text += 'The maximum is ' + max.toLocaleString('en-US') + ', so that is what runs, and each pod will be at about ' + sig(after) + '%, above the target. Raise the maximum or find what is using the CPU.';
        else if (raw < min) text += 'The minimum is ' + min.toLocaleString('en-US') + ', so that is what runs, and each pod will be at about ' + sig(after) + '%.';
        else if (diff > 0) text += 'That is ' + diff.toLocaleString('en-US') + ' more. Spread over ' + pods(desired) + ', the same load comes to about ' + sig(after) + '% each.';
        else if (diff < 0) text += 'That is ' + Math.abs(diff).toLocaleString('en-US') + ' fewer, which would bring each pod to about ' + sig(after) + '%. By default it waits five minutes before removing pods, in case the load comes back.';
        else text += 'Rounded up, that is the number already running.';
      }
      out(root, 'verdict', text);
    });
  });

  // ------------------------------------------------------------ canary duration
  $$('[data-widget="canary"]').forEach(function (root) {
    bind(root, function () {
      var rps = val(root, 'rps'), share = val(root, 'share'), p0 = val(root, 'base') / 100, p1 = val(root, 'bad') / 100;
      if (!(rps > 0) || !(share > 0 && share <= 100) || !(p0 > 0 && p0 < 1) || !(p1 > p0 && p1 < 1)) {
        ['needed', 'time', 'exposed', 'everyone'].forEach(function (k) { out(root, k, 'n/a'); });
        out(root, 'verdict', 'Enter traffic above zero, a canary share from just above 0 to 100%, a normal error rate above zero, and a bad error rate that is higher than the normal one and below 100%.');
        return;
      }
      var z = 1.645 * Math.sqrt(p0 * (1 - p0)) + 1.282 * Math.sqrt(p1 * (1 - p1));
      var n = Math.ceil(Math.pow(z / (p1 - p0), 2)), crps = rps * share / 100, secs = n / crps;
      var extra = n * (p1 - p0), all = rps * secs * (p1 - p0);
      var count = function (x) { return compact(Math.round(x)); };
      out(root, 'needed', compact(n));
      out(root, 'time', duration(secs));
      out(root, 'exposed', count(extra));
      out(root, 'everyone', count(all));
      var text = 'To tell an error rate of ' + sig(p1 * 100) + '% from the usual ' + sig(p0 * 100) + '%, with a 5% chance of a false alarm and a 90% chance of catching it, the canary needs about ' + compact(n) + ' requests. With ' + sig(share) + '% of ' + compact(rps) +
        (rps === 1 ? ' request' : ' requests') + ' a second it receives ' + (crps >= 1000 ? compact(crps) : sig(crps)) + ' a second, so that takes ' + duration(secs) + '. If the new version is bad, about ' + count(extra) + ' extra requests fail during the test. Released to everyone for the same time, about ' + count(all) + ' would have.';
      if (secs > 86400) text += ' That is too long to wait. Give the canary more traffic, or watch a signal that shows a difference sooner, such as latency.';
      else if (secs < 60) text += ' The statistics are satisfied quickly at this traffic. Keep the canary running for several minutes anyway, because some faults, such as memory leaks and slow queries, take time to appear.';
      out(root, 'verdict', text);
    });
  });

  // ------------------------------------------------------------ error budget burn rate
  $$('[data-widget="burnrate"]').forEach(function (root) {
    bind(root, function () {
      var slo = val(root, 'slo'), days = val(root, 'window'), err = val(root, 'errors');
      if (!(slo >= 50 && slo < 100) || !(days >= 1 && days <= 365) || !(err >= 0 && err <= 100)) {
        ['budget', 'allowed', 'burn', 'exhaust'].forEach(function (k) { out(root, k, 'n/a'); });
        noPaper(root);
        out(root, 'verdict', 'Enter an objective from 50% to just under 100%, a window of 1 to 365 days, and an error rate from 0 to 100%.');
        return;
      }
      var budget = 100 - slo, burn = err / budget, secs = days * 86400, exhaust = burn > 0 ? secs / burn : Infinity;
      var hours = days * 24, perHour = burn / hours * 100, perSix = perHour * 6, perThree = perHour * 72;
      var show = function (x) { return String(parseFloat(x.toPrecision(6))); };
      var d = paper(root, 640, 210);
      if (d) {
        var L = 56, R = 20, T = 22, B = 40, W = 640, H = 210;
        var x = function (day) { return L + day / days * (W - L - R); };
        var y = function (pct) { return H - B - pct / 100 * (H - T - B); };
        [[100, 'grid'], [50, 'grid'], [0, 'axis']].forEach(function (g) {
          d('line', { x1: L, x2: W - R, y1: r1(y(g[0])), y2: r1(y(g[0])), 'class': g[1] });
          d('text', { x: L - 8, y: r1(y(g[0]) + 4), 'class': 'ts end' }, g[0] + '%');
        });
        d('text', { x: L, y: H - B + 17, 'class': 'ts' }, 'day 0');
        d('text', { x: W - R, y: H - B + 17, 'class': 'ts end' }, 'day ' + sig(days));
        d('text', { x: (L + W - R) / 2, y: H - 6, 'class': 'ts mid' }, 'Error budget left, if the error rate stays as it is');
        d('path', { d: pathOf([[x(0), y(100)], [x(days), y(0)]]), 'class': 'e none dash' });
        d('text', { x: r1(x(days * 0.72) + 8), y: r1(y(28) - 6), 'class': 'ts' }, 'allowed: gone on the last day');
        var gone = burn > 0 ? days / burn : Infinity;
        var pts = gone <= days ? [[x(0), y(100)], [x(gone), y(0)], [x(days), y(0)]] : [[x(0), y(100)], [x(days), y(100 - burn * 100)]];
        d('path', { d: pathOf(pts), 'class': 'line', style: burn > 1 ? 'stroke:var(--fault)' : 'stroke:var(--store)' });
        if (gone <= days && burn > 1) {
          var gx = x(gone), right = gx > W - R - 150;
          d('circle', { cx: r1(gx), cy: r1(y(0)), r: 5.5, 'class': 'dot fill-fault' });
          d('text', { x: r1(right ? gx - 8 : gx + 8), y: r1(y(0) - 10), 'class': 'tb' + (right ? ' end' : '') }, 'gone after ' + duration(exhaust));
        } else if (burn <= 1) {
          d('text', { x: L + 10, y: H - B - 10, 'class': 'tb' }, sig(100 - burn * 100) + '% left at the end');
        }
      }
      out(root, 'budget', show(budget) + '%');
      out(root, 'allowed', duration(secs * budget / 100));
      out(root, 'burn', sig(burn) + '×');
      out(root, 'exhaust', isFinite(exhaust) ? duration(exhaust) : 'never');
      var text = 'An objective of ' + show(slo) + '% leaves an error budget of ' + show(budget) + '%: over ' + sig(days) + (days === 1 ? ' day' : ' days') + ', the equivalent of ' + duration(secs * budget / 100) + ' of total failure. ';
      if (burn === 0) text += 'With no errors, none of it is being spent.';
      else {
        text += 'An error rate of ' + sig(err) + '% spends it at ' + sig(burn) + ' times the rate the objective allows, so the whole budget would be gone in ' + duration(exhaust) + '. ';
        if (perHour >= 2) text += 'At that rate ' + sig(Math.min(perHour, 100)) + '% of the budget goes every hour, at or above the 2% that calls for a page. Page someone now.';
        else if (perSix >= 5) text += 'At that rate ' + sig(perSix) + '% of the budget goes every six hours, at or above the 5% that calls for a page. Page someone if it has lasted that long.';
        else if (burn >= 1 && (days < 3 || perThree >= 10)) text += 'The budget will run out before the window ends, but slowly' + (days >= 3 ? ': ' + sig(Math.min(perThree, 100)) + '% of it in three days' : '') + '. Open a ticket for working hours. It does not justify waking anyone.';
        else if (burn >= 1) text += 'That is a little faster than the budget allows. Watch it. No alert yet.';
        else text += 'That is slower than the budget allows. No alert.';
      }
      out(root, 'verdict', text);
    });
  });

  // ------------------------------------------------------------ fleet size and cost
  $$('[data-widget="fleet"]').forEach(function (root) {
    var money = function (x, digits) { return '$' + x.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }); };
    bind(root, function () {
      var peak = val(root, 'peak'), per = val(root, 'per'), util = val(root, 'util'), spare = Math.round(val(root, 'spare')), price = val(root, 'price'), ratio = val(root, 'ratio');
      if (!(peak > 0) || !(per > 0) || !(util > 0 && util <= 100) || !(spare >= 0) || !(price >= 0) || !(ratio >= 1)) {
        ['base', 'total', 'monthly', 'avgutil', 'permillion'].forEach(function (k) { out(root, k, 'n/a'); });
        out(root, 'verdict', 'Enter a peak and a per-instance capacity above zero, a target from just above 0 to 100%, spares and a price of zero or more, and a peak-to-average ratio of at least 1.');
        return;
      }
      var base = Math.ceil(peak / (per * util / 100)), total = base + spare, monthly = total * price * 730;
      var avg = peak / ratio, avgutil = avg / (total * per) * 100, millions = avg * 730 * 3600 / 1e6, perm = millions > 0 ? monthly / millions : 0;
      var inst = function (x) { return x.toLocaleString('en-US') + (x === 1 ? ' instance' : ' instances'); };
      out(root, 'base', base.toLocaleString('en-US'));
      out(root, 'total', total.toLocaleString('en-US'));
      out(root, 'monthly', money(Math.round(monthly), 0));
      out(root, 'avgutil', sig(avgutil) + '%');
      out(root, 'permillion', money(perm, perm < 10 ? 2 : 0));
      out(root, 'verdict', 'At peak, ' + compact(peak) + (peak === 1 ? ' request a second needs ' : ' requests a second need ') + inst(base) + ' if each is kept to ' + sig(util) + '% of the ' + compact(per) + ' it can handle. ' +
        (spare > 0 ? spare.toLocaleString('en-US') + (spare === 1 ? ' spare' : ' spares') + ' for failures ' + (spare === 1 ? 'makes ' : 'make ') + total.toLocaleString('en-US') + ', costing ' : 'With no spares, that costs ') +
        money(Math.round(monthly), 0) + ' a month at ' + money(price, 2) + ' an hour if they all run all the time. Averaged over the day the fleet works at ' + sig(avgutil) + '% of what it could do, and each million requests costs about ' + money(perm, perm < 10 ? 2 : 0) +
        '. The gap between the average and the peak is what autoscaling can save.');
    });
  });

  // ------------------------------------------------------------ restore time
  $$('[data-widget="restore"]').forEach(function (root) {
    bind(root, function () {
      var size = val(root, 'size'), speed = val(root, 'speed'), interval = val(root, 'interval'), other = val(root, 'other');
      if (!(size > 0) || !(speed > 0) || !(interval > 0) || !(other >= 0)) {
        ['copy', 'total', 'rpo', 'tenx'].forEach(function (k) { out(root, k, 'n/a'); });
        out(root, 'verdict', 'Enter a size, a speed and a backup interval above zero, and other time of zero or more.');
        return;
      }
      var copy = size * 1024 / speed, total = copy + other * 60, ten = copy * 10 + other * 60;
      out(root, 'copy', duration(copy));
      out(root, 'total', duration(total));
      out(root, 'rpo', duration(interval * 3600));
      out(root, 'tenx', duration(ten));
      out(root, 'verdict', 'Copying ' + compact(size) + ' GB back at ' + compact(speed) + ' MB a second takes ' + duration(copy) + (other > 0 ? '. Add ' + duration(other * 60) + ' to notice, decide, provision and verify, and the service returns after about ' + duration(total) : '. With no time allowed for anything else, that is the whole recovery') +
        '. With a backup every ' + duration(interval * 3600) + ' and no log archiving, up to ' + duration(interval * 3600) + ' of changes are gone. When the data has grown ten times, the same restore takes ' + duration(ten) + ' unless the speed grows with it.');
    });
  });

  // ------------------------------------------------------------ password guessing time
  $$('[data-widget="guessing"]').forEach(function (root) {
    var YEAR = 31557600, FAST = 1e10;
    var long = function (s) {
      var y = s / YEAR;
      if (s < 0.001) return 'under a millisecond';
      if (y < 2) return duration(s);
      if (y < 1000) return sig(y) + ' years';
      if (y < 1e6) return Math.round(sig(y)).toLocaleString('en-US') + ' years';
      if (y < 1e9) return sig(y / 1e6) + ' million years';
      if (y < 1e12) return sig(y / 1e9) + ' billion years';
      if (y < 1e15) return sig(y / 1e12) + ' trillion years';
      return 'more than a quadrillion years';
    };
    bind(root, function () {
      var ms = val(root, 'hashms'), rig = val(root, 'rig'), bits = val(root, 'bits');
      if (!(ms >= 1 && ms <= 5000) || !(rig >= 1 && rig <= 1e6) || !(bits >= 1 && bits <= 128)) {
        ['gps', 'avg', 'signins', 'fast'].forEach(function (k) { out(root, k, 'n/a'); });
        noPaper(root);
        out(root, 'verdict', 'Enter a hash time from 1 to 5,000 ms, an attacker speed from 1 to 1,000,000 times one core, and a strength from 1 to 128 bits.');
        return;
      }
      var gps = rig * 1000 / ms, avg = function (b) { return Math.pow(2, b - 1); };
      var rows = [
        ['One of the 10,000 most common passwords', Math.log(10000) / Math.LN2],
        ['8 random lowercase letters', 8 * Math.log(26) / Math.LN2],
        ['4 random words from a list of 7,776', 4 * Math.log(7776) / Math.LN2],
        ['15 random letters and digits', 15 * Math.log(62) / Math.LN2],
        ['Your setting', bits]
      ];
      var d = paper(root, 640, 276);
      if (d) {
        var L = 40, R = 620, LO = -4, HI = 18.5;
        var x = function (s) { var v = Math.log(s) / Math.LN10; return L + (Math.max(LO, Math.min(HI, v)) - LO) / (HI - LO) * (R - L); };
        var ticks = [[1, '1 second'], [3600, '1 hour'], [YEAR, '1 yr'], [YEAR * 1e3, '1,000 yr'], [YEAR * 1e6, '1 million yr'], [YEAR * 1e9, '1 billion yr']];
        ticks.forEach(function (t) { d('text', { x: r1(x(t[0])), y: 245, 'class': 'ts mid' }, t[1]); });
        d('line', { x1: L, x2: R, y1: 230, y2: 230, 'class': 'axis' });
        d('circle', { cx: 46, cy: 12, r: 4.5, 'class': 'hollow' });
        d('text', { x: 56, y: 16, 'class': 'ts' }, 'a fast hash, 10 billion guesses a second');
        d('circle', { cx: 316, cy: 12, r: 5, 'class': 'fill-ink' });
        d('text', { x: 326, y: 16, 'class': 'ts' }, 'your hash, ' + compact(sig(gps)) + ' a second: the time at the right');
        rows.forEach(function (row, i) {
          var y = 46 + i * 38, mine = i === 4, n = avg(row[1]), slow = n / gps, fast = n / FAST;
          var xs = x(slow), xf = x(fast), off = Math.log(slow) / Math.LN10 > HI;
          ticks.forEach(function (t) { d('line', { x1: r1(x(t[0])), x2: r1(x(t[0])), y1: y + 7, y2: y + 19, 'class': 'grid' }); });
          d('text', { x: L, y: y, 'class': mine ? 'tb' : 'ts' }, row[0] + ' (' + sig(row[1]) + (sig(row[1]) === 1 ? ' bit)' : ' bits)'));
          d('text', { x: R, y: y, 'class': (mine ? 'tb' : 'ts') + ' end' }, (off ? 'off the scale: ' : '') + long(slow));
          d('line', { x1: r1(xf), x2: r1(xs), y1: y + 13, y2: y + 13, 'class': 'axis' });
          d('circle', { cx: r1(xf), cy: y + 13, r: 4.5, 'class': 'hollow' });
          d('circle', { cx: r1(xs), cy: y + 13, r: mine ? 5.5 : 5, 'class': mine ? 'dot' : 'fill-ink' });
        });
        d('text', { x: (L + R) / 2, y: 268, 'class': 'ts mid' }, 'Average time to find the password. Each step to the right is a thousand times longer, or more.');
      }
      out(root, 'gps', compact(sig(gps)));
      out(root, 'avg', long(avg(bits) / gps));
      out(root, 'signins', compact(sig(1000 / ms)));
      out(root, 'fast', long(avg(bits) / FAST));
      var text = 'One hash takes ' + sig(ms) + ' ms on your server, so one core can check ' + compact(sig(1000 / ms)) + (sig(1000 / ms) === 1 ? ' sign-in' : ' sign-ins') + ' a second. An attacker with ' +
        compact(rig) + (rig === 1 ? ' time' : ' times') + ' that speed makes ' + compact(sig(gps)) + (sig(gps) === 1 ? ' guess' : ' guesses') + ' a second against each stolen hash, and finds a password of ' + sig(bits) +
        (bits === 1 ? ' bit' : ' bits') + ' in ' + long(avg(bits) / gps) + ' on average. Behind a fast hash the same password would last ' + long(avg(bits) / FAST) + '. ';
      text += ms > 1000 ? 'A hash slower than a second makes signing in feel slow, and lets anyone tie up your servers by submitting passwords.'
        : ms < 50 ? 'A hash this quick gives away most of the protection. Aim for a few hundred milliseconds.'
        : 'The slow hash multiplies every password’s lifetime by ' + compact(sig(FAST / gps)) + '. It cannot save a password that is on a list of common ones.';
      out(root, 'verdict', text);
    });
  });

  // ------------------------------------------------------------ access token lifetime
  $$('[data-widget="tokenlife"]').forEach(function (root) {
    bind(root, function () {
      var clients = val(root, 'clients'), life = val(root, 'lifetime'), rpm = val(root, 'rpm');
      if (!(clients >= 1 && clients <= 1e9) || !(life >= 1 && life <= 1440) || !(rpm >= 0.1 && rpm <= 10000)) {
        ['refresh', 'requests', 'pertoken', 'exposure'].forEach(function (k) { out(root, k, 'n/a'); });
        noPaper(root);
        out(root, 'verdict', 'Enter 1 to 1,000,000,000 clients, a lifetime of 1 to 1,440 minutes and 0.1 to 10,000 requests a minute for each client.');
        return;
      }
      var refresh = clients / (life * 60), requests = clients * rpm / 60, per = rpm * life;
      var d = paper(root, 640, 230);
      if (d) {
        var L = 64, R = 620, T = 20, B = 186, maxX = life <= 60 ? 60 : Math.ceil(life / 60) * 60;
        var at = function (m) { return clients / (m * 60); }, top = at(1);
        var x = function (m) { return L + (m - 1) / (maxX - 1) * (R - L); };
        var y = function (v) { return B - Math.min(1, v / top) * (B - T); };
        [1, 0.5, 0].forEach(function (g) {
          d('line', { x1: L, x2: R, y1: r1(y(top * g)), y2: r1(y(top * g)), 'class': g ? 'grid' : 'axis' });
          d('text', { x: L - 8, y: r1(y(top * g) + 4), 'class': 'ts end' }, compact(sig(top * g)));
        });
        [1, maxX / 4, maxX / 2, maxX * 3 / 4, maxX].forEach(function (m) { d('text', { x: r1(x(m)), y: B + 17, 'class': 'ts mid' }, sig(m) + ' min'); });
        d('text', { x: (L + R) / 2, y: 224, 'class': 'ts mid' }, 'Access token lifetime. The curve is refresh requests a second at the issuer.');
        var pts = [];
        for (var i = 0; i <= 120; i++) { var m = 1 + (maxX - 1) * Math.pow(i / 120, 2); pts.push([x(m), y(at(m))]); }
        d('path', { d: pathOf(pts), 'class': 'line' });
        var px = x(life), py = y(refresh), right = px > 400;
        d('line', { x1: r1(px), x2: r1(px), y1: r1(py), y2: B, 'class': 'e none dash' });
        d('circle', { cx: r1(px), cy: r1(py), r: 5.5, 'class': 'dot' });
        d('text', { x: r1(right ? px - 10 : px + 10), y: r1(Math.max(T + 12, py - 28)), 'class': 'tb' + (right ? ' end' : '') }, compact(sig(refresh)) + (sig(refresh) === 1 ? ' refresh a second' : ' refreshes a second'));
        d('text', { x: r1(right ? px - 10 : px + 10), y: r1(Math.max(T + 28, py - 12)), 'class': 'ts' + (right ? ' end' : '') }, 'a revoked token works for up to ' + duration(life * 60));
      }
      out(root, 'refresh', compact(sig(refresh)));
      out(root, 'requests', compact(sig(requests)));
      out(root, 'pertoken', compact(sig(per)));
      out(root, 'exposure', duration(life * 60));
      var text = 'With ' + compact(clients) + (clients === 1 ? ' client' : ' clients') + ' and an access token that lives for ' + duration(life * 60) + ', the issuer handles ' + compact(sig(refresh)) +
        (sig(refresh) === 1 ? ' refresh' : ' refreshes') + ' a second, and each token serves about ' + compact(sig(per)) + (sig(per) === 1 ? ' API request' : ' API requests') + ' with no lookup. ' +
        'Checking a server-side session on every request would mean ' + compact(sig(requests)) + (sig(requests) === 1 ? ' lookup' : ' lookups') + ' a second. The price is that a token revoked at the issuer keeps working for up to ' + duration(life * 60) + '. ';
      text += life < 5 ? 'Below five minutes the issuer is nearly as busy, and as critical, as a session store would be.'
        : life > 60 ? 'More than an hour is a long time for a stolen token to stay valid.'
        : 'Between five minutes and an hour is the usual range.';
      out(root, 'verdict', text);
    });
  });

  // ------------------------------------------------------------ roles needed when roles encode attributes
  $$('[data-widget="roles"]').forEach(function (root) {
    bind(root, function () {
      var jobs = Math.round(val(root, 'jobs')), regions = Math.round(val(root, 'regions')), teams = Math.round(val(root, 'teams'));
      if (!(jobs >= 1 && jobs <= 200) || !(regions >= 1 && regions <= 200) || !(teams >= 1 && teams <= 2000)) {
        ['combined', 'plain', 'attributes', 'ratio'].forEach(function (k) { out(root, k, 'n/a'); });
        out(root, 'verdict', 'Enter 1 to 200 job functions, 1 to 200 regions and 1 to 2,000 teams.');
        return;
      }
      var combined = jobs * regions * teams, attrs = (regions > 1 ? 1 : 0) + (teams > 1 ? 1 : 0);
      out(root, 'combined', combined.toLocaleString('en-US'));
      out(root, 'plain', jobs.toLocaleString('en-US'));
      out(root, 'attributes', String(attrs));
      out(root, 'ratio', sig(combined / jobs).toLocaleString('en-US') + '×');
      out(root, 'verdict', attrs === 0
        ? 'With one region and one team there is nothing to combine: ' + jobs + (jobs === 1 ? ' role is' : ' roles are') + ' enough, and plain role-based access control fits.'
        : 'If a role has to say what someone does, where and for which team, every combination needs its own: ' + jobs + ' × ' + regions + ' × ' + teams + ' = ' + combined.toLocaleString('en-US') +
          (combined === 1 ? ' role' : ' roles') + ' to create, assign and review. Keeping ' + jobs + (jobs === 1 ? ' role' : ' roles') + ' and comparing ' + (attrs === 1 ? 'one attribute' : 'two attributes') +
          ' of the user with the same ' + (attrs === 1 ? 'attribute' : 'attributes') + ' of the object does the same job, and a new region or team needs no new role.');
    });
  });

  // ------------------------------------------------------------ messages under one key before random nonces risk repeating
  $$('[data-widget="noncebudget"]').forEach(function (root) {
    var LIMIT = 4294967296; // 2^32 messages with random 96-bit nonces
    bind(root, function () {
      var rate = val(root, 'rate'), days = val(root, 'days');
      if (!(rate >= 0.001 && rate <= 1e9) || !(days >= 1 && days <= 3650)) {
        ['total', 'limit', 'reached', 'share'].forEach(function (k) { out(root, k, 'n/a'); });
        noPaper(root);
        out(root, 'verdict', 'Enter a rate from 0.001 to 1,000,000,000 messages a second and a key lifetime from 1 to 3,650 days.');
        return;
      }
      var total = rate * 86400 * days, cross = LIMIT / (rate * 86400), over = total > LIMIT;
      var d = paper(root, 640, 220);
      if (d) {
        var L = 70, R = 620, T = 22, B = 176, top = Math.max(total, LIMIT) * 1.12;
        var x = function (t) { return L + t / days * (R - L); }, y = function (v) { return B - v / top * (B - T); };
        d('line', { x1: L, x2: R, y1: B, y2: B, 'class': 'axis' });
        d('text', { x: L - 8, y: B + 4, 'class': 'ts end' }, '0');
        d('text', { x: L, y: B + 17, 'class': 'ts' }, 'new key');
        d('text', { x: R, y: B + 17, 'class': 'ts end' }, 'day ' + sig(days));
        d('text', { x: (L + R) / 2, y: 212, 'class': 'ts mid' }, 'Messages encrypted under one key since it was created');
        d('path', { d: pathOf([[L, y(LIMIT)], [R, y(LIMIT)]]), 'class': 'e none dash' });
        if (y(LIMIT) < B - 14) d('text', { x: L - 8, y: r1(y(LIMIT) + 4), 'class': 'ts end' }, '4.29 bn');
        var left = over && cross > days / 2;
        d('text', { x: left ? L + 8 : R, y: r1(y(LIMIT) - 7), 'class': left ? 'ts' : 'ts end' }, 'limit for random nonces: 2³² messages');
        d('path', { d: pathOf([[x(0), y(0)], [x(days), y(total)]]), 'class': 'line', style: over ? 'stroke:var(--fault)' : 'stroke:var(--store)' });
        if (over) {
          d('line', { x1: r1(x(cross)), x2: r1(x(cross)), y1: r1(y(LIMIT)), y2: B, 'class': 'e none dash' });
          d('circle', { cx: r1(x(cross)), cy: r1(y(LIMIT)), r: 5.5, 'class': 'dot fill-fault' });
          var early = cross < days * 0.15;
          d('text', { x: early ? L + 10 : r1(x(cross) + 10), y: early ? T + 14 : r1(y(LIMIT) + 20), 'class': 'tb' }, 'limit reached after ' + duration(cross * 86400));
        } else {
          d('circle', { cx: r1(x(days)), cy: r1(y(total)), r: 5.5, 'class': 'dot fill-store' });
          d('text', { x: r1(x(days) - 10), y: r1(y(total) - 10), 'class': 'tb end' }, compact(sig(total)) + ' when the key is retired');
        }
      }
      out(root, 'total', compact(sig(total)));
      out(root, 'limit', '4.29 billion');
      out(root, 'reached', isFinite(cross) && cross < 36500 ? duration(cross * 86400) : 'not in a century');
      out(root, 'share', sig(Math.min(total / LIMIT, 1e6) * 100).toLocaleString('en-US') + '%');
      out(root, 'verdict', 'At ' + compact(sig(rate)) + (sig(rate) === 1 ? ' message' : ' messages') + ' a second, one key encrypts ' + compact(sig(total)) + ' messages in ' + sig(days) + (days === 1 ? ' day. ' : ' days. ') +
        (over ? 'That passes the limit of 2³² after ' + duration(cross * 86400) + '. Replace the key more often than that, give each record its own data key, or use a construction made for more messages per key.'
              : 'That is ' + sig(total / LIMIT * 100) + '% of the limit of 2³², so random nonces are safe for the life of this key.'));
    });
  });

  // ------------------------------------------------------------ how little traffic saturates an expensive endpoint
  $$('[data-widget="flood"]').forEach(function (root) {
    bind(root, function () {
      var cores = val(root, 'cores'), ms = val(root, 'ms'), attack = val(root, 'attack'), limit = val(root, 'limit');
      if (!(cores >= 1 && cores <= 100000) || !(ms >= 0.1 && ms <= 60000) || !(attack >= 1 && attack <= 1e9) || !(limit >= 0.01 && limit <= 100000)) {
        ['capacity', 'load', 'sources', 'ratio'].forEach(function (k) { out(root, k, 'n/a'); });
        out(root, 'verdict', 'Enter 1 to 100,000 cores, 0.1 to 60,000 ms of work per request, an attack of 1 to 1,000,000,000 requests a second and a limit of 0.01 to 100,000 requests a second for each client.');
        return;
      }
      var capacity = cores * 1000 / ms, load = attack / capacity * 100, sources = Math.ceil(capacity / limit);
      out(root, 'capacity', compact(sig(capacity)));
      out(root, 'load', sig(load).toLocaleString('en-US') + '%');
      out(root, 'sources', compact(sources));
      out(root, 'ratio', compact(sig(Math.max(1, attack / limit))));
      out(root, 'verdict', 'Each request costs ' + sig(ms) + ' ms of processor time, so ' + compact(cores) + (cores === 1 ? ' core handles ' : ' cores handle ') + compact(sig(capacity)) +
        ' of them a second. An attacker sending ' + compact(sig(attack)) + ' a second ' +
        (load >= 100 ? 'uses ' + sig(load).toLocaleString('en-US') + '% of that, and ordinary users get nothing. ' : 'takes ' + sig(load) + '% of that away from ordinary users. ') +
        'With a limit of ' + sig(limit) + ' a second for each client, checked before the expensive work starts, the same attack needs ' + compact(sources) +
        (sources === 1 ? ' separate client' : ' separate clients') + ' to fill the endpoint, and each rejected request costs almost nothing.');
    });
  });

  // ------------------------------------------------------------ classes needed: one per combination, or one per part
  $$('[data-widget="combos"]').forEach(function (root) {
    bind(root, function () {
      var kinds = Math.round(val(root, 'kinds')), extras = Math.round(val(root, 'extras'));
      if (!(kinds >= 1 && kinds <= 50) || !(extras >= 0 && extras <= 16)) {
        ['inherit', 'compose', 'next', 'nextc'].forEach(function (k) { out(root, k, 'n/a'); });
        noPaper(root);
        out(root, 'verdict', 'Enter 1 to 50 kinds and 0 to 16 optional behaviors.');
        return;
      }
      var inherit = kinds * Math.pow(2, extras), compose = kinds + extras;
      var block = function (n) { var shown = Math.min(n, 96); return shown > 48 ? 38 : shown > 40 ? 28 : 10; };
      var y2 = 10 + block(inherit) + 22, y3 = y2 + block(compose) + 20;
      var d = paper(root, 640, y3 + 10);
      if (d) {
        var row = function (y, n, cls, label) {
          var shown = Math.min(n, 96), per = 48;
          d('text', { x: 10, y: y + 8, 'class': 'ts' }, label);
          for (var i = 0; i < shown; i++) d('rect', { x: 160 + (i % per) * 9.5, y: y + Math.floor(i / per) * 10, width: 7.5, height: 8, rx: 1.5, 'class': 'bar ' + cls });
          d('text', { x: shown > 40 ? 160 : 160 + shown * 9.5 + 6, y: shown > 40 ? y + (shown > per ? 34 : 24) : y + 8, 'class': 'ts tb' }, n.toLocaleString('en-US') + (n === 1 ? ' class' : ' classes') + (n > shown ? ', the first 96 drawn' : ''));
        };
        row(10, inherit, 'fault', 'One for each combination');
        row(y2, compose, 'store', 'One for each part');
        d('text', { x: 10, y: y3, 'class': 'ts' }, 'Each square is a class someone has to write, name, test and keep in step with the others.');
      }
      out(root, 'inherit', inherit.toLocaleString('en-US'));
      out(root, 'compose', compose.toLocaleString('en-US'));
      out(root, 'next', (inherit * 2).toLocaleString('en-US'));
      out(root, 'nextc', (compose + 1).toLocaleString('en-US'));
      out(root, 'verdict', extras === 0
        ? 'With no optional behaviors there is nothing to combine: ' + kinds + (kinds === 1 ? ' class' : ' classes') + ' either way.'
        : kinds + (kinds === 1 ? ' kind' : ' kinds') + ' and ' + extras + (extras === 1 ? ' optional behavior' : ' optional behaviors') + ' give ' + inherit.toLocaleString('en-US') +
          ' combinations. With a subclass for each, that is ' + inherit.toLocaleString('en-US') + ' classes, and one more behavior doubles it to ' + (inherit * 2).toLocaleString('en-US') +
          '. With one class for each kind and one wrapper for each behavior it is ' + compose + ', and one more behavior makes ' + (compose + 1) + '.');
    });
  });

  // ------------------------------------------------------------ memory saved by sharing identical parts
  $$('[data-widget="sharing"]').forEach(function (root) {
    var size = function (b) { return b >= 1e9 ? sig(b / 1e9) + ' GB' : b >= 1e6 ? sig(b / 1e6) + ' MB' : b >= 1e3 ? sig(b / 1e3) + ' kB' : sig(b) + ' bytes'; };
    bind(root, function () {
      var n = Math.round(val(root, 'objects')), d = Math.round(val(root, 'distinct')), part = val(root, 'part');
      if (!(n >= 1 && n <= 1e10) || !(d >= 1 && d <= n) || !(part >= 1 && part <= 1e6)) {
        ['own', 'shared', 'saved', 'each'].forEach(function (k) { out(root, k, 'n/a'); });
        out(root, 'verdict', 'Enter 1 to 10,000,000,000 objects, a number of distinct values from 1 up to the number of objects, and 1 to 1,000,000 bytes for the shared part.');
        return;
      }
      var own = n * part, shared = d * part, saved = own - shared, per = n / d;
      out(root, 'own', size(own));
      out(root, 'shared', size(shared));
      out(root, 'saved', size(saved));
      out(root, 'each', compact(sig(per)));
      out(root, 'verdict', compact(n) + (n === 1 ? ' object' : ' objects') + ' that each carry their own copy of a ' + sig(part) + '-byte part use ' + size(own) + ' for those parts. If only ' + compact(d) +
        (d === 1 ? ' distinct value exists' : ' distinct values exist') + ', sharing them takes ' + size(shared) + ' and saves ' + size(saved) + '. ' +
        (per < 3 ? 'With so few objects for each distinct value, the saving does not justify the lookup table and the rule that shared parts never change.'
                 : 'Each shared part serves about ' + compact(sig(per)) + ' objects, which is the condition that makes the pattern pay.'));
    });
  });

  // ------------------------------------------------------------ undo history: snapshots or commands
  $$('[data-widget="undo"]').forEach(function (root) {
    var size = function (b) { return b >= 1e12 ? sig(b / 1e12) + ' TB' : b >= 1e9 ? sig(b / 1e9) + ' GB' : b >= 1e6 ? sig(b / 1e6) + ' MB' : b >= 1e3 ? sig(b / 1e3) + ' kB' : sig(b) + ' bytes'; };
    bind(root, function () {
      var mp = val(root, 'mp'), steps = Math.round(val(root, 'steps')), cmd = val(root, 'cmd');
      if (!(mp >= 0.1 && mp <= 1000) || !(steps >= 1 && steps <= 1e5) || !(cmd >= 1 && cmd <= 1e6)) {
        ['one', 'snaps', 'cmds', 'ratio'].forEach(function (k) { out(root, k, 'n/a'); });
        out(root, 'verdict', 'Enter a picture of 0.1 to 1,000 megapixels, 1 to 100,000 edits and a command size of 1 to 1,000,000 bytes.');
        return;
      }
      var one = mp * 1e6 * 4, snaps = one * steps, cmds = cmd * steps, ratio = snaps / cmds;
      out(root, 'one', size(one));
      out(root, 'snaps', size(snaps));
      out(root, 'cmds', size(cmds));
      out(root, 'ratio', ratio >= 10 ? compact(sig(ratio)) + ' to 1' : sig(ratio) + ' to 1');
      out(root, 'verdict', 'A picture of ' + sig(mp) + ' megapixels is ' + size(one) + ' in memory at 4 bytes a pixel. A full copy before each of ' + compact(steps) + (steps === 1 ? ' edit' : ' edits') + ' takes ' + size(snaps) +
        '. The same history as commands of ' + sig(cmd) + ' bytes takes ' + size(cmds) + '. ' +
        (ratio >= 100 ? 'Commands are the only practical choice at this size, at the price of a correct undo for every kind of edit.'
          : ratio >= 3 ? 'Commands are smaller, but the gap is narrow enough that the simplicity of snapshots may be worth it.'
          : 'The state is small enough that snapshots cost about the same, and they need no undo logic at all.'));
    });
  });

  // ------------------------------------------------------------ synchronous work on one event loop
  $$('[data-widget="oneloop"]').forEach(function (root) {
    var ms = function (v) { return v >= 1000 ? sig(v / 1000) + ' s' : v >= 1 ? sig(v) + ' ms' : sig(v * 1000) + ' µs'; };
    bind(root, function () {
      var rate = val(root, 'rate'), cpu = val(root, 'cpu'), block = val(root, 'block');
      if (!(rate >= 1 && rate <= 1e6) || !(cpu >= 0.01 && cpu <= 1e4) || !(block >= 0 && block <= 6e4)) {
        ['busy', 'ceiling', 'wait', 'stalled'].forEach(function (k) { out(root, k, 'n/a'); });
        out(root, 'verdict', 'Enter 1 to 1,000,000 requests a second, 0.01 to 10,000 ms of synchronous work, and a slow operation of 0 to 60,000 ms.');
        return;
      }
      var rho = rate * cpu / 1000, ceiling = 1000 / cpu, over = rho >= 1;
      var wait = over ? Infinity : rho * cpu / (2 * (1 - rho));
      var stalled = rate * block / 1000;
      out(root, 'busy', over ? 'over 100%' : sig(rho * 100) + '%');
      out(root, 'ceiling', compact(sig(ceiling)) + ' a second');
      out(root, 'wait', over ? 'grows without limit' : ms(wait));
      out(root, 'stalled', block === 0 ? 'none' : stalled < 1 ? 'fewer than 1' : 'about ' + compact(sig(stalled)));
      var first = over
        ? compact(rate) + ' requests a second at ' + sig(cpu) + ' ms each need ' + sig(rho * 100) + '% of one thread. Requests arrive faster than the thread can run their code, so the queue grows until something gives. This thread can carry at most ' + compact(sig(ceiling)) + ' a second.'
        : compact(rate) + ' requests a second at ' + sig(cpu) + ' ms each keep the thread running code ' + sig(rho * 100) + '% of the time. A request waits ' + ms(wait) + ' on average for its turn, assuming random arrivals. The ceiling is ' + compact(sig(ceiling)) + ' a second' +
          (rho >= 0.7 ? ', and waits rise steeply well before it.' : '.');
      var second = block === 0 ? '' : ' One synchronous operation of ' + ms(block) + ' stops everything for that long: ' + (stalled < 1 ? 'on average fewer than one other request arrives during it.' : 'about ' + compact(sig(stalled)) + ' requests arrive during it, and all of them wait.');
      out(root, 'verdict', first + second);
    });
  });

  // ------------------------------------------------------------ collisions between changes to one aggregate
  $$('[data-widget="conflicts"]').forEach(function (root) {
    bind(root, function () {
      var rate = val(root, 'rate'), win = val(root, 'window');
      if (!(rate >= 0.0001 && rate <= 1e5) || !(win >= 1 && win <= 6e5)) {
        ['chance', 'tries', 'hour'].forEach(function (k) { out(root, k, 'n/a'); });
        out(root, 'verdict', 'Enter 0.0001 to 100,000 changes a second and a time from load to save of 1 to 600,000 ms.');
        return;
      }
      var x = rate * win / 1000, p = 1 - Math.exp(-x), tries = Math.exp(x), hour = rate * 3600 * p;
      var pct = p < 0.0001 ? 'under 0.01%' : p > 0.9999 ? 'over 99.99%' : sig(p * 100) + '%';
      out(root, 'chance', pct);
      out(root, 'tries', tries > 1e6 ? 'more than a million' : tries < 1.001 ? '1' : compact(sig(tries)));
      out(root, 'hour', hour < 0.01 ? 'almost none' : compact(sig(hour)));
      out(root, 'verdict', 'At ' + sig(rate) + (rate === 1 ? ' change' : ' changes') + ' a second to the same aggregate and ' + sig(win) + ' ms between loading and saving, about ' + sig(x) +
        ' other changes land inside each change’s window on average. A change collides ' + pct + ' of the time. ' +
        (p < 0.02 ? 'Collisions are rare, and a retry handles them without anyone noticing.'
          : p < 0.3 ? 'Retries are a regular event. That is workable, and it is a sign the aggregate is busy.'
          : 'Most changes are retried, some several times, and the retries add load of their own. The aggregate is too coarse for this traffic: split it, or replace the load-and-save cycle with an atomic operation.'));
    });
  });

  // ------------------------------------------------------------ running time of a test suite by level
  $$('[data-widget="suite"]').forEach(function (root) {
    bind(root, function () {
      var n = [Math.round(val(root, 'units')), Math.round(val(root, 'ints')), Math.round(val(root, 'e2es'))];
      var each = [val(root, 'unitMs') / 1000, val(root, 'intMs') / 1000, val(root, 'e2eS')];
      var okN = n.every(function (v) { return v >= 0 && v <= 1e6; }), okT = each.every(function (v) { return v > 0 && v <= 3600; });
      var count = n[0] + n[1] + n[2];
      if (!okN || !okT || count === 0) {
        ['total', 'shareCount', 'shareTime', 'allE2e'].forEach(function (k) { out(root, k, 'n/a'); });
        noPaper(root);
        out(root, 'verdict', 'Enter at least one test, with up to 1,000,000 at each level, and a time for one test that is above zero.');
        return;
      }
      var t = [n[0] * each[0], n[1] * each[1], n[2] * each[2]], total = t[0] + t[1] + t[2];
      var pct = function (x) { return x === 0 ? '0%' : x < 0.001 ? 'under 0.1%' : x < 1 && x > 0.999 ? 'over 99.9%' : sig(x * 100) + '%'; };
      var d = paper(root, 640, 120);
      if (d) {
        var names = ['unit', 'integration', 'end to end'], cls = ['bar store', 'bar async', 'bar fault'];
        var row = function (y, label, parts, sum) {
          d('text', { x: 10, y: y + 13, 'class': 'ts' }, label);
          var x = 130;
          parts.forEach(function (p, i) {
            var w = sum > 0 ? 500 * p / sum : 0;
            if (w > 0) d('rect', { x: r1(x), y: y, width: r1(Math.max(w - 1, 1)), height: 18, rx: 2, 'class': cls[i] });
            x += w;
          });
        };
        row(8, 'Number of tests', n, count);
        row(40, 'Running time', t, total);
        d('text', { x: 10, y: 86, 'class': 'ts' }, 'Share of the time');
        names.forEach(function (name, i) {
          d('rect', { x: 130 + i * 170, y: 76, width: 12, height: 12, rx: 3, 'class': cls[i] });
          d('text', { x: 148 + i * 170, y: 86, 'class': 'ts' }, name + ': ' + pct(t[i] / total));
        });
        d('text', { x: 10, y: 112, 'class': 'ts' }, 'The two bars describe the same suite: how many tests each level has, and how much of the clock it takes.');
      }
      out(root, 'total', duration(total));
      out(root, 'shareCount', pct(n[2] / count));
      out(root, 'shareTime', pct(t[2] / total));
      out(root, 'allE2e', duration(count * each[2]));
      var worst = t[0] >= t[1] && t[0] >= t[2] ? 0 : t[1] >= t[2] ? 1 : 2;
      out(root, 'verdict', compact(count) + (count === 1 ? ' test takes ' : ' tests take ') + duration(total) + ' run one after another. The ' + ['unit', 'integration', 'end-to-end'][worst] + ' tests account for ' + pct(t[worst] / total) +
        ' of that' + (worst === 2 && n[2] / count < 0.1 ? ', though they are only ' + pct(n[2] / count) + ' of the tests' : '') + '. If every one of these checks were made end to end, the suite would take ' + duration(count * each[2]) + '. ' +
        (total <= 60 ? 'This suite is quick enough to run on every save.' : total <= 600 ? 'This suite can run before every commit, but not on every save.' : 'At this length the suite will be run rarely, or in parallel on several machines.'));
    });
  });

  // ------------------------------------------------------------ time budget for a low-level design round
  $$('[data-widget="lldclock"]').forEach(function (root) {
    var steps = [['1 Clarify', 12], ['2 Model', 12], ['3 Invariants', 6], ['4 Classes', 16], ['5 What varies', 14], ['6 Code', 28], ['7 Walk, extend', 12]];
    bind(root, function () {
      var total = val(root, 'total'), lost = val(root, 'lost');
      if (!(total >= 15 && total <= 180) || !(lost >= 0 && lost <= 60) || total - lost < 10) {
        ['work', 'diagram', 'code', 'stop'].forEach(function (k) { out(root, k, 'n/a'); });
        noPaper(root);
        out(root, 'verdict', 'Enter a round of 15 to 180 minutes that leaves at least 10 minutes of working time.');
        return;
      }
      var work = total - lost, start = lost / 2, at = start, marks = [start];
      steps.forEach(function (s) { at += work * s[1] / 100; marks.push(at); });
      var minute = function (m) { return 'minute ' + Math.round(m); };
      var d = paper(root, 640, 150);
      if (d) {
        var x = function (m) { return 10 + 620 * m / total; };
        d('rect', { x: 10, y: 34, width: 620, height: 26, rx: 4, 'class': 'bar mute' });
        steps.forEach(function (s, i) {
          var x1 = x(marks[i]), x2 = x(marks[i + 1]);
          d('rect', { x: r1(x1), y: 34, width: r1(Math.max(x2 - x1 - 1.5, 1)), height: 26, rx: 3, 'class': i === 5 ? 'bar' : i % 2 ? 'bar async' : 'bar store' });
          d('text', { x: r1((x1 + x2) / 2), y: i % 2 ? 98 : 80, 'class': 'ts mid' }, s[0]);
          d('text', { x: r1(x2), y: 26, 'class': 'ts mid' }, String(Math.round(marks[i + 1])));
        });
        d('text', { x: r1(x(start)), y: 26, 'class': 'ts mid' }, String(Math.round(start)));
        d('text', { x: 10, y: 12, 'class': 'ts' }, 'Minute at which each step ends');
        d('text', { x: 10, y: 124, 'class': 'ts' }, 'Gray at each end is time for introductions and for your own questions.');
        d('text', { x: 10, y: 142, 'class': 'ts' }, 'Steps 1 to 4 end with a class diagram on the board. Step 6 is the only one spent typing.');
      }
      out(root, 'work', sig(work) + ' min');
      out(root, 'diagram', minute(marks[4]));
      out(root, 'code', minute(marks[5]));
      out(root, 'stop', minute(marks[6]));
      out(root, 'verdict', 'Of ' + sig(total) + ' minutes, ' + sig(work) + ' are yours. Spend about ' + Math.round(work * 0.12) + ' on questions, have the class diagram drawn by ' + minute(marks[4]) + ', and be writing code by ' + minute(marks[5]) + '. That leaves about ' + Math.round(work * 0.28) +
        ' minutes of coding, enough for one use case and its checks' + (work * 0.28 < 8 ? ', so choose a small one and write the rest as signatures' : '') + '. Stop at ' + minute(marks[6]) + ' whatever state the code is in, and trace a scenario.');
    });
  });

  // ------------------------------------------------------------ parking fee for one stay
  $$('[data-widget="parkfee"]').forEach(function (root) {
    var money = function (cents) { return (cents / 100).toFixed(2); };
    bind(root, function () {
      var minutes = Math.round(val(root, 'minutes')), rate = Math.round(val(root, 'rate') * 100), grace = Math.round(val(root, 'grace')), cap = Math.round(val(root, 'cap') * 100);
      if (!(minutes >= 0 && minutes <= 1e5) || !(rate >= 0 && rate <= 1e5) || !(grace >= 0 && grace <= 1440) || !(cap >= 0 && cap <= 1e7)) {
        ['fee', 'hours', 'uncapped', 'per'].forEach(function (k) { out(root, k, 'n/a'); });
        out(root, 'verdict', 'Enter a stay of 0 to 100,000 minutes, a rate of 0 to 1,000, a free period of 0 to 1,440 minutes and a daily cap of 0 to 100,000.');
        return;
      }
      var hours = Math.ceil(minutes / 60), uncapped = hours * rate;
      var days = Math.floor(minutes / 1440), rest = minutes - days * 1440;
      var lastDay = Math.min(cap, Math.ceil(rest / 60) * rate);
      var free = minutes <= grace, fee = free ? 0 : days * cap + lastDay;
      out(root, 'fee', money(fee));
      out(root, 'hours', free ? '0' : String(hours));
      out(root, 'uncapped', free ? money(0) : money(uncapped));
      out(root, 'per', minutes === 0 ? 'n/a' : money(fee / (minutes / 60)));
      var text;
      if (free) text = 'A stay of ' + minutes + (minutes === 1 ? ' minute' : ' minutes') + ' is within the ' + grace + ' free minutes, so nothing is charged.';
      else {
        text = 'A stay of ' + minutes + ' minutes is ' + hours + (hours === 1 ? ' started hour' : ' started hours') + '. At ' + money(rate) + ' an hour that is ' + money(uncapped) + '. ';
        if (days === 0) text += uncapped > cap ? 'The daily cap of ' + money(cap) + ' applies, so the fee is ' + money(fee) + '.' : 'That is under the daily cap of ' + money(cap) + ', so the fee is ' + money(fee) + '.';
        else text += 'The stay covers ' + days + (days === 1 ? ' full day' : ' full days') + ' at the cap of ' + money(cap) + ', plus ' + money(lastDay) + ' for the remaining ' + rest + (rest === 1 ? ' minute' : ' minutes') + ', so the fee is ' + money(fee) + (uncapped > fee ? ' and the cap saves ' + money(uncapped - fee) : '') + '.';
      }
      out(root, 'verdict', text);
    });
  });

  // ------------------------------------------------------------ rough waiting time for a group of elevators
  $$('[data-widget="liftwait"]').forEach(function (root) {
    bind(root, function () {
      var floors = Math.round(val(root, 'floors')), cars = Math.round(val(root, 'cars')), perFloor = val(root, 'perFloor'), perStop = val(root, 'perStop'), stops = Math.round(val(root, 'stops'));
      if (!(floors >= 2 && floors <= 200) || !(cars >= 1 && cars <= 50) || !(perFloor >= 0.2 && perFloor <= 30) || !(perStop >= 1 && perStop <= 120) || !(stops >= 1 && stops <= 400)) {
        ['trip', 'interval', 'wait', 'need'].forEach(function (k) { out(root, k, 'n/a'); });
        out(root, 'verdict', 'Enter 2 to 200 floors, 1 to 50 cars, 0.2 to 30 seconds a floor, 1 to 120 seconds a stop and 1 to 400 stops.');
        return;
      }
      var travel = 2 * (floors - 1) * perFloor, stopping = stops * perStop, trip = travel + stopping;
      var interval = trip / cars, wait = interval / 2, need = Math.ceil(trip / 60);
      out(root, 'trip', duration(trip));
      out(root, 'interval', duration(interval));
      out(root, 'wait', duration(wait));
      out(root, 'need', String(need));
      out(root, 'verdict', 'A car that goes from the bottom to the top and back travels ' + (2 * (floors - 1)) + ' floors, which takes ' + duration(travel) + ', and spends ' + duration(stopping) + ' on ' + stops + (stops === 1 ? ' stop' : ' stops') +
        ': ' + duration(trip) + ' in all. With ' + cars + (cars === 1 ? ' car' : ' cars evenly spread') + ', one passes a given floor every ' + duration(interval) + ', so a person arriving at a random moment waits about half of that, ' + duration(wait) + '. ' +
        (stopping > travel ? 'Stopping takes more of the trip than traveling does, which is usual: faster doors help more than a faster motor. ' : '') +
        'Real cars bunch together, so treat this as the best case.');
    });
  });

  // ------------------------------------------------------------ change from a limited supply of coins
  $$('[data-widget="changemaker"]').forEach(function (root) {
    var coins = [100, 25, 10, 5];
    bind(root, function () {
      var amount = Math.round(val(root, 'amount'));
      var have = { 100: Math.round(val(root, 'c100')), 25: Math.round(val(root, 'c25')), 10: Math.round(val(root, 'c10')), 5: Math.round(val(root, 'c5')) };
      var okCounts = coins.every(function (c) { return have[c] >= 0 && have[c] <= 20; });
      if (!(amount >= 0 && amount <= 500) || !okCounts) {
        out(root, 'greedy', 'n/a'); out(root, 'exact', 'n/a'); noPaper(root);
        out(root, 'verdict', 'Enter an amount of 0 to 500 cents and 0 to 20 coins of each kind.');
        return;
      }
      var greedy = [], left = amount;
      coins.forEach(function (c) { var n = have[c]; while (left >= c && n > 0) { greedy.push(c); left -= c; n -= 1; } });
      var fewest = [0], picked = [[]], a;
      for (a = 1; a <= amount; a++) { fewest[a] = Infinity; picked[a] = null; }
      coins.forEach(function (c) {
        for (var n = 0; n < have[c]; n++) {
          for (var x = amount; x >= c; x--) {
            if (fewest[x - c] + 1 < fewest[x]) { fewest[x] = fewest[x - c] + 1; picked[x] = picked[x - c].concat([c]); }
          }
        }
      });
      var exact = picked[amount];
      var list = function (cs) { return cs.length ? cs.join(', ') : 'no coins needed'; };
      var d = paper(root, 640, 110);
      if (d) {
        var row = function (y, label, cs, cls, note) {
          d('text', { x: 10, y: y + 4, 'class': 'ts' }, label);
          cs.slice(0, 16).forEach(function (c, i) {
            d('circle', { cx: 190 + i * 27, cy: y, r: c >= 25 ? 12 : 10, 'class': 'n ' + cls });
            d('text', { x: 190 + i * 27, y: y + 4, 'class': 'ts mid' }, String(c));
          });
          if (note) d('text', { x: 190 + Math.min(cs.length, 16) * 27 + (cs.length ? 4 : -12), y: y + 4, 'class': 'ts tb' }, note);
        };
        row(26, 'Largest coin first', greedy, left === 0 ? 'store' : 'fault', left === 0 ? (greedy.length ? '' : 'nothing to give') : 'then stuck, ' + left + ' short');
        row(66, 'Every reachable amount', exact || [], 'store', exact ? (exact.length ? '' : 'nothing to give') : 'no combination adds up to ' + amount);
        d('text', { x: 10, y: 102, 'class': 'ts' }, 'Each circle is one coin handed over, in the order chosen.');
      }
      out(root, 'greedy', left === 0 ? list(greedy) : 'fails, ' + left + ' short');
      out(root, 'exact', exact ? list(exact) : 'not possible');
      out(root, 'verdict', amount % 5 !== 0 ? 'No combination of these coins makes ' + amount + ', because every coin is a multiple of 5.'
        : !exact ? 'These coins cannot make ' + amount + ' in any combination, so both methods fail and the sale must be refused.'
        : left !== 0 ? 'Taking the largest coin first gives ' + list(greedy) + ' and is then ' + left + ' short with no coin small enough. The amount can be made, as ' + list(exact) + '. A machine using the first method would refuse this sale for no reason.'
        : greedy.length > exact.length ? 'Both methods succeed, but largest-first uses ' + greedy.length + ' coins where ' + exact.length + ' would do.'
        : 'Both methods give ' + list(exact) + '. They disagree only when a coin that largest-first wants has run out.');
    });
  });

  // ------------------------------------------------------------ best hit ratio for a cache of the most popular items
  $$('[data-widget="zipfcache"]').forEach(function (root) {
    bind(root, function () {
      var items = Math.round(val(root, 'items')), capacity = Math.round(val(root, 'capacity')), skew = val(root, 'skew');
      if (!(items >= 10 && items <= 1e6) || !(capacity >= 1 && capacity <= 1e6) || !(skew >= 0 && skew <= 2)) {
        ['share', 'hit', 'need'].forEach(function (k) { out(root, k, 'n/a'); });
        out(root, 'verdict', 'Enter 10 to 1,000,000 items, a capacity of 1 to 1,000,000 entries and a skew of 0 to 2.');
        return;
      }
      var held = Math.min(capacity, items), total = 0, r;
      for (r = 1; r <= items; r++) total += Math.pow(r, -skew);
      var top = 0, need = items, acc = 0, found = false;
      for (r = 1; r <= items; r++) {
        acc += Math.pow(r, -skew);
        if (r === held) top = acc;
        if (!found && acc >= 0.9 * total) { need = r; found = true; }
        if (found && r >= held) break;
      }
      var hit = top / total, share = held / items;
      var pct = function (x) { return x >= 0.9995 ? '100%' : sig(x * 100) + '%'; };
      out(root, 'share', pct(share));
      out(root, 'hit', pct(hit));
      out(root, 'need', need.toLocaleString('en-US') + ' (' + pct(need / items) + ')');
      out(root, 'verdict', capacity >= items ? 'The cache can hold every item, so nothing is ever evicted and every request after the first for each item is a hit.'
        : 'A cache holding the ' + held.toLocaleString('en-US') + ' most popular of ' + items.toLocaleString('en-US') + ' items, ' + pct(share) + ' of them, would answer ' + pct(hit) + ' of requests. No eviction policy can do better on this pattern of popularity, and a real one does somewhat worse because it has to discover which items are popular. ' +
          (skew < 0.5 ? 'With so little skew, popularity is nearly even, and a cache helps only in proportion to its size.' : hit > 3 * share ? 'The gap between ' + pct(share) + ' of the items and ' + pct(hit) + ' of the requests is what makes caching worthwhile.' : 'The cache already holds a large share of the items, so the benefit of skew is small.'));
    });
  });

  // ------------------------------------------------------------ memory to remember every active client, by algorithm
  $$('[data-widget="limitermem"]').forEach(function (root) {
    // bytes per client measured in Node 22 (lld/ts71/memory.ts), map entry included, integer keys
    var fixedBytes = [['Token bucket', 77, ''], ['GCRA', 69, 'mute'], ['Fixed window', 77, ''], ['Sliding counter', 85, '']];
    bind(root, function () {
      var clients = Math.round(val(root, 'clients')), limit = Math.round(val(root, 'limit'));
      if (!(clients >= 1 && clients <= 1e9) || !(limit >= 1 && limit <= 100000)) {
        ['bucket', 'counter', 'log', 'ratio'].forEach(function (k) { out(root, k, 'n/a'); });
        noPaper(root);
        out(root, 'verdict', 'Enter 1 to 1,000,000,000 clients and a limit of 1 to 100,000 requests a window.');
        return;
      }
      var logBytes = 250 + 12 * limit;
      var rows = fixedBytes.concat([['Sliding log', logBytes, 'store']]);
      var most = logBytes * clients;
      var d = paper(root, 640, 150);
      if (d) {
        rows.forEach(function (r, i) {
          var y = 12 + i * 24, total = r[1] * clients, w = Math.max(1.5, 300 * total / most);
          d('text', { x: 120, y: y + 13, 'class': 'ts end' }, r[0]);
          d('rect', { x: 130, y: y, width: w.toFixed(1), height: 17, rx: 3, 'class': 'bar ' + r[2] });
          d('text', { x: (138 + w).toFixed(1), y: y + 13, 'class': 'ts tb' }, bytes(total) + ', ' + r[1].toLocaleString('en-US') + ' bytes each');
        });
        d('text', { x: 10, y: 144, 'class': 'ts' }, 'Every client at its limit. Bars share one scale.');
      }
      out(root, 'bucket', bytes(77 * clients));
      out(root, 'counter', bytes(85 * clients));
      out(root, 'log', bytes(logBytes * clients));
      out(root, 'ratio', r1(logBytes / 77) + '×');
      out(root, 'verdict', 'Remembering ' + clients.toLocaleString('en-US') + ' clients takes about ' + bytes(77 * clients) + ' as token buckets and about ' + bytes(logBytes * clients) +
        ' as sliding logs of ' + limit.toLocaleString('en-US') + ' timestamps each, ' + r1(logBytes / 77) + ' times as much. ' +
        (logBytes * clients > 8e9 ? 'That is more than one ordinary server should hold for one limit, which is why the log is kept for small limits. ' : '') +
        'The limiter’s bound on keys must be at least the number of clients active within one window, or it starts forgetting clients who are still being limited.');
    });
  });

  // ------------------------------------------------------------ settling up: greedy against the fewest payments
  $$('[data-widget="settleup"]').forEach(function (root) {
    var names = ['Ana', 'Ben', 'Chloe', 'Dev', 'Eve', 'Fay'];
    function greedy(bal) {
      var b = bal.slice(), out = [];
      for (;;) {
        var c = -1, d = -1;
        for (var i = 0; i < b.length; i++) {
          if (b[i] > 0 && (c < 0 || b[i] > b[c])) c = i;
          if (b[i] < 0 && (d < 0 || b[i] < b[d])) d = i;
        }
        if (c < 0 || d < 0) return out;
        var m = Math.min(b[c], -b[d]);
        out.push([d, c, m]); b[c] -= m; b[d] += m;
      }
    }
    function fewest(bal) {
      var idx = [], i;
      for (i = 0; i < bal.length; i++) if (bal[i] !== 0) idx.push(i);
      var n = idx.length, size = 1 << n, sum = [0], best = [0], last = [0], mask;
      for (mask = 1; mask < size; mask++) {
        var low = 0; while (!(mask & (1 << low))) low++;
        sum[mask] = sum[mask & (mask - 1)] + bal[idx[low]];
        var top = -1, who = -1;
        for (i = 0; i < n; i++) if ((mask & (1 << i)) && best[mask ^ (1 << i)] > top) { top = best[mask ^ (1 << i)]; who = i; }
        best[mask] = top + (sum[mask] === 0 ? 1 : 0); last[mask] = who;
      }
      var order = [];
      for (mask = size - 1; mask; mask ^= 1 << last[mask]) order.unshift(idx[last[mask]]);
      var out = [], group = [], run = 0;
      order.forEach(function (k) {
        group.push(k); run += bal[k];
        if (run === 0) {
          var sub = bal.map(function (v, j) { return group.indexOf(j) >= 0 ? v : 0; });
          out = out.concat(greedy(sub)); group = [];
        }
      });
      return out;
    }
    bind(root, function () {
      var cents = ['ana', 'ben', 'chloe', 'dev', 'eve'].map(function (k) { return Math.round(val(root, k) * 100); });
      if (cents.some(function (c) { return !(Math.abs(c) <= 1e6); })) {
        ['fay', 'greedy', 'fewest'].forEach(function (k) { out(root, k, 'n/a'); }); noPaper(root);
        out(root, 'verdict', 'Enter balances between −10,000 and 10,000.');
        return;
      }
      var bal = cents.concat([-cents.reduce(function (a, b) { return a + b; }, 0) || 0]); // || 0 turns -0 into 0
      var money = function (c) { return (c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
      var g = greedy(bal), f = fewest(bal);
      var d = paper(root, 640, 258);
      if (d) {
        var pos = names.map(function (_, i) { var a = -Math.PI / 2 + i * Math.PI / 3; return [320 + 190 * Math.cos(a), 116 + 84 * Math.sin(a)]; });
        f.forEach(function (t) {
          var a = pos[t[0]], b = pos[t[1]], L = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
          var p = [a[0] + ux * 27, a[1] + uy * 27], q = [b[0] - ux * 29, b[1] - uy * 29];
          d('path', { d: pathOf([p, q]), 'class': 'e store' });
          var mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2, label = money(t[2]);
          d('rect', { x: r1(mx - label.length * 3.4 - 5), y: r1(my - 10), width: r1(label.length * 6.8 + 10), height: 18, rx: 4, 'class': 'n' });
          d('text', { x: r1(mx), y: r1(my + 4), 'class': 'ts mid tb' }, label);
        });
        pos.forEach(function (p, i) {
          d('circle', { cx: r1(p[0]), cy: r1(p[1]), r: 24, 'class': 'n ' + (bal[i] > 0 ? 'store' : bal[i] < 0 ? 'fault' : '') });
          d('text', { x: r1(p[0]), y: r1(p[1] - 2), 'class': 'ts mid tb' }, names[i]);
          d('text', { x: r1(p[0]), y: r1(p[1] + 12), 'class': 'ts mid' }, (bal[i] > 0 ? '+' : '') + money(bal[i]));
        });
        d('text', { x: 10, y: 250, 'class': 'ts' }, 'Arrows: the fewest payments, from the person who owes to the person owed.');
      }
      var active = bal.filter(function (c) { return c !== 0; }).length;
      out(root, 'fay', money(bal[5]));
      out(root, 'greedy', String(g.length));
      out(root, 'fewest', String(f.length));
      out(root, 'verdict', active === 0 ? 'Everyone is already settled.'
        : (g.length > f.length ? 'Greedy needs ' + g.length + ' payments and ' + f.length + ' are enough, because the group splits into ' + (active - f.length) + ' parts that each add up to zero and can settle among themselves.'
          : 'Greedy finds the fewest payments here: ' + f.length + '. ') +
        (g.length === f.length ? (active - f.length > 1 ? 'The group splits into ' + (active - f.length) + ' parts that each add up to zero.' : 'No smaller part of the group adds up to zero, so ' + active + ' people with balances need ' + (active - 1) + '.') : ''));
    });
  });

  // ------------------------------------------------------------ leaves of a game tree: minimax against alpha-beta at its best
  $$('[data-widget="gametree73"]').forEach(function (root) {
    var RATE = 200000; // positions a second: the chapter's perft run (lld/ts73/figures.ts), rounded down
    function minimax(b, d) { return Math.pow(b, d); }
    function best(b, d) { return Math.pow(b, Math.ceil(d / 2)) + Math.pow(b, Math.floor(d / 2)) - 1; } // Levin; Knuth and Moore 1975
    function grouped(n) { return n < 1e6 ? Math.round(n).toLocaleString('en-US') : compact(n); }
    function time(s) { return s < 31536000 * 1000 ? duration(s) : compact(s / 31536000) + ' years'; }
    bind(root, function () {
      var b = Math.round(val(root, 'b')), d = Math.round(val(root, 'd'));
      if (!(b >= 2 && b <= 100) || !(d >= 1 && d <= 20)) {
        ['mm', 'ab', 'ratio', 'deeper'].forEach(function (k) { out(root, k, 'n/a'); });
        noPaper(root);
        out(root, 'verdict', 'Enter 2 to 100 moves in each position and a depth of 1 to 20.');
        return;
      }
      var m = minimax(b, d), a = best(b, d), deeper = d;
      while (best(b, deeper + 1) <= m) deeper++;
      var D = Math.min(Math.max(8, deeper + 1), 40);
      var W = 640, H = 236, L = 86, R = 128, T = 14, B = 40;
      var top = Math.ceil(Math.log10(minimax(b, D)));
      var x = function (k) { return L + (k - 1) / (D - 1) * (W - L - R); };
      var y = function (n) { return H - B - Math.log10(n) / top * (H - T - B); };
      var p = paper(root, W, H);
      if (p) {
        var step = Math.max(1, Math.ceil(top / 5));
        for (var e = 0; e <= top; e += step) {
          p('line', { x1: L, x2: W - R + 8, y1: r1(y(Math.pow(10, e))), y2: r1(y(Math.pow(10, e))), 'class': e ? 'grid' : 'axis' });
          p('text', { x: L - 8, y: r1(y(Math.pow(10, e)) + 4), 'class': 'ts end' }, e === 0 ? '1' : compact(Math.pow(10, e)));
        }
        var every = D > 24 ? 4 : D > 12 ? 2 : 1;
        for (var k = 1; k <= D; k++) if (k === 1 || k % every === 0) p('text', { x: r1(x(k)), y: H - B + 16, 'class': 'ts mid' }, String(k));
        p('text', { x: r1((L + W - R) / 2), y: H - 6, 'class': 'ts mid' }, 'depth, in moves by either side');
        var mmPts = [], abPts = [];
        for (k = 1; k <= D; k++) { mmPts.push([x(k), y(minimax(b, k))]); abPts.push([x(k), y(best(b, k))]); }
        p('path', { d: pathOf(mmPts), 'class': 'line', style: 'stroke:var(--fault)' });
        p('path', { d: pathOf(abPts), 'class': 'line', style: 'stroke:var(--store)' });
        p('text', { x: W - R + 12, y: r1(mmPts[D - 1][1] + 4), 'class': 'ts tb' }, 'minimax');
        p('text', { x: W - R + 12, y: r1(abPts[D - 1][1] - 4), 'class': 'ts tb' }, 'alpha-beta,');
        p('text', { x: W - R + 12, y: r1(abPts[D - 1][1] + 11), 'class': 'ts tb' }, 'best case');
        if (deeper > d) {
          p('path', { d: pathOf([[x(d), y(m)], [x(deeper), y(m)]]), 'class': 'e none dash' });
          p('path', { d: pathOf([[x(deeper), y(m)], [x(deeper), y(best(b, deeper))]]), 'class': 'e none dash' });
          p('circle', { cx: r1(x(deeper)), cy: r1(y(best(b, deeper))), r: 4.5, 'class': 'dot', style: 'fill:var(--store)' });
          p('text', { x: r1((x(d) + x(deeper)) / 2), y: r1(y(m) - 7), 'class': 'ts mid' }, 'same work: depth ' + deeper);
        }
        p('circle', { cx: r1(x(d)), cy: r1(y(m)), r: 5, 'class': 'dot', style: 'fill:var(--fault)' });
        p('circle', { cx: r1(x(d)), cy: r1(y(a)), r: 5, 'class': 'dot', style: 'fill:var(--store)' });
      }
      out(root, 'mm', grouped(m));
      out(root, 'ab', grouped(a));
      out(root, 'ratio', m / a < 100 ? String(sig(m / a)) : grouped(m / a));
      out(root, 'deeper', String(deeper));
      out(root, 'verdict', 'At ' + d + (d === 1 ? ' move' : ' moves') + ' deep, minimax examines ' + grouped(m) + (m === 1 ? ' leaf' : ' leaves') + ' and alpha-beta at its best ' + grouped(a) +
        '. At about 200,000 positions a second, that is ' + time(m / RATE) + ' against ' + time(a / RATE) + '. ' +
        (a === m ? 'A search one move deep has nothing to prune.'
          : deeper > d ? 'For the work minimax does here, alpha-beta at its best reaches ' + deeper + ' moves deep.'
            : 'For the work minimax does here, alpha-beta at its best cannot quite reach one move deeper.'));
    });
  });

  // ------------------------------------------------------------ seats tied up by abandoned holds (Little's law)
  $$('[data-widget="holdseats74"]').forEach(function (root) {
    bind(root, function () {
      var rate = val(root, 'rate'), quit = val(root, 'quit'), seats = val(root, 'seats'), minutes = val(root, 'minutes'), capacity = Math.round(val(root, 'capacity'));
      if (!(rate >= 0 && rate <= 100000) || !(quit >= 0 && quit <= 100) || !(seats >= 1 && seats <= 20) || !(minutes >= 0 && minutes <= 120) || !(capacity >= 1 && capacity <= 100000)) {
        ['blocked', 'share'].forEach(function (k) { out(root, k, 'n/a'); });
        noPaper(root);
        out(root, 'verdict', 'Enter 0 to 100,000 holds an hour, 0 to 100 percent abandoned, 1 to 20 seats a hold, 0 to 120 minutes and 1 to 100,000 seats.');
        return;
      }
      var perMinute = rate / 60 * quit / 100 * seats; // seats entering abandoned holds each minute
      var blocked = perMinute * minutes; // Little's law: L = arrival rate x time in the system
      var share = blocked / capacity;
      var top = Math.max(30, Math.ceil(minutes * 1.5 / 10) * 10);
      var W = 640, H = 200, L = 52, R = 150, T = 14, B = 36;
      var ymax = Math.max(capacity * 1.15, perMinute * top);
      var x = function (m) { return L + m / top * (W - L - R); };
      var y = function (v) { return H - B - Math.min(v, ymax) / ymax * (H - T - B); };
      var p = paper(root, W, H);
      if (p) {
        p('line', { x1: L, x2: W - R, y1: H - B, y2: H - B, 'class': 'axis' });
        var stepM = top <= 40 ? 5 : top <= 90 ? 15 : 30;
        for (var m = 0; m <= top; m += stepM) p('text', { x: r1(x(m)), y: H - B + 16, 'class': 'ts mid' }, String(m));
        p('text', { x: r1((L + W - R) / 2), y: H - 4, 'class': 'ts mid' }, 'minutes a hold lasts');
        p('line', { x1: L, x2: W - R, y1: r1(y(capacity)), y2: r1(y(capacity)), 'class': 'grid' });
        p('text', { x: W - R + 8, y: r1(y(capacity) + 4), 'class': 'ts tb' }, 'whole hall: ' + capacity.toLocaleString('en-US'));
        var end = Math.min(top, perMinute > 0 ? ymax / perMinute : top);
        p('path', { d: pathOf([[x(0), y(0)], [x(end), y(perMinute * end)]]), 'class': 'line', style: 'stroke:var(--async)' });
        p('text', { x: r1(x(end) + 8), y: r1(Math.max(T + 8, y(perMinute * end)) + 4), 'class': 'ts tb' }, 'in abandoned holds');
        p('line', { x1: r1(x(minutes)), x2: r1(x(minutes)), y1: r1(y(blocked)), y2: H - B, 'class': 'axis', 'stroke-dasharray': '4 4' });
        p('circle', { cx: r1(x(minutes)), cy: r1(y(blocked)), r: 5, 'class': 'dot', style: 'fill:var(--async)' });
        p('text', { x: r1(x(minutes) - 8), y: r1(y(blocked) - 9), 'class': 'ts end' }, sig(blocked) + ' seats');
      }
      out(root, 'blocked', String(sig(blocked)));
      out(root, 'share', capacity ? Math.round(share * 100) + '%' : 'n/a');
      out(root, 'verdict', blocked === 0 ? 'No seats are held by people who have left.'
        : 'On average ' + sig(blocked) + (sig(blocked) === 1 ? ' seat is' : ' seats are') + ' held by people who have already left, ' + Math.round(share * 100) + '% of the hall' +
          (share >= 1 ? ': more than the hall has, so while demand lasts, abandoned holds would keep nearly every free seat out of reach.'
            : share >= 0.25 ? ', a large share to keep out of reach while people who would pay are being turned away.'
              : ', a small share of the hall.'));
    });
  });

  // ------------------------------------------------------------ retries with capped exponential backoff, with and without full jitter
  $$('[data-widget="backoff75"]').forEach(function (root) {
    bind(root, function () {
      var base = val(root, 'base'), cap = val(root, 'cap'), attempts = Math.round(val(root, 'attempts')), clients = Math.round(val(root, 'clients'));
      if (!(base >= 1 && base <= 60000) || !(cap >= base && cap <= 3600000) || !(attempts >= 2 && attempts <= 30) || !(clients >= 1 && clients <= 10000000)) {
        ['last', 'jittered', 'crowd', 'spread'].forEach(function (k) { out(root, k, 'n/a'); });
        noPaper(root);
        out(root, 'verdict', 'Enter a first wait of 1 to 60,000 ms, a cap at least that large, 2 to 30 attempts and 1 to 10,000,000 clients.');
        return;
      }
      var times = [0], t = 0;
      for (var k = 1; k < attempts; k++) { t += Math.min(cap, base * Math.pow(2, k - 1)); times.push(t); }
      var last = times[times.length - 1];
      var perWindow = clients * 10 / base; // full jitter spreads the first retries evenly over [0, base)
      var secs = function (ms) { return ms < 1000 ? Math.round(ms) + ' ms' : duration(ms / 1000); };
      var W = 640, H = 128, L = 120, R = 24;
      var x = function (ms) { return L + ms / last * (W - L - R); };
      var p = paper(root, W, H);
      if (p) {
        [['no jitter', 1, 30, 'fault'], ['full jitter, on average', 0.5, 66, 'store']].forEach(function (row) {
          p('text', { x: L - 10, y: row[2] + 4, 'class': 'ts end' }, row[0]);
          p('line', { x1: L, x2: W - R, y1: row[2], y2: row[2], 'class': 'axis' });
          times.forEach(function (ms) { p('circle', { cx: r1(x(ms * row[1])), cy: row[2], r: 4, 'class': 'dot', style: 'fill:var(--' + row[3] + ')' }); });
        });
        p('text', { x: r1(x(last)), y: 18, 'class': 'ts end' }, 'attempt ' + attempts + ' at ' + secs(last));
        p('text', { x: r1(x(last / 2)), y: 88, 'class': 'ts mid' }, secs(last / 2));
        p('line', { x1: L, x2: W - R, y1: 104, y2: 104, 'class': 'grid' });
        p('text', { x: L, y: 120, 'class': 'ts' }, '0');
        p('text', { x: W - R, y: 120, 'class': 'ts end' }, secs(last));
        p('text', { x: r1((L + W - R) / 2), y: 120, 'class': 'ts mid' }, 'time since the first attempt');
      }
      out(root, 'last', secs(last));
      out(root, 'jittered', secs(last / 2));
      out(root, 'crowd', clients.toLocaleString('en-US'));
      out(root, 'spread', perWindow >= clients ? clients.toLocaleString('en-US') : String(sig(perWindow)));
      out(root, 'verdict', 'A task that fails every time makes its last attempt ' + secs(last) + ' after its first, or about ' + secs(last / 2) + ' on average with full jitter. ' +
        (clients > 1 ? 'If ' + clients.toLocaleString('en-US') + ' clients fail together, without jitter all of them retry in the same instant, ' + secs(base) + ' later; with full jitter about ' +
          (perWindow >= clients ? 'all of them' : String(sig(perWindow))) + ' arrive in each 10 ms of the first ' + secs(base) + '.' : ''));
    });
  });

  // ------------------------------------------------------------ a pastebin's estimate, against one ordinary server
  $$('[data-widget="pasteplan76"]').forEach(function (root) {
    var ROW_BYTES = 300;
    bind(root, function () {
      var dau = val(root, 'dau'), create = val(root, 'create'), reads = val(root, 'reads');
      var kb = val(root, 'kb'), days = val(root, 'days'), peak = val(root, 'peak');
      var keys = ['writes', 'reads', 'live', 'text', 'rows', 'egress', 'cache'];
      if (!(dau >= 1 && dau <= 1e10) || !(create >= 0 && create <= 100) || !(reads >= 0 && reads <= 10000) ||
          !(kb > 0 && kb <= 512) || !(days > 0 && days <= 3650) || !(peak >= 1 && peak <= 20)) {
        keys.forEach(function (k) { out(root, k, 'n/a'); });
        noPaper(root);
        out(root, 'verdict', 'Enter 1 to 10 billion users, 0 to 100 pastes and 0 to 10,000 reads a user a day, a size of up to 512 KB, 1 to 3,650 days kept and a peak factor of 1 to 20.');
        return;
      }
      var perDay = dau * create, w = perDay / 86400, r = dau * reads / 86400;
      var live = perDay * days, size = kb * 1000;
      var rows = live * ROW_BYTES, oneDay = perDay * size, egress = r * size * 8;
      out(root, 'writes', compact(w) + ' /s, peak ' + compact(w * peak) + ' /s');
      out(root, 'reads', compact(r) + ' /s, peak ' + compact(r * peak) + ' /s');
      out(root, 'live', compact(live) + (live === 1 ? ' paste' : ' pastes'));
      out(root, 'text', bytes(live * size));
      out(root, 'rows', bytes(rows));
      out(root, 'egress', bits(egress) + ', peak ' + bits(egress * peak));
      out(root, 'cache', bytes(oneDay));
      // planning figures for one ordinary server, from the estimation chapter
      var checks = [
        { name: 'Peak writes', v: w * peak, limit: 1000, show: compact(w * peak) + ' /s of 1,000', fix: 'spread the rows over several databases (partitioning)' },
        { name: 'Peak reads, no cache', v: r * peak, limit: 10000, show: compact(r * peak) + ' /s of 10,000', fix: 'the cache must absorb most reads, or add read replicas' },
        { name: 'Rows in the database', v: rows, limit: 64e9, show: bytes(rows) + ' of 64 GB', fix: 'the rows no longer fit in one server’s memory, so partition them or accept reads from disk' },
        { name: 'One day of new pastes', v: oneDay, limit: 64e9, show: bytes(oneDay) + ' of 64 GB', fix: 'the cache must be spread over several nodes' },
        { name: 'Peak traffic out', v: egress * peak, limit: 10e9, show: bits(egress * peak) + ' of 10 Gbit/s', fix: 'serve popular pastes from a CDN' }
      ];
      var d = paper(root, 640, 176);
      if (d) {
        var X0 = 190, X1 = 490, lo = -3, hi = 1;
        var x = function (share) {
          var e = Math.log10(Math.max(share, 1e-12));
          return X0 + (Math.min(Math.max(e, lo), hi) - lo) / (hi - lo) * (X1 - X0);
        };
        d('text', { x: 10, y: 14, 'class': 'ts' }, 'Each dot is a share of one ordinary server, on a logarithmic scale.');
        [[0.001, '0.1%'], [0.01, '1%'], [0.1, '10%'], [1, 'one server'], [10, '10×']].forEach(function (t) {
          d('line', { x1: r1(x(t[0])), y1: 38, x2: r1(x(t[0])), y2: 154, 'class': t[0] === 1 ? 'axis' : 'grid', style: t[0] === 1 ? 'stroke-dasharray:4 3' : '' });
          d('text', { x: r1(x(t[0])), y: 32, 'class': 'ts mid' }, t[1]);
        });
        checks.forEach(function (c, i) {
          var y = 54 + i * 24, share = c.v / c.limit;
          d('text', { x: 10, y: y + 4, 'class': 'ts' }, c.name);
          d('line', { x1: X0, y1: y, x2: X1, y2: y, 'class': 'grid' });
          d('circle', { cx: r1(x(share)), cy: y, r: 5, 'class': share > 1 ? 'dot fill-fault' : 'dot' });
          d('text', { x: X1 + 12, y: y + 4, 'class': share > 1 ? 'ts tb' : 'ts' }, c.show);
        });
        d('text', { x: 10, y: 172, 'class': 'ts' }, 'One server: 1,000 writes or 10,000 indexed reads a second, 64 GB of memory, a 10 Gbit/s link.');
      }
      var over = checks.filter(function (c) { return c.v > c.limit; });
      var near = checks.filter(function (c) { return c.v > c.limit / 2 && c.v <= c.limit; });
      var text;
      if (!over.length && !near.length) {
        text = 'Every quantity is under half of one ordinary server. The first design needs no partitioning: one database with a standby, a cache of about ' + bytes(oneDay) +
          ' for the latency target, and more than one app server for failures rather than for load.';
      } else {
        text = over.map(function (c) { return c.name + ', ' + c.show.replace(' of ', ' against ') + ', is ' + sig(c.v / c.limit, 2) + ' times one server: ' + c.fix + '.'; }).join(' ');
        if (near.length) text += (text ? ' ' : '') + near.map(function (c) { return c.name; }).join(' and ') + (near.length === 1 ? ' is' : ' are') + ' past half of one server, which leaves no room for growth or for a failed machine.';
      }
      out(root, 'verdict', text);
    });
  });

  // ------------------------------------------------------------ URL shortener: traffic, storage and how full the code space gets
  $$('[data-widget="keyspace77"]').forEach(function (root) {
    var REPLY_BYTES = 500; // a redirect is headers only
    bind(root, function () {
      var perDay = val(root, 'links'), clicks = val(root, 'clicks'), years = val(root, 'years');
      var len = val(root, 'length'), rowBytes = val(root, 'bytes'), peak = val(root, 'peak');
      var keys = ['creates', 'redirects', 'stored', 'storage', 'egress', 'space', 'attempts'];
      if (!(perDay >= 1 && perDay <= 1e12) || !(clicks >= 0 && clicks <= 1e6) || !(years > 0 && years <= 100) ||
          !(len >= 4 && len <= 10 && Math.round(len) === len) || !(rowBytes >= 10 && rowBytes <= 1e5) || !(peak >= 1 && peak <= 20)) {
        keys.forEach(function (k) { out(root, k, 'n/a'); });
        noPaper(root);
        out(root, 'verdict', 'Enter 1 to a trillion links a day, up to a million clicks each, 1 to 100 years, a code of 4 to 10 characters, 10 bytes to 100 KB a link and a peak factor of 1 to 20.');
        return;
      }
      var space = Math.pow(62, len), w = perDay / 86400, r = perDay * clicks / 86400;
      var stored = perDay * 365 * years, fill = stored / space;
      var attempts = fill < 1 ? 1 / (1 - fill) : Infinity;
      var half = Math.sqrt(2 * space * Math.LN2); // codes drawn at random before a repeat is as likely as not
      out(root, 'creates', compact(w) + ' /s, peak ' + compact(w * peak) + ' /s');
      out(root, 'redirects', compact(r) + ' /s, peak ' + compact(r * peak) + ' /s');
      out(root, 'stored', compact(stored) + (stored === 1 ? ' link' : ' links'));
      out(root, 'storage', bytes(stored * rowBytes) + ', ' + bytes(3 * stored * rowBytes) + ' in 3 copies');
      out(root, 'egress', bits(r * REPLY_BYTES * 8) + ', peak ' + bits(r * peak * REPLY_BYTES * 8));
      out(root, 'space', fill < 1 ? sig(fill * 100, 3) + '% of ' + compact(space) : 'full: ' + compact(space) + ' codes');
      out(root, 'attempts', fill < 1 ? String(sig(attempts, 3)) : 'no code left');
      var d = paper(root, 640, 200);
      if (d) {
        var X0 = 58, X1 = 480, Y0 = 156, Y1 = 30, ends = [];
        var x = function (t) { return X0 + t / years * (X1 - X0); };
        var y = function (f) { return Y0 - Math.min(f, 1) * (Y0 - Y1); };
        [0, 0.25, 0.5, 0.75, 1].forEach(function (f) {
          d('line', { x1: X0, y1: r1(y(f)), x2: X1, y2: r1(y(f)), 'class': 'grid' });
          d('text', { x: X0 - 8, y: r1(y(f) + 4), 'class': 'ts end' }, (f * 100) + '%');
        });
        [0, 0.5, 1].forEach(function (k) {
          d('text', { x: r1(x(k * years)), y: Y0 + 20, 'class': 'ts mid' }, sig(k * years, 3) + (k === 1 ? ' years' : ''));
        });
        d('text', { x: 10, y: 14, 'class': 'ts' }, 'Share of the code space in use, by years of operation');
        [len - 1, len, len + 1].forEach(function (L) {
          if (L < 1) return;
          var S = Math.pow(62, L), full = S / (perDay * 365), pts = [], i, t;
          for (i = 0; i <= 60; i++) { t = years * i / 60; pts.push([x(t), y(perDay * 365 * t / S)]); if (t >= full) break; }
          var mine = L === len;
          d('path', { d: pathOf(pts), 'class': 'line', style: mine ? '' : 'stroke:var(--ink-3);stroke-width:1.5' });
          var last = pts[pts.length - 1], label = L + ' characters' + (full <= years ? ', full after ' + duration(full * 365 * 86400) : ', ' + sig(Math.min(perDay * 365 * years / S, 1) * 100, 2) + '% used');
          if (last[0] > X1 - 10) ends.push([last[1] + 4, label, mine]);
          else d('text', { x: r1(last[0] + 8), y: r1(last[1] + (last[1] < Y1 + 6 ? 10 : 4)), 'class': mine ? 'ts tb' : 'ts' }, label);
        });
        ends.sort(function (a, b) { return a[0] - b[0]; });
        ends.forEach(function (e, i) {
          if (i && e[0] - ends[i - 1][0] < 14) e[0] = ends[i - 1][0] + 14;
          d('text', { x: X1 + 8, y: r1(e[0]), 'class': e[2] ? 'ts tb' : 'ts' }, e[1]);
        });
        d('circle', { cx: r1(x(years)), cy: r1(y(fill)), r: 5, 'class': fill >= 1 ? 'dot fill-fault' : 'dot' });
        d('text', { x: 10, y: 196, 'class': 'ts' }, 'Lines for one character fewer and one more. A full space has no code left for a new link.');
      }
      var text;
      if (fill >= 1) {
        text = compact(stored) + ' links do not fit in the ' + compact(space) + ' codes of ' + len + ' characters: they run out after ' + duration(space / perDay * 86400) + '. Use a longer code.';
      } else {
        text = 'After ' + sig(years, 3) + (years === 1 ? ' year, ' : ' years, ') + compact(stored) + ' links use ' + sig(fill * 100, 3) + '% of the ' + compact(space) + ' codes of ' + len +
          ' characters, so a random code takes ' + sig(attempts, 3) + ' attempts on average. Random codes are as likely as not to repeat once ' + compact(half) +
          ' have been drawn, ' + duration(half / perDay * 86400) + ' of creates, so every insert must check that its code is free.';
      }
      out(root, 'verdict', text);
    });
  });

  // ------------------------------------------------------------ distributed rate limiter: the counter store's size and its busiest shard
  $$('[data-widget="counters78"]').forEach(function (root) {
    var COMMAND_BYTES = 150; // a script call and its answer, each way, roughly
    bind(root, function () {
      var rate = val(root, 'rate'), keys = val(root, 'keys'), perKey = val(root, 'bytes');
      var cap = val(root, 'cap'), use = val(root, 'use') / 100, hot = val(root, 'hot') / 100;
      var names = ['commands', 'shards', 'memory', 'network', 'busiest'];
      if (!(rate >= 1 && rate <= 1e9) || !(keys >= 1 && keys <= 1e10) || !(perKey >= 10 && perKey <= 1e5) ||
          !(cap >= 100 && cap <= 1e8) || !(use > 0 && use <= 1) || !(hot >= 0 && hot <= 1)) {
        names.forEach(function (k) { out(root, k, 'n/a'); });
        noPaper(root);
        out(root, 'verdict', 'Enter 1 to a billion requests a second, up to 10 billion keys, 10 bytes to 100 KB a key, 100 to 100 million commands a shard, a target of 1 to 100% and a busiest key of 0 to 100%.');
        return;
      }
      var n = Math.max(1, Math.ceil(rate / (cap * use)));
      var busiest = rate * (hot + (1 - hot) / n), others = rate * (1 - hot) / n;
      out(root, 'commands', compact(rate) + ' /s');
      out(root, 'shards', n + (n === 1 ? ' shard' : ' shards') + ', each with a replica');
      out(root, 'memory', bytes(keys * perKey));
      out(root, 'network', bits(rate * COMMAND_BYTES * 8) + ' each way');
      out(root, 'busiest', sig(busiest / cap * 100, 3) + '% of one shard');
      var d = paper(root, 640, 180);
      if (d) {
        var shown = Math.min(n, 40), X0 = 104, X1 = 620, Y0 = 140, Y1 = 26, top = Math.max(1.2, busiest / cap * 1.1);
        var y = function (load) { return Y0 - Math.min(load / cap, top) / top * (Y0 - Y1); };
        var w = (X1 - X0) / shown;
        d('text', { x: 10, y: 14, 'class': 'ts' }, 'Commands on each shard, as a share of what one shard can run' + (n > shown ? ' (first 40 of ' + n + ')' : ''));
        [[1, '100%'], [use, sig(use * 100, 3) + '% target']].forEach(function (t) {
          d('line', { x1: X0, y1: r1(y(t[0] * cap)), x2: X1, y2: r1(y(t[0] * cap)), 'class': t[0] === 1 ? 'axis' : 'grid', style: t[0] === 1 ? 'stroke-dasharray:4 3' : '' });
          d('text', { x: X0 - 6, y: r1(y(t[0] * cap) + 4), 'class': 'ts end' }, t[1]);
        });
        for (var i = 0; i < shown; i++) {
          var load = i === 0 ? busiest : others, over = load > cap;
          d('rect', { x: r1(X0 + i * w + w * 0.15), y: r1(y(load)), width: r1(w * 0.7), height: r1(Y0 - y(load)), rx: 2, 'class': 'bar ' + (i === 0 ? (over ? 'fault' : '') : 'store') });
        }
        d('circle', { cx: r1(X0 + w / 2), cy: r1(y(busiest)) - 6, r: 4, 'class': busiest > cap ? 'dot fill-fault' : 'dot' });
        d('text', { x: X0, y: Y0 + 18, 'class': 'ts' }, 'The first bar is the shard that holds the busiest key; the others share the rest evenly.');
        d('text', { x: X0, y: Y0 + 34, 'class': 'ts' }, 'Planning figure for one shard: ' + compact(cap) + ' commands a second.');
      }
      var text = compact(rate) + ' requests a second need one script call each, so ' + n + (n === 1 ? ' shard runs' : ' shards run') + ' them at ' + sig(use * 100, 3) + '% of capacity, and ' +
        bytes(keys * perKey) + ' of counters fit easily in memory: the shards are for throughput, not space.';
      if (rate * hot > cap) text += ' The busiest key alone sends ' + compact(rate * hot) + ' commands a second, more than one shard can run, however many shards there are. Count it locally between syncs, or split its counter into parts that each hold a share of its limit.';
      else if (busiest > cap * use) text += ' The shard holding the busiest key runs at ' + sig(busiest / cap * 100, 3) + '%, above the target, because one key cannot be spread over shards.';
      out(root, 'verdict', text);
    });
  });

  // ------------------------------------------------------------ key-value store: nodes, the ring's unevenness, and rebuilding a node
  $$('[data-widget="ring79"]').forEach(function (root) {
    // The same hash and ring as the chapter's code (lld/ts79/ring.ts), so that the numbers match it.
    function position(name) {
      var h = 0x811c9dc5, i;
      for (i = 0; i < name.length; i++) { h ^= name.charCodeAt(i); h = Math.imul(h, 0x01000193); }
      h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
      return h >>> 0;
    }
    function ring(nodes, vnodes, copies) {
      var t = [], n, v, i, j, k;
      for (n = 0; n < nodes; n++) for (v = 0; v < vnodes; v++) t.push({ at: position('node-' + n + '#' + v), node: n });
      t.sort(function (a, b) { return a.at - b.at; });
      var share = new Array(nodes).fill(0), sources = {}, pairs = {}, FULL = 4294967296;
      for (i = 0; i < t.length; i++) {
        var owners = [];
        for (j = 0; j < t.length && owners.length < copies; j++) {
          var o = t[(i + j) % t.length].node;
          if (owners.indexOf(o) < 0) owners.push(o);
        }
        var arc = (t[i].at - (i === 0 ? t[t.length - 1].at - FULL : t[i - 1].at)) / FULL;
        owners.forEach(function (o) { share[o] += arc / copies; });
        if (owners.indexOf(0) >= 0) owners.forEach(function (o) { if (o !== 0) sources[o] = 1; });
        for (j = 0; j < owners.length; j++) for (k = j + 1; k < owners.length; k++) pairs[Math.min(owners[j], owners[k]) * nodes + Math.max(owners[j], owners[k])] = 1;
      }
      return { share: share, sources: Object.keys(sources).length, pairs: Object.keys(pairs).length / (nodes * (nodes - 1) / 2) };
    }
    bind(root, function () {
      var data = val(root, 'data'), copies = val(root, 'copies'), perNode = val(root, 'pernode');
      var tokens = val(root, 'tokens'), stream = val(root, 'stream'), ingest = val(root, 'ingest');
      var names = ['nodes', 'fullest', 'rebuild', 'pairs', 'join'];
      var nodes = Math.ceil(data * copies / perNode);
      if (!(data > 0 && data <= 1e5) || !(copies >= 1 && copies <= 7 && Math.round(copies) === copies) || !(perNode > 0 && perNode <= 1000) ||
          !(tokens >= 1 && tokens <= 512 && Math.round(tokens) === tokens) || !(stream > 0 && stream <= 1e5) || !(ingest > 0 && ingest <= 1e5) ||
          !(nodes > copies && nodes * tokens <= 100000)) {
        names.forEach(function (k) { out(root, k, 'n/a'); });
        noPaper(root);
        out(root, 'verdict', 'Enter up to 100,000 TB, 1 to 7 copies, up to 1,000 TB a node, 1 to 512 tokens and positive speeds, with more nodes than copies and at most 100,000 tokens in all.');
        return;
      }
      var r = ring(nodes, tokens, copies), stored = data * copies;
      var mean = 1 / nodes, max = Math.max.apply(null, r.share), mine = r.share[0] * stored;
      var rate = Math.min(r.sources * stream, ingest); // MB/s into the replacement
      var seconds = mine * 1e6 / rate;
      out(root, 'nodes', nodes + ' nodes, ' + sig(stored / nodes, 3) + ' TB each on average');
      out(root, 'fullest', sig(max * stored, 3) + ' TB, ' + sig(max / mean, 3) + ' times the average');
      out(root, 'rebuild', r.sources ? duration(seconds) + ', from ' + r.sources + (r.sources === 1 ? ' node' : ' nodes') : 'no other copy');
      out(root, 'pairs', sig(r.pairs * 100, 3) + '%');
      out(root, 'join', sig(stored / (nodes + 1), 3) + ' TB');
      var d = paper(root, 640, 170);
      if (d) {
        var sorted = r.share.slice().sort(function (a, b) { return b - a; });
        var X0 = 50, X1 = 600, Y0 = 130, Y1 = 22, top = Math.max(2, max / mean * 1.1);
        var y = function (rel) { return Y0 - rel / top * (Y0 - Y1); };
        var x = function (i) { return X0 + i / sorted.length * (X1 - X0); };
        d('text', { x: 10, y: 12, 'class': 'ts' }, 'Data on each node, largest first, as a multiple of the average');
        [0, 1, 2].forEach(function (v) { if (v <= top) { d('line', { x1: X0, y1: r1(y(v)), x2: X1, y2: r1(y(v)), 'class': v === 1 ? 'axis' : 'grid', style: v === 1 ? 'stroke-dasharray:4 3' : '' }); d('text', { x: X0 - 6, y: r1(y(v) + 4), 'class': 'ts end' }, v + '×'); } });
        var pts = [[X0, Y0]];
        sorted.forEach(function (s, i) { pts.push([x(i), y(s / mean)]); pts.push([x(i + 1), y(s / mean)]); });
        pts.push([X1, Y0]);
        d('path', { d: pathOf(pts) + 'Z', 'class': 'bar store' });
        d('circle', { cx: r1(x(0.5)), cy: r1(y(max / mean) - 7), r: 4, 'class': 'dot' });
        d('text', { x: r1(x(0.5) + 10), y: r1(y(max / mean) - 3), 'class': 'ts tb' }, 'fullest node: ' + sig(max / mean, 3) + '×');
        d('text', { x: X0, y: Y0 + 18, 'class': 'ts' }, nodes + ' nodes with ' + tokens + (tokens === 1 ? ' token' : ' tokens') + ' each, placed by hashing their names, ' + copies + (copies === 1 ? ' copy' : ' copies') + ' of every key.');
        d('text', { x: X0, y: Y0 + 34, 'class': 'ts' }, 'The dashed line is the average.');
      }
      var verdict = stored + ' TB in all needs ' + nodes + ' nodes of ' + perNode + ' TB on average, but the fullest holds ' + sig(max / mean, 3) +
        ' times the average, so disks must be sized for it or tokens placed with care. ';
      if (copies === 1) verdict += 'With one copy, a failed node takes its keys with it.';
      else verdict += 'A failed node is rebuilt from ' + r.sources + (r.sources === 1 ? ' node' : ' nodes') + ' in about ' + duration(seconds) + '. ' + sig(r.pairs * 100, 3) +
        '% of pairs of nodes hold a copy of some key together: two failures at once that hit such a pair leave those keys with ' + (copies - 2 === 1 ? 'one copy.' : (copies - 2) + ' copies.');
      out(root, 'verdict', verdict);
    });
  });

  // ------------------------------------------------------------ object storage: raw capacity, disk failures, and durability against repair time
  $$('[data-widget="durability80"]').forEach(function (root) {
    // The same model as the chapter's code (lld/ts80/durability.ts): pieces fail and are rebuilt independently,
    // and a stripe is lost when more than m are failed at once.
    function hoursToLoss(k, m, afr, repairHours) {
      var n = k + m, fail = -Math.log(1 - afr) / 8760, repair = 1 / repairHours, tau = 0, total = 0;
      for (var j = 0; j <= m; j++) { tau = (1 + j * repair * tau) / ((n - j) * fail); total += tau; }
      return total;
    }
    function loss(k, m, afr, h) { return -Math.expm1(-8760 / hoursToLoss(k, m, afr, h)); }
    bind(root, function () {
      var data = val(root, 'data'), k = val(root, 'k'), m = val(root, 'm'), disk = val(root, 'disk');
      var afr = val(root, 'afr') / 100, hours = val(root, 'repair');
      var names = ['raw', 'disks', 'failures', 'repairread', 'loss'];
      if (!(data > 0 && data <= 1e6) || !(k >= 1 && k <= 50 && Math.round(k) === k) || !(m >= 0 && m <= 20 && Math.round(m) === m) ||
          !(disk > 0 && disk <= 1000) || !(afr > 0 && afr < 1) || !(hours > 0 && hours <= 8760)) {
        names.forEach(function (x) { out(root, x, 'n/a'); });
        noPaper(root);
        out(root, 'verdict', 'Enter up to a million PB, 1 to 50 data pieces, 0 to 20 parity pieces, a disk of up to 1,000 TB, a failure rate between 0 and 100% and a repair time of up to a year.');
        return;
      }
      var raw = data * (k + m) / k, disks = Math.ceil(raw * 1000 / disk), perWeek = disks * afr / 52.18;
      var p = loss(k, m, afr, hours), nines = -Math.log10(p);
      out(root, 'raw', sig(raw, 3) + ' PB, ' + sig((k + m) / k, 3) + ' times the data');
      out(root, 'disks', disks.toLocaleString('en-US') + ' of ' + disk + ' TB');
      out(root, 'failures', sig(perWeek, 3) + ' a week');
      out(root, 'repairread', m === 0 ? 'nothing to rebuild from' : sig(k * disk, 3) + ' TB read across the cluster');
      out(root, 'loss', m === 0 ? sig(p * 100, 3) + '% a year' : '1 in ' + compact(1 / p) + ' a year, ' + sig(nines, 3) + ' nines');
      var d = paper(root, 640, 200);
      if (d) {
        var X0 = 60, X1 = 470, Y0 = 160, Y1 = 22, hs = [1, 2, 4, 8, 16, 24, 48, 96, 168, 336, 720];
        var lx = function (h) { return X0 + (Math.log(h) - Math.log(1)) / (Math.log(720) - Math.log(1)) * (X1 - X0); };
        var all = hs.map(function (h) { return [-Math.log10(loss(k, m, afr, h)), -Math.log10(loss(1, 2, afr, h))]; });
        var top = Math.max(20, Math.ceil(Math.max.apply(null, all.map(function (a) { return Math.max(a[0], a[1]); })) / 5) * 5);
        var ly = function (n) { return Y0 - Math.max(0, Math.min(n, top)) / top * (Y0 - Y1); };
        d('text', { x: 10, y: 12, 'class': 'ts' }, 'Nines of durability a year, against the time to rebuild a failed disk');
        for (var t = 0; t <= top; t += top > 30 ? 10 : 5) {
          d('line', { x1: X0, y1: r1(ly(t)), x2: X1, y2: r1(ly(t)), 'class': 'grid' });
          d('text', { x: X0 - 6, y: r1(ly(t) + 4), 'class': 'ts end' }, String(t));
        }
        d('line', { x1: X0, y1: r1(ly(11)), x2: X1, y2: r1(ly(11)), 'class': 'axis', style: 'stroke-dasharray:4 3' });
        d('text', { x: X1, y: r1(ly(11) - 4), 'class': 'ts end' }, 'eleven nines');
        [[1, '1 h'], [24, '1 day'], [168, '1 week'], [720, '30 days']].forEach(function (a) { d('text', { x: r1(lx(a[0])), y: Y0 + 16, 'class': 'ts mid' }, a[1]); });
        d('path', { d: pathOf(hs.map(function (h, i) { return [lx(h), ly(all[i][1])]; })), 'class': 'line', style: 'stroke:var(--ink-3);stroke-width:1.5' });
        d('path', { d: pathOf(hs.map(function (h, i) { return [lx(h), ly(all[i][0])]; })), 'class': 'line' });
        var endMine = all[all.length - 1][0], endCopies = all[all.length - 1][1], close = Math.abs(ly(endMine) - ly(endCopies)) < 14;
        d('text', { x: X1 + 8, y: r1(ly(endMine) + (close && endMine < endCopies ? 12 : 4)), 'class': 'ts tb' }, k + ' + ' + m);
        if (!(k === 1 && m === 2)) d('text', { x: X1 + 8, y: r1(ly(endCopies) + (close && endCopies <= endMine ? 12 : 4)), 'class': 'ts' }, '3 copies');
        var hh = Math.min(Math.max(hours, 1), 720);
        d('circle', { cx: r1(lx(hh)), cy: r1(ly(-Math.log10(loss(k, m, afr, hh)))), r: 5, 'class': 'dot' });
        d('text', { x: 10, y: 196, 'class': 'ts' }, 'Each piece on its own disk, disks failing independently at the rate given. Correlated failures are not in the model.');
      }
      var text = 'Storing ' + sig(data, 3) + ' PB as ' + k + ' + ' + m + ' takes ' + sig(raw, 3) + ' PB of disk, ' + disks.toLocaleString('en-US') + ' disks, of which about ' + sig(perWeek, 2) + ' fail each week. ';
      if (m === 0) text += 'With no parity, every disk failure loses the data on it.';
      else text += 'Rebuilding a failed disk reads ' + sig(k * disk, 3) + ' TB from the others, and with ' + sig(hours, 3) + (hours === 1 ? ' hour' : ' hours') + ' to rebuild, a given object is lost with a chance of ' +
        '1 in ' + compact(1 / p) + ' a year from independent disk failures alone' + (nines >= 11 ? ', beyond eleven nines.' : ', short of eleven nines.');
      out(root, 'verdict', text);
    });
  });

  // ------------------------------------------------------------ file sync: upload with whole files or only new chunks
  $$('[data-widget="syncload86"]').forEach(function (root) {
    bind(root, function () {
      var users = val(root, 'users'), saves = val(root, 'saves'), size = val(root, 'size'), edits = val(root, 'edits'), perEdit = val(root, 'perEdit');
      if (!(users > 0 && users <= 5000) || !(saves >= 0 && saves <= 1000) || !(size > 0 && size <= 10000) || !(edits >= 0 && edits <= 100) || !(perEdit >= 0 && perEdit <= 1e6)) {
        ['commits', 'whole', 'chunked', 'daily'].forEach(function (k) { out(root, k, 'n/a'); }); noPaper(root);
        out(root, 'verdict', 'Enter up to 5,000 million users, 0 to 1,000 saves, a file size above 0 and up to 10,000 MB, a share of 0 to 100% and an upload per edit of 0 or more.');
        return;
      }
      var commits = users * 1e6 * saves, e = edits / 100, bytesFile = size * 1e6;
      var newFiles = commits * (1 - e) * bytesFile, editWhole = commits * e * bytesFile, editChunks = commits * e * Math.min(bytesFile, perEdit * 1024);
      var whole = newFiles + editWhole, chunked = newFiles + editChunks, rate = function (b) { return bits(b * 8 / 86400); };
      var d = paper(root, 640, 128);
      if (d) {
        var most = Math.max(whole, 1), W = 380;
        [['Whole files', editWhole, whole], ['New chunks only', editChunks, chunked]].forEach(function (r, i) {
          var y = 14 + i * 40, wn = W * newFiles / most, we = W * r[1] / most;
          d('text', { x: 124, y: y + 15, 'class': 'ts end' }, r[0]);
          if (wn > 0) d('rect', { x: 132, y: y, width: r1(Math.max(wn, 1.5)), height: 22, rx: 3, 'class': 'bar' });
          if (we > 0) d('rect', { x: r1(132 + wn), y: y, width: r1(Math.max(we, 1.5)), height: 22, rx: 3, 'class': 'bar store' });
          d('text', { x: r1(140 + wn + we), y: y + 15, 'class': 'ts tb' }, rate(r[2]));
        });
        d('rect', { x: 132, y: 104, width: 14, height: 12, rx: 2, 'class': 'bar' });
        d('text', { x: 152, y: 114, 'class': 'ts' }, 'new files');
        d('rect', { x: 240, y: 104, width: 14, height: 12, rx: 2, 'class': 'bar store' });
        d('text', { x: 260, y: 114, 'class': 'ts' }, 'edits to existing files');
      }
      out(root, 'commits', compact(commits / 86400));
      out(root, 'whole', rate(whole));
      out(root, 'chunked', rate(chunked));
      out(root, 'daily', bytes(chunked));
      out(root, 'verdict', commits === 0 ? 'With no saves there is nothing to upload.'
        : 'Sending only new chunks cuts the upload from ' + rate(whole) + ' to ' + rate(chunked) + ' on average, ' + sig(100 * (1 - chunked / Math.max(whole, 1))) + '% less. ' +
          (newFiles > 0 ? sig(100 * newFiles / chunked) + '% of what remains is new files, which no chunking can avoid. ' : '') +
          'A year at this rate adds about ' + bytes(chunked * 365) + ' before erasure coding and before any deduplication across users.');
    });
  });

  // ------------------------------------------------------------ autocomplete: lookups at the peak and index memory
  $$('[data-widget="suggest87"]').forEach(function (root) {
    bind(root, function () {
      var searches = val(root, 'searches'), lookups = val(root, 'lookups'), cached = val(root, 'cached'), queries = val(root, 'queries'), perQuery = val(root, 'perQuery');
      if (!(searches > 0 && searches <= 1e5) || !(lookups >= 1 && lookups <= 50) || !(cached >= 0 && cached < 100) || !(queries > 0 && queries <= 1e5) || !(perQuery >= 10 && perQuery <= 1e4)) {
        ['peak', 'servers', 'index'].forEach(function (k) { out(root, k, 'n/a'); });
        out(root, 'verdict', 'Enter up to 100,000 million searches a day, 1 to 50 lookups each, a cache share below 100%, up to 100,000 million queries and 10 to 10,000 bytes per query.');
        return;
      }
      var peak = searches * 1e6 * lookups / 86400 * 3, servers = peak * (1 - cached / 100), index = queries * 1e6 * perQuery;
      out(root, 'peak', compact(peak));
      out(root, 'servers', compact(servers));
      out(root, 'index', bytes(index));
      out(root, 'verdict', 'At three times the average rate, ' + compact(peak) + ' lookups a second arrive and ' + compact(servers) + ' get past the edge cache. ' +
        (index <= 64e9 ? 'An index of ' + bytes(index) + ' fits in one server’s memory, so every server can hold a full copy and requests are spread across copies.'
          : index <= 512e9 ? 'An index of ' + bytes(index) + ' needs a large-memory server, or a split across a few by a hash of the prefix.'
          : 'An index of ' + bytes(index) + ' must be split across servers by a hash of the prefix, each part replicated, or reduced by keeping only queries searched by enough people.'));
    });
  });

  // ------------------------------------------------------------ web crawler: rates, concurrency and memory
  $$('[data-widget="crawl88"]').forEach(function (root) {
    bind(root, function () {
      var pages = val(root, 'pages'), size = val(root, 'size'), fetch = val(root, 'fetch'), delay = val(root, 'delay'), urls = val(root, 'urls');
      if (!(pages > 0 && pages <= 1000) || !(size >= 1 && size <= 1e5) || !(fetch > 0 && fetch <= 60) || !(delay >= 0 && delay <= 600) || !(urls > 0 && urls <= 1e4)) {
        ['rate', 'bandwidth', 'flight', 'sites', 'filter'].forEach(function (k) { out(root, k, 'n/a'); });
        out(root, 'verdict', 'Enter up to 1,000 billion pages, a page size of 1 KB or more, a fetch time above 0 and up to 60 s, a pause of 0 to 600 s and up to 10,000 billion URLs.');
        return;
      }
      var rate = pages * 1e9 / (30 * 86400), flight = rate * fetch, sites = rate * (fetch + delay), filter = urls * 1e9 * 9.585 / 8;
      out(root, 'rate', compact(rate));
      out(root, 'bandwidth', bits(rate * size * 1000 * 8));
      out(root, 'flight', compact(flight));
      out(root, 'sites', compact(sites));
      out(root, 'filter', bytes(filter));
      out(root, 'verdict', 'Crawling ' + compact(pages * 1e9) + ' pages in 30 days means ' + compact(rate) + ' pages a second and about ' + bytes(pages * 1e9 * size * 1000) + ' of pages a month. ' +
        (delay > 0 ? 'With ' + sig(fetch + delay) + ' s from the start of one request to a site to the start of the next, at least ' + compact(sites) + ' sites must be in progress at once, so the frontier must keep that many hosts ready. '
          : 'With no pause between requests a crawler could fetch from a few sites, and would overload them. ') +
        'Remembering ' + compact(urls * 1e9) + ' seen URLs at a 1% error rate takes ' + bytes(filter) + ' of memory.');
    });
  });

  // ------------------------------------------------------------ nearby friends: connections, updates and fan-out
  $$('[data-widget="nearby89"]').forEach(function (root) {
    bind(root, function () {
      var users = val(root, 'users'), online = val(root, 'online'), friends = val(root, 'friends'), interval = val(root, 'interval');
      if (!(users > 0 && users <= 5000) || !(online >= 0 && online <= 100) || !(friends >= 0 && friends <= 5000) || !(interval >= 1 && interval <= 3600)) {
        ['connections', 'updates', 'deliveries', 'cache'].forEach(function (k) { out(root, k, 'n/a'); });
        out(root, 'verdict', 'Enter up to 5,000 million users, 0 to 100% online, 0 to 5,000 friends and 1 to 3,600 seconds between updates.');
        return;
      }
      var conns = users * 1e6 * online / 100, updates = conns / interval, perUpdate = friends * online / 100, deliveries = updates * perUpdate;
      out(root, 'connections', compact(conns));
      out(root, 'updates', compact(updates));
      out(root, 'deliveries', compact(deliveries));
      out(root, 'cache', bytes(conns * 100));
      out(root, 'verdict', conns < 1 ? 'Nobody is online, so nothing moves.'
        : compact(conns) + ' phones online send ' + compact(updates) + ' updates a second. Each goes to about ' + sig(perUpdate) + ' online friend' + (sig(perUpdate) === 1 ? '' : 's') + ', so the publish and subscribe tier carries ' + compact(deliveries) + ' deliveries a second. ' +
          'Halving how often phones send halves both numbers; halving the friends who see each update halves only the second.');
    });
  });

  // ------------------------------------------------------------ ride hailing: driver location reports
  $$('[data-widget="dispatch90"]').forEach(function (root) {
    bind(root, function () {
      var drivers = val(root, 'drivers'), interval = val(root, 'interval'), size = val(root, 'bytes'), speed = val(root, 'speed'), cell = val(root, 'cell');
      if (!(drivers >= 1 && drivers <= 1e5) || !(interval >= 1 && interval <= 120) || !(size >= 10 && size <= 1e4) || !(speed >= 1 && speed <= 150) || !(cell >= 10 && cell <= 1e4)) {
        ['reports', 'ingest', 'share', 'moves', 'memory'].forEach(function (k) { out(root, k, 'n/a'); });
        out(root, 'verdict', 'Enter 1 to 100,000 thousand drivers, 1 to 120 s between reports, 10 to 10,000 bytes, 1 to 150 km/h and cells of 10 to 10,000 m.');
        return;
      }
      var reports = drivers * 1000 / interval, moved = speed / 3.6 * interval, share = Math.min(1, 4 / Math.PI * moved / cell);
      out(root, 'reports', compact(reports));
      out(root, 'ingest', bits(reports * size * 8));
      out(root, 'share', sig(share * 100) + '%');
      out(root, 'moves', compact(reports * share));
      out(root, 'memory', bytes(drivers * 1000 * size));
      out(root, 'verdict', 'Each driver moves about ' + sig(moved) + ' m between reports. ' +
        (share >= 1 ? 'That is more than a cell, so nearly every report moves the driver to another cell: larger cells would make the index cheaper to keep current.'
          : 'About ' + sig(share * 100) + '% of reports move a driver into another cell; the other ' + sig(100 - share * 100) + '% only overwrite a position in memory. ') +
        (share < 1 ? 'Positions for all drivers take ' + bytes(drivers * 1000 * size) + ', small enough for memory.' : ''));
    });
  });

  // ------------------------------------------------------------ news feed: traffic, fan-out work and the feed cache
  $$('[data-widget="feed81"]').forEach(function (root) {
    bind(root, function () {
      var users = val(root, 'users'), opens = val(root, 'opens'), posting = val(root, 'posting');
      var follows = val(root, 'follows'), kept = val(root, 'kept'), entry = val(root, 'entry'), peak = val(root, 'peak');
      var keys = ['posts', 'reads', 'ratio', 'push', 'pull', 'memory'];
      if (!(users >= 1 && users <= 3e9) || !(opens >= 0 && opens <= 1000) || !(posting > 0 && posting <= 100) ||
          !(follows >= 1 && follows <= 1e5) || !(kept >= 1 && kept <= 1e5) || !(entry >= 1 && entry <= 1e4) || !(peak >= 1 && peak <= 20)) {
        keys.forEach(function (k) { out(root, k, 'n/a'); });
        noPaper(root);
        out(root, 'verdict', 'Enter 1 to 3 billion users, 0 to 1,000 feed opens and more than 0 and up to 100 posts per user a day, 1 to 100,000 follows, 1 to 100,000 ids kept, 1 byte to 10 KB an entry and a peak factor of 1 to 20.');
        return;
      }
      var P = users * posting / 86400 * peak, R = users * opens / 86400 * peak; // at peak, per second
      // Fan-out on write: each post is written into the list of every follower; each feed read reads one list.
      // Fan-out on read: each post is written once; each feed read reads the timeline of every account followed.
      var pushW = P * follows, pushR = R, pullW = P, pullR = R * follows;
      var push = pushW + pushR, pull = pullW + pullR, ratio = opens / posting;
      var mem = users * kept * entry;
      out(root, 'posts', compact(P / peak) + ' /s, peak ' + compact(P) + ' /s');
      out(root, 'reads', compact(R / peak) + ' /s, peak ' + compact(R) + ' /s');
      out(root, 'ratio', String(sig(ratio, 3)));
      out(root, 'push', compact(pushW) + ' writes + ' + compact(pushR) + ' reads');
      out(root, 'pull', compact(pullW) + ' writes + ' + compact(pullR) + ' reads');
      out(root, 'memory', bytes(mem) + ', ' + bytes(3 * mem) + ' in 3 copies');
      var d = paper(root, 640, 150);
      if (d) {
        var X0 = 128, W = 400, M = Math.max(push, pull);
        var x = function (v) { return X0 + W * v / M; };
        d('text', { x: 10, y: 16, 'class': 'ts' }, 'Operations a second at peak');
        [['Fan-out on write', pushW, pushR, 36], ['Fan-out on read', pullW, pullR, 82]].forEach(function (row) {
          var y = row[3], tot = row[1] + row[2];
          d('text', { x: X0 - 10, y: y + 17, 'class': 'ts end' }, row[0]);
          d('rect', { x: X0, y: y, width: r1(Math.max(W * row[1] / M, 0.5)), height: 24, rx: 2, 'class': 'bar async' });
          d('rect', { x: r1(x(row[1])), y: y, width: r1(Math.max(W * row[2] / M, 0.5)), height: 24, rx: 2, 'class': 'bar' });
          d('text', { x: r1(x(tot) + 8), y: y + 17, 'class': 'ts tb' }, compact(tot) + ' /s');
        });
        d('text', { x: 10, y: 138, 'class': 'ts' }, 'Purple: feed entries or posts written. Blue: lists read. One copy, before any cache.');
      }
      var cheaper = push <= pull, times = cheaper ? pull / push : push / pull;
      var text = 'Feeds are opened ' + (sig(ratio, 3) === 1 ? 'once' : sig(ratio, 3) + ' times') + ' for every post written, so at peak fan-out on write does ' + compact(push) +
        ' operations a second and fan-out on read ' + compact(pull) + '. ' + (sig(times, 3) === 1 ? 'The two do about the same work.' : (cheaper ? 'Fan-out on read' : 'Fan-out on write') + ' does ' + sig(times, 3) +
        ' times as much.') + ' The lists of ' + kept.toLocaleString('en-US') + ' ids need ' + bytes(mem) + ' of memory, ' + bytes(3 * mem) + ' in three copies.';
      out(root, 'verdict', text);
    });
  });

  // ------------------------------------------------------------ chat: messages, deliveries, receipts, connections and storage
  $$('[data-widget="chat82"]').forEach(function (root) {
    bind(root, function () {
      var users = val(root, 'users'), perUser = val(root, 'messages'), fan = val(root, 'devices'), size = val(root, 'bytes');
      var share = val(root, 'connected'), perGateway = val(root, 'gateway'), ping = val(root, 'ping'), peak = val(root, 'peak');
      var keys = ['messages', 'deliveries', 'receipts', 'connections', 'pings', 'storage'];
      if (!(users >= 1 && users <= 1e10) || !(perUser >= 0 && perUser <= 10000) || !(fan >= 1 && fan <= 10000) || !(size >= 1 && size <= 1e6) ||
          !(share > 0 && share <= 100) || !(perGateway >= 1 && perGateway <= 1e7) || !(ping >= 1 && ping <= 3600) || !(peak >= 1 && peak <= 20)) {
        keys.forEach(function (k) { out(root, k, 'n/a'); });
        noPaper(root);
        out(root, 'verdict', 'Enter 1 to 10 billion users, up to 10,000 messages each a day, 1 to 10,000 devices per message, 1 byte to 1 MB a message, more than 0 and up to 100% connected, 1 to 10 million connections a gateway, a ping every 1 to 3,600 seconds and a peak factor of 1 to 20.');
        return;
      }
      var perDay = users * perUser, m = perDay / 86400 * peak, d = m * fan, r = 2 * d;
      var conns = users * share / 100, gateways = Math.ceil(conns / perGateway), p = conns / ping;
      var year = perDay * 365 * size;
      out(root, 'messages', compact(perDay / 86400) + ' /s, peak ' + compact(m) + ' /s');
      out(root, 'deliveries', compact(d) + ' /s at peak');
      out(root, 'receipts', compact(r) + ' /s at peak');
      out(root, 'connections', compact(conns) + ' on ' + gateways.toLocaleString('en-US') + (gateways === 1 ? ' gateway' : ' gateways'));
      out(root, 'pings', compact(p) + ' /s');
      out(root, 'storage', bytes(perDay * size) + ' a day, ' + bytes(3 * year) + ' a year in 3 copies');
      var g = paper(root, 640, 170);
      if (g) {
        var X0 = 150, W = 380, rows = [['Messages sent', m, 'bar'], ['Deliveries', d, 'bar'], ['Receipts, one each', r, 'bar fault'], ['Heartbeats', p, 'bar async']];
        var M = Math.max(m, d, r, p);
        g('text', { x: 10, y: 16, 'class': 'ts' }, 'Events a second at peak');
        rows.forEach(function (row, i) {
          var y = 28 + i * 30, w = Math.max(W * row[1] / M, 0.5);
          g('text', { x: X0 - 10, y: y + 15, 'class': 'ts end' }, row[0]);
          g('rect', { x: X0, y: y, width: r1(w), height: 20, rx: 2, 'class': row[2] });
          g('text', { x: r1(X0 + w + 8), y: y + 15, 'class': 'ts tb' }, compact(row[1]) + ' /s');
        });
        g('text', { x: 10, y: 160, 'class': 'ts' }, 'Heartbeats depend on connections, not on messages: one per connection per interval.');
      }
      var loads = [['the messages themselves', m], ['deliveries', d], ['receipts', r], ['heartbeats', p]].sort(function (a, b) { return b[1] - a[1]; });
      var biggest = loads[0][0] + (loads[0][0] === 'the messages themselves' ? '' : ', not the messages');
      out(root, 'verdict', 'At peak ' + compact(m) + ' messages a second become ' + compact(d) + ' deliveries and, with one receipt of each kind per delivery, ' + compact(r) +
        ' receipts. ' + compact(conns) + ' connections need ' + gateways.toLocaleString('en-US') + (gateways === 1 ? ' gateway' : ' gateways') + ' and send ' + compact(p) +
        ' heartbeats a second, so the largest load is ' + biggest + '. A year of messages is ' + bytes(3 * year) + ' in three copies.');
    });
  });

  // ------------------------------------------------------------ notifications: volume by channel, cost, dedup memory, campaign time
  $$('[data-widget="notify83"]').forEach(function (root) {
    bind(root, function () {
      var users = val(root, 'users'), each = val(root, 'each'), push = val(root, 'push'), email = val(root, 'email'), sms = val(root, 'sms');
      var peak = val(root, 'peak'), price = val(root, 'price'), campaign = val(root, 'campaign'), rate = val(root, 'rate');
      var keys = ['total', 'push', 'email', 'sms', 'cost', 'keys', 'campaign'];
      if (!(users >= 1 && users <= 1e10) || !(each >= 0 && each <= 1000) || !(push >= 0 && email >= 0 && sms >= 0 && push + email + sms <= 100) ||
          !(peak >= 1 && peak <= 100) || !(price >= 0 && price <= 10) || !(campaign >= 0 && campaign <= 1e10) || !(rate >= 1 && rate <= 1e8)) {
        keys.forEach(function (k) { out(root, k, 'n/a'); });
        noPaper(root);
        out(root, 'verdict', 'Enter 1 to 10 billion users, up to 1,000 notifications each a day, channel shares that add up to 100% or less, a peak factor of 1 to 100, an SMS price up to $10, a campaign of up to 10 billion and a send rate of at least 1 a second.');
        return;
      }
      var perDay = users * each, avg = perDay / 86400, top = avg * peak, inApp = 100 - push - email - sms;
      var smsDay = perDay * sms / 100, cost = smsDay * price, keyBytes = perDay * 100, minutes = campaign / rate / 60;
      out(root, 'total', compact(avg) + ' /s, peak ' + compact(top) + ' /s');
      out(root, 'push', compact(top * push / 100) + ' /s at peak');
      out(root, 'email', compact(top * email / 100) + ' /s at peak');
      out(root, 'sms', compact(top * sms / 100) + ' /s at peak, ' + compact(smsDay) + ' a day');
      out(root, 'cost', '$' + compact(cost) + ' a day');
      out(root, 'keys', bytes(keyBytes) + ' for a day of keys');
      out(root, 'campaign', duration(campaign / rate));
      var g = paper(root, 640, 160);
      if (g) {
        var X0 = 110, W = 400, rows = [['Push', push, 'bar'], ['Email', email, 'bar store'], ['SMS', sms, 'bar fault'], ['In-app only', inApp, 'bar mute']];
        g('text', { x: 10, y: 16, 'class': 'ts' }, 'Notifications a day by channel, and what SMS costs');
        rows.forEach(function (row, i) {
          var y = 28 + i * 28, n = perDay * row[1] / 100, w = Math.max(W * row[1] / 100, 0.5);
          g('text', { x: X0 - 10, y: y + 14, 'class': 'ts end' }, row[0]);
          g('rect', { x: X0, y: y, width: r1(w), height: 18, rx: 2, 'class': row[2] });
          g('text', { x: r1(X0 + w + 8), y: y + 14, 'class': 'ts tb' }, compact(n) + (row[0] === 'SMS' ? ', $' + compact(cost) : ''));
        });
        g('text', { x: 10, y: 150, 'class': 'ts' }, 'Bars are shares of all notifications; the SMS price is an assumption to replace with your own.');
      }
      var share = sig(sms, 2) + '% of notifications';
      out(root, 'verdict', compact(perDay) + ' notifications a day is ' + compact(avg) + ' a second, ' + compact(top) + ' at peak. SMS, at ' + share +
        (cost > 0 ? ', costs $' + compact(cost) + ' a day' : ', costs nothing at this price') + ', so it is kept for what cannot wait or fail. A campaign of ' + compact(campaign) +
        ' at ' + compact(rate) + ' a second takes ' + duration(campaign / rate) + (minutes > 60 ? ', so it is spread over hours and sent in the background.' : '.'));
    });
  });

  // ------------------------------------------------------------ email: traffic, storage and inbound bandwidth
  $$('[data-widget="mail84"]').forEach(function (root) {
    bind(root, function () {
      var users = val(root, 'users'), received = val(root, 'received'), kept = val(root, 'kept'), sent = val(root, 'sent');
      var size = val(root, 'size'), meta = val(root, 'meta'), overhead = val(root, 'overhead'), peak = val(root, 'peak');
      var keys = ['inbound', 'outbound', 'daily', 'yearly', 'bandwidth'];
      if (!(users >= 1 && users <= 1e10) || !(received >= 0 && received <= 10000) || !(kept >= 0 && kept <= 100) || !(sent >= 0 && sent <= 10000) ||
          !(size > 0 && size <= 1e5) || !(meta >= 0 && meta <= 1e6) || !(overhead >= 1 && overhead <= 10) || !(peak >= 1 && peak <= 20)) {
        keys.forEach(function (k) { out(root, k, 'n/a'); });
        out(root, 'verdict', 'Enter 1 to 10 billion users, up to 10,000 messages received and sent each a day, 0 to 100% kept, more than 0 and up to 100,000 KB a message, up to 1 MB of metadata, a storage overhead of 1 to 10 and a peak factor of 1 to 20.');
        return;
      }
      var inDay = users * received, outDay = users * sent, keptDay = inDay * kept / 100 + outDay;   // sent mail is kept too
      var blobs = keptDay * size * 1000, records = keptDay * meta, day = blobs + records, year = day * 365 * overhead;
      var bw = inDay / 86400 * peak * size * 1000 * 8;
      out(root, 'inbound', compact(inDay / 86400) + ' /s, peak ' + compact(inDay / 86400 * peak) + ' /s');
      out(root, 'outbound', compact(outDay / 86400) + ' /s, peak ' + compact(outDay / 86400 * peak) + ' /s');
      out(root, 'daily', bytes(blobs) + ' of messages, ' + bytes(records) + ' of records');
      out(root, 'yearly', bytes(year));
      out(root, 'bandwidth', bits(bw) + ' at peak');
      var perUser = users > 0 ? year / users : 0;
      out(root, 'verdict', 'Mailboxes grow by ' + bytes(day) + ' a day, ' + bytes(year) + ' a year once stored with an overhead of ' + sig(overhead, 3) + ', about ' + bytes(perUser) +
        ' per user each year. Records are ' + sig(records / day * 100, 2) + '% of the bytes but are read on every list and search, so they live on fast storage and the messages in a blob store.');
    });
  });

  // ------------------------------------------------------------ video streaming: delivery, uploads, storage and encoding
  $$('[data-widget="stream85"]').forEach(function (root) {
    bind(root, function () {
      var viewers = val(root, 'viewers'), minutes = val(root, 'minutes'), mbps = val(root, 'mbps'), peak = val(root, 'peak');
      var uploads = val(root, 'uploads'), length = val(root, 'length'), source = val(root, 'source'), ladder = val(root, 'ladder');
      var overhead = val(root, 'overhead'), cost = val(root, 'cost'), hit = val(root, 'hit');
      var keys = ['watching', 'delivery', 'origin', 'uploads', 'stored', 'encoders'];
      if (!(viewers >= 0 && viewers <= 1e10) || !(minutes >= 0 && minutes <= 1440) || !(mbps > 0 && mbps <= 1000) || !(peak >= 1 && peak <= 20) ||
          !(uploads >= 0 && uploads <= 1e9) || !(length > 0 && length <= 1440) || !(source > 0 && source <= 1000) || !(ladder >= 0 && ladder <= 10000) ||
          !(overhead >= 1 && overhead <= 10) || !(cost >= 0 && cost <= 10000) || !(hit >= 0 && hit <= 100)) {
        keys.forEach(function (k) { out(root, k, 'n/a'); });
        noPaper(root);
        out(root, 'verdict', 'Enter up to 10 billion viewers watching up to 1,440 minutes a day at more than 0 and up to 1,000 Mbit/s, a peak factor of 1 to 20, up to a billion uploads a day, each more than 0 and up to 1,440 minutes long at more than 0 and up to 1,000 Mbit/s, all rungs together up to 10,000 Mbit/s, a storage overhead of 1 to 10, up to 10,000 core-seconds of encoding per second of video, and a hit ratio of 0 to 100%.');
        return;
      }
      var watchMin = viewers * minutes, streams = watchMin / 1440 * peak, peakBits = streams * mbps * 1e6;
      var outDay = watchMin * 60 * mbps * 1e6 / 8, upSec = uploads * length * 60, inDay = upSec * source * 1e6 / 8;
      var storedDay = upSec * (source + ladder) * 1e6 / 8 * overhead, miss = 1 - hit / 100;
      var cores = upSec * cost / 86400;
      out(root, 'watching', compact(streams) + ' at peak, ' + compact(watchMin / 60) + ' hours a day');
      out(root, 'delivery', bits(peakBits) + ' at peak, ' + bytes(outDay) + ' a day');
      out(root, 'origin', bits(peakBits * miss) + ' at peak');
      out(root, 'uploads', sig(upSec / 3600 / 1440, 3) + ' hours of video a minute, ' + bytes(inDay) + ' a day');
      out(root, 'stored', bytes(storedDay) + ' a day, ' + bytes(storedDay * 365) + ' a year');
      out(root, 'encoders', compact(cores) + (cores === 1 ? ' core' : ' cores') + ' busy all day');
      var g = paper(root, 640, 170);
      if (g) {
        var rows = [['Uploaded', inDay, 'bar mute'], ['Stored, all rungs', storedDay, 'bar store'], ['Delivered to viewers', outDay, 'bar'], ['Sent by the origin', outDay * miss, 'bar']];
        var pos = rows.map(function (r) { return r[1]; }).filter(function (v) { return v > 0; });
        g('text', { x: 10, y: 16, 'class': 'ts' }, 'Bytes in one day, on a log scale: each gridline is ten times the one before');
        if (pos.length) {
          var lo = Math.floor(Math.log10(Math.min.apply(null, pos))), hi = Math.ceil(Math.log10(Math.max.apply(null, pos)));
          if (hi <= lo) hi = lo + 1;
          var X0 = 160, W = 340, at = function (v) { return X0 + W * (Math.log10(v) - lo) / (hi - lo); };
          var step = Math.max(1, Math.ceil((hi - lo) / 6));
          for (var d = lo; d <= hi; d += step) {
            g('line', { x1: r1(at(Math.pow(10, d))), y1: 26, x2: r1(at(Math.pow(10, d))), y2: 140, 'class': 'grid' });
            g('text', { x: r1(at(Math.pow(10, d))), y: 156, 'class': 'ts mid' }, bytes(Math.pow(10, d)));
          }
          rows.forEach(function (row, i) {
            var y = 32 + i * 27, v = row[1];
            g('text', { x: X0 - 10, y: y + 13, 'class': 'ts end' }, row[0]);
            if (v > 0) g('rect', { x: X0, y: y, width: r1(Math.max(at(v) - X0, 1)), height: 17, rx: 2, 'class': row[2] });
            g('text', { x: r1((v > 0 ? Math.max(at(v), X0 + 1) : X0) + 8), y: y + 13, 'class': 'ts tb' }, v > 0 ? bytes(v) : '0');
          });
        }
      }
      var ratio = inDay > 0 ? 'Viewers receive ' + compact(outDay / inDay) + ' bytes for every byte uploaded, so delivery, not storage, is the bulk of the cost. '
        : 'Nothing is uploaded, so the catalog is not growing. ';
      out(root, 'verdict', 'Streams at once in the busiest hour: ' + compact(streams) + ', using ' + bits(peakBits) + '. ' + ratio +
        'With ' + sig(hit, 3) + '% of the bytes served by the CDN, the origin still sends ' + bits(peakBits * miss) + ' at peak. Encoding uploads as they arrive keeps ' +
        compact(cores) + (cores === 1 ? ' core' : ' cores') + ' busy, and storage grows by ' + bytes(storedDay * 365) + ' a year.');
    });
  });

  // ------------------------------------------------------------ maps: directions, positions and tile storage
  $$('[data-widget="maps91"]').forEach(function (root) {
    bind(root, function () {
      var users = val(root, 'users'), routes = val(root, 'routes'), cars = val(root, 'cars'), every = val(root, 'every'),
        zoom = Math.round(val(root, 'zoom')), kb = val(root, 'kb');
      if (!(users >= 0.1 && users <= 5000) || !(routes >= 0 && routes <= 50) || !(cars >= 0 && cars <= 500) ||
          !(every >= 1 && every <= 600) || !(zoom >= 0 && zoom <= 22) || !(kb >= 0.1 && kb <= 1000)) {
        ['routes', 'uploads', 'ingest', 'tiles', 'storage'].forEach(function (k) { out(root, k, 'n/a'); });
        noPaper(root);
        out(root, 'verdict', 'Enter values within the ranges of the sliders.');
        return;
      }
      var peak = users * 1e6 * routes / 86400 * 3;            // a peak of three times the average
      var fixes = cars * 1e6, uploads = fixes / every, ingest = fixes * 40;   // one fix a second, 40 bytes each
      var all = (Math.pow(4, zoom + 1) - 1) / 3, stored = all * 0.3, total = stored * kb * 1000;   // 30% of tiles show anything
      // one row per zoom level, the shallow levels added together when there are many
      var rows = [], first = Math.max(0, zoom - 9);
      if (first > 0) rows.push(['zoom 0 to ' + (first - 1), (Math.pow(4, first) - 1) / 3 / all]);
      for (var z = first; z <= zoom; z++) rows.push(['zoom ' + z, Math.pow(4, z) / all]);
      var h = rows.length * 17 + 44;
      var d = paper(root, 640, h);
      if (d) {
        d('text', { x: 10, y: 14, 'class': 'ts' }, 'Share of all stored tiles at each zoom level');
        rows.forEach(function (row, i) {
          var y = 24 + i * 17, w = Math.max(1, 440 * row[1]), last = i === rows.length - 1;
          d('text', { x: 92, y: y + 12, 'class': 'ts end' }, row[0]);
          d('rect', { x: 100, y: y + 2, width: r1(w), height: 12, rx: 2, 'class': last ? 'bar dot' : 'bar' });
          if (i === 0 || i >= rows.length - 4) d('text', { x: r1(108 + w), y: y + 12, 'class': last ? 'ts tb' : 'ts' }, (row[1] < 0.0001 ? 'under 0.01' : String(sig(row[1] * 100))) + '%');
        });
        d('text', { x: 10, y: h - 8, 'class': 'ts' }, 'Each level holds four times as many tiles as the one above it.');
      }
      out(root, 'routes', compact(peak) + ' a second');
      out(root, 'uploads', compact(uploads));
      out(root, 'ingest', bytes(ingest) + ' a second');
      out(root, 'tiles', compact(stored));
      out(root, 'storage', bytes(total));
      var deepest = Math.pow(4, zoom) / all;
      out(root, 'verdict', (peak > 0 ? 'At the peak, ' + compact(peak) + ' route searches a second, each a few milliseconds of work on a preprocessed graph. ' : 'No routes are asked for. ') +
        (cars > 0 ? compact(fixes) + ' positions a second arrive in ' + compact(uploads) + ' uploads, ' + bytes(ingest) + ' a second for the stream. ' : 'No cars are navigating, so there is no stream of positions. ') +
        'Tiles to zoom ' + zoom + ' come to ' + compact(stored) + ' with content and ' + bytes(total) + (zoom > 0 ? ', and the deepest level alone is ' + sig(deepest * 100) + '% of them' : '') + ': ' +
        (total > 1e13 ? 'too much to make in advance, so tiles this deep are rendered when first asked for and then cached.' : 'small enough to build in advance as one set of files.'));
    });
  });

  // ------------------------------------------------------------ leaderboard: writes, reads and memory of one board
  $$('[data-widget="board92"]').forEach(function (root) {
    var BYTES = 109;   // per member, measured on Redis 7.0 with a million members (lld/ts92/redis.ts)
    bind(root, function () {
      var players = val(root, 'players'), daily = val(root, 'daily'), matches = val(root, 'matches'), views = val(root, 'views'), peak = val(root, 'peak');
      if (!(players >= 0.01 && players <= 5000) || !(daily >= 0.01 && daily <= 5000) || !(matches >= 0 && matches <= 500) ||
          !(views >= 0 && views <= 500) || !(peak >= 1 && peak <= 50)) {
        ['writes', 'reads', 'memory'].forEach(function (k) { out(root, k, 'n/a'); });
        out(root, 'verdict', 'Enter values within the ranges of the sliders.');
        return;
      }
      var writes = daily * 1e6 * matches / 86400 * peak, reads = daily * 1e6 * views / 86400 * peak * 3, memory = players * 1e6 * BYTES;
      out(root, 'writes', compact(writes) + ' a second');
      out(root, 'reads', compact(reads) + ' a second');
      out(root, 'memory', bytes(memory));
      var fits = memory <= 25e9, busy = writes + reads > 100000;
      out(root, 'verdict', 'A board of ' + compact(players * 1e6) + ' players takes about ' + bytes(memory) + ' at ' + BYTES + ' bytes each. ' +
        (fits ? 'That fits one in-memory node with a replica' : 'That is more than one ordinary in-memory node should hold, so split it by hash, or keep exact ranks only for the top players and percentiles for the rest') +
        (busy ? ', and ' + compact(writes + reads) + ' commands a second at the peak is enough to spread over several nodes or replicas.' :
          (fits ? ', and ' + compact(writes + reads) + ' commands a second at the peak is light work for it.' : '; the ' + compact(writes + reads) + ' commands a second at the peak are not the problem.')));
    });
  });

  // ------------------------------------------------------------ a big sale through a waiting room
  $$('[data-widget="onsale93"]').forEach(function (root) {
    // 30% wait at the opening, 50% arrive evenly over the first minute, 20% later (mean 3 minutes after)
    function arrived(people, t) {
      if (t < 0) return 0;
      var a = 0.3 * people + 0.5 * people * Math.min(t, 60) / 60;
      if (t > 60) a += 0.2 * people * (1 - Math.exp(-(t - 60) / 180));
      return a;
    }
    bind(root, function () {
      var tickets = Math.round(val(root, 'tickets')), people = val(root, 'people') * 1000, capacity = val(root, 'capacity'), share = val(root, 'share');
      if (!(tickets >= 1 && tickets <= 1e6) || !(people >= 100 && people <= 1e7) || !(capacity >= 1 && capacity <= 1e5) || !(share >= 1 && share <= 100)) {
        ['rate', 'lasts', 'line', 'over'].forEach(function (k) { out(root, k, 'n/a'); });
        noPaper(root);
        out(root, 'verdict', 'Enter values within the ranges of the sliders.');
        return;
      }
      var rate = capacity * share / 100;
      // step through time: admit at the rate, or as fast as people arrive, until the tickets are gone
      var admitted = 0, t = 0, dt = 0.1, end = Infinity, longest = 0, pts = [];
      for (t = 0; t <= 7200; t += dt) {
        var a = arrived(people, t);
        admitted = Math.min(a, admitted + (t > 0 ? rate * dt : 0), tickets);
        var waiting = end < Infinity ? 0 : a - admitted;
        if (waiting > longest) longest = waiting;
        if (end === Infinity && admitted >= tickets) end = t;
        pts.push([t, waiting, tickets - admitted]);
        if (end < Infinity && t > end * 1.4 + 20) break;
        if (end === Infinity && admitted >= arrived(people, 1e9) - 0.5 && t > 600) break;
      }
      var soldOut = end < Infinity;
      var span = Math.max(60, soldOut ? end * 1.4 + 20 : t);
      var d = paper(root, 640, 230);
      if (d) {
        var L = 64, R = 500, T = 16, B = 190, top = Math.max(longest, tickets) * 1.08;
        var X = function (s) { return L + (R - L) * Math.min(s, span) / span; }, Y = function (v) { return B - (B - T) * v / top; };
        [0, 0.5, 1].forEach(function (f) {
          d('line', { x1: L, y1: r1(Y(top * f / 1.08)), x2: R, y2: r1(Y(top * f / 1.08)), 'class': 'grid' });
          d('text', { x: L - 8, y: r1(Y(top * f / 1.08) + 4), 'class': 'ts end' }, compact(top * f / 1.08));
        });
        [0, 0.25, 0.5, 0.75, 1].forEach(function (f) { d('text', { x: r1(X(span * f)), y: B + 18, 'class': 'ts mid' }, Math.round(span * f) + ' s'); });
        var line = pts.filter(function (p) { return p[0] <= span; });
        d('path', { d: pathOf(line.map(function (p) { return [X(p[0]), Y(p[1])]; })), 'class': 'line', style: 'stroke:var(--async)' });
        d('path', { d: pathOf(line.map(function (p) { return [X(p[0]), Y(p[2])]; })), 'class': 'line', style: 'stroke:var(--store)' });
        var lastP = line[line.length - 1];
        d('text', { x: R + 8, y: r1(Y(lastP[2]) + 4), 'class': 'ts' }, 'tickets left');
        var peakAt = line.reduce(function (m, p) { return p[1] > m[1] ? p : m; }, [0, 0]);
        d('text', { x: r1(X(peakAt[0]) + 6), y: r1(Y(peakAt[1]) - 6), 'class': 'ts tb' }, 'people waiting: ' + compact(peakAt[1]));
        if (soldOut) {
          d('line', { x1: r1(X(end)), y1: T, x2: r1(X(end)), y2: B, 'class': 'axis', style: 'stroke-dasharray:4 3' });
          d('circle', { cx: r1(X(end)), cy: r1(Y(0)), r: 4, 'class': 'dot' });
          d('text', { x: r1(X(end) + 6), y: T + 12, 'class': 'ts' }, 'sold out: the rest are told');
        }
        d('text', { x: 10, y: 222, 'class': 'ts' }, 'Seconds after the opening.');
      }
      var firstMinute = 0.8 * people / 60;
      out(root, 'rate', compact(rate));
      var secs = function (x) { return x < 600 ? Math.round(x) + ' s' : duration(x); };
      out(root, 'lasts', soldOut ? secs(end) : 'never sold out');
      out(root, 'line', compact(longest));
      out(root, 'over', r1(firstMinute / capacity) + '×');
      out(root, 'verdict', 'Admitting ' + compact(rate) + ' a second, ' + (soldOut ? 'the ' + compact(tickets) + ' tickets last ' + secs(end) : 'the ' + compact(tickets) + ' tickets are not all sold, because fewer people come than there are tickets') +
        '. At its longest the line holds ' + compact(longest) + ' people, ' + (soldOut ? 'and ' + Math.round(Math.min(1, tickets / people) * 100) + '% of everyone gets a ticket. ' : 'and everyone who comes gets a ticket. ') +
        'In the first minute people arrive at ' + r1(firstMinute / capacity) + ' times what the booking service can complete' + (firstMinute > capacity ? ', which is what the line absorbs.' : ', so a line is barely needed.'));
    });
  });

  // ------------------------------------------------------------ payments: load, ledger storage, and double charges from retries
  $$('[data-widget="payments94"]').forEach(function (root) {
    // orders charged twice or more per 100,000, by % of messages lost on each hop: lld/ts94/retries.ts (seeded)
    var NONE = [[0, 0], [0.5, 961], [1, 1996], [2, 3909], [5, 9555]], APP = [[0, 0], [0.5, 482], [1, 980], [2, 1929], [5, 4960]];
    function at(table, x) {
      for (var i = 1; i < table.length; i++) if (x <= table[i][0]) {
        var a = table[i - 1], b = table[i];
        return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]);
      }
      return table[table.length - 1][1];
    }
    bind(root, function () {
      var orders = val(root, 'orders') * 1e6, peak = val(root, 'peak'), years = val(root, 'years'), lost = val(root, 'lost');
      if (!(orders >= 1000 && orders <= 1e9) || !(peak >= 1 && peak <= 50) || !(years >= 1 && years <= 50) || !(lost >= 0 && lost <= 5)) {
        ['rate', 'ledger', 'none', 'app'].forEach(function (k) { out(root, k, 'n/a'); });
        out(root, 'verdict', 'Enter values within the ranges of the sliders.');
        return;
      }
      var rate = orders / 86400 * peak, perYear = orders * 10 * 150 * 365;   // about 10 ledger lines of 150 bytes per order
      var none = orders * at(NONE, lost) / 1e5, app = orders * at(APP, lost) / 1e5;
      out(root, 'rate', compact(rate));
      out(root, 'ledger', bytes(perYear) + ', ' + bytes(perYear * years));
      out(root, 'none', compact(Math.round(none)));
      out(root, 'app', compact(Math.round(app)));
      out(root, 'verdict', 'At the peak, ' + compact(rate) + ' payments a second, which one database handles. The ledger grows by ' + bytes(perYear) + ' a year. ' +
        (lost > 0 ? 'Losing ' + lost + '% of messages on each hop, retries without keys would charge about ' + compact(Math.round(none)) + ' orders twice every day, and a key from the app alone about ' + compact(Math.round(app)) + '. With one key carried to the provider, none.'
          : 'With no messages lost nobody is charged twice, but networks do lose messages, which is why every step carries a key.'));
    });
  });

  // ------------------------------------------------------------ wallet: partitions needed when crossing transfers cost three events
  $$('[data-widget="wallet95"]').forEach(function (root) {
    var load = function (peak, p) { return peak * (1 + 2 * (1 - 1 / p)) / p; };   // events a second per partition
    bind(root, function () {
      var peak = val(root, 'peak'), cap = val(root, 'cap'), replicas = Math.round(val(root, 'replicas')), ratio = val(root, 'ratio');
      if (!(peak >= 1000 && peak <= 1e8) || !(cap >= 1000 && cap <= 1e7) || !(replicas >= 1 && replicas <= 9) || !(ratio >= 1 && ratio <= 50)) {
        ['parts', 'servers', 'per', 'log'].forEach(function (k) { out(root, k, 'n/a'); });
        noPaper(root);
        out(root, 'verdict', 'Enter values within the ranges of the sliders.');
        return;
      }
      var p = 1;
      while (load(peak, p) > cap && p < 100000) p++;
      var per = 1 + 2 * (1 - 1 / p), logDay = peak / ratio * per * 100 * 86400;
      var d = paper(root, 640, 220);
      if (d) {
        var L = 100, R = 500, T = 16, B = 180, maxP = Math.max(4, Math.ceil(p * 2)), top = Math.max(load(peak, 1), cap) * 1.1;
        var X = function (k) { return L + (R - L) * (k - 1) / (maxP - 1); }, Y = function (v) { return B - (B - T) * Math.min(v, top) / top; };
        [0, 0.5, 1].forEach(function (f) {
          d('line', { x1: L, y1: r1(Y(top * f / 1.1)), x2: R, y2: r1(Y(top * f / 1.1)), 'class': 'grid' });
          d('text', { x: L - 8, y: r1(Y(top * f / 1.1) + 4), 'class': 'ts end' }, compact(Math.round(top * f / 1.1)));
        });
        var pts = [];
        for (var k = 1; k <= maxP; k += Math.max(1, Math.floor(maxP / 200))) pts.push([X(k), Y(load(peak, k))]);
        d('path', { d: pathOf(pts), 'class': 'line' });
        d('line', { x1: L, y1: r1(Y(cap)), x2: R, y2: r1(Y(cap)), 'class': 'axis', style: 'stroke-dasharray:5 4' });
        d('text', { x: R + 6, y: r1(Y(cap) + 4), 'class': 'ts' }, 'a partition’s limit');
        d('circle', { cx: r1(X(p)), cy: r1(Y(load(peak, p))), r: 4.5, 'class': 'dot' });
        d('text', { x: r1(X(p) + 8), y: r1(Y(load(peak, p)) - 8), 'class': 'ts tb' }, p + ' partition' + (p === 1 ? '' : 's'));
        [1, Math.ceil(maxP / 2), maxP].forEach(function (k) { d('text', { x: r1(X(k)), y: B + 18, 'class': 'ts mid' }, String(k)); });
        d('text', { x: (L + R) / 2, y: B + 36, 'class': 'ts mid' }, 'partitions; the line is events a second each must take');
      }
      out(root, 'parts', String(p));
      out(root, 'servers', String(p * replicas));
      out(root, 'per', r1(per).toString());
      out(root, 'log', bytes(logDay));
      out(root, 'verdict', compact(peak) + ' transfers a second need ' + p + ' partition' + (p === 1 ? '' : 's') + ' of ' + compact(cap) + ' events a second, ' + (p * replicas) + ' server' + (p * replicas === 1 ? '' : 's') + ' in all. ' +
        (p > 1 ? 'With ' + p + ' partitions, ' + Math.round((1 - 1 / p) * 100) + '% of transfers cross from one to another and cost three events, so each transfer averages ' + r1(per) + '. ' : 'Every transfer stays inside the one partition and costs one event. ') +
        'At the average rate the log grows by ' + bytes(logDay) + ' a day, at 100 bytes an event.');
    });
  });

  // ------------------------------------------------------------ stock exchange: load, the time budget per message, storage
  $$('[data-widget="exchange96"]').forEach(function (root) {
    var MATCH_NS = 598, JSON_NS = 1825, MD_BYTES = 36.3, JOURNAL_BYTES = 64, ORDER_BYTES = 134;   // measured in the chapter, one run
    function us(ns) { return ns < 1000 ? Math.round(ns) + ' ns' : sig(ns / 1000) + ' µs'; }
    bind(root, function () {
      var msgs = val(root, 'msgs') * 1e6, hours = val(root, 'hours'), peak = val(root, 'peak'), share = val(root, 'share') / 100, resting = val(root, 'resting') * 1e6;
      if (!(msgs >= 0 && hours > 0 && peak >= 1 && share > 0 && share <= 1 && resting >= 0)) {
        ['avg', 'peakrate', 'busiest', 'budget', 'journal', 'feed', 'memory'].forEach(function (k) { out(root, k, 'n/a'); });
        noPaper(root); out(root, 'verdict', 'Enter a positive number of hours, a peak of at least 1 and a share between 1 and 100.');
        return;
      }
      var avg = msgs / (hours * 3600), top = avg * peak, busy = top * share, budget = busy > 0 ? 1e9 / busy : Infinity;
      out(root, 'avg', compact(avg) + ' a second');
      out(root, 'peakrate', compact(top) + ' a second');
      out(root, 'busiest', compact(busy) + ' a second');
      out(root, 'budget', isFinite(budget) ? us(budget) : 'no limit');
      out(root, 'journal', bytes(msgs * JOURNAL_BYTES));
      out(root, 'feed', bits(top * MD_BYTES * 8));
      out(root, 'memory', bytes(resting * ORDER_BYTES));
      var d = paper(root, 640, 150);
      if (d) {
        var rows = [['Time for each message at the peak', budget, 'dot'], ['Match one command (measured)', MATCH_NS, ''], ['Match, and parse it from JSON', MATCH_NS + JSON_NS, 'mute']];
        var max = Math.max(MATCH_NS + JSON_NS, isFinite(budget) ? budget : 0) * 1.12, X = 230, Wd = 330;
        rows.forEach(function (r, i) {
          var y = 14 + i * 36, w = Math.max(2, Math.min(r[1], max) / max * Wd);
          d('text', { x: X - 8, y: y + 15, 'class': 'ts end' }, r[0]);
          d('rect', { x: X, y: y + 4, width: r1(w), height: 16, rx: 2, 'class': 'bar' + (r[2] === 'mute' ? ' mute' : r[2] === 'dot' ? ' store' : '') });
          if (r[2] === 'dot') d('circle', { cx: r1(X + w), cy: y + 12, r: 5, 'class': 'dot' });
          d('text', { x: r1(X + w + 10), y: y + 16, 'class': 'ts tb' }, isFinite(r[1]) ? us(r[1]) : 'no limit');
        });
        d('text', { x: 10, y: 140, 'class': 'ts' }, 'One engine thread handles one message after another: the work for each must fit in the time between them.');
      }
      var ratio = budget / MATCH_NS;
      out(root, 'verdict', msgs === 0 ? 'With no messages there is nothing to match.' :
        'At the peak the busiest engine receives ' + compact(busy) + ' messages a second, leaving ' + us(budget) + ' for each. ' +
        (ratio >= 2 ? 'The chapter’s engine took ' + us(MATCH_NS) + ' on average in one run, so it keeps up with ' + sig(ratio, 2) + ' times headroom' + (budget < MATCH_NS + JSON_NS ? ', but parsing JSON as well would not fit.' : '.')
          : ratio >= 1 ? 'The chapter’s engine took ' + us(MATCH_NS) + ' on average in one run: it keeps up, with almost no headroom for bursts.'
          : 'That is less than the ' + us(MATCH_NS) + ' the chapter’s engine needed on average in one run, so it would fall behind: spread the symbols over more engines.'));
    });
  });

  // ------------------------------------------------------------ ad clicks: rates, raw bytes, rows after aggregation, ids to remember
  $$('[data-widget="clicks97"]').forEach(function (root) {
    var ID_BYTES = 40;   // one remembered click id with its time, in a hash table (an assumption)
    // calls f(rank, howMany) over ranks 1..n: exactly up to 1,000, then in 300 buckets spaced evenly on a log scale
    function ranks(n, f) {
      var r, top = Math.min(n, 1000);
      for (r = 1; r <= top; r++) f(r, 1);
      if (n <= 1000) return;
      var prev = 1001;
      for (var k = 1; k <= 300; k++) {
        var edge = k === 300 ? n + 1 : Math.max(prev, Math.round(1001 * Math.pow(n / 1001, k / 300)));
        if (edge > prev) { f(Math.sqrt(prev * (edge - 1)), edge - prev); prev = edge; }
      }
    }
    bind(root, function () {
      var clicks = val(root, 'clicks') * 1e6, peak = val(root, 'peak'), ads = Math.round(val(root, 'ads') * 1e6), s = val(root, 'skew'), raw = val(root, 'raw'), dedup = val(root, 'dedup');
      if (!(clicks >= 0 && peak >= 1 && ads >= 1 && s >= 0 && raw > 0 && dedup >= 0)) {
        ['avg', 'peakrate', 'rawday', 'minute', 'hour', 'day', 'ids'].forEach(function (k) { out(root, k, 'n/a'); });
        noPaper(root); out(root, 'verdict', 'Enter at least one ad, a peak of at least 1 and positive sizes.');
        return;
      }
      var H = 0; ranks(ads, function (r, n) { H += n * Math.pow(r, -s); });
      function rows(slots) {
        var lam = clicks / slots / H, t = 0;
        ranks(ads, function (r, n) { t += n * (1 - Math.exp(-lam * Math.pow(r, -s))); });
        return slots * t;
      }
      var avg = clicks / 86400, top = avg * peak, m = rows(1440), h = rows(24), d1 = rows(1), ids = top * dedup * 60;
      out(root, 'avg', compact(avg) + ' a second');
      out(root, 'peakrate', compact(top) + ' a second');
      out(root, 'rawday', bytes(clicks * raw));
      out(root, 'minute', compact(Math.round(m)));
      out(root, 'hour', compact(Math.round(h)));
      out(root, 'day', compact(Math.round(d1)));
      out(root, 'ids', compact(Math.round(ids)) + ', ' + bytes(ids * ID_BYTES));
      var dr = paper(root, 640, 170);
      if (dr) {
        var bars = [['Clicks a day', clicks, true], ['Rows, per ad and minute', m], ['Rows, per ad and hour', h], ['Rows, per ad and day', d1]];
        var X = 190, W = 330, lo = 3, hi = 12;   // 1,000 to 10^12, logarithmic
        var px = function (v) { return X + Math.max(0, Math.min(1, (Math.log10(Math.max(v, 1)) - lo) / (hi - lo))) * W; };
        [3, 6, 9, 12].forEach(function (e) {
          dr('line', { x1: r1(px(Math.pow(10, e))), y1: 8, x2: r1(px(Math.pow(10, e))), y2: 140, 'class': 'grid' });
          dr('text', { x: r1(px(Math.pow(10, e))), y: 156, 'class': 'ts mid' }, e === 3 ? 'thousand' : e === 6 ? 'million' : e === 9 ? 'billion' : 'trillion');
        });
        bars.forEach(function (b, i) {
          var y = 12 + i * 32, w = Math.max(2, px(b[1]) - X);
          dr('text', { x: X - 8, y: y + 14, 'class': 'ts end' }, b[0]);
          dr('rect', { x: X, y: y + 2, width: r1(w), height: 16, rx: 2, 'class': 'bar' + (i ? ' store' : '') });
          if (b[2]) dr('circle', { cx: r1(X + w), cy: y + 10, r: 5, 'class': 'dot' });
          dr('text', { x: r1(X + w + 10), y: y + 14, 'class': 'ts tb' }, compact(Math.round(b[1])));
        });
      }
      out(root, 'verdict', clicks === 0 ? 'With no clicks there is nothing to count.' :
        compact(clicks) + ' clicks a day become about ' + compact(Math.round(m)) + ' rows counted per ad and minute: ' + (m > 0 ? sig(clicks / m, 2) : 0) + ' clicks per row on average, because most ads are clicked less than once a minute. ' +
        'Rolling up to hours leaves ' + compact(Math.round(h)) + ' rows. ' + (dedup > 0 ? 'Remembering ids for ' + dedup + (dedup === 1 ? ' minute' : ' minutes') + ' at the peak takes about ' + bytes(ids * ID_BYTES) + ' across the aggregators.' : 'Without remembering ids, every repeated click is counted until the batch removes it.'));
    });
  });

  // ------------------------------------------------------------ metrics and logs: series, samples, storage by tier
  $$('[data-widget="monitoring98"]').forEach(function (root) {
    var SAMPLE = 2.13, ROLLUP = 4 * 2.13, LOG_RATIO = 6.3, WORD_INDEX = 0.45;   // measured in the chapter; a rollup row is four values
    bind(root, function () {
      var targets = val(root, 'targets'), per = val(root, 'per'), every = val(root, 'every'), days = val(root, 'days'), logs = val(root, 'logs') * 1e12, logDays = val(root, 'logdays');
      if (!(targets >= 0 && per >= 0 && every > 0 && days >= 0 && logs >= 0 && logDays >= 0)) {
        ['series', 'rate', 'perday', 'raw', 'rollups', 'logstore', 'index'].forEach(function (k) { out(root, k, 'n/a'); });
        noPaper(root); out(root, 'verdict', 'Enter a scrape interval above zero and no negative numbers.');
        return;
      }
      var series = targets * per, rate = series / every, perDay = rate * SAMPLE * 86400, raw = perDay * days;
      var rollups = series * (288 * 90 + 24 * 730) * ROLLUP, logStore = logs / LOG_RATIO * logDays, index = logs * WORD_INDEX * logDays;
      out(root, 'series', compact(series));
      out(root, 'rate', compact(rate) + ' a second');
      out(root, 'perday', bytes(perDay));
      out(root, 'raw', bytes(raw));
      out(root, 'rollups', bytes(rollups));
      out(root, 'logstore', bytes(logStore));
      out(root, 'index', bytes(index));
      var d = paper(root, 640, 160);
      if (d) {
        var bars = [['Metrics, every sample, ' + days + ' days', raw, ''], ['Metrics, rollups, 90 days and 2 years', rollups, ''], ['Logs, compressed, ' + logDays + ' days', logStore, 'store'], ['A word index for those logs', index, 'mute']];
        var max = Math.max.apply(null, bars.map(function (b) { return b[1]; })) || 1, X = 250, W = 280;
        bars.forEach(function (b, i) {
          var y = 10 + i * 32, w = Math.max(2, b[1] / max * W);
          d('text', { x: X - 8, y: y + 14, 'class': 'ts end' }, b[0]);
          d('rect', { x: X, y: y + 2, width: r1(w), height: 16, rx: 2, 'class': 'bar' + (b[2] ? ' ' + b[2] : '') });
          if (i === 0) d('circle', { cx: r1(X + w), cy: y + 10, r: 5, 'class': 'dot' });
          d('text', { x: r1(X + w + 10), y: y + 14, 'class': 'ts tb' }, bytes(b[1]));
        });
        d('text', { x: 10, y: 150, 'class': 'ts' }, 'Bars share one scale. Rollups keep 5-minute rows for 90 days and hourly rows for 2 years.');
      }
      out(root, 'verdict', series === 0 ? 'With no series there is nothing to store.' :
        compact(series) + ' series scraped every ' + every + ' s make ' + compact(rate) + ' samples a second, ' + bytes(perDay) + ' a day at ' + SAMPLE + ' bytes a sample. ' +
        (logStore > raw + rollups ? 'The logs, compressed, still take more than all the metrics together' : 'The metrics take more than the compressed logs') +
        (logs > 0 ? ', and indexing every word of the logs would add ' + bytes(index) + '.' : '.'));
    });
  });

  // ------------------------------------------------------------ collaborative editing: operations and presence for one document, and in total
  $$('[data-widget="editing99"]').forEach(function (root) {
    function fanout(n, perPerson) { return n * perPerson * Math.max(0, n - 1); }
    bind(root, function () {
      var n = Math.round(val(root, 'people')), edits = val(root, 'edits'), cursors = val(root, 'cursors'), users = val(root, 'users') * 1e6, minutes = val(root, 'minutes'), size = val(root, 'size');
      if (!(n >= 1 && edits >= 0 && cursors >= 0 && users >= 0 && minutes >= 0 && minutes <= 1440 && size > 0)) {
        ['inbound', 'outbound', 'presence', 'total', 'logday', 'online'].forEach(function (k) { out(root, k, 'n/a'); });
        noPaper(root); out(root, 'verdict', 'Enter at least one person, minutes between 0 and 1,440 and a positive size.');
        return;
      }
      var inbound = n * edits, outOps = fanout(n, edits), pres = fanout(n, cursors);
      var opsDay = users * minutes * 60 * edits, total = opsDay / 86400, online = users * minutes / 1440;
      out(root, 'inbound', compact(inbound) + ' a second');
      out(root, 'outbound', compact(outOps) + ' a second');
      out(root, 'presence', compact(pres) + ' a second');
      out(root, 'total', compact(total) + ' a second');
      out(root, 'logday', bytes(opsDay * size));
      out(root, 'online', compact(Math.round(online)));
      var d = paper(root, 640, 200);
      if (d) {
        var X0 = 60, X1 = 600, Y0 = 170, Y1 = 14, maxN = Math.max(20, Math.min(100, Math.ceil(n / 10) * 10 + 10));
        var maxY = fanout(maxN, edits + cursors) || 1;
        var px = function (k) { return X0 + (k - 1) / (maxN - 1) * (X1 - X0); }, py = function (v) { return Y0 - v / maxY * (Y0 - Y1); };
        [0, 0.5, 1].forEach(function (f) {
          d('line', { x1: X0, y1: r1(py(maxY * f)), x2: X1, y2: r1(py(maxY * f)), 'class': 'grid' });
          d('text', { x: X0 - 6, y: r1(py(maxY * f) + 4), 'class': 'ts end' }, compact(Math.round(maxY * f)));
        });
        var pts = [], ops = [];
        for (var k = 1; k <= maxN; k++) { pts.push([px(k), py(fanout(k, edits + cursors))]); ops.push([px(k), py(fanout(k, edits))]); }
        d('path', { d: pathOf(pts), 'class': 'line' });
        d('path', { d: pathOf(ops), 'class': 'e none store' });
        d('text', { x: X1, y: r1(pts[pts.length - 1][1] - 8), 'class': 'ts end' }, 'with presence');
        d('text', { x: X1, y: r1(ops[ops.length - 1][1] - 8), 'class': 'ts end' }, 'edits only');
        if (n <= maxN) d('circle', { cx: r1(px(n)), cy: r1(py(fanout(n, edits + cursors))), r: 5, 'class': 'dot' });
        d('text', { x: X0, y: 192, 'class': 'ts' }, 'Messages a second sent by one document’s server, by people in the document: 1 to ' + maxN + '.');
      }
      out(root, 'verdict', n === 1 ? 'Alone in a document, nothing needs to be broadcast; the server only stores ' + compact(inbound) + ' operations a second.' :
        'With ' + n + ' people in one document, its server receives ' + compact(inbound) + ' operations a second and sends ' + compact(outOps + pres) + ' messages, ' +
        Math.round(pres / Math.max(1, outOps + pres) * 100) + '% of them presence. Doubling the people roughly quadruples the messages, which is why presence is throttled and large audiences get a read-only view.');
    });
  });

  // ------------------------------------------------------------ cost and waiting time of model calls
  $$('[data-widget="llmcost100"]').forEach(function (root) {
    bind(root, function () {
      var n = val(root, 'requests'), prompt = val(root, 'prompt'), cached = val(root, 'cached'), answer = val(root, 'answer'),
        pin = val(root, 'pin'), pcache = val(root, 'pcache'), pout = val(root, 'pout'), ttft = val(root, 'ttft'), speed = val(root, 'speed');
      var keys = ['per', 'month', 'outshare', 'wait'];
      if (!(n >= 0) || !(prompt >= 0) || !(cached >= 0 && cached <= 100) || !(answer >= 1) || !(pin >= 0) || !(pcache >= 0 && pcache <= 100) || !(pout >= 0) || !(ttft >= 0) || !(speed > 0)) {
        keys.forEach(function (k) { out(root, k, 'n/a'); });
        noPaper(root);
        out(root, 'verdict', 'Enter zero or more requests and tokens, an answer of at least 1 token, shares between 0 and 100 percent, prices of zero or more and a speed above zero.');
        return;
      }
      var fresh = prompt * (1 - cached / 100), reused = prompt * cached / 100;
      var cIn = fresh * pin / 1e6, cCache = reused * pin * pcache / 100 / 1e6, cOut = answer * pout / 1e6;
      var per = cIn + cCache + cOut, month = per * n * 30, noCache = (prompt * pin + answer * pout) / 1e6;
      var gen = (answer - 1) / speed, wait = ttft / 1000 + gen;
      var money = function (x) { return x >= 100 ? '$' + Math.round(x).toLocaleString('en-US') : x >= 1 ? '$' + x.toFixed(2) : x >= 0.01 ? '$' + x.toFixed(3) : x > 0 ? '$' + sig(x, 2) : '$0'; };
      var d = paper(root, 640, 150);
      if (d) {
        var L = 130, W = 430;
        d('text', { x: 10, y: 34, 'class': 'ts' }, 'Cost of one call');
        var parts = [[cIn, 'bar', 'new input'], [cCache, 'bar store', 'cached input'], [cOut, 'bar fault', 'output']], x = L;
        parts.forEach(function (p, i) {
          var w = per > 0 ? p[0] / per * W : 0;
          d('rect', { x: r1(x), y: 20, width: r1(Math.max(w, 0)), height: 20, rx: 2, 'class': p[1] });
          d('rect', { x: 130 + i * 150, y: 52, width: 12, height: 12, rx: 3, 'class': p[1] });
          d('text', { x: 148 + i * 150, y: 62, 'class': 'ts' }, p[2] + ' ' + money(p[0]));
          x += w;
        });
        d('text', { x: L + W + 8, y: 35, 'class': 'ts tb' }, money(per));
        var T = Math.max(wait, 0.001), tx = function (s) { return L + s / T * W; };
        d('text', { x: 10, y: 104, 'class': 'ts' }, 'Waiting, one call');
        d('rect', { x: L, y: 90, width: r1(Math.max(tx(ttft / 1000) - L, 1)), height: 20, rx: 2, 'class': 'bar' });
        d('rect', { x: r1(tx(ttft / 1000)), y: 90, width: r1(Math.max(W - (tx(ttft / 1000) - L), 0)), height: 20, rx: 2, 'class': 'bar mute' });
        d('circle', { cx: r1(tx(ttft / 1000)), cy: 100, r: 5, 'class': 'dot' });
        d('text', { x: L + W + 8, y: 105, 'class': 'ts tb' }, duration(wait));
        d('text', { x: L, y: 132, 'class': 'ts' }, 'first token after ' + duration(ttft / 1000) + ', then ' + compact(answer - 1) + ' more at ' + compact(speed) + ' a second');
      }
      out(root, 'per', money(per));
      out(root, 'month', money(month));
      out(root, 'outshare', per > 0 ? sig(cOut / per * 100) + '%' : 'n/a');
      out(root, 'wait', duration(wait));
      var saved = noCache > 0 ? (1 - per / noCache) * 100 : 0;
      out(root, 'verdict', 'Each call costs ' + money(per) + ', so ' + compact(n) + (n === 1 ? ' call' : ' calls') + ' a day cost about ' + money(month) + ' a month. ' +
        (per > 0 ? 'The answer’s ' + compact(answer) + (answer === 1 ? ' token is ' : ' tokens are ') + sig(cOut / per * 100) + '% of the cost' + (cached > 0 && saved > 0.5 ? ', and the prompt cache saves ' + sig(saved) + '% compared with no cache. ' : '. ') : '') +
        'The reader waits ' + duration(ttft / 1000) + ' for the first word and ' + duration(wait) + ' for the last, which is why the answer is streamed.');
    });
  });

  // ------------------------------------------------------------ memory for a vector index held in memory
  $$('[data-widget="vecmem101"]').forEach(function (root) {
    bind(root, function () {
      var millions = val(root, 'millions'), dims = Math.round(val(root, 'dims')), bits = val(root, 'bits'), m = Math.round(val(root, 'links')), ram = val(root, 'ram');
      var keys = ['vectors', 'graph', 'total', 'machines'];
      if (!(millions > 0) || !(dims >= 1) || !(bits >= 1 && bits <= 32) || !(m >= 2 && m <= 128) || !(ram > 0)) {
        keys.forEach(function (k) { out(root, k, 'n/a'); });
        noPaper(root);
        out(root, 'verdict', 'Enter a number of vectors above zero, at least 1 dimension, 1 to 32 bits a number, 2 to 128 links and a memory size above zero.');
        return;
      }
      var n = millions * 1e6, vec = n * dims * bits / 8, graph = n * (2 * m + 1) * 4, total = vec + graph;
      var usable = ram * 1e9 * 0.75, machines = Math.ceil(total / usable);
      var d = paper(root, 640, 112);
      if (d) {
        var L = 10, W = 560, span = Math.max(total, machines * usable) * 1.02, sx = function (b) { return L + b / span * W; };
        d('rect', { x: L, y: 30, width: r1(Math.max(sx(vec) - L, 1)), height: 24, rx: 2, 'class': 'bar store' });
        d('rect', { x: r1(sx(vec)), y: 30, width: r1(Math.max(sx(total) - sx(vec), 1)), height: 24, rx: 2, 'class': 'bar' });
        d('circle', { cx: r1(sx(total)), cy: 42, r: 5, 'class': 'dot' });
        d('text', { x: L, y: 20, 'class': 'ts' }, 'vectors ' + bytes(vec) + ' + graph ' + bytes(graph) + ' = ' + bytes(total));
        for (var k = 1; k * usable <= span && k <= 12; k++) {
          var x = r1(sx(k * usable));
          d('line', { x1: x, y1: 24, x2: x, y2: 66, 'class': 'grid', style: 'stroke:var(--ink-3);stroke-dasharray:3 3' });
          d('text', { x: x, y: 80, 'class': 'ts mid' }, k === 1 ? '1 machine' : String(k));
        }
        d('text', { x: L, y: 104, 'class': 'ts' }, 'Dashed lines: what each machine can hold, three quarters of its ' + compact(ram) + ' GB.');
      }
      out(root, 'vectors', bytes(vec));
      out(root, 'graph', bytes(graph));
      out(root, 'total', bytes(total));
      out(root, 'machines', String(machines));
      out(root, 'verdict', compact(n) + ' vectors of ' + compact(dims) + ' numbers at ' + sig(bits) + (bits === 1 ? ' bit' : ' bits') + ' each take ' + bytes(vec) +
        ', and a graph with up to ' + (2 * m) + ' links per vector on its bottom layer adds ' + bytes(graph) + '. Kept in memory with a quarter of each machine free, that needs ' +
        machines + (machines === 1 ? ' machine' : ' machines') + ' of ' + compact(ram) + ' GB' + (machines > 1 ? ', so the index must be split into shards and every query sent to all of them.' : '.'));
    });
  });

  // ------------------------------------------------------------ how per-step reliability compounds over an agent's task
  $$('[data-widget="agentrel102"]').forEach(function (root) {
    bind(root, function () {
      var p = val(root, 'step') / 100, steps = Math.round(val(root, 'steps')), retries = Math.round(val(root, 'retries')), k = Math.round(val(root, 'k'));
      var keys = ['each', 'task', 'all', 'fails'];
      if (!(p > 0 && p <= 1) || !(steps >= 1 && steps <= 200) || !(retries >= 0 && retries <= 10) || !(k >= 1 && k <= 100)) {
        keys.forEach(function (x) { out(root, x, 'n/a'); });
        noPaper(root);
        out(root, 'verdict', 'Enter a step success above 0 and up to 100 percent, 1 to 200 steps, 0 to 10 retries and 1 to 100 runs.');
        return;
      }
      var each = 1 - Math.pow(1 - p, retries + 1), task = Math.pow(each, steps), all = Math.pow(task, k);
      var pct = function (x) { return x >= 0.99995 ? '100%' : x < 0.0001 ? 'under 0.01%' : sig(x * 100) + '%'; };
      var d = paper(root, 640, 190);
      if (d) {
        var L = 50, R = 20, T = 16, B = 40, W = 640 - L - R, H = 190 - T - B, maxS = Math.max(20, steps * 2);
        var sx = function (n) { return L + (n - 1) / (maxS - 1) * W; }, sy = function (v) { return T + H - v * H; };
        [0, 0.25, 0.5, 0.75, 1].forEach(function (v) {
          d('line', { x1: L, x2: L + W, y1: r1(sy(v)), y2: r1(sy(v)), 'class': 'grid' });
          d('text', { x: L - 6, y: r1(sy(v) + 4), 'class': 'ts end' }, (v * 100) + '%');
        });
        var pts = [], pts0 = [];
        for (var n = 1; n <= maxS; n++) { pts.push([sx(n), sy(Math.pow(each, n))]); pts0.push([sx(n), sy(Math.pow(p, n))]); }
        if (retries > 0) d('path', { d: pathOf(pts0), 'class': 'line', style: 'stroke:var(--fault);stroke-dasharray:4 4' });
        d('path', { d: pathOf(pts), 'class': 'line' });
        d('circle', { cx: r1(sx(steps)), cy: r1(sy(task)), r: 5, 'class': 'dot' });
        d('line', { x1: L, x2: L + W, y1: T + H, y2: T + H, 'class': 'axis' });
        d('text', { x: L, y: T + H + 16, 'class': 'ts' }, '1 step');
        d('text', { x: L + W, y: T + H + 16, 'class': 'ts end' }, maxS + ' steps');
        d('text', { x: L + W / 2, y: T + H + 34, 'class': 'ts mid' }, 'Chance the whole task succeeds, by its number of steps' + (retries > 0 ? '; dashed: without retries' : ''));
      }
      out(root, 'each', pct(each));
      out(root, 'task', pct(task));
      out(root, 'all', pct(all));
      out(root, 'fails', compact(Math.round((1 - task) * 1000)));
      out(root, 'verdict', 'If each step goes right ' + pct(p) + ' of the time' + (retries > 0 ? ', and a failed step is retried up to ' + retries + (retries === 1 ? ' time' : ' times') + ' with independent chances, so that a step succeeds ' + pct(each) + ' of the time' : '') +
        ', a task of ' + steps + (steps === 1 ? ' step' : ' steps') + ' succeeds ' + pct(task) + ' of the time: about ' + compact(Math.round((1 - task) * 1000)) + ' failures in every 1,000 tasks' +
        (k === 1 ? '.' : ', and all of ' + k + ' runs succeed only ' + pct(all) + ' of the time.') + ' Retries help only with failures that do not repeat; a step the model gets wrong for a reason gets the same reason again.');
    });
  });

  // ------------------------------------------------------------ utilization curve
  $$('[data-widget="utilization"]').forEach(function (root) {
    var svg = $('svg', root);
    var NS = 'http://www.w3.org/2000/svg';
    var W = 640, H = 310, L = 48, R = 16, T = 16, B = 50, MAXY = 20;
    var x = function (rho) { return L + rho * (W - L - R); };
    var y = function (m) { return H - B - Math.min(m, MAXY) / MAXY * (H - T - B); };
    function el(name, attrs, text) {
      var e = doc.createElementNS(NS, name);
      for (var k in attrs) e.setAttribute(k, attrs[k]);
      if (text != null) e.textContent = text;
      svg.appendChild(e);
      return e;
    }
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.textContent = '';
    [0, 5, 10, 15, 20].forEach(function (m) {
      el('line', { x1: L, x2: W - R, y1: y(m), y2: y(m), 'class': m === 0 ? 'axis' : 'grid' });
      el('text', { x: L - 8, y: y(m) + 4, 'class': 'ts end' }, m === 0 ? '0' : m + '×');
    });
    [0, 0.2, 0.4, 0.6, 0.8, 1].forEach(function (r) {
      el('text', { x: x(r), y: H - B + 17, 'class': 'ts mid' }, Math.round(r * 100) + '%');
    });
    el('text', { x: (L + W - R) / 2, y: H - 8, 'class': 'ts mid' }, 'Utilization of the server');
    var d = '';
    for (var r = 0; r <= 0.95001; r += 0.005) d += (d ? 'L' : 'M') + x(r).toFixed(1) + ' ' + y(1 / (1 - r)).toFixed(1);
    el('path', { d: d, 'class': 'line' });
    var guide = el('line', { 'class': 'grid', y1: T, y2: H - B });
    var dot = el('circle', { r: 5.5, 'class': 'dot' });
    var tag = el('text', { 'class': 'tb' });
    bind(root, function () {
      var rho = val(root, 'rho') / 100;
      var service = val(root, 'service');
      var mult = 1 / (1 - rho);
      var cx = x(rho), cy = y(mult);
      guide.setAttribute('x1', cx); guide.setAttribute('x2', cx);
      dot.setAttribute('cx', cx); dot.setAttribute('cy', cy);
      tag.textContent = sig(mult) + '×';
      var nearLeft = cx < L + 70;
      tag.setAttribute('x', nearLeft ? cx + 10 : cx - 10);
      tag.setAttribute('y', Math.max(cy - 12, T + 12));
      tag.setAttribute('class', 'tb' + (nearLeft ? '' : ' end'));
      out(root, 'rho', Math.round(rho * 100) + '%');
      out(root, 'mult', sig(mult) + '×');
      out(root, 'response', isFinite(service) && service >= 0 ? sig(service * mult) + ' ms' : 'n/a');
      out(root, 'waiting', isFinite(service) && service >= 0 ? sig(service * (mult - 1)) + ' ms' : 'n/a');
      out(root, 'verdict', rho < 0.5
        ? 'Below half load a request rarely finds anyone ahead of it. Most of the response time is the work itself.'
        : rho < 0.8
          ? 'Queueing is now a visible share of the response time, but the curve is still gentle. Many teams aim to run in this range.'
          : 'The curve has turned upward. A small rise in traffic from here produces a large rise in waiting time.');
    });
  });
})();
