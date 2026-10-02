/* ============================================================
   Espressophie – Web-Ansicht
   Liest Espressophie/espressophie-daten.json aus dem Google Drive
   der angemeldeten Person (nur lesen) und zeigt Übersicht, Verlauf,
   Bohnen und Setup. Kein Server: alles passiert in diesem Browser-Tab,
   die Daten liegen nur im Arbeitsspeicher.

   Datenschutz: Das Anmelde-Skript von Google (accounts.google.com)
   wird ERST geladen, wenn jemand auf „Mit Google anmelden“ tippt.
   ============================================================ */
(function () {
  "use strict";

  var root = document.getElementById("webapp");
  if (!root) return;

  var CLIENT_ID = (root.getAttribute("data-client-id") || "").trim();
  if (CLIENT_ID.indexOf("{{") >= 0) CLIENT_ID = ""; // ohne Jekyll (lokal) nicht eingesetzt
  var GSI_SRC = "https://accounts.google.com/gsi/client";
  var SCOPE_DRIVE = "https://www.googleapis.com/auth/drive.file";
  var SCOPES = "openid email profile " + SCOPE_DRIVE;
  var DRIVE = "https://www.googleapis.com/drive/v3";
  var FOLDERS = ["Espressophie", "Coffee Dashboard"];
  var FILES = ["espressophie-daten.json", "coffee-dashboard-daten.json"];

  var $ = function (id) { return document.getElementById(id); };
  var $$ = function (sel, c) { return Array.prototype.slice.call((c || document).querySelectorAll(sel)); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var num = function (v) { if (v === null || v === undefined || v === "") return null; var n = Number(String(v).replace(",", ".")); return isFinite(n) ? n : null; };
  var fmt = function (v, d) { var n = num(v); return n === null ? "–" : n.toLocaleString("de-DE", { maximumFractionDigits: d === undefined ? 1 : d }); };
  var avg = function (a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : null; };
  var norm = function (s) { return String(s || "").trim().toLowerCase(); };

  var ICON = {
    bean: '<ellipse cx="12" cy="12" rx="5.6" ry="8.2" transform="rotate(32 12 12)"/><path d="M9.6 5.6c-1.4 3.6 4.2 9.2 4.8 12.8"/>',
    shot: '<path d="M5 8h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z"/><path d="M16 9.5h1.5a2.5 2.5 0 0 1 0 5H16"/><path d="M4 21h14"/><path d="M8.5 2.8c-.6.9.6 1.6 0 2.6M12 2.8c-.6.9.6 1.6 0 2.6"/>',
    wrench: '<path d="M14.5 4a4.5 4.5 0 0 0-4.2 6.1L4.5 15.9a1.8 1.8 0 0 0 2.6 2.6l5.8-5.8A4.5 4.5 0 0 0 19 8.5l-2.7 2.7-2.6-.7-.7-2.6L15.7 5a4.5 4.5 0 0 0-1.2-1z"/>',
    cup: '<path d="M5 9h11v4.5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z"/><path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16"/>'
  };
  var tile = function (name, color) { return '<span class="tile" style="--c:' + color + '"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true">' + ICON[name] + "</svg></span>"; };

  /* ---------- Zustand ---------- */
  var S = { token: null, tokenClient: null, user: null, model: null, demo: false, tab: "overview", trendBean: null, histBean: "", histQuery: "" };

  function msg(text, isError) {
    var m = $("waMsg");
    m.textContent = text || "";
    m.classList.toggle("error", Boolean(isError));
  }

  /* ---------- Google-Skript erst bei Bedarf laden ---------- */
  var gsiPromise = null;
  function loadGsi() {
    if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
    if (gsiPromise) return gsiPromise;
    gsiPromise = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = GSI_SRC;
      s.async = true;
      s.onload = function () { resolve(); };
      s.onerror = function () { gsiPromise = null; reject(new Error("Das Anmelde-Skript von Google konnte nicht geladen werden. Prüfe deine Internetverbindung oder einen Inhaltsblocker.")); };
      document.head.appendChild(s);
    });
    return gsiPromise;
  }

  function login() {
    var btn = $("waLogin");
    if (!CLIENT_ID) { msg("Die Google-Anmeldung wird gerade eingerichtet. Schau dir solange die Beispieldaten an.", true); return; }
    btn.disabled = true;
    msg("Verbinde mit Google …");
    loadGsi().then(function () {
      if (!S.tokenClient) {
        S.tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: SCOPES,
          callback: onToken,
          error_callback: onTokenError
        });
      }
      S.tokenClient.requestAccessToken();
    }).catch(function (err) { btn.disabled = false; msg(err.message, true); });
  }

  function onTokenError(err) {
    $("waLogin").disabled = false;
    if (err && err.type === "popup_failed_to_open") msg("Dein Browser hat das Google-Fenster blockiert. Tippe bitte noch einmal auf „Mit Google anmelden“.", true);
    else if (err && err.type === "popup_closed") msg("Anmeldung abgebrochen.");
    else msg("Die Anmeldung hat nicht geklappt. Bitte versuch es noch einmal.", true);
  }

  function onToken(resp) {
    $("waLogin").disabled = false;
    if (!resp || resp.error) { msg("Die Anmeldung hat nicht geklappt (" + esc(resp && resp.error) + ").", true); return; }
    if (!google.accounts.oauth2.hasGrantedAllScopes(resp, SCOPE_DRIVE)) {
      msg("Ohne Zugriff auf die Espressophie-Datei in deinem Drive kann die Web-Ansicht nichts anzeigen. Bitte bei der Anmeldung den Haken bei Google Drive setzen.", true);
      return;
    }
    S.token = resp.access_token;
    S.demo = false;
    loadDrive();
  }

  /* ---------- Google Drive (nur lesen) ---------- */
  function api(url) {
    return fetch(url, { headers: { Authorization: "Bearer " + S.token } }).then(function (r) {
      if (r.status === 401) throw new Error("Deine Anmeldung ist abgelaufen. Bitte melde dich neu an.");
      if (!r.ok) throw new Error("Google Drive antwortet mit Fehler " + r.status + ".");
      return r.json();
    });
  }
  function query(q) {
    return api(DRIVE + "/files?spaces=drive&orderBy=modifiedTime desc&fields=files(id,name,modifiedTime)&q=" + encodeURIComponent(q)).then(function (d) { return d.files || []; });
  }
  function findFile() {
    var i = 0;
    function nextFolder() {
      if (i >= FOLDERS.length) {
        // Fallback: Datei irgendwo im Drive (falls der Ordner umbenannt wurde)
        return query("name='" + FILES[0] + "' and trashed=false").then(function (f) { return f[0] || null; });
      }
      var folder = FOLDERS[i++];
      return query("name='" + folder + "' and mimeType='application/vnd.google-apps.folder' and trashed=false").then(function (folders) {
        if (!folders.length) return nextFolder();
        var q = FILES.map(function (n) { return "name='" + n + "'"; }).join(" or ");
        return query("(" + q + ") and '" + folders[0].id + "' in parents and trashed=false").then(function (files) {
          return files[0] || nextFolder();
        });
      });
    }
    return nextFolder();
  }

  function loadDrive() {
    msg("Lade deine Daten aus Google Drive …");
    Promise.all([
      api("https://www.googleapis.com/oauth2/v3/userinfo").catch(function () { return null; }),
      findFile()
    ]).then(function (res) {
      S.user = res[0];
      var file = res[1];
      if (!file) throw new Error("In deinem Google Drive wurden keine Espressophie-Daten gefunden. Melde dich in der App mit demselben Google-Konto an und warte, bis der Abgleich fertig ist.");
      return api(DRIVE + "/files/" + file.id + "?alt=media").then(function (data) { show(data, file.modifiedTime); });
    }).catch(function (err) { msg(err.message, true); });
  }

  function loadDemo() {
    msg("Lade Beispieldaten …");
    fetch("/app/demo.json").then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
      .then(function (data) { S.demo = true; S.user = null; show(data, data.savedAt); })
      .catch(function () { msg("Die Beispieldaten konnten nicht geladen werden.", true); });
  }

  function logout() {
    var t = S.token;
    S.token = null; S.model = null; S.user = null; S.demo = false;
    if (t && window.google && google.accounts && google.accounts.oauth2) google.accounts.oauth2.revoke(t, function () {});
    $("waDash").hidden = true;
    $("waStart").hidden = false;
    msg(t ? "Du bist abgemeldet. Die Daten wurden aus diesem Tab entfernt." : "");
    window.scrollTo(0, 0);
  }

  /* ---------- Daten aufbereiten ---------- */
  function build(raw) {
    var tables = (raw && raw.tables) || {};
    var deleted = (raw && raw.deleted) || {};
    var alive = function (t) { return (tables[t] || []).filter(function (r) { return !(deleted[t] && deleted[t][r.id]); }); };
    var entries = alive("coffee_entries");
    var beans = alive("coffee_beans");
    var equipment = alive("coffee_equipment");
    var cleaning = alive("coffee_cleaning_logs");
    var settings = alive("coffee_user_settings")[0] || {};
    var eqById = {}; equipment.forEach(function (e) { eqById[e.id] = e; });
    var beanById = {}; beans.forEach(function (b) { beanById[b.id] = b; });
    entries.forEach(function (e) {
      var t = String(e.entry_time || "00:00:00").slice(0, 8);
      e._at = new Date((e.entry_date || "1970-01-01") + "T" + (t.length === 5 ? t + ":00" : t));
      e._bean = beanById[e.bean_id] || null;
      e._grinder = eqById[e.grinder_id] || null;
      e._machine = eqById[e.machine_id] || null;
    });
    entries.sort(function (a, b) { return b._at - a._at || (b.id > a.id ? 1 : -1); });
    return {
      entries: entries,
      shots: entries.filter(function (e) { return !e.dialin; }),
      beans: beans, equipment: equipment, cleaning: cleaning, settings: settings,
      tmin: num(settings.target_time_min_s) || 25,
      tmax: num(settings.target_time_max_s) || 30
    };
  }

  function grind(v, grinder) {
    var n = num(v);
    if (n === null) return "–";
    if (grinder && grinder.grind_type === "buchstaben") {
      var letters = num(grinder.grind_letters) || 9;
      var macro = Math.floor(n + 1e-6), idx = Math.round((n - macro) * letters);
      if (idx >= letters) { macro += 1; idx = 0; }
      return macro + String.fromCharCode(65 + idx);
    }
    return fmt(n, 2);
  }
  var inTarget = function (e, M) { var t = num(e.extraction_time_s); return t !== null && t >= M.tmin && t <= M.tmax; };
  var day = function (d) { return d.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" }); };
  var shortDate = function (d) { return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" }); };
  var time = function (d) { return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }); };
  var stars = function (n) { n = num(n); return n ? '<span class="stars" aria-label="' + n + ' von 5 Sternen">' + "★".repeat(Math.round(n)) + "</span>" : ""; };
  var beanName = function (e) { return e.drink_name || (e._bean && e._bean.name) || "Unbekannt"; };

  /* ---------- Anzeigen ---------- */
  function show(raw, savedAt) {
    S.model = build(raw);
    S.trendBean = null;
    msg("");
    $("waStart").hidden = true;
    $("waDash").hidden = false;
    renderUser();
    renderAll();
    var when = savedAt ? new Date(savedAt) : null;
    $("waSource").textContent = (S.demo ? "Beispieldaten – nicht deine echten Shots." : "Quelle: Google Drive › Espressophie › espressophie-daten.json") +
      (when && !isNaN(when) ? " · Stand " + when.toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" }) : "");
    window.scrollTo(0, 0);
  }

  function renderUser() {
    var u = S.user, html;
    if (S.demo) {
      html = '<span class="avatar">B</span><div><b>Beispieldaten <span class="demo-flag">Demo</span></b><small>So sieht die Web-Ansicht mit echten Daten aus.</small></div>';
    } else {
      var name = (u && (u.name || u.email)) || "Angemeldet";
      var pic = u && u.picture ? '<img src="' + esc(u.picture) + '" alt="" referrerpolicy="no-referrer" />' : '<span class="avatar">' + esc(name.charAt(0).toUpperCase()) + "</span>";
      html = pic + "<div><b>" + esc(name) + "</b><small>" + esc((u && u.email) || "") + "</small></div>";
    }
    $("waUser").innerHTML = html;
    $("waLogout").textContent = S.demo ? "Beenden" : "Abmelden";
  }

  function renderAll() {
    renderKpis(); renderTrend(); renderBest(); renderRecent(); renderHistoryFilters(); renderHistory(); renderBeans(); renderSetup();
  }

  function renderKpis() {
    var M = S.model, shots = M.shots;
    var ref = S.demo && shots.length ? shots[0]._at.getTime() + 43200000 : Date.now();
    var week = shots.filter(function (e) { return e._at.getTime() >= ref - 7 * 86400000; }).length;
    var ratings = shots.map(function (e) { return num(e.rating); }).filter(function (v) { return v !== null; });
    var timed = shots.filter(function (e) { return num(e.extraction_time_s) !== null; });
    var hit = timed.filter(function (e) { return inTarget(e, M); }).length;
    var tasted = shots.filter(function (e) { return num(e.taste_balance) !== null; });
    var balanced = tasted.filter(function (e) { return num(e.taste_balance) === 0; }).length;
    var k = function (label, value, sub) { return '<div class="kpi"><span>' + label + "</span><b>" + value + "</b><small>" + sub + "</small></div>"; };
    $("waKpis").innerHTML = shots.length ? [
      k("Shots", shots.length, week + " in 7 Tagen"),
      k("Ø Bewertung", ratings.length ? fmt(avg(ratings), 1) + " ★" : "–", ratings.length + " bewertet"),
      k("Im Zeitziel", timed.length ? Math.round(hit / timed.length * 100) + " %" : "–", fmt(M.tmin, 0) + "–" + fmt(M.tmax, 0) + " s"),
      k("Ausgewogen", tasted.length ? Math.round(balanced / tasted.length * 100) + " %" : "–", tasted.length + " mit Geschmack")
    ].join("") : '<div class="card empty" style="grid-column:1/-1">Noch keine Shots in deinen Daten.</div>';
  }

  function beanGroups() {
    var map = {};
    S.model.shots.forEach(function (e) {
      var k = norm(beanName(e));
      if (!map[k]) map[k] = { key: k, name: beanName(e), shots: [] };
      map[k].shots.push(e);
    });
    return Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) { return b.shots.length - a.shots.length; });
  }

  function renderTrend() {
    var groups = beanGroups().filter(function (g) { return g.shots.length >= 2; });
    var sel = $("waTrendBean");
    sel.innerHTML = groups.length ? groups.map(function (g) { return '<option value="' + esc(g.key) + '">' + esc(g.name) + " (" + g.shots.length + ")</option>"; }).join("") : '<option value="">Mindestens 2 Shots pro Bohne nötig</option>';
    if (!S.trendBean || !groups.some(function (g) { return g.key === S.trendBean; })) S.trendBean = groups.length ? groups[0].key : null;
    sel.value = S.trendBean || "";
    var g = groups.filter(function (x) { return x.key === S.trendBean; })[0];
    var series = g ? g.shots.filter(function (e) { return num(e.extraction_time_s) !== null; }).slice().reverse() : [];
    $("waTrend").innerHTML = chart(series);
    var hit = series.filter(function (e) { return inTarget(e, S.model); }).length;
    $("waTrendSub").textContent = series.length ? hit + " von " + series.length + " Shots im Zeitziel (" + fmt(S.model.tmin, 0) + "–" + fmt(S.model.tmax, 0) + " s, grünes Band)." : "Extraktionszeit über die Shots – das grüne Band ist dein Zeitziel.";
  }

  function chart(series) {
    if (series.length < 2) return '<div class="empty">Noch zu wenige Shots für einen Trend.</div>';
    var M = S.model, W = 640, H = 250, L = 34, R = 12, T = 12, B = 30;
    var ts = series.map(function (e) { return num(e.extraction_time_s); });
    var lo = Math.floor(Math.min(M.tmin - 4, Math.min.apply(null, ts)) / 5) * 5;
    var hi = Math.ceil(Math.max(M.tmax + 4, Math.max.apply(null, ts)) / 5) * 5;
    var x = function (i) { return L + (W - L - R) * (series.length === 1 ? 0.5 : i / (series.length - 1)); };
    var y = function (v) { return T + (H - T - B) * (1 - (v - lo) / (hi - lo)); };
    var out = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Extraktionszeit pro Shot">';
    out += '<rect class="band" x="' + L + '" y="' + y(M.tmax) + '" width="' + (W - L - R) + '" height="' + (y(M.tmin) - y(M.tmax)) + '" rx="6" />';
    for (var v = lo; v <= hi; v += 5) out += '<line class="grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '" /><text class="axis" x="' + (L - 8) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + v + " s</text>";
    out += '<polyline class="line" points="' + ts.map(function (t, i) { return x(i).toFixed(1) + "," + y(t).toFixed(1); }).join(" ") + '" />';
    series.forEach(function (e, i) {
      out += '<circle class="pt' + (inTarget(e, M) ? " hit" : "") + '" cx="' + x(i).toFixed(1) + '" cy="' + y(ts[i]).toFixed(1) + '" r="4.5"><title>' + esc(shortDate(e._at) + ": " + fmt(ts[i], 1) + " s, Mahlgrad " + grind(e.mahlgrad, e._grinder)) + "</title></circle>";
    });
    out += '<text class="axis" x="' + L + '" y="' + (H - 8) + '">' + esc(shortDate(series[0]._at)) + "</text>";
    out += '<text class="axis" x="' + (W - R) + '" y="' + (H - 8) + '" text-anchor="end">' + esc(shortDate(series[series.length - 1]._at)) + "</text>";
    return out + "</svg>";
  }

  function renderBest() {
    var map = {};
    S.model.shots.forEach(function (e) {
      if ((num(e.rating) || 0) < 4 || num(e.mahlgrad) === null) return;
      var gname = e._grinder ? e._grinder.name : "Mühle unbekannt";
      var k = norm(beanName(e)) + "|" + (e.grinder_id || "");
      if (!map[k]) map[k] = { bean: beanName(e), grinder: gname, g: e._grinder, vals: [], times: [] };
      map[k].vals.push(num(e.mahlgrad));
      if (num(e.extraction_time_s) !== null) map[k].times.push(num(e.extraction_time_s));
    });
    var rows = Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) { return b.vals.length - a.vals.length; });
    $("waBest").innerHTML = rows.length ? rows.map(function (r) {
      var mn = Math.min.apply(null, r.vals), mx = Math.max.apply(null, r.vals);
      var val = mn === mx ? grind(mn, r.g) : grind(mn, r.g) + "–" + grind(mx, r.g);
      return '<div class="row"><div><b>' + esc(r.bean) + "</b><small>" + esc(r.grinder) + " · " + r.vals.length + (r.vals.length === 1 ? " Shot" : " Shots") + (r.times.length ? " · Ø " + fmt(avg(r.times), 0) + " s" : "") + '</small></div><div class="val">' + esc(val) + "</div></div>";
    }).join("") : '<div class="empty">Noch keine Shots mit 4 oder 5 Sternen.</div>';
  }

  function shotLine(e) {
    var parts = [];
    if (num(e.mahlgrad) !== null) parts.push("MG " + grind(e.mahlgrad, e._grinder));
    if (num(e.dose_g) !== null || num(e.yield_g) !== null) parts.push(fmt(e.dose_g) + " → " + fmt(e.yield_g) + " g");
    if (num(e.extraction_time_s) !== null) parts.push(fmt(e.extraction_time_s) + " s");
    return parts.join(" · ");
  }

  function renderRecent() {
    var list = S.model.entries.slice(0, 6);
    $("waRecent").innerHTML = list.length ? list.map(function (e) {
      return '<div class="row"><div><b>' + esc(beanName(e)) + (e.dialin ? ' <span class="chip mini">Dial-In</span>' : "") + "</b><small>" + esc(shortDate(e._at) + ", " + time(e._at) + " · " + shotLine(e)) + '</small></div><div class="val">' + stars(e.rating) + "</div></div>";
    }).join("") : '<div class="empty">Noch keine Shots.</div>';
  }

  function renderHistoryFilters() {
    var groups = beanGroups();
    var sel = $("waHistBean");
    sel.innerHTML = '<option value="">Alle Kaffees (' + S.model.entries.length + ")</option>" + groups.map(function (g) { return '<option value="' + esc(g.key) + '">' + esc(g.name) + "</option>"; }).join("");
    sel.value = S.histBean;
  }

  function historyRows() {
    var q = norm(S.histQuery);
    return S.model.entries.filter(function (e) {
      if (S.histBean && norm(beanName(e)) !== S.histBean) return false;
      if (!q) return true;
      var hay = [beanName(e), e.note, e.barista_feedback_short, e._bean && e._bean.roaster, e._grinder && e._grinder.name, e._machine && e._machine.name].join(" ").toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }

  function renderHistory() {
    var M = S.model, rows = historyRows(), max = 400;
    $("waHistCount").textContent = rows.length + (rows.length === 1 ? " Shot" : " Shots") + (rows.length > max ? " – die neuesten " + max + " werden angezeigt" : "");
    var html = "<thead><tr><th>Uhrzeit</th><th>Kaffee</th><th>Mahlgrad</th><th>Input → Output</th><th>Ratio</th><th>Zeit</th><th>Bewertung</th><th>Notiz</th></tr></thead><tbody>";
    var lastDay = "";
    rows.slice(0, max).forEach(function (e) {
      var d = day(e._at);
      if (d !== lastDay) { html += '<tr class="day"><td colspan="8">' + esc(d) + "</td></tr>"; lastDay = d; }
      var dose = num(e.dose_g), yld = num(e.yield_g), t = num(e.extraction_time_s);
      html += '<tr class="shot">' +
        '<td class="num">' + esc(time(e._at)) + "</td>" +
        '<td class="c-bean">' + esc(beanName(e)) + (e.dialin ? ' <span class="chip mini">Dial-In</span>' : "") + "</td>" +
        '<td class="num">MG ' + esc(grind(e.mahlgrad, e._grinder)) + "</td>" +
        '<td class="num">' + esc(fmt(dose) + " → " + fmt(yld) + " g") + "</td>" +
        '<td class="num">' + (dose && yld ? "1 : " + fmt(yld / dose, 1) : "–") + "</td>" +
        '<td class="num' + (inTarget(e, M) ? " hit" : "") + '">' + (t !== null ? esc(fmt(t) + " s") : "–") + "</td>" +
        '<td class="num">' + (stars(e.rating) || "–") + "</td>" +
        '<td class="note">' + esc(e.note || "") + (e.barista_feedback_short ? '<span class="tip">Barista: ' + esc(e.barista_feedback_short) + "</span>" : "") + "</td>" +
        "</tr>";
    });
    html += "</tbody>";
    $("waHist").innerHTML = rows.length ? html : '<tbody><tr><td class="empty">Keine Shots gefunden.</td></tr></tbody>';
  }

  function renderBeans() {
    var M = S.model;
    var beans = M.beans.slice().sort(function (a, b) { return (a.finished_at ? 1 : 0) - (b.finished_at ? 1 : 0) || String(b.opened_at || b.purchased_at || "").localeCompare(String(a.opened_at || a.purchased_at || "")); });
    var r0 = S.demo && M.entries.length ? M.entries[0]._at : new Date();
    var ref = new Date(r0.getFullYear(), r0.getMonth(), r0.getDate(), 12); // ganze Tage, mittags wie das Röstdatum
    $("waBeans").innerHTML = beans.length ? beans.map(function (b) {
      var shots = M.entries.filter(function (e) { return e.bean_id === b.id || (!e.bean_id && norm(e.drink_name) === norm(b.name)); });
      var used = shots.reduce(function (s, e) { return s + (num(e.dose_g) || 0); }, 0);
      var weight = num(b.weight_g);
      var left = weight ? Math.max(weight - used, 0) : null;
      var ratings = shots.map(function (e) { return num(e.rating); }).filter(function (v) { return v !== null; });
      var age = b.roasted_at ? Math.floor((ref - new Date(b.roasted_at + "T12:00:00")) / 86400000) : null;
      var big = b.finished_at ? "Leer<small>seit " + esc(shortDate(new Date(b.finished_at + "T12:00:00"))) + "</small>"
        : age !== null ? "Tag " + age + "<small>nach Röstung</small>" : shots.length + "<small>Shots</small>";
      var meta = [b.roaster, b.roast_level].filter(Boolean).join(" · ");
      return '<article class="bean' + (b.finished_at ? " done" : "") + '">' + tile("bean", "#a2845e") +
        "<h3>" + esc(b.name) + "</h3>" + (meta ? '<span class="meta">' + esc(meta) + "</span>" : "") +
        '<div class="big">' + big + "</div>" +
        (weight && !b.finished_at ? '<div class="bar" aria-hidden="true"><i style="width:' + Math.round(left / weight * 100) + '%"></i></div>' : "") +
        "<dl>" +
          "<dt>Shots</dt><dd>" + shots.length + "</dd>" +
          (weight ? "<dt>Rest (geschätzt)</dt><dd>" + fmt(left, 0) + " von " + fmt(weight, 0) + " g</dd>" : "") +
          (ratings.length ? "<dt>Ø Bewertung</dt><dd>" + fmt(avg(ratings), 1) + " ★</dd>" : "") +
          (num(b.price_eur) && weight ? "<dt>Pro 18 g</dt><dd>" + (num(b.price_eur) / weight * 18).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €</dd>" : "") +
          (b.notes ? "<dt>Notiz</dt><dd>" + esc(b.notes) + "</dd>" : "") +
        "</dl></article>";
    }).join("") : '<div class="card empty">Noch keine Bohnen angelegt.</div>';
  }

  function renderSetup() {
    var M = S.model;
    var lastClean = function (id, type) {
      var d = M.cleaning.filter(function (c) { return c.equipment_id === id && c.cleaning_type === type; }).map(function (c) { return c.cleaned_at; }).sort().pop();
      return d ? shortDate(new Date(d + "T12:00:00")) : "–";
    };
    var scale = { stufenlos: "stufenlos", stufen: "Stufen", klicks: "Klicks", buchstaben: "Zahl + Buchstabe" };
    $("waSetup").innerHTML = M.equipment.length ? M.equipment.map(function (e) {
      var isGrinder = e.category === "Mühle", isMachine = e.category === "Maschine";
      var count = M.entries.filter(function (s) { return s.grinder_id === e.id || s.machine_id === e.id; }).length;
      var meta = [e.category, [e.brand, e.model].filter(Boolean).join(" ")].filter(Boolean).join(" · ");
      return '<article class="bean' + (e.is_active === false ? " done" : "") + '">' +
        (isGrinder ? tile("wrench", "#8e8e93") : isMachine ? tile("shot", "#ff9500") : tile("cup", "#a2845e")) +
        "<h3>" + esc(e.name) + '</h3><span class="meta">' + esc(meta) + "</span>" +
        '<div class="big">' + count + "<small>Shots</small></div>" +
        "<dl>" +
          (isGrinder && e.grind_type ? "<dt>Skala</dt><dd>" + esc(scale[e.grind_type] || e.grind_type) + "</dd>" : "") +
          (isGrinder && num(e.espresso_min) !== null ? "<dt>Espresso-Bereich</dt><dd>" + esc(grind(e.espresso_min, e) + "–" + grind(e.espresso_max, e)) + "</dd>" : "") +
          (isGrinder || isMachine ? "<dt>Kleine Reinigung</dt><dd>" + lastClean(e.id, "klein") + "</dd><dt>Große Reinigung</dt><dd>" + lastClean(e.id, "gross") + "</dd>" : "") +
          (e.purchase_date ? "<dt>Gekauft</dt><dd>" + esc(shortDate(new Date(e.purchase_date + "T12:00:00"))) + "</dd>" : "") +
        "</dl></article>";
    }).join("") : '<div class="card empty">Noch keine Geräte angelegt.</div>';
  }

  /* ---------- CSV-Export (für Excel/Numbers, deutsches Format) ---------- */
  function csv() {
    if (!S.model) return;
    var cell = function (v) { var s = v === null || v === undefined ? "" : String(v); return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    var n = function (v) { var x = num(v); return x === null ? "" : String(x).replace(".", ","); };
    var head = ["Datum", "Uhrzeit", "Kaffee", "Rösterei", "Mühle", "Maschine", "Mahlgrad", "Input g", "Output g", "Ratio", "Zeit s", "Druck bar", "Temperatur °C", "Bewertung", "Balance", "Süße", "Körper", "Abgang", "Notiz", "Barista-Tipp", "Dial-In"];
    var lines = [head.join(";")].concat(S.model.entries.map(function (e) {
      var dose = num(e.dose_g), yld = num(e.yield_g);
      return [e.entry_date, String(e.entry_time || "").slice(0, 5), beanName(e), e._bean && e._bean.roaster, e._grinder && e._grinder.name, e._machine && e._machine.name,
        grind(e.mahlgrad, e._grinder).replace("–", ""), n(dose), n(yld), dose && yld ? n(Math.round(yld / dose * 100) / 100) : "", n(e.extraction_time_s), n(e.pressure_bar), n(e.temperature_c),
        n(e.rating), n(e.taste_balance), n(e.taste_sweetness), n(e.taste_body), n(e.taste_finish), e.note, e.barista_feedback || e.barista_feedback_short, e.dialin ? "ja" : ""].map(cell).join(";");
    }));
    var blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "espressophie-shots-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  /* ---------- Bedienung ---------- */
  function setTab(tab) {
    S.tab = tab;
    $$(".seg button").forEach(function (b) { b.setAttribute("aria-selected", b.getAttribute("data-tab") === tab); });
    $$(".wa-panel").forEach(function (p) { p.hidden = p.getAttribute("data-panel") !== tab; });
  }

  $("waLogin").addEventListener("click", login);
  $("waDemo").addEventListener("click", loadDemo);
  $("waLogout").addEventListener("click", logout);
  $("waReload").addEventListener("click", function () { if (S.demo) loadDemo(); else if (S.token) loadDrive(); });
  $("waCsv").addEventListener("click", csv);
  $$(".seg button").forEach(function (b) { b.addEventListener("click", function () { setTab(b.getAttribute("data-tab")); }); });
  $$("[data-goto]").forEach(function (b) { b.addEventListener("click", function () { setTab(b.getAttribute("data-goto")); window.scrollTo(0, 0); }); });
  $("waTrendBean").addEventListener("change", function (e) { S.trendBean = e.target.value; renderTrend(); });
  $("waHistBean").addEventListener("change", function (e) { S.histBean = e.target.value; renderHistory(); });
  $("waHistSearch").addEventListener("input", function (e) { S.histQuery = e.target.value; renderHistory(); });

  if (!CLIENT_ID) $("waLogin").title = "Die Google-Anmeldung wird gerade eingerichtet";

  // Kopfzeile: Linie beim Scrollen (wie auf den anderen Seiten)
  var header = document.querySelector(".top");
  window.addEventListener("scroll", function () { header.classList.toggle("scrolled", window.scrollY > 8); }, { passive: true });
})();
