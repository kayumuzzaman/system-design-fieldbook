#!/usr/bin/env python3
"""Browser checks for the built site. Optional: the build itself needs only Node.

    node build.mjs --strict && python3 tools/check.py [chapter-slug ...]

Needs Python 3 with Playwright and a Chromium (pip install playwright; playwright install chromium).
With chapter slugs, only those chapters are checked. With no arguments everything is, including the
reader features that are not tied to one chapter. It reports, and exits with status 1, if:

  pages    a page logs an error, scrolls sideways, or a block sticks out of the text column
           (desktop light, phone dark, tablet light)
  figures  a playable figure has a step that draws nothing, a caption that does not change, a ghost
           label under a label of the current step, controls that overflow, a message chip that is
           empty or far wider than its arrow, a state readout that never changes, or, on a phone, a
           step whose drawing is not scrolled into view
  charts   a chart value has no size, lies outside the drawing, shows no readout on hover, or cannot
           be reached with the arrow keys
  widgets  a calculator's default numbers or default drawing in the markup differ from what the
           script produces, or an input at its limits produces NaN, "undefined" or an error
  reader   (no arguments only) theme, search, reading progress, the section list, previews, copy,
           Enlarge, Play and the phone layout do not behave as described on the "How to read" page
  notes    (no arguments only) highlighting, notes, the notes page, export, restore, or finding a
           highlight again after the chapter changed, does not work
"""
import asyncio, functools, glob, http.server, json, os, re, socketserver, sys, threading
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, 'dist')

PAGE_JS = """()=>{const d=document.documentElement,main=document.querySelector('main'),mr=main.getBoundingClientRect(),bad=[];
main.querySelectorAll('.chapter > *, .home > *').forEach(el=>{const r=el.getBoundingClientRect();if(r.right>mr.right+1||r.left<mr.left-1)bad.push(el.tagName.toLowerCase()+'.'+el.className)});
return {over:d.scrollWidth-d.clientWidth,bad:bad.slice(0,3)}}"""

STEP_JS = """f=>{const svg=f.querySelector('svg.dg'),now=[...svg.querySelectorAll('.is-now')],R=e=>e.getBoundingClientRect();
const hit=(a,b)=>!(a.right<=b.left+1||b.right<=a.left+1||a.bottom<=b.top+1||b.bottom<=a.top+1);
const texts=g=>g.tagName==='text'?[g]:[...g.querySelectorAll('text')];
const nowT=now.flatMap(texts).filter(t=>!t.closest('.is-later'));
const ghosts=[...svg.querySelectorAll('.is-later:not(.hide):not([data-e])')].flatMap(texts);
const coll=[];for(const a of nowT)for(const b of ghosts)if(hit(R(a),R(b)))coll.push(a.textContent.slice(0,24)+' / '+b.textContent.slice(0,24));
const bar=f.querySelector('.player .bar'),fr=R(f.querySelector('.frame'));let lo=1e9,hi=-1e9;
now.forEach(e=>{const r=R(e);if(r.width||r.height){lo=Math.min(lo,r.left);hi=Math.max(hi,r.right)}});
const chips=[...svg.querySelectorAll('.packet.chip')].map(c=>({t:c.querySelector('text').textContent,w:c.querySelector('rect').getBBox().width}));
const st=f.querySelector('.player .state');
return {now:now.length,later:svg.querySelectorAll('.is-later').length,coll:coll.slice(0,2),say:f.querySelector('.player .say').textContent,
over:Math.max(bar.scrollWidth-bar.clientWidth,f.scrollWidth-f.clientWidth),w:hi-lo,fw:fr.width,outL:fr.left-lo,outR:hi-fr.right,
chips:chips,state:st&&!st.hidden?st.textContent:'',stateOver:st?st.scrollWidth-st.clientWidth:0}}"""

TIP_JS = """f=>{const s=f.querySelector('svg.dg').getBoundingClientRect();return [...f.querySelectorAll('[data-tip]')].filter(e=>{const r=e.getBoundingClientRect();
return r.width<1||r.height<1||r.left<s.left-2||r.right>s.right+2||r.top<s.top-2||r.bottom>s.bottom+2}).length}"""

