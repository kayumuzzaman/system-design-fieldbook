/* Figures: the step-through player, values on hover, and the enlarged view.
   A figure becomes playable when it contains <ol class="steps">. The drawing marks what belongs
   to each step with data-s (first step it is visible) and optionally data-e (last step).
   The full authoring rules are in DESIGN.md. With scripts off, the whole drawing and the
   numbered list of steps are shown, so nothing is lost. */
(function () {
  'use strict';
  var doc = document;
  var $ = function (s, r) { return (r || doc).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || doc).querySelectorAll(s)); };
  var NS = 'http://www.w3.org/2000/svg';
  var calm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function make(tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function icon(d) { return '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="' + d + '"/></svg>'; }

  // ------------------------------------------------------------ step-through player
  $$('figure[data-player]').forEach(function (fig) {
    var svg = $('svg.dg', fig);
    var lists = $$('ol.steps', fig);
    if (!svg || !lists.length) return;
    // A step may say what the system holds after it: data-state="Cache: empty; Database: 100 likes".
    // A step without one keeps the state of the step before it.
    function carry(list) {
      var last = '';
      return list.map(function (text) { if (text) last = text; return last; });
    }
    function pairs(text) {
      return text.split(';').map(function (part) {
        var at = part.indexOf(':');
        return at < 0 ? null : [part.slice(0, at).trim(), part.slice(at + 1).trim()];
      }).filter(Boolean);
    }
    // Free-standing labels can travel with a message. Labels inside a box name the box and stay put.
    var boxes = $$('rect.n', svg).map(function (r) { return r.getBBox(); });
    function inBox(b) {
      var cx = b.x + b.width / 2, cy = b.y + b.height / 2;
      return boxes.some(function (r) { return cx > r.x && cx < r.x + r.width && cy > r.y && cy < r.y + r.height; });
    }
    var scenes = lists.map(function (ol) {
      var id = ol.getAttribute('data-scene') || '';
      var scopes = id ? $$('[data-scene="' + id + '"]', svg) : [svg];
      var parts = [];
      scopes.forEach(function (scope) {
        if (scope.hasAttribute('data-s')) parts.push(scope);
        $$('[data-s]', scope).forEach(function (el) { parts.push(el); });
      });
      return {
        id: id,
        label: ol.getAttribute('data-label') || '',
        says: $$('li', ol).map(function (li) { return li.innerHTML; }),
        states: carry($$('li', ol).map(function (li) { return li.getAttribute('data-state') || ''; })),
        msgs: $$('li', ol).map(function (li) { return li.getAttribute('data-msg'); }),
        scopes: scopes,
        parts: parts
      };
    });
    var state = { scene: 0, step: 0, playing: false, speed: 1 };
    var timer = null;
    var raf = [];
    var travel = 0;   // how long the messages of the current step take to arrive

    var player = make('div', 'player');
    var segs = [];
    if (scenes.length > 1) {
      var row = make('div', 'scenes');
      var seg = make('div', 'seg');
      seg.setAttribute('role', 'group');
      seg.setAttribute('aria-label', 'Which story to play');
      scenes.forEach(function (sc, i) {
        var b = make('button', '', sc.label || 'Part ' + (i + 1));
        b.type = 'button';
        b.addEventListener('click', function () { stop(); state.scene = i; state.step = 0; paint(false); });
        seg.appendChild(b);
        segs.push(b);
      });
      row.appendChild(seg);
      player.appendChild(row);
    }
    var say = make('p', 'say');
    say.setAttribute('aria-live', 'polite');
    player.appendChild(say);
    var stateBox = make('dl', 'state');
    stateBox.hidden = true;
    player.appendChild(stateBox);
    var bar = make('div', 'bar');
    var go = make('button', 'go', 'Play'); go.type = 'button';
    var prev = make('button'); prev.type = 'button'; prev.innerHTML = icon('M7.5 2l-4 4 4 4'); prev.setAttribute('aria-label', 'Previous step');
    var next = make('button'); next.type = 'button'; next.innerHTML = icon('M4.5 2l4 4-4 4'); next.setAttribute('aria-label', 'Next step');
    var range = make('input'); range.type = 'range'; range.min = 0; range.step = 1; range.setAttribute('aria-label', 'Step');
    var at = make('span', 'at');
    var speed = make('button', '', '1×'); speed.type = 'button'; speed.setAttribute('aria-label', 'Playback speed, 1 times');
    [go, prev, next, range, at, speed].forEach(function (el) { bar.appendChild(el); });
    player.appendChild(bar);
    var cap = $('figcaption', fig);
    fig.insertBefore(player, cap);
    fig.classList.add('playing');

    function count() { return scenes[state.scene].says.length; }

    function middle(edge) {
      if (edge.tagName.toLowerCase() === 'path') { try { return edge.getPointAtLength(edge.getTotalLength() / 2); } catch (err) { return null; } }
      return { x: (Number(edge.getAttribute('x1')) + Number(edge.getAttribute('x2'))) / 2, y: (Number(edge.getAttribute('y1')) + Number(edge.getAttribute('y2'))) / 2 };
    }
    // What a message is called: data-msg on the arrow or its step, or else the label drawn beside the arrow.
    function messages(edges, labels) {
      var free = labels.slice();
      return edges.map(function (edge) {
        var own = edge.getAttribute('data-msg');
        if (own === null && edge.parentNode.getAttribute && edges.length === 1) own = edge.parentNode.getAttribute('data-msg');
        if (own !== null) return { text: own, label: null };
        var mid = middle(edge), best = null, near = 46;
        if (!mid) return null;
        free.forEach(function (t) {
          var b = t.getBBox();
          var d = Math.hypot(b.x + b.width / 2 - mid.x, b.y + b.height / 2 - mid.y);
          if (d < near) { near = d; best = t; }
        });
        if (!best) return null;
        free.splice(free.indexOf(best), 1);
        var said = best.textContent.replace(/^\s*\d+[.)]\s+/, '').trim();
        return /^\d+$/.test(said) ? null : { text: said, label: best };
      });
    }
    function stepParts(k) {
      return scenes[state.scene].parts.filter(function (el) { return Number(el.getAttribute('data-s')) === k; });
    }
    function packets(k) {
      if (calm) return;
      var given = scenes[state.scene].msgs[k - 1];   // null: use the labels in the drawing
      if (given === 'none') return;
      var edges = [], labels = [];
      stepParts(k).forEach(function (group) {
        if (group.getAttribute('data-packet') === 'none') return;
        var back = group.getAttribute('data-packet') === 'back';
        (group.matches('.e') ? [group] : []).concat($$('.e', group)).forEach(function (e) { e.__back = back; edges.push(e); });
        (group.tagName.toLowerCase() === 'text' ? [group] : $$('text', group)).forEach(function (t) {
          var text = t.textContent.trim();
          if (text && text.length <= 30 && !inBox(t.getBBox())) labels.push(t);
        });
      });
      // A line with no arrowhead is a bracket or a marker, not a path, unless the step names a message for it.
      var arrows = edges.filter(function (e) { return !e.classList.contains('none') || e.hasAttribute('data-msg'); });
      edges = (arrows.length || given === null ? arrows : edges).slice(0, 8);
      var named = messages(edges, labels);
      var inTurn = false;
      if (given !== null) {
        var list = given.split('|');
        inTurn = list.length > 1;
        named = edges.map(function (edge, n) {
          var text = (inTurn ? list[n] || '' : list[0]).trim();
          return { text: text, label: named[n] ? named[n].label : null };
        });
      }
      var wait = 0;
      travel = 0;
      edges.forEach(function (edge, n) {
        var a, b, len = 0, isPath = edge.tagName.toLowerCase() === 'path';
        if (isPath) { try { len = edge.getTotalLength(); } catch (err) { return; } if (!len) return; }
        else if (edge.tagName.toLowerCase() === 'line') {
          a = [Number(edge.getAttribute('x1')), Number(edge.getAttribute('y1'))];
          b = [Number(edge.getAttribute('x2')), Number(edge.getAttribute('y2'))];
        } else return;
        var kind = ['sig', 'store', 'async', 'fault'].filter(function (c) { return edge.classList.contains(c); })[0] || 'ink';
        var msg = named[n] && named[n].text ? named[n] : null;
        var token = doc.createElementNS(NS, 'g');
        token.setAttribute('class', 'packet ' + kind + (msg ? ' chip' : ''));
        if (msg) {
          var rect = doc.createElementNS(NS, 'rect');
          var text = doc.createElementNS(NS, 'text');
          text.textContent = msg.text;
          token.appendChild(rect); token.appendChild(text);
          svg.appendChild(token);
          var w = text.getComputedTextLength() + 14;
          rect.setAttribute('x', -w / 2); rect.setAttribute('y', -9); rect.setAttribute('width', w); rect.setAttribute('height', 18); rect.setAttribute('rx', 9);
          if (msg.label) msg.label.classList.add('is-carried');
        } else {
          var dot = doc.createElementNS(NS, 'circle');
          dot.setAttribute('r', 5.5);
          token.appendChild(dot);
          svg.appendChild(token);
        }
        var back = edge.__back;
        var t0 = null;
        var dur = (msg ? 1150 : 750) / state.speed;
        var delay = wait;
        if (inTurn) { wait += dur; token.style.visibility = 'hidden'; }
        var frame = function (now) {
          if (t0 === null) t0 = now;
          if (now - t0 < delay) { raf.push(requestAnimationFrame(frame)); return; }
          token.style.visibility = '';
          var q = Math.min(1, (now - t0 - delay) / dur);
          var e = q < 0.5 ? 2 * q * q : 1 - Math.pow(-2 * q + 2, 2) / 2;
          if (back) e = 1 - e;
          var x, y;
          if (isPath) { var p = edge.getPointAtLength(e * len); x = p.x; y = p.y; }
          else { x = a[0] + (b[0] - a[0]) * e; y = a[1] + (b[1] - a[1]) * e; }
          token.setAttribute('transform', 'translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ')');
          if (q < 1) raf.push(requestAnimationFrame(frame));
          else { token.remove(); if (msg && msg.label) msg.label.classList.remove('is-carried'); }
        };
        raf.push(requestAnimationFrame(frame));
        travel = Math.max(travel, delay + dur);
      });
    }

    // On a narrow screen the drawing scrolls sideways inside its frame.
    // Bring the part that belongs to the current step into view.
    function follow(k) {
      var frame = $('.frame', fig);
      if (!frame || frame.scrollWidth <= frame.clientWidth + 1) return;
      var to = 0;
      if (k > 0) {
        var fr = frame.getBoundingClientRect(), lo = Infinity, hi = -Infinity;
        $$('.is-now', svg).forEach(function (el) {
          var r = el.getBoundingClientRect();
          if (!r.width && !r.height) return;
          lo = Math.min(lo, r.left); hi = Math.max(hi, r.right);
        });
        if (lo === Infinity) return;
        if (lo >= fr.left + 8 && hi <= fr.right - 8) return; // already in view
        var mid = (lo + hi) / 2 - fr.left + frame.scrollLeft;
        to = hi - lo > fr.width - 16 ? lo - fr.left + frame.scrollLeft - 12 : mid - fr.width / 2;
        to = Math.max(0, Math.min(to, frame.scrollWidth - frame.clientWidth));
      }
      if (frame.scrollTo) frame.scrollTo({ left: to, behavior: calm ? 'auto' : 'smooth' }); else frame.scrollLeft = to;
    }

    function paint(forward) {
      raf.forEach(cancelAnimationFrame); raf = [];
      $$('.packet', svg).forEach(function (p) { p.remove(); });
      $$('.is-carried', svg).forEach(function (t) { t.classList.remove('is-carried'); });
      var n = count();
      var k = state.step;
      var shown = k === 0 ? n : k; // the overview shows the finished drawing
      scenes.forEach(function (sc, i) {
        var mine = i === state.scene;
        if (sc.id) sc.scopes.forEach(function (scope) { scope.style.opacity = k > 0 && !mine ? 0.28 : ''; });
        sc.parts.forEach(function (el) {
          var s = Number(el.getAttribute('data-s'));
          var e = el.hasAttribute('data-e') ? Number(el.getAttribute('data-e')) : Infinity;
          var cur = mine ? shown : sc.says.length;
          el.classList.toggle('is-later', mine && k > 0 && s > cur);
          el.classList.toggle('on', cur <= e);
          var now = mine && k > 0 && s === k;
          el.classList.toggle('is-now', now);
          el.classList.remove('pulse');
          if (now && forward && !calm) { void el.getBoundingClientRect(); el.classList.add('pulse'); }
        });
      });
      travel = 0;
      if (k > 0 && forward) packets(k);
      follow(k);
      var st = scenes[state.scene].states;
      var nowState = k > 0 ? st[k - 1] : '';
      stateBox.hidden = !nowState;
      stateBox.innerHTML = '';
      if (nowState) {
        var before = {};
        if (k > 1) pairs(st[k - 2]).forEach(function (kv) { before[kv[0]] = kv[1]; });
        pairs(nowState).forEach(function (kv) {
          var cell = make('div', k > 1 && before[kv[0]] !== kv[1] ? 'chg' : '');
          cell.appendChild(make('dt', '', kv[0]));
          cell.appendChild(make('dd', '', kv[1]));
          stateBox.appendChild(cell);
        });
      }
      segs.forEach(function (b, i) { b.setAttribute('aria-pressed', String(i === state.scene)); });
      range.max = n;
      range.value = k;
      at.textContent = k === 0 ? 'All ' + n + ' steps' : 'Step ' + k + ' of ' + n;
      say.innerHTML = k === 0
        ? 'Press Play to build this figure up one step at a time, or use the arrows to move through it yourself.'
        : '<b>' + k + '.</b> ' + scenes[state.scene].says[k - 1];
      go.textContent = state.playing ? 'Pause' : k >= n ? 'Replay' : 'Play';
      prev.disabled = k === 0;
      next.disabled = k >= n;
    }

    function stop() { clearTimeout(timer); timer = null; state.playing = false; }
    function wait() {
      var words = (scenes[state.scene].says[state.step - 1] || '').replace(/<[^>]+>/g, '').split(/\s+/).length;
      return Math.max(1600 / state.speed, words * 240 / state.speed, travel + 500);
    }
    function tick() {
      if (state.step >= count()) { stop(); paint(false); return; }
      state.step += 1;
      state.playing = state.step < count();
      paint(true);
      if (state.playing) timer = setTimeout(tick, wait());
    }
    go.addEventListener('click', function () {
      if (state.playing) { stop(); paint(false); return; }
      if (state.step >= count()) state.step = 0;
      state.playing = true;
      tick();
    });
    prev.addEventListener('click', function () { stop(); state.step = Math.max(0, state.step - 1); paint(false); });
    next.addEventListener('click', function () { stop(); state.step = Math.min(count(), state.step + 1); paint(true); });
    range.addEventListener('input', function () { stop(); var to = Number(range.value); var fwd = to === state.step + 1; state.step = to; paint(fwd); });
    speed.addEventListener('click', function () {
      state.speed = state.speed === 1 ? 2 : state.speed === 2 ? 0.5 : 1;
      speed.textContent = state.speed + '×';
      speed.setAttribute('aria-label', 'Playback speed, ' + state.speed + ' times');
    });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        if (!entries[0].isIntersecting && state.playing) { stop(); paint(false); }
      }).observe(fig);
    }
    paint(false);
  });

  // ------------------------------------------------------------ values on hover, focus or tap
  var tip = null;
  function hideTip() { if (tip) { tip.remove(); tip = null; } }
  function showTip(el, x, y) {
    hideTip();
    var parts = el.getAttribute('data-tip').split('|');
    tip = make('div', 'tip');
    tip.setAttribute('role', 'tooltip');
    tip.appendChild(make('b', '', parts[0]));
    parts.slice(1).forEach(function (line) { tip.appendChild(make('div', '', line)); });
    doc.body.appendChild(tip);
    var w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.min(Math.max(8, x - w / 2), window.innerWidth - w - 8) + 'px';
    tip.style.top = (y - h - 14 < 8 ? y + 18 : y - h - 14) + 'px';
  }
  // One tab stop per chart; the arrow keys move between its values.
  $$('svg.dg').forEach(function (svg) {
    var marks = $$('[data-tip]', svg);
    if (!marks.length) return;
    marks.forEach(function (el, i) {
      el.setAttribute('tabindex', i === 0 ? '0' : '-1');
      el.addEventListener('keydown', function (e) {
        var to = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? i + 1
          : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? i - 1
          : e.key === 'Home' ? 0 : e.key === 'End' ? marks.length - 1 : null;
        if (e.key === 'Escape') { hideTip(); return; }
        if (to === null || to < 0 || to >= marks.length) return;
        e.preventDefault();
        marks.forEach(function (m) { m.setAttribute('tabindex', '-1'); });
        marks[to].setAttribute('tabindex', '0');
        marks[to].focus();
      });
    });
  });
  $$('.dg [data-tip]').forEach(function (el) {
    el.setAttribute('role', 'img');
    if (!el.getAttribute('aria-label')) el.setAttribute('aria-label', el.getAttribute('data-tip').replace(/\|/g, ', '));
    var at = function () { var r = el.getBoundingClientRect(); showTip(el, r.left + r.width / 2, r.top); };
    el.addEventListener('pointerenter', at);
    if (el.classList.contains('hit')) el.addEventListener('pointermove', function (e) { if (e.pointerType === 'mouse') showTip(el, e.clientX, e.clientY - 6); });
    el.addEventListener('focus', at);
    el.addEventListener('click', function (e) { e.stopPropagation(); at(); });
    el.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') hideTip(); });
    el.addEventListener('blur', hideTip);
  });
  doc.addEventListener('click', hideTip);
  window.addEventListener('scroll', hideTip, { passive: true });

  // ------------------------------------------------------------ enlarged view
  var zoom = null;
  $$('figure.fig').forEach(function (fig) {
    var frame = $('.frame', fig);
    if (!frame || !('showModal' in doc.createElement('dialog'))) return;
    var tools = make('div', 'fig-tools');
    var b = make('button', '', 'Enlarge');
    b.type = 'button';
    b.setAttribute('aria-label', 'Enlarge this figure');
    b.addEventListener('click', function () {
      if (!zoom) {
        zoom = make('dialog', 'zoom');
        zoom.setAttribute('aria-label', 'Enlarged figure');
        var top = make('div', 'zoom-bar');
        var close = make('button', 'btn ghost small', 'Close');
        close.type = 'button';
        close.addEventListener('click', function () { zoom.close(); });
        top.appendChild(close);
        zoom.appendChild(top);
        zoom.addEventListener('click', function (e) { if (e.target === zoom) zoom.close(); });
        doc.body.appendChild(zoom);
      }
      var mark = doc.createComment('figure');
      fig.parentNode.insertBefore(mark, fig);
      zoom.appendChild(fig);
      zoom.addEventListener('close', function back() {
        zoom.removeEventListener('close', back);
        mark.parentNode.insertBefore(fig, mark);
        mark.remove();
        b.focus();
      });
      zoom.showModal();
    });
    tools.appendChild(b);
    var caption = $('figcaption', fig);
    if (caption) caption.insertBefore(tools, caption.firstChild); else fig.appendChild(tools);
  });
})();
