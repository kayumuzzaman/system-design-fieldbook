"""fg.py: build a complete <figure> to the standard in DESIGN.md section 4.

    import sys; sys.path.insert(0, 'tools')
    from fg import Fig, Seq
    f = Fig(561, 'fig-example', 'Title for screen readers', 'Longer description.', 200)   # height of the 720-wide drawing
    q = Seq(f, [('Client', 110), ('Server', 610)])                                        # lifelines and their x positions
    q.msg('Client', 'Server', 'GET /photos/871', 'Caption: what happens and why.', 'sig',
          msg='GET photo 871', state='Server has seen: 1 request')                        # one numbered arrow = one step
    q.note('Server', 'look it up', 'Something one party does on its own.', 'store')       # a box beside a lifeline
    q.also('Server', 'Client', 'second arrow of the same step')                           # optional
    q.done()
    print(f.html('What the figure establishes, in a sentence.'))

Fig.s is an svg.S for free drawing (boxes, arrows, tables). Fig.steps([...]) adds a step list by hand:
each item is a caption, (caption, message) or (caption, message, state). A second Seq with scene='name'
makes a second story in the same figure.

Class diagrams (Parts IX and X):
    from fg import klass, link, frame
    a = klass(f.s, 40, 30, 180, 'PhotoStore', ops=['+ save(id, bytes)', '+ load(id)'], kind='interface')
    b = klass(f.s, 40, 190, 180, 'DiskStore', attrs=['− folder: string'], ops=['+ save(id, bytes)'])
    link(f.s, b.top(), a.bottom(), 'implements')     # inherit, implements, assoc, uses, owns, has
klass returns a Box whose top(), bottom(), left() and right() give points on its edges (0 to 1 along
the edge). link draws from the first point to the second: the triangle or arrow is at the second,
and the diamond of owns/has is at the first. frame draws an alt/opt/loop fragment on a sequence.
Seq.done(bars=[(actor, y1, y2)]) adds activation bars.

Register the figure in figures.plan.json and run tools/check.py.
"""
import re
from svg import S, esc
def att(t): return esc(t).replace('"','&quot;')
def tw(t, px=6.1): return len(t)*px
class Fig:
    def __init__(f, num, fid, title, desc, h, w=720):
        f.num=num; f.id=fid; f.title=title; f.desc=desc; f.h=h; f.w=w; f.s=S(); f.lists=[]
    def steps(f, items, scene=None, label=None):
        """items: caption, or (caption, msg), or (caption, msg, state); msg/state may be None."""
        out=[]
        for it in items:
            if isinstance(it,str): it=(it,None,None)
            cap,msg,state=(list(it)+[None,None])[:3]
            a=(f' data-msg="{att(msg)}"' if msg is not None else '')+(f' data-state="{att(state)}"' if state else '')
            out.append(f'  <li{a}>{cap}</li>')
        attrs=(f' data-scene="{scene}" data-label="{att(label)}"' if scene else '')
        f.lists.append(f'<ol class="steps"{attrs}>\n'+'\n'.join(out)+'\n</ol>')
    def html(f, caption):
        body='\n'.join(f.s.o)
        return (f'<figure class="fig wide" id="{f.id}">\n<div class="frame">\n<svg class="dg" viewBox="0 0 {f.w} {f.h}" role="img" aria-labelledby="f{f.num}t f{f.num}d">\n'
                f'<title id="f{f.num}t">{esc(f.title)}</title>\n<desc id="f{f.num}d">{esc(f.desc)}</desc>\n{body}\n</svg>\n</div>\n'
                + ('\n'.join(f.lists)+'\n' if f.lists else '') + f'<figcaption>{caption}</figcaption>\n</figure>')
