# prose.py <slug>... : style checks on a chapter's source: dashes, straight quotes, wordy or British forms,
# a term defined twice, step captions that are too short or long, and messages over 28 characters.
# Code in <pre> and <code> is skipped. Quoted code inside figures is reported and can be ignored.
import sys, re, html, json, os
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'chapters')
BAN = r"\b(genuinely|honestly|straightforward\w*|simply put|obviously|needless to say|leverage[sd]?|utiliz\w+|delve\w*|crucial\w*|robust\w*|seamless\w*|in order to|very|really|basically|actually|just)\b"
BRIT = r"\b(\w*(?:isation|ise[sd]?|ising|yse[sd]?)\b|behaviour\w*|colour\w*|centre[sd]?|licence[sd]?|favour\w*|whilst|programme[sd]?|catalogue[sd]?|defence[s]?|honour\w*|labour\w*|neighbour\w*|grey|travell\w+|modell\w+|cancell\w+|fulfil\b|artefact\w*|judgement\w*|towards|amongst|learnt|spelt|practise[sd]?)\b"
OKISE = {'otherwise','precise','promise','promises','promised','raise','raises','raised','exercise','exercises','exercised','concise','rise','rises','arise','arises','noise','premise','premises','compromise','compromised','compromises','surprise','surprises','surprised','expertise','enterprise','enterprises','advertise','advertised','advertises','disguise','disguised','wise','likewise','franchise','revise','revised','revises','devise','devised','devises','advise','advised','advises','supervise','supervised','comprise','comprises','comprised','analyses','paralysed','bruise','cruise','demise','guise','poise','praise','praised','phrase','phrases','phrased','rising','raising','promising','surprising','exercising','advertising','compromising','revising','devising','advising','noises','despise','merchandise','televise','improvise','improvised','improvises','improvising','franchises','braise','appraise','liaise','liaises','chastise','excise','incise','treatise','paradise','anise','turquoise','tortoise','porpoise','mayonnaise','malaise','chemise','expertises','apprise','reprise','surmise','comprising','supervising','disguising','praising','arising','uprising','otherwises','mise'}
for slug in sys.argv[1:]:
    s = open(os.path.join(ROOT, slug + '.html')).read()
    words = len(re.findall(r"[A-Za-z0-9’']+", re.sub(r'<[^>]+>', ' ', re.sub(r'<svg.*?</svg>', ' ', s, flags=re.S))))
    t = re.sub(r'<!--.*?-->', lambda m: m.group(0) if 'meta' in m.group(0)[:10] else ' ', s, flags=re.S)
    t = re.sub(r'<pre.*?</pre>', ' ', t, flags=re.S); t = re.sub(r'<code>.*?</code>', ' CODE ', t, flags=re.S)
    svgtext = ' '.join(re.findall(r'<(?:text|title|desc)[^>]*>(.*?)</(?:text|title|desc)>', t, flags=re.S))
    t = re.sub(r'<svg.*?</svg>', ' ', t, flags=re.S)
    attrs = ' '.join(re.findall(r'data-(?:msg|state|label|title)="([^"]*)"', s)) + ' ' + ' '.join(re.findall(r'aria-label="([^"]*)"', s))
    t = html.unescape(re.sub(r'<[^>]+>', ' ', t)) + ' ' + html.unescape(svgtext) + ' ' + html.unescape(attrs)
    out = []
    for m in re.finditer(r'—|–| - ', t): out.append('dash: ' + t[max(0, m.start()-30):m.end()+30].replace('\n', ' '))
    for m in re.finditer(r"[\"']", t):
        ctx = t[max(0, m.start()-30):m.end()+30].replace('\n', ' ')
        if '"alg"' in ctx or '{ "' in ctx or '": ' in ctx or '",' in ctx or '" }' in ctx or '"."' in ctx or '"description"' in ctx or '"lede"' in ctx or '"updated"' in ctx: continue
        out.append('straight quote: ' + ctx)
    for m in re.finditer(BAN, t, flags=re.I): out.append('word: ' + t[max(0, m.start()-30):m.end()+30].replace('\n', ' '))
    for m in re.finditer(BRIT, t, flags=re.I):
        if m.group(0).lower() in OKISE: continue
        out.append('spelling: ' + t[max(0, m.start()-30):m.end()+30].replace('\n', ' '))
    d = re.findall(r'<dfn[^>]*>(.*?)</dfn>', s); dup = {x for x in d if d.count(x) > 1}
    if dup: out.append('dfn twice: ' + ', '.join(dup))
    caps = [re.sub(r'<[^>]+>', '', c) for c in re.findall(r'<li[^>]*>(.*?)</li>', ' '.join(re.findall(r'<ol class="steps".*?</ol>', s, flags=re.S)), flags=re.S)]
    for c in caps:
        n = len(c.split())
        if n > 40 or n < 6: out.append(f'step caption {n} words: {c[:60]}')
    for m in re.finditer(r'data-msg="([^"]*)"', s):
        for part in html.unescape(m.group(1)).split('|'):
            if len(part) > 28: out.append('message over 28 chars: ' + part)
    print(slug, f'{words} words, about {round(words/230)} min;', len(d), 'terms;', len(re.findall(r'<details>', s)), 'questions;', len(re.findall(r'<figure', s)), 'figures')
    for o in out: print('   ', o)
