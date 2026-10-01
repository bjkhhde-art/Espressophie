/* Espressophie – Animationen und Interaktion (ohne externe Bibliotheken) */
(function () {
  "use strict";

  var root = document.documentElement;
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  /* ---------- Manometer aufbauen ---------- */
  var SVGNS = "http://www.w3.org/2000/svg";
  function el(tag, attrs) {
    var n = document.createElementNS(SVGNS, tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }
  function buildGauge(g) {
    var svg = el("svg", { viewBox: "0 0 200 200", "aria-hidden": "true" });
    svg.appendChild(el("circle", { cx: 100, cy: 100, r: 97, fill: "url(#bezel)" }));
    svg.appendChild(el("circle", { cx: 100, cy: 100, r: 89, fill: "url(#dial)" }));
    // Skalenstriche über 270°
    for (var i = 0; i <= 20; i++) {
      var a = (135 + i * 13.5) * Math.PI / 180;
      var major = i % 5 === 0;
      var r1 = major ? 60 : 64, r2 = 70;
      svg.appendChild(el("line", {
        class: "tick" + (major ? " major" : ""),
        x1: 100 + r1 * Math.cos(a), y1: 100 + r1 * Math.sin(a),
        x2: 100 + r2 * Math.cos(a), y2: 100 + r2 * Math.sin(a)
      }));
    }
    var arc = "M44.85 155.15 A78 78 0 1 1 155.15 155.15";
    svg.appendChild(el("path", { class: "g-track", d: arc }));
    svg.appendChild(el("path", { class: "val", d: arc, pathLength: 100 }));
    var needle = el("g", { class: "needle" });
    needle.appendChild(el("line", { x1: 100, y1: 46, x2: 100, y2: 26 }));
    svg.appendChild(needle);
    g.insertBefore(svg, g.firstChild);
  }
  function runGauge(g) {
    if (g._done) return; g._done = true;
    var v = parseFloat(g.dataset.value), max = parseFloat(g.dataset.max);
    var pct = Math.min(v / max, 1);
    $(".val", g).style.strokeDashoffset = 100 - pct * 100;
    $(".needle", g).style.transform = "rotate(" + (-135 + 270 * pct) + "deg)";
    var out = $(".g-read b", g);
    if (reduce) { out.textContent = v; return; }
    var t0 = performance.now(), dur = 1700;
    (function step(t) {
      var k = Math.min((t - t0) / dur, 1);
      var e = 1 - Math.pow(1 - k, 3);
      out.textContent = Math.round(v * e);
      if (k < 1) requestAnimationFrame(step);
    })(t0);
  }
  $$(".gauge").forEach(function (g) { buildGauge(g); $(".g-read b", g).textContent = "0"; });

  /* ---------- Einblenden beim Scrollen ---------- */
  function onShow(n) {
    n.classList.add("in");
    if (n.classList.contains("gauge")) setTimeout(function () { runGauge(n); }, 150);
    if (n.classList.contains("heatup")) setTimeout(function () { n.classList.add("done"); }, reduce ? 0 : 2700);
  }
  var revealables = $$("[data-reveal], .fan");
  if (reduce || !("IntersectionObserver" in window)) {
    revealables.forEach(onShow);
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { onShow(e.target); io.unobserve(e.target); }
      });
    }, { rootMargin: "0px 0px -12% 0px", threshold: 0.12 });
    revealables.forEach(function (n) { io.observe(n); });
  }

  /* ---------- Hero-Intro ---------- */
  requestAnimationFrame(function () { requestAnimationFrame(function () { root.classList.add("ready"); }); });

  /* ---------- Sticky-Story: Bild wechselt mit dem Schritt ---------- */
  var steps = $$(".step");
  var screens = $$(".screens img");
  var dots = $$(".story-dots i");
  function setStep(i) {
    steps.forEach(function (s, k) { s.classList.toggle("active", k === i); });
    screens.forEach(function (s, k) { s.classList.toggle("active", k === i); });
    dots.forEach(function (s, k) { s.classList.toggle("on", k === i); });
  }
  if ("IntersectionObserver" in window) {
    var so = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) setStep(+e.target.dataset.step); });
    }, { rootMargin: "-45% 0px -45% 0px" });
    steps.forEach(function (s) { so.observe(s); });
  }

  /* ---------- Aktiver Menüpunkt ---------- */
  var navLinks = $$(".nav a[href^='#']");
  if (navLinks.length && "IntersectionObserver" in window) {
    var no = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        navLinks.forEach(function (a) { a.classList.toggle("on", a.getAttribute("href") === "#" + e.target.id); });
      });
    }, { rootMargin: "-40% 0px -55% 0px" });
    navLinks.forEach(function (a) { var t = $(a.getAttribute("href")); if (t) no.observe(t); });
  }

  /* ---------- Menü (Handy) ---------- */
  var burger = $(".burger"), nav = $("#nav");
  if (burger && nav) {
    burger.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      burger.setAttribute("aria-expanded", open);
      burger.setAttribute("aria-label", open ? "Menü schließen" : "Menü öffnen");
    });
    $$("a", nav).forEach(function (a) {
      a.addEventListener("click", function () { nav.classList.remove("open"); burger.setAttribute("aria-expanded", "false"); });
    });
  }

  /* ---------- Karten: Lichtpunkt folgt der Maus ---------- */
  $$(".card").forEach(function (c) {
    c.addEventListener("pointermove", function (e) {
      var r = c.getBoundingClientRect();
      c.style.setProperty("--mx", (e.clientX - r.left) + "px");
      c.style.setProperty("--my", (e.clientY - r.top) + "px");
    });
  });

  /* ---------- FAQ weich auf- und zuklappen ---------- */
  $$(".faq details").forEach(function (d) {
    var sum = $("summary", d), ans = $(".ans", d);
    if (!ans || !ans.animate || reduce) return;
    sum.addEventListener("click", function (e) {
      e.preventDefault();
      if (d._anim) d._anim.cancel();
      if (d.open) {
        var h = ans.offsetHeight;
        d._anim = ans.animate([{ height: h + "px", opacity: 1 }, { height: "0px", opacity: 0 }], { duration: 320, easing: "cubic-bezier(.2,.8,.2,1)" });
        d._anim.onfinish = function () { d.open = false; d._anim = null; };
      } else {
        d.open = true;
        var h2 = ans.offsetHeight;
        d._anim = ans.animate([{ height: "0px", opacity: 0 }, { height: h2 + "px", opacity: 1 }], { duration: 380, easing: "cubic-bezier(.2,.8,.2,1)" });
        d._anim.onfinish = function () { d._anim = null; };
      }
    });
  });

  /* ---------- Scroll-Effekte: Fortschritt, Kopfzeile, Parallaxe, Handy-Neigung ---------- */
  var bar = $(".progress span");
  var header = $(".top");
  var par = $$("[data-parallax]").map(function (n) {
    return { n: n, s: parseFloat(n.dataset.parallax), spin: parseFloat(n.dataset.spin || 0), ref: n.closest("section") || n.parentNode };
  });
  var tilt = $("[data-tilt]");
  var mx = 0, my = 0;
  var ticking = false;

  function update() {
    ticking = false;
    var y = window.scrollY, vh = window.innerHeight;
    var max = document.documentElement.scrollHeight - vh;
    if (bar) bar.style.setProperty("--p", max > 0 ? (y / max).toFixed(4) : 0);
    if (header) header.classList.toggle("scrolled", y > 10);
    if (reduce) return;

    par.forEach(function (p) {
      var top = p.ref.getBoundingClientRect().top;
      var off = -top * p.s;
      p.n.style.transform = "translate3d(0," + off.toFixed(1) + "px,0)" + (p.spin ? " rotate(" + (top * p.spin / 1000).toFixed(1) + "deg)" : "");
    });

    if (tilt) {
      var k = Math.min(y / vh, 1);
      tilt.style.transform =
        "translateY(" + (k * -30).toFixed(1) + "px) " +
        "rotateX(" + (k * 16 + my * -6).toFixed(2) + "deg) " +
        "rotateY(" + (mx * 10).toFixed(2) + "deg) " +
        "rotateZ(" + (3 - k * 9).toFixed(2) + "deg) " +
        "scale(" + (1 - k * 0.08).toFixed(3) + ")";
    }
  }
  function requestUpdate() { if (!ticking) { ticking = true; requestAnimationFrame(update); } }
  window.addEventListener("scroll", requestUpdate, { passive: true });
  window.addEventListener("resize", requestUpdate);
  if (window.matchMedia("(pointer: fine)").matches) {
    window.addEventListener("pointermove", function (e) {
      mx = e.clientX / window.innerWidth - 0.5;
      my = e.clientY / window.innerHeight - 0.5;
      requestUpdate();
    }, { passive: true });
  }
  update();

  /* ---------- Laufband: läuft immer, Scrollen gibt Schwung und Richtung ---------- */
  var track = $("[data-marquee]");
  if (track && !reduce) {
    var x = 0, dir = 1, boost = 0, lastY = window.scrollY, visible = true, half = 0;
    var measure = function () { half = track.scrollWidth / 2; };
    measure(); window.addEventListener("resize", measure);
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (e) { visible = e[0].isIntersecting; }).observe(track);
    }
    window.addEventListener("scroll", function () {
      var dy = window.scrollY - lastY; lastY = window.scrollY;
      if (dy) dir = dy > 0 ? 1 : -1;
      boost = Math.min(boost + Math.abs(dy) * 0.25, 22);
    }, { passive: true });
    (function loop() {
      if (visible && half) {
        x -= (0.6 + boost) * dir;
        boost *= 0.92;
        if (x <= -half) x += half;
        if (x > 0) x -= half;
        track.style.transform = "translate3d(" + x.toFixed(1) + "px,0,0)";
      }
      requestAnimationFrame(loop);
    })();
  }
})();
