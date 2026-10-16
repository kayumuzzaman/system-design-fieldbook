# tips.py : add value readouts to a chart (see DESIGN.md, section 4.3).
#   from tips import F, lin;  f=F('chapter-slug','fig-id');  f.hit(x,y,w,h,'Heading|line|line');  f.save()
#   f.pts(i) returns the points of the path on line i of the figure; lin(a0,v0,a1,v1) maps a coordinate to a value.
import re, math
import os
ROOT=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),'src','chapters')+os.sep
def esc(t): return t.replace('&','&amp;').replace('"','&quot;').replace('<','&lt;')
def f1(v): return ('%.1f'%v)
def n0(v): return '{:,}'.format(int(round(v)))
class F:
    def __init__(s, slug, fig):
        s.slug=slug; s.fig=fig; s.path=ROOT+slug+'.html'; s.src=open(s.path).read()
        s.m=re.search(r'<figure class="[^"]*" id="%s"[^>]*>.*?</figure>'%re.escape(fig),s.src,re.S)
        s.L=s.m.group(0).split('\n'); s.hits=[]; s.n=0
        assert 'data-tip' not in s.m.group(0), (slug,fig,'already has tips')
    def tip(s,i,text):
        l=re.sub(r'<title>.*?</title>','',s.L[i])
        assert re.match(r'<(rect|path|circle|line|g)\b',l), (s.fig,i,l[:60])
        s.L[i]=re.sub(r'^(<\w+)', lambda m: m.group(1)+' data-tip="%s"'%esc(text), l, count=1); s.n+=1
    def untitle(s,i): s.L[i]=re.sub(r'<title>.*?</title>','',s.L[i])
    def title(s,i): return re.search(r'<title>(.*?)</title>',s.L[i]).group(1)
    def hit(s,x,y,w,h,text):
        s.hits.append('<rect class="hit" x="%s" y="%s" width="%s" height="%s" data-tip="%s"/>'%(round(x,1),round(y,1),round(w,1),round(h,1),esc(text))); s.n+=1
    def pts(s,i):
        d=re.search(r' d="([^"]+)"',s.L[i]).group(1)
        return [(float(a),float(b)) for a,b in re.findall(r'(-?\d+(?:\.\d+)?)[ ,](-?\d+(?:\.\d+)?)',d)]
    def save(s):
        k=[i for i,l in enumerate(s.L) if l.strip().startswith('</svg>')][0]
        L=s.L[:k]+s.hits+s.L[k:]
        open(s.path,'w').write(s.src[:s.m.start()]+'\n'.join(L)+s.src[s.m.end():])
        print('ok',s.slug,s.fig,s.n,'tips')
def lin(a0,v0,a1,v1): return lambda a: v0+(a-a0)*(v1-v0)/(a1-a0)
def _hitc(s,cx,cy,r,text):
    s.hits.append('<circle class="hit" cx="%s" cy="%s" r="%s" data-tip="%s"/>'%(cx,cy,r,esc(text))); s.n+=1
F.hitc=_hitc
