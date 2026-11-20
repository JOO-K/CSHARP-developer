/* ============================================================
   ASSETS — a dev-only inventory of every icon, glyph, UI image and font
   style the site uses, and WHERE each one shows up, so parts can be taken
   apart and rebuilt by hand in Figma (Eric, 2026-11-19: "make one so i can
   see all the icons used on the website as well as fonts and where they are
   used but in like an organized way").

   DESKTOP + `?tools` ONLY — the same switch as every other dev control. Without
   it this file does nothing; testers never see the button.

   HOW IT KNOWS
   · In code — on open, every local script and stylesheet is fetched and read:
     `<svg>…</svg>` literals (with the const / key they belong to, file:line),
     SD_LINE_ICONS, and CSS `data:image/svg+xml` icons (with their selector).
     Font-family declarations are read from the stylesheets too.
   · On screen — a MutationObserver on the phones records every svg, glyph,
     image and text style as it renders, with the screen and a short class path.
     It keeps recording while you click around (stored as `sd-assets-v1`), so
     sheets, album pages, search etc. fill in as you visit them. "Sweep" walks
     every top-level screen for you.

   EXPORT (all paste straight into Figma as editable layers)
   · Icons: one SVG, Copy / Download; "Copy sheet" = every icon in the current
     list on a labelled grid, each as a group named after the icon.
   · Fonts: "Copy specimen" = an SVG of <text> in every style (Figma turns each
     into a text layer with that family / weight / size / tracking), and CSV.
   ============================================================ */
