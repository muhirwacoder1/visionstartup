"""Build a self-contained reference recreation with a small, independent UI runtime."""
from pathlib import Path
from urllib.parse import urljoin, urlparse, parse_qs, unquote
from concurrent.futures import ThreadPoolExecutor, as_completed
from bs4 import BeautifulSoup, Comment
import hashlib, json, re, requests, threading

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / 'dist'
ASSETS = DIST / 'assets'
ASSETS.mkdir(parents=True, exist_ok=True)
ORIGIN = 'https://nixtio.com'
ROUTES = ['/', '/cases', '/about', '/testimonials', '/contact', '/form', '/privacy', '/cookie-policy',
          '/cases/passion-finder', '/cases/kazaswap', '/cases/xefag', '/cases/linkmatch',
          '/cases/inputninja', '/cases/payoneer']
cache = ROOT / '.reference-cache'
cache.mkdir(exist_ok=True)
mapping = {}
lock = threading.RLock()

def canonical(url, base=ORIGIN):
    url = urljoin(base, url)
    p = urlparse(url)
    if p.path == '/_next/image':
        return canonical(parse_qs(p.query)['url'][0])
    return p._replace(query='', fragment='').geturl()

def local_path(url):
    url = canonical(url)
    ext = Path(urlparse(url).path).suffix or '.bin'
    name = re.sub(r'[^a-zA-Z0-9_.-]', '-', Path(urlparse(url).path).stem)[:60]
    return '/assets/' + name + '-' + hashlib.sha256(url.encode()).hexdigest()[:10] + ext

def fetch(url):
    url = canonical(url)
    dest = DIST / local_path(url).lstrip('/')
    with lock:
        if url in mapping: return mapping[url]
        mapping[url] = local_path(url)
    if not dest.exists():
        r = requests.get(url, timeout=90)
        r.raise_for_status()
        dest.write_bytes(r.content)
    if dest.suffix == '.css':
        text = dest.read_text()
        def css_asset(m):
            raw=m.group(1).strip('"\' ')
            if raw.startswith(('data:', '#', '/assets/')): return m.group(0)
            return 'url("' + fetch(urljoin(url,raw)) + '")'
        text = re.sub(r'url\(([^)]+)\)', css_asset, text)
        dest.write_text(text)
    return local_path(url)

def page(route):
    f=cache / (route.strip('/').replace('/','_') or 'home')
    if not f.exists():
        r=requests.get(ORIGIN+route,timeout=60);r.raise_for_status();f.write_text(r.text)
    return route, BeautifulSoup(f.read_text(),'html.parser'), f.read_text()

with ThreadPoolExecutor(max_workers=8) as pool:
    pages=list(pool.map(page,ROUTES))
print('Fetched',len(pages),'reference pages',flush=True)

# Discover both textures of the original project-hover transition from rendered page data.
projects={}
for _,_,html in pages:
    decoded=html.replace('\\"','"').replace('\\/','/')
    for m in re.finditer(r'"imageUrl":"([^"]+)".*?"hoverImageUrl":"([^"]+)".*?"link":"([^"]+)"',decoded):
        projects['/cases/'+m[3]]=(m[1],m[2])

urls=set()
for _,s,_ in pages:
    for t in s.select('img[src], video[src], source[src], link[rel="stylesheet"], link[as="font"]'):
        u=t.get('src') or t.get('href')
        if u and not u.startswith('data:'):urls.add(canonical(u))
    for t in s.select('[poster]'):urls.add(canonical(t['poster']))
for pair in projects.values():urls.update(map(canonical,pair))
urls.update(ORIGIN+u for u in ['/videos/home/hero.mp4','/videos/arsen.mp4'])
with ThreadPoolExecutor(max_workers=12) as pool:
    jobs={pool.submit(fetch,u):u for u in urls}
    for future in as_completed(jobs):
        try:future.result()
        except Exception as e:print('Asset failed:',jobs[future],str(e),flush=True)
print('Localized',len(mapping),'assets',flush=True)