WIDGET_OF = """d=>[...d.querySelectorAll('.widget[data-widget]')].map(w=>{const o={};w.querySelectorAll('[data-out]').forEach(e=>o[e.getAttribute('data-out')]=e.textContent.trim());
const v=w.querySelector('svg.dg');return [w.getAttribute('data-widget'),o,v?v.innerHTML:null]})"""
WIDGET_LIVE = '()=>(' + WIDGET_OF + ')(document)'
WIDGET_STATIC = "async u=>{const t=await (await fetch(u)).text();return (" + WIDGET_OF + ")(new DOMParser().parseFromString(t,'text/html'))}"

SELECT = """([a,o1,b,o2])=>{const el=s=>document.querySelector(s);
const at=(e,off)=>{const w=document.createTreeWalker(e,NodeFilter.SHOW_TEXT);let n,acc=0;while((n=w.nextNode())){if(acc+n.data.length>=off)return [n,off-acc];acc+=n.data.length}return [e,0]};
const r=document.createRange(),s=at(el(a),o1),e=at(el(b),o2);r.setStart(s[0],s[1]);r.setEnd(e[0],e[1]);const g=getSelection();g.removeAllRanges();g.addRange(r);return g.toString()}"""
TAG = "document.querySelectorAll('.chapter > p').forEach((p,i)=>p.setAttribute('data-t','p'+i))"


def serve():
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *args):
            pass
    srv = socketserver.TCPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=DIST))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, 'http://127.0.0.1:%d/' % srv.server_address[1]


