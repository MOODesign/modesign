/* MO design | portfolio. Plain JavaScript, no libraries. */
(function () {
  "use strict";

  var doc = document.documentElement;
  var reduceMotion = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  var finePointer = !!(window.matchMedia && window.matchMedia("(hover:hover) and (pointer:fine)").matches);
  doc.classList.add("js");
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  clearTimeout(window.__fs);   // main script loaded, cancel the failsafe from the page head

  var yr = $("#year"); if (yr) yr.textContent = new Date().getFullYear();

  /* ---------- Intro splash (plays on every visit) ----------
     Solid blue screen. Straight away the dark page pulls down from the top and the content
     appears. The blue page frame stays in place. */
  (function splashIntro() {
    var splash = $("#splash");
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!splash) { doc.classList.add("is-ready"); return; }
    if (reduce) { splash.remove(); doc.classList.add("is-ready"); return; }

    var HOLD = 120, DUR = 1100, started = false, revealed = false, t0 = 0;
    var maxR = window.innerHeight + 4;
    function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }  // easeInOutCubic

    function finish() {
      splash.remove();
      doc.classList.remove("splash-lock");
      doc.classList.add("is-ready");
    }
    function tick(now) {
      var p = Math.min(1, (now - t0) / DUR);
      splash.style.setProperty("--t", (ease(p) * maxR).toFixed(1) + "px");
      if (p > 0.08 && !revealed) { revealed = true; doc.classList.add("is-ready"); }   // headline starts as the circle opens
      if (p < 1) requestAnimationFrame(tick); else finish();
    }
    doc.classList.add("splash-lock");
    window.scrollTo(0, 0);
    setTimeout(function () { t0 = performance.now(); requestAnimationFrame(tick); }, HOLD);
  })();

  /* ---------- Full screen menu ---------- */
  var toggle = $(".menu-toggle"), menu = $("#menu");
  function setMenu(open) {
    menu.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    doc.classList.toggle("is-locked", open);
    // keep links out of the tab order while closed
    $$("a", menu).forEach(function (a) { a.tabIndex = open ? 0 : -1; });
  }
  setMenu(false);
  toggle.addEventListener("click", function () { setMenu(!menu.classList.contains("is-open")); });
  $$("a", menu).forEach(function (a) { a.addEventListener("click", function () { setMenu(false); }); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && menu.classList.contains("is-open")) { setMenu(false); toggle.focus(); }
  });

  /* ---------- Scroll spy (highlights current section in both navs) ---------- */
  var spyLinks = $$("[data-spy]");
  var sections = ["home", "work", "contact"].map(function (id) { return document.getElementById(id); });
  function setActive(id) {
    spyLinks.forEach(function (a) { a.classList.toggle("is-active", a.getAttribute("data-spy") === id); });
  }
  if ("IntersectionObserver" in window) {
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) setActive(en.target.id); });
    }, { rootMargin: "-45% 0px -50% 0px" });
    sections.forEach(function (s) { if (s) spy.observe(s); });
  }
  setActive("home");

  /* ---------- Portfolio grid ---------- */
  var projects = window.PROJECTS || [];
  var grid = $("#grid");
  var current = -1;          // index (in `projects`) of the project open in the pop-up

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  var ICON_PLUS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';

  var cards = [];
  projects.forEach(function (p, i) {
    var card = el("button", "card reveal");
    card.type = "button";
    card.setAttribute("data-index", i);
    card.setAttribute("aria-haspopup", "dialog");
    card.setAttribute("aria-label", "View " + p.title + (p.niche ? " (" + p.niche + ")" : ""));

    var media = el("span", "card__media");
    media.style.setProperty("--c", p.color || "#222");
    var phone = el("span", "phone");
    var screen = el("span", "phone__screen");
    var img = new Image();
    img.src = p.thumb || p.images[0];
    img.alt = "";
    img.width = 560; img.height = 1760;
    img.loading = "lazy"; img.decoding = "async";
    screen.appendChild(img); phone.appendChild(screen);
    var plus = el("span", "card__plus"); plus.innerHTML = ICON_PLUS;
    media.appendChild(phone); media.appendChild(plus);

    var meta = el("span", "card__meta");
    meta.appendChild(el("span", "card__title", p.title));
    if (p.niche) meta.appendChild(el("span", "card__niche", p.niche));

    card.appendChild(media); card.appendChild(meta);
    card.style.setProperty("--sd", (i % 4) * 90 + "ms");
    card.addEventListener("click", function () { openProject(i); });
    grid.appendChild(card);
    cards.push(card);
  });

  /* ---------- Reveal on scroll ---------- */
  var reveals = $$(".reveal");
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.05 });
    reveals.forEach(function (r) { io.observe(r); });
  } else {
    reveals.forEach(function (r) { r.classList.add("is-in"); });
  }

  /* ---------- Pop-up viewer ---------- */
  var dlg = $("#viewer");
  var vCat = $("#viewer-cat"), vTitle = $("#viewer-title"), vDesc = $("#viewer-desc"),
      vImgs = $("#viewer-images"), vBody = $("#viewer-body"), vCount = $("#viewer-count"),
      vLink = $("#viewer-link"), vLinkText = $("#viewer-link-text");

  // all projects, as indexes into `projects`
  function visibleIndexes() {
    return projects.map(function (p, i) { return i; });
  }

  function render(i) {
    var p = projects[i];
    current = i;
    vCat.textContent = p.niche || "";
    vCat.hidden = !p.niche;
    vTitle.textContent = p.title;
    vDesc.textContent = p.description || "Click any email to read it full size.";
    vDesc.hidden = false;
    vImgs.textContent = "";
    vImgs.setAttribute("data-mode", "grid");
    p.images.forEach(function (src, n) {
      var im = new Image();
      im.src = src;
      im.alt = p.title + " design " + (n + 1) + " of " + p.images.length;
      im.decoding = "async";
      if (n > 3) im.loading = "lazy";
      var fig = el("button", "shot");
      fig.type = "button";
      fig.setAttribute("aria-label", "Toggle full size view of design " + (n + 1));
      fig.appendChild(im);
      vImgs.appendChild(fig);
    });
    if (p.link) {
      vLink.href = p.link.href; vLinkText.textContent = p.link.text; vLink.hidden = false;
    } else { vLink.hidden = true; }
    var list = visibleIndexes();
    vCount.textContent = (list.indexOf(i) + 1) + " / " + list.length;
    vBody.scrollTop = 0;
  }

  function openProject(i) {
    render(i);
    if (!dlg.open) {
      var tile = cards[i] && cards[i].querySelector(".card__media");
      var from = tile ? tile.getBoundingClientRect() : null;
      if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
      doc.classList.add("is-locked");
      // the pop-up grows out of the tile that was clicked
      if (from && !reduceMotion && dlg.animate) {
        var to = dlg.getBoundingClientRect();
        var dx = (from.left + from.width / 2) - (to.left + to.width / 2);
        var dy = (from.top + from.height / 2) - (to.top + to.height / 2);
        dlg.style.animation = "none";
        var a = dlg.animate([
          { transform: "translate(" + dx + "px," + dy + "px) scale(" + (from.width / to.width) + "," + (from.height / to.height) + ")", opacity: 0.2 },
          { transform: "none", opacity: 1 }
        ], { duration: 520, easing: "cubic-bezier(.2,.7,.2,1)" });
        a.onfinish = a.oncancel = function () { dlg.style.animation = ""; };
      }
    }
  }

  function step(dir) {
    var list = visibleIndexes();
    if (!list.length) return;
    var pos = list.indexOf(current);
    pos = (pos + dir + list.length) % list.length;
    render(list[pos]);
  }

  // click an email to read it full size (single column); click again to go back to the grid
  vImgs.addEventListener("click", function (e) {
    var shot = e.target.closest ? e.target.closest(".shot") : null;
    if (!shot) return;
    var reading = vImgs.getAttribute("data-mode") === "read";
    vImgs.setAttribute("data-mode", reading ? "grid" : "read");
    shot.scrollIntoView({ block: "start" });
  });

  $("#viewer-prev").addEventListener("click", function () { step(-1); });
  $("#viewer-next").addEventListener("click", function () { step(1); });
  $("#viewer-close").addEventListener("click", function () { dlg.close(); });

  // click on the dark area outside the pop-up closes it
  dlg.addEventListener("click", function (e) {
    var r = dlg.getBoundingClientRect();
    var outside = e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    if (outside) dlg.close();
  });
  dlg.addEventListener("close", function () { doc.classList.remove("is-locked"); });
  dlg.addEventListener("keydown", function (e) {
    if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
  });

  /* ---------- Extra motion ---------- */
  // 1) scroll progress line
  var bar = $("#progress"), ticking = false;
  function onScroll() {
    ticking = false;
    var max = doc.scrollHeight - window.innerHeight;
    if (bar) bar.style.setProperty("--p", max > 0 ? Math.min(1, window.scrollY / max).toFixed(4) : 0);
  }
  window.addEventListener("scroll", function () { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  window.addEventListener("resize", onScroll);
  onScroll();

  // 2) stat counters count up (after the splash has finished) every time the strip scrolls into view
  var stats = $$("#stats strong");
  if (stats.length && !reduceMotion && "IntersectionObserver" in window) {
    var targets = stats.map(function (s) { var m = s.textContent.match(/(\d+)(.*)/); return m ? { n: +m[1], suf: m[2], el: s } : null; });
    var run = 0;
    function setAll(f) { targets.forEach(function (t) { if (t) t.el.textContent = Math.round(t.n * f) + t.suf; }); }
    function count() {
      var id = ++run;
      if (!doc.classList.contains("is-ready")) { setTimeout(function () { if (id === run) count(); }, 200); return; }
      var t0 = performance.now() + 350, D = 1800;
      (function step(now) {
        if (id !== run) return;
        var p = Math.max(0, Math.min(1, (now - t0) / D));
        setAll(1 - Math.pow(1 - p, 3));
        if (p < 1) requestAnimationFrame(step);
      })(performance.now());
    }
    setAll(0);
    new IntersectionObserver(function (en) {
      if (en[0].isIntersecting) count(); else { run++; setAll(0); }
    }, { threshold: 0.5 }).observe($("#stats"));
  }

  // 4) headings wipe in line by line
  $$("h2").forEach(function (h) {
    var parts = h.innerHTML.split(/<br\s*\/?>/i);
    h.innerHTML = parts.map(function (t) { return '<span class="line"><span>' + t + "</span></span>"; }).join("");
    h.classList.add("wipe");
    if ("IntersectionObserver" in window) {
      var wo = new IntersectionObserver(function (en) {
        if (en[0].isIntersecting) { h.classList.add("is-in"); wo.disconnect(); }
      }, { threshold: 0.3 });
      wo.observe(h);
    } else h.classList.add("is-in");
  });

  // 5) cursor "View" label over thumbnails (mouse devices only)
  if (finePointer && !reduceMotion) {
    var cur = el("div", "cursor", "View"); document.body.appendChild(cur);
    var cx = 0, cy = 0, tx = 0, ty = 0, raf = 0;
    function glide() {
      cx += (tx - cx) * 0.2; cy += (ty - cy) * 0.2;
      cur.style.left = cx + "px"; cur.style.top = cy + "px";
      raf = (Math.abs(tx - cx) + Math.abs(ty - cy) > 0.5) ? requestAnimationFrame(glide) : 0;
    }
    function kick() { if (!raf) raf = requestAnimationFrame(glide); }
    grid.addEventListener("pointermove", function (e) {
      tx = e.clientX + 36; ty = e.clientY + 24;
      var on = !!(e.target.closest && e.target.closest(".card__media"));
      if (!cur.classList.contains("is-on") && on) { cx = tx; cy = ty; }
      cur.classList.toggle("is-on", on); kick();
    });
    grid.addEventListener("pointerleave", function () { cur.classList.remove("is-on"); });
    window.addEventListener("scroll", function () { cur.classList.remove("is-on"); }, { passive: true });

  }

  // click the email row: copies the address AND opens a new email
  var copyBtn = $("#copy-email"), copyLabel = $("#copy-label"), copyTimer;
  if (copyBtn) copyBtn.addEventListener("click", function () {   // the link still opens a new email
    var text = copyBtn.getAttribute("data-copy");
    function done() {
      copyLabel.textContent = "Copied. Opening your email app";
      copyLabel.classList.add("is-copied");
      clearTimeout(copyTimer);
      copyTimer = setTimeout(function () { copyLabel.textContent = "Email"; copyLabel.classList.remove("is-copied"); }, 2200);
    }
    function fallback() {
      var t = document.createElement("textarea");
      t.value = text; t.setAttribute("readonly", ""); t.style.cssText = "position:fixed;opacity:0";
      document.body.appendChild(t); t.select();
      try { document.execCommand("copy"); done(); } catch (err) {}
      document.body.removeChild(t);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
  });
})();
