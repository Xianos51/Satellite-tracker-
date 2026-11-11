const http = require("http");
const fs = require("fs");
const path = require("path");

const HERE = __dirname;
const ROOT = fs.existsSync(path.join(HERE, "site"))
  ? path.join(HERE, "site")
  : path.normalize(path.join(HERE, "..", ".."));

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".tle": "text/plain; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8"
};

const server = http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || "/").split("?")[0]);
  if (p === "/" || p === "") p = "/index.html";
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT)) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    return res.end("forbidden");
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      return res.end("not found: " + p);
    }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-cache"
    });
    res.end(data);
  });
});

const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || "0.0.0.0";
server.listen(port, host, () => {
  console.log(`satellite-tracker web module serving ${ROOT} on http://${host}:${port}`);
});