for route,s,html in pages:
    for t in s.select('script, noscript, [data-preloader]'):t.decompose()
    for t in s.select('iframe'):
        if urlparse(t.get('src','')).hostname != 'player.vimeo.com': t.decompose()
        else:
            t['loading']='lazy';t['referrerpolicy']='no-referrer'
            if 'autoplay=' not in t['src']:t['src']+='&autoplay=1'
    for t in s.select('h1[style]'):
        t['style']=t['style'].replace('opacity:0','opacity:1');t['data-aos']='fade-up'
    for t in s.find_all(string=lambda t:isinstance(t,Comment)):t.extract()
    for t in s.select('link'):
        if t.get('rel') == ['stylesheet'] or t.get('as')=='font':
            t['href']=fetch(t['href'])
        else:t.decompose()
    for t in s.select('meta[property^="og:"],meta[name^="twitter:"],meta[name="generator"]'):t.decompose()
    s.title.string=(s.title.get_text() if s.title else 'Nixtio')+' | Design recreation'
    meta=s.new_tag('meta',attrs={'name':'robots','content':'noindex,nofollow'});s.head.append(meta)
    meta=s.new_tag('meta',attrs={'name':'presenter-video','content':fetch('/videos/arsen.mp4')});s.head.append(meta)
    meta=s.new_tag('meta',attrs={'http-equiv':'Content-Security-Policy','content':"default-src 'self'; img-src 'self' data:; font-src 'self' data:; media-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'none'; form-action 'none'; frame-src https://player.vimeo.com; base-uri 'self'"});s.head.append(meta)
    for t in s.select('img[src],video[src],source[src]'):
        if not t['src'].startswith('data:'):t['src']=fetch(t['src'])
        for a in ['srcset','sizes']:t.attrs.pop(a,None)
    for t in s.select('[poster]'):t['poster']=fetch(t['poster'])
    for t in s.select('a[href]'):
        href=t['href']
        if href.startswith(ORIGIN):href=href[len(ORIGIN):] or '/'
        if href.startswith('/') and href.split('#')[0] not in ROUTES:
            t['href']=ORIGIN+href;t['target']='_blank';t['rel']='noopener noreferrer'
        else:t['href']=href
    for t in s.select('[class*="projects-module"][class*="__project"]'):
        if t.name!='a':continue
        pair=projects.get(t.get('href'))
        img=t.select_one('img')
        if pair and img:
            hover=s.new_tag('img',attrs={'src':fetch(pair[1]),'alt':'','class':'project-hover-image','loading':'lazy','aria-hidden':'true'})
            img['src']=fetch(pair[0]);img.parent.append(hover)
    for f in s.select('form'):
        f.attrs.pop('novalidate',None)
        for inp in f.select('input[name="name"],input[name="email"],input[name="message"]'):
            inp['required']=''
        captcha=f.select_one('[class*="captcha"]')
        if captcha:captcha.decompose()
        for button in f.select('button[type="submit"]'):button.attrs.pop('disabled',None)
        note=s.new_tag('p',attrs={'class':'demo-form-note'});note.string='Design preview — messages are not sent.';f.append(note)
    hero=s.select_one('[data-home-hero-media]')
    if hero:
        v=s.new_tag('video',attrs={'src':fetch('/videos/home/hero.mp4'),'muted':'','autoplay':'','loop':'','playsinline':'','preload':'metadata','aria-hidden':'true'})
        hero.append(v)
    # Restore values driven by the original client-side counters.
    counter_values=[600,100,500,45,60,42] if route=='/' else [500,45,60,42] if route=='/about' else []
    counters=s.select('[class*="__number"], [class*="statistics-section"][class*="__value"]')
    counters=[c for c in counters if c.get_text(strip=True) in ['0+','0%','0']]
    for c,value in zip(counters,counter_values):c['data-count']=str(value)
    # The header mark is injected by the original runtime. Use the source wordmark's N path.
    for logo in s.select('a[aria-label="Go to homepage"]'):
        logo.clear()
        svg=BeautifulSoup('<svg viewBox="-105 -105 210 210" fill="currentColor" aria-hidden="true"><path d="M-62.964 17.248C-69.278 11.041-80 15.482-80 24.305V62.069C-80 67.553-75.523 72-70 72H-31.587C-22.654 72-18.204 61.253-24.552 55.012L-43.636 36.25Z"/><path d="M30.969-72C23.237-72 16.969-65.775 16.969-58.097V-23.334L-26.839-67.403C-29.835-70.348-33.879-72-38.095-72H-66C-73.732-72-80-65.775-80-58.097V-29.962C-80-25.72-78.292-21.654-75.257-18.67L12.878 67.977C15.499 70.554 19.039 72 22.728 72H66C73.732 72 80 65.775 80 58.097V-58.097C80-65.775 73.732-72 66-72Z"/></svg>','html.parser')
        logo.append(svg)
    css=s.new_tag('link',attrs={'rel':'stylesheet','href':'/recreation.css'});s.head.append(css)
    js=s.new_tag('script',attrs={'src':'/recreation.js','defer':''});s.body.append(js)
    out=DIST / route.strip('/') / 'index.html' if route!='/' else DIST/'index.html'
    out.parent.mkdir(parents=True,exist_ok=True);out.write_text(str(s))

(ROOT/'asset-manifest.json').write_text(json.dumps(mapping,indent=2))
(DIST/'robots.txt').write_text('User-agent: *\nDisallow: /\n')
print('Built',len(pages),'pages;',round(sum(f.stat().st_size for f in ASSETS.iterdir())/1e6,1),'MB',flush=True)