async def main():
    only = set(sys.argv[1:])
    plan = json.load(open(os.path.join(ROOT, 'figures.plan.json')))
    pages = sorted(os.path.basename(p) for p in glob.glob(os.path.join(DIST, '*.html')))
    if only:
        pages = [p for p in pages if p[:-5] in only]
    figs = [(s, f, k) for s, d in plan.items() for f, k in d.items() if k != 'still' and (not only or s in only)]
    srv, base = serve()
    problems = []
    count = dict(pages=0, steps=0, chips=0, states=0, values=0, widgets=0, drawings=0, trials=0, reader=0, notes=0)

    def expect(area, name, cond, detail=''):
        count[area] += 1
        if not cond:
            problems.append((area, name, detail))

    async with async_playwright() as p:
        browser = await p.chromium.launch()

        async def context(w, h, scheme='light', phone=False, motion='reduce', **more):
            ctx = await browser.new_context(viewport={'width': w, 'height': h}, color_scheme=scheme, is_mobile=phone,
                                            has_touch=phone, reduced_motion=motion, **more)
            pg = await ctx.new_page()
            errs = []
            pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
            pg.on('pageerror', lambda e: errs.append(str(e)))
            return ctx, pg, errs

        # ---------------------------------------------------------------- pages
        for w, h, scheme, phone in [(1440, 900, 'light', False), (390, 844, 'dark', True), (820, 1100, 'light', False)]:
            ctx, pg, errs = await context(w, h, scheme, phone)
            for name in pages:
                errs.clear()
                await pg.goto(base + name)
                await pg.wait_for_timeout(120)
                r = await pg.evaluate(PAGE_JS)
                count['pages'] += 1
                if errs or r['over'] > 0 or r['bad']:
                    problems.append(('page', w, name, errs[:2], r))
            await ctx.close()

        # ---------------------------------------------------------------- playable figures
        for w, h, scheme, phone, motion in [(1440, 900, 'light', False, 'no-preference'), (390, 844, 'dark', True, 'reduce')]:
            ctx, pg, errs = await context(w, h, scheme, phone, motion)
            cur = None
            for s, f, kind in figs:
                if kind != 'play':
                    continue
                if s != cur:
                    await pg.goto(base + s + '.html')
                    await pg.wait_for_timeout(150)
                    cur = s
                fig = pg.locator('#' + f)
                await fig.scroll_into_view_if_needed()
                scenes = await fig.locator('.player .seg button').count()
                for sc in range(max(1, scenes)):
                    if scenes:
                        await fig.locator('.player .seg button').nth(sc).click()
                    n = int(await fig.locator('.player input[type=range]').get_attribute('max'))
                    prev, seen = None, []
                    for i in range(1, n + 1):
                        await fig.locator('.player button[aria-label="Next step"]').click()
                        if phone:
                            await pg.wait_for_timeout(40)
                        r = await fig.evaluate(STEP_JS)
                        count['steps'] += 1
                        tag = ('figure', w, '%s#%s' % (s, f), 'scene %d step %d' % (sc + 1, i))
                        if r['now'] == 0: problems.append(tag + ('draws nothing new',))
                        if r['coll']: problems.append(tag + ('ghost label under a current label', r['coll']))
                        if r['say'] == prev: problems.append(tag + ('caption did not change',))
                        if r['over'] > 1 or r['stateOver'] > 1: problems.append(tag + ('controls overflow',))
                        if i == n and r['later']: problems.append(tag + ('parts still hidden at the last step',))
                        for chip in r['chips']:
                            count['chips'] += 1
                            if not chip['t'].strip() or chip['w'] > 230:
                                problems.append(tag + ('message chip is empty or too long', chip['t']))
                        if r['state']:
                            seen.append(r['state'])
                        if phone:
                            shown = r['outL'] <= 14 if r['w'] > r['fw'] - 16 else (r['outL'] <= 0 and r['outR'] <= 0)
                            if not shown: problems.append(tag + ('not scrolled into view',))
                        prev = r['say']
                    if seen:
                        count['states'] += len(seen)
                        if len(set(seen)) == 1 and n > 1 and len(seen) > 1 and scenes <= 1:
                            problems.append(('figure', w, '%s#%s' % (s, f), 'the state readout never changes'))
                if errs:
                    problems.append(('figure', w, s, f, errs[:2]))
                    errs.clear()
            await ctx.close()

        # ---------------------------------------------------------------- charts
        ctx, pg, errs = await context(1440, 1000)
        cur = None
        for s, f, kind in figs:
            if kind != 'values':
                continue
            if s != cur:
                await pg.goto(base + s + '.html')
                await pg.wait_for_timeout(200)
                cur = s
            fig = pg.locator('#' + f)
            await fig.scroll_into_view_if_needed()
            await pg.evaluate('window.scrollBy(0,-160)')
            await pg.wait_for_timeout(80)
            marks = fig.locator('[data-tip]')
            n = await marks.count()
            count['values'] += n
            tag = ('chart', '%s#%s' % (s, f))
            if await fig.evaluate(TIP_JS): problems.append(tag + ('a value has no size or lies outside the drawing',))
            await marks.nth(n // 2).hover(force=True)
            await pg.wait_for_timeout(120)
            if not await pg.locator('.tip').count(): problems.append(tag + ('no readout on hover',))
            await pg.mouse.move(5, 5)
            if n > 1:
                await marks.first.focus()
                await pg.keyboard.press('ArrowRight')
                await pg.wait_for_timeout(50)
                got = await pg.evaluate("document.activeElement && document.activeElement.getAttribute('data-tip')")
                if got != await marks.nth(1).get_attribute('data-tip'): problems.append(tag + ('arrow keys do not move',))
                await pg.keyboard.press('Escape')
        if errs: problems.append(('chart', errs[:2]))
        await ctx.close()

        # ---------------------------------------------------------------- calculators
        ctx, pg, errs = await context(1280, 900)
        for name in pages:
            if 'data-widget=' not in open(os.path.join(DIST, name), encoding='utf-8').read():
                continue
            await pg.goto(base + name)
            await pg.wait_for_timeout(250)
            live = await pg.evaluate(WIDGET_LIVE)
            static = await pg.evaluate(WIDGET_STATIC, base + name)
            for (wn, a, da), (_, b, db) in zip(static, live):
                count['widgets'] += 1
                diff = {k: (a[k], b.get(k)) for k in a if a[k] != b.get(k)}
                if diff: problems.append(('widget', name, wn, 'default numbers differ', diff))
                if db is not None:
                    count['drawings'] += 1
                    if da != db: problems.append(('widget', name, wn, 'default drawing differs: run tools/drawings.py'))
            for wn, _, _ in live:
                root = pg.locator('[data-widget="%s"]' % wn)
                ins = root.locator('input[type=number]')
                for i in range(await ins.count()):
                    e = ins.nth(i)
                    lo, hi, start = await e.get_attribute('min'), await e.get_attribute('max'), await e.input_value()
                    for value in [lo or '0', hi or str(float(start) * 1000), str(float(start) * 7.3), '', '-5', '0']:
                        await e.fill(value)
                        count['trials'] += 1
                        text = await root.evaluate("w=>{const v=w.querySelector('svg.dg');return (v?v.innerHTML:'')+'|'+[...w.querySelectorAll('[data-out]')].map(e=>e.textContent).join('|')}")
                        m = re.search(r'NaN|Infinity|undefined|null', text)
                        if m: problems.append(('widget', name, wn, 'input %s = %r gives %s' % (await e.get_attribute('name'), value, m.group(0))))
                        if errs:
                            problems.append(('widget', name, wn, errs[:1]))
                            errs.clear()
                    await e.fill(start)
        await ctx.close()

        if not only:
            chapter = next(s for s, d in plan.items() if any(k == 'play' for k in d.values()) and
                           'data-widget=' in open(os.path.join(DIST, s + '.html'), encoding='utf-8').read() and
                           'class="code"' in open(os.path.join(DIST, s + '.html'), encoding='utf-8').read())
            play = next(f for f, k in plan[chapter].items() if k == 'play')

            # ------------------------------------------------------------ reader features, desktop
            ctx, pg, errs = await context(1440, 900, motion='no-preference')
            await ctx.grant_permissions(['clipboard-read', 'clipboard-write'])
            await pg.goto(base + chapter + '.html')
            await pg.wait_for_timeout(300)
            await pg.click('#theme-btn')
            dark = await pg.evaluate("document.documentElement.getAttribute('data-theme')")
            await pg.reload()
            await pg.wait_for_timeout(200)
            expect('reader', 'theme switches and is remembered', dark == 'dark' and await pg.evaluate("document.documentElement.getAttribute('data-theme')") == 'dark')
            await pg.click('#theme-btn')
            await pg.keyboard.press('Control+k')
            await pg.wait_for_timeout(100)
            expect('reader', 'Ctrl K opens search', await pg.evaluate("document.querySelector('#palette').open"))
            await pg.keyboard.type('quorum')
            await pg.wait_for_timeout(150)
            groups = await pg.evaluate("[...document.querySelectorAll('#palette-out li.group')].map(l=>l.textContent)")
            expect('reader', 'search finds terms and sections', 'Terms' in groups and 'Sections' in groups, groups)
            await pg.keyboard.press('Escape')
            await pg.wait_for_timeout(100)
            expect('reader', 'Escape closes search', not await pg.evaluate("document.querySelector('#palette').open"))
            await pg.keyboard.press('/')
            await pg.keyboard.type('glossary')
            await pg.wait_for_timeout(150)
            await pg.keyboard.press('Enter')
            await pg.wait_for_timeout(400)
            expect('reader', 'the / key opens search and Enter goes to the result', 'glossary' in pg.url, pg.url)
            terms = await pg.locator('.glossary dt').count()
            expect('reader', 'the glossary lists the terms', terms > 100 and await pg.locator('.az a').count() > 15, terms)
            await pg.goto(base + chapter + '.html')
            await pg.wait_for_timeout(300)
            await pg.locator('[data-mark-read]').first.click()
            await pg.wait_for_timeout(100)
            expect('reader', 'Mark as read updates the count and the contents', '1 of ' in await pg.locator('#read-count').text_content() and
                   await pg.evaluate("document.querySelector('.sidebar li[data-slug=\"%s\"]').classList.contains('read')" % chapter))
            await pg.locator('[data-mark-read]').first.click()
            await pg.evaluate('window.scrollTo(0, document.body.scrollHeight*0.5)')
            await pg.wait_for_timeout(400)
            now = await pg.evaluate("[...document.querySelectorAll('#trace li')].findIndex(l=>l.classList.contains('now'))")
            expect('reader', 'the section list follows the scroll position', now > 0 and 'left' in await pg.locator('#rail-time').text_content(), now)
            await pg.evaluate('window.scrollTo(0, document.body.scrollHeight)')
            await pg.wait_for_timeout(500)
            expect('reader', 'reaching the end marks the chapter read', await pg.evaluate("JSON.parse(localStorage.getItem('book-read')||'{}')['%s']===1" % chapter))
            d = pg.locator('.quiz details').first
            await d.scroll_into_view_if_needed()
            await d.locator('summary').click()
            await pg.wait_for_timeout(100)
            await d.locator('.grade button').nth(1).click()
            expect('reader', 'a question can be marked to ask again', await d.evaluate("e=>e.classList.contains('again')"))
            await pg.evaluate('window.scrollTo(0, document.body.scrollHeight*0.4)')
            await pg.wait_for_timeout(1800)
            await pg.evaluate('window.scrollBy(0,40)')
            await pg.wait_for_timeout(300)
            await pg.goto(base + 'index.html')
            await pg.wait_for_timeout(300)
            card = await pg.locator('#continue-card').text_content()
            expect('reader', 'the contents page shows where you stopped', 'Where you stopped' in card and (chapter + '.html#') in await pg.locator('#continue-card').get_attribute('href'), card)
            expect('reader', 'the contents page shows questions to try again', await pg.locator('#again-card').is_visible())
            await pg.goto(base + chapter + '.html')
            await pg.wait_for_timeout(300)
            x = pg.locator('a.xref').first
            await x.scroll_into_view_if_needed()
            await x.hover()
            await pg.wait_for_timeout(150)
            expect('reader', 'a cross-reference shows a preview', await pg.locator('.peek').count() == 1)
            await pg.mouse.move(2, 2)
            cb = pg.locator('.code .copy-btn').first
            await cb.scroll_into_view_if_needed()
            await cb.click()
            await pg.wait_for_timeout(100)
            expect('reader', 'Copy copies the code', await pg.evaluate('navigator.clipboard.readText()') == await pg.evaluate("document.querySelector('.code code').textContent"))
            wdg = pg.locator('.widget').first
            await wdg.scroll_into_view_if_needed()
            paired = await wdg.evaluate("w=>[...w.querySelectorAll('input[type=number]')].every(n=>n.nextElementSibling&&n.nextElementSibling.type==='range')")
            before = await wdg.locator('.verdict').text_content()
            rng = wdg.locator('input[type=number] + input[type=range]').first
            bb = await rng.bounding_box()
            await pg.mouse.click(bb['x'] + bb['width'] * 0.8, bb['y'] + bb['height'] / 2)
            await pg.wait_for_timeout(100)
            expect('reader', 'every calculator number has a slider that drives the result', paired and before != await wdg.locator('.verdict').text_content())
            fg = pg.locator('#' + play)
            await fg.scroll_into_view_if_needed()
            await fg.locator('.fig-tools button').click()
            await pg.wait_for_timeout(200)
            inside = await pg.evaluate("document.querySelector('dialog.zoom').open && !!document.querySelector('dialog.zoom #%s')" % play)
            await pg.keyboard.press('Escape')
            await pg.wait_for_timeout(200)
            expect('reader', 'Enlarge opens the figure and Escape puts it back', inside and await pg.evaluate("!!document.querySelector('.chapter #%s')" % play))
            await fg.scroll_into_view_if_needed()
            await fg.locator('.player .go').click()
            await pg.wait_for_timeout(3600)
            at = await fg.locator('.player .at').text_content()
            await fg.locator('.player .go').click()
            await pg.wait_for_timeout(3600)
            expect('reader', 'Play advances by itself and Pause stops it',
                   at.startswith('Step') and not at.startswith('Step 1 ') and at == await fg.locator('.player .at').text_content(), at)
            expect('reader', 'no script errors on a desktop', not errs, errs[:2])
            await ctx.close()

            # ------------------------------------------------------------ reader features, phone
            ctx, pg, errs = await context(390, 844, phone=True)
            await pg.goto(base + chapter + '.html')
            await pg.wait_for_timeout(300)
            await pg.tap('#menu-btn')
            await pg.wait_for_timeout(250)
            expect('reader', 'phone: the contents open full screen', await pg.evaluate("(()=>{const s=document.querySelector('#sidebar').getBoundingClientRect();return s.left>=0&&s.width>=380&&s.height>700})()"))
            await pg.tap('#side-close')
            await pg.wait_for_timeout(250)
            await pg.evaluate('window.scrollTo(0, 3000)')
            await pg.wait_for_timeout(300)
            await pg.tap('#dock-here')
            await pg.wait_for_timeout(300)
            expect('reader', 'phone: the bottom bar opens the section list', await pg.locator('#sheet li a').count() > 3 and await pg.evaluate("document.querySelector('#sheet').classList.contains('open')"))
            await pg.locator('#sheet li a').nth(2).tap()
            await pg.wait_for_timeout(500)
            expect('reader', 'phone: choosing a section closes the list and goes there', '#' in pg.url and not await pg.evaluate("document.querySelector('#sheet').classList.contains('open')"))
            expect('reader', 'phone: the bottom bar links to the next chapter', (await pg.locator('.dock a').last.get_attribute('href') or '').endswith('.html'))
            expect('reader', 'no script errors on a phone', not errs, errs[:2])
            await ctx.close()

            # ------------------------------------------------------------ highlights and notes
            ctx, pg, errs = await context(1440, 900, accept_downloads=True)
            url = base + chapter + '.html'
            await pg.goto(url)
            await pg.wait_for_timeout(300)
            await pg.evaluate(TAG)
            text = await pg.evaluate(SELECT, ['[data-t="p3"]', 10, '[data-t="p3"]', 70])
            await pg.wait_for_timeout(350)
            expect('notes', 'selecting text shows the bar', await pg.locator('.hl-bar').is_visible())
            await pg.locator('.hl-bar button').first.click()
            await pg.wait_for_timeout(150)
            expect('notes', 'Highlight covers exactly the selected text', await pg.evaluate("[...document.querySelectorAll('mark.hl')].map(m=>m.textContent).join('')") == text.strip())
            await pg.evaluate(SELECT, ['[data-t="p5"]', 20, '[data-t="p6"]', 30])
            await pg.wait_for_timeout(350)
            await pg.locator('.hl-bar button').nth(1).click()
            await pg.wait_for_timeout(200)
            await pg.locator('.hl-pop textarea').fill('A note.\nOn two lines.')
            await pg.keyboard.press('Control+Enter')
            await pg.wait_for_timeout(150)
            kept = await pg.evaluate("JSON.parse(localStorage.getItem('book-notes')).items['%s']" % chapter)
            expect('notes', 'a note is stored with its highlight', len(kept) == 2 and len(kept[1]['segs']) >= 2 and kept[1]['note'].startswith('A note.'), kept)
            expect('notes', 'the section list counts them', '2 highlights, 1 with a note' in await pg.locator('#rail-marks').text_content())
            before = await pg.evaluate("[...document.querySelectorAll('mark.hl')].map(m=>[m.dataset.hl,m.textContent])")
            await pg.reload()
            await pg.wait_for_timeout(400)
            expect('notes', 'highlights return after a reload', before == await pg.evaluate("[...document.querySelectorAll('mark.hl')].map(m=>[m.dataset.hl,m.textContent])"))
            await pg.locator('mark.hl.noted').first.click()
            await pg.wait_for_timeout(150)
            expect('notes', 'clicking a highlight opens its note', (await pg.locator('.hl-pop textarea').input_value()).startswith('A note.'))
            await pg.keyboard.press('Escape')
            await pg.locator('mark.hl[tabindex="0"]').first.focus()
            await pg.keyboard.press('Enter')
            await pg.wait_for_timeout(120)
            expect('notes', 'Enter on a focused highlight opens the editor', await pg.locator('.hl-pop').count() == 1)
            await pg.keyboard.press('Escape')
            await pg.evaluate(TAG)
            await pg.evaluate(SELECT, ['[data-t="p8"]', 0, '[data-t="p8"]', 25])
            await pg.wait_for_timeout(350)
            await pg.keyboard.press('Alt+h')
            await pg.wait_for_timeout(150)
            expect('notes', 'Alt+H highlights the selection', len(await pg.evaluate("JSON.parse(localStorage.getItem('book-notes')).items['%s']" % chapter)) == 3)
            await pg.goto(base + 'notes.html')
            await pg.wait_for_timeout(400)
            expect('notes', 'the notes page lists them under the chapter', await pg.locator('.mark-item').count() == 3 and await pg.locator('#marks-' + chapter).count() == 1)
            async with pg.expect_download() as d1:
                await pg.locator('.marks-bar button', has_text='Save as Markdown').click()
            md = open(await (await d1.value).path(), encoding='utf-8').read()
            expect('notes', 'the Markdown file has the quotes and the note', md.count('> ') == 3 and 'A note.' in md)
            async with pg.expect_download() as d2:
                await pg.locator('.marks-bar button', has_text='Save a backup file').click()
            backup = await (await d2.value).path()
            await pg.locator('.mark-item .mark-meta a').first.click()
            await pg.wait_for_timeout(700)
            expect('notes', 'the link from the notes page lands on the highlight', '#hl-' in pg.url and await pg.evaluate(
                "(()=>{const m=document.getElementById(location.hash.slice(1));if(!m)return false;const r=m.getBoundingClientRect();return r.top>0&&r.bottom<innerHeight})()"))
            await pg.goto(base + 'notes.html')
            await pg.wait_for_timeout(300)
            pg.once('dialog', lambda dlg: asyncio.ensure_future(dlg.accept()))
            await pg.locator('.marks-bar button', has_text='Remove all').click()
            await pg.wait_for_timeout(300)
            expect('notes', 'Remove all empties the list', await pg.locator('.mark-item').count() == 0)
            await pg.locator('.marks-bar input[type=file]').set_input_files(backup)
            await pg.wait_for_timeout(400)
            expect('notes', 'Restore brings them back', await pg.locator('.mark-item').count() == 3)
            await pg.goto(base + 'index.html')
            await pg.wait_for_timeout(300)
            expect('notes', 'the contents page shows the notes card', await pg.locator('#marks-card').is_visible())
            await pg.evaluate("""s=>{const db=JSON.parse(localStorage.getItem('book-notes'));db.items[s][0].segs[0].b+=7;db.items[s][1].segs[0].q='text that is no longer in the chapter';localStorage.setItem('book-notes',JSON.stringify(db))}""", chapter)
            await pg.goto(url)
            await pg.wait_for_timeout(400)
            kept = await pg.evaluate("JSON.parse(localStorage.getItem('book-notes')).items['%s']" % chapter)
            expect('notes', 'a highlight whose paragraph moved is found again by its text', not kept[0].get('lost') and await pg.locator('mark[data-hl="%s"]' % kept[0]['id']).count() >= 1)
            expect('notes', 'a highlight whose text is gone is kept and marked as detached', kept[1].get('lost') is True)
            expect('notes', 'no script errors', not errs, errs[:2])
            await ctx.close()
            ctx, pg, errs = await context(390, 844, phone=True)
            await pg.goto(url)
            await pg.wait_for_timeout(300)
            await pg.evaluate(TAG)
            await pg.locator('[data-t="p3"]').scroll_into_view_if_needed()
            await pg.evaluate(SELECT, ['[data-t="p3"]', 10, '[data-t="p3"]', 60])
            await pg.wait_for_timeout(600)
            box = await pg.locator('.hl-bar').bounding_box()
            expect('notes', 'phone: the bar is on the screen', box and box['x'] >= 0 and box['x'] + box['width'] <= 390, box)
            await pg.locator('.hl-bar button').nth(1).tap()
            await pg.wait_for_timeout(300)
            box = await pg.locator('.hl-pop').bounding_box()
            expect('notes', 'phone: the note editor fits the screen', box and box['x'] >= 0 and box['x'] + box['width'] <= 390, box)
            await ctx.close()

        await browser.close()
    srv.shutdown()
    print('%(pages)d page views, %(steps)d figure steps (%(chips)d message chips, %(states)d state readouts), %(values)d chart values, '
          '%(widgets)d calculators (%(drawings)d drawings, %(trials)d input trials)' % count
          + ('' if only else ', %(reader)d reader checks, %(notes)d notes checks' % count))
    print('%d problem(s)' % len(problems))
    for x in problems[:80]:
        print('  ', x)
    sys.exit(1 if problems else 0)

asyncio.run(main())
