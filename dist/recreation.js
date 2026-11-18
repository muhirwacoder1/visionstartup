(() => {
  'use strict';
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cls = (el, suffix) => el?.className?.split(' ').find(c => c.endsWith('__' + suffix));
  const header = $('header');

  // The floating menu follows the contrast of the section behind it.
  const darkSections = $$('.black-section');
  let scheduled = false;
  function updateScroll() {
    scheduled = false;
    const isDark = darkSections.some(el => { const b = el.getBoundingClientRect(); return b.top < 55 && b.bottom > 55; });
    header?.classList.toggle('on-dark', isDark);
    const scrolled = header?.className.match(/\S+__header/)?.[0]?.replace('__header', '__scrolled');
    if (scrolled) header.classList.toggle(scrolled, scrollY > 50);
    const hero = $('[data-home-hero-container]');
    if (hero && !reduced) {
      const t = Math.min(scrollY / innerHeight, 1);
      hero.style.transform = `perspective(1500px) scale(${1 - t * .055}) rotateX(${t * 2.5}deg)`;
    }
  }
  addEventListener('scroll', () => { if (!scheduled) { scheduled = true; requestAnimationFrame(updateScroll); } }, { passive: true });
  updateScroll();

  // Reveal content once, respecting the reference's stagger.
  if (!reduced) document.documentElement.classList.add('motion-ready');
  const reveals = new IntersectionObserver(entries => entries.forEach(e => {
    if (!e.isIntersecting) return;
    e.target.style.transitionDelay = Math.min(Number(e.target.dataset.aosDelay || 0), 400) + 'ms';
    e.target.classList.add('is-revealed');
    reveals.unobserve(e.target);
  }), { threshold: .04, rootMargin: '0px 0px -15px 0px' });
  $$('[data-aos]').forEach(el => reveals.observe(el));

  // Values count up as the corresponding result panels enter view.
  const counters = new IntersectionObserver(entries => entries.forEach(e => {
    if (!e.isIntersecting) return;
    const el = e.target;
    const text = [...el.childNodes].find(n => n.nodeType === 3);
    const target = Number(el.dataset.count);
    const start = performance.now();
    function tick(now) {
      const t = reduced ? 1 : Math.min((now - start) / 1300, 1);
      if (el.hasAttribute('data-cms-count-edited')) return;
      if (text) text.textContent = Math.round(target * (1 - Math.pow(1 - t, 3))) + ' ';
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick); counters.unobserve(el);
  }), { threshold: .4 });
  $$('[data-count]').forEach(el => counters.observe(el));

  // Native video playback, lazily activated outside the opening showreel.
  const videoObserver = new IntersectionObserver(entries => entries.forEach(e => {
    const v = e.target;
    if (e.isIntersecting && !reduced && (v.autoplay || v.dataset.previewAutoplay)) v.play().catch(() => {});
    else if (!e.isIntersecting) v.pause();
  }), { rootMargin: '100px' });
  $$('video').forEach(v => {
    v.muted = true; v.playsInline = true;
    if (v.closest('[data-home-hero-media]')) {
      const ready = () => v.parentElement.classList.add('video-ready');
      v.addEventListener('playing', ready, { once: true });
      if (!reduced) v.play().catch(() => {});
    } else {
      v.dataset.previewAutoplay = 'true'; v.preload = 'metadata';
    }
    if (reduced) v.pause();
    videoObserver.observe(v);
  });
  $$('button[aria-label="Unmute video"],button[aria-label="Mute video"]').forEach(b => b.addEventListener('click', () => {
    const v = $('video', b.parentElement); if (!v) return;
    v.muted = !v.muted; b.setAttribute('aria-label', v.muted ? 'Unmute video' : 'Mute video');
    b.setAttribute('aria-pressed', String(!v.muted)); v.play().catch(() => {});
  }));

  // The project images reveal a second art direction from the pointer position.
  document.addEventListener('pointerover', e => {
    const card = e.target.closest?.('a:has(.project-hover-image)');
    if (!card || card.contains(e.relatedTarget) || e.pointerType === 'touch') return;
    const bounds = card.getBoundingClientRect();
    card.style.setProperty('--pointer-x', ((e.clientX - bounds.left) / bounds.width * 100) + '%');
    card.style.setProperty('--pointer-y', ((e.clientY - bounds.top) / bounds.height * 100) + '%');
  });

  // Service panels expand with content height rather than a fixed desktop size.
  const services = $$('[class*="accordion-item"][class*="__item"]');
  function setService(item, open) {
    const base = cls(item, 'item').replace('__item', '__');
    item.classList.toggle(base + 'isOpen', open);
    const content = $('[class*="__content"]', item), main = $('[class*="__main"]', item);
    content.style.height = open ? main.offsetHeight + 'px' : '';
    const btn = $('button', item), title = $('h3', item)?.textContent || 'service';
    btn.setAttribute('aria-expanded', String(open)); btn.setAttribute('aria-label', (open ? 'Close ' : 'Open ') + title);
    $('path', btn)?.setAttribute('d', open ? 'M20 12H4' : 'M20 12h-8m0 0H4m8 0V4m0 8v8');
    main.inert = !open;
    const trigger = $('[class*="__title"]', item);
    trigger.inert = open; trigger.setAttribute('aria-expanded', String(open));
  }
  services.forEach(item => {
    setService(item, !!cls(item, 'isOpen'));
    const toggle = () => { item.dataset.userToggled = 'true'; setService(item, !cls(item, 'isOpen')); };
    item.addEventListener('click', toggle);
    const title = $('[class*="__title"]', item);
    title.setAttribute('tabindex', '0'); title.setAttribute('role', 'button');
    title.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
  });
  const serviceReveal = new IntersectionObserver(entries => entries.forEach(e => {
    if (e.isIntersecting && !e.target.dataset.userToggled) { setService(e.target, true); serviceReveal.unobserve(e.target); }
  }), { rootMargin: '0px 0px -100px 0px' });
  services.forEach(item => serviceReveal.observe(item));

  // Accessible FAQ accordions, with the same open-one-at-a-time behavior.
  const questions = $$('[class*="faq-section"] button[aria-expanded]');
  function setQuestion(b, open) {
    const item = b.parentElement;
    const base = cls(item, 'item')?.replace('__item', '__');
    if (base) item.classList.toggle(base + 'open', open);
    b.setAttribute('aria-expanded', String(open));
    const answer = $('[class*="__answer"]', item);
    if (answer) { answer.style.height = open ? answer.firstElementChild.scrollHeight + 'px' : '0px'; answer.inert = !open; }
  }
  questions.forEach(b => {
    setQuestion(b, b.getAttribute('aria-expanded') === 'true');
    b.addEventListener('click', () => { const open = b.getAttribute('aria-expanded') !== 'true'; questions.forEach(q => setQuestion(q, q === b && open)); });
  });

  // Responsive mobile menu retains the same destinations as the desktop pills.
  const menuButton = $('button[aria-label="Toggle menu"]');
  if (menuButton) {
    const overlay = document.createElement('div'); overlay.className = 'mobile-menu-layer'; overlay.inert = true;
    const nav = document.createElement('nav'); nav.setAttribute('aria-label', 'Mobile navigation');
    $$('header nav a').forEach(a => nav.append(a.cloneNode(true))); overlay.append(nav); document.body.append(overlay);
    function toggleMenu(open) {
      menuButton.setAttribute('aria-expanded', String(open)); overlay.classList.toggle('open', open); overlay.inert = !open;
      document.body.classList.toggle('menu-open', open);
      const base = cls(menuButton, 'menu-button').replace('__menu-button', '__'); menuButton.classList.toggle(base + 'open', open);
      if (open) $('a', nav)?.focus(); else menuButton.focus();
    }
    menuButton.addEventListener('click', () => toggleMenu(menuButton.getAttribute('aria-expanded') !== 'true'));
    overlay.addEventListener('click', e => { if (e.target === overlay || e.target.closest('a')) toggleMenu(false); });
    addEventListener('keydown', e => {
      if (!overlay.classList.contains('open')) return;
      if (e.key === 'Escape') toggleMenu(false);
      if (e.key === 'Tab' && document.activeElement === menuButton) {
        e.preventDefault(); const links = $$('a', nav); (e.shiftKey ? links.at(-1) : links[0])?.focus();
      }
    });
    overlay.addEventListener('keydown', e => {
      if (e.key !== 'Tab') return;
      const links = $$('a', nav); const index = links.indexOf(document.activeElement);
      if (e.shiftKey && index === 0) { e.preventDefault(); menuButton.focus(); }
      else if (!e.shiftKey && index === links.length - 1) { e.preventDefault(); menuButton.focus(); }
    });
  }

  // Project inquiry controls are a local demo and never make network requests.
  const inquiryIcons = [
    '<rect x="28" y="39" width="126" height="95" rx="3"/><path d="M28 119h126m-77 15v18h28v-18"/><rect x="113" y="65" width="71" height="55" rx="3" fill="#0a0a0a"/><path d="M113 76h71M47 61c20 34 71-23 58 33s-37-8-58 0M145 83v25m0-25h7a6 6 0 0 1 0 12h-7m0-12h-7a6 6 0 0 0 0 12h7m0 0h7a6 6 0 0 1 0 12h-7"/>',
    '<rect x="65" y="36" width="124" height="96" rx="3"/><rect x="43" y="106" width="29" height="31" rx="5" fill="#0a0a0a"/><path d="M47 103a11 11 0 0 1 22 0m-19-9-4-6m19 6 4-6m-19 49v8m14-8v8m-25-32v16m38-16v16m28-25c-15-20-34 3-19 24 7 9 11 2 15 2s11 7 18-4c-12-7-13-16-4-22-3-5-7-6-10 0zm-2-2c0-7 4-12 10-13-1 7-5 12-10 13z"/>',
    '<rect x="28" y="38" width="126" height="95" rx="3"/><path d="M28 51h126M39 64h65M39 71h33m-33 7h47"/><path d="M128 84h36l17 17v49h-53V84Z" fill="#0a0a0a"/><path d="M164 84v17h17m-34 17-10 6 10 6m15-12 10 6-10 6m-6-17-5 22"/>',
    '<path d="M62 37h62l18 18v78H62V37Z"/><path d="M124 37v18h18"/><rect x="111" y="66" width="64" height="34" rx="3" fill="#0a0a0a"/><path d="M119 77h45m-45 7h31"/><rect x="37" y="102" width="40" height="48" rx="4" fill="#0a0a0a"/><path d="M45 113h6l14 16v-16h4v24h-6l-14-16v16h-4v-24Z"/>'
  ];
  $$('[class*="projectTypeSelector"] button').forEach((b, i) => {
    const icon = $('[class*="__icon"]', b);
    if (icon) icon.innerHTML = `<svg viewBox="0 0 210 180" fill="none" stroke="#979ca3" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inquiryIcons[i % 4]}<path d="m14 46 5 5m-5 0 5-5m164-21 6 6m-6 0 6-6"/></svg>`;
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => {
      const selected = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', String(selected));
      const base = cls(b, 'block')?.replace('__block', '__');
      if (base) b.classList.toggle(base + 'selected', selected);
    });
  });
  $$('form').forEach(form => {
    $$('button[type="submit"]', form).forEach(b => { b.disabled = false; });
    form.addEventListener('submit', e => {
      e.preventDefault(); if (!form.reportValidity()) return;
      let result = $('.demo-form-result', form);
      if (!result) { result = document.createElement('p'); result.className = 'demo-form-result'; result.setAttribute('role', 'status'); form.append(result); }
      result.textContent = 'Preview complete. Your message was not sent. Connect a contact service to receive inquiries.';
    });
  });

  // Small presenter preview, matching the original fixed corner video.
  if (!location.pathname.startsWith('/form')) {
    const path = document.querySelector('meta[name="presenter-video"]')?.content;
    if (path) {
      const widget = document.createElement('button'); widget.className = 'talk-widget'; widget.setAttribute('aria-label', 'Meet Arsen — let’s talk');
      widget.innerHTML = `<video src="${path}" autoplay loop muted playsinline preload="metadata" aria-hidden="true"></video><span class="talk-caption">Arsen · Let’s talk ↗</span>`;
      document.body.append(widget); const video = $('video', widget); video.muted = true;
      if (reduced) video.pause();
      const dialog = document.createElement('dialog'); dialog.className = 'talk-dialog';
      dialog.innerHTML = `<button class="talk-close" aria-label="Close introduction">×</button><video src="${path}" controls playsinline preload="none"></video><p>Arsen<br>Chief Communications Officer</p><a href="/form">Let’s talk ↗</a>`;
      document.body.append(dialog);
      widget.addEventListener('click', () => { dialog.showModal(); const v = $('video', dialog); v.currentTime = 0; v.play().catch(() => {}); });
      $('.talk-close', dialog).addEventListener('click', () => dialog.close());
      dialog.addEventListener('close', () => $('video', dialog).pause());
      dialog.addEventListener('click', e => { if (e.target === dialog && (e.clientX < dialog.getBoundingClientRect().left || e.clientX > dialog.getBoundingClientRect().right)) dialog.close(); });
    }
  }
  addEventListener('resize', () => {
    updateScroll(); services.forEach(item => setService(item, !!cls(item, 'isOpen')));
    questions.forEach(b => setQuestion(b, b.getAttribute('aria-expanded') === 'true'));
  });
})();
