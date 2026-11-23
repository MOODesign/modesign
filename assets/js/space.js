/* Atmosphere: faint far-away stars, the blue cursor/touch glow, and the on-demand loader for the 3D scene.
   Plain script (not a module) so the stars and glow also work when the page is opened straight from disk. */
(function () {
  "use strict";
  var doc = document.documentElement;
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var fine = matchMedia("(hover: hover) and (pointer: fine)").matches;

  /* ---------- stars ---------- */
  (function stars() {
    var c = document.createElement("canvas");
    c.className = "stars"; c.setAttribute("aria-hidden", "true");
    document.body.insertBefore(c, document.body.firstChild);
    var ctx = c.getContext("2d"), W = 0, H = 0, dpr = 1, list = [], queued = false;

    function rng(seed) { return function () { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }
    function build() {
      var r = rng(20260), n = Math.min(520, Math.round((W * H) / 4200));
      list = [];
      for (var i = 0; i < n; i++) {
        var d = r();                                   // 0 = very far, 1 = nearer
        var tint = r();
        list.push({
          x: r(), y: r(), d: d,
          s: 0.35 + d * 0.75,                          // radius in css px
          a: 0.12 + d * 0.38 + r() * 0.1,              // brightness stays low: they are far away
          c: tint > 0.8 ? "170,190,255" : tint > 0.55 ? "255,244,225" : "235,240,255"
        });
      }
    }
    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = innerWidth; H = innerHeight;
      c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
      c.style.width = W + "px"; c.style.height = H + "px";
      build(); draw();
    }
    function draw() {
      queued = false;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      var sy = reduce ? 0 : window.pageYOffset;
      for (var i = 0; i < list.length; i++) {
        var s = list[i];
        var y = ((s.y * H - sy * 0.05 * s.d) % H + H) % H;   // far stars barely move, nearer ones drift a little
        ctx.globalAlpha = s.a;
        ctx.fillStyle = "rgb(" + s.c + ")";
        ctx.beginPath(); ctx.arc(s.x * W, y, s.s, 0, 6.2832); ctx.fill();
      }
    }
    function queue() { if (!queued) { queued = true; requestAnimationFrame(draw); } }
    resize();
    addEventListener("resize", resize);
    if (!reduce) addEventListener("scroll", queue, { passive: true });
  })();

  /* ---------- blue glow: follows the cursor, pulses on every touch ---------- */
  (function glow() {
    if (reduce) return;
    var g = document.createElement("div");
    g.className = "glow"; g.setAttribute("aria-hidden", "true");
    document.body.appendChild(g);
    var tx = -999, ty = -999, cx = -999, cy = -999, raf = 0, hideT = 0;

    function place(x, y) { g.style.transform = "translate3d(" + x + "px," + y + "px,0)"; }
    function tick() {
      cx += (tx - cx) * 0.16; cy += (ty - cy) * 0.16;
      place(cx, cy);
      raf = (Math.abs(tx - cx) + Math.abs(ty - cy) > 0.5) ? requestAnimationFrame(tick) : 0;
    }
    function aim(x, y, snap) {
      tx = x; ty = y;
      if (snap || cx < -900) { cx = x; cy = y; place(x, y); }
      if (!raf) raf = requestAnimationFrame(tick);
    }
    function ripple(x, y) {
      var r = document.createElement("span");
      r.className = "ripple"; r.style.left = x + "px"; r.style.top = y + "px";
      document.body.appendChild(r);
      r.addEventListener("animationend", function () { r.remove(); });
    }

    addEventListener("pointermove", function (e) {
      if (e.pointerType === "mouse") { clearTimeout(hideT); g.classList.add("is-on"); aim(e.clientX, e.clientY, false); }
      else if (g.classList.contains("is-touch")) { aim(e.clientX, e.clientY, false); }
    }, { passive: true });
    document.addEventListener("mouseleave", function () { g.classList.remove("is-on"); });
    document.addEventListener("mouseenter", function () { if (fine) g.classList.add("is-on"); });

    addEventListener("pointerdown", function (e) {
      if (e.pointerType === "mouse") return;
      clearTimeout(hideT);
      g.classList.add("is-on", "is-touch"); aim(e.clientX, e.clientY, true); ripple(e.clientX, e.clientY);
    }, { passive: true });
    function release() {
      clearTimeout(hideT);
      hideT = setTimeout(function () { g.classList.remove("is-on", "is-touch"); }, 450);
    }
    addEventListener("pointerup", function (e) { if (e.pointerType !== "mouse") release(); }, { passive: true });
    addEventListener("pointercancel", function (e) { if (e.pointerType !== "mouse") release(); }, { passive: true });
  })();

  /* ---------- 3D scene (astronaut + planet), loaded after the intro ---------- */
  (function load3d() {
    var net = navigator.connection || {};
    if (net.saveData || /(^|-)2g$/.test(net.effectiveType || "")) return;   // keep the light version on slow / data-saver connections
    var started = false;
    function go() {
      if (started) return; started = true;
      var run = function () {
        import("./scene3d.js").then(function (m) { m.start(); })
          .catch(function (err) { console.warn("3D scene unavailable, keeping the static image.", err); });
      };
      if ("requestIdleCallback" in window) requestIdleCallback(run, { timeout: 2500 }); else setTimeout(run, 800);
    }
    if (doc.classList.contains("is-ready")) { go(); return; }
    new MutationObserver(function (_, mo) { if (doc.classList.contains("is-ready")) { mo.disconnect(); go(); } })
      .observe(doc, { attributes: true, attributeFilter: ["class"] });
  })();
})();
