/* ============================================================
   Espressophie – Auswertung
   Die App ist zum Tracken da, die Website zum Auswerten und Teilen.
   Liest Espressophie/espressophie-daten.json aus dem Google Drive der
   angemeldeten Person (nur lesen) und wertet aus: Überblick, Bohnen &
   Röstereien, Geschmack, Rezepte (teilbar), Kosten. Kein Server: alles
   passiert in diesem Browser-Tab, die Daten liegen nur im Arbeitsspeicher.

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
  var eur = function (v) { var n = num(v); return n === null ? "–" : n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €"; };
  var avg = function (a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : null; };
  var sum = function (a) { return a.reduce(function (x, y) { return x + y; }, 0); };
  var norm = function (s) { return String(s || "").trim().toLowerCase(); };
  var vals = function (list, key) { return list.map(function (e) { return num(e[key]); }).filter(function (v) { return v !== null; }); };

  /* ---------- Zustand ---------- */
  var S = { token: null, tokenClient: null, user: null, model: null, demo: false, trendBean: null };
  var acct = function () { return window.EPAccount || null; }; // Konto oben rechts (main.js)

  function msg(text, isError) {
    var m = $("waMsg");
    m.textContent = text || "";
    m.classList.toggle("error", Boolean(isError));
  }

  /* Start-Knopf: „Weiter als Benjamin“, wenn sich der Browser an das Konto erinnert */
  function renderLoginLabel() {
    var known = acct() && acct().get();
    var first = known ? String(known.name || known.email).trim().split(/\s+/)[0] : "";
    $("waLoginText").textContent = first ? "Weiter als " + first : "Mit Google anmelden";
    $("waOther").hidden = !first;
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
        var known = acct() && acct().get();
        S.tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: SCOPES,
          hint: known && known.email ? known.email : undefined, // „Weiter als …“: Google schlägt dieses Konto vor
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
      msg("Ohne Zugriff auf die Espressophie-Datei in deinem Drive kann die Auswertung nichts anzeigen. Bitte bei der Anmeldung den Haken bei Google Drive setzen.", true);
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
      var A = acct();
      if (A && S.user) { A.active = true; A.set({ name: S.user.name, email: S.user.email, picture: S.user.picture }); }
      var file = res[1];
      if (!file) throw new Error("In deinem Google Drive wurden keine Espressophie-Daten gefunden. Melde dich in der App mit demselben Google-Konto an und warte, bis der Abgleich fertig ist.");
      return api(DRIVE + "/files/" + file.id + "?alt=media").then(function (data) { show(data, file.modifiedTime); });
    }).catch(function (err) { msg(err.message, true); });
  }

  function loadDemo() {
    msg("Lade Beispieldaten …");
    fetch("/auswertung/demo.json").then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
      .then(function (data) { S.demo = true; S.user = null; show(data, data.savedAt); })
      .catch(function () { msg("Die Beispieldaten konnten nicht geladen werden.", true); });
  }

  function logout(fromHeader) {
    var t = S.token, wasDemo = S.demo && fromHeader !== true;
    S.token = null; S.model = null; S.user = null; S.demo = false;
    if (t && window.google && google.accounts && google.accounts.oauth2) google.accounts.oauth2.revoke(t, function () {});
    // „Abmelden“ vergisst auch das Konto oben rechts; „Beenden“ der Beispieldaten nicht
    var A = acct(), forget = t || (A && A.get() && !wasDemo);
    if (A && forget) { A.clear(); S.tokenClient = null; }
    $("waDash").hidden = true;
    $("waStart").hidden = false;
    renderLoginLabel();
    msg(forget ? "Du bist abgemeldet. Die Daten wurden aus diesem Tab entfernt." : "");
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
    var settings = alive("coffee_user_settings")[0] || {};
    var eqById = {}; equipment.forEach(function (e) { eqById[e.id] = e; });
    var beanById = {}; beans.forEach(function (b) { beanById[b.id] = b; });
    var beanByName = {}; beans.forEach(function (b) { beanByName[norm(b.name)] = b; });
    entries.forEach(function (e) {
      var t = String(e.entry_time || "00:00:00").slice(0, 8);
      e._at = new Date((e.entry_date || "1970-01-01") + "T" + (t.length === 5 ? t + ":00" : t));
      e._bean = beanById[e.bean_id] || beanByName[norm(e.drink_name)] || null;
      e._grinder = eqById[e.grinder_id] || null;
      e._machine = eqById[e.machine_id] || null;
      // Bohnenkosten dieses Shots
      var b = e._bean, price = b && num(b.price_eur), w = b && num(b.weight_g), dose = num(e.dose_g);
      e._cost = price && w && dose ? price / w * dose : null;
    });
    entries.sort(function (a, b) { return b._at - a._at || (b.id > a.id ? 1 : -1); });
    return {
      entries: entries,
      shots: entries.filter(function (e) { return !e.dialin; }),
      beans: beans, equipment: equipment, settings: settings,
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
  var shortDate = function (d) { return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" }); };
  var monthKey = function (d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); };
  var monthLabel = function (k) { var p = k.split("-"); return new Date(+p[0], +p[1] - 1, 1).toLocaleDateString("de-DE", { month: "short" }).replace(".", ""); };
  var stars = function (n) { n = num(n); return n ? '<span class="stars" aria-label="' + n + ' von 5 Sternen">' + "★".repeat(Math.round(n)) + "</span>" : ""; };
  var beanName = function (e) { return e.drink_name || (e._bean && e._bean.name) || "Unbekannt"; };
  var roasterOf = function (e) { return (e._bean && e._bean.roaster) || ""; };
  var pct = function (a, b) { return b ? Math.round(a / b * 100) + " %" : "–"; };

  function groupBy(list, keyFn) {
    var map = {}, order = [];
    list.forEach(function (e) { var k = keyFn(e); if (k === null || k === undefined || k === "") return; if (!map[k]) { map[k] = []; order.push(k); } map[k].push(e); });
    return order.map(function (k) { return { key: k, items: map[k] }; });
  }

  /* ---------- Anzeigen ---------- */
  function show(raw, savedAt) {
    S.model = build(raw);
    S.trendBean = null;
    msg("");
    $("waStart").hidden = true;
    $("waDash").hidden = false;
    renderUser();
    [renderKpis, renderHighlights, renderTrend, renderMonths, renderBeanCompare, renderRoasters, renderProfile, renderRoast, renderFavs, renderRecipes, renderCosts].forEach(function (fn) {
      try { fn(); } catch (e) { console.error(e); }
    });
    var when = savedAt ? new Date(savedAt) : null;
    $("waSource").textContent = (S.demo ? "Beispieldaten – nicht deine echten Shots." : "Quelle: Google Drive › Espressophie › espressophie-daten.json") +
      (when && !isNaN(when) ? " · Stand " + when.toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" }) : "");
    window.scrollTo(0, 0);
  }

  function renderUser() {
    var u = S.user, html;
    if (S.demo) {
      html = '<span class="avatar">B</span><div><b>Beispieldaten <span class="demo-flag">Demo</span></b><small>So sieht deine Auswertung mit echten Daten aus.</small></div>';
    } else {
      var name = (u && (u.name || u.email)) || "Angemeldet";
      var pic = u && u.picture ? '<img src="' + esc(u.picture) + '" alt="" referrerpolicy="no-referrer" />' : '<span class="avatar">' + esc(name.charAt(0).toUpperCase()) + "</span>";
      html = pic + "<div><b>" + esc(name) + "</b><small>" + esc((u && u.email) || "") + "</small></div>";
    }
    $("waUser").innerHTML = html;
    $("waLogout").textContent = S.demo ? "Beenden" : "Abmelden";
  }

  var kpi = function (label, value, sub) { return '<div class="kpi"><span>' + label + "</span><b>" + value + "</b><small>" + sub + "</small></div>"; };

  /* ----- Überblick ----- */
  function renderKpis() {
    var M = S.model, shots = M.shots;
    var ratings = vals(shots, "rating");
    var timed = shots.filter(function (e) { return num(e.extraction_time_s) !== null; });
    var hit = timed.filter(function (e) { return inTarget(e, M); }).length;
    var beans = groupBy(shots, function (e) { return norm(beanName(e)); }).length;
    var roasters = groupBy(shots, function (e) { return norm(roasterOf(e)); }).length;
    var first = shots.length ? shots[shots.length - 1]._at : null;
    $("waKpis").innerHTML = shots.length ? [
      kpi("Shots", shots.length, first ? "seit " + shortDate(first) : ""),
      kpi("Ø Bewertung", ratings.length ? fmt(avg(ratings), 1) + " ★" : "–", ratings.length + " bewertet"),
      kpi("Im Zeitziel", pct(hit, timed.length), fmt(M.tmin, 0) + "–" + fmt(M.tmax, 0) + " s"),
      kpi("Bohnen", beans, roasters + (roasters === 1 ? " Rösterei" : " Röstereien"))
    ].join("") : '<div class="card empty" style="grid-column:1/-1">Noch keine Shots in deinen Daten.</div>';
  }

  function renderHighlights() {
    var M = S.model, shots = M.shots, out = [];
    var rated = shots.filter(function (e) { return num(e.rating) !== null; });
    if (rated.length) {
      var best = rated.slice().sort(function (a, b) { return num(b.rating) - num(a.rating) || (inTarget(b, M) ? 1 : 0) - (inTarget(a, M) ? 1 : 0) || b._at - a._at; })[0];
      out.push(hl("#ff9500", "Bester Shot", beanName(best), shortDate(best._at) + " · MG " + grind(best.mahlgrad, best._grinder) + " · " + fmt(best.dose_g) + " → " + fmt(best.yield_g) + " g · " + fmt(best.extraction_time_s) + " s"));
    }
    var byBean = groupBy(rated, function (e) { return beanName(e); }).filter(function (g) { return g.items.length >= 3; })
      .map(function (g) { return { name: g.key, r: avg(vals(g.items, "rating")), n: g.items.length }; }).sort(function (a, b) { return b.r - a.r; });
    if (byBean.length) out.push(hl("#a2845e", "Lieblingsbohne", byBean[0].name, "Ø " + fmt(byBean[0].r, 1) + " ★ aus " + byBean[0].n + " Shots"));
    var byRoaster = groupBy(rated, roasterOf).filter(function (g) { return g.items.length >= 3; })
      .map(function (g) { return { name: g.key, r: avg(vals(g.items, "rating")), n: g.items.length }; }).sort(function (a, b) { return b.r - a.r; });
    if (byRoaster.length) out.push(hl("#34c759", "Lieblingsrösterei", byRoaster[0].name, "Ø " + fmt(byRoaster[0].r, 1) + " ★ aus " + byRoaster[0].n + " Shots"));
    $("waHighlights").innerHTML = out.join("");
  }
  function hl(color, label, title, sub) {
    return '<div class="hl"><span class="tile" style="--c:' + color + '"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5c.6 4.2 2.3 5.9 6.5 6.5-4.2.6-5.9 2.3-6.5 6.5-.6-4.2-2.3-5.9-6.5-6.5 4.2-.6 5.9-2.3 6.5-6.5z"/></svg></span><div><span>' + esc(label) + "</span><b>" + esc(title) + "</b><small>" + esc(sub) + "</small></div></div>";
  }

  function renderTrend() {
    var groups = groupBy(S.model.shots, function (e) { return norm(beanName(e)); })
      .map(function (g) { return { key: g.key, name: beanName(g.items[0]), shots: g.items }; })
      .filter(function (g) { return g.shots.length >= 2; }).sort(function (a, b) { return b.shots.length - a.shots.length; });
    var sel = $("waTrendBean");
    sel.innerHTML = groups.length ? groups.map(function (g) { return '<option value="' + esc(g.key) + '">' + esc(g.name) + " (" + g.shots.length + ")</option>"; }).join("") : '<option value="">Mindestens 2 Shots pro Bohne nötig</option>';
    if (!S.trendBean || !groups.some(function (g) { return g.key === S.trendBean; })) S.trendBean = groups.length ? groups[0].key : null;
    sel.value = S.trendBean || "";
    var g = groups.filter(function (x) { return x.key === S.trendBean; })[0];
    var series = g ? g.shots.filter(function (e) { return num(e.extraction_time_s) !== null; }).slice().reverse() : [];
    $("waTrend").innerHTML = lineChart(series);
    var hit = series.filter(function (e) { return inTarget(e, S.model); }).length;
    $("waTrendSub").textContent = series.length ? hit + " von " + series.length + " Shots im Zeitziel (" + fmt(S.model.tmin, 0) + "–" + fmt(S.model.tmax, 0) + " s, grünes Band)." : "Extraktionszeit über die Shots – das grüne Band ist dein Zeitziel.";
  }

  function lineChart(series) {
    if (series.length < 2) return '<div class="empty">Noch zu wenige Shots für einen Trend.</div>';
    var M = S.model, W = 640, H = 250, L = 34, R = 12, T = 12, B = 30;
    var ts = series.map(function (e) { return num(e.extraction_time_s); });
    var lo = Math.floor(Math.min(M.tmin - 4, Math.min.apply(null, ts)) / 5) * 5;
    var hi = Math.ceil(Math.max(M.tmax + 4, Math.max.apply(null, ts)) / 5) * 5;
    var x = function (i) { return L + (W - L - R) * (i / (series.length - 1)); };
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

  /* Säulen pro Monat (letzte 12 Monate mit Daten) */
  function barChart(groups, valueFn, labelFn, ariaLabel) {
    if (!groups.length) return '<div class="empty">Noch keine Daten.</div>';
    var W = 640, H = 230, L = 10, R = 10, T = 28, B = 28;
    var max = Math.max.apply(null, groups.map(valueFn)) || 1;
    var bw = (W - L - R) / groups.length;
    var out = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(ariaLabel) + '">';
    groups.forEach(function (g, i) {
      var v = valueFn(g), h = (H - T - B) * v / max, x = L + i * bw + bw * 0.18, w = bw * 0.64, y = H - B - h;
      out += '<rect class="col" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + Math.max(h, 1).toFixed(1) + '" rx="6"><title>' + esc(monthLabel(g.key) + ": " + labelFn(g)) + "</title></rect>";
      out += '<text class="val-lbl" x="' + (x + w / 2).toFixed(1) + '" y="' + (y - 7).toFixed(1) + '" text-anchor="middle">' + esc(labelFn(g)) + "</text>";
      out += '<text class="axis" x="' + (x + w / 2).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(monthLabel(g.key)) + "</text>";
    });
    return out + "</svg>";
  }
  function monthGroups(list) {
    return groupBy(list.slice().reverse(), function (e) { return monthKey(e._at); }).slice(-12);
  }

  function renderMonths() {
    var groups = monthGroups(S.model.shots);
    $("waMonths").innerHTML = barChart(groups, function (g) { return g.items.length; }, function (g) {
      var r = vals(g.items, "rating");
      return g.items.length + (r.length ? " · " + fmt(avg(r), 1) + "★" : "");
    }, "Shots pro Monat");
  }

  /* ----- Bohnen & Röstereien ----- */
  function beanStats() {
    var M = S.model;
    return groupBy(M.entries, function (e) { return norm(beanName(e)); }).map(function (g) {
      var real = g.items.filter(function (e) { return !e.dialin; });
      var b = g.items[0]._bean || null;
      var timed = real.filter(function (e) { return num(e.extraction_time_s) !== null; });
      var costs = real.map(function (e) { return e._cost; }).filter(function (v) { return v !== null; });
      return {
        name: beanName(g.items[0]), roaster: (b && b.roaster) || "", level: (b && b.roast_level) || "",
        shots: real.length, dialin: g.items.length - real.length,
        rating: avg(vals(real, "rating")), hit: timed.length ? timed.filter(function (e) { return inTarget(e, M); }).length / timed.length : null,
        cost: avg(costs)
      };
    }).filter(function (s) { return s.shots; }).sort(function (a, b) { return (b.rating || 0) - (a.rating || 0) || b.shots - a.shots; });
  }

  function renderBeanCompare() {
    var rows = beanStats();
    var maxR = 5;
    $("waBeanCmp").innerHTML = rows.length ? "<thead><tr><th>Bohne</th><th>Röstgrad</th><th>Shots</th><th>Ø Bewertung</th><th>Im Zeitziel</th><th>Dial-In</th><th>€ / Shot</th></tr></thead><tbody>" +
      rows.map(function (s) {
        return "<tr>" +
          "<td><b>" + esc(s.name) + "</b>" + (s.roaster ? "<small>" + esc(s.roaster) + "</small>" : "") + "</td>" +
          "<td>" + esc(s.level || "–") + "</td>" +
          '<td class="num">' + s.shots + "</td>" +
          '<td class="num"><span class="meter"><i style="width:' + Math.round((s.rating || 0) / maxR * 100) + '%"></i></span>' + (s.rating !== null ? fmt(s.rating, 1) + " ★" : "–") + "</td>" +
          '<td class="num">' + (s.hit !== null ? Math.round(s.hit * 100) + " %" : "–") + "</td>" +
          '<td class="num">' + (s.dialin ? s.dialin + (s.dialin === 1 ? " Testshot" : " Testshots") : "–") + "</td>" +
          '<td class="num">' + eur(s.cost) + "</td>" +
        "</tr>";
      }).join("") + "</tbody>" : '<tbody><tr><td class="empty">Noch keine Shots.</td></tr></tbody>';
  }

  function renderRoasters() {
    var groups = groupBy(S.model.shots, roasterOf).map(function (g) {
      var beans = groupBy(g.items, function (e) { return norm(beanName(e)); }).length;
      return { name: g.key, n: g.items.length, beans: beans, r: avg(vals(g.items, "rating")) };
    }).sort(function (a, b) { return (b.r || 0) - (a.r || 0); });
    $("waRoasters").innerHTML = groups.length ? groups.map(function (g) {
      return '<div class="row"><div><b>' + esc(g.name) + "</b><small>" + g.beans + (g.beans === 1 ? " Bohne" : " Bohnen") + " · " + g.n + ' Shots</small><span class="meter wide"><i style="width:' + Math.round((g.r || 0) / 5 * 100) + '%"></i></span></div><div class="val">' + (g.r !== null ? fmt(g.r, 1) + " ★" : "–") + "</div></div>";
    }).join("") : '<div class="empty">Trag in der App bei deinen Bohnen die Rösterei ein – dann siehst du hier, welche dir am besten gefällt.</div>';
  }

  /* ----- Geschmack ----- */
  var TASTE = [
    { key: "taste_sweetness", label: "Süße", min: 0, max: 3, words: ["nicht süß", "etwas süß", "süß", "sehr süß"] },
    { key: "taste_body", label: "Körper", min: 0, max: 3, words: ["wässrig", "leicht", "rund", "sirupartig"] },
    { key: "taste_finish", label: "Abgang", min: 0, max: 3, words: ["rau", "kurz", "angenehm", "lang"] }
  ];
  function renderProfile() {
    var shots = S.model.shots;
    var bal = vals(shots, "taste_balance");
    var html = "";
    if (bal.length) {
      var b = avg(bal), pos = (b + 2) / 4 * 100;
      var word = b < -0.6 ? "eher sauer" : b > 0.6 ? "eher bitter" : "ausgewogen";
      html += '<div class="prof"><div class="prof-head"><b>Balance</b><span>' + word + '</span></div><div class="scale diverge"><i style="left:' + pos.toFixed(1) + '%"></i></div><div class="prof-ends"><span>sauer</span><span>bitter</span></div></div>';
    }
    TASTE.forEach(function (t) {
      var v = vals(shots, t.key);
      if (!v.length) return;
      var a = avg(v);
      html += '<div class="prof"><div class="prof-head"><b>' + t.label + "</b><span>" + t.words[Math.round(a)] + " · " + fmt(a, 1) + " / 3</span></div>" +
        '<div class="scale"><i style="width:' + (a / t.max * 100).toFixed(1) + '%"></i></div></div>';
    });
    var flags = {};
    shots.forEach(function (e) { (e.taste_flags || []).forEach(function (f) { flags[f] = (flags[f] || 0) + 1; }); });
    var fl = Object.keys(flags);
    if (fl.length) html += '<p class="card-sub" style="margin-top:14px">Auffälligkeiten: ' + fl.map(function (f) { return esc(f === "channeling" ? "Channeling" : f === "adstringierend" ? "adstringierend" : f) + " (" + flags[f] + "×)"; }).join(", ") + "</p>";
    $("waProfile").innerHTML = html || '<div class="empty">Nutze in der App den Geschmacks-Guide beim Shot – dann entsteht hier dein Profil.</div>';
    var n = shots.filter(function (e) { return num(e.taste_balance) !== null || num(e.taste_sweetness) !== null; }).length;
    $("waTasteSub").textContent = n ? "Durchschnitt aus " + n + " Shots mit Geschmacksangaben." : "Durchschnitt deiner Angaben im Geschmacks-Guide.";
  }

  function renderRoast() {
    var order = ["hell", "mittel", "dunkel"];
    var groups = groupBy(S.model.shots, function (e) { return norm(e._bean && e._bean.roast_level); }).map(function (g) {
      return { level: g.items[0]._bean.roast_level, n: g.items.length, r: avg(vals(g.items, "rating")), sw: avg(vals(g.items, "taste_sweetness")), body: avg(vals(g.items, "taste_body")) };
    }).sort(function (a, b) { return order.indexOf(norm(a.level)) - order.indexOf(norm(b.level)); });
    $("waRoast").innerHTML = groups.length ? groups.map(function (g) {
      var extra = [g.sw !== null ? "Süße " + fmt(g.sw, 1) : "", g.body !== null ? "Körper " + fmt(g.body, 1) : ""].filter(Boolean).join(" · ");
      return '<div class="row"><div><b>' + esc(g.level) + "</b><small>" + g.n + " Shots" + (extra ? " · " + extra : "") + '</small></div><div class="val">' + (g.r !== null ? fmt(g.r, 1) + " ★" : "–") + "</div></div>";
    }).join("") : '<div class="empty">Trag in der App bei deinen Bohnen den Röstgrad ein.</div>';
    var ranked = groups.filter(function (g) { return g.r !== null && g.n >= 3; }).sort(function (a, b) { return b.r - a.r; });
    var clear = ranked.length > 1 && ranked[0].r - ranked[1].r >= 0.2; // nur bei echtem Unterschied
    $("waRoastSub").textContent = clear ? "Am besten gelingen dir " + norm(ranked[0].level) + "e Röstungen (Ø " + fmt(ranked[0].r, 1) + " ★)." : "Bewertung nach Röstgrad deiner Bohnen.";
  }

  function renderFavs() {
    var favs = S.model.shots.filter(function (e) { return num(e.rating) >= 5 || (num(e.rating) >= 4 && e.note); })
      .sort(function (a, b) { return num(b.rating) - num(a.rating) || b._at - a._at; }).slice(0, 6);
    $("waFavs").innerHTML = favs.length ? favs.map(function (e) {
      return '<div class="row"><div><b>' + esc(beanName(e)) + "</b><small>" + esc(shortDate(e._at) + " · MG " + grind(e.mahlgrad, e._grinder) + " · " + fmt(e.dose_g) + " → " + fmt(e.yield_g) + " g · " + fmt(e.extraction_time_s) + " s") + "</small>" +
        (e.note ? '<span class="quote">„' + esc(e.note) + "“</span>" : "") + '</div><div class="val">' + stars(e.rating) + "</div></div>";
    }).join("") : '<div class="empty">Noch keine Shots mit 5 Sternen.</div>';
  }

  /* ----- Rezepte (teilbar, gleiches Link-Format wie die App) ----- */
  function bestRecipes() {
    var M = S.model;
    return groupBy(M.entries.slice().reverse(), function (e) { return norm(beanName(e)) + "|" + (e.grinder_id || ""); }).map(function (g) {
      var path = g.items; // chronologisch
      var real = path.filter(function (e) { return !e.dialin && num(e.rating) !== null; });
      if (!real.length) return null;
      // Rezept = jüngster Shot mit der besten Bewertung; Weg = bis zum ERSTEN Shot mit dieser Bewertung
      var top = Math.max.apply(null, real.map(function (e) { return num(e.rating); }));
      var tops = real.filter(function (e) { return num(e.rating) === top; });
      var hits = tops.filter(function (e) { return inTarget(e, M); });
      var pool = hits.length ? hits : tops;
      var best = pool[pool.length - 1], firstHit = pool[0];
      return { best: best, path: path.slice(0, path.indexOf(firstHit) + 1), repeats: pool.length - 1 };
    }).filter(Boolean).sort(function (a, b) { return num(b.best.rating) - num(a.best.rating) || b.best._at - a.best._at; });
  }

  function recipeLink(e) {
    var b = e._bean || {};
    var ra = b.roasted_at ? Math.round((new Date(e._at.getFullYear(), e._at.getMonth(), e._at.getDate(), 12) - new Date(b.roasted_at + "T12:00:00")) / 86400000) : undefined;
    var g = grind(e.mahlgrad, e._grinder);
    var r = { v: 1, n: beanName(e), r: b.roaster || undefined, rl: b.roast_level || undefined, ra: ra >= 0 ? ra : undefined,
      mg: num(e.mahlgrad) === null ? undefined : num(e.mahlgrad), mgs: /[A-Z]$/.test(g) ? g : undefined,
      d: num(e.dose_g) === null ? undefined : num(e.dose_g), y: num(e.yield_g) === null ? undefined : num(e.yield_g), t: num(e.extraction_time_s) === null ? undefined : num(e.extraction_time_s),
      k: e.drink_type || undefined, g: e._grinder ? e._grinder.name : undefined, m: e._machine ? e._machine.name : undefined,
      p: num(e.pressure_bar) === null ? undefined : num(e.pressure_bar), c: num(e.temperature_c) === null ? undefined : num(e.temperature_c),
      s: num(e.rating) || undefined, tb: num(e.taste_balance) === null ? undefined : num(e.taste_balance), ts: num(e.taste_sweetness) === null ? undefined : num(e.taste_sweetness),
      tk: num(e.taste_body) === null ? undefined : num(e.taste_body), tf: num(e.taste_finish) === null ? undefined : num(e.taste_finish) };
    Object.keys(r).forEach(function (k) { if (r[k] === undefined) delete r[k]; });
    var bytes = new TextEncoder().encode(JSON.stringify(r)), bin = "";
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return "https://www.espressophie.de/r/#" + btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function sparkline(path) {
    var gs = path.map(function (e) { return num(e.mahlgrad); }).filter(function (v) { return v !== null; });
    if (gs.length < 2) return "";
    var W = 260, H = 54, P = 6, lo = Math.min.apply(null, gs), hi = Math.max.apply(null, gs);
    if (hi === lo) { hi += 0.5; lo -= 0.5; }
    var x = function (i) { return P + (W - 2 * P) * i / (gs.length - 1); };
    var y = function (v) { return P + (H - 2 * P) * (1 - (v - lo) / (hi - lo)); };
    return '<svg class="spark" viewBox="0 0 ' + W + " " + H + '" aria-hidden="true"><polyline points="' + gs.map(function (v, i) { return x(i).toFixed(1) + "," + y(v).toFixed(1); }).join(" ") + '" />' +
      '<circle cx="' + x(gs.length - 1).toFixed(1) + '" cy="' + y(gs[gs.length - 1]).toFixed(1) + '" r="4" /></svg>';
  }

  function renderRecipes() {
    var list = bestRecipes();
    $("waRecipes").innerHTML = list.length ? list.map(function (r, i) {
      var e = r.best, dose = num(e.dose_g), yld = num(e.yield_g);
      var first = r.path[0], last = r.path[r.path.length - 1], steps = r.path.length;
      var way = (steps > 1 ? "In " + steps + " Shots von MG " + grind(first.mahlgrad, first._grinder) + " zu MG " + grind(last.mahlgrad, last._grinder) : "Gleich der erste Shot saß") +
        (r.repeats ? " · seitdem " + r.repeats + "× wiederholt" : "") + ".";
      return '<article class="recipe">' +
        '<div class="recipe-head"><div><h3>' + esc(beanName(e)) + "</h3><small>" + esc([roasterOf(e), e._grinder && e._grinder.name].filter(Boolean).join(" · ")) + "</small></div>" + stars(e.rating) + "</div>" +
        '<div class="rz-big"><div><span>Mahlgrad</span><b>' + esc(grind(e.mahlgrad, e._grinder)) + "</b></div><div><span>Input</span><b>" + fmt(dose) + " g</b></div><div><span>Output</span><b>" + fmt(yld) + " g</b></div><div><span>Zeit</span><b>" + fmt(e.extraction_time_s) + " s</b></div></div>" +
        '<p class="card-sub">' + (dose && yld ? "Ratio 1 : " + fmt(yld / dose, 1) + " · " : "") + (num(e.temperature_c) !== null ? fmt(e.temperature_c, 0) + " °C · " : "") + "zuletzt " + shortDate(e._at) + "</p>" +
        '<div class="way"><span>Dein Weg dorthin</span>' + sparkline(r.path) + "<small>" + esc(way) + "</small></div>" +
        '<div class="recipe-actions"><button class="pill small" type="button" data-share="' + i + '">Rezept teilen</button><a class="more" href="' + esc(recipeLink(e)) + '" target="_blank" rel="noopener">Vorschau<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="m9.5 6 6 6-6 6"/></svg></a></div>' +
      "</article>";
    }).join("") : '<div class="card empty">Bewerte deine Shots in der App – dann entsteht hier pro Bohne dein bestes Rezept.</div>';
    $$("[data-share]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var e = list[+btn.getAttribute("data-share")].best, url = recipeLink(e);
        var done = function (text) { var old = btn.textContent; btn.textContent = text; setTimeout(function () { btn.textContent = old; }, 1800); };
        if (navigator.share) navigator.share({ title: beanName(e) + " – Espresso-Rezept", text: "Mein Rezept für " + beanName(e) + ":", url: url }).catch(function () {});
        else if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { done("Link kopiert ✓"); });
        else prompt("Link zum Rezept:", url);
      });
    });
  }

  /* ----- Kosten ----- */
  function renderCosts() {
    var M = S.model;
    var costed = M.entries.filter(function (e) { return e._cost !== null; });
    var total = sum(costed.map(function (e) { return e._cost; }));
    var months = monthGroups(costed);
    var thisMonth = months.length ? sum(months[months.length - 1].items.map(function (e) { return e._cost; })) : 0;
    var perMonth = months.length ? total / months.length : null;
    $("waCostKpis").innerHTML = costed.length ? [
      kpi("Ø pro Shot", eur(total / costed.length), costed.length + " Shots mit Preis"),
      kpi("Dieser Monat", eur(thisMonth), months.length ? monthLabel(months[months.length - 1].key) : ""),
      kpi("Ø pro Monat", eur(perMonth), months.length + (months.length === 1 ? " Monat" : " Monate")),
      kpi("Gesamt", eur(total), "inkl. Testshots")
    ].join("") : '<div class="card empty" style="grid-column:1/-1">Trag in der App bei deinen Bohnen Preis und Packungsgewicht ein – dann siehst du hier, was dich dein Espresso kostet.</div>';
    $("waCostMonths").innerHTML = costed.length ? barChart(months, function (g) { return sum(g.items.map(function (e) { return e._cost; })); }, function (g) {
      return eur(sum(g.items.map(function (e) { return e._cost; }))).replace(" €", "€");
    }, "Bohnenkosten pro Monat") : '<div class="empty">Noch keine Preise.</div>';
    var byR = groupBy(costed, function (e) { return roasterOf(e) || "Ohne Rösterei"; }).map(function (g) {
      var c = g.items.map(function (e) { return e._cost; });
      return { name: g.key, avg: avg(c), total: sum(c), n: g.items.length };
    }).sort(function (a, b) { return a.avg - b.avg; });
    $("waCostRoasters").innerHTML = byR.length ? byR.map(function (r) {
      return '<div class="row"><div><b>' + esc(r.name) + "</b><small>" + r.n + " Shots · zusammen " + eur(r.total) + '</small></div><div class="val">' + eur(r.avg) + "<small> / Shot</small></div></div>";
    }).join("") : '<div class="empty">Noch keine Preise.</div>';
  }

  /* ---------- CSV-Export (für Excel/Numbers, deutsches Format) ---------- */
  function csv() {
    if (!S.model) return;
    var cell = function (v) { var s = v === null || v === undefined ? "" : String(v); return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    var n = function (v) { var x = num(v); return x === null ? "" : String(x).replace(".", ","); };
    var head = ["Datum", "Uhrzeit", "Kaffee", "Rösterei", "Röstgrad", "Mühle", "Maschine", "Mahlgrad", "Input g", "Output g", "Ratio", "Zeit s", "Druck bar", "Temperatur °C", "Bewertung", "Balance", "Süße", "Körper", "Abgang", "Kosten €", "Notiz", "Barista-Tipp", "Dial-In"];
    var lines = [head.join(";")].concat(S.model.entries.map(function (e) {
      var dose = num(e.dose_g), yld = num(e.yield_g);
      return [e.entry_date, String(e.entry_time || "").slice(0, 5), beanName(e), roasterOf(e), e._bean && e._bean.roast_level, e._grinder && e._grinder.name, e._machine && e._machine.name,
        grind(e.mahlgrad, e._grinder).replace("–", ""), n(dose), n(yld), dose && yld ? n(Math.round(yld / dose * 100) / 100) : "", n(e.extraction_time_s), n(e.pressure_bar), n(e.temperature_c),
        n(e.rating), n(e.taste_balance), n(e.taste_sweetness), n(e.taste_body), n(e.taste_finish), e._cost !== null ? n(Math.round(e._cost * 100) / 100) : "",
        e.note, e.barista_feedback || e.barista_feedback_short, e.dialin ? "ja" : ""].map(cell).join(";");
    }));
    var blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "espressophie-auswertung-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  /* ---------- Bedienung ---------- */
  function setTab(tab) {
    $$(".seg button").forEach(function (b) { b.setAttribute("aria-selected", b.getAttribute("data-tab") === tab); });
    $$(".wa-panel").forEach(function (p) { p.hidden = p.getAttribute("data-panel") !== tab; });
  }

  $("waLogin").addEventListener("click", login);
  $("waDemo").addEventListener("click", loadDemo);
  $("waLogout").addEventListener("click", function () { logout(false); });
  $("waReload").addEventListener("click", function () { if (S.demo) loadDemo(); else if (S.token) loadDrive(); });
  $("waCsv").addEventListener("click", csv);
  $$(".seg button").forEach(function (b) { b.addEventListener("click", function () { setTab(b.getAttribute("data-tab")); }); });
  $("waTrendBean").addEventListener("change", function (e) { S.trendBean = e.target.value; renderTrend(); });

  if (!CLIENT_ID) $("waLogin").title = "Die Google-Anmeldung wird gerade eingerichtet";

  // Konto oben rechts: Anmelden/Abmelden laufen über diese Seite
  if (acct()) {
    acct().onSignIn = login;
    acct().onSignOut = function () { logout(true); };
    acct().active = false;
    acct().render();
  }
  $("waOther").addEventListener("click", function () {
    if (acct()) acct().clear();
    S.tokenClient = null; // ohne Konto-Vorschlag neu anfragen
    renderLoginLabel();
    msg("");
  });
  renderLoginLabel();
})();
