/* Espressophie – Website: Animationen und Interaktion (ohne externe Bibliotheken) */
(function () {
  "use strict";

  var root = document.documentElement;
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var hasIO = "IntersectionObserver" in window;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* egal */ } }
  };

  /* ---------- Konto oben rechts ----------
     Merkt sich nach der Anmeldung in der Auswertung nur Name und E-Mail
     (lokal im Browser). Außerhalb der Auswertung wird nur der Anfangsbuchstabe
     gezeigt – so lädt keine Seite etwas von Google, bevor man selbst tippt. */
  var ACCT_KEY = "ep_account";
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var onApp = /\/auswertung\/?(index\.html)?$/.test(location.pathname);
  var Account = {
    active: false,      // true, solange die Auswertung echte Daten geladen hat
    picture: null,      // Profilbild nur innerhalb der Auswertung
    onSignIn: null,     // von auswertung.js gesetzt
    onSignOut: null,    // von auswertung.js gesetzt
    get: function () { try { var u = JSON.parse(localStorage.getItem(ACCT_KEY)); return u && (u.name || u.email) ? u : null; } catch (e) { return null; } },
    set: function (u) { store.set(ACCT_KEY, JSON.stringify({ name: u.name || "", email: u.email || "" })); Account.picture = u.picture || null; renderAcct(); },
    clear: function () { try { localStorage.removeItem(ACCT_KEY); } catch (e) { /* egal */ } Account.picture = null; Account.active = false; renderAcct(); },
    render: function () { renderAcct(); }
  };
  window.EPAccount = Account;

  var acctBox = null;
  function avatar(u, big) {
    var cls = "av" + (big ? " lg" : "");
    if (Account.picture && onApp) return '<img class="' + cls + '" src="' + esc(Account.picture) + '" alt="" referrerpolicy="no-referrer" />';
    return '<span class="' + cls + '" aria-hidden="true">' + esc((u.name || u.email || "?").trim().charAt(0).toUpperCase()) + "</span>";
  }
  function closePop() {
    if (!acctBox) return;
    $(".acct-pop", acctBox).hidden = true;
    $(".acct-btn", acctBox).setAttribute("aria-expanded", "false");
  }
  function renderAcct() {
    if (!acctBox) return;
    var u = Account.get(), btn = $(".acct-btn", acctBox), pop = $(".acct-pop", acctBox);
    btn.classList.toggle("has-user", Boolean(u));
    if (u) {
      btn.innerHTML = avatar(u);
      btn.setAttribute("aria-label", "Konto: " + (u.name || u.email));
      btn.setAttribute("aria-haspopup", "true");
      pop.innerHTML = avatar(u, true) + "<b>" + esc(u.name || u.email) + "</b>" + (u.name && u.email ? "<small>" + esc(u.email) + "</small>" : "") +
        '<div class="acct-actions">' +
          (!onApp ? '<a class="pill" href="/auswertung/">Auswertung öffnen</a>' : !Account.active ? '<button class="pill" type="button" data-acct="in">Daten laden</button>' : "") +
          '<button class="pill ghost" type="button" data-acct="out">Abmelden</button>' +
        "</div>" +
        (!onApp ? '<p class="note">Deine Daten bleiben in deinem Google Drive.</p>' : "");
    } else {
      btn.innerHTML = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.5" r="3.8"/><path d="M4.8 20c.8-3.6 3.6-5.5 7.2-5.5s6.4 1.9 7.2 5.5"/></svg><span>Anmelden</span>';
      btn.setAttribute("aria-label", "Mit Google anmelden – Auswertung");
      btn.removeAttribute("aria-haspopup");
      pop.innerHTML = "";
      closePop();
    }
  }
  var bar = $(".top .wrap");
  if (bar) {
    acctBox = document.createElement("div");
    acctBox.className = "acct";
    acctBox.innerHTML = '<button class="acct-btn" type="button" aria-expanded="false"></button><div class="acct-pop" hidden></div>';
    bar.appendChild(acctBox);
    renderAcct();
    $(".acct-btn", acctBox).addEventListener("click", function (e) {
      e.stopPropagation();
      if (!Account.get()) {
        if (onApp && Account.onSignIn) Account.onSignIn(); else location.href = "/auswertung/";
        return;
      }
      var pop = $(".acct-pop", acctBox), open = pop.hidden;
      pop.hidden = !open;
      this.setAttribute("aria-expanded", open);
    });
    $(".acct-pop", acctBox).addEventListener("click", function (e) {
      var a = e.target.closest("[data-acct]");
      if (!a) return;
      closePop();
      if (a.dataset.acct === "in" && Account.onSignIn) Account.onSignIn();
      if (a.dataset.acct === "out") { if (Account.onSignOut) Account.onSignOut(); else Account.clear(); }
    });
    document.addEventListener("click", function (e) { if (!acctBox.contains(e.target)) closePop(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closePop(); });
    window.addEventListener("storage", function (e) { if (e.key === ACCT_KEY) renderAcct(); }); // andere Tabs
  }

  /* ---------- Akzentfarbe (wie in der App, merkt sich die Wahl) ---------- */
  function setAccent(id) {
    if (id && id !== "caramel") root.setAttribute("data-accent", id); else root.removeAttribute("data-accent");
    $$(".accent-dot").forEach(function (b) {
      var on = b.dataset.accent === (id || "caramel");
      b.setAttribute("aria-checked", on);
      if (on) { var n = $(".accent-name"); if (n) n.textContent = b.dataset.name; }
    });
  }
  setAccent(store.get("ep_accent") || "caramel");
  $$(".accent-dot").forEach(function (b) {
    b.addEventListener("click", function () { setAccent(b.dataset.accent); store.set("ep_accent", b.dataset.accent); });
  });

  /* ---------- Einblenden beim Scrollen ---------- */
  var handlers = [];
  function onShow(n) {
    n.classList.add("in");
    handlers.forEach(function (h) { if (n.matches(h.sel)) h.fn(n); });
  }
  function whenShown(sel, fn) { handlers.push({ sel: sel, fn: fn }); }

  /* ---------- Hero-Intro ---------- */
  requestAnimationFrame(function () { requestAnimationFrame(function () { root.classList.add("ready"); }); });

  /* ---------- Statement: Wort für Wort aufhellen ---------- */
  var words = [];
  var statement = $("[data-words]");
  if (statement && !reduce) {
    statement.innerHTML = statement.textContent.trim().split(/\s+/).map(function (w) { return '<span class="w">' + w + "</span>"; }).join(" ");
    words = $$(".w", statement);
  }

  /* ---------- Sticky-Story: Bild wechselt mit dem Schritt ---------- */
  var steps = $$(".step"), screens = $$(".screens picture"), dots = $$(".dots i");
  function setStep(i) {
    steps.forEach(function (s, k) { s.classList.toggle("active", k === i); });
    screens.forEach(function (s, k) { s.classList.toggle("active", k === i); });
    dots.forEach(function (s, k) { s.classList.toggle("on", k === i); });
  }

  /* ---------- KI-Barista: Nachrichten nacheinander ---------- */
  whenShown("[data-chat]", function (chat) {
    var msgs = $$("[data-msg]", chat), t = 300;
    msgs.forEach(function (m) {
      var typing = m.classList.contains("typing");
      setTimeout(function () { m.classList.add("show"); }, reduce ? 0 : t);
      t += typing ? 1400 : 900;
      if (typing) setTimeout(function () { m.classList.add("gone"); }, reduce ? 0 : t - 150);
    });
  });

  /* ---------- Maschine: Schalter wie in der App ---------- */
  var card = $("[data-power-card]");
  if (card) {
    var sw = $(".switch", card), status = $("[data-power-status]", card), bar = $(".bar i", card);
    var timer = null, touched = false;
    var render = function (lamp, pct, text) {
      card.dataset.lamp = lamp;
      sw.setAttribute("aria-checked", lamp !== "off");
      sw.setAttribute("aria-label", "Maschine " + (lamp === "off" ? "einschalten" : "ausschalten") + " (Vorführung)");
      bar.style.width = pct + "%";
      status.textContent = text;
    };
    var turnOn = function () {
      var pct = 0;
      clearInterval(timer);
      if (reduce) { render("warm", 100, "Vorgewärmt – bereit für den Shot"); return; }
      render("heat", 0, "Heizt auf · 0 %");
      timer = setInterval(function () {
        pct = Math.min(100, pct + 2.5);
        if (pct >= 100) { clearInterval(timer); render("warm", 100, "Vorgewärmt – bereit für den Shot"); }
        else render("heat", pct, "Heizt auf · " + Math.round(pct) + " %");
      }, 110);
    };
    var turnOff = function () { clearInterval(timer); render("off", 0, "Aus"); };
    sw.addEventListener("click", function () { touched = true; if (card.dataset.lamp === "off") turnOn(); else turnOff(); });
    whenShown(".machine-demo", function () { setTimeout(function () { if (!touched && card.dataset.lamp === "off") turnOn(); }, 700); });
  }

  /* ---------- Beobachter ---------- */
  var revealables = $$("[data-reveal]");
  if (reduce || !hasIO) {
    revealables.forEach(onShow);
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { onShow(e.target); io.unobserve(e.target); } });
    }, { rootMargin: "0px 0px -10% 0px", threshold: 0.12 });
    revealables.forEach(function (n) { io.observe(n); });
  }
  if (hasIO) {
    var so = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) setStep(+e.target.dataset.step); });
    }, { rootMargin: "-45% 0px -45% 0px" });
    steps.forEach(function (s) { so.observe(s); });

    var navLinks = $$(".nav a[href^='#']");
    var no = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) navLinks.forEach(function (a) { a.classList.toggle("on", a.getAttribute("href") === "#" + e.target.id); });
      });
    }, { rootMargin: "-40% 0px -55% 0px" });
    navLinks.forEach(function (a) { var t = $(a.getAttribute("href")); if (t) no.observe(t); });
  }

  /* ---------- Menü (Handy) ---------- */
  var burger = $(".burger"), nav = $("#nav");
  if (burger && nav) {
    var setMenu = function (open) {
      nav.classList.toggle("open", open);
      document.body.classList.toggle("nav-open", open);
      burger.setAttribute("aria-expanded", open);
      burger.setAttribute("aria-label", open ? "Menü schließen" : "Menü öffnen");
    };
    burger.addEventListener("click", function () { setMenu(!nav.classList.contains("open")); });
    $$("a", nav).forEach(function (a) { a.addEventListener("click", function () { setMenu(false); }); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") setMenu(false); });
  }

  /* ---------- FAQ weich auf- und zuklappen ---------- */
  $$(".faq-list details").forEach(function (d) {
    var sum = $("summary", d), ans = $(".ans", d);
    if (!ans || !ans.animate || reduce) return;
    sum.addEventListener("click", function (e) {
      e.preventDefault();
      if (d._anim) d._anim.cancel();
      if (d.open) {
        d._anim = ans.animate([{ height: ans.offsetHeight + "px", opacity: 1 }, { height: "0px", opacity: 0 }], { duration: 300, easing: "cubic-bezier(.2,.8,.2,1)" });
        d._anim.onfinish = function () { d.open = false; d._anim = null; };
      } else {
        d.open = true;
        d._anim = ans.animate([{ height: "0px", opacity: 0 }, { height: ans.offsetHeight + "px", opacity: 1 }], { duration: 380, easing: "cubic-bezier(.2,.9,.25,1.05)" });
        d._anim.onfinish = function () { d._anim = null; };
      }
    });
  });

  /* ---------- Scroll-Effekte: Kopfzeile, Hero-Handys, Statement ---------- */
  var header = $(".top"), stage = $(".hero-stage");
  var ticking = false;
  function update() {
    ticking = false;
    var y = window.scrollY, vh = window.innerHeight;
    if (header) header.classList.toggle("scrolled", y > 8);
    if (reduce) return;
    if (stage) stage.style.setProperty("--hp", Math.min(Math.max(y / (vh * 0.8), 0), 1).toFixed(3));
    if (words.length) {
      var r = statement.getBoundingClientRect();
      var p = (vh * 0.82 - r.top) / (r.height + vh * 0.3);
      var lit = Math.round(Math.min(Math.max(p, 0), 1) * words.length);
      words.forEach(function (w, i) { w.classList.toggle("on", i < lit); });
    }
  }
  function requestUpdate() { if (!ticking) { ticking = true; requestAnimationFrame(update); } }
  window.addEventListener("scroll", requestUpdate, { passive: true });
  window.addEventListener("resize", requestUpdate);
  update();
})();
