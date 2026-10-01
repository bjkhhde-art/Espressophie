/* ==========================================================
   KONTAKTDATEN – nur hier anpassen!
   Diese Angaben erscheinen automatisch in der
   Datenschutzerklärung und im Impressum.
   Werte in [eckigen Klammern] werden gelb markiert,
   damit du siehst, was noch fehlt.
   ========================================================== */

window.KONTAKT = {
  name:    "[Vor- und Nachname]",
  strasse: "[Straße Hausnummer]",
  plzOrt:  "[PLZ Ort]",
  land:    "Deutschland",
  email:   "[E-Mail-Adresse]"
};


/* ---------- ab hier nichts ändern ---------- */
(function () {
  function fill() {
    var k = window.KONTAKT || {};
    document.querySelectorAll("[data-kontakt]").forEach(function (el) {
      var key = el.getAttribute("data-kontakt");
      var val = k[key] || "";
      var offen = !val || val.charAt(0) === "[";
      el.classList.toggle("todo", offen);
      if (key === "email" && !offen) {
        el.innerHTML = "";
        var a = document.createElement("a");
        a.href = "mailto:" + val;
        a.textContent = val;
        el.appendChild(a);
      } else {
        el.textContent = val;
      }
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fill);
  else fill();
})();
