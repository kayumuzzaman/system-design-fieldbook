import re,json
# steps.py : turn an existing drawing into a playable figure (see DESIGN.md, section 4.1).
#   python3 tools/steps.py <chapter-slug> <fig-id> ...   lists the drawing with line numbers (after putting each element on its own line)
#   then, in a short script:  from steps import do;  do(slug, fig, groups, steps=[...]) or do(slug, fig, groups, scenes=[{id,label,lines,steps}])
# groups: [(step, [lines...]), (step, [lines], {'e':n,'cls':'hide','packet':'none'|'back'})]; line numbers from the listing.
# Shorthand for a group line list: a (a,b) tuple inside the list means the range a..b inclusive.
import os
ROOT=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),'src','chapters')+os.sep
def _expand(ls):
    out=[]
    for x in ls:
        if isinstance(x,tuple): out+=list(range(x[0],x[1]+1))
        else: out.append(x)
    return sorted(out)
def do(slug, fig, groups, steps=None, scenes=None, replace=(), caption=None):
    path=ROOT+slug+'.html'; s=open(path).read()
    m=re.search(r'<figure class="[^"]*" id="%s"[^>]*>.*?</figure>'%re.escape(fig),s,re.S)
    lines=m.group(0).split('\n')
    if any('<ol class="steps"' in l for l in lines): print('SKIP already done',slug,fig); return
    pre={}; post={}
    used=set()
    for g in groups:
        step,ls=g[0],_expand(g[1]); opt=g[2] if len(g)>2 else {}
        for i in ls:
            assert i not in used, (fig,'line used twice',i); used.add(i)
            assert 4<i<len(lines)-3, (fig,'line out of drawing',i)
        attrs=(f' class="{opt["cls"]}"' if 'cls' in opt else '')+f' data-s="{step}"'+(f' data-e="{opt["e"]}"' if 'e' in opt else '')+(f' data-packet="{opt["packet"]}"' if 'packet' in opt else '')
        runs=[]
        for i in ls:
            if runs and i==runs[-1][-1]+1: runs[-1].append(i)
            else: runs.append([i])
        for r in runs:
            pre.setdefault(r[0],[]).append(f'<g{attrs}>'); post.setdefault(r[-1],[]).insert(0,'</g>')
    for sc in (scenes or []):
        rs=sc['lines'] if isinstance(sc['lines'][0],(list,tuple)) else [sc['lines']]
        for a,b in rs:
            pre.setdefault(a,[]).insert(0,f'<g data-scene="{sc["id"]}">'); post.setdefault(b,[]).append('</g>')
    out=[]
    for i,l in enumerate(lines):
        out+=pre.get(i,[]); out.append(l); out+=post.get(i,[])
    txt='\n'.join(out)
    def ol(st,attrs=''): return f'<ol class="steps"{attrs}>\n'+'\n'.join(f'  <li>{c}</li>' for c in st)+'\n</ol>'
    lists='\n'.join(ol(sc['steps'],f' data-scene="{sc["id"]}" data-label="{sc["label"]}"') for sc in scenes) if scenes else ol(steps)
    assert re.search(r'</svg>\s*</div>\s*<figcaption>',txt), (fig,'unexpected figure tail')
    txt=re.sub(r'(</svg>\s*</div>)\s*(<figcaption>)', lambda mm: mm.group(1)+'\n'+lists+'\n'+mm.group(2), txt, count=1)
    if caption: txt=re.sub(r'<figcaption>.*?</figcaption>','<figcaption>'+caption+'</figcaption>',txt,flags=re.S)
    for a,b in replace:
        assert a in txt, (fig,'replace target missing',a); txt=txt.replace(a,b)
    # every step must draw something
    def check(n,stepnums,label):
        missing=[k for k in range(1,n+1) if k not in stepnums]
        if missing: print('  NOTE',fig,label,'steps with nothing new drawn:',missing)
        extra=[k for k in stepnums if k>n]
        assert not extra, (fig,label,'group beyond last step',extra)
    if scenes:
        for sc in scenes:
            rs=sc['lines'] if isinstance(sc['lines'][0],(list,tuple)) else [sc['lines']]
            inside=lambda i: any(a<=i<=b for a,b in rs)
            nums={g[0] for g in groups if all(inside(i) for i in _expand(g[1]))}
            check(len(sc['steps']),nums,sc['id'])
            for g in groups:
                e=_expand(g[1]); assert all(inside(i) for i in e)==any(inside(i) for i in e) or True
    else: check(len(steps),{g[0] for g in groups},'')
    s=s[:m.start()]+txt+s[m.end():]
    open(path,'w').write(s); print('ok',slug,fig)
def presplit(slug, fig):
    """Put every element of the drawing on its own line, so lines can be grouped one by one."""
    path=ROOT+slug+'.html'; s=open(path).read()
    m=re.search(r'<figure class="[^"]*" id="%s"[^>]*>.*?</figure>'%re.escape(fig),s,re.S)
    t=m.group(0)
    a=t.index('</desc>')+7; b=t.index('</svg>')
    body=re.sub(r'(/>|</text>)(?=<)',r'\1\n',t[a:b])
    s=s[:m.start()]+t[:a]+body+t[b:]+s[m.end():]
    open(path,'w').write(s)
def undo(slug, fig):
    """Remove the step wrappers and step lists that do() added to one figure."""
    path=ROOT+slug+'.html'; s=open(path).read()
    m=re.search(r'<figure class="[^"]*" id="%s"[^>]*>.*?</figure>'%re.escape(fig),s,re.S)
    t=re.sub(r'<ol class="steps".*?</ol>\n','',m.group(0),flags=re.S)
    out=[]; stack=[]
    for l in t.split('\n'):
        if re.fullmatch(r'<g(?: class="hide")? data-s="[^>]*>',l) or re.fullmatch(r'<g data-scene="[^"]*">',l): stack.append('w'); continue
        if l.startswith('<g') and not l.rstrip().endswith('</g>'): stack.append('o')
        if l=='</g>':
            if stack and stack.pop()=='w': continue
        out.append(l)
    s=s[:m.start()]+'\n'.join(out)+s[m.end():]; open(path,'w').write(s); print('undone',slug,fig)

if __name__=='__main__':
    import sys
    slug=sys.argv[1]
    for fig in sys.argv[2:]:
        presplit(slug,fig)
        t=re.search(r'<figure class="[^"]*" id="%s"[^>]*>.*?</figure>'%re.escape(fig),open(ROOT+slug+'.html').read(),re.S).group(0)
        print('#####',slug,fig)
        for i,l in enumerate(t.split(chr(10))):
            if '<desc' not in l: print(i,l[:150])
