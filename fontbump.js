/* ============================================================
   FONT BUMP — a test for big phones (Eric, 2026-11-20: "for the larger phone
   sizes can we increase all font sizes by 1 or 2 — 2 if it's larger text, 1
   if it's smaller text").

   The alternative to index.html's BIG PHONES READ LARGER, which zooms the
   WHOLE app (layout, icons, text) via the viewport. This leaves the layout at
   the phone's real width and only grows the type. Round 2 (same day, "such a
   small change i cant see any changes … 5px larger for larger type like album
   titles and artist titles etc, and 3px for regular type"):
     Round 3 ("too much"): +3 / +2.
     · LARGER type → +3px: any px size of BIG_FROM up, or a rule whose selector
       names a title / album / artist / name / heading (TITLE_SEL) — album and
       artist names are often only 12–14px, so size alone misses them
     · everything else → +2px
   em / rem / % sizes follow their bumped parent, so they are left alone.

   HOW: on html.sd-fontbump, every font-size in px in the APP's stylesheets
   (app / doomscroll / quotes / player, and the dev box's live tune) is
   rewritten once, in place, inside @media / @supports too. Viewer chrome
   (style.css, roadmap, assets) is skipped. Inline sizes set by JS are left
   alone on purpose: those are fit-to-box loops (Swipe's and Comments' titles,
   the bento title) that measure and shrink, and bumping them would overflow.

   ON:  a 420px+ phone with ?bigtext=bump (sticks; ?bigtext=scale goes back to
        the zoom), or any page with &fontbump (compare-phones.html's 4th phone).
   ============================================================ */
(function sdFontBump() {
  var root = document.documentElement;
  if (!root.classList.contains('sd-fontbump')) return;

  var BIG_FROM = 15;                       // px: this size and up is larger type
  var BIG_ADD = 3, SMALL_ADD = 2;          // px added to larger / regular type
  var TITLE_SEL = /title|album|artist|name|heading|-hd|-head/i;
  var APP_SHEETS = /\/(app|doomscroll|quotes|player)\.css(\?|$)/;
  var STYLE_IDS = { 'devbox-live': 1 };    // injected <style>s that style the app
  var done = typeof WeakSet === 'function' ? new WeakSet() : null;

  function bumpPx(v, sel) {
    var m = /^([\d.]+)px$/.exec(v);
    if (!m) return null;
    var n = parseFloat(m[1]);
    var big = n >= BIG_FROM || TITLE_SEL.test(sel || '');
    return (Math.round((n + (big ? BIG_ADD : SMALL_ADD)) * 100) / 100) + 'px';
  }
  function walk(rules) {
    for (var i = 0; i < rules.length; i++) {
      var r = rules[i];
      if (r.style && r.style.fontSize) {
        var prio = r.style.getPropertyPriority('font-size');
        var nv = bumpPx(r.style.fontSize.trim(), r.selectorText);
        if (nv) r.style.setProperty('font-size', nv, prio);
      }
      if (r.cssRules && r.cssRules.length) walk(r.cssRules);   // @media, @supports, nesting
    }
  }
  function wanted(sheet) {
    var node = sheet.ownerNode;
    if (!node) return false;
    if (node.tagName === 'LINK') return APP_SHEETS.test(node.href || '');
    return !!STYLE_IDS[node.id];
  }
  function run() {
    var sheets = document.styleSheets;
    for (var i = 0; i < sheets.length; i++) {
      var s = sheets[i];
      if ((done && done.has(s)) || !wanted(s)) continue;
      var rules; try { rules = s.cssRules; } catch (e) { continue; }   // cross-origin
      if (!rules) continue;
      walk(rules);
      if (done) done.add(s);
    }
  }
  run();
  // The dev box rewrites its <style> on every slider move: a new sheet each time.
  new MutationObserver(run).observe(document.head, { childList: true, subtree: true, characterData: true });
  window.addEventListener('load', run);
  window.sdFontBump = { run: run, BIG_FROM: BIG_FROM, BIG_ADD: BIG_ADD, SMALL_ADD: SMALL_ADD };
})();
