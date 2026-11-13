(() => {
  const route = location.pathname.replace(/\/+$/, '') || '/';
  const slug = new URLSearchParams(location.search).get('slug') || '';
  const preview = window.parent !== window && (() => {
    try { const ref = new URL(document.referrer); return ref.origin === location.origin && ref.pathname.startsWith('/admin/'); } catch { return false; }
  })();
  const saved = [];
  const nodes = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const has = (record, key) => Object.prototype.hasOwnProperty.call(record, key);
  const safeLink = (s) => typeof s === 'string' && !/[\u0000-\u001f\\]/.test(s) &&
    (/^\/(?!\/)|^#|^https:\/\/|^mailto:|^tel:/i.test(s) || !s);
  const safeMedia = (s) => typeof s === 'string' && (
    /^\/assets\/[\w.%/-]+$/.test(s) && !s.includes('..') ||
    /^https:\/\/res\.cloudinary\.com\/[\w-]+\/(?:image|video)\/upload\//.test(s) ||
    preview && /^blob:/.test(s)
  );
  const hide = (el, hidden) => {
    if (hidden) el.setAttribute('data-cms-hidden', '');
    else el.removeAttribute('data-cms-hidden');
  };
  nodes('[data-cms-text]').forEach(el => {
    el.dataset.cmsText.split(',').forEach(pair => {
      const [index, id] = pair.split(':');
      const node = el.childNodes[Number(index)];
      if (!node || node.nodeType !== 3) return;
      const original = node.nodeValue;
      const prefix = original.match(/^\s*/)[0], suffix = original.match(/\s*$/)[0];
      const count = el.hasAttribute('data-count') ? el.getAttribute('data-count') : null;
      saved.push(({ fields }) => {
        if (has(fields, id)) {
          node.nodeValue = prefix + fields[id] + suffix;
          if (count !== null) {
            el.dataset.count = /^\d+$/.test(fields[id].trim()) ? fields[id] : count;
            el.dataset.cmsCountEdited = '';
          }
        } else if (count === null || el.hasAttribute('data-cms-count-edited')) {
          node.nodeValue = original;
          if (count !== null) el.dataset.count = count;
        }
      });
    });
  });
  for (const attr of ['src', 'alt', 'poster', 'href', 'bg', 'placeholder', 'content', 'meta-title']) {
    nodes('[data-cms-' + attr + ']').forEach(el => {
      const id = el.getAttribute('data-cms-' + attr);
      const srcset = el.getAttribute('srcset');
      const pictureSources = attr === 'src' && el.tagName === 'IMG' && el.parentElement?.tagName === 'PICTURE'
        ? nodes('source', el.parentElement).map(n => [n, n.getAttribute('srcset')]) : [];
      const original = attr === 'meta-title' ? el.textContent : attr === 'bg' ? el.style.backgroundImage : el.getAttribute(attr);
      saved.push(({ fields }) => {
        const value = fields[id];
        const isMedia = ['src', 'poster', 'bg'].includes(attr);
        const accepted = has(fields, id) && (attr !== 'href' || safeLink(value)) && (!isMedia ||
          value === '' || (el.tagName === 'IFRAME' ? /^https:\/\/player\.vimeo\.com\/video\/\d+(?:\?|$)/.test(value) : safeMedia(value)));
        const next = accepted ? value : original;
        if (attr === 'meta-title') { if (el.textContent !== next) el.textContent = next; return; }
        if (attr === 'bg') { el.style.backgroundImage = accepted ? next ? 'url("' + next.replace(/["\\]/g, '') + '")' : 'none' : original; return; }
        if (attr === 'src') {
          if (srcset !== null) {
            if (accepted) el.removeAttribute('srcset'); else el.setAttribute('srcset', srcset);
          }
          for (const [source, originalSrcset] of pictureSources) {
            if (accepted) source.removeAttribute('srcset'); else if (originalSrcset !== null) source.setAttribute('srcset', originalSrcset);
          }
          hide(el, accepted && !next);
        }
        if (el.getAttribute(attr) !== next) {
          if (next === null || next === '' && (isMedia || attr === 'href')) el.removeAttribute(attr);
          else el.setAttribute(attr, next);
          if (attr === 'src' && el.tagName === 'VIDEO') { el.load(); if (next && el.autoplay) el.play().catch(() => {}); }
        }
      });
    });
  }

  const menus = nodes('header nav, .mobile-menu-layer nav').map(nav => ({nav, links: Array.from(nav.children).filter(n => n.tagName === 'A').map(a => a.cloneNode(true))}));
  function renderMenu(menu) {
    if (!Array.isArray(menu)) {
      if (renderMenu.modified) for (const {nav, links} of menus) nav.replaceChildren(...links.map(a => a.cloneNode(true)));
      renderMenu.modified = false;
      return;
    }
    renderMenu.modified = true;
    for (const {nav, links} of menus) {
      nav.replaceChildren(...menu.filter(item => item.visible && safeLink(item.href) && item.href).map(item => {
        const a = document.createElement('a');
        a.className = (links.find(n => !n.className.includes('__active')) || links[0])?.className || '';
        a.href = item.href;
        a.textContent = item.label;
        if (new URL(a.href).origin === location.origin && a.pathname.replace(/\/+$/,'') === route.replace(/\/+$/,'')) {
          a.setAttribute('aria-current', 'page');
          const originalActive = links.find(n => n.className.includes('__active'));
          if (originalActive) a.className = originalActive.className;
        }
        return a;
      }));
    }
  }
  const node = (tag, className, text) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text) el.textContent = text;
    return el;
  };
  function visual(url, alt, videoControls = true) {
    if (!safeMedia(url)) return null;
    if (/\/(video)\/upload\/|\.(mp4|mov|webm)(\?|$)/i.test(url) || url.startsWith('blob:') && url.includes('#video')) {
      const v = node('video'); v.src = url; v.controls = videoControls; v.playsInline = true; v.preload = 'metadata';
      if (alt) v.setAttribute('aria-label', alt);
      return v;
    }
    const i = node('img'); i.src = url; i.alt = alt || ''; i.loading = 'lazy'; i.decoding = 'async'; return i;
  }
  nodes('[data-cms-card]').forEach(el => saved.push(({fields}) => hide(el, fields[el.dataset.cmsCard] === 'false')));
  const originalCards = nodes('main a[href^="/cases/"]').filter(a => a.querySelector('img,video'));
  function renderCards(projects) {
    nodes('[data-cms-project-card]').forEach(card => card.remove());
    if (route !== '/' && route !== '/cases') return;
    const template = originalCards[0];
    if (!template) return;
    const selected = projects.filter(p => route !== '/' || p.content.featured);
    for (const { slug, content } of selected.slice().reverse()) {
      const card = template.cloneNode(true);
      card.setAttribute('data-cms-project-card', '');
      card.removeAttribute('data-cms-hidden');
      card.href = '/project/?slug=' + encodeURIComponent(slug);
      for (const n of [card, ...nodes('*', card)]) {
        for (const attr of [...n.attributes]) if (/^data-(cms-(?!project-card)|aos)/.test(attr.name)) n.removeAttribute(attr.name);
        n.style.removeProperty('transition-delay');
      }
      const image = card.querySelector('img');
      if (!image) continue;
      nodes('img', card).slice(1).forEach(n => n.remove());
      nodes('source', card).forEach(n => n.remove());
      if (safeMedia(content.cover)) {
        image.src = content.cover;
        image.removeAttribute('srcset'); image.removeAttribute('sizes');
        image.alt = content.coverAlt || content.title;
      } else {
        image.removeAttribute('src'); image.removeAttribute('srcset'); image.alt = 'Add a project cover';
      }
      const title = card.querySelector('h2,h3,h4');
      if (title) title.textContent = content.title || 'Untitled project';
      else card.setAttribute('aria-label', content.title || 'Untitled project');
      nodes('[class*="__category"], [class*="__type"], [class*="__description"], [class*="__year"]', card).forEach(n => {
        n.textContent = n.className.includes('__year') ? content.year : content.category;
      });
      template.parentElement.insertBefore(card, template.parentElement.firstElementChild);
    }
  }
  function renderDetail(projects) {
    const main = document.querySelector('#cms-project-detail');
    if (!main) return;
    const p = projects.find(item => item.slug === slug)?.content;
    if (!p) {
      main.replaceChildren(node('p','cms-case-kicker','PROJECTS'),node('h1','','Project unavailable'),node('p','cms-case-summary','This project has not been published or has been removed.'));
      return;
    }
    document.title = p.title + ' — Projects';
    const lead = node('section','cms-case-lead');
    const meta = [p.category, p.year].filter(Boolean).join('   /   ');
    lead.append(node('p','cms-case-kicker', meta || 'SELECTED WORK'),node('h1','',p.title || 'Untitled project'),node('p','cms-case-summary',p.summary));
    const cover = visual(p.cover, p.coverAlt);
    if (cover) { cover.loading = 'eager'; lead.append(cover); }
    main.replaceChildren(lead);
    for (const section of p.sections) {
      const block = node('section','cms-case-block');
      if (section.title) block.append(node('h2','',section.title));
      if (section.body) block.append(node('p','',section.body));
      const asset = visual(section.media, section.alt);
      if (asset) block.append(asset);
      if (block.childElementCount) main.append(block);
    }
    const back = node('a','cms-case-back','←  All projects'); back.href = '/cases/';
    main.append(back);
  }

  function apply(data) {
    const page = data.page || { fields: {}, hidden: [] };
    for (const update of saved) update(page);
    nodes('[data-cms-section]').forEach(el => hide(el, page.hidden.includes(el.dataset.cmsSection)));
    renderMenu(data.menu);
    renderCards(data.projects || []);
    renderDetail(data.projects || []);
    // Recompute expanded accordions after draft text changes.
    nodes('button[aria-expanded="true"]').forEach(button => {
      const answer = button.parentElement.querySelector('[class*="__answer"]');
      if (answer?.firstElementChild) answer.style.height = answer.firstElementChild.scrollHeight + 'px';
    });
  }
  if (preview) {
    addEventListener('message', event => {
      if (event.origin !== location.origin || event.source !== parent || event.data?.type !== 'nixtio-preview' || event.data.route !== route) return;
      apply(event.data);
      if (event.data.focus) parent.postMessage({type:'nixtio-focused'},location.origin);
      if (event.data.focus === 'top') scrollTo(0, 0);
      else if (/^section-\d+$/.test(event.data.focus || '')) {
        const target = document.querySelector('[data-cms-section="' + event.data.focus + '"]');
        if (target?.getClientRects().length) scrollTo(0, Math.max(0, scrollY + target.getBoundingClientRect().top - 95));
      }
    });
    document.addEventListener('click', event => {
      const link = event.target.closest?.('a[href]');
      if (!link) return;
      const url = new URL(link.href, location.href);
      if (url.origin === location.origin && url.pathname === location.pathname && url.hash) return;
      event.preventDefault();
      if (url.origin === location.origin && url.protocol === location.protocol) parent.postMessage({ type: 'nixtio-navigate', path: url.pathname + url.search }, location.origin);
    }, true);
    parent.postMessage({ type:'nixtio-ready' }, location.origin);
  } else {
    const base = window.NIXTIO_CONFIG?.convexUrl;
    if (base) fetch(base + '/api/query', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ path:'content:publicPage', args:{ route, ...(route === '/project' ? {slug} : {}) }, format:'json' }),
    }).then(r => r.ok ? r.json() : null).then(r => {
      if (r?.status === 'success' && r.value) apply(r.value);
      else if (route === '/project') renderDetail([]);
    }).catch(() => {
      if (route === '/project') document.querySelector('#cms-project-detail')?.replaceChildren(node('h1','','Project temporarily unavailable'));
    });
    else if (route === '/project') renderDetail([]);
  }
})();