(function sdAssets() {
  // Shown on a LOCAL address (Live Server, localhost, LAN, file:) with no flag,
  // or anywhere with ?tools. Never on the public site otherwise.
  const LOCAL = location.protocol === 'file:' ||
    /^(localhost$|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$)/.test(location.hostname);
  const TOOLS = /[?&]tools/.test(location.search);
  if (!LOCAL && !TOOLS) return;
  if (window.matchMedia && matchMedia('(max-width: 767px)').matches) return;

  const STORE = 'sd-assets-v2';   // v2: uses are 'Page — component — part'
  const MAX_ICONS = 900, MAX_USES = 40;
  const ROOT_SEL = '#phone-container';
  // Parts of the phone FRAME, not the app (Eric, 11-19: "ios will be providing that").
  const FRAME_SEL = '.status-bar, .dynamic-island, .home-indicator';
  const FRAME_USE = /\.status-bar|\.sb-icons|\.sb-time|\.dynamic-island/;
  const GLYPH_RE = /[←-⇿⌀-⏿①-⓿■-➿⤀-⥿⬀-⯿×‹›✓✕✖\u{1F300}-\u{1FAFF}]/gu;
  const COVER_RE = /(^https?:)|\/(album|artist|song|user|persona|avatar|cover|fest)[-_]/i;

  /* ---------- state ---------- */
  // icons: key → { key, markup, names:Set, src:[{file,line,name}], uses:{where:n}, big, css }
  const S = { icons: new Map(), glyphs: new Map(), images: new Map(), fonts: new Map(), cssFonts: new Map() };
  const elRefs = new Map();          // `${kind}|${key}|${where}` → WeakRef(el), for click-to-find
  const seen = new WeakMap();        // el → the page it was last recorded on (album / artist pages reuse Home's elements)
  let staticDone = false;

  function load() {
    let d; try { d = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch (e) {}
    if (!d) return;
    // Drop anything recorded from the status bar before it was excluded.
    const strip = arr => (arr || []).filter(o => {
      Object.keys(o.uses || {}).forEach(w => { if (FRAME_USE.test(w)) delete o.uses[w]; });
      return Object.keys(o.uses || {}).length;
    });
    d.icons = strip(d.icons); d.glyphs = strip(d.glyphs); d.images = strip(d.images); d.fonts = strip(d.fonts);
    (d.icons || []).forEach(o => S.icons.set(o.key, { ...o, names: new Set(o.names || []), src: [] }));
    (d.glyphs || []).forEach(o => S.glyphs.set(o.key, o));
    (d.images || []).forEach(o => S.images.set(o.key, o));
    (d.fonts || []).forEach(o => S.fonts.set(o.key, o));
    Object.assign(Y, d.y || {});
  }
  let saveT = 0;
  function save() {
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      const icons = [...S.icons.values()].filter(o => Object.keys(o.uses).length)
        .map(o => ({ key: o.key, markup: o.markup, names: [...o.names], uses: o.uses, big: o.big, css: o.css }));
      const d = { icons, glyphs: [...S.glyphs.values()], images: [...S.images.values()], fonts: [...S.fonts.values()], y: Y };
      try { localStorage.setItem(STORE, JSON.stringify(d)); } catch (e) {}
    }, 800);
  }

  /* ---------- svg normalising ---------- */
  const DROP_ATTR = /^(class|style|id|role|focusable|tabindex|aria-.*|data-.*|width|height|xmlns(:.*)?|version|onclick)$/;
  const parser = new DOMParser();
  function svgFromString(s) {
    const doc = parser.parseFromString(s.replace(/\$\{[^}]*\}/g, ''), 'image/svg+xml');
    const el = doc.documentElement;
    return el && el.nodeName.toLowerCase() === 'svg' && !doc.querySelector('parsererror') ? el : null;
  }
  // A clean copy: no classes / ids / sizes on the root, whitespace collapsed.
  function clean(svg, sizeFromBox) {
    const c = svg.cloneNode(true);
    [...c.attributes].forEach(a => { if (DROP_ATTR.test(a.name)) c.removeAttribute(a.name); });
    c.querySelectorAll('*').forEach(n => { n.removeAttribute('class'); n.removeAttribute('style'); });
    let vb = c.getAttribute('viewBox');
    if (!vb) {
      const w = parseFloat(svg.getAttribute('width')) || 24, h = parseFloat(svg.getAttribute('height')) || 24;
      vb = `0 0 ${w} ${h}`; c.setAttribute('viewBox', vb);
    }
    if (sizeFromBox) { const b = vb.split(/[\s,]+/).map(Number); c.setAttribute('width', b[2]); c.setAttribute('height', b[3]); }
    c.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    return c;
  }
  function inner(c) { return c.innerHTML.replace(/\s+/g, ' ').replace(/> </g, '><').trim(); }
  function keyOf(c) { return (c.getAttribute('viewBox') || '') + '|' + inner(c).replace(/\s?xmlns="[^"]*"/g, ''); }
  function dKey(c) {
    const d = [...c.querySelectorAll('[d],[points]')].map(n => n.getAttribute('d') || n.getAttribute('points')).join('|');
    return d.length > 8 ? d.replace(/\s+/g, ' ') : '';
  }
  function serial(c) {
    return new XMLSerializer().serializeToString(c).replace(/\s?xmlns="http:\/\/www\.w3\.org\/1999\/xhtml"/g, '');
  }
  const GEOM = ['viewBox', 'd', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'width', 'height', 'points'];
  function broken(c) {
    return [c, ...c.querySelectorAll('*')].some(n => GEOM.some(a => n.hasAttribute(a) && !/\d/.test(n.getAttribute(a))))
      || /\s{2,}|^\s|\s$/.test(c.getAttribute('viewBox') || '');
  }
  const pending = [];                // templated literals waiting for their icon to render
  function claim(o) {
    const dk = dKey(svgFromString(o.markup) || document.createElementNS('http://www.w3.org/2000/svg', 'svg'));
    for (let i = pending.length - 1; i >= 0; i--) {
      const p = pending[i];
      if (p.k === o.key || (p.dk && p.dk === dk)) { o.src.push(p.src); if (p.name) o.names.add(p.name); pending.splice(i, 1); }
    }
  }
  const dIndex = new Map();          // dKey → icon key (lets `${cls}`-templated literals match what rendered)
  function addIcon(c, info) {
    const key = keyOf(c);
    let o = S.icons.get(key);
    if (!o) {
      const dk = dKey(c);
      if (dk && dIndex.has(dk)) o = S.icons.get(dIndex.get(dk));
    }
    if (!o) {
      if (S.icons.size >= MAX_ICONS) return null;
      const markup = serial(c);
      o = { key, markup, names: new Set(), src: [], uses: {}, big: markup.length > 5000 || c.querySelectorAll('*').length > 60 };
      S.icons.set(key, o);
    }
    const dk = dKey(c); if (dk && !dIndex.has(dk)) dIndex.set(dk, o.key);
    if (info && info.name) o.names.add(info.name);
    if (pending.length) claim(o);
    return o;
  }

  /* ---------- static pass: read the source ---------- */
  function lineAt(text, i) { let n = 1; for (let j = text.indexOf('\n'); j !== -1 && j < i; j = text.indexOf('\n', j + 1)) n++; return n; }
  function nameNear(text, i) {
    const ls = text.lastIndexOf('\n', i) + 1;
    const head = text.slice(ls, i);
    let m = head.match(/(?:const|let|var)\s+([\w$]+)\s*=/) || head.match(/([\w$]+)\s*:\s*[`'"]\s*$/) || head.match(/['"]?([\w$-]+)['"]?\s*:\s*[`'"]/);
    if (m) return m[1];
    const back = text.slice(Math.max(0, i - 4000), i);
    const fns = [...back.matchAll(/(?:function\s+([\w$]+)|(?:window\.)?([\w$]+)\s*=\s*function|const\s+([\w$]+)\s*=\s*\([^)]*\)\s*=>)/g)];
    const f = fns.pop(); return f ? 'in ' + (f[1] || f[2] || f[3]) + '()' : '';
  }
  async function readSource() {
    if (staticDone) return;
    staticDone = true;
    const local = u => u && new URL(u, location.href).origin === location.origin;
    const js = [...document.scripts].map(s => s.src).filter(local).filter(u => !/assets\.js/.test(u));
    const css = [...document.querySelectorAll('link[rel=stylesheet]')].map(l => l.href).filter(local);
    const get = u => fetch(u, { cache: 'no-store' }).then(r => r.ok ? r.text() : '').catch(() => '');
    const file = u => new URL(u).pathname.split('/').pop();

    // SD_LINE_ICONS — the 24px line set
    if (typeof SD_LINE_ICONS === 'object' && typeof sdLineIcon === 'function') {
      Object.keys(SD_LINE_ICONS).forEach(k => {
        const el = svgFromString(sdLineIcon(k)); if (!el) return;
        const o = addIcon(clean(el), { name: k }); if (o) { o.src.push({ file: 'screens.js', line: 0, name: 'SD_LINE_ICONS.' + k }); o.set = 'line'; }
      });
    }
    const texts = await Promise.all(js.map(get));
    texts.forEach((t, fi) => {
      const f = file(js[fi]);
      for (const m of t.matchAll(/<svg\b[\s\S]*?<\/svg>/g)) {
        if (m[0].length > 40000) continue;
        const el = svgFromString(m[0]); if (!el) continue;
        const nm = nameNear(t, m.index);
        const src = { file: f, line: lineAt(t, m.index), name: nm, dyn: m[0].includes('${') };
        const c = clean(el);
        // A literal whose geometry is templated (`d="${…}"`, `viewBox="0 0 ${w} ${h}"`)
        // can't be drawn from source. It only names an icon once that icon renders.
        if (src.dyn && broken(c)) { pending.push({ k: keyOf(c), dk: dKey(c), src, name: /^in /.test(nm) ? '' : nm }); continue; }
        const o = addIcon(c, { name: /^in /.test(nm) ? '' : nm });
        if (o) o.src.push(src);
      }
    });
    const ctexts = await Promise.all(css.map(get));
    ctexts.forEach((t, fi) => {
      const f = file(css[fi]);
      // data-URI svg icons
      for (const m of t.matchAll(/url\(\s*(["']?)(data:image\/svg\+xml[^"')]*(?:\)[^"')]*)*?)\1\s*\)/g)) {
        let s = m[2];
        try { s = /;base64,/.test(s) ? atob(s.split(',')[1]) : decodeURIComponent(s.slice(s.indexOf(',') + 1)); } catch (e) { continue; }
        const el = svgFromString(s); if (!el) continue;
        const sel = (t.slice(Math.max(0, t.lastIndexOf('}', m.index) + 1), m.index).split('{')[0] || '').trim().replace(/\s+/g, ' ').slice(0, 80);
        const o = addIcon(clean(el), {}); if (!o) continue;
        o.css = true; o.src.push({ file: f, line: lineAt(t, m.index), name: sel });
      }
      // font-family declarations → which selectors ask for which family
      for (const m of t.matchAll(/font-family\s*:\s*([^;}]+)/g)) {
        const raw = m[1].trim();
        const fam = resolveFamily(raw);
        const sel = (t.slice(t.lastIndexOf('}', m.index) + 1, m.index).split('{')[0] || '').trim().replace(/\s+/g, ' ').slice(0, 90);
        if (!sel || /^@/.test(sel)) continue;
        if (!S.cssFonts.has(fam)) S.cssFonts.set(fam, []);
        S.cssFonts.get(fam).push({ file: f, line: lineAt(t, m.index), sel, raw });
      }
    });
    render();
  }
  function resolveFamily(raw) {
    let v = raw.replace(/!important/, '').trim();
    const m = v.match(/var\((--[\w-]+)/);
    if (m) v = getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim() || v;
    if (v === 'inherit') return '(inherit)';
    return firstFamily(v);
  }
  function firstFamily(list) { return (list.split(',')[0] || '').trim().replace(/^["']|["']$/g, ''); }
  // The family that actually paints: the first one in the stack the browser has.
  const famCache = new Map();
  function painted(list) {
    if (famCache.has(list)) return famCache.get(list);
    const fams = list.split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
    let out = fams[0];
    for (const f of fams) {
      if (/^(system-ui|sans-serif|serif|monospace|ui-monospace|-apple-system|cursive)$/.test(f)) { out = f; break; }
      try { if ([...document.fonts].some(ff => ff.family.replace(/["']/g, '') === f && ff.status === 'loaded')) { out = f; break; } } catch (e) {}
    }
    famCache.set(list, out); return out;
  }

  /* ---------- live pass: what the phones render ---------- */
  function screenName() {
    try { return currentScreen().name; } catch (e) { return '?'; }
  }
  function classOf(el) {
    const c = el.classList && [...el.classList].find(k => !/^(on|is-|active|open|show|hidden|fade|sd-wire)/.test(k));
    return c ? '.' + c : el.tagName.toLowerCase();
  }
  // The page: album / artist pages are states of the Home shell, not screens,
  // so they're read off the shell's classes. A sheet / overlay is appended.
  const STATE_PAGES = [['s-home-v3--artist', 'Artist page'], ['s-home-v3--album', 'Album page'], ['s-home-v3--rvp', 'Review (in place)']];
  const OVERLAY_RE = /(^|-)(sheet|modal|overlay|popover|drawer|ov)$/;
  function pageName(el) {
    const scr = el.closest('.app-screen');
    let name = screenName();
    if (scr) for (const [c, l] of STATE_PAGES) if (scr.classList.contains(c)) { name = l; break; }
    for (let n = el; n && n !== scr; n = n.parentElement) {
      const c = n.classList && [...n.classList].find(k => OVERLAY_RE.test(k));
      if (c) { name += ' · ' + pretty(c); break; }
    }
    return name;
  }
  // The component: the first ancestor under the screen that is no longer a
  // full-height wrapper (≤60% of the screen, more than one child) — a review
  // card, the album header, a tab bar — plus the repeated item inside it, if any
  // (a credit row, a song row).
  function repeated(n) {
    const c = n.classList && n.classList[0], p = n.parentElement; if (!c || !p) return false;
    let k = 0; for (const x of p.children) if (x.classList.contains(c) && ++k > 1) return true;
    return false;
  }
  function texts(n) {
    let k = 0;
    for (const e of n.querySelectorAll('*')) { for (const t of e.childNodes) if (t.nodeType === 3 && t.nodeValue.trim()) { k++; break; } if (k > 1) break; }
    return k;
  }
  // Where on the page (top of the content, scroll included), so components and
  // their parts list top-to-bottom like the screen.
  const Y = {};
  function pageY(el) {
    const root = el.closest('.app-screen') || el.closest('.phone-screen'); if (!root) return 0;
    let y = el.getBoundingClientRect().top - root.getBoundingClientRect().top;
    for (let n = el.parentElement; n && n !== root; n = n.parentElement) y += n.scrollTop;
    return Math.round(y);
  }
  function componentOf(el) {
    const root = el.closest('.app-screen') || el.closest('.phone-screen');
    const H = (root && root.getBoundingClientRect().height) || 800;
    const chain = []; for (let n = el.parentElement; n && n !== root; n = n.parentElement) chain.unshift(n);
    let si = -1;
    for (let i = 0; i < chain.length; i++) {
      const n = chain[i];
      if (!n.classList.length) continue;
      if (n.getBoundingClientRect().height > H * 0.6) continue;
      if (n.childElementCount < 2 && i < chain.length - 1) continue;
      si = i; break;
    }
    if (si < 0) { const p = el.parentElement; return p && p !== root ? classOf(p) : '(screen)'; }
    let label = classOf(chain[si]);
    for (let i = si + 1; i < chain.length; i++) if (repeated(chain[i]) && texts(chain[i]) > 1) { label += ' › ' + classOf(chain[i]); break; }
    return label;
  }
  function where(el) {
    const own = classOf(el);
    const part = own.startsWith('.') ? own : (el.parentElement ? classOf(el.parentElement) + ' ' : '') + own;
    const label = el.closest('[aria-label],[title]');
    const tag = label && label !== el ? ' “' + (label.getAttribute('aria-label') || label.getAttribute('title')).slice(0, 28) + '”' : '';
    return pageName(el) + ' — ' + componentOf(el) + ' — ' + part + tag;
  }
  // Class names read as words: .v3-rev-card → "review card".
  const NAMES = { 'v3-rev-card': 'review card', 'v3-blue': 'album header', 'v3-bento': 'album header', 'v3-review-panel': 'page body',
    'wall2-bar': 'tab bar', 'v3-bottom-nav': 'bottom nav', 'v3-header': 'top header', 'v3-fb': 'deck' };
  const WORDS = { rev: 'review', rsp: 'review', rsh: 'review sheet', cred: 'credit', lbl: 'label', alb: 'album', cmt: 'comment', n: 'count',
    ai: 'artist info', aa: 'artist albums', ap: 'artist', hd: 'heading', sec: 'section', dur: 'duration', num: 'number', hist: 'histogram',
    av: 'avatar', val: 'value', rg: 'rating', fbr: 'deck review', fb: 'deck', btn: 'button', ico: 'icon', cat: 'tab', wb: 'browse', ov: '', blue: '' };
  function pretty(cls) {
    const c = String(cls).replace(/^\./, '').split(' ')[0];
    if (NAMES[c]) return NAMES[c];
    return c.replace(/^(v\d+|sd|s)-/, '').split(/[-_]+/).map(w => w in WORDS ? WORDS[w] : w).filter((w, i, a) => w && w !== a[i - 1]).join(' ') || c;
  }
  function prettyComp(c) { return c.split(' › ').map(pretty).join(' › '); }
  function bump(map, kind, o, el) {
    const w = where(el);
    const y = pageY(el); if (Y[w] == null || y < Y[w]) Y[w] = y;
    if (o.uses[w] == null && Object.keys(o.uses).length >= MAX_USES) return;
    o.uses[w] = (o.uses[w] || 0) + 1;
    elRefs.set(kind + '|' + o.key + '|' + w, new WeakRef(el));
    return w;
  }
  function guessName(el) {
    const own = el.getAttribute('aria-label') || el.getAttribute('data-ico') || el.getAttribute('data-icon');
    if (own) return own;
    const cls = el.classList && [...el.classList].find(k => !/^(sd-dot-ico|ico|icon|svg)$/.test(k));
    if (cls) return cls;
    const p = el.parentElement;
    const lab = p && (p.getAttribute('aria-label') || p.getAttribute('title'));
    if (lab) return lab;
    return p && p.classList && p.classList[0] ? p.classList[0] : '';
  }
  function scanEl(el) {
    if (el.ownerSVGElement) return;                       // inside an svg: counted with the svg
    if (!el.closest('.phone-screen')) return;             // the viewer's own labels aren't the app
    if (el.closest(FRAME_SEL)) return;                    // the mockup's fake iOS status bar: iOS draws the real one
    if (!el.getClientRects().length) return;              // hidden: NOT marked, so it's recorded when it shows
    const pg = pageName(el);
    if (seen.get(el) === pg) return; seen.set(el, pg);
    const tag = el.tagName;
    if (tag === 'svg' || tag === 'SVG') {
      if (el.closest('svg') !== el) return;                 // nested svg: counted with its parent
      const r = el.getBoundingClientRect(); if (!r.width && !r.height) return;
      const o = addIcon(clean(el), { name: guessName(el) }); if (o) bump(S.icons, 'icon', o, el);
      return;
    }
    if (el.closest('svg')) return;
    const cs = getComputedStyle(el);
    // images: <img>, CSS backgrounds and masks
    const urls = [];
    if (tag === 'IMG' && el.currentSrc) urls.push(el.currentSrc);
    for (const p of [cs.backgroundImage, cs.maskImage || cs.webkitMaskImage]) {
      if (p && p !== 'none') for (const m of p.matchAll(/url\("?([^")]+)"?\)/g)) urls.push(m[1]);
    }
    urls.forEach(u => {
      if (/^data:image\/svg/.test(u)) {
        let s; try { s = /;base64,/.test(u) ? atob(u.split(',')[1]) : decodeURIComponent(u.slice(u.indexOf(',') + 1)); } catch (e) { return; }
        const sv = svgFromString(s); if (!sv) return;
        const o = addIcon(clean(sv), { name: guessName(el) }); if (o) { o.css = true; bump(S.icons, 'icon', o, el); }
        return;
      }
      if (/^data:/.test(u)) return;
      const rel = u.replace(location.origin + location.pathname.replace(/[^/]*$/, ''), '');
      const cover = COVER_RE.test(rel);
      let o = S.images.get(rel);
      if (!o) { o = { key: rel, cover, uses: {} }; S.images.set(rel, o); }
      bump(S.images, 'img', o, el);
    });
    // text: font style + glyph icons, from the element's own text
    let txt = '';
    for (const n of el.childNodes) if (n.nodeType === 3) txt += n.nodeValue;
    txt = txt.replace(/\s+/g, ' ').trim();
    if (!txt || cs.visibility === 'hidden') return;
    const fam = painted(cs.fontFamily);
    const k = [fam, cs.fontWeight, cs.fontStyle, cs.fontSize, cs.lineHeight, cs.letterSpacing, cs.textTransform].join('|');
    let f = S.fonts.get(k);
    if (!f) {
      f = { key: k, fam, weight: cs.fontWeight, style: cs.fontStyle, size: cs.fontSize, lh: cs.lineHeight, ls: cs.letterSpacing,
            tt: cs.textTransform, stack: cs.fontFamily, sample: '', uses: {} };
      S.fonts.set(k, f);
    }
    if (!f.sample || (f.sample.length < 12 && txt.length > f.sample.length)) f.sample = txt.slice(0, 48);
    const fw = bump(S.fonts, 'font', f, el);
    if (fw) { f.ex = f.ex || {}; if (!f.ex[fw]) f.ex[fw] = txt.slice(0, 40); }   // the real text at each spot
    const gl = txt.match(GLYPH_RE);
    if (gl) new Set(gl).forEach(ch => {
      let g = S.glyphs.get(ch);
      if (!g) { g = { key: ch, cp: 'U+' + ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0'), fam, uses: {} }; S.glyphs.set(ch, g); }
      bump(S.glyphs, 'glyph', g, el);
    });
  }
  function scanAll(root) {
    root = root || document.querySelector(ROOT_SEL); if (!root) return;
    const all = root.querySelectorAll('*');
    for (let i = 0; i < all.length; i++) scanEl(all[i]);
    save(); if (panel && !panel.hidden) renderSoon();
  }
  let pend = 0;
  function scanSoon() {
    if (pend) return;
    pend = setTimeout(() => { pend = 0; (window.requestIdleCallback || (f => f()))(() => scanAll()); }, 700);
  }
  function watch() {
    const root = document.querySelector(ROOT_SEL); if (!root) return setTimeout(watch, 500);
    // New nodes, or a screen changing state (Home → album page → artist page is a class flip).
    new MutationObserver(ms => {
      if (ms.some(m => m.type === 'childList' || (m.target.classList && m.target.classList.contains('app-screen')))) scanSoon();
    }).observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    scanSoon();
  }

  /* ---------- sweep: visit every top-level screen ---------- */
  async function sweep(btn) {
    if (typeof goToScreen !== 'function' || typeof SCREENS === 'undefined') return;
    const back = typeof currentIdx === 'number' ? currentIdx : 0;
    btn.disabled = true;
    for (let i = 0; i < SCREENS.length; i++) {
      btn.textContent = `Sweep ${i + 1}/${SCREENS.length}`;
      goToScreen(i);
      await new Promise(r => setTimeout(r, 1100));
      scanAll();
    }
    // Album and artist pages aren't screens: open them on Home.
    const homeI = SCREENS.findIndex(x => x.id === 'home');
    const alb = window.featuredAlbum || (window.ARCHIVE || [])[0];
    if (homeI >= 0 && alb && window.openAlbumPage) {
      goToScreen(homeI); await new Promise(r => setTimeout(r, 1100));
      btn.textContent = 'Sweep: album page'; openAlbumPage(alb); await new Promise(r => setTimeout(r, 1300)); scanAll();
      if (window.openArtistPageFor) { btn.textContent = 'Sweep: artist page'; openArtistPageFor(alb.artist); await new Promise(r => setTimeout(r, 1300)); scanAll(); }
    }
    goToScreen(back);
    btn.textContent = 'Sweep screens'; btn.disabled = false;
    render();
  }

  /* ---------- export ---------- */
  function forFigma(markup) {
    // currentColor has no meaning in Figma — paint it black, keep everything else.
    return markup.replace(/currentColor/g, '#000000');
  }
  function iconName(o) {
    const src = o.src.find(s => s.name && !/^in /.test(s.name));
    return (src && src.name.replace(/^SD_LINE_ICONS\./, '')) || [...o.names][0] || 'icon';
  }
  function slug(s) { return String(s).replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'icon'; }
  function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: type || 'image/svg+xml' }));
    a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function copy(text, btn) {
    navigator.clipboard.writeText(text).then(() => flashBtn(btn, 'Copied'), () => flashBtn(btn, 'Copy failed'));
  }
  function flashBtn(btn, t) { if (!btn) return; const o = btn.textContent; btn.textContent = t; setTimeout(() => (btn.textContent = o), 1200); }

  // Every icon in `list` on a grid: each a <g id="name"> with the icon's own
  // root attributes (fill / stroke / width…) moved onto it, so Figma makes one
  // named group per icon with the right strokes.
  function sheet(list) {
    const COLS = 8, CELL = 96, ICON = 40;
    const used = {};
    const cells = list.map((o, i) => {
      const el = svgFromString(o.markup); if (!el) return '';
      const vb = (el.getAttribute('viewBox') || '0 0 24 24').split(/[\s,]+/).map(Number);
      const s = ICON / Math.max(vb[2], vb[3]);
      const x = (i % COLS) * CELL + (CELL - vb[2] * s) / 2, y = Math.floor(i / COLS) * (CELL + 14) + 18;
      const attrs = [...el.attributes].filter(a => !/^(viewBox|xmlns.*|width|height)$/.test(a.name)).map(a => `${a.name}="${a.value}"`).join(' ');
      let nm = slug(iconName(o)); used[nm] = (used[nm] || 0) + 1; if (used[nm] > 1) nm += '-' + used[nm];
      const lx = (i % COLS) * CELL + CELL / 2, ly = Math.floor(i / COLS) * (CELL + 14) + 18 + ICON + 22;
      return `<g id="${nm}" transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${s.toFixed(4)}) translate(${-vb[0]} ${-vb[1]})" ${attrs}>${el.innerHTML}</g>` +
             `<text x="${lx}" y="${ly}" text-anchor="middle" font-family="DM Sans" font-size="10" fill="#666666">${nm}</text>`;
    });
    const W = COLS * CELL, H = Math.ceil(list.length / COLS) * (CELL + 14) + 10;
    return forFigma(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${cells.join('')}</svg>`);
  }
  function specimen(list) {
    let y = 30; const rows = [];
    list.forEach(f => {
      const px = parseFloat(f.size) || 12, ls = parseFloat(f.ls) || 0;
      const sample = (f.tt === 'uppercase' ? f.sample.toUpperCase() : f.sample).replace(/[<&]/g, c => c === '<' ? '&lt;' : '&amp;');
      rows.push(`<text x="0" y="${y}" font-family="DM Sans" font-size="10" fill="#888888">${esc(styleLabel(f))}</text>`);
      y += px + 10;
      rows.push(`<text id="${slug(f.fam + '-' + f.weight + '-' + px)}" x="0" y="${y}" font-family="${f.fam}" font-weight="${f.weight}" font-style="${f.style}" font-size="${px}" letter-spacing="${ls}" fill="#000000">${sample}</text>`);
      y += 26;
    });
    return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="${y}" viewBox="0 0 720 ${y}">${rows.join('')}</svg>`;
  }
  function styleLabel(f) {
    const lh = f.lh === 'normal' ? 'normal' : f.lh;
    const ls = f.ls === 'normal' || f.ls === '0px' ? '' : ' · tracking ' + f.ls;
    return `${f.fam} ${f.weight}${f.style === 'italic' ? ' italic' : ''} · ${f.size} / ${lh}${ls}${f.tt !== 'none' ? ' · ' + f.tt : ''}`;
  }
  function csv(list) {
    const q = v => '"' + String(v).replace(/"/g, '""') + '"';
    return ['family,weight,style,size,line-height,letter-spacing,transform,uses,sample,where']
      .concat(list.map(f => [f.fam, f.weight, f.style, f.size, f.lh, f.ls, f.tt, total(f), f.sample, Object.keys(f.uses).join(' | ')].map(q).join(','))).join('\n');
  }

  /* ---------- UI ---------- */
  let panel, tab = 'icons', group = 'comp', q = '', sel = null, showCovers = false, showUnused = false;
  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]); }
  function total(o) { return Object.values(o.uses).reduce((a, b) => a + b, 0); }
  function match(o, extra) {
    if (!q) return true;
    const hay = (extra || '') + ' ' + Object.keys(o.uses).join(' ') + ' ' + (o.src || []).map(s => s.file + ' ' + s.name).join(' ');
    return hay.toLowerCase().includes(q);
  }
  function screensOf(o) { return [...new Set(Object.keys(o.uses).map(w => w.split(' — ')[0]))]; }
  const folded = new Set();
  // page → component → [{ o, part, w, n }]
  function compsInOrder(comps) {
    const top = rows => Math.min(...rows.map(r => Y[r.w] == null ? 1e9 : Y[r.w]));
    return Object.entries(comps).sort((a, b) => top(a[1]) - top(b[1]));
  }
  function byComp(list) {
    const g = {};
    list.forEach(o => Object.entries(o.uses).forEach(([w, n]) => {
      const [pg, comp, part] = w.split(' — ');
      const P = g[pg] = g[pg] || {}, k = comp || '(screen)';
      (P[k] = P[k] || []).push({ o, part: part || '', w, n });
    }));
    return g;
  }
  function pageOrder(g) {
    const order = (typeof SCREENS !== 'undefined' ? SCREENS.map(x => x.name) : []);
    const hi = order.indexOf('Home'); order.splice(hi + 1, 0, 'Album page', 'Artist page', 'Review (in place)');
    const rank = k => { const i = order.indexOf(k.split(' · ')[0]); return (i < 0 ? 99 : i) + (k.includes(' · ') ? 0.5 : 0); };
    return Object.keys(g).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  }
  function pageHead(pg, info) {
    return `<button class="ab-page${folded.has(pg) ? '' : ' open'}" data-fold="${esc(pg)}">${esc(pg)} <span class="ab-n">${info}</span></button>`;
  }
  // One row per (part, style) in a component, biggest type first.
  function fontRows(rows) {
    const m = new Map();
    rows.forEach(r => { const k = r.part + '|' + r.o.key; const x = m.get(k); if (x) x.n += r.n; else m.set(k, { ...r }); });
    const yy = r => Y[r.w] == null ? 1e9 : Y[r.w];
    return [...m.values()].sort((a, b) => yy(a) - yy(b) || parseFloat(b.o.size) - parseFloat(a.o.size));
  }
  function compView(kind, list) {
    const g = byComp(list);
    return pageOrder(g).map(pg => {
      const comps = g[pg];
      const n = new Set(Object.values(comps).flat().map(r => r.o.key)).size;
      const h = pageHead(pg, `${Object.keys(comps).length} components · ${n} ${kind === 'font' ? 'styles' : 'items'}`);
      if (folded.has(pg)) return h;
      return h + compsInOrder(comps).map(([c, rows]) => {
        const head = `<div class="ab-chd"><span>${esc(prettyComp(c))}</span><code>${esc(c)}</code></div>`;
        if (kind === 'font') return `<div class="ab-comp">${head}` + fontRows(rows).map(r => {
          const f = r.o, smp = (f.ex && f.ex[r.w]) || f.sample;
          return `<button class="ab-frow${sel === 'font|' + f.key ? ' on' : ''}" data-sel="font|${esc(f.key)}" data-find="${esc('font|' + f.key + '|' + r.w)}" title="${esc(r.part)}">
            <span class="ab-part">${esc(pretty(r.part))}</span>
            <span class="ab-spec" style="font-family:${esc(f.stack)};font-weight:${f.weight};font-style:${f.style};font-size:${Math.min(parseFloat(f.size), 30)}px;letter-spacing:${f.ls};text-transform:${f.tt}">${esc(smp)}</span>
            <span class="ab-fmeta">${esc(styleLabel(f))}</span></button>`;
        }).join('') + '</div>';
        const uniq = [...new Map(rows.map(r => [r.o.key, r.o])).values()];
        return `<div class="ab-comp">${head}<div class="ab-grid">${uniq.map(o => cellHtml(kind, o)).join('')}</div></div>`;
      }).join('');
    }).join('');
  }
  function cellHtml(kind, o) {
    if (kind === 'icon') return `<button class="ab-cell${sel === 'icon|' + o.key ? ' on' : ''}" data-sel="icon|${esc(o.key)}" title="${esc(iconName(o))}">
            <span class="ab-ico">${o.markup}</span><span class="ab-nm">${esc(iconName(o))}</span><span class="ab-c">${total(o) || '—'}</span></button>`;
    if (kind === 'glyph') return `<button class="ab-cell${sel === 'glyph|' + o.key ? ' on' : ''}" data-sel="glyph|${esc(o.key)}"><span class="ab-ico ab-glyph" style="font-family:'${esc(o.fam)}'">${esc(o.key)}</span><span class="ab-nm">${o.cp}</span><span class="ab-c">${total(o)}</span></button>`;
    return `<button class="ab-cell${sel === 'img|' + o.key ? ' on' : ''}" data-sel="img|${esc(o.key)}" title="${esc(o.key)}"><span class="ab-ico ab-img" style="background-image:url('${esc(o.key)}')"></span><span class="ab-nm">${esc(o.key.split('/').pop().split('?')[0])}</span><span class="ab-c">${total(o)}</span></button>`;
  }
  // The Figma specimen, laid out page → component → each part in its style.
  function specimenComp(list) {
    const g = byComp(list); let y = 0; const rows = [];
    const x = t => String(t).replace(/[<&]/g, c => c === '<' ? '&lt;' : '&amp;');
    pageOrder(g).forEach(pg => {
      y += 44; rows.push(`<text x="0" y="${y}" font-family="DM Sans" font-weight="700" font-size="22" fill="#000000">${x(pg)}</text>`);
      compsInOrder(g[pg]).forEach(([c, rs]) => {
        y += 34; rows.push(`<text x="0" y="${y}" font-family="DM Sans" font-weight="600" font-size="13" fill="#555555">${x(prettyComp(c))}</text>`);
        fontRows(rs).forEach(r => {
          const f = r.o, px = parseFloat(f.size) || 12, ls = parseFloat(f.ls) || 0;
          let smp = (f.ex && f.ex[r.w]) || f.sample; if (f.tt === 'uppercase') smp = smp.toUpperCase();
          y += 20; rows.push(`<text x="12" y="${y}" font-family="DM Sans" font-size="10" fill="#999999">${x(pretty(r.part) + '  ·  ' + styleLabel(f))}</text>`);
          y += px + 6; rows.push(`<text id="${slug(pg + '-' + pretty(c) + '-' + pretty(r.part))}" x="12" y="${y}" font-family="${f.fam}" font-weight="${f.weight}" font-style="${f.style}" font-size="${px}" letter-spacing="${ls}" fill="#000000">${x(smp)}</text>`);
        });
      });
    });
    y += 30;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="${y}" viewBox="0 0 720 ${y}">${rows.join('')}</svg>`;
  }

  function build() {
    panel = document.createElement('aside');
    panel.id = 'assetbox'; panel.hidden = true;
    panel.innerHTML = `
      <div class="db-hd"><span class="db-title">Assets</span><span class="ab-count" id="ab-count"></span>
        <button class="db-x" title="Close">×</button></div>
      <div class="db-tabs" id="ab-tabs"></div>
      <div class="ab-bar">
        <input class="ab-q" id="ab-q" placeholder="Filter — name, screen, class, file…" spellcheck="false">
        <select class="ab-sel" id="ab-group" title="Group by"><option value="comp">By component</option><option value="screen">By page</option><option value="type">By kind</option></select>
        <button class="db-btn" id="ab-sweep" title="Visit every top-level screen and record what renders">Sweep screens</button>
      </div>
      <div class="ab-body" id="ab-body"></div>
      <div class="ab-detail" id="ab-detail" hidden></div>
      <div class="db-foot" id="ab-foot"></div>`;
    (document.getElementById('stage') || document.body).appendChild(panel);
    panel.querySelector('.db-x').onclick = toggle;
    panel.querySelector('#ab-q').oninput = e => { q = e.target.value.trim().toLowerCase(); render(); };
    panel.querySelector('#ab-group').onchange = e => { group = e.target.value; render(); };
    panel.querySelector('#ab-sweep').onclick = e => sweep(e.currentTarget);
    panel.addEventListener('click', onClick);
  }
  function toggle() {
    if (!panel) build();
    panel.hidden = !panel.hidden;
    document.getElementById('btn-assets').classList.toggle('on', !panel.hidden);
    if (!panel.hidden) { scanAll(); readSource(); render(); }
  }
  let rT = 0;
  function renderSoon() { clearTimeout(rT); rT = setTimeout(render, 300); }

  function iconsList() {
    // Only what has actually rendered on a phone, unless "show unused" is on.
    return [...S.icons.values()].filter(o => (showUnused || total(o) > 0) && match(o, iconName(o) + ' ' + [...o.names].join(' ')));
  }
  function iconGroups(list) {
    if (group === 'screen') return byScreen(list, o => total(o));
    const g = { 'Line icon set (SD_LINE_ICONS)': [], 'Named in code': [], 'CSS icons': [], 'On screen, unnamed in code': [], 'Large graphics': [], 'In code, not seen on screen yet': [] };
    list.forEach(o => {
      const live = total(o) > 0;
      if (o.set === 'line') g['Line icon set (SD_LINE_ICONS)'].push(o);
      else if (o.big) g['Large graphics'].push(o);
      else if (o.css) g['CSS icons'].push(o);
      else if (!live) g['In code, not seen on screen yet'].push(o);
      else if (o.src.length) g['Named in code'].push(o);
      else g['On screen, unnamed in code'].push(o);
    });
    Object.values(g).forEach(a => a.sort((x, y) => total(y) - total(x)));
    return g;
  }
  function byScreen(list, w) {
    const g = {};
    list.forEach(o => { const ss = screensOf(o); (ss.length ? ss : ['Not seen on screen']).forEach(s => (g[s] = g[s] || []).push(o)); });
    Object.values(g).forEach(a => a.sort((x, y) => w(y) - w(x)));
    return g;
  }

  function render() {
    if (!panel || panel.hidden) return;
    const n = { icons: [...S.icons.values()].filter(o => showUnused || total(o) > 0).length, glyphs: S.glyphs.size, images: [...S.images.values()].filter(o => showCovers || !o.cover).length, fonts: S.fonts.size };
    panel.querySelector('#ab-tabs').innerHTML = [['icons', 'Icons'], ['glyphs', 'Glyphs'], ['images', 'Images'], ['fonts', 'Fonts']]
      .map(([k, l]) => `<button class="db-tab${tab === k ? ' on' : ''}" data-tab="${k}">${l} <span class="ab-n">${n[k]}</span></button>`).join('');
    panel.querySelector('#ab-count').textContent = staticDone ? '' : 'reading source…';
    const body = panel.querySelector('#ab-body'), foot = panel.querySelector('#ab-foot');
    const st = body.scrollTop;
    let html = '';
    if (tab === 'icons') {
      const list = iconsList();
      const g = iconGroups(list);
      html = group === 'comp' ? compView('icon', list.filter(o => total(o) > 0)) : Object.entries(g).filter(([, a]) => a.length).map(([t, a]) =>
        `<div class="ab-grp">${esc(t)} <span class="ab-n">${a.length}</span></div><div class="ab-grid">` +
        a.map(o => `<button class="ab-cell${sel === 'icon|' + o.key ? ' on' : ''}" data-sel="icon|${esc(o.key)}" title="${esc(iconName(o))}">
            <span class="ab-ico">${o.markup}</span><span class="ab-nm">${esc(iconName(o))}</span><span class="ab-c">${total(o) || '—'}</span></button>`).join('') +
        `</div>`).join('');
      foot.innerHTML = `<button class="db-btn db-btn--go" data-act="sheet-copy">Copy sheet for Figma (${list.filter(o => !o.big).length})</button><button class="db-btn" data-act="sheet-dl">Download .svg</button><button class="db-btn" data-act="clear" title="Forget what was recorded on screen">Clear</button><label class="ab-chk"><input type="checkbox" id="ab-unused"${showUnused ? ' checked' : ''}> show unused (in code, never seen on screen)</label>`;
    } else if (tab === 'glyphs') {
      const list = [...S.glyphs.values()].filter(o => match(o, o.key + ' ' + o.cp + ' ' + o.fam));
      const g = group === 'screen' ? byScreen(list, total) : { 'Text characters used as icons': list.sort((a, b) => total(b) - total(a)) };
      html = group === 'comp' ? compView('glyph', list) : Object.entries(g).map(([t, a]) => `<div class="ab-grp">${esc(t)} <span class="ab-n">${a.length}</span></div><div class="ab-grid">` +
        a.map(o => `<button class="ab-cell${sel === 'glyph|' + o.key ? ' on' : ''}" data-sel="glyph|${esc(o.key)}"><span class="ab-ico ab-glyph" style="font-family:'${esc(o.fam)}'">${esc(o.key)}</span><span class="ab-nm">${o.cp}</span><span class="ab-c">${total(o)}</span></button>`).join('') + '</div>').join('');
      foot.innerHTML = `<span class="pet-hint">Characters like ⚙ × › ♥ drawn as text. Rebuild these as vectors in Figma.</span>`;
    } else if (tab === 'images') {
      const list = [...S.images.values()].filter(o => (showCovers || !o.cover) && match(o, o.key));
      const g = group === 'screen' ? byScreen(list, total) : { [showCovers ? 'All images' : 'UI images & logos']: list.sort((a, b) => total(b) - total(a)) };
      html = group === 'comp' ? compView('img', list) : Object.entries(g).map(([t, a]) => `<div class="ab-grp">${esc(t)} <span class="ab-n">${a.length}</span></div><div class="ab-grid">` +
        a.map(o => `<button class="ab-cell${sel === 'img|' + o.key ? ' on' : ''}" data-sel="img|${esc(o.key)}" title="${esc(o.key)}"><span class="ab-ico ab-img" style="background-image:url('${esc(o.key)}')"></span><span class="ab-nm">${esc(o.key.split('/').pop().split('?')[0])}</span><span class="ab-c">${total(o)}</span></button>`).join('') + '</div>').join('');
      foot.innerHTML = `<label class="ab-chk"><input type="checkbox" id="ab-covers"${showCovers ? ' checked' : ''}> include album / artist covers</label>`;
    } else {
      const list = [...S.fonts.values()].filter(o => match(o, styleLabel(o) + ' ' + o.sample));
      const fams = {};
      list.forEach(f => (fams[f.fam] = fams[f.fam] || []).push(f));
      const g = group === 'screen' ? byScreen(list, total) : fams;
      Object.values(g).forEach(a => a.sort((x, y) => parseFloat(y.size) - parseFloat(x.size) || y.weight - x.weight));
      html = group === 'comp' ? compView('font', list) : Object.entries(g).map(([t, a]) => {
        const decl = group === 'type' ? (S.cssFonts.get(t) || []) : [];
        const weights = [...new Set(a.map(f => f.weight))].sort().join(' · ');
        return `<div class="ab-grp">${esc(t)} <span class="ab-n">${a.length} styles${group === 'type' ? ' · weights ' + weights : ''}</span></div>` +
          (decl.length ? `<details class="ab-decl"><summary>${decl.length} CSS rules ask for ${esc(t)}</summary>${decl.map(d => `<div><code>${esc(d.file)}:${d.line}</code> ${esc(d.sel)}</div>`).join('')}</details>` : '') +
          a.map(f => `<button class="ab-font${sel === 'font|' + f.key ? ' on' : ''}" data-sel="font|${esc(f.key)}">
              <span class="ab-spec" style="font-family:${esc(f.stack)};font-weight:${f.weight};font-style:${f.style};font-size:${Math.min(parseFloat(f.size), 34)}px;letter-spacing:${f.ls};text-transform:${f.tt}">${esc(f.sample)}</span>
              <span class="ab-meta">${esc(styleLabel(f))}<span class="ab-c">${total(f)} uses · ${screensOf(f).length} screens</span></span></button>`).join('');
      }).join('');
      foot.innerHTML = `<button class="db-btn db-btn--go" data-act="spec-copy" title="SVG of every style — paste into Figma, each becomes a text layer">Copy specimen for Figma</button><button class="db-btn" data-act="csv">Copy CSV</button><button class="db-btn" data-act="clear">Clear</button>`;
    }
    body.innerHTML = html || `<div class="pet-hint ab-empty">Nothing yet — click around the phone, or press <b>Sweep screens</b>.</div>`;
    body.scrollTop = st;
    const un = foot.querySelector('#ab-unused'); if (un) un.onchange = e => { showUnused = e.target.checked; sel = null; render(); };
    const cv = foot.querySelector('#ab-covers'); if (cv) cv.onchange = e => { showCovers = e.target.checked; render(); };
    renderDetail();
  }

  function current() {
    if (!sel) return null;
    const i = sel.indexOf('|'), kind = sel.slice(0, i), key = sel.slice(i + 1);
    const m = { icon: S.icons, glyph: S.glyphs, img: S.images, font: S.fonts }[kind];
    const o = m && m.get(key);
    return o ? { kind, o } : null;
  }
  function usesHtml(kind, o) {
    const g = {};
    Object.entries(o.uses).forEach(([w, n]) => { const [s, ...r] = w.split(' — '); (g[s] = g[s] || []).push({ w, p: r.join(' › '), n }); });
    if (!Object.keys(g).length) return `<div class="pet-hint">Not seen on screen yet.</div>`;
    return Object.entries(g).map(([s, a]) => `<div class="ab-scr">${esc(s)}</div>` +
      a.map(u => `<button class="ab-use" data-find="${esc(kind + '|' + o.key + '|' + u.w)}" title="Show it on the phone">${esc(u.p || '(screen root)')}<span class="ab-c">×${u.n}</span></button>`).join('')).join('');
  }
  function renderDetail() {
    const d = panel.querySelector('#ab-detail');
    const c = current();
    if (!c) { d.hidden = true; return; }
    d.hidden = false;
    const { kind, o } = c;
    let head = '', acts = '';
    if (kind === 'icon') {
      const vb = (svgFromString(o.markup) || { getAttribute: () => '' }).getAttribute('viewBox');
      head = `<span class="ab-big">${o.markup}</span><div><div class="ab-dname">${esc(iconName(o))}</div>
        <div class="ab-dsub">viewBox ${esc(vb || '?')}${o.names.size ? ' · seen as ' + esc([...o.names].slice(0, 4).join(', ')) : ''}</div>
        ${o.src.map(s => `<div class="ab-dsub"><code>${esc(s.file)}${s.line ? ':' + s.line : ''}</code> ${esc(s.name || '')}${s.dyn ? ' (templated)' : ''}</div>`).join('')}</div>`;
      acts = `<button class="db-btn db-btn--go" data-act="svg-copy">Copy SVG</button><button class="db-btn" data-act="svg-dl">Download</button>`;
    } else if (kind === 'glyph') {
      head = `<span class="ab-big ab-glyph" style="font-family:'${esc(o.fam)}'">${esc(o.key)}</span><div><div class="ab-dname">${o.cp}</div><div class="ab-dsub">drawn in ${esc(o.fam)}</div></div>`;
      acts = `<button class="db-btn" data-act="glyph-copy">Copy character</button>`;
    } else if (kind === 'img') {
      head = `<span class="ab-big ab-img" style="background-image:url('${esc(o.key)}')"></span><div><div class="ab-dname">${esc(o.key.split('/').pop())}</div><div class="ab-dsub"><code>${esc(o.key)}</code></div></div>`;
      acts = `<a class="db-btn" href="${esc(o.key)}" download target="_blank">Open / save</a>`;
    } else {
      head = `<div><div class="ab-dname">${esc(styleLabel(o))}</div><div class="ab-dsub"><code>font-family: ${esc(o.stack)}</code></div><div class="ab-dsub">“${esc(o.sample)}”</div></div>`;
      acts = `<button class="db-btn" data-act="css-copy">Copy CSS</button>`;
    }
    d.innerHTML = `<div class="ab-dhead">${head}<button class="db-x" data-act="unsel" title="Close">×</button></div>
      <div class="ab-uses">${usesHtml(kind, o)}</div><div class="ab-dacts">${acts}</div>`;
  }

  function onClick(e) {
    const t = e.target.closest('[data-tab],[data-sel],[data-act],[data-find],[data-fold]'); if (!t) return;
    if (t.dataset.fold) { const k = t.dataset.fold; folded.has(k) ? folded.delete(k) : folded.add(k); render(); return; }
    if (t.dataset.tab) { tab = t.dataset.tab; sel = null; render(); return; }
    if (t.dataset.sel) {
      const f = t.dataset.find;                          // a component row: select its style AND ring that spot
      sel = sel === t.dataset.sel && !f ? null : t.dataset.sel;
      if (f) find(f);
      render(); return;
    }
    if (t.dataset.find) { find(t.dataset.find); return; }
    const c = current(), a = t.dataset.act;
    if (a === 'unsel') { sel = null; render(); }
    else if (a === 'svg-copy') copy(forFigma(c.o.markup), t);
    else if (a === 'svg-dl') download(slug(iconName(c.o)) + '.svg', forFigma(c.o.markup));
    else if (a === 'glyph-copy') copy(c.o.key, t);
    else if (a === 'css-copy') {
      const f = c.o; copy(`font-family: ${f.stack};\nfont-weight: ${f.weight};\nfont-size: ${f.size};\nline-height: ${f.lh};\nletter-spacing: ${f.ls};${f.tt !== 'none' ? `\ntext-transform: ${f.tt};` : ''}${f.style !== 'normal' ? `\nfont-style: ${f.style};` : ''}`, t);
    }
    else if (a === 'sheet-copy') copy(sheet(iconsList().filter(o => !o.big)), t);
    else if (a === 'sheet-dl') download('spindeck-icons.svg', sheet(iconsList().filter(o => !o.big)));
    else if (a === 'spec-copy' && group === 'comp') copy(specimenComp([...S.fonts.values()].filter(o => match(o, styleLabel(o)))), t);
    else if (a === 'spec-copy') copy(specimen([...S.fonts.values()].filter(o => match(o, styleLabel(o))).sort((x, y) => x.fam.localeCompare(y.fam) || parseFloat(y.size) - parseFloat(x.size))), t);
    else if (a === 'csv') copy(csv([...S.fonts.values()]), t);
    else if (a === 'clear') {
      [S.icons, S.glyphs, S.images, S.fonts].forEach(m => m.forEach((o, k) => { o.uses = {}; if (m !== S.icons && m !== S.glyphs) m.delete(k); }));
      S.glyphs.clear();
      [...S.icons].forEach(([k, o]) => { if (!o.src.length) S.icons.delete(k); });
      try { localStorage.removeItem(STORE); } catch (e) {}
      sel = null; render();
    }
  }

  // Outline the element on the phone (if it's still rendered).
  let ring;
  function find(id) {
    const ref = elRefs.get(id), el = ref && ref.deref();
    const btn = panel.querySelector(`[data-find="${CSS.escape(id)}"]`);
    if (!el || !el.isConnected) { flashBtn(btn, 'Not on screen now — open that screen'); return; }
    el.scrollIntoView({ block: 'center', inline: 'center' });
    if (!ring) { ring = document.createElement('div'); ring.className = 'ab-ring'; document.body.appendChild(ring); }
    requestAnimationFrame(() => {
      const r = el.getBoundingClientRect();
      Object.assign(ring.style, { left: r.left - 4 + 'px', top: r.top - 4 + 'px', width: r.width + 8 + 'px', height: r.height + 8 + 'px' });
      ring.classList.remove('go'); void ring.offsetWidth; ring.classList.add('go');
    });
  }

  /* ---------- boot ---------- */
  function boot() {
    const host = document.querySelector('#toolbar .tb-test'); if (!host) return;
    const b = document.createElement('button');
    b.className = 'tb-act tb-test-btn tb-test-btn--go';
    b.id = 'btn-assets'; b.textContent = 'Assets';
    b.title = 'Every icon, glyph, image and font style, and where each is used (dev only)';
    b.onclick = toggle;
    host.appendChild(b);
    // Sizes: the phone-size compare page (compare-phones.html), same dev-only gate.
    const sz = document.createElement('a');
    sz.className = 'tb-act tb-test-btn tb-test-btn--go';
    sz.id = 'btn-sizes'; sz.textContent = 'Sizes';
    sz.href = 'compare-phones.html' + location.search; sz.target = '_blank';
    sz.title = 'The app on small and big iPhones side by side (dev only)';
    sz.style.textDecoration = 'none'; sz.style.display = 'inline-flex'; sz.style.alignItems = 'center';
    host.appendChild(sz);
    load(); watch();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  window.sdAssets = { scan: scanAll, state: S };
})();
