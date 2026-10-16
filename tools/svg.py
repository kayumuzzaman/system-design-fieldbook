# svg.py: tiny helpers that emit diagram fragments using the book's CSS classes
def esc(t): return str(t).replace('&','&amp;').replace('<','&lt;').replace('>','&gt;')
class S:
    def __init__(s): s.o=[]
    def raw(s,x): s.o.append(x); return s
    def text(s,x,y,t,cls=''):
        s.o.append(f'<text{(" class=\"%s\""%cls) if cls else ""} x="{x}" y="{y}">{esc(t)}</text>'); return s
    def lines(s,x,y,ls,cls='ts',dy=16):
        for i,l in enumerate(ls):
            ind=len(l)-len(l.lstrip(' '))
            s.text(x+round(ind*5.4),y+i*dy,l.strip(),cls)
        return s
    def box(s,x,y,w,h,cls='',title=None,sub=None,rx=6,tcls='tb',scls='ts'):
        s.o.append(f'<rect class="n{(" "+cls) if cls else ""}" x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}"/>')
        ls=[]
        if title is not None:
            for t in (title if isinstance(title,list) else [title]): ls.append((t,tcls))
        if sub is not None:
            for t in (sub if isinstance(sub,list) else [sub]): ls.append((t,scls))
        n=len(ls)
        y0=y+h/2+4.5-(n-1)*8.5
        for i,(t,c) in enumerate(ls):
            s.o.append(f'<text class="{c} mid" x="{x+w/2:g}" y="{y0+i*17:g}">{esc(t)}</text>')
        return s
    def arrow(s,d,cls=''):
        s.o.append(f'<path class="e{(" "+cls) if cls else ""}" d="{d}"/>'); return s
    def table(s,x,y,widths,rows,header=None,rowh=24,hl=None,hlcls='sig',align=None):
        yy=y
        allrows=([header] if header else [])+rows
        for ri,row in enumerate(allrows):
            xx=x
            ish=header is not None and ri==0
            for ci,(w,v) in enumerate(zip(widths,row)):
                cls='sunk' if ish else (hlcls if (hl and hl(ri-(1 if header else 0),ci)) else '')
                s.o.append(f'<rect class="n{(" "+cls) if cls else ""}" x="{xx}" y="{yy}" width="{w}" height="{rowh}" rx="0"/>')
                s.o.append(f'<text class="{"ts tb" if ish else "ts"}" x="{xx+7}" y="{yy+rowh/2+4:g}">{esc(v)}</text>')
                xx+=w
            yy+=rowh
        return s
    def vline(s,x,y1,y2): s.o.append(f'<path class="e none dash" d="M{x} {y1}V{y2}"/>'); return s
    # Playable figures (DESIGN.md 4.1): with g.step(2): ... wraps what is drawn inside in <g data-s="2">.
    # step(n, e=last, hide=True, packet='none'|'back'); scene('read') wraps a story.
    def step(s,n,e=None,hide=False,packet=None):
        attrs=(' class="hide"' if hide else '')+f' data-s="{n}"'+(f' data-e="{e}"' if e is not None else '')+(f' data-packet="{packet}"' if packet else '')
        return _Wrap(s,f'<g{attrs}>')
    def scene(s,name): return _Wrap(s,f'<g data-scene="{name}">')
    def tip(s,x,y,w,h,text): s.o.append(f'<rect class="hit" x="{x:g}" y="{y:g}" width="{w:g}" height="{h:g}" data-tip="{esc(text).replace(chr(34),"&quot;")}"/>'); return s
    def save(s,name): open(name,'w').write('\n'.join(s.o)+'\n'); print(name,len(s.o),'elements')
class _Wrap:
    def __init__(w,s,open_): w.s=s; w.open=open_
    def __enter__(w): w.s.o.append(w.open); return w.s
    def __exit__(w,*a): w.s.o.append('</g>')
def steps(captions,scene=None,label=None):
    """The <ol class="steps"> that goes between </div> (the frame) and <figcaption>."""
    attrs=(f' data-scene="{scene}" data-label="{label}"' if scene else '')
    return f'<ol class="steps"{attrs}>\n'+'\n'.join(f'  <li>{c}</li>' for c in captions)+'\n</ol>'