class Seq:
    """A message sequence: lifelines, then one numbered arrow or note per step."""
    def __init__(q, fig, actors, top=20, y0=54, gap=28, scene=None, numbered=True):
        q.f=fig; q.s=fig.s; q.x=dict(actors); q.y=y0; q.gap=gap; q.n=0; q.items=[]; q.scene=scene; q.numbered=numbered; q.top=top; q.actors=actors
        q.head=len(q.s.o)
    def _n(q,label): return f'{q.n}. {label}' if q.numbered else label
    def msg(q, a, b, label, cap, cls='', msg=None, state=None, lost=False, extra=None):
        q.n+=1; xa,xb=q.x[a],q.x[b]; d=1 if xb>xa else -1; y=q.y
        with q.s.step(q.n):
            if lost:
                xe=xa+d*(abs(xb-xa)*0.66)
                q.s.arrow(f'M{xa+d} {y}H{xe:g}',cls)
                q.s.raw(f'<path class="x" d="M{xe+d*8-7:g} {y-7}l14 14M{xe+d*8+7:g} {y-7}l-14 14"/>')
                q.s.text((xa+xe)/2,y-6,q._n(label),'ts mid')
            else:
                q.s.arrow(f'M{xa+d} {y}H{xb-d}',cls)
                q.s.text((xa+xb)/2,y-6,q._n(label),'ts mid')
            if extra: extra(q.s,y)
        q.items.append((cap,msg,state)); q.y+=q.gap
    def also(q, a, b, label, cls=''):
        """A second arrow that belongs to the step just added, on its own row."""
        xa,xb=q.x[a],q.x[b]; d=1 if xb>xa else -1; y=q.y
        with q.s.step(q.n):
            q.s.arrow(f'M{xa+d} {y}H{xb-d}',cls)
            q.s.text((xa+xb)/2,y-6,label,'ts mid')
        q.y+=q.gap
    def note(q, a, label, cap, cls='', state=None, w=None, side=1):
        """Something one party does on its own: a small box beside its lifeline."""
        q.n+=1; x=q.x[a]; y=q.y; t=q._n(label); w=w or tw(t)+18
        with q.s.step(q.n, packet='none'):
            q.s.raw(f'<rect class="n {cls}" x="{x-w/2 if side==0 else (x+8 if side>0 else x-8-w):g}" y="{y-14}" width="{w:g}" height="22" rx="4"/>')
            cx = x if side==0 else (x+8+w/2 if side>0 else x-8-w/2)
            q.s.text(f'{cx:g}',y+1,t,'ts mid')
        q.items.append((cap,'none',state)); q.y+=q.gap
    def done(q, label=None, bottom=None, bars=()):
        """bars: (actor, y1, y2) activation bars, drawn under the arrows."""
        bottom=bottom or q.y-q.gap+12
        heads=[]
        for name,x in q.actors:
            heads.append(f'<text class="tb mid" x="{x}" y="{q.top}">{esc(name)}</text>')
            heads.append(f'<line class="axis" x1="{x}" y1="{q.top+8}" x2="{x}" y2="{bottom}"/>')
        for name,y1,y2 in bars: heads.append(f'<rect class="n sunk" x="{q.x[name]-4}" y="{y1}" width="8" height="{y2-y1}" rx="1"/>')
        q.s.o[q.head:q.head]=([f'<g data-scene="{q.scene}">'] if q.scene else [])+heads
        if q.scene: q.s.o.append('</g>')
        q.f.steps(q.items, q.scene, label)
        return bottom

class Box:
    """Geometry of a drawn box, with points on its edges for attaching lines."""
    def __init__(b, x, y, w, h): b.x=x; b.y=y; b.w=w; b.h=h; b.cx=x+w/2; b.cy=y+h/2; b.r=x+w; b.b=y+h
    def top(b, f=0.5): return (b.x+b.w*f, b.y)
    def bottom(b, f=0.5): return (b.x+b.w*f, b.b)
    def left(b, f=0.5): return (b.x, b.y+b.h*f)
    def right(b, f=0.5): return (b.r, b.y+b.h*f)

def klass(s, x, y, w, name, attrs=(), ops=(), kind=None, cls='', rowh=16):
    """A UML class box: name, then attributes, then operations. kind 'interface' or 'abstract' adds a line above the name.
    Members are written with their visibility mark: '+ add(photo)', '- photos'. Returns a Box."""
    head = 42 if kind else 28
    ha = len(attrs)*rowh+10 if attrs else 0
    ho = len(ops)*rowh+10 if ops else 0
    h = head+ha+ho
    c = f' {cls}' if cls else ''
    s.raw(f'<rect class="n{c}" x="{x}" y="{y}" width="{w}" height="{h}" rx="4"/>')
    if kind:
        s.text(f'{x+w/2:g}', y+16, '«'+kind+'»', 'ts mid')
        s.text(f'{x+w/2:g}', y+33, name, 'tb mid it' if kind=='abstract' else 'tb mid')
    else:
        s.text(f'{x+w/2:g}', y+19, name, 'tb mid')
    yy = y+head
    for rows in (attrs, ops):
        if not rows: continue
        s.raw(f'<line class="sep{c}" x1="{x}" y1="{yy}" x2="{x+w}" y2="{yy}"/>')
        for i, t in enumerate(rows): s.text(x+8, yy+16+i*rowh, t, 'ts')
        yy += len(rows)*rowh+10
    return Box(x, y, w, h)

def link(s, a, b, kind='assoc', label=None, lx=0, ly=-6, via=None):
    """A relationship line from point a to point b. kind: inherit, implements, assoc, uses, owns, has (diamond at a).
    via is a list of corner points for a bent line."""
    pts = [a]+(via or [])+[b]
    d = 'M'+' L'.join(f'{px:g} {py:g}' for px, py in pts)
    s.raw(f'<path class="e {kind}" d="{d}"/>')
    if label:
        mx = (pts[len(pts)//2-1][0]+pts[len(pts)//2][0])/2; my = (pts[len(pts)//2-1][1]+pts[len(pts)//2][1])/2
        s.text(f'{mx+lx:g}', f'{my+ly:g}', label, 'ts mid')

def frame(s, x, y, w, h, tag, guard=None):
    """A UML fragment frame (alt, opt, loop) with its tag in the corner and an optional guard."""
    tw_ = len(tag)*6.4+14
    s.raw(f'<path class="e none" d="M{x} {y}H{x+w}V{y+h}H{x}z"/>')
    s.raw(f'<path class="n sunk" d="M{x} {y}H{x+tw_}V{y+12}L{x+tw_-6} {y+18}H{x}z"/>')
    s.text(x+6, y+13, tag, 'ts tb')
    if guard: s.text(x+tw_+8, y+13, guard, 'ts')
