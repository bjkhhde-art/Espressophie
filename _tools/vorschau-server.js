// Lokale Vorschau der Website – ahmt GitHub Pages (Jekyll) im Kleinen nach.
// node _tools/vorschau-server.js [port] – zeigt die Website lokal wie GitHub Pages (Platzhalter aus _config.yml).
// Liegt in _tools/ und wird deshalb nicht veröffentlicht.
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = +process.argv[2] || 8769;
const ROOT = path.resolve(process.argv[3] || path.join(__dirname, ".."));
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".png": "image/png",
  ".jpg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".xml": "application/xml", ".txt": "text/plain; charset=utf-8", ".json": "application/json" };

function kontakt() {
  const out = {};
  let inBlock = false;
  for (const line of fs.readFileSync(path.join(ROOT, "_config.yml"), "utf8").split(/\r?\n/)) {
    if (/^kontakt:\s*$/.test(line)) { inBlock = true; continue; }
    if (inBlock && /^\S/.test(line)) inBlock = false;
    const m = inBlock && line.match(/^\s+(\w+):\s*"(.*)"\s*$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}
function render(buf) {
  const text = buf.toString("utf8");
  const fm = text.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/);
  if (!fm) return buf;
  const k = kontakt();
  const top = {};
  for (const line of fs.readFileSync(path.join(ROOT, "_config.yml"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^(\w+):\s*"(.*)"\s*$/);
    if (m) top[m[1]] = m[2];
  }
  return text.slice(fm[0].length)
    .replace(/\{\{\s*site\.kontakt\.(\w+)\s*\}\}/g, (_, key) => k[key] ?? "")
    .replace(/\{\{\s*site\.(\w+)\s*\}\}/g, (_, key) => top[key] ?? "");
}
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p.endsWith("/")) p += "index.html";
  let file = path.join(ROOT, p), status = 200;
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory() || path.basename(file).startsWith("_")) { file = path.join(ROOT, "404.html"); status = 404; }
  const ext = path.extname(file);
  const body = ext === ".html" ? render(fs.readFileSync(file)) : fs.readFileSync(file);
  res.writeHead(status, { "Content-Type": TYPES[ext] || "application/octet-stream", "Cache-Control": "no-store" });
  res.end(body);
}).listen(PORT, () => console.log("Vorschau: http://localhost:" + PORT));
