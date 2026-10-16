#!/usr/bin/env python3
"""Copy each calculator's default drawing into its chapter file.

    node build.mjs && python3 tools/drawings.py && node build.mjs

A calculator's script draws into <svg class="dg">. This opens every built page that has a calculator,
lets the script draw for the default numbers, and writes that drawing into src/chapters/<slug>.html, so
the page shows the same picture when scripts are off. Run it after changing drawing code or defaults.
Needs Python 3 with Playwright and Chromium.
"""
import asyncio, functools, glob, http.server, os, re, socketserver, threading
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'src', 'chapters')
DIST = os.path.join(ROOT, 'dist')
LIVE = """[...document.querySelectorAll('.widget[data-widget]')].map(w=>{const v=w.querySelector('svg.dg');
  return [w.getAttribute('data-widget'), v?v.getAttribute('viewBox'):null, v?v.innerHTML:null]})"""


def serve():
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *args):
            pass
    srv = socketserver.TCPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=DIST))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, 'http://127.0.0.1:%d/' % srv.server_address[1]


async def main():
    srv, base = serve()
    written = 0
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await (await browser.new_context(viewport={'width': 1280, 'height': 900})).new_page()
        for path in sorted(glob.glob(os.path.join(SRC, '*.html'))):
            source = open(path, encoding='utf-8').read()
            if 'data-widget=' not in source:
                continue
            await page.goto(base + os.path.basename(path))
            await page.wait_for_timeout(300)
            for name, view, inner in await page.evaluate(LIVE):
                if inner is None:
                    continue
                at = source.index('data-widget="%s"' % name)
                a = source.index('<svg class="dg"', at)
                e = source.index('</svg>', a) + 6
                tag = source[a:source.index('>', a) + 1]
                tag = re.sub(r' viewBox="[^"]*"', '', tag).replace('<svg class="dg"', '<svg class="dg" viewBox="%s"' % view)
                source = source[:a] + tag + inner + '</svg>' + source[e:]
                written += 1
            open(path, 'w', encoding='utf-8').write(source)
        await browser.close()
    srv.shutdown()
    print('%d drawings written. Build again to publish them.' % written)

asyncio.run(main())
