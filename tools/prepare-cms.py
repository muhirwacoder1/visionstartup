"""Index content in the checked-in reference markup, without wrapping its text nodes."""
from pathlib import Path
from bs4 import BeautifulSoup, NavigableString
import json
import re

root = Path(__file__).resolve().parents[1]
pages, manifest = [], {}
paths = [str(p.relative_to(root)) for p in sorted((root/'dist').rglob('index.html'))]
for path in (p for p in paths if p.endswith('/index.html') and not p.startswith(('dist/admin/', 'dist/project/'))):
    file = root / path
    soup = BeautifulSoup(file.read_text(), 'html.parser')
    for tag in soup.select('*'):
        for attr in list(tag.attrs):
            if attr.startswith('data-cms-'):
                del tag[attr]
    for tag in soup.select('script[src="/cms-public.js"], script[src="/cms-config.js"]'):
        tag.decompose()
    route = '/' + path.removeprefix('dist/').removesuffix('index.html').strip('/')
    main = soup.find('main')
    header, footer = soup.find('header'), soup.find('footer')
    body_content = soup.select_one('[class*=__pageWrapper] > div') or main
    content = []
    if body_content:
        content = [el for el in body_content.find_all('section') if not el.find_parent('section')]
        # Cover standalone text and artwork as separate regions without marking the page shell.
        if not content:
            content = [body_content]
        elif any(getattr(child, 'name', None) not in (None,'script','style','section','footer')
                 and not child.find('section') and (child.get_text(strip=True) or child.find(['img','video','iframe']))
                 for child in body_content.children):
            content.append(body_content)
    regions = ([header] if header else []) + content + ([footer] if footer else [])
    sections, values, used = [], {}, set()

    def add(fields, label, kind, value):
        key = f'f{len(values)}'
        values[key] = value
        fields.append(dict(id=key, label=label, type=kind, value=value))
        return key

    for idx, region in enumerate(regions):
        sid = 'section-' + str(idx)
        region['data-cms-section'] = sid
        fields = []
        title = region.find(['h1', 'h2', 'h3'])
        name = ('Header' if region is header else 'Footer' if region is footer else
                title.get_text(' ', strip=True)[:75] if title else
                'Policy content' if route in ('/privacy', '/cookie-policy') else f'Content block {idx}')
        for el in [region, *region.find_all(True)]:
            if id(el) in used or el.name in ('svg','path','script','style','noscript','title') or el.find_parent(['svg','script','style','noscript']):
                continue
            if el is footer and region is not footer or (region is not footer and footer in el.parents):
                continue
            if header in el.parents and (el.name == 'nav' or el.find_parent('nav')):
                continue
            used.add(id(el))
            text_ids = {}
            for i, node in enumerate(el.children):
                if not isinstance(node, NavigableString) or not node.strip() or type(node) is not NavigableString:
                    continue
                value = str(node).strip()
                if el.has_attr('data-count') and value.isdigit():
                    value = str(el['data-count'])
                if len(value) == 1 and not value.isalnum(): continue
                label = value[:58] if len(value) > 10 else f'{el.name.upper()} · {value}'
                text_ids[i] = add(fields, label, 'text', value)
            if text_ids:
                el['data-cms-text'] = ','.join(f'{i}:{key}' for i, key in text_ids.items())
            attrs = []
            if el.name == 'a' and el.has_attr('href'): attrs.append(('href','link',el.get_text(' ',strip=True)[:45] or 'Link destination'))
            if route in ('/', '/cases') and el.name == 'a' and el.get('href', '').startswith('/cases/') and el.find('img'):
                el['data-cms-card'] = add(fields, 'Show card · ' + (el.find('h3').get_text(' ', strip=True) if el.find('h3') else el['href'].split('/')[-1]), 'toggle', 'true')
            if el.name in ('img', 'source', 'video', 'iframe') and el.has_attr('src'):
                attrs.append(('src','image' if el.name == 'img' or el.find_parent('picture') else 'media',el.get('alt') or {'video':'Video','iframe':'Video embed'}.get(el.name,'Image')))
            if el.name == 'video' and el.has_attr('poster'): attrs.append(('poster','image','Video poster'))
            if el.name == 'img': attrs.append(('alt','text','Image description'))
            if el.name in ('input','textarea') and el.has_attr('placeholder'): attrs.append(('placeholder','text','Form placeholder'))
            for attr, kind, label in attrs:
                el['data-cms-' + attr] = add(fields, label, kind, el.get(attr,''))
            bg = re.search(r'url\((["\']?)(/assets/[^)\'"]+)\1\)', el.get('style', ''))
            if bg:
                el['data-cms-bg'] = add(fields, 'Background image', 'image', bg[2])
        if fields:
            sections.append(dict(id=sid, title=name, fields=fields, hideable=region not in (body_content,header,footer)))
    fields = []
    if soup.title:
        soup.title['data-cms-meta-title'] = add(fields, 'Browser title', 'text', soup.title.get_text())
    for tag in soup.select('meta[name="description"], meta[property="og:description"], meta[property="og:title"]'):
        tag['data-cms-content'] = add(fields, tag.get('name') or tag.get('property'), 'text', tag.get('content',''))
    if fields: sections.append(dict(id='metadata', title='Page title and description', fields=fields, hideable=False))
    csp = soup.select_one('meta[http-equiv="Content-Security-Policy"]')
    if csp:
        csp['content'] = re.sub(r"connect-src [^;]+", "connect-src 'self' https://*.convex.cloud", csp['content'])
        csp['content'] = re.sub(r"img-src [^;]+", "img-src 'self' data: blob: https://res.cloudinary.com", csp['content'])
        csp['content'] = re.sub(r"media-src [^;]+", "media-src 'self' blob: https://res.cloudinary.com", csp['content'])
    for name in ('cms-config.js','cms-public.js'):
        if not soup.find('script', src='/' + name):
            soup.body.append(soup.new_tag('script', attrs={'src':'/' + name,'defer':''}))
    file.write_text(str(soup))
    title = soup.title.get_text().split('|')[0].split('—')[0].strip() if soup.title else route
    pages.append(dict(key=route, title='Home' if route == '/' else title, sections=sections))
    manifest[route] = dict(fields={f['id']:f['type'] for s in sections for f in s['fields']},
                           sections=[s['id'] for s in sections if s['hideable']])
(root/'cms/catalog.json').write_text(json.dumps(pages,ensure_ascii=False,separators=(',',':'))+'\n')
(root/'convex/fields.json').write_text(json.dumps(manifest,ensure_ascii=False,separators=(',',':'))+'\n')
(root/'dist/cms-catalog.json').unlink(missing_ok=True)
print(f'Prepared {len(pages)} pages and {sum(len(p["sections"]) for p in pages)} editable sections.')
