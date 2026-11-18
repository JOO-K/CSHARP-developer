/* ============================================================
   MORPH — the shared-element transition (csharpuser, 2026-09-26).
   Eric: "a clean transition from screen to screen, but not the swipe —
   when you click on the album it grows larger, when you click on the
   profile it fills where it's supposed to go". So: the thing you tapped
   glides into the place it has on the next screen. A cover on the deck,
   a tile on the wall, the record on a feed card → the album page's cover.
   A face or a name → the profile card's picture. Back from the album page
   → the cover shrinks to where it came from.

   HOW: `sdMorph(src, findDest, go)` lifts a body-level fixed clone of the
   source AT ONCE (so a slow page still answers the tap), runs the navigation
   (`go`), waits for the destination element to exist with a size (polled for
   up to 1.5s), hides it, glides the clone from box to box (left/top/width/
   height/border-radius, 380ms), then reveals the destination and drops the
   clone. A destination that never shows: the clone fades where it is.
   Boxes are `getBoundingClientRect`s, so the viewer's zoom and the phone's
   scale are already in them, and the clone lives on <body>, outside both.

   csharpdeveloper (Eric 2026-11-18: "it lags when i go to an album and it
   doesnt do the transition … a flash of the previous album"):
     · The clone wears the SOURCE's picture. It used to take the destination's,
       which on the album page is still the LAST album until the new cover
       loads — that was the flash. `destImage: true` (a friend's profile face)
       still asks for the destination's.
     · Lift first, then wait 1.5s (was: wait, then nothing after 700ms).
     · When it lands on an empty box (cover still downloading) the box gets the
       clone's picture, so nothing blinks out.
     · AUTO: any openAlbumPage / openArtistPageFor that follows a tap on a
       cover (search rows, Browse rails, More by, Swipe / Comments / Player's
       Go to album, …) glides from that cover — `lastTap` remembers the picture
       under the last pointerdown for 800ms. The wired call sites (deck, wall,
       feed record, Back) already set `_sdMorph` and are left alone.

   ⚠ The album page's own cover transitions (`.s-home-v3--review .v3-album`
   slides left/top/width) would make the destination box a moving target:
   `enterAlbumPageState` puts `.sd-morphing` on the shell while a morph is
   in flight and app.css switches those transitions off under it.
   Loads after app.js; app.js only calls in through `typeof sdMorph`.
   Reduced motion, a missing source: the navigation simply happens.
   ============================================================ */
