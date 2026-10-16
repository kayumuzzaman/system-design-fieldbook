# The System Design Fieldbook

Source and build for a multi-page HTML e-book on high-level and low-level system design. Zero dependencies, no frameworks, no external requests.

## What readers get

Search palette (Ctrl K or /), glossary, read tracking via each chapter's Mark-as-read button, an "On this page" reading timeline, step-by-step playable figures, charts with values, calculators, highlights and notes (kept in the reader's browser only), self-check questions, dark-first and light themes, and a phone layout with bottom reading bar.

## Build

Requires Node 18+. No install step.

```sh
node build.mjs              # build into dist/ + check links
node build.mjs --strict     # also fail on unconverted figures
npx serve dist              # preview locally
python3 tools/check.py      # optional Playwright browser checks
```

## Layout

```
book.config.json      title, author, site URL
build.mjs             the build script (templates + link checker)
src/outline.json      parts and chapters in order (the table of contents)
src/chapters/<slug>.html  one HTML fragment per chapter
src/pages/            about page + clickable system-map SVG
src/assets/           book.css, book.js, figures.js, notes.js, fonts
DESIGN.md             the design and authoring standard — read before writing
figures.plan.json     per-figure kind: play, values, or still
tools/                browser checks, drawing sync, figure/prose helpers
code/                 TypeScript behind Parts IX–XII (see code/README.md)
dist/                 generated output (git-ignored)
```

A chapter is published when `src/chapters/<slug>.html` exists for a slug in `outline.json`; numbering follows `outline.json` order. Chapter files are HTML fragments with a `<!--meta {...}-->` header; the build adds all chrome (topbar, contents, rail, footer, search index, glossary). Custom tags (`x-ref`, figures, code blocks, callouts, calculators) and the diagram vocabulary are documented in `DESIGN.md`.

## Licenses

Fonts (Bricolage Grotesque, Hanken Grotesk, JetBrains Mono, plus IBM Plex as fallback) are SIL OFL 1.1 — see `src/assets/fonts/LICENSES.txt`. The book's text, diagrams and code are © 2026 Kayumuzzaman Robin under CC BY 4.0 — see `LICENSE` and the about page.
