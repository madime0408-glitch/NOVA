const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const root = __dirname;
const port = Number(process.env.PORT || 3000);
const staticFiles = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/index.html": ["index.html", "text/html; charset=utf-8"],
  "/app.js": ["app.js", "text/javascript; charset=utf-8"],
  "/deployment-config.js": ["deployment-config.js", "text/javascript; charset=utf-8"],
  "/styles.css": ["styles.css", "text/css; charset=utf-8"],
};

const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  const entry = request.method === "GET" ? staticFiles[pathname] : null;
  if (!entry) {
    response.writeHead(404, {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    });
    response.end("Page introuvable.");
    return;
  }

  const [file, contentType] = entry;
  response.writeHead(200, {
    "Cache-Control": "no-cache",
    "Content-Type": contentType,
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  });
  fs.createReadStream(path.join(root, file)).pipe(response);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Nova est disponible sur http://127.0.0.1:${port}`);
});