(function () {
  const DUR = 380, EASE = 'cubic-bezier(.2, .8, .2, 1)', WAIT = 1500;
  let live = null;
  const rect = el => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };
  const bgOf = el => { if (!el) return ''; const b = getComputedStyle(el).backgroundImage; return b && b !== 'none' ? b : ''; };
  const imgSrc = el => el && el.tagName === 'IMG' && el.currentSrc ? `url("${el.currentSrc}")` : '';
  // The image on the element, or on the first child that carries one (the deck's face is a layer inside its circle).
  const imgOf = el => imgSrc(el) || bgOf(el) || bgOf(el.querySelector && el.querySelector('[style*="background-image"]'));
  const shown = el => { if (!el || !el.isConnected) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };

  /* `lift: false` (Back): no clone until the destination is found — if the
     cover you came from is not on the screen you return to, nothing glides and
     nothing is left hanging (it used to float for 1.5s: Eric, 11-18). */
  window.sdMorph = function (src, findDest, go, opts) {
    opts = opts || {};
    if (opts.lift === false) return morphLate(src, findDest, go, opts);
    // `src` may be a SNAPSHOT ({ box, img, r }) of something already gone — Swipe closes its feed before the album opens.
    const snap = src && src.box;
    if (!src || (!snap && !src.getBoundingClientRect) || matchMedia('(prefers-reduced-motion: reduce)').matches
        || document.documentElement.classList.contains('sd-reduce-motion')) { go(); return; }
    const from = snap ? src.box : rect(src);
    if (!from.w || !from.h) { go(); return; }
    const img = snap ? src.img : imgOf(src), r0 = snap ? src.r : getComputedStyle(src).borderRadius;
    if (live) { live.remove(); live = null; }

    // Lift at once: the tap answers even if the page takes a moment to build.
    const ghost = document.createElement('div');
    ghost.className = 'sd-morph';
    ghost.style.cssText = `position:fixed;left:${from.x}px;top:${from.y}px;width:${from.w}px;height:${from.h}px;border-radius:${r0};`
      + `background:${img ? img + ' center / cover no-repeat' : '#222'};z-index:100000;pointer-events:none;`
      + `box-shadow:0 12px 40px rgba(0,0,0,.45);opacity:1;`
      + `transition:left ${DUR}ms ${EASE},top ${DUR}ms ${EASE},width ${DUR}ms ${EASE},height ${DUR}ms ${EASE},border-radius ${DUR}ms ${EASE},opacity .2s ease`;
    document.body.appendChild(ghost); live = ghost;

    window._sdMorph = true;
    try { go(); } finally { setTimeout(() => { window._sdMorph = false; }, 900); }
    const t0 = performance.now();
    const fly = () => {
      if (live !== ghost) return;                      // a newer morph took over
      const dest = findDest();
      if (!shown(dest)) {
        if (performance.now() - t0 < WAIT) { requestAnimationFrame(fly); return; }
        ghost.style.opacity = '0';                     // never showed: fade where it is
        setTimeout(() => { ghost.remove(); if (live === ghost) live = null; }, 220);
        return;
      }
      const to = rect(dest);
      if (opts.destImage === true && bgOf(dest)) ghost.style.backgroundImage = bgOf(dest);
      const r1 = getComputedStyle(dest).borderRadius;
      dest.style.visibility = 'hidden';
      void ghost.offsetWidth;
      ghost.style.left = to.x + 'px'; ghost.style.top = to.y + 'px'; ghost.style.width = to.w + 'px'; ghost.style.height = to.h + 'px'; ghost.style.borderRadius = r1;
      setTimeout(() => {
        // Landed on a box whose own picture is still downloading: lend it the clone's.
        if (!bgOf(dest) && img && dest.tagName !== 'IMG') dest.style.backgroundImage = img;
        dest.style.visibility = '';
        ghost.remove(); if (live === ghost) live = null;
      }, DUR + 30);
    };
    // Rather a timer than rAF for the first look: rAF never fires in a background tab.
    setTimeout(fly, 0);
  };

  function morphLate(src, findDest, go, opts) {
    if (!src || !src.getBoundingClientRect || matchMedia('(prefers-reduced-motion: reduce)').matches
        || document.documentElement.classList.contains('sd-reduce-motion')) { go(); return; }
    const from = rect(src);
    const img = imgOf(src), r0 = getComputedStyle(src).borderRadius;
    if (!from.w || !from.h) { go(); return; }
    if (live) { live.remove(); live = null; }
    window._sdMorph = true;
    try { go(); } finally { setTimeout(() => { window._sdMorph = false; }, 900); }
    const t0 = performance.now();
    const look = () => {
      const dest = findDest();
      if (!shown(dest)) { if (performance.now() - t0 < 500) requestAnimationFrame(look); return; }
      window.sdMorph(Object.assign({ box: from, img, r: r0 }), () => dest, () => {}, { destImage: opts.destImage });
    };
    setTimeout(look, 0);
  }

  /* The album page's cover, on whichever shell is SHOWING it (the hidden theme
     twin is filled a beat later, and the first match in the DOM may be it). */
  window.sdFindAlbumCover = () => [...document.querySelectorAll('#phone-container .s-home-v3--album .v3-album, #mobile-content .s-home-v3--album .v3-album')].find(shown) || null;
  // The profile card's picture.
  window.sdFindProfilePic = () => [...document.querySelectorAll('#phone-container .s-prof2 .prof-pic, #mobile-content .s-prof2 .prof-pic')].find(shown) || null;
  /* Where a cover came from, for Back (csharpdeveloper 11-18): any picture of
     THIS album on the screen you return to — a feed card, a rail, a tile —
     matched by the cover's file (Deezer's md5 or the local filename), on screen
     and inside the phone. It used to look for the carousel's front card, which
     is on Trending now, so Back off a home-feed album had nowhere to land. */
  const coverKey = url => {
    const u = String(url || '');
    const m = u.match(/\/cover\/([0-9a-f]{16,})\//i) || u.match(/([^\/'"()]+)\.(?:jpe?g|png|webp)/i);
    return m ? m[1] : '';
  };
  window.sdFindCoverHome = album => {
    const key = album && coverKey(album.image);
    if (!key) return null;
    const box = (document.querySelector('#mobile-content') && document.querySelector('#mobile-content').getBoundingClientRect().width)
      ? document.querySelector('#mobile-content') : document.querySelector('#phone-container');
    const area = box ? box.getBoundingClientRect() : { top: 0, bottom: innerHeight, left: 0, right: innerWidth };
    return [...document.querySelectorAll(`#phone-container [style*="${key}"], #mobile-content [style*="${key}"]`)].find(e => {
      if (!shown(e) || e.closest('.s-home-v3--review') && e.classList.contains('v3-album')) return false;
      const r = e.getBoundingClientRect();
      return r.width >= 24 && r.bottom > area.top + 40 && r.top < area.bottom - 90 && r.right > area.left && r.left < area.right;
    }) || null;
  };

  /* AUTO MORPH. The picture under the last tap: the element itself, a parent
     that carries one, or the art inside the card that was tapped (a search row,
     a rail card — the tap often lands on the text beside the cover). */
  let lastTap = null;
  const PIC = '[style*="background-image"], img';
  // Swipe / Comments / Player: a tap on the album or artist text glides from the spinning CD.
  const FEED_CD = '.ds-fixcd, .qs-cd, .cp-deck .cp-cd-disc';
  const pictureFor = t => {
    const feed = t.closest('.ds-root, .qs-root, .cp-root');
    if (feed && !t.closest('.ds-rsheet, .ds-gsheet, .wg-sheet')) {
      const cd = [...feed.querySelectorAll(FEED_CD)].find(shown);
      if (cd && !t.closest('[style*="background-image"]')) return cd;
    }
    for (let el = t, k = 0; el && el !== document.body && k < 5; el = el.parentElement, k++) {
      if (el.matches && el.matches(PIC) && el.getBoundingClientRect().width >= 28) return el;
      const inner = el.querySelector && [...el.querySelectorAll(PIC)].find(x => x.getBoundingClientRect().width >= 28);
      if (inner) return inner;
    }
    return null;
  };
  document.addEventListener('pointerdown', e => {
    const t = e.target;
    if (!t || !t.closest || !t.closest('#phone-container, #mobile-content')) return;
    const el = pictureFor(t);
    // Snapshot now: by the time the album opens, the tapped thing may be gone.
    lastTap = el ? { el, at: performance.now(), box: rect(el), img: imgOf(el), r: getComputedStyle(el).borderRadius } : null;
  }, true);
  const wrap = name => {
    const f = window[name];
    if (typeof f !== 'function' || f._sdAuto) return;
    const w = function () {
      const tap = lastTap;
      if (!window._sdMorph && tap && performance.now() - tap.at < 800 && tap.box.w) {
        lastTap = null;
        let out;
        window.sdMorph(shown(tap.el) ? tap.el : tap, window.sdFindAlbumCover, () => { out = f.apply(this, arguments); });
        return out;
      }
      return f.apply(this, arguments);
    };
    w._sdAuto = true;
    window[name] = w;
  };
  wrap('openAlbumPage');
  wrap('openArtistPageFor');
})();
